import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft, Lock, CalendarClock, Search, Loader2, Plus, Trash2,
  CheckCircle2, AlertTriangle, XCircle, Building2, Server, RefreshCw,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STORE = "flaviu_whois_domains";

const META = {
  ok: { cls: "text-emerald-600", bg: "bg-emerald-50", label: "OK", icon: CheckCircle2, bar: "bg-emerald-500" },
  soon: { cls: "text-sky-600", bg: "bg-sky-50", label: "< 60 zile", icon: CalendarClock, bar: "bg-sky-500" },
  expiring: { cls: "text-amber-600", bg: "bg-amber-50", label: "< 30 zile", icon: AlertTriangle, bar: "bg-amber-500" },
  expired: { cls: "text-red-600", bg: "bg-red-50", label: "Expirat", icon: XCircle, bar: "bg-red-500" },
};

const fmt = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};

export const WhoisPage = ({ onLock }) => {
  const navigate = useNavigate();
  const [domains, setDomains] = useState(() => JSON.parse(localStorage.getItem(STORE) || "[]"));
  const [input, setInput] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);

  const persist = (list) => { setDomains(list); localStorage.setItem(STORE, JSON.stringify(list)); };

  const query = async (list) => {
    if (!list.length) { setResults({}); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/tools/whois`, { domains: list });
      const map = {};
      (res.data.results || []).forEach((r) => { map[r.domain] = r; });
      setResults(map);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    query(domains);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = (e) => {
    e?.preventDefault();
    const parsed = input.split(/[\s,\n]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (!parsed.length) return;
    const merged = Array.from(new Set([...domains, ...parsed]));
    persist(merged);
    setInput("");
    query(merged);
  };

  const remove = (d) => {
    const next = domains.filter((x) => x !== d);
    persist(next);
    setResults((r) => { const c = { ...r }; delete c[d]; return c; });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button data-testid="whois-back-button" onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <CalendarClock className="w-4 h-4 text-sky-600" /> WHOIS / Domain Expiry
          </div>
          <button data-testid="logout-lock-button" onClick={onLock}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900">
            <Lock className="w-3.5 h-3.5" /> Blochează
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">Domain Registry</div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Expirare domenii (WHOIS)</h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
              Urmărește data de expirare, registrarul și nameserverele. Sub 30 de zile devine roșu. Lista ta e salvată local în browser — fără bază de date.
            </p>
          </div>
          {domains.length > 0 && (
            <button data-testid="whois-refresh" onClick={() => query(domains)} disabled={loading}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-2 transition-colors duration-200 hover:bg-slate-100 disabled:opacity-40 shrink-0">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Reîmprospătează
            </button>
          )}
        </div>

        <form onSubmit={add} className="flex flex-col sm:flex-row gap-3 mb-10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input data-testid="whois-input" value={input} spellCheck={false}
              onChange={(e) => setInput(e.target.value)} placeholder="adaugă domenii: flaviu.dev, exemplu.ro"
              className="w-full font-mono text-sm text-slate-900 bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 outline-none transition-colors duration-200 focus:border-sky-500" />
          </div>
          <button data-testid="whois-add-button" type="submit" disabled={!input.trim()}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> Adaugă
          </button>
        </form>

        {domains.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <CalendarClock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-mono">Adaugă domenii pentru a le urmări expirarea.</p>
          </div>
        ) : (
          <div data-testid="whois-results" className="grid md:grid-cols-2 gap-5">
            {domains.map((d, i) => {
              const r = results[d];
              const meta = r?.ok ? (META[r.status] || META.ok) : META.expired;
              const Icon = meta.icon;
              const days = r?.days_left;
              const barPct = days != null ? Math.max(0, Math.min((days / 365) * 100, 100)) : 0;
              return (
                <motion.div key={d} data-testid={`whois-card-${d}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden group">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <span className="font-mono text-sm font-bold text-slate-900 truncate">{d}</span>
                    <div className="flex items-center gap-2">
                      {r?.ok && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.cls}`}>
                          <Icon className="w-3.5 h-3.5" /> {meta.label}
                        </span>
                      )}
                      <button data-testid={`whois-remove-${d}`} onClick={() => remove(d)}
                        className="text-slate-300 hover:text-red-500 transition-colors duration-200">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="px-6 py-5">
                    {!r ? (
                      <div className="flex items-center gap-2 text-slate-400 text-sm font-mono"><Loader2 className="w-4 h-4 animate-spin" /> se încarcă...</div>
                    ) : !r.ok ? (
                      <p className="text-sm text-red-600">{r.error}</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-mono text-slate-500">Expiră</span>
                          <span className={`font-mono font-semibold ${meta.cls}`} data-testid={`whois-days-${d}`}>
                            {days == null ? "indisponibil" : days < 0 ? `expirat de ${-days} zile` : `în ${days} zile`}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                          <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${barPct}%` }} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                          <div>
                            <div className="text-slate-400 mb-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Registrar</div>
                            <div className="font-mono text-slate-800 truncate">{r.registrar || "—"}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 mb-0.5">Data expirării</div>
                            <div className="font-mono text-slate-800">{fmt(r.expires)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 mb-0.5">Înregistrat</div>
                            <div className="font-mono text-slate-800">{fmt(r.created)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 mb-0.5">Actualizat</div>
                            <div className="font-mono text-slate-800">{fmt(r.updated)}</div>
                          </div>
                        </div>
                        {r.nameservers?.length > 0 && (
                          <div className="mt-4">
                            <div className="text-slate-400 text-[11px] mb-1.5 flex items-center gap-1"><Server className="w-3 h-3" /> Nameservere</div>
                            <div className="flex flex-wrap gap-1.5">
                              {r.nameservers.map((ns) => (
                                <span key={ns} className="font-mono text-[10px] bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{ns}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.note && (
                          <p className="text-[11px] text-amber-600 mt-3 leading-relaxed">{r.note}</p>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
