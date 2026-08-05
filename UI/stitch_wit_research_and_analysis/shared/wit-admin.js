(function () {
  const API_BASE = window.location.protocol === "https:" ? "https://127.0.0.1:8000" : "http://127.0.0.1:8000";
  const labels = { malaria: "Malaria", leukemia: "Leukemia", histopathology: "Histopathology" };
  const byId = (id) => document.getElementById(id);
  const csrf = () => document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("csrf_token="))?.slice(11) || "";
  const setText = (id, value) => { const el = byId(id); if (el) el.textContent = String(value ?? ""); };
  const formatPercent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available";
  const feedback = (text, error = false) => { setText("wit-admin-feedback", text); const el = byId("wit-admin-feedback"); if (el) el.style.color = error ? "#a93645" : "#5c7181"; };
  const researchUrl = "../home_wit_research_analysis/code.html";

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options, headers: { ...(options.headers || {}), ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrf() } : {}) } });
    if (response.status === 401 || response.status === 403) { window.location.href = "../auth_wit_research_analysis/code.html"; throw new Error("Authentication required"); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || `Request failed with HTTP ${response.status}`);
    return body;
  }

  async function reauthenticateAndSwitch(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedbackNode = byId("wit-admin-switch-feedback");
    feedbackNode.textContent = "Checking credentials...";
    feedbackNode.style.color = "#5c7181";
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "Credentials were not accepted.");
      window.location.href = researchUrl;
    } catch (error) {
      feedbackNode.textContent = error.message || "Credentials were not accepted.";
      feedbackNode.style.color = "#a93645";
    }
  }

  function renderAnalytics(data) {
    setText("wit-admin-total", data.total_scans);
    setText("wit-admin-completed", data.completed_scans);
    setText("wit-admin-failed", data.failed_scans);
    setText("wit-admin-confidence", formatPercent(data.average_confidence));
    const chart = byId("wit-admin-module-chart"); chart.replaceChildren();
    const max = Math.max(1, ...data.by_module.map((item) => Number(item.scans) || 0));
    data.by_module.forEach((item) => {
      const row = document.createElement("div"); row.className = "wit-admin-bar-row";
      const label = document.createElement("span"); label.textContent = labels[item.module] || item.module;
      const track = document.createElement("span"); track.className = "wit-admin-bar-track";
      const fill = document.createElement("span"); fill.className = "wit-admin-bar-fill"; fill.style.width = `${(Number(item.scans) / max) * 100}%`; track.appendChild(fill);
      const count = document.createElement("strong"); count.textContent = String(item.scans);
      row.append(label, track, count); chart.appendChild(row);
    });
    if (!data.by_module.length) { const empty = document.createElement("p"); empty.className = "wit-admin-panel-note"; empty.textContent = "No scan data yet."; chart.appendChild(empty); }
  }

  function renderHealth(data) {
    const list = byId("wit-admin-health"); list.replaceChildren();
    const entries = [
      ["Backend", data.backend], ["Models", data.available_modules?.length ? `${data.available_modules.length} loaded` : "None loaded"],
      ["Database", data.database?.exists ? "Ready" : "Missing"], ["HTTPS readiness", data.security?.https_ready ? "Ready" : "Review"],
      ["Secure cookies", data.security?.secure_cookies ? "Enabled" : "Local development"], ["Field encryption", data.security?.field_encryption_enabled ? "Enabled" : "Not configured"],
    ];
    entries.forEach(([label, value]) => { const row = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.textContent = value; dd.className = value === "Ready" || value === "online" ? "wit-admin-badge ok" : "wit-admin-badge warn"; row.append(dt, dd); list.appendChild(row); });
  }

  async function deleteScan(scanId) {
    if (!window.confirm(`Delete scan ${scanId}? This action cannot be undone.`)) return;
    feedback("Deleting scan...");
    try {
      await api(`/admin/history/${encodeURIComponent(scanId)}`, { method: "DELETE" });
      await loadAll();
      feedback("Scan deleted.");
    } catch (error) {
      feedback(error.message || "Scan could not be deleted.", true);
    }
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedbackNode = byId("wit-admin-user-feedback");
    feedbackNode.textContent = "Creating account...";
    feedbackNode.style.color = "#5c7181";
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const user = await api("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      byId("wit-admin-user-dialog").close();
      form.reset();
      byId("wit-admin-user-role").value = "researcher";
      feedback(`Created ${user.email} with ${user.role} access.`);
    } catch (error) {
      feedbackNode.textContent = error.message || "User could not be created.";
      feedbackNode.style.color = "#a93645";
    }
  }

  function renderHistory(data) {
    const body = byId("wit-admin-history-body"); body.replaceChildren();
    data.items.forEach((item) => {
      const row = document.createElement("tr");
      [item.scan_id, formatDate(item.created_at), labels[item.module] || item.module, item.predicted_class || "No result", formatPercent(item.confidence)].forEach((value) => {
        const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
      });
      const status = document.createElement("td");
      const badge = document.createElement("span"); badge.className = `wit-admin-badge ${item.status === "Completed" ? "ok" : "fail"}`; badge.textContent = item.status; status.appendChild(badge); row.appendChild(status);
      const reportCell = document.createElement("td");
      if (item.status === "Completed") {
        const link = document.createElement("a"); link.href = `${API_BASE}/history/${encodeURIComponent(item.scan_id)}/report`; link.download = `${item.module}-${item.scan_id}-report.pdf`; link.className = "text-primary hover:underline"; link.textContent = "Download"; reportCell.appendChild(link);
      } else {
        reportCell.textContent = "Unavailable";
      }
      row.appendChild(reportCell);
      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button"); deleteButton.type = "button"; deleteButton.className = "wit-admin-delete-button"; deleteButton.title = `Delete ${item.scan_id}`; deleteButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete</span><span>Delete</span>'; deleteButton.addEventListener("click", () => deleteScan(item.scan_id)); actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);
      body.appendChild(row);
    });
    if (!data.items.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 8; cell.textContent = "No scans match the current filters."; row.appendChild(cell); body.appendChild(row); }
  }

  function renderAudit(data) {
    const body = byId("wit-admin-audit-body"); body.replaceChildren();
    data.items.forEach((item) => { const row = document.createElement("tr"); [formatDate(item.created_at), item.action, item.resource_type, item.email || "System", item.ip_address || "Not recorded"].forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell); }); body.appendChild(row); });
  }

  async function loadAll() {
    feedback("Refreshing dashboard...");
    try {
      const [analytics, history, audit, health, settings, user] = await Promise.all([
        api("/admin/analytics"), api("/admin/history?page_size=8"), api("/admin/audit-logs?limit=12"), api("/admin/system-health"), api("/admin/settings"), api("/auth/me"),
      ]);
      renderAnalytics(analytics); renderHistory(history); renderAudit(audit); renderHealth(health); byId("wit-admin-auth-email").textContent = `${user.email} · ${user.role}`;
      byId("wit-admin-switch-email").value = user.email;
      byId("wit-admin-require-auth").checked = settings.require_auth_for_predictions;
      feedback(`Updated ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date())}.`);
    } catch (error) { feedback(error.message || "Dashboard unavailable.", true); }
  }

  byId("wit-admin-history-search").addEventListener("input", async () => { try { const value = encodeURIComponent(byId("wit-admin-history-search").value.trim()); const module = encodeURIComponent(byId("wit-admin-history-module").value); renderHistory(await api(`/admin/history?search=${value}&module=${module}&page_size=8`)); } catch (error) { feedback(error.message, true); } });
  byId("wit-admin-history-module").addEventListener("change", () => byId("wit-admin-history-search").dispatchEvent(new Event("input")));
  byId("wit-admin-require-auth").addEventListener("change", async (event) => { try { await api("/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ require_auth_for_predictions: event.target.checked }) }); feedback("Prediction access setting saved."); } catch (error) { event.target.checked = !event.target.checked; feedback(error.message, true); } });
  byId("wit-admin-refresh").addEventListener("click", loadAll);
  byId("wit-admin-create-user").addEventListener("click", () => { const form = byId("wit-admin-user-form"); form.reset(); byId("wit-admin-user-role").value = "researcher"; byId("wit-admin-user-feedback").textContent = ""; byId("wit-admin-user-dialog").showModal(); });
  byId("wit-admin-user-cancel").addEventListener("click", () => byId("wit-admin-user-dialog").close());
  byId("wit-admin-user-cancel-secondary").addEventListener("click", () => byId("wit-admin-user-dialog").close());
  byId("wit-admin-user-form").addEventListener("submit", createUser);
  byId("wit-admin-switch-research").addEventListener("click", () => { byId("wit-admin-switch-feedback").textContent = ""; byId("wit-admin-switch-password").value = ""; byId("wit-admin-switch-dialog").showModal(); });
  byId("wit-admin-switch-cancel").addEventListener("click", () => byId("wit-admin-switch-dialog").close());
  byId("wit-admin-switch-cancel-secondary").addEventListener("click", () => byId("wit-admin-switch-dialog").close());
  byId("wit-admin-switch-form").addEventListener("submit", reauthenticateAndSwitch);
  byId("wit-admin-logout").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST" }); } finally { window.location.href = "../auth_wit_research_analysis/code.html"; } });
  loadAll();
})();
