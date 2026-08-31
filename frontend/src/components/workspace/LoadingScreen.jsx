import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Terminal } from "lucide-react";

const STAGES = [
  "Verific checksum-ul criptografic al cheii...",
  "Conectare la agentul remote workspace.flaviu.dev...",
  "Încărcare modul DNS Zone Lookup (v2.4)...",
  "Inițializare IMAP Sync Engine & conector cPanel FTP...",
  "Workspace pregătit. Montez panoul de control...",
];

export const LoadingScreen = ({ onDone }) => {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total = 2200;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / total) * 100, 100);
      setProgress(pct);
      setStage(Math.min(Math.floor((pct / 100) * STAGES.length), STAGES.length - 1));
      if (elapsed >= total) {
        clearInterval(interval);
        setTimeout(onDone, 250);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div
      data-testid="loading-screen"
      className="min-h-screen grid-bg bg-[#FAFAFA] flex items-center justify-center px-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)]">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <div className="ml-3 flex items-center gap-2 font-mono text-xs text-slate-500">
              <Terminal className="w-3.5 h-3.5" /> boot@workspace.flaviu.dev
            </div>
          </div>

          <div className="p-6 font-mono text-sm space-y-2.5 min-h-[200px]">
            {STAGES.slice(0, stage + 1).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5"
              >
                {i < stage ? (
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <span className="text-sky-600 mt-0.5">$</span>
                )}
                <span className={i < stage ? "text-slate-500" : "text-slate-900"}>
                  {line}
                  {i === stage && <span className="blink-caret text-sky-600">▍</span>}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="px-6 pb-6">
            <div className="flex items-center justify-between font-mono text-xs text-slate-500 mb-2">
              <span>INITIALIZING</span>
              <span data-testid="loading-progress-value">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                data-testid="loading-progress-bar"
                className="h-full bg-sky-500 rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
