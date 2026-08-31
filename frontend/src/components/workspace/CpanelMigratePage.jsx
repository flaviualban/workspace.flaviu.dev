import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft, Lock, FolderSync, Server, Loader2, Play, Square, Search,
  CheckCircle2, XCircle, ArrowRight, Terminal, Folder, Database, Clock3, HardDrive,
} from "lucide-react";
import { Checkbox } from "../ui/checkbox";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const emptyAccount = { host: "", port: 21, user: "", password: "", tls: false };

const AccountForm = ({ title, label, value, onChange, testPrefix }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-6">
    <div className="flex items-center gap-2 mb-5">
      <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
        <Server className="w-4.5 h-4.5" />
      </div>
      <div>
        <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">{label}</div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2">
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Server FTP (host / IP)</label>
        <input data-testid={`${testPrefix}-host`} value={value.host} spellCheck={false}
          onChange={(e) => onChange({ ...value, host: e.target.value })} placeholder="ftp.exemplu.ro"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Port</label>
        <input data-testid={`${testPrefix}-port`} type="number" value={value.port}
          onChange={(e) => onChange({ ...value, port: e.target.value })}
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white" />
      </div>
      <div className="col-span-3">
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Username cPanel</label>
        <input data-testid={`${testPrefix}-user`} value={value.user} spellCheck={false}
          onChange={(e) => onChange({ ...value, user: e.target.value })} placeholder="cpaneluser"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white" />
      </div>
      <div className="col-span-3">
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Parolă cPanel</label>
        <input data-testid={`${testPrefix}-password`} type="password" value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })} placeholder="••••••••"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white" />
      </div>
      <label className="col-span-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input data-testid={`${testPrefix}-tls`} type="checkbox" checked={value.tls}
          onChange={(e) => onChange({ ...value, tls: e.target.checked })} className="accent-sky-600 w-4 h-4" />
        FTP over TLS (FTPS explicit)
      </label>
    </div>
  </div>
);

export const CpanelMigratePage = ({ onLock }) => {
  const navigate = useNavigate();
  const [source, setSource] = useState({ ...emptyAccount });
  const [dest, setDest] = useState({ ...emptyAccount });
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState({});
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [method, setMethod] = useState("archive");
  const pollRef = useRef(null);
  const logEndRef = useRef(null);

  const running = job && !job.finished && job.status !== "done" && job.status !== "error";

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/tools/cpanel/status/${jobId}`);
        setJob(res.data);
        if (res.data.finished) clearInterval(pollRef.current);
      } catch (e) { clearInterval(pollRef.current); }
    }, 1000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [job?.logs?.length]);

  const srcValid = source.host && source.user && source.password;
  const dstValid = dest.host && dest.user && dest.password;

  const doScan = async () => {
    if (!srcValid || scanning) return;
    setScanning(true); setError(""); setScan(null); setSelected({}); setJob(null); setJobId(null);
    try {
      const res = await axios.post(`${API}/tools/cpanel/scan`, { ...source, port: Number(source.port) || 21 });
      if (res.data.error) setError(`Scanare eșuată: ${res.data.error}`);
      else {
        setScan(res.data);
        const preset = {};
        res.data.folders.forEach((f) => { if (f.name === "public_html") preset[f.name] = true; });
        setSelected(preset);
      }
    } catch (e) { setError("Scanarea a eșuat."); }
    finally { setScanning(false); }
  };

  const chosen = Object.keys(selected).filter((k) => selected[k]);

  const start = async () => {
    if (!dstValid || !chosen.length || starting) return;
    setStarting(true); setError(""); setJob(null);
    try {
      const payload = {
        source: { ...source, port: Number(source.port) || 21 },
        dest: { ...dest, port: Number(dest.port) || 21 },
        folders: chosen,
        method,
      };
      const res = await axios.post(`${API}/tools/cpanel/start`, payload);
      if (res.data.error) setError(res.data.error);
      else setJobId(res.data.job_id);
    } catch (e) { setError("Nu am putut porni migrarea."); }
    finally { setStarting(false); }
  };

  const cancel = async () => { if (jobId) await axios.post(`${API}/tools/cpanel/cancel/${jobId}`).catch(() => {}); };

  const isArchive = job?.mode === "archive";
  let pct = 0;
  if (job) {
    if (isArchive) {
      pct = job.bytes_total > 0
        ? Math.round((job.bytes_done / job.bytes_total) * 100)
        : (job.folders_total > 0 ? Math.round((job.folders_done / job.folders_total) * 100) : 0);
    } else {
      pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
    }
  }
  const statusLabel = {
    queued: "În așteptare", connecting: "Conectare", scanning: "Scanare fișiere",
    compressing: "Comprimare", downloading: "Descărcare", uploading: "Încărcare",
    extracting: "Dezarhivare", transferring: "Migrare în curs", done: "Finalizat", error: "Eroare",
  };
  const mb = (b) => ((b || 0) / 1048576).toFixed(1);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button data-testid="cpanel-back-button" onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <FolderSync className="w-4 h-4 text-sky-600" /> cPanel Migration
          </div>
          <button data-testid="logout-lock-button" onClick={onLock}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900">
            <Lock className="w-3.5 h-3.5" /> Blochează
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <div className="mb-8">
          <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">Server Migration</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Migrare fișiere între cPanel-uri</h1>
          <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
            Scanează home-ul contului sursă, alege folderele (inclusiv fișierele hidden) și migrează-le prin FTP către destinație, cu progres live. Bazele de date sunt doar listate deocamdată.
          </p>
        </div>

        {/* Step 1: source + scan */}
        <div className="mb-6">
          <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase mb-3">Pasul 1 — Sursă & scanare</div>
          <AccountForm title="Contul sursă" label="SOURCE" value={source} onChange={setSource} testPrefix="cpanel-source" />
          <button data-testid="cpanel-scan-button" onClick={doScan} disabled={!srcValid || scanning}
            className="mt-4 flex items-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
            {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanez...</> : <><Search className="w-4 h-4" /> Scanează serverul sursă</>}
          </button>
        </div>

        {error && <div data-testid="cpanel-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4 mb-6">{error}</div>}

        {/* Step 2: selection */}
        {scan && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase mb-3">
              Pasul 2 — Selectează ce migrezi · home: <span className="text-slate-600">{scan.home}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-900">
                  <Folder className="w-4 h-4 text-sky-600" /> Foldere ({scan.folders.length})
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto" data-testid="cpanel-folder-list">
                  {scan.folders.map((f) => (
                    <label key={f.name} data-testid={`cpanel-folder-${f.name}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors duration-150">
                      <Checkbox checked={!!selected[f.name]}
                        onCheckedChange={(v) => setSelected((s) => ({ ...s, [f.name]: !!v }))} />
                      <span className="font-mono text-sm text-slate-700">{f.name}</span>
                      {f.name === "public_html" && <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">domeniu principal</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-900">
                  <Database className="w-4 h-4 text-sky-600" /> Baze de date ({scan.databases.length})
                </div>
                {scan.databases.length > 0 ? (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {scan.databases.map((d) => (
                      <div key={d.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
                        <span className="font-mono text-sm text-slate-700 flex items-center gap-2"><Database className="w-3.5 h-3.5 text-slate-400" /> {d.name}</span>
                        {d.disk_usage != null && <span className="font-mono text-xs text-slate-400">{mb(d.disk_usage)} MB</span>}
                      </div>
                    ))}
                    <p className="text-xs text-amber-600 mt-3 flex items-start gap-1.5"><Database className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Listare informativă. Transferul bazelor de date va fi adăugat ulterior.</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{scan.db_note || "Nicio bază de date găsită."}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: destination + start */}
        {scan && (
          <div className="mb-6">
            <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase mb-3">Pasul 3 — Destinație & migrare</div>
            <AccountForm title="Contul destinație" label="DESTINATION" value={dest} onChange={setDest} testPrefix="cpanel-dest" />

            <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs font-medium text-slate-500 mb-3">Metodă de transfer</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <button data-testid="cpanel-method-archive" onClick={() => setMethod("archive")}
                  className={`text-left rounded-xl border p-4 transition-colors duration-200 ${method === "archive" ? "border-sky-500 bg-sky-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FolderSync className="w-4 h-4 text-sky-600" /> Arhivă (recomandat)</div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Comprimă pe sursă → transferă o singură arhivă → dezarhivează. Ideal pentru WordPress cu mii de fișiere.</p>
                </button>
                <button data-testid="cpanel-method-files" onClick={() => setMethod("files")}
                  className={`text-left rounded-xl border p-4 transition-colors duration-200 ${method === "files" ? "border-sky-500 bg-sky-50/50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Folder className="w-4 h-4 text-slate-500" /> Fișier cu fișier</div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Copiază fiecare fișier individual prin FTP. Mai lent, dar nu necesită acces la File Manager API.</p>
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button data-testid="cpanel-start-button" onClick={start} disabled={!dstValid || !chosen.length || running || starting}
                className="flex items-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
                {starting || running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? "Migrare în curs..." : `Migrează ${chosen.length} folder${chosen.length === 1 ? "" : "e"}`}
              </button>
              {running && (
                <button data-testid="cpanel-cancel-button" onClick={cancel}
                  className="flex items-center gap-2 text-sm font-semibold text-red-600 border border-red-200 rounded-xl px-5 py-3.5 transition-colors duration-200 hover:bg-red-50">
                  <Square className="w-4 h-4" /> Anulează
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress */}
        {job && (
          <motion.div data-testid="cpanel-progress" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {job.status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : job.status === "error" ? <XCircle className="w-5 h-5 text-red-600" />
                  : <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />}
                <span className="text-sm font-semibold text-slate-900">{statusLabel[job.status] || job.status}</span>
                {job.finished && job.duration_ms > 0 && (
                  <span data-testid="cpanel-duration" className="flex items-center gap-1 font-mono text-xs text-emerald-600 font-medium">
                    <Clock3 className="w-3.5 h-3.5" /> {(job.duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {job.current && <span className="flex items-center gap-1 font-mono text-xs text-slate-400 truncate max-w-xs"><Folder className="w-3.5 h-3.5" /> {job.current}</span>}
              </div>
              <div className="font-mono text-xs text-slate-500" data-testid="cpanel-progress-count">
                {isArchive ? (
                  <>
                    Folder {job.folders_done}/{job.folders_total}
                    {job.phase && ` · ${job.phase}`}
                    {job.bytes_total > 0 && <> · <HardDrive className="w-3 h-3 inline" /> {mb(job.bytes_done)}/{mb(job.bytes_total)} MB</>}
                  </>
                ) : (
                  <>
                    {job.done} / {job.total} fișiere · <HardDrive className="w-3 h-3 inline" /> {mb(job.done_bytes)}/{mb(job.total_bytes)} MB
                    {job.skipped > 0 && ` · ${job.skipped} sărite`}
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between font-mono text-xs text-slate-500 mb-2">
                <span>PROGRES</span><span data-testid="cpanel-progress-pct">{pct}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div data-testid="cpanel-progress-bar" className={`h-full rounded-full ${job.status === "error" ? "bg-red-500" : "bg-sky-500"}`}
                  animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
              </div>
            </div>
            <div className="mx-6 mb-6 bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 max-h-56 overflow-y-auto">
              <div className="flex items-center gap-2 text-slate-500 mb-2"><Terminal className="w-3.5 h-3.5" /> live log</div>
              {(job.logs || []).map((l, i) => <div key={i} className="leading-relaxed">{l}</div>)}
              {job.error && <div className="text-red-400 mt-1">{job.error}</div>}
              <div ref={logEndRef} />
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};
