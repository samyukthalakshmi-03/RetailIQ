import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAnalysis } from "./context/AnalysisContext";

const DashboardPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.DashboardPage,
  })),
);
const UploadPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.UploadPage,
  })),
);
const CleaningPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.CleaningPage,
  })),
);
const RfmPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.RfmPage,
  })),
);
const CustomersPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.CustomersPage,
  })),
);
const InsightsPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.InsightsPage,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.ReportsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/WorkspacePages").then((pages) => ({
    default: pages.SettingsPage,
  })),
);

export default function App() {
  const { refreshHealth } = useAnalysis();
  useEffect(() => {
    refreshHealth().catch(() => undefined);
  }, [refreshHealth]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Suspense fallback={<div className="loading-view">Loading analytics…</div>}><DashboardPage /></Suspense>} />
        <Route path="upload" element={<Suspense fallback={<div className="loading-view">Loading upload…</div>}><UploadPage /></Suspense>} />
        <Route path="cleaning" element={<Suspense fallback={<div className="loading-view">Loading data quality…</div>}><CleaningPage /></Suspense>} />
        <Route path="rfm" element={<Suspense fallback={<div className="loading-view">Loading RFM analysis…</div>}><RfmPage /></Suspense>} />
        <Route path="customers" element={<Suspense fallback={<div className="loading-view">Loading customers…</div>}><CustomersPage /></Suspense>} />
        <Route path="insights" element={<Suspense fallback={<div className="loading-view">Loading customer insights…</div>}><InsightsPage /></Suspense>} />
        <Route path="insights/:customerId" element={<Suspense fallback={<div className="loading-view">Loading customer insights…</div>}><InsightsPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<div className="loading-view">Loading reports…</div>}><ReportsPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<div className="loading-view">Loading settings…</div>}><SettingsPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
