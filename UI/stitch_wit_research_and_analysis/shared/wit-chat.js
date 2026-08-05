(function () {
  const API_BASE = typeof window !== "undefined" && window.location && window.location.protocol === "https:"
    ? "https://127.0.0.1:8000"
    : "http://127.0.0.1:8000";
  const PAGE_URLS = {
    home: "../home_wit_research_analysis/code.html",
    about: "../about_wit_research_analysis/code.html",
    detection: "../detection_wit_research_analysis/code.html",
    malaria: "../malaria_detection_wit_research_analysis/code.html",
    leukemia: "../leukemia_detection_wit_research_analysis/code.html",
    histopathology: "../histopathology_detection_wit_research_analysis/code.html",
    guidelines: "../guidelines_wit_research_analysis/code.html",
    contact: "../contact_wit_research_analysis/code.html",
    history: "../scan_history_wit_research_analysis/code.html",
  };

  const messages = [];
  const style = document.createElement("style");
  style.textContent = `
    footer { position: relative; z-index: 10; }
    footer > div {
      display: grid !important;
      grid-template-columns: minmax(180px, 1fr) minmax(260px, 1.25fr) minmax(360px, 1.5fr);
      align-items: center;
      gap: 20px;
    }
    footer > div > div:last-child {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, max-content));
      justify-content: flex-end;
      gap: 8px 16px !important;
    }
    footer > div > div:last-child a {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 8px;
      white-space: nowrap;
      border-bottom: 1px solid transparent;
    }
    footer > div > div:last-child a:hover { border-bottom-color: currentColor; }
    .wit-footer-version { display: inline-block; margin-top: 4px; opacity: .72; }
    #wit-chat-launcher { position: fixed; right: 24px; bottom: 128px; z-index: 60; }
    #wit-chat-launcher {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 44px; padding: 0 16px; border: 1px solid #082a49;
      background: #082a49; color: #fff; cursor: pointer;
      box-shadow: 0 10px 24px rgba(8,42,73,.18);
      font: 700 11px/1 "Public Sans", sans-serif; letter-spacing: .08em;
    }
    #wit-chat-launcher:hover { background: #0d5f91; border-color: #0d5f91; }
    #wit-chat-panel { position: fixed; right: 24px; bottom: 192px; z-index: 60; width: min(400px, calc(100vw - 32px)); max-height: min(75vh, 560px); overflow: hidden; border: 1px solid #d5e1e9; background: #fff; color: #14273a; box-shadow: 0 18px 44px rgba(8,42,73,.18); }
    #wit-chat-panel.hidden { display: none; }
    #wit-chat-panel > div:first-child { background: #f3f7fa; border-bottom: 1px solid #d5e1e9; }
    #wit-chat-panel h2 { margin: 0; color: #082a49; font: 700 20px/1.1 "Playfair Display", serif; }
    #wit-chat-close { border: 0; background: transparent; color: #5c7181; cursor: pointer; }
    #wit-chat-close:hover { color: #0d5f91; }
    #wit-chat-messages { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; background: #fff; }
    .wit-chat-message { max-width: 86%; overflow-wrap: anywhere; white-space: pre-line; text-align: left; }
    .wit-chat-message-user { align-self: flex-end; background: #082a49; color: #fff; padding: 12px; }
    .wit-chat-message-assistant { align-self: flex-start; background: #f3f7fa; color: #14273a; border: 1px solid #d5e1e9; padding: 12px; }
    #wit-chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; background: #fff; border-top: 1px solid #d5e1e9; }
    #wit-chat-suggestions button { border: 1px solid #d5e1e9; background: #fff; color: #0d5f91; cursor: pointer; padding: 7px 9px; font: 700 10px/1.2 "Public Sans", sans-serif; letter-spacing: .04em; }
    #wit-chat-suggestions button:hover { background: #e8f7f8; border-color: #159ca8; }
    #wit-chat-form { display: flex; gap: 8px; background: #fff; border-top: 1px solid #d5e1e9; }
    #wit-chat-input { min-width: 0; flex: 1; border: 1px solid #d5e1e9; background: #fff; color: #14273a; padding: 9px 10px; font: 400 13px/1.2 "Public Sans", sans-serif; }
    #wit-chat-input:focus { outline: 2px solid #e8f7f8; border-color: #159ca8; }
    #wit-chat-form button { border: 1px solid #082a49; background: #082a49; color: #fff; cursor: pointer; padding: 0 12px; font: 700 10px/1 "Public Sans", sans-serif; letter-spacing: .06em; }
    #wit-chat-form button:hover { background: #0d5f91; }
    .wit-chat-message button { color: #0d5f91; }
    .wit-system-brand {
      display: inline-flex; align-items: center; gap: 9px; color: #082a49 !important;
      text-decoration: none; white-space: nowrap; font: 700 15px/1 "Public Sans", sans-serif;
      letter-spacing: .045em;
    }
    .wit-system-brand-mark {
      display: inline-grid; place-items: center; width: 30px; height: 30px;
      background: #082a49; color: #fff; font: 700 12px/1 "Playfair Display", serif;
      letter-spacing: 0;
    }
    .wit-system-brand-name { display: inline-flex; align-items: center; gap: 5px; }
    .wit-system-brand-name strong { color: #0d5f91; font-weight: 700; }
    .wit-system-brand-rule { width: 18px; height: 2px; background: #159ca8; }
    .wit-admin-access-link {
      display: inline-flex; align-items: center; min-height: 32px; padding: 6px 10px;
      border: 1px solid #082a49; background: #082a49; color: #fff !important;
      text-decoration: none; font: 700 10px/1 "Public Sans", sans-serif;
      letter-spacing: .06em; text-transform: uppercase;
    }
    .wit-admin-access-link:hover { background: #0d5f91; border-color: #0d5f91; }
    @media (max-width: 640px) {
      footer > div {
        grid-template-columns: 1fr;
        text-align: center;
      }
      footer > div > div:last-child {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        justify-content: center;
      }
      footer > div > div:last-child a { justify-content: center; }
      footer > div > p { margin-left: auto; margin-right: auto; }
      #wit-chat-launcher { right: 16px; bottom: 132px; }
      #wit-chat-panel { right: 16px; bottom: 196px; }
    }
    @media (min-width: 1450px) {
      footer > div > div:last-child {
        grid-template-columns: repeat(4, max-content);
      }
    }
  `;
  document.head.appendChild(style);

  const launcher = document.createElement("button");
  launcher.id = "wit-chat-launcher";
  launcher.type = "button";
  launcher.className = "bg-primary text-white border border-primary px-4 py-3 font-label-caps text-label-caps shadow-lg hover:opacity-90";
  launcher.setAttribute("aria-label", "Open WIT assistant");
  launcher.textContent = "ASK WIT";

  const panel = document.createElement("section");
  panel.id = "wit-chat-panel";
  panel.className = "hidden bg-surface border border-outline-variant shadow-xl";
  panel.setAttribute("aria-label", "WIT assistant");
  panel.innerHTML = `
    <div class="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3">
      <h2 class="font-headline-sm text-headline-sm text-primary">WIT Assistant</h2>
      <button id="wit-chat-close" type="button" class="font-label-caps text-label-caps text-on-surface-variant hover:text-primary" aria-label="Close WIT assistant">CLOSE</button>
    </div>
    <div id="wit-chat-messages" class="space-y-3 p-4 font-body-sm text-body-sm" aria-live="polite"></div>
    <div id="wit-chat-suggestions" class="border-t border-outline-variant px-4 py-3" aria-label="Suggested questions"></div>
    <form id="wit-chat-form" class="flex gap-2 border-t border-outline-variant p-3">
      <input id="wit-chat-input" class="min-w-0 flex-1 border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm" type="text" placeholder="Ask about the platform or a disease" autocomplete="off" />
      <button class="bg-primary px-3 py-2 font-label-caps text-label-caps text-white hover:opacity-90" type="submit">SEND</button>
    </form>`;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const footer = document.querySelector("footer");
  const primaryNav = document.querySelector("header nav");
  const normalizedText = (value) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const brandNode = Array.from(document.querySelectorAll("header a, header div")).find((node) => !node.children.length && normalizedText(node.textContent) === "wit research & analysis");
  if (brandNode) {
    brandNode.classList.add("wit-system-brand");
    brandNode.setAttribute("aria-label", "WIT Research & Analysis");
    brandNode.innerHTML = '<span class="wit-system-brand-mark" aria-hidden="true">WIT</span><span class="wit-system-brand-rule" aria-hidden="true"></span><span class="wit-system-brand-name"><strong>Research</strong><span>&amp;</span><span>Analysis</span></span>';
  }
  if (primaryNav) {
    const navLinks = Array.from(primaryNav.querySelectorAll("a"));
    const hasHistoryLink = navLinks.some((link) => link.textContent.trim().toLowerCase() === "scan history");
    if (!hasHistoryLink) {
      const historyLink = document.createElement("a");
      const detectionLink = navLinks.find((link) => link.textContent.trim().toLowerCase() === "detection");
      historyLink.href = PAGE_URLS.history;
      historyLink.className = detectionLink
        ? detectionLink.className
        : "text-on-surface-variant font-label-caps text-label-caps hover:text-primary px-2 py-1";
      historyLink.textContent = "Scan History";
      const guidelinesLink = navLinks.find((link) => link.textContent.trim().toLowerCase() === "guidelines");
      primaryNav.insertBefore(historyLink, guidelinesLink || null);
    }
    const protectedSurface = window.location.pathname.includes("admin_dashboard_wit_research_analysis") || window.location.pathname.includes("auth_wit_research_analysis");
    const hasAdminAccess = navLinks.some((link) => normalizedText(link.textContent) === "admin access");
    if (!protectedSurface && !hasAdminAccess) {
      const adminLink = document.createElement("a");
      adminLink.href = "../auth_wit_research_analysis/code.html";
      adminLink.className = "wit-admin-access-link";
      adminLink.textContent = "Admin access";
      primaryNav.appendChild(adminLink);
    }
  }
  if (footer) {
    const footerNav = footer.querySelector("nav");
    const hasContactLink = footerNav && Array.from(footerNav.querySelectorAll("a")).some((link) => link.textContent.trim().toLowerCase() === "contact");
    if (footerNav && !hasContactLink) {
      const contactLink = document.createElement("a");
      contactLink.href = "../contact_wit_research_analysis/code.html";
      contactLink.className = "font-label-caps text-label-caps text-on-surface-variant hover:text-primary";
      contactLink.textContent = "Contact";
      footerNav.appendChild(contactLink);
    }
    const hasAdminLink = footerNav && Array.from(footerNav.querySelectorAll("a")).some((link) => link.textContent.trim().toLowerCase() === "admin access");
    if (footerNav && !hasAdminLink) {
      const adminLink = document.createElement("a");
      adminLink.href = "../auth_wit_research_analysis/code.html";
      adminLink.className = "font-label-caps text-label-caps text-on-surface-variant hover:text-primary";
      adminLink.textContent = "Admin access";
      footerNav.appendChild(adminLink);
    }
    const footerMeta = footer.querySelector("p") || footer.querySelector("div > div:nth-child(2)");
    if (footerMeta && !footerMeta.querySelector(".wit-footer-version")) {
      const version = document.createElement("span");
      version.className = "wit-footer-version";
      version.textContent = "Research platform v2.0";
      footerMeta.appendChild(document.createElement("br"));
      footerMeta.appendChild(version);
    }
  }

  function positionChatControls() {
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    const defaultBottom = window.innerWidth <= 640 ? 132 : 128;
    const footerVisible = footerRect && footerRect.top < window.innerHeight && footerRect.bottom > 0;
    const footerClearance = footerVisible ? window.innerHeight - footerRect.top + 20 : 0;
    const launcherBottom = Math.max(defaultBottom, Math.ceil(footerClearance));
    launcher.style.bottom = `${launcherBottom}px`;
    panel.style.bottom = `${launcherBottom + 64}px`;
  }

  positionChatControls();
  window.addEventListener("resize", positionChatControls);
  window.addEventListener("scroll", positionChatControls, { passive: true });
  document.addEventListener("scroll", positionChatControls, { passive: true });

  const messageBox = panel.querySelector("#wit-chat-messages");
  const suggestionBox = panel.querySelector("#wit-chat-suggestions");
  const input = panel.querySelector("#wit-chat-input");
  const suggestions = [
    { label: "How does analysis work?", prompt: "How does image analysis work?" },
    { label: "What is Grad-CAM?", prompt: "What is Grad-CAM?" },
    { label: "Open malaria screening", prompt: "Take me to the malaria page." },
    { label: "Open scan history", prompt: "Take me to scan history." },
  ];
  let isSending = false;

  function appendMessage(role, text) {
    const item = document.createElement("div");
    item.className = role === "user"
      ? "wit-chat-message wit-chat-message-user ml-8 bg-primary p-3 text-white"
      : "wit-chat-message wit-chat-message-assistant mr-8 bg-surface-container-low p-3 text-on-surface";
    item.textContent = text;
    messageBox.appendChild(item);
    messageBox.scrollTop = messageBox.scrollHeight;
    return item;
  }

  function renderSuggestions() {
    suggestionBox.replaceChildren();
    suggestions.forEach((suggestion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "border border-outline-variant bg-surface-container-low px-2 py-1 text-left font-label-caps text-label-caps text-primary hover:bg-surface-container-highest";
      button.textContent = suggestion.label;
      button.addEventListener("click", () => sendMessage(suggestion.prompt));
      button.disabled = isSending;
      suggestionBox.appendChild(button);
    });
  }

  function navigate(page) {
    if (PAGE_URLS[page]) window.location.href = PAGE_URLS[page];
  }

  async function sendMessage(content) {
    if (isSending) return;
    isSending = true;
    renderSuggestions();
    messages.push({ role: "user", content });
    appendMessage("user", content);
    const pending = "Thinking...";
    appendMessage("assistant", pending);
    const pendingNode = messageBox.lastElementChild;
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!response.ok) throw new Error(`Chat request failed with HTTP ${response.status}`);
      const data = await response.json();
      pendingNode.textContent = data.reply || "I couldn't produce a response.";
      if (data.reply) messages.push({ role: "assistant", content: data.reply });
      if (data.navigate && PAGE_URLS[data.navigate]) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "mt-2 block font-label-caps text-label-caps text-primary hover:underline";
        link.textContent = `OPEN ${data.navigate.toUpperCase()}`;
        link.addEventListener("click", () => navigate(data.navigate));
        pendingNode.appendChild(link);
      }
    } catch (error) {
      pendingNode.textContent = "Assistant unavailable. Please start the backend and try again.";
      console.error("WIT chat request failed", error);
    } finally {
      isSending = false;
      renderSuggestions();
    }
  }

  launcher.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) input.focus();
  });
  panel.querySelector("#wit-chat-close").addEventListener("click", () => panel.classList.add("hidden"));
  panel.querySelector("#wit-chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    sendMessage(content);
  });

  appendMessage("assistant", "Ask about this platform, a detection page, or a disease.");
  renderSuggestions();
})();
