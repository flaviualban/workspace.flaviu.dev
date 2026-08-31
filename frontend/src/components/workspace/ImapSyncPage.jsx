import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft, Lock, MailCheck, Server, Loader2, Play, Square,
  CheckCircle2, XCircle, ArrowRight, Terminal, Folder, Clock3,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const emptyAccount = { host: "", port: 993, email: "", password: "", ssl: true };

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
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Server IMAP (host / IP)</label>
        <input
          data-testid={`${testPrefix}-host`}
          value={value.host}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, host: e.target.value })}
          placeholder="mail.exemplu.ro"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Port</label>
        <input
          data-testid={`${testPrefix}-port`}
          type="number"
          value={value.port}
          onChange={(e) => onChange({ ...value, port: e.target.value })}
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white"
        />
      </div>
      <div className="col-span-3">
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Adresă de email</label>
        <input
          data-testid={`${testPrefix}-email`}
          value={value.email}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          placeholder="user@exemplu.ro"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white"
        />
      </div>
      <div className="col-span-3">
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Parolă</label>
        <input
          data-testid={`${testPrefix}-password`}
          type="password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          placeholder="••••••••"
          className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white"
        />
      </div>
      <label className="col-span-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input
          data-testid={`${testPrefix}-ssl`}
          type="checkbox"
          checked={value.ssl}
          onChange={(e) => onChange({ ...value, ssl: e.target.checked })}
          className="accent-sky-600 w-4 h-4"
        />
        Conexiune SSL/TLS (port 993)
      </label>
    </div>
  </div>
);

export const ImapSyncPage = ({ onLock }) => {
  const navigate = useNavigate();
  const [source, setSource] = useState({ ...emptyAccount });
  const [dest, setDest] = useState({ ...emptyAccount });
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);

  const running = job && !job.finished && job.status !== "done" && job.status !== "error";

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/tools/imap/status/${jobId}`);
        setJob(res.data);
        if (res.data.finished) clearInterval(pollRef.current);
      } catch (e) {
        clearInterval(pollRef.current);
      }
    }, 1000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job?.logs?.length]);

  const valid = source.host && source.email && source.password && dest.host && dest.email && dest.password;

  const start = async () => {
    if (!valid || starting) return;
    setStarting(true);
    setError("");
    setJob(null);
    try {
      const payload = {
        source: { ...source, port: Number(source.port) || 993 },
        dest: { ...dest, port: Number(dest.port) || 993 },
      };
      const res = await axios.post(`${API}/tools/imap/start`, payload);
      setJobId(res.data.job_id);
    } catch (e) {
      setError("Nu am putut porni transferul.");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (jobId) await axios.post(`${API}/tools/imap/cancel/${jobId}`).catch(() => {});
  };

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const statusLabel = {
    queued: "În așteptare", connecting: "Conectare", counting: "Numărare mesaje",
    syncing: "Transfer în curs", done: "Finalizat", error: "Eroare",
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button
            data-testid="imap-back-button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <MailCheck className="w-4 h-4 text-sky-600" /> IMAP Mail Sync
          </div>
          <button
            data-testid="logout-lock-button"
            onClick={onLock}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <Lock className="w-3.5 h-3.5" /> Blochează
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <div className="mb-8">
          <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">
            Email Migration
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Transfer mailuri între 2 adrese
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
            Copiază toate folderele și mesajele dintr-o căsuță IMAP în alta, cu progres live. Parolele sunt folosite doar pentru conexiune și nu sunt stocate.
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_auto_1fr] items-stretch gap-4 mb-6">
          <AccountForm title="Contul sursă" label="SOURCE" value={source} onChange={setSource} testPrefix="imap-source" />
          <div className="hidden md:flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
          </div>
          <AccountForm title="Contul destinație" label="DESTINATION" value={dest} onChange={setDest} testPrefix="imap-dest" />
        </div>

        {error && (
          <div data-testid="imap-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4 mb-6">{error}</div>
        )}

        <div className="flex gap-3 mb-8">
          <button
            data-testid="imap-start-button"
            onClick={start}
            disabled={!valid || running || starting}
            className="flex items-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {starting || running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Transfer în curs..." : "Pornește transferul"}
          </button>
          {running && (
            <button
              data-testid="imap-cancel-button"
              onClick={cancel}
              className="flex items-center gap-2 text-sm font-semibold text-red-600 border border-red-200 rounded-xl px-5 py-3.5 transition-colors duration-200 hover:bg-red-50"
            >
              <Square className="w-4 h-4" /> Anulează
            </button>
          )}
        </div>

        {job && (
          <motion.div
            data-testid="imap-progress"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {job.status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : job.status === "error" ? <XCircle className="w-5 h-5 text-red-600" />
                  : <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />}
                <span className="text-sm font-semibold text-slate-900">
                  {statusLabel[job.status] || job.status}
                </span>
                {job.finished && job.duration_ms > 0 && (
                  <span data-testid="imap-duration" className="flex items-center gap-1 font-mono text-xs text-emerald-600 font-medium">
                    <Clock3 className="w-3.5 h-3.5" /> {(job.duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {job.current_folder && (
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-400">
                    <Folder className="w-3.5 h-3.5" /> {job.current_folder}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-slate-500" data-testid="imap-progress-count">
                {job.done} / {job.total} mesaje · {job.folders_total} foldere
                {job.skipped > 0 && ` · ${job.skipped} sărite`}
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-between font-mono text-xs text-slate-500 mb-2">
                <span>PROGRES</span>
                <span data-testid="imap-progress-pct">{pct}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  data-testid="imap-progress-bar"
                  className={`h-full rounded-full ${job.status === "error" ? "bg-red-500" : "bg-sky-500"}`}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            <div className="mx-6 mb-6 bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 max-h-56 overflow-y-auto">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Terminal className="w-3.5 h-3.5" /> live log
              </div>
              {(job.logs || []).map((l, i) => (
                <div key={i} className="leading-relaxed">{l}</div>
              ))}
              {job.error && <div className="text-red-400 mt-1">{job.error}</div>}
              <div ref={logEndRef} />
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};
