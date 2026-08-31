"""Backend API tests for Flaviu Workspace (auth verify + DNS zone lookup tool)."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from env and /app/frontend/.env")
BASE_URL = base_url.rstrip("/")

EXPECTED_CATEGORIES = ["Parent", "NS", "SOA", "MX", "WWW"]


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def workspace_key():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    m = re.search(r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?Key[^:]*:?(?:\*\*)?\s*:?\s*`([^`]+)`", p.read_text())
    if not m:
        pytest.skip("No key found in test_credentials.md")
    return m.group(1).strip()


# ---------------- Health ----------------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200
        assert "message" in r.json()


# ---------------- Auth ----------------
class TestAuthVerify:
    def test_valid_key(self, api_client, workspace_key):
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={"key": workspace_key}, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"valid": True}

    def test_valid_key_with_dashes_and_spaces(self, api_client, workspace_key):
        dashed = "-".join([workspace_key[:5], workspace_key[5:10], workspace_key[10:]])
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={"key": f"  {dashed}  "}, timeout=30)
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_wrong_key(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={"key": "AAAAAAAAAAAAAAAAAAAA"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_empty_key(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={"key": ""}, timeout=30)
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_case_sensitivity(self, api_client, workspace_key):
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={"key": workspace_key.upper()}, timeout=30)
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_missing_field_validation(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/verify", json={}, timeout=30)
        assert r.status_code == 422


# ---------------- DNS Zone Lookup ----------------
class TestDnsLookup:
    def _post(self, api_client, domain, timeout=90):
        return api_client.post(f"{BASE_URL}/api/tools/dns-lookup", json={"domain": domain}, timeout=timeout)

    def test_lookup_flaviu_dev_full_report(self, api_client):
        r = self._post(api_client, "flaviu.dev")
        assert r.status_code == 200
        data = r.json()
        assert "error" not in data, data
        assert data["domain"] == "flaviu.dev"
        assert isinstance(data["duration_ms"], int)
        names = [c["name"] for c in data["categories"]]
        assert names == EXPECTED_CATEGORIES
        for cat in data["categories"]:
            assert len(cat["checks"]) >= 1
            for chk in cat["checks"]:
                assert set(chk.keys()) == {"status", "test", "info"}
                assert chk["status"] in ("ok", "info", "warn", "error")
                assert chk["test"] and chk["info"]

    def test_lookup_includes_ns_soa_a_txt_data(self, api_client):
        r = self._post(api_client, "google.com")
        assert r.status_code == 200
        data = r.json()
        assert "error" not in data, data
        by_name = {c["name"]: c["checks"] for c in data["categories"]}
        # NS records present
        assert any("ns" in c["info"].lower() for c in by_name["NS"])
        # SOA parsed
        soa_info = " ".join(c["info"] for c in by_name["SOA"])
        assert "Serial:" in soa_info and "Refresh:" in soa_info
        # MX present for google.com
        mx_info = " ".join(c["info"] for c in by_name["MX"])
        assert "smtp" in mx_info.lower() or "aspmx" in mx_info.lower() or "google" in mx_info.lower()
        # A + TXT present
        www_tests = [c["test"] for c in by_name["WWW"]]
        assert "WWW A Record" in www_tests
        assert "TXT Records" in www_tests

    def test_url_is_normalized(self, api_client):
        r = self._post(api_client, "HTTPS://Flaviu.dev/some/path?x=1")
        assert r.status_code == 200
        data = r.json()
        assert data.get("domain") == "flaviu.dev", data

    @pytest.mark.parametrize("bad", ["notadomain", "", "   ", "http://"])
    def test_invalid_domain_returns_friendly_error(self, api_client, bad):
        r = self._post(api_client, bad, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "error" in data, data
        assert "categories" not in data

    def test_nonexistent_domain_does_not_crash(self, api_client):
        r = self._post(api_client, "this-domain-surely-does-not-exist-99213.com")
        assert r.status_code == 200
        data = r.json()
        # Either a friendly error or a report with error-status checks
        if "error" not in data:
            statuses = [chk["status"] for c in data["categories"] for chk in c["checks"]]
            assert "error" in statuses or "warn" in statuses

    def test_missing_field_validation(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/tools/dns-lookup", json={}, timeout=30)
        assert r.status_code == 422

    def test_no_mongo_object_id_leak(self, api_client):
        r = self._post(api_client, "flaviu.dev")
        assert "_id" not in r.text


# ---------------- IMAP Mail Sync job lifecycle (graceful error handling) ----------------
class TestImapSync:
    BAD_ACCOUNT = {
        "host": "imap.gmail.com", "port": 993,
        "email": "test@gmail.com", "password": "wrongpassword", "ssl": True,
    }

    def test_imap_test_connection_bad_credentials(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/tools/imap/test", json=self.BAD_ACCOUNT, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert isinstance(data.get("error"), str) and data["error"]

    def test_start_returns_job_id_and_status_ends_in_error(self, api_client):
        import time as _t
        r = api_client.post(f"{BASE_URL}/api/tools/imap/start",
                            json={"source": self.BAD_ACCOUNT, "dest": self.BAD_ACCOUNT}, timeout=60)
        assert r.status_code == 200
        job_id = r.json().get("job_id")
        assert isinstance(job_id, str) and len(job_id) > 10

        statuses = []
        final = None
        for _ in range(30):
            s = api_client.get(f"{BASE_URL}/api/tools/imap/status/{job_id}", timeout=30)
            assert s.status_code == 200
            body = s.json()
            assert "cancel" not in body
            statuses.append(body["status"])
            if body.get("finished"):
                final = body
                break
            _t.sleep(1)

        assert final is not None, f"job never finished; statuses seen: {statuses}"
        assert final["status"] == "error", final
        assert final["error"], final
        assert "logs" in final and any("EROARE" in l for l in final["logs"]), final["logs"]
        assert final["id"] == job_id

    def test_status_unknown_job(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/tools/imap/status/doesnotexist123", timeout=30)
        assert r.status_code == 200
        assert "error" in r.json()

    def test_cancel_unknown_job(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/tools/imap/cancel/doesnotexist123", timeout=30)
        assert r.status_code == 200
        assert r.json() == {"cancelled": False}

    def test_start_missing_fields_validation(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/tools/imap/start", json={"source": {}}, timeout=30)
        assert r.status_code == 422
