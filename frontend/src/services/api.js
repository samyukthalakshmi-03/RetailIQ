const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new Error(message);
  }
  return response;
}

export async function fetchHealth() {
  return (await request("/api/health")).json();
}

export async function uploadDataset(file) {
  const body = new FormData();
  body.append("file", file);
  return (await request("/api/upload", { method: "POST", body })).json();
}

export async function cleanDataset(sessionId) {
  return (await request(`/api/clean/${sessionId}`, { method: "POST" })).json();
}

export async function analyzeDataset(sessionId) {
  return (
    await request(`/api/analyze/rfm/${sessionId}`, { method: "POST" })
  ).json();
}

export async function fetchCustomers(sessionId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });
  return (
    await request(`/api/customers/${sessionId}?${query.toString()}`)
  ).json();
}

export async function fetchCustomer(sessionId, customerId) {
  return (
    await request(
      `/api/customers/${sessionId}/${encodeURIComponent(customerId)}`,
    )
  ).json();
}

export async function downloadReport(sessionId, reportName) {
  return request(`/api/reports/${sessionId}/${reportName}`);
}

export { API_BASE };
