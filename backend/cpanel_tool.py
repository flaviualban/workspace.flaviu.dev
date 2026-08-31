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


def _api2_fileop(cfg, op, sourcefiles, destfiles=None, metadata=None, timeout=1800):
    host = cfg["host"].strip()
    user = cfg["user"].strip()
    pw = cfg["password"]
    url = f"https://{host}:2083/json-api/cpanel"
    params = {
        "cpanel_jsonapi_apiversion": "2",
        "cpanel_jsonapi_module": "Fileman",
        "cpanel_jsonapi_func": "fileop",
        "op": op,
        "sourcefiles": sourcefiles,
        "doubledecode": "0",
    }
    if destfiles is not None:
        params["destfiles"] = destfiles
    if metadata is not None:
        params["metadata"] = metadata
    r = requests.post(url, auth=(user, pw), params=params, verify=False, timeout=timeout)
    if r.status_code != 200:
        return {"ok": False, "error": f"cPanel API a răspuns {r.status_code}"}
    try:
        data = r.json()
    except Exception:
        return {"ok": False, "error": "Răspuns cPanel invalid (verifică portul 2083 / credențialele)."}
    res = data.get("cpanelresult", data)
    err = res.get("error")
    rows = res.get("data") or []
    if err:
        return {"ok": False, "error": _clean(err)}
    for row in rows:
        if isinstance(row, dict) and str(row.get("result", "1")) == "0":
            return {"ok": False, "error": _clean(row.get("reason") or "operație eșuată")}
    return {"ok": True, "data": rows}


def _home_files(ftp, home):
    return {name for name, is_dir in _list_dir(ftp, home) if not is_dir}


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


def run_migration_archive(job_id, source, dest, folders):
    job = JOBS[job_id]
    src = dst = None
    try:
        job["start_ts"] = time.time()
        job["status"] = "connecting"
        _log(job, f"Conectare FTP sursă {source['host']}...")
        src = _ftp_connect(source)
        src_home = src.pwd().rstrip("/")
        _log(job, f"Conectare FTP destinație {dest['host']}...")
        dst = _ftp_connect(dest)
        dst_home = dst.pwd().rstrip("/")

        for idx, folder in enumerate(folders):
            if job.get("cancel"):
                raise RuntimeError("Anulat de utilizator.")
            job["current"] = folder
            job["folders_done"] = idx

            # 1) compress on source
            job["status"] = "compressing"
            job["phase"] = "Comprimare pe sursă"
            job["bytes_total"] = 0
            job["bytes_done"] = 0
            _log(job, f"[{folder}] Comprim pe server (tar.gz)...")
            before = _home_files(src, src_home)
            res = _api2_fileop(source, "compress", f"{src_home}/{folder}", metadata="tar.gz")
            if not res.get("ok"):
                _log(job, f"[{folder}] Comprimare eșuată: {res.get('error')}")
                continue
            after = _home_files(src, src_home)
            new_files = [f for f in (after - before)
                         if f.endswith((".tar.gz", ".tgz", ".zip", ".tar"))]
            if not new_files:
                cand = f"{folder}.tar.gz"
                new_files = [cand] if cand in after else []
            if not new_files:
                _log(job, f"[{folder}] Nu găsesc arhiva creată, sar peste.")
                continue
            archive = sorted(new_files)[0]
            src_arch = f"{src_home}/{archive}"
            dst_arch = f"{dst_home}/{archive}"
            asize = _ftp_size(src, src_arch) or 0
            _log(job, f"[{folder}] Arhivă: {archive} ({asize / 1048576:.1f} MB)")

            # 2) download archive
            job["status"] = "downloading"
            job["phase"] = "Descărcare arhivă"
            job["bytes_total"] = asize
            job["bytes_done"] = 0
            tmp = tempfile.NamedTemporaryFile(delete=False)
            try:
                def dl_cb(data):
                    tmp.write(data)
                    job["bytes_done"] = job.get("bytes_done", 0) + len(data)
                src.retrbinary("RETR " + src_arch, dl_cb, blocksize=1048576)
                tmp.close()

                # 3) upload archive
                job["status"] = "uploading"
                job["phase"] = "Încărcare pe destinație"
                job["bytes_total"] = asize
                job["bytes_done"] = 0

                def ul_cb(block):
                    job["bytes_done"] = job.get("bytes_done", 0) + len(block)
                with open(tmp.name, "rb") as fh:
                    dst.storbinary("STOR " + dst_arch, fh, blocksize=1048576, callback=ul_cb)
            finally:
                try:
                    os.unlink(tmp.name)
                except Exception:
                    pass

            # 4) extract on destination
            job["status"] = "extracting"
            job["phase"] = "Dezarhivare pe destinație"
            job["bytes_total"] = 0
            job["bytes_done"] = 0
            _log(job, f"[{folder}] Dezarhivez pe destinație...")
            ex = _api2_fileop(dest, "extract", dst_arch, destfiles=dst_home + "/")
            if not ex.get("ok"):
                _log(job, f"[{folder}] Dezarhivare eșuată: {ex.get('error')}")

            # 5) cleanup archives
            for c, p in ((src, src_arch), (dst, dst_arch)):
                try:
                    c.delete(p)
                except Exception:
                    pass
            _log(job, f"[{folder}] Gata.")
            job["folders_done"] = idx + 1

        job["status"] = "done"
        job["current"] = ""
        job["phase"] = ""
        job["duration_ms"] = int((time.time() - job["start_ts"]) * 1000)
        _log(job, f"Migrare completă: {job['folders_done']}/{len(folders)} foldere în {job['duration_ms'] / 1000:.1f}s.")
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


def start_job(source, dest, folders, method="archive"):
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "id": job_id, "status": "queued", "mode": method, "total": 0, "done": 0,
        "total_bytes": 0, "done_bytes": 0, "bytes_total": 0, "bytes_done": 0,
        "folders_total": len(folders), "folders_done": 0, "phase": "",
        "current": "", "logs": [], "error": None, "finished": False,
        "cancel": False, "skipped": 0, "duration_ms": 0, "folders": folders,
    }
    target = run_migration_archive if method == "archive" else run_migration
    t = threading.Thread(target=target, args=(job_id, source, dest, folders), daemon=True)
    t.start()
    return job_id


def get_status(job_id):
    return JOBS.get(job_id)


def cancel_job(job_id):
    if job_id in JOBS:
        JOBS[job_id]["cancel"] = True
        return True
    return False
