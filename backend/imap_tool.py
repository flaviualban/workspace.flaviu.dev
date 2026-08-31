"""IMAP mailbox-to-mailbox sync with live progress tracking."""
import imaplib
import re
import ssl
import threading
import time
import uuid

imaplib._MAXLINE = 10_000_000

JOBS = {}
_lock = threading.Lock()

_LIST_RE = re.compile(rb'\((?P<flags>[^)]*)\)\s+"?(?P<delim>[^"\s]*)"?\s+(?P<name>.*)')
_FLAGS_RE = re.compile(rb'FLAGS\s+\(([^)]*)\)')
_IDATE_RE = re.compile(rb'INTERNALDATE\s+"([^"]*)"')
_MSGID_RE = re.compile(rb'(?im)^Message-ID:\s*(<[^>\r\n]+>)')


def _clean_err(e):
    s = str(e)
    if s.startswith("b'") or s.startswith('b"'):
        s = s[2:-1]
    return s.encode().decode("unicode_escape") if "\\" in s else s


def _connect(cfg):
    host = cfg["host"].strip()
    port = int(cfg.get("port") or 993)
    use_ssl = cfg.get("ssl", True)
    if use_ssl:
        M = imaplib.IMAP4_SSL(host, port)
    else:
        M = imaplib.IMAP4(host, port)
    M.login(cfg["email"].strip(), cfg["password"])
    return M


def test_connection(cfg):
    try:
        M = _connect(cfg)
        M.logout()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": _clean_err(e)}


def _list_folders(M):
    typ, data = M.list()
    folders = []
    if typ != "OK":
        return folders
    for line in data:
        if not line:
            continue
        if isinstance(line, tuple):
            line = line[0]
        m = _LIST_RE.match(line)
        if not m:
            continue
        flags = m.group("flags").decode(errors="ignore")
        if "\\Noselect" in flags:
            continue
        name = m.group("name").decode(errors="ignore").strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1]
        folders.append(name)
    return folders


def _quote(mailbox):
    return '"' + mailbox.replace('"', '\\"') + '"'


def _log(job, msg):
    with _lock:
        job["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        job["logs"] = job["logs"][-200:]


def _bump(job, field, n=1):
    with _lock:
        job[field] = job.get(field, 0) + n


def _worker(source, dest, folder, uids, job, CONN_ERR):
    s = d = None
    try:
        s = _connect(source)
        s.select(_quote(folder), readonly=True)
        d = _connect(dest)
        d.select(_quote(folder))
    except Exception as e:
        _log(job, f"Worker '{folder}' conectare eșuată: {_clean_err(e)}")
        _bump(job, "done", len(uids))
        return

    for uid in uids:
        if job.get("cancel"):
            break

        fetched = None
        for _ in range(3):
            try:
                typ, md = s.uid("fetch", uid, "(FLAGS INTERNALDATE BODY.PEEK[])")
                if typ == "OK" and md and isinstance(md[0], tuple):
                    fetched = md
                break
            except CONN_ERR:
                try:
                    s.logout()
                except Exception:
                    pass
                try:
                    s = _connect(source)
                    s.select(_quote(folder), readonly=True)
                except Exception:
                    time.sleep(1)
            except Exception as e:
                _log(job, f"Eroare fetch {folder}: {_clean_err(e)}")
                break

        if not fetched:
            _bump(job, "done")
            continue

        header = fetched[0][0]
        body = fetched[0][1]
        fm = _FLAGS_RE.search(header)
        flags = fm.group(1).decode(errors="ignore") if fm else ""
        flags = " ".join(x for x in flags.split() if x.lower() != "\\recent")
        im = _IDATE_RE.search(header)
        idate = im.group(1).decode(errors="ignore") if im else None
        idate_arg = '"' + idate + '"' if idate else imaplib.Time2Internaldate(time.time())

        mid_m = _MSGID_RE.search(body)
        if mid_m:
            try:
                typ, r = d.uid("search", None, "HEADER", "Message-ID",
                               '"' + mid_m.group(1).decode(errors="ignore") + '"')
                if typ == "OK" and r and r[0]:
                    _bump(job, "skipped")
                    _bump(job, "done")
                    continue
            except Exception:
                pass

        for _ in range(3):
            try:
                d.append(_quote(folder), f"({flags})" if flags else None, idate_arg, body)
                break
            except CONN_ERR:
                try:
                    d.logout()
                except Exception:
                    pass
                try:
                    d = _connect(dest)
                    d.select(_quote(folder))
                except Exception:
                    time.sleep(1)
            except Exception as e:
                _log(job, f"Eroare append {folder}: {_clean_err(e)}")
                break

        _bump(job, "done")

    for c in (s, d):
        try:
            if c:
                c.logout()
        except Exception:
            pass



def run_sync(job_id, source, dest):
    job = JOBS[job_id]
    src = None
    dst = None
    try:
        job["status"] = "connecting"
        _log(job, f"Conectare la sursă {source['host']}...")
        src = _connect(source)
        _log(job, f"Conectare la destinație {dest['host']}...")
        dst = _connect(dest)
        job["status"] = "counting"

        folders = _list_folders(src)
        _log(job, f"{len(folders)} foldere găsite pe sursă.")
        job["folders_total"] = len(folders)

        # count total messages
        total = 0
        folder_counts = {}
        for f in folders:
            try:
                typ, d = src.select(_quote(f), readonly=True)
                if typ != "OK":
                    continue
                typ, sd = src.uid("search", None, "ALL")
                ids = sd[0].split() if sd and sd[0] else []
                folder_counts[f] = ids
                total += len(ids)
            except Exception as e:
                _log(job, f"Nu pot citi folderul {f}: {e}")
        job["total"] = total
        _log(job, f"Total {total} mesaje de transferat.")

        job["status"] = "syncing"
        job["start_ts"] = time.time()
        WORKERS = 4
        CONN_ERR = (imaplib.IMAP4.abort, OSError, ssl.SSLError, EOFError)

        for f in folders:
            uids = folder_counts.get(f, [])
            job["current_folder"] = f
            _log(job, f"Folder '{f}' — {len(uids)} mesaje")
            try:
                dst.create(_quote(f))
            except Exception:
                pass
            try:
                dst.subscribe(_quote(f))
            except Exception:
                pass
            if not uids:
                continue

            n = min(WORKERS, len(uids))
            chunks = [uids[i::n] for i in range(n)]
            threads = []
            for ch in chunks:
                if not ch:
                    continue
                t = threading.Thread(target=_worker, args=(source, dest, f, ch, job, CONN_ERR), daemon=True)
                t.start()
                threads.append(t)
            for t in threads:
                t.join()
            if job.get("cancel"):
                raise RuntimeError("Anulat de utilizator.")

        job["status"] = "done"
        job["current_folder"] = ""
        job["duration_ms"] = int((time.time() - job["start_ts"]) * 1000)
        _log(job, f"Transfer complet: {job['done']}/{total} mesaje "
                  f"({job.get('skipped', 0)} deja existente, sărite) în {job['duration_ms'] / 1000:.1f}s.")
    except Exception as e:
        job["status"] = "error"
        job["error"] = _clean_err(e)
        if job.get("start_ts"):
            job["duration_ms"] = int((time.time() - job["start_ts"]) * 1000)
        _log(job, f"EROARE: {_clean_err(e)}")
    finally:
        job["finished"] = True
        for c in (src, dst):
            try:
                if c:
                    c.logout()
            except Exception:
                pass


def start_job(source, dest):
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "id": job_id, "status": "queued", "total": 0, "done": 0,
        "folders_total": 0, "current_folder": "", "logs": [],
        "error": None, "finished": False, "cancel": False, "skipped": 0, "duration_ms": 0,
    }
    t = threading.Thread(target=run_sync, args=(job_id, source, dest), daemon=True)
    t.start()
    return job_id


def get_status(job_id):
    return JOBS.get(job_id)


def cancel_job(job_id):
    if job_id in JOBS:
        JOBS[job_id]["cancel"] = True
        return True
    return False
