import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft, Lock, ShieldCheck, ShieldAlert, ShieldX, Search, Loader2,
  Calendar, KeyRound, Zap, Clock3, Server, Globe, CheckCircle2, XCircle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_META = {
  ok: { icon: ShieldCheck, cls: "text-emerald-600", bg: "bg-emerald-50", label: "Valid", bar: "bg-emerald-500" },
  expiring: { icon: ShieldAlert, cls: "text-amber-600", bg: "bg-amber-50", label: "Expiră curând", bar: "bg-amber-500" },
  expired: { icon: ShieldX, cls: "text-red-600", bg: "bg-red-50", label: "Expirat", bar: "bg-red-500" },
  untrusted: { icon: ShieldAlert, cls: "text-amber-600", bg: "bg-amber-50", label: "Neîncrezut", bar: "bg-amber-500" },
};

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};

const ResultCard = ({ r, i }) => {
  if (!r.ok) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
        data-testid={`ssl-card-${r.domain}`} className="bg-white border border-red-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <XCircle className="w-5 h-5 text-red-600" />
          <span className="font-mono text-sm font-bold text-slate-900">{r.domain}</span>
        </div>
        <p className="text-sm text-red-600">{r.error}</p>
      </motion.div>
    );
  }
  const meta = STATUS_META[r.status] || STATUS_META.ok;
  const Icon = meta.icon;
  const days = r.cert.days_left;
  const barPct = Math.max(0, Math.min((days / 90) * 100, 100));
  const conn = r.connection;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
      data-testid={`ssl-card-${r.domain}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="font-mono text-sm font-bold text-slate-900 truncate">{r.domain}</span>
          <span className="font-mono text-xs text-slate-400 hidden sm:inline">{r.ip}</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.cls}`}>
          <Icon className="w-3.5 h-3.5" /> {meta.label}
        </span>
      </div>

      <div className="px-6 py-5">
        {/* Expiry countdown */}
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-mono text-slate-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Expiră în</span>
          <span className={`font-mono font-semibold ${meta.cls}`} data-testid={`ssl-days-${r.domain}`}>
            {days < 0 ? `expirat de ${-days} zile` : `${days} zile`}
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${barPct}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <div className="text-slate-400 mb-0.5">Emis pentru</div>
            <div className="font-mono text-slate-800 truncate">{r.cert.subject_cn || "—"}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Emitent</div>
            <div className="font-mono text-slate-800 truncate">{r.cert.issuer_org || r.cert.issuer_cn || "—"}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Valid de la</div>
            <div className="font-mono text-slate-800">{fmtDate(r.cert.not_before)}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Valid până la</div>
            <div className="font-mono text-slate-800">{fmtDate(r.cert.not_after)}</div>
          </div>
        </div>

        {/* Connection facts */}
        <div className="flex flex-wrap gap-2 mt-5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
            <KeyRound className="w-3 h-3" /> {conn.tls_version}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full ${conn.http2 ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
            <Zap className="w-3 h-3" /> {conn.http2 ? "HTTP/2" : "HTTP/1.1"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
            <Clock3 className="w-3 h-3" /> {conn.handshake_ms} ms
          </span>
        </div>

        {r.cert.cipher && (
          <div className="mt-3 font-mono text-[11px] text-slate-400 truncate">cipher: {r.cert.cipher || conn.cipher}</div>
        )}

        {r.cert.sans?.length > 0 && (
          <details className="mt-3">
            <summary className="text-[11px] font-mono text-slate-500 cursor-pointer hover:text-slate-800">
              {r.cert.sans.length} domenii acoperite (SAN)
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.cert.sans.map((s) => (
                <span key={s} className="font-mono text-[10px] bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{s}</span>
              ))}
            </div>
          </details>
        )}
      </div>
    </motion.div>
  );
};

export const SslHealthPage = ({ onLock }) => {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const run = async (e) => {
    e?.preventDefault();
    const domains = input.split(/[\s,\n]+/).map((d) => d.trim()).filter(Boolean);
    if (!domains.length || loading) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const res = await axios.post(`${API}/tools/ssl/check`, { domains });
      setResults(res.data.results || []);
    } catch (err) {
      setError("Verificarea a eșuat. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button data-testid="ssl-back-button" onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-sky-600" /> SSL & Domain Health
          </div>
          <button data-testid="logout-lock-button" onClick={onLock}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900">
            <Lock className="w-3.5 h-3.5" /> Blochează
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <div className="mb-8">
          <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">Security</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Monitorizare SSL & Domenii</h1>
          <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
            Verifică certificatele SSL: expirare cu countdown, emitent, versiune TLS, suport HTTP/2, cipher, timp de handshake și validitatea lanțului. Poți introduce mai multe domenii deodată.
          </p>
        </div>

        <form onSubmit={run} className="flex flex-col sm:flex-row gap-3 mb-10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input data-testid="ssl-domain-input" value={input} autoFocus spellCheck={false}
              onChange={(e) => setInput(e.target.value)} placeholder="flaviu.dev, exemplu.ro, google.com"
              className="w-full font-mono text-sm text-slate-900 bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 outline-none transition-colors duration-200 focus:border-sky-500" />
          </div>
          <button data-testid="ssl-check-button" type="submit" disabled={loading || !input.trim()}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verific...</> : "Verifică"}
          </button>
        </form>

        {error && <div data-testid="ssl-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4 mb-6">{error}</div>}

        {loading && (
          <div className="flex items-center gap-3 text-slate-500 font-mono text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-sky-600" /> Inspectez certificatele SSL...
          </div>
        )}

        {results && (
          <div data-testid="ssl-results" className="grid md:grid-cols-2 gap-5">
            {results.map((r, i) => <ResultCard key={r.domain + i} r={r} i={i} />)}
          </div>
        )}

        {!results && !loading && !error && (
          <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-mono">Introdu unul sau mai multe domenii pentru a verifica certificatele SSL.</p>
          </div>
        )}
      </main>
    </div>
  );
};
