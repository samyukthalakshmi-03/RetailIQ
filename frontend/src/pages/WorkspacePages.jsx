import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Database,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAnalysis } from "../context/AnalysisContext";
import {
  downloadReport,
  fetchCustomer,
  fetchCustomers,
  API_BASE,
} from "../services/api";

const COLORS = ["#3973d6", "#9aa9bd", "#6f8eae", "#c5d0dc"];
const CURRENCY = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const NUMBER = new Intl.NumberFormat("en-GB");
const money = (value) => CURRENCY.format(Number(value) || 0);
const count = (value) => NUMBER.format(Number(value) || 0);
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function Panel({ title, subtitle, action, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function ModelCompatibilityNotice({ health }) {
  if (!health?.model?.available || !health.model.compatibility_warning) return null;
  return (
    <div className="notice warning-notice">
      <CircleAlert size={18} />
      <span>{health.model.compatibility_warning}</span>
      <Link to="/settings" className="notice-link">
        Compatibility details <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, accent }) {
  return (
    <article className="stat-card">
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className={`stat-icon ${accent || ""}`}>
        <Icon size={19} strokeWidth={1.8} />
      </span>
    </article>
  );
}

function EmptyState({ title = "No analysis yet", detail, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BarChart3 size={22} />
      </span>
      <h2>{title}</h2>
      <p>{detail || "Upload your transaction data to see real customer insights here."}</p>
      {action || (
        <Link className="button primary" to="/upload">
          Upload a dataset <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="notice error-notice" role="alert">
      <CircleAlert size={18} />
      <span>{message}</span>
      {onDismiss && (
        <button className="icon-button" aria-label="Dismiss error" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function distribution(values, field, size = 10) {
  if (!values?.length) return [];
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return [];
  const max = Math.max(...numeric);
  const step = max > 0 ? Math.max(1, Math.ceil(max / size)) : 1;
  const buckets = new Map();
  numeric.forEach((value) => {
    const start = Math.floor(value / step) * step;
    buckets.set(start, (buckets.get(start) || 0) + 1);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([start, customers]) => ({
      [field]: `${count(start)}–${count(start + step)}`,
      customers,
    }));
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label ?? payload[0].name}</strong>
      <span>{count(payload[0].value)} customers</span>
    </div>
  );
}

function getProfiles(report) {
  return report?.cluster_profiles || [];
}

export function DashboardPage() {
  const { dashboard, filename, cleaning, health } = useAnalysis();
  if (!dashboard) {
    return (
      <>
        <PageHeading
          eyebrow="OVERVIEW"
          title="Good data, clearer decisions."
          description="Turning retail transactions into customer intelligence."
        />
        <ModelCompatibilityNotice health={health} />
        <div className="welcome-strip">
          <span className="welcome-mark">
            <Activity size={21} />
          </span>
          <div>
            <strong>Your analytics workspace is ready</strong>
            <p>
              Upload a retail transaction CSV to clean, analyse and explore
              your actual customer segments.
            </p>
          </div>
          <Link className="button primary" to="/upload">
            Get started <ArrowRight size={16} />
          </Link>
        </div>
        {!health?.model?.available && (
          <div className="notice warning-notice">
            <CircleAlert size={18} />
            <span>
              The original fitted model is not available yet. Install the two
              exported Joblib files before running customer segmentation.
            </span>
            <Link to="/settings" className="notice-link">
              Setup instructions <ArrowRight size={14} />
            </Link>
          </div>
        )}
        {cleaning && (
          <div className="notice success-notice">
            <CheckCircle2 size={18} />
            <span>Dataset cleaned: {count(cleaning.summary.cleaned_rows)} transaction records are ready for analysis.</span>
          </div>
        )}
        <div className="empty-dashboard-grid">
          <div className="empty-dashboard-card">
            <span className="placeholder-icon"><Users size={20} /></span>
            <strong>Customer segments</strong>
            <p>Cluster sizes and customer profiles from your analysis.</p>
          </div>
          <div className="empty-dashboard-card">
            <span className="placeholder-icon"><TrendingUp size={20} /></span>
            <strong>Purchase behaviour</strong>
            <p>Recency, purchase frequency and monetary distributions.</p>
          </div>
          <div className="empty-dashboard-card">
            <span className="placeholder-icon"><FileBarChart size={20} /></span>
            <strong>Exportable reports</strong>
            <p>Cleaned records, customer assignments and cluster profiles.</p>
          </div>
        </div>
        <p className="footnote">No example or simulated analytics are shown.</p>
      </>
    );
  }

  const profiles = getProfiles(dashboard);
  const metrics = dashboard.metrics;
  const highestRevenue = [...profiles].sort(
    (left, right) => right.cluster_revenue - left.cluster_revenue,
  )[0];
  const distributions = [
    { title: "Recency", field: "days", data: distribution(dashboard.recency_distribution, "days") },
    { title: "Frequency", field: "invoices", data: distribution(dashboard.frequency_distribution, "invoices") },
    { title: "Monetary", field: "spend", data: distribution(dashboard.monetary_distribution, "spend") },
  ];

  return (
    <>
      <PageHeading
        eyebrow="OVERVIEW"
        title="Analytics overview"
        description={`Actual transaction and customer results for ${filename || dashboard.source_filename}.`}
        action={
          <div className="heading-actions">
            <span className="date-chip"><Clock3 size={14} /> As of {dateLabel(dashboard.analysis_reference_date)}</span>
            <Link to="/reports" className="button secondary">Export report <ArrowDownToLine size={15} /></Link>
          </div>
        }
      />
      <ModelCompatibilityNotice health={health} />
      <div className="stats-grid">
        <StatCard label="Total customers" value={count(metrics.total_customers)} detail="Unique identified customers" icon={Users} />
        <StatCard label="Sales transactions" value={count(metrics.total_transactions)} detail={`${count(metrics.product_sales_rows)} eligible product-sale rows`} icon={FileSpreadsheet} />
        <StatCard label="Product revenue" value={money(metrics.total_revenue)} detail="Positive product sales only" icon={TrendingUp} accent="blue" />
        <StatCard label="Average customer spend" value={money(metrics.average_customer_spending)} detail="Mean customer RFM monetary value" icon={BarChart3} />
      </div>

      <div className="dashboard-grid">
        <Panel title="Customer distribution" subtitle="Actual customer counts from model predictions" className="panel-chart">
          <div className="chart-wrap pie-wrap">
            <ResponsiveContainer width="100%" height={246}>
              <PieChart>
                <Pie data={dashboard.customer_distribution} dataKey="value" nameKey="name" innerRadius={66} outerRadius={94} paddingAngle={3} stroke="none">
                  {dashboard.customer_distribution.map((item, index) => <Cell key={item.cluster} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [count(value), name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-center">
              <strong>{count(metrics.total_customers)}</strong>
              <span>customers</span>
            </div>
          </div>
          <div className="legend-list">
            {profiles.map((profile, index) => (
              <div className="legend-row" key={profile.cluster}>
                <span className="legend-dot" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span>{profile.segment_name}</span>
                <strong>{profile.customer_percentage}%</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Cluster comparison" subtitle="Average RFM metrics in their original units" className="panel-chart">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={276}>
              <BarChart data={profiles} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="segment_name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(_, index) => `Cluster ${profiles[index]?.cluster ?? ""}`} />
                <YAxis yAxisId="activity" tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="spend" orientation="right" tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} tickFormatter={(value) => `£${count(value)}`} />
                <Tooltip formatter={(value, name) => [String(name).includes("Monetary") ? money(value) : count(value), name]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Bar yAxisId="activity" dataKey="average_frequency" name="Frequency (invoices)" fill="#3973d6" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="activity" dataKey="average_recency" name="Recency (days)" fill="#9aa9bd" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="spend" dataKey="average_monetary" name="Monetary (£)" fill="#7ca991" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="distribution-grid">
        {distributions.map((item) => (
          <Panel key={item.title} title={`${item.title} distribution`} subtitle="Binned from actual customer RFM values">
            <ResponsiveContainer width="100%" height={186}>
              <BarChart data={item.data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey={item.field} tick={{ fontSize: 9, fill: "#78869a" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="customers" fill="#7399d5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        ))}
      </div>

      <Panel title="Customer segmentation map" subtitle="The original notebook's log-Frequency versus log-Monetary view; point colours are original-model cluster assignments." className="panel-chart">
        <ResponsiveContainer width="100%" height={310}>
          <ScatterChart margin={{ top: 10, right: 18, left: 3, bottom: 8 }}>
            <CartesianGrid stroke="#edf0f4" />
            <XAxis type="number" dataKey="log_frequency" name="Log frequency" tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} label={{ value: "Log_Frequency · log1p(invoices)", position: "insideBottom", offset: -3, fontSize: 10, fill: "#8491a2" }} />
            <YAxis type="number" dataKey="log_monetary" name="Log monetary" tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value, name) => [Number(value).toFixed(3), name]} />
            {profiles.map((profile, index) => (
              <Scatter
                key={profile.cluster}
                name={`Cluster ${profile.cluster}`}
                data={dashboard.scatter_points.filter((point) => point.cluster === profile.cluster)}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={0.55}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Customer segments" subtitle="Observed cluster profiles; descriptions are derived from this upload's measured averages" className="table-panel">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Cluster</th><th>Customers</th><th>Share</th><th>Avg. recency</th><th>Avg. frequency</th><th>Avg. monetary</th><th>Revenue share</th></tr></thead>
            <tbody>{profiles.map((profile, index) => (
              <tr key={profile.cluster}>
                <td><span className="cluster-chip"><i style={{ background: COLORS[index % COLORS.length] }} />Cluster {profile.cluster}</span><small className="cell-caption">{profile.segment_name}</small></td>
                <td>{count(profile.customer_count)}</td><td>{profile.customer_percentage}%</td><td>{count(profile.average_recency)} days</td><td>{profile.average_frequency.toFixed(2)}</td><td>{money(profile.average_monetary)}</td><td>{profile.revenue_percentage.toFixed(2)}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>

      <div className="notice insight-notice">
        <Sparkles size={18} />
        <span>
          <strong>Observed insight:</strong> {highestRevenue?.segment_name} contributes{" "}
          {highestRevenue?.revenue_percentage.toFixed(1)}% of measured product
          sales revenue. This is a descriptive finding from the uploaded data.
        </span>
      </div>
      <p className="footnote">
        Recorded training silhouette score: {dashboard.training_evaluation.score} (clustering evaluation, not accuracy).
      </p>
    </>
  );
}

export function UploadPage() {
  const { upload, busy, error, setError, loadFile, health } = useAnalysis();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const navigate = useNavigate();

  async function submit(file) {
    setLocalError("");
    if (!file) return;
    try {
      await loadFile(file);
    } catch (issue) {
      setLocalError(issue.message);
    }
  }

  return (
    <>
      <PageHeading eyebrow="DATA WORKSPACE" title="Upload transactions" description="Start with a retail CSV. The original notebook's cleaning decisions remain transparent and reproducible." />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      <div className="upload-layout">
        <div>
          <Panel title="Add a dataset" subtitle="CSV only · up to 64 MB · 600,000 rows">
            <label
              className={`drop-zone${dragging ? " dragging" : ""}${busy === "upload" ? " disabled" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); submit(event.dataTransfer.files[0]); }}
            >
              <input type="file" accept=".csv,text/csv" onChange={(event) => submit(event.target.files?.[0])} />
              <span className="drop-icon"><Upload size={23} /></span>
              <strong>{busy === "upload" ? "Validating your dataset…" : "Drop your transaction CSV here"}</strong>
              <span>or choose a file from your computer</span>
              <span className="button secondary browse-button">Choose CSV</span>
              <small>Required fields: InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice, CustomerID, Country</small>
            </label>
          </Panel>
          {upload && (
            <Panel title="Dataset preview" subtitle={`${upload.filename} · ${count(upload.quality.rows)} rows · ${upload.quality.columns} columns`} className="table-panel preview-panel">
              <div className="table-scroll">
                <table>
                  <thead><tr>{upload.quality.column_names.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>{upload.preview.map((row, index) => <tr key={index}>{upload.quality.column_names.map((column) => <td key={column}>{row[column] == null ? <span className="muted">Missing</span> : String(row[column])}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="panel-footer">
                <span>{count(upload.quality.duplicate_rows)} exact duplicate rows detected · {count(Object.values(upload.quality.missing_values).reduce((a, b) => a + b, 0))} missing cells</span>
                <button className="button primary" onClick={() => navigate("/cleaning")}>Review data quality <ArrowRight size={15} /></button>
              </div>
            </Panel>
          )}
        </div>
        <aside className="upload-aside">
          <Panel title="Before you upload">
            <ul className="check-list">
              <li><Check size={16} /> One row per transaction line</li>
              <li><Check size={16} /> Use the original Online Retail column names</li>
              <li><Check size={16} /> Dates parseable as InvoiceDate</li>
              <li><Check size={16} /> Quantity and UnitPrice are numeric</li>
            </ul>
          </Panel>
          <div className="model-callout">
            <ShieldCheck size={19} />
            <strong>{health?.model?.available ? "Original model ready" : "Original model required"}</strong>
            <p>{health?.model?.available ? "Segmentation will use your exported fitted scaler and K-Means model." : "RetailIQ never retrains or substitutes the notebook's model."}</p>
            {!health?.model?.available && <Link to="/settings">View setup instructions <ArrowRight size={14} /></Link>}
          </div>
        </aside>
      </div>
    </>
  );
}

export function CleaningPage() {
  const { upload, cleaning, busy, error, setError, clean } = useAnalysis();
  const [localError, setLocalError] = useState("");
  const navigate = useNavigate();
  async function runCleaning() {
    setLocalError("");
    try { await clean(); } catch (issue) { setLocalError(issue.message); }
  }

  return (
    <>
      <PageHeading eyebrow="DATA WORKSPACE" title="Data cleaning" description="Inspect quality signals, then apply the same duplicate and description logic as the original notebook." />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      {!upload ? <EmptyState title="Upload a dataset first" detail="Dataset quality and cleaning impact appear here after you upload transaction data." /> : (
        <>
          <div className="dataset-banner"><span className="file-icon"><FileSpreadsheet size={19} /></span><span><strong>{upload.filename}</strong><small>{count(upload.quality.rows)} input records · {upload.quality.columns} columns</small></span><span className="badge neutral">CSV validated</span></div>
          <div className="quality-grid">
            <div className="quality-card"><span>Exact duplicates</span><strong>{count(upload.quality.duplicate_rows)}</strong><small>Identical transaction rows</small></div>
            <div className="quality-card"><span>Missing descriptions</span><strong>{count(upload.quality.missing_values.Description || 0)}</strong><small>Resolved only when StockCode is unambiguous</small></div>
            <div className="quality-card"><span>Missing customer IDs</span><strong>{count(upload.quality.missing_values.CustomerID || 0)}</strong><small>Retained; excluded from customer RFM</small></div>
            <div className="quality-card"><span>Returns / cancellations</span><strong>{count(upload.quality.negative_quantity_rows + upload.quality.cancellation_rows)}</strong><small>Kept in cleaned transactions</small></div>
          </div>
          <Panel title="Cleaning decisions" subtitle="Transaction records are preserved; RFM eligibility uses the original notebook filters.">
            <div className="decision-list">
              <div><span className="decision-index">01</span><div><strong>Remove exact duplicate rows</strong><p>Only identical rows are dropped. Conflicting or unusual transactions are not silently discarded.</p></div></div>
              <div><span className="decision-index">02</span><div><strong>Recover only unambiguous descriptions</strong><p>Fill missing Description using StockCode only when the code has exactly one observed description.</p></div></div>
              <div><span className="decision-index">03</span><div><strong>Keep special records in the clean export</strong><p>Cancellation invoices, returns, zero-price lines, negative-price entries and unknown customer IDs remain available.</p></div></div>
              <div><span className="decision-index">04</span><div><strong>Apply notebook sale filters for RFM</strong><p>RFM excludes cancellation invoices, non-positive Quantity or UnitPrice, five named non-product charges, and missing CustomerID.</p></div></div>
            </div>
            {!cleaning ? (
              <div className="panel-footer">
                <span>Cleaning applies to this in-memory session only.</span>
                <button className="button primary" onClick={runCleaning} disabled={busy === "clean"}>{busy === "clean" ? "Cleaning…" : "Clean dataset"} <ArrowRight size={15} /></button>
              </div>
            ) : (
              <>
                <div className="comparison-grid">
                  <div><span>Original rows</span><strong>{count(cleaning.summary.original_rows)}</strong></div>
                  <div><span>Cleaned rows</span><strong>{count(cleaning.summary.cleaned_rows)}</strong></div>
                  <div><span>Duplicates removed</span><strong>{count(cleaning.summary.duplicate_rows_removed)}</strong></div>
                  <div><span>Descriptions recovered</span><strong>{count(cleaning.summary.missing_descriptions_recovered)}</strong></div>
                  <div><span>Descriptions still missing</span><strong>{count(cleaning.summary.remaining_missing_descriptions)}</strong></div>
                  <div><span>Customer IDs still missing</span><strong>{count(cleaning.summary.remaining_missing_customer_ids)}</strong></div>
                  <div><span>Rows eligible for RFM</span><strong>{count(cleaning.summary.product_sales_rows_with_customer_id)}</strong></div>
                  <div><span>Rows excluded from RFM</span><strong>{count(cleaning.summary.cleaned_rows - cleaning.summary.product_sales_rows_with_customer_id)}</strong></div>
                </div>
                <div className="panel-footer">
                  <a className="button secondary" href={`${API_BASE}/api/reports/${upload.session_id}/cleaned.csv`}><ArrowDownToLine size={15} /> Download cleaned CSV</a>
                  <button className="button primary" onClick={() => navigate("/rfm")}>Continue to RFM <ArrowRight size={15} /></button>
                </div>
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

export function RfmPage() {
  const { upload, cleaning, dashboard, busy, error, setError, analyze, health } = useAnalysis();
  const [localError, setLocalError] = useState("");
  async function run() {
    setLocalError("");
    try { await analyze(); } catch (issue) { setLocalError(issue.message); }
  }
  if (!upload) return <><PageHeading eyebrow="CUSTOMER ANALYSIS" title="RFM analysis" description="Customer recency, invoice frequency and purchase value." /><EmptyState title="Upload transactions to begin" /></>;
  if (!cleaning) return <><PageHeading eyebrow="CUSTOMER ANALYSIS" title="RFM analysis" description="Customer recency, invoice frequency and purchase value." /><EmptyState title="Clean the dataset first" detail="RFM calculations use the notebook's cleaned, positive product sales." action={<Link className="button primary" to="/cleaning">Review data cleaning <ArrowRight size={15} /></Link>} /></>;
  const profiles = dashboard?.cluster_profiles || [];
  const rfmRows = dashboard?.customers || [];
  const columns = [
    { title: "Recency (days)", key: "Recency", values: dashboard?.recency_distribution },
    { title: "Frequency (invoices)", key: "Frequency", values: dashboard?.frequency_distribution },
    { title: "Monetary (£)", key: "Monetary", values: dashboard?.monetary_distribution },
  ];

  return (
    <>
      <PageHeading eyebrow="CUSTOMER ANALYSIS" title="RFM analysis" description="Features are generated from notebook-filtered product sales. The model's fitted scaler and exact feature order are retained." />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      {!dashboard ? (
        <div className="model-gate">
          <span className="model-gate-icon"><Layers3 size={22} /></span>
          <div><strong>Ready to calculate RFM and segment customers</strong><p>{count(cleaning.summary.product_sales_rows_with_customer_id)} eligible product-sale rows are prepared. Segmentation requires the original fitted model.</p></div>
          <button className="button primary" onClick={run} disabled={busy === "analyze" || !health?.model?.available}>{busy === "analyze" ? "Running original model…" : "Run RFM analysis"} <ArrowRight size={15} /></button>
        </div>
      ) : (
        <>
          <div className="notice success-notice"><CheckCircle2 size={18} /><span>Segmentation completed using the original fitted model · Reference date: {dateLabel(dashboard.analysis_reference_date)}</span></div>
          <div className="rfm-summary-grid">{profiles.map((profile) => <div key={profile.cluster} className="rfm-summary"><span className="cluster-chip"><i style={{ background: COLORS[profile.cluster % COLORS.length] }} />Cluster {profile.cluster}</span><strong>{count(profile.customer_count)} customers</strong><small>Average R {profile.average_recency.toFixed(2)} days · F {profile.average_frequency.toFixed(2)} invoices · M {money(profile.average_monetary)}</small></div>)}</div>
          <div className="distribution-grid">{columns.map((item) => (
            <Panel key={item.key} title={`${item.title} distribution`} subtitle="Actual customer-level values">
              <ResponsiveContainer width="100%" height={205}>
                <BarChart data={distribution(item.values, item.key, 12)} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey={item.key} tick={{ fontSize: 9, fill: "#78869a" }} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10, fill: "#78869a" }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="customers" fill="#658bcc" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          ))}</div>
          <Panel title="Customer-level RFM values" subtitle={`${count(rfmRows.length)} customers · full customer assignments are available in Segmentation`} className="table-panel">
            <div className="table-scroll"><table><thead><tr><th>Customer ID</th><th>Recency (days)</th><th>Frequency (invoices)</th><th>Monetary</th><th>Cluster</th></tr></thead><tbody>{rfmRows.slice(0, 12).map((customer) => <tr key={customer.CustomerID}><td>{customer.CustomerID}</td><td>{count(customer.Recency)}</td><td>{count(customer.Frequency)}</td><td>{money(customer.Monetary)}</td><td><span className="badge cluster-badge">Cluster {customer.Cluster}</span></td></tr>)}</tbody></table></div>
          </Panel>
        </>
      )}
    </>
  );
}

export function CustomersPage() {
  const { sessionId, dashboard, error, setError } = useAnalysis();
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState("");
  const [sortBy, setSortBy] = useState("monetary");
  const [descending, setDescending] = useState(true);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const profiles = dashboard?.cluster_profiles || [];

  useEffect(() => {
    if (!sessionId || !dashboard) return;
    let active = true;
    setLoading(true);
    fetchCustomers(sessionId, { search, cluster, sort_by: sortBy, descending, offset, limit: 500 })
      .then((response) => {
        if (active) {
          setResult((previous) =>
            offset && previous
              ? { ...response, customers: [...previous.customers, ...response.customers] }
              : response,
          );
        }
      })
      .catch((issue) => { if (active) setLocalError(issue.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, dashboard, search, cluster, sortBy, descending, offset]);

  if (!dashboard) return <><PageHeading eyebrow="CUSTOMER DIRECTORY" title="Customer segmentation" description="Search customer-level RFM metrics and original-model assignments." /><EmptyState title="Run an analysis to explore customers" /></>;
  const customers = result?.customers || [];
  return (
    <>
      <PageHeading eyebrow="CUSTOMER DIRECTORY" title="Customer segmentation" description={`${count(result?.total || 0)} matching customers · assignments from the notebook's fitted K-Means model.`} action={<a className="button secondary" href={`${API_BASE}/api/reports/${sessionId}/customers.csv`}><ArrowDownToLine size={15} /> Export customers</a>} />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      <div className="filter-toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search customer ID" /></label>
        <label className="select-field"><Filter size={15} /><select value={cluster} onChange={(event) => { setOffset(0); setCluster(event.target.value); }}><option value="">All clusters</option>{profiles.map((item) => <option key={item.cluster} value={item.cluster}>Cluster {item.cluster}</option>)}</select><ChevronDown size={14} /></label>
        <label className="select-field"><span className="sort-label">Sort by</span><select value={sortBy} onChange={(event) => { setOffset(0); setSortBy(event.target.value); }}><option value="monetary">Monetary value</option><option value="frequency">Frequency</option><option value="recency">Recency</option><option value="customer_id">Customer ID</option></select><ChevronDown size={14} /></label>
        <button className="button secondary compact" onClick={() => { setOffset(0); setDescending(!descending); }}>{descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />}{descending ? "Highest first" : "Lowest first"}</button>
      </div>
      <Panel title="Customers" subtitle={loading ? "Updating results…" : `${count(customers.length)} displayed · sorted by ${sortBy.replace("_", " ")}`} className="table-panel">
        <div className="table-scroll customer-table">
          <table><thead><tr><th>Customer ID</th><th>Recency</th><th>Frequency</th><th>Monetary</th><th>Cluster</th><th>Segment description</th><th /></tr></thead>
            <tbody>{customers.map((customer) => {
              const profile = profiles.find((item) => item.cluster === customer.Cluster);
              return <tr key={customer.CustomerID}><td className="id-cell">{customer.CustomerID}</td><td>{count(customer.Recency)} days</td><td>{count(customer.Frequency)} invoices</td><td className="amount-cell">{money(customer.Monetary)}</td><td><span className="badge cluster-badge">Cluster {customer.Cluster}</span></td><td>{profile?.segment_name || "Observed RFM profile"}</td><td><Link aria-label={`View customer ${customer.CustomerID}`} className="table-action" to={`/insights/${customer.CustomerID}`}><ArrowRight size={16} /></Link></td></tr>;
            })}</tbody>
          </table>
          {!customers.length && !loading && <div className="table-empty">No customers match the selected filters.</div>}
        </div>
      </Panel>
      {customers.length < (result?.total || 0) && <div className="panel-footer"><span>Showing {count(customers.length)} of {count(result?.total || 0)} matching customers.</span><button className="button secondary" onClick={() => setOffset(offset + 500)} disabled={loading}>{loading ? "Loading…" : "Load more customers"} <ArrowDown size={14} /></button></div>}
    </>
  );
}

export function InsightsPage() {
  const { customerId } = useParams();
  const { sessionId, dashboard } = useAnalysis();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState("");
  const profiles = dashboard?.cluster_profiles || [];
  useEffect(() => {
    if (!sessionId || !dashboard || !customerId) return;
    let active = true;
    fetchCustomer(sessionId, customerId)
      .then((result) => { if (active) setCustomer(result); })
      .catch((issue) => { if (active) setError(issue.message); });
    return () => { active = false; };
  }, [sessionId, dashboard, customerId]);

  if (!dashboard) return <><PageHeading eyebrow="CUSTOMER INTELLIGENCE" title="Customer insights" description="Understand customer behaviour through actual RFM metrics." /><EmptyState title="Customer insights need an analysis" /></>;
  if (!customerId) {
    return (
      <>
        <PageHeading eyebrow="CUSTOMER INTELLIGENCE" title="Customer insights" description="Cluster descriptions are derived from the observed profile for this dataset. Marketing ideas are separate business suggestions, not model outputs." />
        <div className="segment-cards">
          {profiles.map((profile, index) => {
            const mostActiveCluster = [...profiles].sort(
              (left, right) =>
                left.average_recency - right.average_recency ||
                right.average_frequency - left.average_frequency ||
                right.average_monetary - left.average_monetary,
            )[0]?.cluster;
            return <SegmentCard key={profile.cluster} profile={profile} color={COLORS[index % COLORS.length]} moreActive={profile.cluster === mostActiveCluster} />;
          })}
        </div>
        <Panel title="Explore an individual customer" subtitle="Search the segmentation table, then open a customer profile.">
          <Link className="button secondary" to="/customers">Browse customers <ArrowRight size={15} /></Link>
        </Panel>
      </>
    );
  }
  if (error) return <><PageHeading eyebrow="CUSTOMER INTELLIGENCE" title={`Customer ${customerId}`} /><div className="notice error-notice"><CircleAlert size={17} />{error}</div><Link to="/customers" className="button secondary">Back to customers</Link></>;
  if (!customer) return <><PageHeading eyebrow="CUSTOMER INTELLIGENCE" title={`Customer ${customerId}`} description="Loading this customer's observed RFM metrics…" /></>;
  const profile = profiles.find((item) => item.cluster === customer.Cluster);
  const weightedAverageRecency = profiles.reduce(
    (sum, item) => sum + item.average_recency * item.customer_count,
    0,
  ) / Math.max(1, dashboard.metrics.total_customers);
  const moreActiveCluster = [...profiles].sort(
    (left, right) =>
      left.average_recency - right.average_recency ||
      right.average_frequency - left.average_frequency ||
      right.average_monetary - left.average_monetary,
  )[0]?.cluster;
  const engagement = customer.Recency <= weightedAverageRecency
    ? "More recently active than the dataset's average cluster profile"
    : "Less recently active than the dataset's average cluster profile";
  return (
    <>
      <PageHeading eyebrow="CUSTOMER INTELLIGENCE" title={`Customer ${customer.CustomerID}`} description="Actual RFM values and existing-model assignment." action={<Link to="/customers" className="button secondary">← All customers</Link>} />
      <div className="customer-hero">
        <span className="customer-avatar"><Users size={24} /></span>
        <div><strong>Customer {customer.CustomerID}</strong><p>Assigned to Cluster {customer.Cluster} by the original fitted K-Means model</p></div>
        <span className="badge cluster-badge">Cluster {customer.Cluster}</span>
      </div>
      <div className="stats-grid three-col">
        <StatCard label="Recency" value={`${count(customer.Recency)} days`} detail="Days since most recent eligible purchase" icon={Clock3} />
        <StatCard label="Frequency" value={`${count(customer.Frequency)} invoices`} detail="Distinct purchase invoices" icon={Activity} />
        <StatCard label="Monetary" value={money(customer.Monetary)} detail="Eligible product sales value" icon={TrendingUp} accent="blue" />
      </div>
      <Panel title="Observed customer behaviour" subtitle="Comparisons use this upload's measured cluster profile">
        <div className="profile-details">
          <div><span>Observed segment description</span><strong>{profile?.segment_name || `Cluster ${customer.Cluster}`}</strong><small>{profile?.interpretation_basis || "Based on the uploaded customer profile."}</small></div>
          <div><span>Engagement context</span><strong>{engagement}</strong><small>A descriptive comparison, not a churn or future-behaviour prediction.</small></div>
          <div><span>Model output</span><strong>Cluster {customer.Cluster}</strong><small>The fitted model predicts cluster membership from the ordered, scaled log-RFM features.</small></div>
        </div>
      </Panel>
      <div className="recommendation-card">
        <span className="recommendation-icon"><Sparkles size={19} /></span>
        <div><span className="eyebrow">BUSINESS SUGGESTION · NOT A MODEL PREDICTION</span><h2>{customer.Cluster === moreActiveCluster ? "Consider retention and loyalty messaging" : "Consider a relevant re-engagement offer"}</h2><p>{customer.Cluster === moreActiveCluster ? "Use the observed recency and purchase history to inform loyalty outreach. Test campaign response before making broader decisions." : "Use the observed purchase gap to inform a measured follow-up. Tailor offers to purchase history and assess campaign results."}</p></div>
      </div>
    </>
  );
}

function SegmentCard({ profile, color, moreActive }) {
  return (
    <article className="segment-card">
      <div className="segment-card-top"><span className="cluster-chip"><i style={{ background: color }} />Cluster {profile.cluster}</span><strong>{profile.customer_percentage}%</strong></div>
      <h2>{profile.segment_name}</h2>
      <p className="segment-basis">{profile.interpretation_basis}</p>
      <div className="segment-metrics"><span><small>Customers</small><strong>{count(profile.customer_count)}</strong></span><span><small>Avg. recency</small><strong>{profile.average_recency.toFixed(1)} days</strong></span><span><small>Avg. frequency</small><strong>{profile.average_frequency.toFixed(2)}</strong></span><span><small>Avg. monetary</small><strong>{money(profile.average_monetary)}</strong></span></div>
      <div className="suggestion-note"><Sparkles size={15} /><span><strong>Business suggestion · not a prediction</strong><br />{moreActive ? "Consider retention and loyalty touchpoints, informed by observed purchase history." : "Consider measured re-engagement messaging and review the observed purchase gap."}</span></div>
    </article>
  );
}

export function ReportsPage() {
  const { sessionId, dashboard, cleaning, filename, busy, error, setError } = useAnalysis();
  const [downloading, setDownloading] = useState("");
  const [localError, setLocalError] = useState("");
  const ready = Boolean(sessionId);
  async function download(name, filename) {
    setDownloading(name);
    setLocalError("");
    try {
      const response = await downloadReport(sessionId, name);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (issue) {
      setLocalError(issue.message);
    } finally {
      setDownloading("");
    }
  }
  return (
    <>
      <PageHeading eyebrow="EXPORTS" title="Reports & downloads" description="Download actual cleaned records, fitted-model customer assignments and measured cluster profiles." />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      {filename && <div className="dataset-banner compact-banner"><span className="file-icon"><FileSpreadsheet size={17} /></span><span><strong>{filename}</strong><small>{dashboard ? `${count(dashboard.metrics.total_customers)} customers · analysis complete` : cleaning ? `${count(cleaning.summary.cleaned_rows)} cleaned rows · segmentation not run` : "Uploaded · cleaning not run"}</small></span></div>}
      <div className="report-grid">
        <ReportCard icon={Database} title="Cleaned transactions" detail="Duplicate removal and unambiguous description recovery. Special transaction records are preserved." available={Boolean(cleaning)} onClick={() => download("cleaned.csv", "retailiq-cleaned-transactions.csv")} busy={downloading === "cleaned.csv"} />
        <ReportCard icon={Users} title="Customer segmentation" detail="Customer IDs, RFM values, notebook preprocessing fields and existing-model cluster assignments." available={Boolean(dashboard)} onClick={() => download("customers.csv", "retailiq-customer-segmentation.csv")} />
        <ReportCard icon={Layers3} title="Cluster profiles" detail="Measured customer counts, share, average RFM and revenue contribution per cluster." available={Boolean(dashboard)} onClick={() => download("profiles.csv", "retailiq-cluster-profiles.csv")} />
        <ReportCard icon={FileBarChart} title="Analysis summary" detail="JSON snapshot of dataset quality, observed analytics and recorded model-evaluation metadata." downloadLabel="Download JSON" available={Boolean(dashboard)} onClick={() => download("summary.json", "retailiq-analysis-summary.json")} />
      </div>
      {ready && !cleaning && <p className="footnote">Clean the uploaded dataset before exporting transaction files. Customer and analytics reports require completed model segmentation.</p>}
      {dashboard && (
        <Panel title="Print-ready analysis summary" subtitle="Use your browser's print dialog to save this report as PDF." className="print-panel">
          <div className="print-summary"><div className="print-summary-head"><span className="brand-mark small-mark">R</span><span><strong>RetailIQ analysis</strong><small>{dashboard.source_filename} · {dateLabel(dashboard.analysis_reference_date)}</small></span></div><div className="print-metrics"><span><small>Customers</small><strong>{count(dashboard.metrics.total_customers)}</strong></span><span><small>Transactions</small><strong>{count(dashboard.metrics.total_transactions)}</strong></span><span><small>Revenue</small><strong>{money(dashboard.metrics.total_revenue)}</strong></span><span><small>Training silhouette</small><strong>{dashboard.training_evaluation.score}</strong></span></div><div className="table-scroll"><table><thead><tr><th>Cluster</th><th>Customers</th><th>Avg. recency</th><th>Avg. frequency</th><th>Avg. monetary</th><th>Revenue share</th></tr></thead><tbody>{dashboard.cluster_profiles.map((profile) => <tr key={profile.cluster}><td>Cluster {profile.cluster}</td><td>{count(profile.customer_count)}</td><td>{profile.average_recency.toFixed(2)} days</td><td>{profile.average_frequency.toFixed(2)}</td><td>{money(profile.average_monetary)}</td><td>{profile.revenue_percentage.toFixed(2)}%</td></tr>)}</tbody></table></div><p className="footnote">The recorded silhouette score describes the notebook's training clustering evaluation; it is not prediction accuracy.</p></div>
          <div className="panel-footer print-controls"><span>Generated from actual analysis results.</span><button className="button secondary" onClick={() => window.print()}><FileBarChart size={15} /> Print / save PDF</button></div>
        </Panel>
      )}
      {busy && <div className="notice"><Activity size={17} />{busy === "analyze" ? "Analysis is running…" : "Please wait…"}</div>}
    </>
  );
}

function ReportCard({ icon: Icon, title, detail, downloadLabel = "Download CSV", available, onClick, busy }) {
  return <article className={`report-card${available ? "" : " unavailable"}`}><span className="report-icon"><Icon size={19} /></span><div><h2>{title}</h2><p>{detail}</p></div><button className="button secondary" onClick={onClick} disabled={!available || busy}>{busy ? "Preparing…" : <><ArrowDownToLine size={15} /> {downloadLabel}</>}</button><small>{available ? "Ready · generated from this analysis" : "Available after completing the required steps"}</small></article>;
}

export function SettingsPage() {
  const { health, refreshHealth, error, setError } = useAnalysis();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  async function refresh() {
    setLoading(true);
    setLocalError("");
    try { await refreshHealth(); } catch (issue) { setLocalError(issue.message); }
    finally { setLoading(false); }
  }
  return (
    <>
      <PageHeading eyebrow="WORKSPACE" title="Settings & model setup" description="RetailIQ loads your original exported model at application startup. It does not retrain or substitute models." action={<button className="button secondary" onClick={refresh} disabled={loading}><Activity size={15} />{loading ? "Checking…" : "Check API status"}</button>} />
      <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(""); setError(""); }} />
      <Panel title="Original model status" subtitle="Segmentation requires the existing fitted scaler and clusterer.">
        <div className="settings-status"><span className={`status-illustration ${health?.model?.available ? "success" : "warning"}`}>{health?.model?.available ? <CheckCircle2 size={21} /> : <CircleAlert size={21} />}</span><div><strong>{health?.model?.available ? "Original model loaded" : "Model artifacts not found"}</strong><p>{health?.model?.message || "Check the API connection to see artifact status."}</p></div><span className={`badge ${health?.model?.available ? "success-badge" : "warning-badge"}`}>{health?.model?.available ? "Ready" : "Setup required"}</span></div>
        {health?.model?.available && health.model.compatibility_warning && (
          <div className="notice warning-notice model-version-notice">
            <CircleAlert size={17} />
            <span>{health.model.compatibility_warning}</span>
          </div>
        )}
        {health?.model?.silhouette_score != null && <div className="metadata-row"><span>Recorded training silhouette score <small>Evaluation metric, not accuracy</small></span><strong>{health.model.silhouette_score}</strong></div>}
      </Panel>
      <Panel title="Install the exported notebook artifacts" subtitle="Use the actual files from your Google Drive export. RetailIQ will not generate replacements.">
        <div className="setup-instructions">
          <p>The verified model artifacts are loaded from <code>backend/artifacts/</code> when the API starts:</p>
          <ul className="artifact-list"><li><FileCheck2 size={17} /><code>standard_scaler.joblib</code><span>Fitted StandardScaler from the notebook</span></li><li><FileCheck2 size={17} /><code>kmeans_model.joblib</code><span>Fitted two-cluster K-Means model</span></li><li><FileCheck2 size={17} /><code>metadata.json</code><span>Exported feature order and preprocessing metadata</span></li><li><FileSpreadsheet size={17} /><code>final_customer_segmentation.csv</code><span>Notebook labels for assignment validation</span></li><li><FileSpreadsheet size={17} /><code>cluster_profiles.csv</code><span>Notebook's recorded customer profiles</span></li></ul>
          <div className="code-block"><span># Restart FastAPI after changing files in:</span><br /><span>backend\artifacts\</span><br /><span># Current artifacts are checked against saved predictions.</span></div>
          <p className="setup-note">The scaler, K-Means model and metadata are required for prediction. The customer-assignment CSV enables a direct comparison with notebook labels. CSV profile files are reference exports and are never treated as new predictions.</p>
        </div>
      </Panel>
      <Panel title="Inference pipeline" subtitle="The serving feature order is fixed to the notebook's fitted model.">
        <div className="pipeline-row"><span><b>01</b><strong>RFM</strong><small>Recency · Frequency · Monetary</small></span><ArrowRight size={17} /><span><b>02</b><strong>Log transform</strong><small>numpy.log1p per RFM feature</small></span><ArrowRight size={17} /><span><b>03</b><strong>Fitted scaler</strong><small>Log_Recency → Log_Monetary</small></span><ArrowRight size={17} /><span><b>04</b><strong>Fitted K-Means</strong><small>predict() only · no training</small></span></div>
      </Panel>
      <p className="footnote">The exported metadata records scikit-learn 1.6.1. Use that exact version for supported Joblib compatibility. Analysis sessions are held in memory and expire after one hour.</p>
    </>
  );
}
