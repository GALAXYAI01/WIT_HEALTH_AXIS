(function () {
  const API_BASE = window.location.protocol === "https:" ? "https://127.0.0.1:8000" : "http://127.0.0.1:8000";
  const loginForm = document.getElementById("wit-login-form");
  const registerForm = document.getElementById("wit-register-form");
  const status = document.getElementById("wit-auth-status");
  const adminUrl = "../admin_dashboard_wit_research_analysis/code.html";
  const message = (text, error) => { status.textContent = text; status.style.color = error ? "#a93645" : "#277653"; };

  async function submit(form, endpoint, successText) {
    const data = Object.fromEntries(new FormData(form).entries());
    message("Working...", false);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed with HTTP ${response.status}`);
      message(successText, false);
      window.setTimeout(() => { window.location.href = adminUrl; }, 350);
    } catch (error) {
      message(error.message || "Authentication request failed.", true);
    }
  }

  loginForm.addEventListener("submit", (event) => { event.preventDefault(); submit(loginForm, "/auth/login", "Signed in. Opening the admin dashboard..."); });
  registerForm.addEventListener("submit", (event) => { event.preventDefault(); submit(registerForm, "/auth/register", "Account created. Opening the admin dashboard..."); });
})();
