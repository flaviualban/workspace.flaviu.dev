import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TOOLS } from "./toolsData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Lock, ArrowUpRight, Activity, Wrench, Clock } from "lucide-react";

export const Dashboard = ({ sessionKey, onLock }) => {
  const [active, setActive] = useState(null);
  const navigate = useNavigate();
  const masked = sessionKey
    ? `${sessionKey.slice(0, 4)}${"•".repeat(12)}`
    : "••••••••••••••••";

  return (
    <div data-testid="workspace-dashboard" className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <header
        data-testid="workspace-header"
        className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30"
      >
        <div className="max-w-6xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-white" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <div className="font-mono text-sm font-bold text-slate-900">workspace.flaviu.dev</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SYSTEM OPERATIONAL
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-slate-500 bg-slate-100 rounded-full px-3 py-1.5">
              <Lock className="w-3 h-3" /> {masked}
            </div>
            <button
              data-testid="logout-lock-button"
              onClick={onLock}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full px-4 py-1.5 transition-colors duration-200 hover:bg-slate-900 hover:text-white hover:border-slate-900"
            >
              <Lock className="w-3.5 h-3.5" /> Blochează
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-6 lg:px-10 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <div className="font-mono text-xs tracking-widest text-sky-600 uppercase mb-3 font-medium flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Control Panel
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Salut, Flaviu.
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-lg leading-relaxed">
            Utilitarele tale de administrare server, într-un singur loc. Selectează un modul pentru a începe.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            const ready = tool.status === "Ready";
            return (
              <motion.button
                key={tool.id}
                data-testid={tool.testId}
                onClick={() => (tool.route ? navigate(tool.route) : setActive(tool))}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -4 }}
                className="group text-left bg-white border border-slate-200 rounded-2xl p-6 transition-colors duration-200 hover:border-slate-400 relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      ready ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
                      ready
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {ready ? "Ready" : (<><Clock className="w-2.5 h-2.5" /> Soon</>)}
                  </span>
                </div>
                <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase mb-2">
                  {tool.category}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-1.5">
                  {tool.title}
                  <ArrowUpRight className="w-4 h-4 text-slate-300 transition-colors duration-200 group-hover:text-sky-600" />
                </h3>
                <p className="text-[13px] text-slate-500 leading-relaxed mt-2">
                  {tool.description}
                </p>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-12 font-mono text-xs text-slate-400 border-t border-slate-200 pt-6 flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} flaviu.dev — private workspace</span>
          <span>{TOOLS.filter((t) => t.status === "Ready").length} module active / {TOOLS.length} total</span>
        </div>
      </main>

      {/* Tool detail modal */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg" data-testid="tool-detail-modal">
          {active && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                    <active.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-left">{active.title}</DialogTitle>
                    <div className="font-mono text-[10px] tracking-widest text-slate-400 uppercase mt-0.5">
                      {active.romanianTitle}
                    </div>
                  </div>
                </div>
              </DialogHeader>
              <p className="text-sm text-slate-600 leading-relaxed">{active.description}</p>
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 text-center">
                <Wrench className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <div className="font-mono text-xs tracking-widest text-slate-500 uppercase">
                  Funcționalitate în curând
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Interfața este pregătită. Logica acestui modul urmează în etapa următoare.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
