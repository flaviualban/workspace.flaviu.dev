"""SSL certificate & domain health inspection."""
import socket
import ssl
import time
from datetime import datetime, timezone
from cryptography import x509


def _clean(domain: str) -> str:
    d = (domain or "").strip().lower()
    d = d.replace("https://", "").replace("http://", "")
    return d.split("/")[0].split(":")[0]


def _dt(cert, utc_attr, naive_attr):
    v = getattr(cert, utc_attr, None)
    if v is not None:
        return v
    return getattr(cert, naive_attr).replace(tzinfo=timezone.utc)


def _trusted(domain, port=443):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((domain, port), timeout=10) as s:
            with ctx.wrap_socket(s, server_hostname=domain):
                return True, ""
    except ssl.SSLCertVerificationError as e:
        return False, str(e.verify_message or e)
    except Exception as e:
        return None, str(e)


def check_domain(domain):
    domain = _clean(domain)
    port = 443
    result = {"domain": domain, "ok": False}
    if not domain or "." not in domain:
        result["error"] = "Domeniu invalid."
        return result
    try:
        ctx = ssl._create_unverified_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            ctx.set_alpn_protocols(["h2", "http/1.1"])
        except Exception:
            pass

        start = time.time()
        ip = socket.gethostbyname(domain)
        with socket.create_connection((domain, port), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                handshake_ms = int((time.time() - start) * 1000)
                der = ssock.getpeercert(binary_form=True)
                tls_version = ssock.version()
                cipher = ssock.cipher()
                alpn = ssock.selected_alpn_protocol()

        cert = x509.load_der_x509_certificate(der)
        not_before = _dt(cert, "not_valid_before_utc", "not_valid_before")
        not_after = _dt(cert, "not_valid_after_utc", "not_valid_after")
        now = datetime.now(timezone.utc)
        days_left = (not_after - now).days

        def _name(n):
            try:
                return n.rfc4514_string()
            except Exception:
                return str(n)

        cn = ""
        try:
            cn = cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except Exception:
            pass
        issuer_cn = ""
        issuer_org = ""
        try:
            issuer_cn = cert.issuer.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except Exception:
            pass
        try:
            issuer_org = cert.issuer.get_attributes_for_oid(x509.oid.NameOID.ORGANIZATION_NAME)[0].value
        except Exception:
            pass

        sans = []
        try:
            ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            sans = ext.value.get_values_for_type(x509.DNSName)
        except Exception:
            pass

        # OCSP responder URL (AIA)
        ocsp_urls = []
        try:
            aia = cert.extensions.get_extension_for_class(x509.AuthorityInformationAccess)
            for desc in aia.value:
                if desc.access_method == x509.oid.AuthorityInformationAccessOID.OCSP:
                    ocsp_urls.append(desc.access_location.value)
        except Exception:
            pass

        trusted, trust_msg = _trusted(domain, port)

        status = "ok"
        if days_left < 0:
            status = "expired"
        elif days_left <= 14:
            status = "expiring"
        elif trusted is False:
            status = "untrusted"

        result.update({
            "ok": True,
            "ip": ip,
            "status": status,
            "cert": {
                "subject_cn": cn,
                "issuer_cn": issuer_cn,
                "issuer_org": issuer_org,
                "subject": _name(cert.subject),
                "issuer": _name(cert.issuer),
                "not_before": not_before.isoformat(),
                "not_after": not_after.isoformat(),
                "days_left": days_left,
                "serial": format(cert.serial_number, "x"),
                "signature_algorithm": cert.signature_algorithm_oid._name,
                "sans": sans,
                "ocsp_urls": ocsp_urls,
            },
            "connection": {
                "tls_version": tls_version,
                "cipher": cipher[0] if cipher else None,
                "http2": alpn == "h2",
                "alpn": alpn,
                "handshake_ms": handshake_ms,
            },
            "trusted": trusted,
            "trust_message": "" if trusted else (trust_msg or ""),
        })
        return result
    except socket.gaierror:
        result["error"] = "Domeniul nu poate fi rezolvat (DNS)."
        return result
    except (ssl.SSLError, ConnectionError, socket.timeout, OSError) as e:
        result["error"] = f"Conexiune SSL eșuată: {e}"
        return result
    except Exception as e:
        result["error"] = str(e)
        return result
