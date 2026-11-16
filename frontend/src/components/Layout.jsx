import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CircleHelp,
  Database,
  FileBarChart,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/upload", label: "Dataset upload", icon: Database },
  { to: "/cleaning", label: "Data cleaning", icon: Activity },
  { to: "/rfm", label: "RFM analysis", icon: BarChart3 },
  { to: "/customers", label: "Segmentation", icon: Users },
  { to: "/insights", label: "Customer insights", icon: Sparkles },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const { filename, health } = useAnalysis();
  const modelReady = health?.model?.available;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">R</span>
          <span>
            <strong>RetailIQ</strong>
            <small>Customer intelligence</small>
          </span>
        </NavLink>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `side-link${isActive ? " active" : ""}`
              }
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Segmentation" && (
                <span className="nav-count">
                  {health?.model?.available ? "2" : "—"}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className={`model-status ${modelReady ? "ready" : "missing"}`}>
          <span className="status-dot" />
          <span>
            <strong>{modelReady ? (health.model.compatibility_warning ? "Model loaded · version warning" : "Model connected") : "Model not installed"}</strong>
            <small>
              {modelReady
                ? (health.model.compatibility_warning ? "See model setup details" : "Original fitted model")
                : "Add exported artifacts to begin"}
            </small>
          </span>
        </div>
        <a
          className="help-link"
          href="https://github.com/samyukthalakshmi-03/RetailIQ"
          target="_blank"
          rel="noreferrer"
        >
          <CircleHelp size={16} /> Project information
        </a>
        <div className="sidebar-foot">
          <span className="avatar">RI</span>
          <span>
            <strong>RetailIQ workspace</strong>
            <small>{filename || "Local analysis"}</small>
          </span>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-crumb">Analytics workspace</div>
          <div className="topbar-right">
            <span className={`connection ${modelReady ? "online" : ""}`}>
              <span className="status-dot" />
              {modelReady ? "API connected" : "Model setup required"}
            </span>
            <span className="avatar small">RI</span>
          </div>
        </header>
        <div className="page-shell">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
