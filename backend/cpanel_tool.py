"""cPanel-to-cPanel migration: file transfer over FTP + database listing via cPanel UAPI."""
import ftplib
import os
import tempfile
import threading
import time
import uuid
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

JOBS = {}
_lock = threading.Lock()


def _clean(e):
    s = str(e)
    if s.startswith("b'") or s.startswith('b"'):
        s = s[2:-1]
    return s


def _ftp_connect(cfg):
    host = cfg["host"].strip()
    port = int(cfg.get("port") or 21)
    user = cfg["user"].strip()
    pw = cfg["password"]
    if cfg.get("tls"):
        f = ftplib.FTP_TLS()
        f.connect(host, port, timeout=40)
        f.login(user, pw)
        f.prot_p()
    else:
        f = ftplib.FTP()
        f.connect(host, port, timeout=40)
        f.login(user, pw)
    f.set_pasv(True)
    return f


def _list_dir(ftp, path):
    """Return list of (name, is_dir) including hidden entries."""
    entries = []
    try:
        for name, facts in ftp.mlsd(path, facts=["type"]):
            if name in (".", ".."):
                continue
            t = facts.get("type", "")
            if t in ("dir", "cdir", "pdir"):
                entries.append((name, True))
            elif t == "file":
                entries.append((name, False))
        return entries
    except Exception:
        pass
    # fallback: LIST -a unix parsing
    lines = []
    try:
        ftp.retrlines(f"LIST -a {path}" if path else "LIST -a", lines.append)
    except Exception:
        ftp.retrlines("LIST", lines.append)
    for ln in lines:
        parts = ln.split(maxsplit=8)
        if len(parts) < 9:
            continue
        name = parts[8]
        if name in (".", ".."):
            continue
        is_dir = ln[0] == "d"
        if ln[0] == "l":  # symlink; treat target
            name = name.split(" -> ")[0]
            is_dir = False
        entries.append((name, is_dir))
    return entries


def _ftp_size(ftp, path):
    try:
        return ftp.size(path)
    except Exception:
        return None


def _ftp_mkd(ftp, path):
    try:
        ftp.mkd(path)
    except Exception:
        pass


def list_databases(cfg):
    host = cfg["host"].strip()
    user = cfg["user"].strip()
    pw = cfg["password"]
    for port in (2083,):
        try:
            url = f"https://{host}:{port}/execute/Mysql/list_databases"
            r = requests.get(url, auth=(user, pw), verify=False, timeout=25)
            if r.status_code == 200:
                data = r.json()
                rows = data.get("data") or []
                out = []
                for d in rows:
                    if isinstance(d, dict):
                        out.append({"name": d.get("database") or d.get("name"),
                                    "disk_usage": d.get("disk_usage")})
                    else:
                        out.append({"name": str(d), "disk_usage": None})
                return {"ok": True, "databases": out}
            return {"ok": False, "error": f"cPanel UAPI a răspuns {r.status_code}"}
        except Exception as e:
            return {"ok": False, "error": _clean(e)}
    return {"ok": False, "error": "Nu am putut contacta cPanel UAPI (port 2083)."}


def scan(source):
    """Scan the cPanel home directory: top-level folders + database list."""
    result = {"home": "", "folders": [], "databases": [], "db_note": ""}
    ftp = None
    try:
        ftp = _ftp_connect(source)
        home = ftp.pwd()
        result["home"] = home
        for name, is_dir in _list_dir(ftp, home):
            if is_dir:
                result["folders"].append({"name": name, "path": home.rstrip("/") + "/" + name})
        result["folders"].sort(key=lambda x: x["name"].lower())
    except Exception as e:
        result["error"] = _clean(e)
        return result
    finally:
        try:
            if ftp:
                ftp.quit()
        except Exception:
            pass

    db = list_databases(source)
    if db.get("ok"):
        result["databases"] = db["databases"]
    else:
        result["db_note"] = db.get("error", "Nu am putut lista bazele de date.")
    return result


def _log(job, msg):
    with _lock:
        job["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        job["logs"] = job["logs"][-300:]


def _walk(ftp, path, rel, files, dirs):
    dirs.append(rel)
    for name, is_dir in _list_dir(ftp, path):
        full = path.rstrip("/") + "/" + name
        r = (rel + "/" + name) if rel else name
        if is_dir:
            _walk(ftp, full, r, files, dirs)
        else:
            files.append((full, r, _ftp_size(ftp, full) or 0))


def run_migration(job_id, source, dest, folders):
    job = JOBS[job_id]
    src = dst = None
    try:
        job["status"] = "connecting"
        _log(job, f"Conectare FTP sursă {source['host']}...")
        src = _ftp_connect(source)
        src_home = src.pwd()
        _log(job, f"Conectare FTP destinație {dest['host']}...")
        dst = _ftp_connect(dest)
        dst_home = dst.pwd()

        job["status"] = "scanning"
        all_files = []
        all_dirs = []
        for folder in folders:
            _log(job, f"Scanez folderul '{folder}'...")
            base = src_home.rstrip("/") + "/" + folder
            _walk(src, base, folder, all_files, all_dirs)
        job["total"] = len(all_files)
        job["total_bytes"] = sum(f[2] for f in all_files)
        _log(job, f"{len(all_files)} fișiere ({job['total_bytes'] / 1048576:.1f} MB) în {len(all_dirs)} foldere.")

        job["status"] = "transferring"
        job["start_ts"] = time.time()

        # create directory tree on destination
        for rel in all_dirs:
            _ftp_mkd(dst, dst_home.rstrip("/") + "/" + rel)

        done = 0
        done_bytes = 0
        for full, rel, size in all_files:
            if job.get("cancel"):
                raise RuntimeError("Anulat de utilizator.")
            job["current"] = rel
            dst_path = dst_home.rstrip("/") + "/" + rel

            # skip if same size already exists (idempotent re-runs)
            existing = _ftp_size(dst, dst_path)
            if existing is not None and existing == size and size > 0:
                job["skipped"] = job.get("skipped", 0) + 1
                done += 1
                done_bytes += size
                job["done"] = done
                job["done_bytes"] = done_bytes
                continue

            tmp = tempfile.NamedTemporaryFile(delete=False)
            try:
                src.retrbinary("RETR " + full, tmp.write)
                tmp.close()
                with open(tmp.name, "rb") as fh:
                    dst.storbinary("STOR " + dst_path, fh)
            except Exception as e:
                _log(job, f"Eroare la '{rel}': {_clean(e)}")
            finally:
                try:
                    os.unlink(tmp.name)
                except Exception:
                    pass
            done += 1
            done_bytes += size
            job["done"] = done
            job["done_bytes"] = done_bytes

        job["status"] = "done"
        job["current"] = ""
        job["duration_ms"] = int((time.time() - job["start_ts"]) * 1000)
        _log(job, f"Migrare completă: {done}/{len(all_files)} fișiere "
                  f"({job.get('skipped', 0)} sărite) în {job['duration_ms'] / 1000:.1f}s.")
    except Exception as e:
        job["status"] = "error"
        job["error"] = _clean(e)
        if job.get("start_ts"):
            job["duration_ms"] = int((time.time() - job["start_ts"]) * 1000)
        _log(job, f"EROARE: {_clean(e)}")
    finally:
        job["finished"] = True
        for c in (src, dst):
            try:
                if c:
                    c.quit()
            except Exception:
                pass


def start_job(source, dest, folders):
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "id": job_id, "status": "queued", "total": 0, "done": 0,
        "total_bytes": 0, "done_bytes": 0, "current": "", "logs": [],
        "error": None, "finished": False, "cancel": False,
        "skipped": 0, "duration_ms": 0, "folders": folders,
    }
    t = threading.Thread(target=run_migration, args=(job_id, source, dest, folders), daemon=True)
    t.start()
    return job_id


def get_status(job_id):
    return JOBS.get(job_id)


def cancel_job(job_id):
    if job_id in JOBS:
        JOBS[job_id]["cancel"] = True
        return True
    return False
