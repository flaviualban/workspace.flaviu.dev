"""Domain WHOIS/expiry lookup via RDAP (HTTPS-based, reliable)."""
from datetime import datetime, timezone
import requests


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


def lookup(domain):
    domain = _clean(domain)
    result = {"domain": domain, "ok": False}
    if not domain or "." not in domain:
        result["error"] = "Domeniu invalid."
        return result
    try:
        r = requests.get(f"https://rdap.org/domain/{domain}", timeout=25,
                         headers={"Accept": "application/json"})
        if r.status_code == 404:
            result["error"] = "Domeniu neînregistrat sau fără date RDAP."
            return result
        if r.status_code != 200:
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
            "status": status,
            "registrar": registrar,
            "created": created.isoformat() if created else None,
            "expires": expires.isoformat() if expires else None,
            "updated": updated.isoformat() if updated else None,
            "days_left": days_left,
            "nameservers": nameservers,
            "domain_statuses": statuses,
        })
        return result
    except Exception as e:
        result["error"] = str(e)
        return result
