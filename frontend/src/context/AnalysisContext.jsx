import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  analyzeDataset,
  cleanDataset,
  fetchHealth,
  uploadDataset,
} from "../services/api";

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [filename, setFilename] = useState("");
  const [upload, setUpload] = useState(null);
  const [cleaning, setCleaning] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refreshHealth = useCallback(async () => {
    try {
      const result = await fetchHealth();
      setHealth(result);
      return result;
    } catch (issue) {
      setError(issue.message);
      throw issue;
    }
  }, []);

  const loadFile = useCallback(async (file) => {
    setBusy("upload");
    setError("");
    setDashboard(null);
    setCleaning(null);
    try {
      const result = await uploadDataset(file);
      setSessionId(result.session_id);
      setFilename(result.filename);
      setUpload(result);
      return result;
    } catch (issue) {
      setError(issue.message);
      throw issue;
    } finally {
      setBusy("");
    }
  }, []);

  const clean = useCallback(async () => {
    if (!sessionId) throw new Error("Upload a dataset first.");
    setBusy("clean");
    setError("");
    try {
      const result = await cleanDataset(sessionId);
      setCleaning(result);
      setDashboard(null);
      return result;
    } catch (issue) {
      setError(issue.message);
      throw issue;
    } finally {
      setBusy("");
    }
  }, [sessionId]);

  const analyze = useCallback(async () => {
    if (!sessionId) throw new Error("Upload a dataset first.");
    setBusy("analyze");
    setError("");
    try {
      const result = await analyzeDataset(sessionId);
      setDashboard(result);
      return result;
    } catch (issue) {
      setError(issue.message);
      throw issue;
    } finally {
      setBusy("");
    }
  }, [sessionId]);

  const value = useMemo(
    () => ({
      sessionId,
      filename,
      upload,
      cleaning,
      dashboard,
      health,
      busy,
      error,
      setError,
      refreshHealth,
      loadFile,
      clean,
      analyze,
    }),
    [
      sessionId,
      filename,
      upload,
      cleaning,
      dashboard,
      health,
      busy,
      error,
      refreshHealth,
      loadFile,
      clean,
      analyze,
    ],
  );
  return (
    <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error("useAnalysis must be used within AnalysisProvider.");
  return context;
}
