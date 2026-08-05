(function () {
  const PAGE_INDEX = [
    { title: "Home", keywords: ["research", "microscopy", "analysis", "disease detection"], url: "../home_wit_research_analysis/code.html" },
    { title: "About", keywords: ["institution", "walchand", "research", "deep learning"], url: "../about_wit_research_analysis/code.html" },
    { title: "Detection", keywords: ["malaria", "leukemia", "histopathology", "modules", "grad-cam"], url: "../detection_wit_research_analysis/code.html" },
    { title: "Malaria Detection", keywords: ["malaria", "parasite", "blood smear", "plasmodium", "grad-cam", "pdf report"], url: "../malaria_detection_wit_research_analysis/code.html" },
    { title: "Leukemia Detection", keywords: ["leukemia", "benign", "early", "pre", "pro", "blood smear", "grad-cam", "pdf report"], url: "../leukemia_detection_wit_research_analysis/code.html" },
    { title: "Histopathology Detection", keywords: ["histopathology", "cancer", "tissue", "whole slide", "grad-cam", "pdf report"], url: "../histopathology_detection_wit_research_analysis/code.html" },
    { title: "Usage Guidelines", keywords: ["guidelines", "image requirements", "results", "limitations", "grad-cam", "pdf report"], url: "../guidelines_wit_research_analysis/code.html" },
    { title: "Contact", keywords: ["email", "phone", "address", "institution"], url: "../contact_wit_research_analysis/code.html" },
    { title: "Policies & Ethics", keywords: ["privacy", "terms", "institutional guidelines", "ethics", "patient data", "research"], url: "../policies_wit_research_analysis/code.html" },
  ];

  const searchIcon = Array.from(document.querySelectorAll(".material-symbols-outlined"))
    .find((element) => element.textContent.trim().toLowerCase() === "search");
  if (!searchIcon) return;

  const wrapper = searchIcon.parentElement;
  wrapper.classList.add("relative");
  searchIcon.setAttribute("role", "button");
  searchIcon.setAttribute("tabindex", "0");
  searchIcon.setAttribute("aria-label", "Search site");
  searchIcon.setAttribute("aria-expanded", "false");

  const panel = document.createElement("div");
  panel.className = "hidden absolute right-0 top-full mt-3 w-72 border border-outline-variant bg-surface-container-lowest p-3 shadow-lg z-50";
  panel.innerHTML = `
    <label class="font-label-caps text-label-caps text-primary" for="wit-search-input">Search site</label>
    <input id="wit-search-input" class="mt-2 w-full border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm" type="search" placeholder="Search pages" autocomplete="off" />
    <div id="wit-search-results" class="mt-2" role="listbox"></div>`;
  wrapper.appendChild(panel);

  const input = panel.querySelector("#wit-search-input");
  const results = panel.querySelector("#wit-search-results");

  function getMatches(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return PAGE_INDEX.slice(0, 5);
    return PAGE_INDEX.filter((page) => `${page.title} ${page.keywords.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 5);
  }

  function renderResults(query) {
    results.replaceChildren();
    getMatches(query).forEach((page) => {
      const link = document.createElement("a");
      link.href = page.url;
      link.className = "block border-t border-outline-variant px-2 py-2 font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-low hover:text-primary";
      link.textContent = page.title;
      link.setAttribute("role", "option");
      results.appendChild(link);
    });
  }

  function openSearch() {
    panel.classList.remove("hidden");
    searchIcon.setAttribute("aria-expanded", "true");
    renderResults(input.value);
    input.focus();
  }

  function closeSearch() {
    panel.classList.add("hidden");
    searchIcon.setAttribute("aria-expanded", "false");
  }

  searchIcon.addEventListener("click", (event) => {
    event.stopPropagation();
    if (panel.classList.contains("hidden")) openSearch();
    else closeSearch();
  });
  searchIcon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSearch();
    }
  });
  input.addEventListener("input", () => renderResults(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const firstResult = results.querySelector("a");
    if (firstResult) {
      event.preventDefault();
      firstResult.click();
    }
  });
  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) closeSearch();
  });

  renderResults("");
})();
