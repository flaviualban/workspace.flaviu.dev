"""intoDNS-style DNS zone analyzer using dnspython."""
import time
import dns.resolver
import dns.query
import dns.message
import dns.name
import dns.rdatatype
import dns.flags
import dns.reversename

TIMEOUT = 5.0


def _norm(domain: str) -> str:
    return (domain or "").strip().lower().rstrip(".")


def _make_resolver():
    r = dns.resolver.Resolver(configure=False)
    r.nameservers = ["1.1.1.1", "8.8.8.8"]
    r.timeout = TIMEOUT
    r.lifetime = TIMEOUT
    return r


def _resolve(qname, rdtype):
    r = _make_resolver()
    try:
        ans = r.resolve(qname, rdtype, raise_on_no_answer=False)
        if ans.rrset is None:
            return []
        return list(ans.rrset)
    except Exception:
        return []


def _query_server(qname, rdtype, ns_ip):
    q = dns.message.make_query(qname, rdtype)
    try:
        return dns.query.udp(q, ns_ip, timeout=TIMEOUT)
    except Exception:
        try:
            return dns.query.tcp(q, ns_ip, timeout=TIMEOUT)
        except Exception:
            return None


def _ns_to_ips(ns_host):
    ips = []
    for rr in _resolve(ns_host, "A"):
        ips.append(rr.address)
    return ips


def _is_public_ip(ip: str) -> bool:
    if ":" in ip:
        return not (ip.startswith("fc") or ip.startswith("fd") or ip.startswith("::1"))
    parts = ip.split(".")
    try:
        a, b = int(parts[0]), int(parts[1])
    except Exception:
        return True
    if a == 10:
        return False
    if a == 172 and 16 <= b <= 31:
        return False
    if a == 192 and b == 168:
        return False
    if a == 127:
        return False
    return True


def analyze(domain: str) -> dict:
    start = time.time()
    domain = _norm(domain)
    name = dns.name.from_text(domain)
    parent_zone = name.parent().to_text().rstrip(".") if len(name.labels) > 2 else name.labels[-2].decode()
    # parent registry zone = the TLD (last label) for a 2-label domain
    tld = ".".join(domain.split(".")[1:]) if "." in domain else domain

    categories = []

    # ---------------- PARENT ----------------
    parent_checks = []
    parent_ns_hosts = []
    delegation_ns = []
    glue_map = {}
    tld_servers = [str(rr.target).rstrip(".") for rr in _resolve(tld, "NS")]
    parent_ok = False
    if tld_servers:
        tld_ip = None
        for h in tld_servers:
            ips = _ns_to_ips(h)
            if ips:
                tld_ip = ips[0]
                break
        if tld_ip:
            resp = _query_server(domain, "NS", tld_ip)
            if resp is not None:
                parent_ok = True
                for rr in resp.authority:
                    if rr.rdtype == dns.rdatatype.NS:
                        for item in rr:
                            delegation_ns.append(str(item.target).rstrip("."))
                for rr in resp.additional:
                    if rr.rdtype in (dns.rdatatype.A, dns.rdatatype.AAAA):
                        glue_map.setdefault(str(rr.name).rstrip("."), []).append(str(rr[0]))
        parent_ns_hosts = tld_servers

    if delegation_ns:
        glue_txt = "\n".join(
            f"{h} [{', '.join(glue_map.get(h, ['no glue']))}]" for h in delegation_ns
        )
        parent_checks.append({"status": "info", "test": "Domain NS records",
                              "info": f"Nameserver records returned by the parent servers ({tld}):\n{glue_txt}"})
    else:
        parent_checks.append({"status": "error", "test": "Domain NS records",
                              "info": f"No NS delegation found at the parent ({tld}) servers for {domain}."})

    parent_checks.append({
        "status": "ok" if parent_ok else "error",
        "test": "TLD Parent Check",
        "info": f"Good. {', '.join(tld_servers[:2]) if tld_servers else 'The'} parent server(s) for the '{tld}' TLD were interrogated and have information for your domain." if parent_ok else f"Could not reach the parent servers for '{tld}'."})

    parent_checks.append({
        "status": "ok" if delegation_ns else "error",
        "test": "Your nameservers are listed",
        "info": "Good. The parent server has your nameservers listed. This is a must if you want to be found." if delegation_ns else "Your nameservers are NOT listed at the parent server."})

    has_glue = any(glue_map.get(h) for h in delegation_ns)
    parent_checks.append({
        "status": "info",
        "test": "DNS Parent sent Glue",
        "info": "The parent nameserver is sending out GLUE (A records) for your nameservers." if has_glue else "The parent nameserver is not sending out GLUE for the nameservers. This is ok but an extra A lookup is required to resolve them."})

    ns_a_ok = all(_ns_to_ips(h) for h in delegation_ns) if delegation_ns else False
    parent_checks.append({
        "status": "ok" if ns_a_ok else "warn",
        "test": "Nameservers A records",
        "info": "Good. Every nameserver listed has A records. This is a must if you want to be found." if ns_a_ok else "At least one nameserver did not resolve to an A record."})

    categories.append({"name": "Parent", "checks": parent_checks})

    # ---------------- NS ----------------
    ns_checks = []
    child_ns = [str(rr.target).rstrip(".") for rr in _resolve(domain, "NS")]
    if child_ns:
        ns_lines = []
        for h in child_ns:
            ns_lines.append(f"{h} [{', '.join(_ns_to_ips(h) or ['no A record'])}]")
        ns_checks.append({"status": "info", "test": "NS records from your nameservers",
                          "info": "NS records got from your nameservers listed at the parent NS are:\n" + "\n".join(ns_lines)})
    else:
        ns_checks.append({"status": "error", "test": "NS records from your nameservers",
                          "info": "Could not get NS records from your nameservers."})

    # recursive queries + responded
    responded = 0
    recursive_open = []
    for h in child_ns:
        ips = _ns_to_ips(h)
        if not ips:
            continue
        resp = _query_server(domain, "SOA", ips[0])
        if resp is not None:
            responded += 1
            if resp.flags & dns.flags.RA:
                recursive_open.append(h)

    ns_checks.append({
        "status": "ok" if child_ns and responded == len(child_ns) else "warn",
        "test": "DNS servers responded",
        "info": "Good. All nameservers listed at the parent server responded." if child_ns and responded == len(child_ns) else "Not all of your nameservers responded."})

    ns_checks.append({
        "status": "ok" if not recursive_open else "warn",
        "test": "Recursive Queries",
        "info": "Good. Your nameservers do not allow recursive queries for anyone." if not recursive_open else f"One or more nameservers allow recursive queries: {', '.join(recursive_open)}."})

    # mismatch parent vs child
    match = set(delegation_ns) == set(child_ns) and bool(child_ns)
    ns_checks.append({
        "status": "ok" if match else ("warn" if child_ns else "error"),
        "test": "Mismatched NS records",
        "info": "OK. The NS records at all your nameservers are identical to the ones at the parent." if match else "WARNING: The NS records at the parent and at your nameservers differ."})

    ns_checks.append({
        "status": "ok" if len(child_ns) >= 2 else "warn",
        "test": "Multiple Nameservers",
        "info": f"Good. You have {len(child_ns)} nameservers. According to RFC2182 you must have at least 2." if len(child_ns) >= 2 else "WARNING: You have only one nameserver. RFC2182 recommends at least 2."})

    ns_checks.append({
        "status": "ok" if child_ns else "error",
        "test": "Name of nameservers are valid",
        "info": "OK. All of the NS records that your nameservers report seem valid." if child_ns else "No valid nameservers found."})

    categories.append({"name": "NS", "checks": ns_checks})

    # ---------------- SOA ----------------
    soa_checks = []
    soa_rr = _resolve(domain, "SOA")
    if soa_rr:
        soa = soa_rr[0]
        mname = str(soa.mname).rstrip(".")
        rname = str(soa.rname).rstrip(".")
        email = rname.replace(".", "@", 1)
        soa_checks.append({"status": "info", "test": "SOA record", "info":
            f"Primary nameserver: {mname}\nHostmaster E-mail: {email}\nSerial: {soa.serial}\nRefresh: {soa.refresh}\nRetry: {soa.retry}\nExpire: {soa.expire}\nDefault TTL: {soa.minimum}"})
        soa_checks.append({"status": "ok" if mname in child_ns else "warn", "test": "SOA MNAME entry",
                           "info": f"OK. {mname} is listed at the parent servers." if mname in child_ns else f"WARNING: {mname} (primary) is not listed among your NS records."})
        soa_checks.append({"status": "ok" if 1200 <= soa.refresh <= 43200 else "warn", "test": "SOA REFRESH",
                           "info": f"Your SOA REFRESH interval is: {soa.refresh}. That is {'OK' if 1200 <= soa.refresh <= 43200 else 'outside the recommended 20min-12h range'}."})
        soa_checks.append({"status": "ok" if 120 <= soa.retry <= 7200 else "warn", "test": "SOA RETRY",
                           "info": f"Your SOA RETRY value is: {soa.retry}. {'Looks ok.' if 120 <= soa.retry <= 7200 else 'Outside recommended range.'}"})
        soa_checks.append({"status": "ok" if 1209600 <= soa.expire <= 2419200 else "warn", "test": "SOA EXPIRE",
                           "info": f"Your SOA EXPIRE value is: {soa.expire}. {'Looks ok.' if 1209600 <= soa.expire <= 2419200 else 'Recommended 2-4 weeks.'}"})
        soa_checks.append({"status": "ok" if 300 <= soa.minimum <= 86400 else "warn", "test": "SOA MINIMUM TTL",
                           "info": f"Your SOA MINIMUM TTL is: {soa.minimum}. {'OK.' if 300 <= soa.minimum <= 86400 else 'RFC2308 recommends 1-3 hours.'}"})
    else:
        soa_checks.append({"status": "error", "test": "SOA record", "info": "No SOA record found for the domain."})
    categories.append({"name": "SOA", "checks": soa_checks})

    # ---------------- MX ----------------
    mx_checks = []
    mx_rr = sorted(_resolve(domain, "MX"), key=lambda r: r.preference)
    if mx_rr:
        lines = [f"{r.preference}  {str(r.exchange).rstrip('.')} [{', '.join(_ns_to_ips(str(r.exchange).rstrip('.')) or ['?'])}]" for r in mx_rr]
        mx_checks.append({"status": "info", "test": "MX Records", "info": "Your MX records are:\n" + "\n".join(lines)})
        priv = any(not _is_public_ip(ip) for r in mx_rr for ip in _ns_to_ips(str(r.exchange).rstrip('.')))
        mx_checks.append({"status": "ok" if not priv else "warn", "test": "MX A records",
                          "info": "OK. All of your MX records resolve to public IPs." if not priv else "WARNING: A mail server resolves to a private IP."})
    else:
        mx_checks.append({"status": "error", "test": "MX Records",
                          "info": "Oh well, I did not detect any MX records so you probably don't have any. If you should have them, they may be missing at your nameservers!"})
    categories.append({"name": "MX", "checks": mx_checks})

    # ---------------- WWW ----------------
    www_checks = []
    www_a = _resolve(domain, "A")
    www_sub = _resolve("www." + domain, "A")
    cname = _resolve("www." + domain, "CNAME")
    if www_a:
        ips = [rr.address for rr in www_a]
        www_checks.append({"status": "info", "test": "WWW A Record",
                           "info": f"Your {domain} A record is:\n{domain} [{', '.join(ips)}]"})
        allpub = all(_is_public_ip(ip) for ip in ips)
        www_checks.append({"status": "ok" if allpub else "warn", "test": "IPs are public",
                           "info": "OK. All of your WWW IPs appear to be public IPs." if allpub else "WARNING: A WWW IP is private."})
    else:
        www_checks.append({"status": "warn", "test": "WWW A Record",
                           "info": f"No A record found for {domain}."})
    if www_sub:
        www_checks.append({"status": "info", "test": "www subdomain",
                           "info": f"www.{domain} [{', '.join(rr.address for rr in www_sub)}]"})
    www_checks.append({"status": "info" if cname else "ok", "test": "WWW CNAME",
                       "info": f"www.{domain} is a CNAME to {str(cname[0].target).rstrip('.')}" if cname else "OK. No CNAME on www."})
    txt = _resolve(domain, "TXT")
    if txt:
        joined = "\n".join(" ".join(s.decode() if isinstance(s, bytes) else str(s) for s in rr.strings) for rr in txt)
        www_checks.append({"status": "info", "test": "TXT Records", "info": joined})
    categories.append({"name": "WWW", "checks": www_checks})

    return {
        "domain": domain,
        "categories": categories,
        "duration_ms": int((time.time() - start) * 1000),
    }
