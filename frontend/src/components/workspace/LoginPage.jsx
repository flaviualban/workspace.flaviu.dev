import { useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { KeyRound, Lock, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const LoginPage = ({ onSuccess }) => {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const cleaned = key.replace(/[^a-zA-Z0-9]/g, "");
  const ready = cleaned.length === 20;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API}/auth/verify`, { key: cleaned });
      if (res.data.valid) {
        onSuccess(cleaned);
      } else {
        setError("Cheie invalidă. Verifică cele 20 de caractere și încearcă din nou.");
      }
    } catch (err) {
      setError("Eroare de conexiune cu serverul. Reîncearcă.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid-bg bg-[#FAFAFA] flex items-center justify-center px-6 py-16 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-slate-200" />
      <div className="absolute top-8 left-8 font-mono text-xs tracking-widest text-slate-400 uppercase hidden sm:block">
        workspace.flaviu.dev
      </div>
      <div className="absolute top-8 right-8 flex items-center gap-2 font-mono text-xs tracking-widest text-slate-400 uppercase hidden sm:flex">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> secure gateway
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 mb-6">
            <KeyRound className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
          <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium">
            Flaviu Workspace
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">
            Acces securizat
          </h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            Introdu cheia de autorizare de 20 de caractere pentru a debloca panoul de utilitare.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-8 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)]"
        >
          <label className="font-mono text-xs tracking-widest text-slate-500 uppercase font-medium flex items-center gap-2 mb-3">
            <Lock className="w-3.5 h-3.5" /> Access Key
          </label>
          <div className="relative">
            <input
              data-testid="key-login-input"
              type="text"
              value={key}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setKey(e.target.value.slice(0, 24));
                setError("");
              }}
              placeholder="••••••••••••••••••••"
              className="w-full font-mono text-base tracking-[0.25em] text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 outline-none transition-colors duration-200 focus:border-sky-500 focus:bg-white placeholder:text-slate-300 placeholder:tracking-[0.2em]"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
              {cleaned.length}/20
            </div>
          </div>

          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-sky-500 rounded-full"
              animate={{ width: `${Math.min((cleaned.length / 20) * 100, 100)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              data-testid="key-login-error"
              className="text-sm text-red-600 mt-4 font-medium"
            >
              {error}
            </motion.p>
          )}

          <button
            data-testid="key-login-submit-button"
            type="submit"
            disabled={!ready || loading}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold text-sm rounded-lg px-5 py-3.5 transition-colors duration-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verific cheia...
              </>
            ) : (
              <>
                Deblochează Workspace <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Cheia este verificată securizat pe server. Nu o partaja.
          </div>
        </form>
      </motion.div>
    </div>
  );
};
