(function () {
  const host = window.location.hostname || "127.0.0.1";
  const localHost = host === "127.0.0.1" || host === "localhost" || window.location.protocol === "file:";
  const API_BASE = window.WIT_API_BASE || (localHost
    ? `${window.location.protocol === "https:" ? "https" : "http"}://${host}:8000`
    : window.location.origin);
  const loginForm = document.getElementById("wit-login-form");
  const registerForm = document.getElementById("wit-register-form");
  const status = document.getElementById("wit-auth-status");
  const adminUrl = "../admin_dashboard_wit_research_analysis/code.html";
  const message = (text, error) => { status.textContent = text; status.style.color = error ? "#a93645" : "#277653"; };

  async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed with HTTP ${response.status}`);
      return body;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function authFailureMessage(error) {
    if (error?.name === "AbortError") return "The server took too long to respond. Please try again.";
    if (error instanceof TypeError) return "The authentication service could not be reached. Check the service connection and try again.";
    return error?.message || "Authentication request failed.";
  }

  async function submit(form, endpoint, successText) {
    const data = Object.fromEntries(new FormData(form).entries());
    data.email = String(data.email || "").trim().toLowerCase();
    message(endpoint.endsWith("/login") ? "Signing in..." : "Creating account...", false);
    try {
      await requestJson(`${API_BASE}${endpoint}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const session = await requestJson(`${API_BASE}/auth/me`, { credentials: "include" });
      if (session.role && session.role !== "admin") throw new Error("This account does not have admin access.");
      message(successText, false);
      window.setTimeout(() => { window.location.replace(adminUrl); }, 250);
    } catch (error) {
      message(authFailureMessage(error), true);
    }
  }

  loginForm.addEventListener("submit", (event) => { event.preventDefault(); submit(loginForm, "/auth/login", "Signed in. Opening the admin dashboard..."); });
  registerForm.addEventListener("submit", (event) => { event.preventDefault(); submit(registerForm, "/auth/register", "Account created. Opening the admin dashboard..."); });
})();
