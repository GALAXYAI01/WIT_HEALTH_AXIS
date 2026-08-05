(function() {
  const host = window.location.hostname || "127.0.0.1";
  const localHost = host === "127.0.0.1" || host === "localhost" || window.location.protocol === "file:";
  const API_BASE = window.WIT_API_BASE || (localHost
    ? `${window.location.protocol === "https:" ? "https" : "http"}://${host}:8000`
    : window.location.origin);
  const config = window.WIT_CONFIG;

  const fileInput = document.getElementById('wit-file-input');
  const preview = document.getElementById('wit-image-preview');
  const analyzeBtn = document.getElementById('wit-analyze-btn');
  const emptyState = document.getElementById('wit-upload-empty-state');
  const resultsContainer = document.getElementById('wit-results-container');
  const predictedClassEl = document.getElementById('wit-predicted-class');
  const confidenceEl = document.getElementById('wit-confidence');
  const flagBadge = document.getElementById('wit-flag-badge');
  const probsBody = document.getElementById('wit-probs-tbody');
  const gradcamOriginal = document.getElementById('wit-gradcam-original');
  const gradcamHeatmap = document.getElementById('wit-gradcam-heatmap');
  const errorMessage = document.getElementById('wit-error-message');
  const downloadBtn = document.getElementById('wit-download-pdf-btn');
  const browseBtn = document.getElementById('wit-browse-btn');

  let previewFallback = document.getElementById('wit-preview-fallback');
  if (typeof document.createElement === 'function' && document.head) {
    const previewStyle = document.createElement('style');
    previewStyle.textContent = `
      .wit-preview-fallback { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 260px; padding: 14px 18px; border: 1px solid #c3c6cf; background: #f1f4f9; color: #43474e; text-align: center; }
      .wit-preview-fallback.hidden { display: none; }
      .wit-preview-fallback .material-symbols-outlined { color: #3f6181; font-size: 28px; }
      .wit-preview-fallback-name { max-width: 220px; overflow-wrap: anywhere; color: #002444; font: 700 12px/18px Public Sans, sans-serif; }
      .wit-preview-fallback-meta { color: #43474e; font: 400 11px/16px Public Sans, sans-serif; }
    `;
    document.head.appendChild(previewStyle);
  }

  if (!previewFallback && preview && typeof document.createElement === 'function' && typeof preview.insertAdjacentElement === 'function') {
    previewFallback = document.createElement('div');
    previewFallback.id = 'wit-preview-fallback';
    previewFallback.className = 'wit-preview-fallback hidden';
    preview.insertAdjacentElement('afterend', previewFallback);
  }

  let selectedFile = null;
  let lastResult = null;
  let lastImageDataUrl = null;

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', function() {
      fileInput.click();
    });
  }

  if (!config) { console.error("WIT_CONFIG not found"); return; }

  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
      errorMessage.classList.remove('hidden');
    }
  }

  function clearError() {
    if (errorMessage) {
      errorMessage.textContent = '';
      errorMessage.classList.add('hidden');
    }
  }

  function getFileExtension(file) {
    return (file.name.split('.').pop() || '').toLowerCase();
  }

  function isTiffLike(file) {
    return file.type === 'image/tiff' || ['tif', 'tiff', 'svs', 'ndpi'].indexOf(getFileExtension(file)) !== -1;
  }

  function resetPreview() {
    if (preview) {
      preview.classList.add('hidden');
      preview.removeAttribute('src');
    }
    if (previewFallback) {
      previewFallback.classList.add('hidden');
      previewFallback.replaceChildren();
    }
  }

  function showPreviewImage(dataUrl, file) {
    lastImageDataUrl = dataUrl;
    if (preview) {
      preview.src = dataUrl;
      preview.alt = 'Preview of ' + file.name;
      preview.classList.remove('hidden');
    }
    if (previewFallback) previewFallback.classList.add('hidden');
  }

  function showPreviewFallback(file, message) {
    lastImageDataUrl = null;
    if (preview) {
      preview.classList.add('hidden');
      preview.removeAttribute('src');
    }
    if (!previewFallback) return;
    previewFallback.replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'image';
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'wit-preview-fallback-name';
    name.textContent = file.name;
    const meta = document.createElement('span');
    meta.className = 'wit-preview-fallback-meta';
    meta.textContent = message;
    previewFallback.appendChild(icon);
    previewFallback.appendChild(name);
    previewFallback.appendChild(meta);
    previewFallback.classList.remove('hidden');
  }

  function readTiffPreview(file) {
    return new Promise(function(resolve, reject) {
      if (!window.UTIF) {
        reject(new Error('TIFF preview decoder is not loaded'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function() { reject(new Error('The selected microscopy file could not be read')); };
      reader.onload = function(event) {
        try {
          const ifds = window.UTIF.decode(event.target.result);
          if (!ifds || !ifds.length) throw new Error('No preview frame found');
          window.UTIF.decodeImage(event.target.result, ifds[0]);
          const rgba = window.UTIF.toRGBA8(ifds[0]);
          const source = document.createElement('canvas');
          source.width = ifds[0].width;
          source.height = ifds[0].height;
          const sourceContext = source.getContext('2d');
          const imageData = sourceContext.createImageData(source.width, source.height);
          imageData.data.set(rgba);
          sourceContext.putImageData(imageData, 0, 0);

          const maxDimension = 720;
          const scale = Math.min(1, maxDimension / source.width, maxDimension / source.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(source.width * scale));
          canvas.height = Math.max(1, Math.round(source.height * scale));
          canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function renderFilePreview(file) {
    resetPreview();
    if (isTiffLike(file)) {
      if (!window.UTIF) {
        showPreviewFallback(file, 'Preview unavailable; the original file is still ready for analysis.');
        return;
      }
      readTiffPreview(file)
        .then(function(dataUrl) { showPreviewImage(dataUrl, file); })
        .catch(function() { showPreviewFallback(file, 'Thumbnail unavailable; the original file is still ready for analysis.'); });
      return;
    }

    const reader = new FileReader();
    reader.onerror = function() { showPreviewFallback(file, 'Preview unavailable; the original file is still ready for analysis.'); };
    reader.onload = function(event) { showPreviewImage(event.target.result, file); };
    reader.readAsDataURL(file);
  }

  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      selectedFile = file;
      clearError();
      renderFilePreview(file);
      if (analyzeBtn) analyzeBtn.disabled = false;
    });
  }

  function switchTab(tabId) {
    const tabs = ['summary', 'probs', 'gradcam'];
    tabs.forEach(function(id) {
      const content = document.getElementById('tab-' + id);
      const btn = document.getElementById('tab-btn-' + id);
      const isActive = id === tabId;
      if (content) {
        content.style.display = isActive ? 'flex' : 'none';
        content.classList.toggle('hidden', !isActive);
      }
      if (btn) {
        btn.classList.remove('wit-tab-active', 'active', 'border-b-2', 'border-primary', 'text-primary');
        btn.classList.add('border-transparent', 'text-on-surface-variant');
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) {
          btn.classList.remove('border-transparent', 'text-on-surface-variant');
          btn.classList.add('border-b-2', 'border-primary', 'text-primary');
        }
      }
    });
  }
  window.witSwitchTab = switchTab;

  function renderResults(data) {
    lastResult = data;
    if (emptyState) emptyState.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    if (predictedClassEl) predictedClassEl.textContent = data.predicted_class;
    if (confidenceEl) confidenceEl.textContent = (data.confidence * 100).toFixed(2) + '%';

    const isFlagged = config.flaggedClasses && config.flaggedClasses.indexOf(data.predicted_class) !== -1;
    if (flagBadge) {
      if (isFlagged) {
        flagBadge.textContent = 'FLAGGED: ' + data.predicted_class.toUpperCase();
        flagBadge.classList.remove('hidden');
      } else {
        flagBadge.classList.add('hidden');
      }
    }

    if (probsBody) {
      probsBody.innerHTML = '';
      const entries = Object.entries(data.class_probabilities).sort(function(a, b) { return b[1] - a[1]; });
      entries.forEach(function(entry) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.className = 'p-3 border-b border-r border-outline-variant font-data-display text-data-display';
        nameCell.textContent = entry[0];
        const valCell = document.createElement('td');
        valCell.className = 'p-3 border-b border-outline-variant font-data-display text-data-display';
        valCell.textContent = entry[1].toFixed(4);
        row.appendChild(nameCell);
        row.appendChild(valCell);
        probsBody.appendChild(row);
      });
    }

    if (gradcamOriginal && lastImageDataUrl) gradcamOriginal.src = lastImageDataUrl;
    if (gradcamHeatmap) gradcamHeatmap.src = 'data:image/png;base64,' + data.gradcam_image_base64;

    if (downloadBtn) downloadBtn.disabled = false;
  }
  window.witRenderResults = renderResults;

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', function() {
      if (!selectedFile) { showError('Please choose an image first.'); return; }
      clearError();
      analyzeBtn.disabled = true;
      const originalLabel = analyzeBtn.textContent;
      analyzeBtn.textContent = 'Analyzing...';

      const formData = new FormData();
      formData.append('file', selectedFile);
      ['name', 'age', 'gender', 'sample-id', 'date'].forEach(function(field) {
        const input = document.getElementById('wit-patient-' + field);
        if (input && String(input.value || '').trim()) {
          formData.append('patient_' + field.replace('-', '_'), input.value.trim());
        }
      });

      fetch(API_BASE + '/predict/' + config.module, { method: 'POST', body: formData, credentials: 'include' })
        .then(function(response) {
          if (!response.ok) {
            return response.json().then(function(errBody) {
              throw new Error(errBody.detail || ('Request failed with status ' + response.status));
            });
          }
          return response.json();
        })
        .then(function(data) {
          renderResults(data);
          switchTab('summary');
        })
        .catch(function(err) {
          showError(err.message);
        })
        .finally(function() {
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = originalLabel;
        });
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      if (!lastResult) return;
      generatePdfReport(lastResult, config, lastImageDataUrl);
    });
  }

  function generatePdfReport(data, cfg, imageDataUrl) {
    const jsPDFCtor = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    if (!jsPDFCtor) { showError('PDF library not loaded.'); return; }
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal && doc.internal.pageSize && typeof doc.internal.pageSize.getWidth === 'function'
      ? doc.internal.pageSize.getWidth() : 210;
    const pageHeight = doc.internal && doc.internal.pageSize && typeof doc.internal.pageSize.getHeight === 'function'
      ? doc.internal.pageSize.getHeight() : 297;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const colors = {
      navy: [8, 42, 72],
      blue: [28, 86, 128],
      cyan: [35, 164, 177],
      green: [31, 124, 93],
      amber: [174, 110, 22],
      red: [169, 55, 66],
      ink: [20, 39, 58],
      muted: [82, 101, 119],
      border: [196, 207, 218],
      paleBlue: [239, 246, 250],
      paleCyan: [232, 247, 247],
      paleGreen: [235, 247, 241],
      paleAmber: [253, 246, 232],
      paleRed: [253, 239, 240],
      white: [255, 255, 255]
    };
    const generatedAt = new Date();
    const generatedIso = generatedAt.toISOString();
    const dateStamp = generatedIso.slice(0, 10).replace(/-/g, '');
    const reportId = 'WIT-' + String(cfg.module || 'analysis').toUpperCase() + '-' + dateStamp + '-' + String(Math.floor(1000 + Math.random() * 9000));
    const moduleName = String(cfg.module || 'analysis');
    const moduleTitle = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    const modelVersion = data.model_version || cfg.modelVersion || ('WIT ' + moduleTitle + ' classifier');
    const softwareVersion = cfg.softwareVersion || 'Research platform v2.0';
    const confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
    const confidenceLabel = (confidence * 100).toFixed(2) + '%';
    const probabilityEntries = Object.entries(data.class_probabilities || {}).map(function(entry) {
      return [String(entry[0]), Math.max(0, Number(entry[1]) || 0)];
    }).sort(function(a, b) { return b[1] - a[1]; });
    const isFlagged = cfg.flaggedClasses && cfg.flaggedClasses.indexOf(data.predicted_class) !== -1;
    const statusLabel = isFlagged ? 'FLAGGED FOR REVIEW' : 'RESEARCH OUTPUT';
    const statusColor = isFlagged ? colors.red : colors.green;
    const statusFill = isFlagged ? colors.paleRed : colors.paleGreen;

    function setFill(color) {
      if (doc.setFillColor) doc.setFillColor.apply(doc, color);
    }

    function setStroke(color) {
      if (doc.setDrawColor) doc.setDrawColor.apply(doc, color);
    }

    function setText(color) {
      if (doc.setTextColor) doc.setTextColor.apply(doc, color);
    }

    function setFont(size, style, color) {
      if (doc.setFont) doc.setFont('helvetica', style || 'normal');
      if (doc.setFontSize) doc.setFontSize(size);
      if (color) setText(color);
    }

    function drawBox(x, boxY, width, height, fill, stroke, radius) {
      setFill(fill || colors.white);
      setStroke(stroke || fill || colors.border);
      if (typeof doc.roundedRect === 'function') {
        doc.roundedRect(x, boxY, width, height, radius || 2, radius || 2, 'FD');
      } else {
        doc.rect(x, boxY, width, height, 'FD');
      }
    }

    function drawLine(x1, y1, x2, y2, color, width) {
      setStroke(color || colors.border);
      if (doc.setLineWidth) doc.setLineWidth(width || 0.25);
      doc.line(x1, y1, x2, y2);
    }

    function drawText(value, x, textY, size, style, color) {
      setFont(size || 9, style || 'normal', color || colors.ink);
      doc.text(String(value == null ? '' : value), x, textY);
    }

    function drawWrapped(value, x, textY, width, size, lineHeight, style, color) {
      setFont(size || 9, style || 'normal', color || colors.ink);
      const lines = typeof doc.splitTextToSize === 'function'
        ? doc.splitTextToSize(String(value == null ? '' : value), width)
        : [String(value == null ? '' : value)];
      doc.text(lines, x, textY);
      return textY + lines.length * (lineHeight || 4);
    }

    function fieldValue(ids, fallback) {
      for (let i = 0; i < ids.length; i += 1) {
        const el = document && typeof document.getElementById === 'function' ? document.getElementById(ids[i]) : null;
        const value = el ? (el.value != null ? el.value : el.textContent) : '';
        if (String(value || '').trim()) return String(value).trim();
      }
      return fallback || 'Not provided';
    }

    const patient = {
      name: fieldValue(['wit-patient-name'], 'Not provided'),
      age: fieldValue(['wit-patient-age'], 'Not provided'),
      gender: fieldValue(['wit-patient-gender'], 'Not provided'),
      patientId: fieldValue(['wit-patient-id', 'wit-patient-identifier'], 'Not provided'),
      sampleId: fieldValue(['wit-patient-sample-id'], 'Not provided'),
      testDate: fieldValue(['wit-patient-date'], 'Not provided'),
      researcher: fieldValue(['wit-referring-researcher', 'wit-patient-researcher'], 'Not provided'),
      institution: fieldValue(['wit-institution'], 'WIT Research & Analysis Laboratory')
    };

    if (doc.setProperties) {
      doc.setProperties({
        title: 'WIT Research & Analysis - ' + moduleTitle + ' Research Report',
        subject: 'AI-based microscopic cell analysis research output',
        author: 'Walchand Institute of Technology, Solapur'
      });
    }

    function drawHeader() {
      setFill(colors.navy);
      doc.rect(0, 0, pageWidth, 32, 'F');
      setFill(colors.cyan);
      doc.rect(0, 32, pageWidth, 2, 'F');
      setFill(colors.white);
      setStroke(colors.white);
      if (typeof doc.roundedRect === 'function') doc.roundedRect(margin, 7, 20, 17, 2, 2, 'F');
      else doc.rect(margin, 7, 20, 17, 'F');
      drawText('WIT', margin + 4, 18, 13, 'bold', colors.navy);
      drawText('WALCHAND INSTITUTE OF TECHNOLOGY, SOLAPUR', 39, 11, 8, 'bold', colors.white);
      drawText('Department of Information Technology', 39, 17, 7.5, 'normal', [219, 237, 243]);
      drawText('WIT RESEARCH & ANALYSIS LABORATORY', 39, 23, 7.5, 'bold', [168, 226, 229]);
    }

    function drawPageHeading(kicker, title, subtitle, headingY) {
      drawText(kicker, margin, headingY, 7, 'bold', colors.cyan);
      drawText(title, margin, headingY + 8, 17, 'bold', colors.navy);
      if (subtitle) drawWrapped(subtitle, margin, headingY + 14, contentWidth, 8.5, 4, 'normal', colors.muted);
    }

    function drawKeyValue(label, value, x, valueY, width) {
      drawText(label.toUpperCase(), x, valueY, 6.5, 'bold', colors.muted);
      const displayValue = String(value || 'Not provided');
      const lines = typeof doc.splitTextToSize === 'function'
        ? doc.splitTextToSize(displayValue, width) : [displayValue];
      drawText(lines[0], x, valueY + 6, 8.2, 'normal', displayValue === 'Not provided' ? colors.muted : colors.ink);
    }

    function drawSectionLabel(label, sectionY) {
      drawText(label.toUpperCase(), margin, sectionY, 7, 'bold', colors.blue);
      drawLine(margin + 35, sectionY - 1.5, pageWidth - margin, sectionY - 1.5, colors.border, 0.35);
    }

    function drawConfidenceBar(x, barY, width, value) {
      setFill([220, 229, 235]);
      if (typeof doc.roundedRect === 'function') doc.roundedRect(x, barY, width, 4, 2, 2, 'F');
      else doc.rect(x, barY, width, 4, 'F');
      setFill(value >= 0.8 ? colors.green : colors.amber);
      if (typeof doc.roundedRect === 'function') doc.roundedRect(x, barY, Math.max(2, width * value), 4, 2, 2, 'F');
      else doc.rect(x, barY, Math.max(2, width * value), 4, 'F');
    }

    function drawBadge(label, x, badgeY, width, fill, color) {
      setFill(fill);
      setStroke(fill);
      if (typeof doc.roundedRect === 'function') doc.roundedRect(x, badgeY, width, 8, 2, 2, 'F');
      else doc.rect(x, badgeY, width, 8, 'F');
      drawText(label, x + 3, badgeY + 5.5, 6.3, 'bold', color);
    }

    function drawMetaPanel(panelY) {
      drawBox(margin, panelY, contentWidth, 32, colors.paleBlue, colors.border, 2);
      drawText('REPORT CONTROL', margin + 5, panelY + 7, 7, 'bold', colors.blue);
      const columns = [
        ['Report ID', reportId],
        ['Generated', generatedAt.toLocaleString()],
        ['Model version', modelVersion],
        ['Software', softwareVersion]
      ];
      const columnWidth = (contentWidth - 10) / 2;
      columns.forEach(function(column, index) {
        const row = Math.floor(index / 2);
        const col = index % 2;
        drawKeyValue(column[0], column[1], margin + 5 + columnWidth * col, panelY + 14 + row * 11, columnWidth - 4);
      });
    }

    function drawPatientPanel(panelY) {
      const panelHeight = 61;
      drawBox(margin, panelY, contentWidth, panelHeight, colors.white, colors.border, 2);
      setFill(colors.paleCyan);
      doc.rect(margin, panelY, contentWidth, 11, 'F');
      drawText('PATIENT & SAMPLE CONTEXT', margin + 5, panelY + 7, 7, 'bold', colors.navy);
      const left = margin + 5;
      const right = margin + 96;
      const rowWidth = 81;
      const rows = [
        [['Patient name', patient.name], ['Age', patient.age]],
        [['Gender', patient.gender], ['Patient ID', patient.patientId]],
        [['Sample ID', patient.sampleId], ['Test date', patient.testDate]],
        [['Referring researcher', patient.researcher], ['Institution', patient.institution]]
      ];
      rows.forEach(function(row, index) {
        const rowY = panelY + 17 + index * 11.5;
        if (index > 0) drawLine(left, rowY - 3.5, pageWidth - margin - 5, rowY - 3.5, [226, 233, 238], 0.2);
        drawKeyValue(row[0][0], row[0][1], left, rowY, rowWidth);
        drawKeyValue(row[1][0], row[1][1], right, rowY, rowWidth);
      });
    }

    function drawSummaryPanel(panelY) {
      drawBox(margin, panelY, contentWidth, 49, colors.paleBlue, colors.border, 2);
      drawText('ANALYSIS SUMMARY', margin + 5, panelY + 7, 7, 'bold', colors.blue);
      drawText('AI PREDICTION', margin + 5, panelY + 18, 6.5, 'bold', colors.muted);
      drawText(data.predicted_class || 'Unavailable', margin + 5, panelY + 29, 16, 'bold', isFlagged ? colors.red : colors.navy);
      drawText('MODEL CONFIDENCE', margin + 79, panelY + 18, 6.5, 'bold', colors.muted);
      drawText(confidenceLabel, margin + 79, panelY + 29, 16, 'bold', colors.navy);
      drawConfidenceBar(margin + 79, panelY + 35, 74, confidence);
      drawText('confidence score', margin + 79, panelY + 44, 6.5, 'normal', colors.muted);
      drawBadge(statusLabel, pageWidth - margin - 40, panelY + 11, 35, statusFill, statusColor);
      drawText('Interpret as research evidence, not a clinical decision.', pageWidth - margin - 67, panelY + 32, 6.5, 'normal', colors.muted);
    }

    function drawProbabilityPanel(panelY) {
      const rowHeight = 8;
      const panelHeight = 16 + Math.max(1, probabilityEntries.length) * rowHeight;
      drawBox(margin, panelY, contentWidth, panelHeight, colors.white, colors.border, 2);
      drawText('CLASS PROBABILITIES', margin + 5, panelY + 7, 7, 'bold', colors.blue);
      probabilityEntries.forEach(function(entry, index) {
        const rowY = panelY + 13 + index * rowHeight;
        const value = Math.max(0, Math.min(1, entry[1]));
        if (index > 0) drawLine(margin + 5, rowY - 4.5, pageWidth - margin - 5, rowY - 4.5, [231, 236, 240], 0.2);
        drawText(entry[0], margin + 5, rowY, 8, 'normal', colors.ink);
        drawConfidenceBar(margin + 66, rowY - 3.5, 76, value);
        drawText((value * 100).toFixed(2) + '%', pageWidth - margin - 28, rowY, 8, 'bold', colors.navy);
      });
      return panelHeight;
    }

    function detectImageFormat(dataUrl) {
      const match = /^data:image\/([^;,]+)/i.exec(dataUrl || '');
      if (!match) return '';
      const subtype = match[1].toLowerCase();
      if (subtype === 'png') return 'PNG';
      if (subtype === 'jpeg' || subtype === 'jpg') return 'JPEG';
      return subtype.toUpperCase();
    }

    function addImageOrFallback(dataUrl, format, x, imageY, label, caption) {
      const cardWidth = 87;
      const imageX = x + 4;
      const imageTop = imageY + 16;
      drawBox(x, imageY, cardWidth, 82, colors.white, colors.border, 2);
      drawText(label.toUpperCase(), x + 5, imageY + 9, 6.5, 'bold', colors.blue);
      if (!dataUrl) {
        drawText('[image could not be embedded]', imageX, imageTop + 22, 7.5, 'bold', colors.red);
        drawWrapped(caption, imageX, imageTop + 31, cardWidth - 8, 7, 3.5, 'normal', colors.muted);
        return;
      }
      try {
        doc.addImage(dataUrl, format, imageX, imageTop, cardWidth - 8, 52);
      } catch (error) {
        console.error('Failed to embed PDF image:', error);
        drawText('[image could not be embedded]', imageX, imageTop + 22, 7.5, 'bold', colors.red);
      }
      drawWrapped(caption, imageX, imageY + 75, cardWidth - 8, 6.8, 3.4, 'normal', colors.muted);
    }

    function drawFindingCard(x, cardY, width, label, value, fill, accent) {
      drawBox(x, cardY, width, 52, fill, colors.border, 2);
      setFill(accent);
      doc.rect(x, cardY, 3, 52, 'F');
      drawText(label.toUpperCase(), x + 8, cardY + 10, 6.5, 'bold', colors.muted);
      drawWrapped(value, x + 8, cardY + 21, width - 14, 8.5, 4.2, 'bold', colors.navy);
    }

    function drawNotice(title, body, noticeY, fill, accent, height) {
      drawBox(margin, noticeY, contentWidth, height, fill, colors.border, 2);
      setFill(accent);
      doc.rect(margin, noticeY, 3, height, 'F');
      drawText(title.toUpperCase(), margin + 9, noticeY + 10, 7, 'bold', accent);
      drawWrapped(body, margin + 9, noticeY + 19, contentWidth - 18, 8.2, 4, 'normal', colors.ink);
    }

    function drawFooter(pageNumber, totalPages) {
      const footerY = pageHeight - 17;
      drawLine(margin, footerY, pageWidth - margin, footerY, colors.border, 0.35);
      drawText('WIT RESEARCH & ANALYSIS LABORATORY', margin, footerY + 7, 6.5, 'bold', colors.navy);
      drawText('Research use only | ' + softwareVersion, margin + 67, footerY + 7, 6.2, 'normal', colors.muted);
      const pageLabel = 'Page ' + pageNumber + ' of ' + totalPages;
      const pageX = pageWidth - margin - (typeof doc.getTextWidth === 'function' ? doc.getTextWidth(pageLabel) : 22);
      drawText(pageLabel, pageX, footerY + 7, 6.5, 'bold', colors.navy);
      drawText('Generated ' + generatedAt.toLocaleString(), margin, footerY + 12, 5.8, 'normal', colors.muted);
      drawText('AI-Based Microscopic Cell Analysis System | Walchand Institute of Technology, Solapur', margin + 67, footerY + 12, 5.8, 'normal', colors.muted);
    }

    drawHeader();
    drawText('OFFICIAL RESEARCH REPORT', margin, 45, 7, 'bold', colors.cyan);
    drawText(moduleTitle + ' Microscopic Analysis', margin, 54, 18, 'bold', colors.navy);
    drawWrapped('AI-based research output with transparent probability and Grad-CAM evidence for academic review.', margin, 61, contentWidth, 8.5, 4, 'normal', colors.muted);
    drawMetaPanel(70);
    drawPatientPanel(106);
    drawSummaryPanel(173);
    drawProbabilityPanel(228);

    doc.addPage();
    drawPageHeading('02 / VISUAL EVIDENCE', 'Image evidence & findings', 'The original sample is shown beside the Grad-CAM activation overlay so the model output remains inspectable.', 20);
    addImageOrFallback(imageDataUrl, detectImageFormat(imageDataUrl), margin, 36, 'Uploaded microscopy image', 'Original image supplied for this analysis.');
    const gradcamDataUrl = data.gradcam_image_base64 ? 'data:image/png;base64,' + data.gradcam_image_base64 : '';
    addImageOrFallback(gradcamDataUrl, 'PNG', margin + 95, 36, 'Grad-CAM activation overlay', 'Highlighted regions indicate where the model concentrated learned visual evidence.');
    drawSectionLabel('Analysis findings', 132);
    const findingWidth = (contentWidth - 10) / 3;
    drawFindingCard(margin, 139, findingWidth, 'Detected class', String(data.predicted_class || 'Unavailable'), colors.paleRed, isFlagged ? colors.red : colors.blue);
    drawFindingCard(margin + findingWidth + 5, 139, findingWidth, 'Prediction confidence', confidenceLabel, colors.paleGreen, colors.green);
    drawFindingCard(margin + (findingWidth + 5) * 2, 139, findingWidth, 'Model observation', 'Grad-CAM generated', colors.paleCyan, colors.cyan);
    drawNotice('Interpretation', 'This output is a research signal for comparison and education. The heatmap shows visual associations learned by the model; it is not a causal explanation and does not replace expert review.', 201, colors.paleAmber, colors.amber, 40);
    drawNotice('Method note', 'The report records the predicted class, confidence, class probabilities, uploaded image, and Grad-CAM visualization returned by the selected WIT model.', 249, colors.paleBlue, colors.blue, 27);

    doc.addPage();
    drawPageHeading('03 / RESPONSIBLE USE', 'Research context & governance', 'This document is designed for academic review, education, and reproducible discussion of model behavior.', 20);
    drawNotice('Research disclaimer', 'WIT Research & Analysis is an educational research prototype, not a validated clinical diagnostic tool or medical device. Do not use this report alone for diagnosis, triage, treatment, or other clinical decisions. Consult a qualified medical professional for real-world interpretation.', 36, colors.paleRed, colors.red, 48);
    drawNotice('Ethics & data statement', 'The models are intended for de-identified research imagery and transparent model inspection. Patient details entered into this browser session are used to label the downloaded report; users remain responsible for appropriate consent, privacy, and institutional handling of any data.', 94, colors.paleCyan, colors.cyan, 48);
    drawNotice('Institutional statement', 'WIT Research & Analysis is developed at Walchand Institute of Technology (WIT), Solapur, established in 1983 and named after industrialist Seth Walchand Hirachand. WIT is the oldest engineering college in Solapur and its first autonomous institute, accredited NAAC A+ and affiliated with Punyashlok Ahilyadevi Holkar Solapur University.', 152, colors.paleGreen, colors.green, 55);
    drawNotice('Report provenance', 'Generated locally from the selected module response. Report ID: ' + reportId + '. Model version: ' + modelVersion + '.', 219, colors.paleBlue, colors.blue, 34);
    drawText('WIT Research & Analysis Laboratory | Department of Information Technology', margin, 270, 7.5, 'bold', colors.navy);
    drawText('Official research report - retain with the associated sample record when appropriate.', margin, 277, 7, 'normal', colors.muted);

    const totalPages = typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : 3;
    for (let page = 1; page <= totalPages; page += 1) {
      if (typeof doc.setPage === 'function') doc.setPage(page);
      drawFooter(page, totalPages);
    }

    doc.save(moduleName + '-detection-report.pdf');
  }
  window.witGeneratePdfReport = generatePdfReport;
})();
