import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft, Lock, Activity, Plus, Trash2, Loader2, Globe,
  ArrowUpCircle, ArrowDownCircle, Clock3, Gauge, RefreshCw,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STORE = "flaviu_uptime_targets";

export const UptimeMonitorPage = ({ onLock }) => {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const pollRef = useRef(null);

  const saveLocal = (list) => {
    localStorage.setItem(STORE, JSON.stringify(list.map((m) => ({ url: m.url, name: m.name }))));
  };

  const refresh = async () => {
    try {
      const res = await axios.get(`${API}/tools/uptime/monitors`);
      setMonitors(res.data.monitors || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      const local = JSON.parse(localStorage.getItem(STORE) || "[]");
      try {
        const res = await axios.post(`${API}/tools/uptime/sync`, { targets: local });
        setMonitors(res.data.monitors || []);
      } catch (e) { /* ignore */ }
      setLoading(false);
    })();
    pollRef.current = setInterval(refresh, 10000);
    return () => clearInterval(pollRef.current);
  }, []);

  const add = async (e) => {
    e?.preventDefault();
    if (!input.trim() || adding) return;
    setAdding(true);
    try {
      const res = await axios.post(`${API}/tools/uptime/monitors`, { url: input.trim() });
      if (res.data.monitor) {
        const next = [...monitors.filter((m) => m.id !== res.data.monitor.id), res.data.monitor];
        setMonitors(next);
        saveLocal(next);
        setInput("");
      }
    } catch (e) { /* ignore */ }
    finally { setAdding(false); }
  };

  const remove = async (id) => {
    await axios.delete(`${API}/tools/uptime/monitors/${id}`).catch(() => {});
    const next = monitors.filter((m) => m.id !== id);
    setMonitors(next);
    saveLocal(next);
  };

  const checkAll = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/tools/uptime/check`);
      setMonitors(res.data.monitors || []);
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button data-testid="uptime-back-button" onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Înapoi la panou
          </button>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900">
            <Activity className="w-4 h-4 text-sky-600" /> Uptime Monitor
          </div>
          <button data-testid="logout-lock-button" onClick={onLock}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900">
            <Lock className="w-3.5 h-3.5" /> Blochează
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">Availability</div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Uptime & Response Monitor</h1>
            <p className="text-sm text-slate-600 mt-3 max-w-xl leading-relaxed">
              Verificare automată HTTP(S) în fundal, la fiecare 5 minute, cu istoric și timp de răspuns. Lista e salvată local în browser.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-center gap-3 font-mono text-sm">
                <span className="text-emerald-600 font-semibold" data-testid="uptime-up-count">{upCount} UP</span>
                <span className="text-slate-300">·</span>
                <span className={`font-semibold ${downCount ? "text-red-600" : "text-slate-400"}`} data-testid="uptime-down-count">{downCount} DOWN</span>
              </div>
            </div>
            <button data-testid="uptime-check-all" onClick={checkAll} disabled={loading || !monitors.length}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-2 transition-colors duration-200 hover:bg-slate-100 disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Verifică acum
            </button>
          </div>
        </div>

        <form onSubmit={add} className="flex flex-col sm:flex-row gap-3 mb-10">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input data-testid="uptime-input" value={input} spellCheck={false}
              onChange={(e) => setInput(e.target.value)} placeholder="https://flaviu.dev"
              className="w-full font-mono text-sm text-slate-900 bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 outline-none transition-colors duration-200 focus:border-sky-500" />
          </div>
          <button data-testid="uptime-add-button" type="submit" disabled={!input.trim() || adding}
            className="flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-xl px-7 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Monitorizează
          </button>
        </form>

        {loading && !monitors.length ? (
          <div className="flex items-center gap-2 text-slate-400 font-mono text-sm"><Loader2 className="w-4 h-4 animate-spin" /> se încarcă...</div>
        ) : !monitors.length ? (
          <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-mono">Adaugă un URL pentru a începe monitorizarea.</p>
          </div>
        ) : (
          <div data-testid="uptime-list" className="space-y-4">
            {monitors.map((m, i) => {
              const up = m.status === "up";
              const pending = m.status === "pending";
              const hist = (m.history || []).slice(-40);
              const maxMs = Math.max(...hist.map((h) => h.ms || 0), 1);
              return (
                <motion.div key={m.id} data-testid={`uptime-card-${m.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className={`bg-white border rounded-2xl p-5 ${m.status === "down" ? "border-red-200" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      {pending ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                        : up ? <ArrowUpCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        : <ArrowDownCircle className="w-5 h-5 text-red-500 shrink-0" />}
                      <div className="min-w-0">
                        <a href={m.url} target="_blank" rel="noreferrer" className="font-mono text-sm font-semibold text-slate-900 hover:text-sky-600 truncate block">{m.url}</a>
                        <div className="font-mono text-[11px] text-slate-400">
                          {m.last_code ? `HTTP ${m.last_code}` : "—"} · {m.last_error ? <span className="text-red-500">{m.last_error}</span> : "ok"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-center">
                        <div className="flex items-center gap-1 font-mono text-sm font-semibold text-slate-900"><Gauge className="w-3.5 h-3.5 text-slate-400" /> {m.uptime_pct}%</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">uptime</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 font-mono text-sm font-semibold text-slate-900"><Clock3 className="w-3.5 h-3.5 text-slate-400" /> {m.last_ms ?? "—"}<span className="text-xs text-slate-400">ms</span></div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">răspuns</div>
                      </div>
                      <button data-testid={`uptime-remove-${m.id}`} onClick={() => remove(m.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors duration-200">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* history sparkline */}
                  {hist.length > 0 && (
                    <div className="mt-4 flex items-end gap-0.5 h-10" data-testid={`uptime-history-${m.id}`}>
                      {hist.map((h, idx) => (
                        <div key={idx} title={`${h.up ? "UP" : "DOWN"} · ${h.ms}ms · HTTP ${h.code}`}
                          className={`flex-1 rounded-sm transition-all duration-200 ${h.up ? "bg-emerald-400/70 hover:bg-emerald-500" : "bg-red-400 hover:bg-red-500"}`}
                          style={{ height: `${h.up ? Math.max((h.ms / maxMs) * 100, 12) : 100}%` }} />
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
