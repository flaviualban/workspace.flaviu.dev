import { useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "@/components/workspace/LoginPage";
import { LoadingScreen } from "@/components/workspace/LoadingScreen";
import { Dashboard } from "@/components/workspace/Dashboard";
import { DnsLookupPage } from "@/components/workspace/DnsLookupPage";
import { ImapSyncPage } from "@/components/workspace/ImapSyncPage";
import { CpanelMigratePage } from "@/components/workspace/CpanelMigratePage";

const STORAGE_KEY = "flaviu_workspace_key";

function App() {
  const [sessionKey, setSessionKey] = useState(() => sessionStorage.getItem(STORAGE_KEY) || "");
  const [phase, setPhase] = useState(() => (sessionStorage.getItem(STORAGE_KEY) ? "ready" : "login"));

  const handleSuccess = (key) => {
    setSessionKey(key);
    sessionStorage.setItem(STORAGE_KEY, key);
    setPhase("loading");
  };

  const handleLock = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionKey("");
    setPhase("login");
  };

  if (phase === "login") return <div className="App"><LoginPage onSuccess={handleSuccess} /></div>;
  if (phase === "loading") return <div className="App"><LoadingScreen onDone={() => setPhase("ready")} /></div>;

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard sessionKey={sessionKey} onLock={handleLock} />} />
          <Route path="/tools/dns" element={<DnsLookupPage sessionKey={sessionKey} onLock={handleLock} />} />
          <Route path="/tools/imap" element={<ImapSyncPage sessionKey={sessionKey} onLock={handleLock} />} />
          <Route path="/tools/cpanel" element={<CpanelMigratePage sessionKey={sessionKey} onLock={handleLock} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
