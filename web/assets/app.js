const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const convertBtn = document.getElementById("convertBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const fileNameEl = document.getElementById("fileName");
const fileSizeEl = document.getElementById("fileSize");
const removeFileBtn = document.getElementById("removeFileBtn");

const resultsGrid = document.getElementById("resultsGrid");
const resultsMeta = document.getElementById("resultsMeta");
const copyAllBtn = document.getElementById("copyAllBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const sheetFilter = document.getElementById("sheetFilter");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");

const siteHeader = document.getElementById("siteHeader");
const uploadCard = document.getElementById("uploadCard");
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const darkModeMedia = window.matchMedia("(prefers-color-scheme: dark)");

let currentFile = null;
let lastResult = null;
const THEME_PREFERENCE_KEY = "theme-preference";

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = "status" + (tone ? ` ${tone}` : "");
}

function setUploadActionsState(isBusy = false) {
  const hasFile = Boolean(currentFile);
  convertBtn.disabled = isBusy || !hasFile;
  resetBtn.disabled = isBusy || !hasFile;
  removeFileBtn.disabled = isBusy || !hasFile;
}

function enableOutputActions(enabled) {
  copyAllBtn.disabled = !enabled;
  downloadAllBtn.disabled = !enabled;
}

function setLoading(isLoading) {
  convertBtn.classList.toggle("loading", isLoading);
  convertBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function resetUI() {
  currentFile = null;
  lastResult = null;
  fileInput.value = "";
  resultsGrid.innerHTML = "";
  sheetFilter.value = "";
  emptyState.style.display = "block";

  fileNameEl.textContent = "No file selected";
  fileSizeEl.textContent = "Select a workbook to begin.";
  resultsMeta.textContent = "Upload a file to begin.";

  setStatus("");
  setLoading(false);
  setUploadActionsState(false);
  enableOutputActions(false);
}

function handleFile(file) {
  if (!file) {
    return;
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    setStatus("Only .xlsx or .xls files are supported.", "error");
    return;
  }

  if (file.size > MAX_BYTES) {
    setStatus(`File is too large. Max ${MAX_MB}MB.`, "error");
    return;
  }

  currentFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = `${formatBytes(file.size)} • Ready to convert`;

  setStatus("File ready for conversion.", "success");
  setUploadActionsState(false);
}

function buildSheetCard(sheet, index) {
  const card = document.createElement("div");
  card.className = "sheet-card";
  card.style.setProperty("--stagger", `${Math.min(index * 45, 420)}ms`);
  card.dataset.sheetName = (sheet.name || "").toLowerCase();

  const header = document.createElement("div");
  header.className = "sheet-header";

  const info = document.createElement("div");
  info.className = "sheet-info";

  const title = document.createElement("div");
  title.className = "sheet-title";
  title.textContent = sheet.name || "Untitled Sheet";
  title.title = sheet.name || "Untitled Sheet";

  const meta = document.createElement("span");
  meta.className = "sheet-meta-inline";
  meta.textContent = `${sheet.row_count || 0} rows • ${sheet.col_count || 0} cols`;

  info.append(title, meta);

  const tabList = document.createElement("div");
  tabList.className = "tab-list";
  tabList.setAttribute("role", "tablist");

  const previewBtn = document.createElement("button");
  previewBtn.className = "tab-btn active";
  previewBtn.type = "button";
  previewBtn.textContent = "Preview";
  previewBtn.setAttribute("role", "tab");
  previewBtn.setAttribute("aria-selected", "true");

  const markdownBtn = document.createElement("button");
  markdownBtn.className = "tab-btn";
  markdownBtn.type = "button";
  markdownBtn.textContent = "Markdown";
  markdownBtn.setAttribute("role", "tab");
  markdownBtn.setAttribute("aria-selected", "false");

  tabList.append(previewBtn, markdownBtn);

  const actions = document.createElement("div");
  actions.className = "sheet-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "ghost-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => copyText(sheet.markdown || "", copyBtn));

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "ghost-btn";
  downloadBtn.type = "button";
  downloadBtn.textContent = "Download";
  downloadBtn.addEventListener("click", () =>
    downloadText(`${sheet.name || "sheet"}.md`, sheet.markdown || "", downloadBtn),
  );

  actions.append(copyBtn, downloadBtn);
  header.append(info, tabList, actions);
  card.appendChild(header);

  if (sheet.warnings && sheet.warnings.length) {
    const warningList = document.createElement("div");
    warningList.className = "warning-list";
    warningList.innerHTML = sheet.warnings.map((warn) => `• ${warn}`).join("<br>");
    card.appendChild(warningList);
  }

  if (sheet.error) {
    const errorBox = document.createElement("div");
    errorBox.className = "error-box";
    errorBox.textContent = sheet.error;
    card.appendChild(errorBox);
    return card;
  }

  const preview = document.createElement("div");
  preview.className = "tab-content preview";
  preview.innerHTML = DOMPurify.sanitize(marked.parse(sheet.markdown || ""));

  const markdownBlock = document.createElement("pre");
  markdownBlock.className = "tab-content markdown-block hidden";
  markdownBlock.innerHTML = `<code>${escapeHtml(sheet.markdown || "")}</code>`;

  previewBtn.addEventListener("click", () =>
    setActiveTab(previewBtn, markdownBtn, preview, markdownBlock),
  );
  markdownBtn.addEventListener("click", () =>
    setActiveTab(markdownBtn, previewBtn, markdownBlock, preview),
  );

  card.append(preview, markdownBlock);
  return card;
}

function renderResults(result) {
  lastResult = result;
  resultsGrid.innerHTML = "";
  emptyState.style.display = "none";

  const summary = `${result.meta.processed} processed • ${result.meta.skipped_count} skipped`;
  resultsMeta.textContent = summary;

  let animationIndex = 0;

  if (result.skipped && result.skipped.length) {
    const skippedCard = document.createElement("div");
    skippedCard.className = "sheet-card";
    skippedCard.style.setProperty("--stagger", `${Math.min(animationIndex * 45, 420)}ms`);
    skippedCard.dataset.sheetName = "skipped";
    skippedCard.innerHTML = `
      <div class="sheet-header">
        <div class="sheet-info">
          <div class="sheet-title">Skipped sheets</div>
          <span class="sheet-meta-inline">Hidden or unsupported sheets</span>
        </div>
      </div>
      <div class="warning-list">${result.skipped
        .map((item) => `• ${item.name} (${item.reason})`)
        .join("<br>")}</div>
    `;
    resultsGrid.appendChild(skippedCard);
    animationIndex += 1;
  }

  result.sheets.forEach((sheet) => {
    const card = buildSheetCard(sheet, animationIndex);
    resultsGrid.appendChild(card);
    animationIndex += 1;
  });

  enableOutputActions(Boolean(result.combined_markdown));

  if (sheetFilter.value.trim()) {
    applyFilter(sheetFilter.value);
  }
}

async function convertFile() {
  if (!currentFile) {
    return;
  }

  setStatus("Converting sheets...", "progress");
  setLoading(true);
  setUploadActionsState(true);
  enableOutputActions(false);

  const formData = new FormData();
  formData.append("file", currentFile);

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Conversion failed.");
    }

    renderResults(payload);
    setStatus("Conversion complete.", "success");
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message || "Conversion failed.", "error");
    enableOutputActions(false);
  } finally {
    setLoading(false);
    setUploadActionsState(false);
  }
}

function copyText(text, button) {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setStatus("Copied to clipboard.", "success");
        showToast("Copied to clipboard");
        if (button) bumpButtonLabel(button, "Copied!");
      })
      .catch(() => fallbackCopy(text, button));
    return;
  }

  fallbackCopy(text, button);
}

function fallbackCopy(text, button) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();

  setStatus("Copied to clipboard.", "success");
  showToast("Copied to clipboard");
  if (button) bumpButtonLabel(button, "Copied!");
}

function downloadText(filename, text, button) {
  if (!text) return;

  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("Download ready");
  if (button) bumpButtonLabel(button, "Saved!");
}

function applyFilter(value) {
  const term = value.trim().toLowerCase();
  const cards = resultsGrid.querySelectorAll(".sheet-card");
  let visible = 0;

  cards.forEach((card) => {
    const matches = !term || card.dataset.sheetName?.includes(term);
    card.style.display = matches ? "" : "none";
    if (matches) {
      visible += 1;
    }
  });

  if (term) {
    resultsMeta.textContent = `${visible} section${visible === 1 ? "" : "s"} shown`;
    return;
  }

  if (lastResult) {
    resultsMeta.textContent = `${lastResult.meta.processed} processed • ${lastResult.meta.skipped_count} skipped`;
  } else {
    resultsMeta.textContent = "Upload a file to begin.";
  }
}

function setActiveTab(activeBtn, inactiveBtn, activeContent, inactiveContent) {
  activeBtn.classList.add("active");
  activeBtn.setAttribute("aria-selected", "true");

  inactiveBtn.classList.remove("active");
  inactiveBtn.setAttribute("aria-selected", "false");

  activeContent.classList.remove("hidden");
  inactiveContent.classList.add("hidden");
}

function bumpButtonLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;

  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const unit = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(unit));
  const value = bytes / Math.pow(unit, index);
  return `${value.toFixed(1)} ${sizes[index]}`;
}

function initDropzone() {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    handleFile(file);
  });

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
}

function initHeaderState() {
  if (!siteHeader) return;

  const sync = () => {
    siteHeader.classList.toggle("scrolled", window.scrollY > 18);
  };

  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

function initRevealObserver() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!revealItems.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.16 },
  );

  revealItems.forEach((item) => observer.observe(item));
}

function initUploadGlow() {
  if (!uploadCard) return;

  uploadCard.addEventListener("pointerenter", () => {
    uploadCard.classList.add("is-hovered");
  });

  uploadCard.addEventListener("pointerleave", () => {
    uploadCard.classList.remove("is-hovered");
  });

  uploadCard.addEventListener("pointermove", (event) => {
    const rect = uploadCard.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    uploadCard.style.setProperty("--glow-x", `${x}%`);
    uploadCard.style.setProperty("--glow-y", `${y}%`);
  });
}

function readThemePreference() {
  try {
    const saved = window.localStorage.getItem(THEME_PREFERENCE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch (_) {}
  return "system";
}

function writeThemePreference(theme) {
  try {
    if (theme === "system") {
      window.localStorage.removeItem(THEME_PREFERENCE_KEY);
      return;
    }
    window.localStorage.setItem(THEME_PREFERENCE_KEY, theme);
  } catch (_) {}
}

function getSystemTheme() {
  return darkModeMedia.matches ? "dark" : "light";
}

function setResolvedTheme(preference) {
  const effective = preference === "system" ? getSystemTheme() : preference;
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute(
    "data-theme-source",
    preference === "system" ? "system" : "manual",
  );
  return effective;
}

function getEffectiveTheme() {
  const explicitTheme = document.documentElement.getAttribute("data-theme");
  if (explicitTheme === "light" || explicitTheme === "dark") {
    return explicitTheme;
  }
  return getSystemTheme();
}

function syncThemeColorMeta() {
  if (!themeColorMeta) return;
  themeColorMeta.setAttribute("content", getEffectiveTheme() === "dark" ? "#0a0913" : "#f4f6ff");
}

function syncThemeToggleLabel() {
  if (!themeToggle || !themeToggleLabel) return;
  const preference = readThemePreference();
  const effective = getEffectiveTheme();
  const labels = { system: "System", light: "Light", dark: "Dark" };
  themeToggleLabel.textContent = labels[preference];
  themeToggle.setAttribute("aria-label", `Theme: ${labels[preference]} (effective ${effective})`);
}

function applyThemePreference(theme) {
  const normalized = theme === "light" || theme === "dark" ? theme : "system";
  writeThemePreference(normalized);
  setResolvedTheme(normalized);
  syncThemeColorMeta();
  syncThemeToggleLabel();
}

function initThemeControls() {
  const preference = readThemePreference();
  setResolvedTheme(preference);
  syncThemeColorMeta();
  syncThemeToggleLabel();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = readThemePreference();
      const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
      applyThemePreference(next);
    });
  }

  const onSystemThemeChange = () => {
    if (readThemePreference() === "system") {
      setResolvedTheme("system");
      syncThemeColorMeta();
      syncThemeToggleLabel();
    }
  };

  if (typeof darkModeMedia.addEventListener === "function") {
    darkModeMedia.addEventListener("change", onSystemThemeChange);
  } else if (typeof darkModeMedia.addListener === "function") {
    darkModeMedia.addListener(onSystemThemeChange);
  }
}

copyAllBtn.addEventListener("click", () => {
  if (lastResult?.combined_markdown) {
    copyText(lastResult.combined_markdown, copyAllBtn);
  }
});

downloadAllBtn.addEventListener("click", () => {
  if (lastResult?.combined_markdown) {
    downloadText("workbook.md", lastResult.combined_markdown, downloadAllBtn);
  }
});

convertBtn.addEventListener("click", convertFile);
resetBtn.addEventListener("click", resetUI);
removeFileBtn.addEventListener("click", resetUI);

fileInput.addEventListener("change", (event) => {
  handleFile(event.target.files[0]);
});

sheetFilter.addEventListener("input", () => {
  applyFilter(sheetFilter.value);
});

initDropzone();
initHeaderState();
initRevealObserver();
initUploadGlow();
initThemeControls();
resetUI();
