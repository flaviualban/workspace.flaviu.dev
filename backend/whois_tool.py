"""Domain WHOIS/expiry lookup via RDAP (HTTPS) with a WHOIS port-43 fallback for ccTLDs like .ro."""
import socket
from datetime import datetime, timezone
import requests

_WHOIS_SERVER_CACHE = {}

_DATE_FORMATS = [
    "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d", "%d.%m.%Y", "%d-%b-%Y", "%Y.%m.%d",
]

_CREATED_KEYS = ["creation date", "created", "registered on", "registration date", "registered"]
_EXPIRES_KEYS = ["registry expiry date", "expiry date", "expiration date", "expires on",
                 "expire", "expires", "paid-till", "renewal date"]
_UPDATED_KEYS = ["updated date", "last updated", "last modified", "changed"]
_REGISTRAR_KEYS = ["registrar", "sponsoring registrar"]
_NS_KEYS = ["name server", "nameserver", "nserver"]
_STATUS_KEYS = ["domain status", "status"]


def _clean(domain: str) -> str:
    d = (domain or "").strip().lower()
    d = d.replace("https://", "").replace("http://", "")
    return d.split("/")[0].split(":")[0]


def _parse_dt(s):
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _registrar(entities):
    for e in entities or []:
        roles = e.get("roles") or []
        if "registrar" in roles:
            vcard = e.get("vcardArray")
            if vcard and len(vcard) > 1:
                for item in vcard[1]:
                    if item[0] == "fn":
                        return item[3]
            return e.get("handle") or ""
    return ""


def _parse_any_date(s):
    if not s:
        return None
    s = s.strip().replace("Z", "+00:00") if s.strip().endswith("Z") else s.strip()
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


def _whois_query(server, query, timeout=15):
    with socket.create_connection((server, 43), timeout=timeout) as s:
        s.sendall((query + "\r\n").encode())
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    return data.decode("utf-8", errors="ignore")


def _iana_whois_server(tld):
    if tld in _WHOIS_SERVER_CACHE:
        return _WHOIS_SERVER_CACHE[tld]
    server = None
    try:
        raw = _whois_query("whois.iana.org", tld)
        for line in raw.splitlines():
            if line.lower().startswith("whois:"):
                server = line.split(":", 1)[1].strip()
                break
    except Exception:
        server = None
    _WHOIS_SERVER_CACHE[tld] = server
    return server


def _whois_fallback(domain):
    tld = domain.rsplit(".", 1)[-1]
    server = _iana_whois_server(tld)
    if not server:
        return None
    try:
        raw = _whois_query(server, domain)
    except Exception:
        return None
    if not raw:
        return None

    created = expires = updated = None
    registrar = ""
    nameservers = []
    statuses = []
    for line in raw.splitlines():
        if not line.strip() or line.strip().startswith("%") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip().lower()
        val = val.strip()
        if not val:
            continue
        if not created and key in _CREATED_KEYS:
            created = _parse_any_date(val)
        elif not expires and key in _EXPIRES_KEYS:
            expires = _parse_any_date(val)
        elif not updated and key in _UPDATED_KEYS:
            updated = _parse_any_date(val)
        elif not registrar and key in _REGISTRAR_KEYS:
            registrar = val
        elif key in _NS_KEYS:
            ns = val.split()[0].lower().rstrip(".")
            if ns and ns not in nameservers:
                nameservers.append(ns)
        elif key in _STATUS_KEYS:
            statuses.append(val)

    days_left = (expires - datetime.now(timezone.utc)).days if expires else None
    status = "ok"
    note = ""
    if days_left is not None:
        if days_left < 0:
            status = "expired"
        elif days_left <= 30:
            status = "expiring"
        elif days_left <= 60:
            status = "soon"
    elif expires is None:
        note = "Registrul acestui TLD nu publică data de expirare."

    return {
        "domain": domain, "ok": True, "source": "whois", "status": status,
        "registrar": registrar,
        "created": created.isoformat() if created else None,
        "expires": expires.isoformat() if expires else None,
        "updated": updated.isoformat() if updated else None,
        "days_left": days_left, "nameservers": nameservers,
        "domain_statuses": statuses, "note": note,
    }


def lookup(domain):
    domain = _clean(domain)
    result = {"domain": domain, "ok": False}
    if not domain or "." not in domain:
        result["error"] = "Domeniu invalid."
        return result
    try:
        r = requests.get(f"https://rdap.org/domain/{domain}", timeout=25,
                         headers={"Accept": "application/json"})
        if r.status_code != 200:
            fb = _whois_fallback(domain)
            if fb:
                return fb
            if r.status_code == 404:
                result["error"] = "Domeniu neînregistrat sau fără date publice."
            else:
                result["error"] = f"RDAP a răspuns {r.status_code}."
            return result
        j = r.json()

        events = {e.get("eventAction"): e.get("eventDate") for e in j.get("events", [])}
        created = _parse_dt(events.get("registration"))
        expires = _parse_dt(events.get("expiration"))
        updated = _parse_dt(events.get("last changed") or events.get("last update of RDAP database"))

        days_left = None
        if expires:
            days_left = (expires - datetime.now(timezone.utc)).days

        nameservers = [ns.get("ldhName", "").lower() for ns in j.get("nameservers", []) if ns.get("ldhName")]
        statuses = j.get("status", [])
        registrar = _registrar(j.get("entities"))

        status = "ok"
        if days_left is not None:
            if days_left < 0:
                status = "expired"
            elif days_left <= 30:
                status = "expiring"
            elif days_left <= 60:
                status = "soon"

        result.update({
            "ok": True,
            "source": "rdap",
            "status": status,
            "registrar": registrar,
            "created": created.isoformat() if created else None,
            "expires": expires.isoformat() if expires else None,
            "updated": updated.isoformat() if updated else None,
            "days_left": days_left,
            "nameservers": nameservers,
            "domain_statuses": statuses,
            "note": "",
        })
        return result
    except Exception as e:
        fb = _whois_fallback(domain)
        if fb:
            return fb
        result["error"] = str(e)
        return result
