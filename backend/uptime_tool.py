"""In-memory uptime monitor with a background scheduler (no DB)."""
import threading
import time
import uuid
import requests

MONITORS = {}
_lock = threading.Lock()
HISTORY_MAX = 200
DEFAULT_INTERVAL = 300  # seconds


def _norm_url(url):
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _check(url):
    start = time.time()
    try:
        r = requests.get(url, timeout=15, allow_redirects=True,
                         headers={"User-Agent": "FlaviuWorkspace-UptimeMonitor/1.0"})
        ms = int((time.time() - start) * 1000)
        up = r.status_code < 500
        return {"ts": time.time(), "up": up, "code": r.status_code, "ms": ms}
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        return {"ts": time.time(), "up": False, "code": 0, "ms": ms, "error": str(e)[:120]}


def _apply(mon, res):
    mon["last_check"] = res["ts"]
    mon["status"] = "up" if res["up"] else "down"
    mon["last_code"] = res["code"]
    mon["last_ms"] = res["ms"]
    mon["last_error"] = res.get("error", "")
    mon["history"].append(res)
    mon["history"] = mon["history"][-HISTORY_MAX:]
    ups = sum(1 for h in mon["history"] if h["up"])
    mon["uptime_pct"] = round(ups / len(mon["history"]) * 100, 1) if mon["history"] else 0.0


def add_monitor(url, name=None, interval=DEFAULT_INTERVAL):
    url = _norm_url(url)
    if not url:
        return None
    with _lock:
        for m in MONITORS.values():
            if m["url"] == url:
                return m
        mid = uuid.uuid4().hex
        mon = {
            "id": mid, "url": url, "name": (name or url).strip(),
            "interval": interval, "created": time.time(),
            "last_check": None, "status": "pending", "last_code": None,
            "last_ms": None, "last_error": "", "uptime_pct": 0.0, "history": [],
        }
        MONITORS[mid] = mon
    _apply(mon, _check(url))
    return mon


def remove_monitor(mid):
    with _lock:
        return MONITORS.pop(mid, None) is not None


def list_monitors():
    with _lock:
        return list(MONITORS.values())


def check_now(mid=None):
    if mid:
        mon = MONITORS.get(mid)
        if mon:
            _apply(mon, _check(mon["url"]))
        return mon
    for mon in list(MONITORS.values()):
        _apply(mon, _check(mon["url"]))
    return list(MONITORS.values())


def sync(targets):
    """Ensure each target exists (used to re-hydrate from client localStorage)."""
    for t in targets or []:
        url = t.get("url") if isinstance(t, dict) else t
        name = t.get("name") if isinstance(t, dict) else None
        if url:
            add_monitor(url, name)
    return list_monitors()


def _scheduler():
    while True:
        time.sleep(20)
        now = time.time()
        for mon in list(MONITORS.values()):
            last = mon.get("last_check") or 0
            if now - last >= mon.get("interval", DEFAULT_INTERVAL):
                try:
                    _apply(mon, _check(mon["url"]))
                except Exception:
                    pass


_thread = threading.Thread(target=_scheduler, daemon=True)
_thread.start()
