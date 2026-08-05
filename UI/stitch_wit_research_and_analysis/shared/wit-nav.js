(function () {
  "use strict";

  const run = () => {
    document.querySelectorAll("header.wit-site-header").forEach((header) => {
      const nav = header.querySelector('nav[aria-label="Primary navigation"]');
      if (!nav) return;

      const links = [
        { label: "Scan History", href: "../scan_history_wit_research_analysis/code.html" },
        { label: "Admin Access", href: "../auth_wit_research_analysis/code.html", className: "wit-nav-admin-link" },
      ];

      links.forEach(({ label, href, className }) => {
        const destination = new URL(href, document.baseURI).pathname;
        if ([...nav.querySelectorAll("a")].some((link) => new URL(link.getAttribute("href"), document.baseURI).pathname === destination)) return;
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        link.className = className || "";
        nav.appendChild(link);
      });

      const toggle = header.querySelector(".wit-nav-mobile");
      if (!toggle) return;

      const panel = document.createElement("div");
      panel.className = "wit-nav-mobile-panel";
      panel.setAttribute("aria-label", "Mobile navigation");
      nav.querySelectorAll("a").forEach((sourceLink) => {
        const link = sourceLink.cloneNode(true);
        link.className = `wit-nav-mobile-link ${sourceLink.classList.contains("wit-nav-admin-link") ? "wit-nav-admin-link" : ""}`.trim();
        panel.appendChild(link);
      });
      header.appendChild(panel);
      toggle.setAttribute("aria-expanded", "false");

      toggle.addEventListener("click", () => {
        const open = panel.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });

      document.addEventListener("click", (event) => {
        if (!header.contains(event.target) || event.target === toggle) return;
        if (!panel.contains(event.target)) {
          panel.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
