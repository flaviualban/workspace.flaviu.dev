import { useState, useEffect } from "react";
import "@/App.css";
import { LoginPage } from "@/components/workspace/LoginPage";
import { LoadingScreen } from "@/components/workspace/LoadingScreen";
import { Dashboard } from "@/components/workspace/Dashboard";

const STORAGE_KEY = "flaviu_workspace_key";

function App() {
  const [stage, setStage] = useState("login"); // login | loading | dashboard
  const [sessionKey, setSessionKey] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSessionKey(stored);
      setStage("dashboard");
    }
  }, []);

  const handleSuccess = (key) => {
    setSessionKey(key);
    sessionStorage.setItem(STORAGE_KEY, key);
    setStage("loading");
  };

  const handleLock = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionKey("");
    setStage("login");
  };

  return (
    <div className="App">
      {stage === "login" && <LoginPage onSuccess={handleSuccess} />}
      {stage === "loading" && <LoadingScreen onDone={() => setStage("dashboard")} />}
      {stage === "dashboard" && <Dashboard sessionKey={sessionKey} onLock={handleLock} />}
    </div>
  );
}

export default App;
