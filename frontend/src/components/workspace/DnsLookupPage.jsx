import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  Search, ArrowLeft, Loader2, Info, CheckCircle2, AlertTriangle, XCircle,
  Network, Clock, Lock,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS = {
  info: { icon: Info, cls: "text-sky-600", bg: "bg-sky-50", row: "" },
  ok: { icon: CheckCircle2, cls: "text-emerald-600", bg: "bg-emerald-50", row: "" },
  warn: { icon: AlertTriangle, cls: "text-amber-600", bg: "bg-amber-50", row: "bg-amber-50/40" },
  error: { icon: XCircle, cls: "text-red-600", bg: "bg-red-50", row: "bg-red-50/50" },
};

const CATEGORY_LABEL = {
  Parent: "Parent",
  NS: "NS",
  SOA: "SOA",
  MX: "MX",
  WWW: "WWW",
};

const IP_RE = /((?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4})/g;
const IP_TEST = /^(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4})$/;

const renderInfo = (text) => {
  const parts = String(text).split(IP_RE);
  return parts.map((p, i) =>
    IP_TEST.test(p) ? (
      <strong key={i} className="text-slate-900 font-semibold">{p}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
};

export const DnsLookupPage = ({ onLock }) => {
  const navigate = useNavigate();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const run = async (e) => {
    e?.preventDefault();
    const d = domain.trim();
    if (!d || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await axios.post(`${API}/tools/dns-lookup`, { domain: d });
      if (res.data.error) setError(res.data.error);
      else setResult(res.data);
    } catch (err) {
      setError("Analiza a eșuat. Verifică domeniul și încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button
            data-testid="dns-back-button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <Network className="w-4 h-4 text-sky-600" /> DNS Zone Lookup
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
            Network & Domain
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Interogare zonă DNS
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
            Introdu un domeniu pentru un raport complet: înregistrări Parent, NS, SOA, MX și WWW (A, TXT, CNAME) cu diagnostic pe fiecare verificare.
          </p>
        </div>

        <form onSubmit={run} className="flex flex-col sm:flex-row gap-3 mb-10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              data-testid="dns-domain-input"
              value={domain}
              autoFocus
              spellCheck={false}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="ex: flaviu.dev"
              className="w-full font-mono text-sm text-slate-900 bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 outline-none transition-colors duration-200 focus:border-sky-500"
            />
          </div>
          <button
            data-testid="dns-search-button"
            type="submit"
            disabled={loading || !domain.trim()}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizez...</> : <>Analizează</>}
          </button>
        </form>

        {error && (
          <div data-testid="dns-error" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-4 mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-slate-500 font-mono text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-sky-600" /> Interoghez serverele parent, NS, SOA, MX...
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              data-testid="dns-results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="font-mono text-sm font-bold text-slate-900">{result.domain}</div>
                <div className="font-mono text-xs text-slate-400">
                  Processed in {result.duration_ms} ms
                </div>
              </div>

              <div className="hidden sm:grid grid-cols-[110px_60px_200px_1fr] gap-4 px-6 py-3 border-b border-slate-200 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                <span>Category</span><span>Status</span><span>Test name</span><span>Information</span>
              </div>

              {result.categories.map((cat) =>
                cat.checks.map((chk, i) => {
                  const s = STATUS[chk.status] || STATUS.info;
                  const Icon = s.icon;
                  return (
                    <div
                      key={cat.name + i}
                      className={`grid grid-cols-1 sm:grid-cols-[110px_60px_200px_1fr] gap-2 sm:gap-4 px-6 py-4 border-b border-slate-100 last:border-0 ${s.row}`}
                    >
                      <div className="font-mono text-xs font-semibold text-slate-500">
                        {i === 0 ? CATEGORY_LABEL[cat.name] || cat.name : ""}
                      </div>
                      <div>
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${s.bg}`}>
                          <Icon className={`w-4 h-4 ${s.cls}`} />
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-800">{chk.test}</div>
                      <div className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line font-mono">
                        {renderInfo(chk.info)}
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!result && !loading && !error && (
          <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <Network className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-mono">Introdu un domeniu mai sus pentru a începe raportul DNS.</p>
          </div>
        )}
      </main>
    </div>
  );
};
