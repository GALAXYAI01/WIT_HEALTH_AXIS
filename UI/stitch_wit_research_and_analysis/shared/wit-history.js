(function () {
  const host = window.location.hostname || "127.0.0.1";
  const localHost = host === "127.0.0.1" || host === "localhost" || window.location.protocol === "file:";
  const API_BASE = window.WIT_API_BASE || (localHost
    ? `${window.location.protocol === "https:" ? "https" : "http"}://${host}:8000`
    : window.location.origin);
  const labels = {
    malaria: "Malaria",
    leukemia: "Leukemia",
    histopathology: "Histopathology",
  };
  const state = { page: 1, pageSize: 12, totalPages: 1 };
  const byId = (id) => document.getElementById(id);
  const tableBody = byId("wit-history-table-body");
  const tableWrap = byId("wit-history-table-wrap");
  const emptyState = byId("wit-history-empty");
  const feedback = byId("wit-history-feedback");
  const search = byId("wit-history-search");
  const moduleFilter = byId("wit-history-module");
  const statusFilter = byId("wit-history-status");
  const dateFilter = byId("wit-history-date");
  const sortFilter = byId("wit-history-sort");
  const clearButton = byId("wit-history-clear");
  const previousButton = byId("wit-history-previous");
  const nextButton = byId("wit-history-next");
  const pageStatus = byId("wit-history-page-status");
  const dialog = byId("wit-history-dialog");
  const dialogClose = byId("wit-history-dialog-close");
  const dialogCloseSecondary = byId("wit-history-dialog-close-secondary");
  const downloadButton = byId("wit-history-download");
  let searchTimer = null;
  let requestNumber = 0;
  let currentDetail = null;

  function formatDateTime(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function formatConfidence(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(2)}%` : "Not available";
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = String(value == null ? "" : value);
  }

  function createCell(label, content) {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    if (typeof content === "string") cell.textContent = content;
    else if (content) cell.appendChild(content);
    return cell;
  }

  function createThumbnail(item, large) {
    if (item.thumbnail_data_url) {
      const image = document.createElement("img");
      image.className = large ? "wit-history-dialog-image" : "wit-history-thumb";
      image.src = item.thumbnail_data_url;
      image.alt = `${labels[item.module] || item.module} scan thumbnail`;
      return image;
    }
    const placeholder = document.createElement("span");
    placeholder.className = large ? "wit-history-thumb-placeholder wit-history-dialog-image" : "wit-history-thumb-placeholder";
    placeholder.setAttribute("aria-label", "No image thumbnail available");
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "image_not_supported";
    placeholder.appendChild(icon);
    return placeholder;
  }

  function createConfidence(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "wit-history-confidence-wrap";
    const label = document.createElement("span");
    label.className = "wit-history-confidence";
    label.textContent = formatConfidence(item.confidence);
    const progress = document.createElement("span");
    progress.className = "wit-history-progress";
    const bar = document.createElement("span");
    const numeric = Math.max(0, Math.min(1, Number(item.confidence) || 0));
    bar.style.width = `${numeric * 100}%`;
    progress.appendChild(bar);
    wrapper.append(label, progress);
    return wrapper;
  }

  function createBadge(status) {
    const badge = document.createElement("span");
    badge.className = `wit-history-badge ${status === "Completed" ? "wit-history-badge--completed" : "wit-history-badge--failed"}`;
    badge.textContent = status || "Failed";
    return badge;
  }

  function renderRows(items) {
    tableBody.replaceChildren();
    items.forEach((item) => {
      const row = document.createElement("tr");
      const id = document.createElement("span");
      id.className = "wit-history-scan-id";
      id.textContent = item.scan_id;
      row.appendChild(createCell("Scan ID", id));

      const date = document.createElement("span");
      date.className = "wit-history-date";
      date.textContent = formatDateTime(item.created_at);
      row.appendChild(createCell("Date & time", date));

      const disease = document.createElement("span");
      disease.className = "wit-history-disease";
      disease.textContent = labels[item.module] || item.module;
      row.appendChild(createCell("Disease analyzed", disease));

      const prediction = document.createElement("span");
      prediction.className = `wit-history-prediction${item.predicted_class ? "" : " wit-history-prediction--muted"}`;
      prediction.textContent = item.predicted_class || "No result";
      row.appendChild(createCell("AI prediction", prediction));
      row.appendChild(createCell("Confidence", createConfidence(item)));
      row.appendChild(createCell("Status", createBadge(item.status)));
      row.appendChild(createCell("Thumbnail", createThumbnail(item, false)));

      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = "wit-history-details-button";
      viewButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">visibility</span><span>View details</span>';
      viewButton.addEventListener("click", () => openDetails(item.scan_id));
      row.appendChild(createCell("Actions", viewButton));
      tableBody.appendChild(row);
    });
    const hasItems = items.length > 0;
    tableWrap.classList.toggle("hidden", !hasItems);
    emptyState.classList.toggle("hidden", hasItems);
  }

  function renderSummary(summary) {
    setText("wit-history-total", summary.total_scans);
    setText("wit-history-diseases", summary.diseases_analyzed);
    setText("wit-history-today", summary.todays_scans);
  }

  function renderPagination(data) {
    state.totalPages = data.total_pages;
    state.page = data.page;
    previousButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= state.totalPages;
    pageStatus.textContent = data.total
      ? `Page ${state.page} of ${state.totalPages} | ${data.total} scan${data.total === 1 ? "" : "s"}`
      : "No scans found";
  }

  function setFeedback(message) {
    feedback.textContent = message || "";
  }

  async function loadHistory() {
    const currentRequest = ++requestNumber;
    setFeedback("Loading scan history...");
    const params = new URLSearchParams({
      search: search.value.trim(),
      module: moduleFilter.value,
      status: statusFilter.value,
      date: dateFilter.value,
      sort: sortFilter.value,
      page: String(state.page),
      page_size: String(state.pageSize),
    });
    try {
      const response = await fetch(`${API_BASE}/history?${params.toString()}`);
      if (!response.ok) throw new Error(`History request failed with HTTP ${response.status}`);
      const data = await response.json();
      if (currentRequest !== requestNumber) return;
      renderSummary(data.summary);
      renderRows(data.items);
      renderPagination(data);
      setFeedback("");
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      renderRows([]);
      renderPagination({ total: 0, page: 1, total_pages: 1 });
      setFeedback("Scan history is unavailable. Please start the backend and try again.");
      console.error("WIT scan history request failed", error);
    }
  }

  function openDetails(scanId) {
    fetch(`${API_BASE}/history/${encodeURIComponent(scanId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Details request failed with HTTP ${response.status}`);
        return response.json();
      })
      .then((item) => {
        currentDetail = item;
        setText("wit-history-dialog-id", item.scan_id);
        setText("wit-history-dialog-disease", labels[item.module] || item.module);
        setText("wit-history-dialog-prediction", item.predicted_class || "No result");
        setText("wit-history-dialog-confidence", formatConfidence(item.confidence));
        setText("wit-history-dialog-date", formatDateTime(item.created_at));
        setText("wit-history-dialog-status", item.status);
        setText("wit-history-dialog-model", item.model_version || "Not recorded");
        setText("wit-history-dialog-patient-name", item.patient_name || "Not provided");
        setText("wit-history-dialog-patient-demographics", [item.patient_age, item.patient_gender].filter(Boolean).join(" / ") || "Not provided");
        setText("wit-history-dialog-sample-id", item.patient_sample_id || "Not provided");
        const errorRow = byId("wit-history-dialog-error-row");
        if (errorRow) {
          errorRow.classList.toggle("hidden", !item.error_message);
          setText("wit-history-dialog-error", item.error_message || "");
        }
        const imageSlot = byId("wit-history-dialog-image-slot");
        imageSlot.replaceChildren(createThumbnail(item, true));
        dialog.showModal();
      })
      .catch((error) => {
        setFeedback("The scan details could not be loaded.");
        console.error("WIT scan detail request failed", error);
      });
  }

  function imageFormat(dataUrl) {
    const match = String(dataUrl || "").match(/^data:image\/([^;]+)/i);
    const format = match ? match[1].toUpperCase() : "JPEG";
    return format === "JPG" ? "JPEG" : format;
  }

  function simplePdf(lines) {
    const escapePdf = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const commands = ["BT", "/F1 10 Tf", "16 800 Td"];
    lines.forEach((line, index) => {
      if (index) commands.push("0 -16 Td");
      commands.push(`(${escapePdf(line).slice(0, 180)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n%WIT\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadReport(item) {
    if (!item) return;
    const remoteLink = document.createElement("a");
    remoteLink.href = `${API_BASE}/history/${encodeURIComponent(item.scan_id)}/report`;
    remoteLink.download = `${String(item.module || "analysis")}-${item.scan_id}-report.pdf`;
    remoteLink.rel = "noopener";
    document.body.appendChild(remoteLink);
    remoteLink.click();
    remoteLink.remove();
    setFeedback("PDF report download started.");
    return;
    const fallbackLines = [
      "WIT RESEARCH & ANALYSIS - SCAN HISTORY REPORT",
      `Module: ${labels[item.module] || item.module}`,
      `Scan ID: ${item.scan_id}`,
      `Performed: ${formatDateTime(item.created_at)}`,
      `Prediction: ${item.predicted_class || "No result"}`,
      `Confidence: ${formatConfidence(item.confidence)}`,
      `Status: ${item.status || "Not available"}`,
      `Patient name: ${item.patient_name || "Not provided"}`,
      `Age / gender: ${[item.patient_age, item.patient_gender].filter(Boolean).join(" / ") || "Not provided"}`,
      `Sample ID: ${item.patient_sample_id || "Not provided"}`,
      "Class probabilities:",
      ...Object.entries(item.class_probabilities || {}).map(([name, value]) => `  ${name}: ${(Number(value) * 100).toFixed(2)}%`),
      "Research and educational output only. Not a validated clinical diagnosis.",
    ];
    if (!window.jspdf || !window.jspdf.jsPDF) {
      saveBlob(simplePdf(fallbackLines), `${String(item.module || "analysis")}-${item.scan_id}-report.pdf`);
      return;
    }
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const navy = [8, 42, 72];
    const cyan = [35, 164, 177];
    const ink = [20, 39, 58];
    const muted = [82, 101, 119];
    const margin = 16;
    const moduleName = labels[item.module] || item.module || "Analysis";
    doc.setFillColor(...navy);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("WIT RESEARCH & ANALYSIS", margin, 12);
    doc.setFontSize(8);
    doc.setTextColor(180, 230, 234);
    doc.text("SCAN HISTORY REPORT", margin, 20);
    doc.setDrawColor(...cyan);
    doc.setLineWidth(1.2);
    doc.line(0, 28, 210, 28);
    doc.setTextColor(...ink);
    doc.setFontSize(18);
    doc.text(`${moduleName} analysis`, margin, 43);
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(`Scan ID: ${item.scan_id}`, margin, 51);
    doc.text(`Performed: ${formatDateTime(item.created_at)}`, margin, 57);
    doc.setFillColor(239, 246, 250);
    doc.roundedRect(margin, 66, 178, 35, 2, 2, "F");
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text("AI PREDICTION", margin + 8, 75);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(item.predicted_class || "No result", margin + 8, 87);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("CONFIDENCE", 115, 75);
    doc.setTextColor(...ink);
    doc.setFontSize(16);
    doc.text(formatConfidence(item.confidence), 115, 87);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text("Patient context", margin, 115);
    const patientLines = [
      `Name: ${item.patient_name || "Not provided"}`,
      `Age / gender: ${[item.patient_age, item.patient_gender].filter(Boolean).join(" / ") || "Not provided"}`,
      `Sample ID: ${item.patient_sample_id || "Not provided"}`,
      `Scan date: ${item.patient_date || "Not provided"}`,
      `Status: ${item.status || "Not available"}`,
    ];
    patientLines.forEach((line, index) => doc.text(line, margin, 124 + index * 6));
    if (item.thumbnail_data_url) {
      try {
        doc.addImage(item.thumbnail_data_url, imageFormat(item.thumbnail_data_url), margin, 160, 62, 62, undefined, "FAST");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("Uploaded image thumbnail", margin, 227);
      } catch (error) {
        console.error("WIT history report image failed", error);
        doc.setTextColor(169, 55, 66);
        doc.text("[image could not be embedded]", margin, 190);
      }
    }
    const probabilities = Object.entries(item.class_probabilities || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (probabilities.length) {
      doc.setTextColor(...ink);
      doc.setFontSize(9);
      doc.text("Class probabilities", 96, 165);
      probabilities.forEach((entry, index) => {
        const y = 175 + index * 8;
        doc.setTextColor(...ink);
        doc.text(String(entry[0]), 96, y);
        doc.setTextColor(...muted);
        doc.text(`${(Number(entry[1]) * 100).toFixed(2)}%`, 160, y);
        doc.setDrawColor(210, 220, 228);
        doc.line(96, y + 2, 178, y + 2);
        doc.setDrawColor(...cyan);
        doc.line(96, y + 2, 96 + Math.max(0, Math.min(1, Number(entry[1]))) * 82, y + 2);
      });
    }
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text("Research and educational output only. This record is not a validated clinical diagnosis.", margin, 280);
    doc.text("Walchand Institute of Technology, Solapur | WIT Research & Analysis", margin, 286);
    doc.save(`${String(item.module || "analysis")}-${item.scan_id}-report.pdf`);
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  search.addEventListener("input", () => {
    state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadHistory, 250);
  });
  [moduleFilter, statusFilter, dateFilter, sortFilter].forEach((control) => {
    control.addEventListener("change", () => {
      state.page = 1;
      loadHistory();
    });
  });
  clearButton.addEventListener("click", () => {
    search.value = "";
    moduleFilter.value = "";
    statusFilter.value = "";
    dateFilter.value = "";
    sortFilter.value = "latest";
    state.page = 1;
    loadHistory();
  });
  previousButton.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadHistory();
    }
  });
  nextButton.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadHistory();
    }
  });
  dialogClose.addEventListener("click", closeDialog);
  dialogCloseSecondary.addEventListener("click", closeDialog);
  downloadButton.addEventListener("click", () => downloadReport(currentDetail));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  loadHistory();
})();
