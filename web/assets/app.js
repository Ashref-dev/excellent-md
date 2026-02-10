const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const convertBtn = document.getElementById("convertBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const fileInfo = document.getElementById("fileInfo");
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

let currentFile = null;
let lastResult = null;

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = "status" + (tone ? " " + tone : "");
}

function setButtonsDisabled(disabled) {
  convertBtn.disabled = disabled;
  resetBtn.disabled = disabled;
}

function enableOutputActions(enabled) {
  copyAllBtn.disabled = !enabled;
  downloadAllBtn.disabled = !enabled;
}

function resetUI() {
  currentFile = null;
  lastResult = null;
  fileInput.value = "";
  setStatus("");
  setButtonsDisabled(true);
  enableOutputActions(false);
  setLoading(false);
  resultsGrid.innerHTML = "";
  resultsMeta.textContent = "Upload a file to begin.";
  fileNameEl.textContent = "No file selected";
  fileSizeEl.textContent = "Select a workbook to begin.";
  removeFileBtn.disabled = true;
  sheetFilter.value = "";
  emptyState.style.display = "block";
}

function handleFile(file) {
  if (!file) {
    return;
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    setStatus("Only .xlsx files are supported.", "error");
    return;
  }
  if (file.size > MAX_BYTES) {
    setStatus("File is too large. Max 10MB.", "error");
    return;
  }
  currentFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size) + " • Ready to convert";
  removeFileBtn.disabled = false;
  setStatus("File ready for conversion.", "success");
  setButtonsDisabled(false);
}

function buildSheetCard(sheet) {
  const card = document.createElement("div");
  card.className = "sheet-card";
  card.dataset.sheetName = sheet.name.toLowerCase();

  const header = document.createElement("div");
  header.className = "sheet-header";

  const info = document.createElement("div");
  info.className = "sheet-info";

  const title = document.createElement("div");
  title.className = "sheet-title";
  title.textContent = sheet.name;
  title.title = sheet.name;

  const meta = document.createElement("span");
  meta.className = "sheet-meta-inline";
  meta.textContent = `${sheet.row_count} rows • ${sheet.col_count} cols`;

  info.append(title, meta);

  const tabList = document.createElement("div");
  tabList.className = "tab-list";
  tabList.setAttribute("role", "tablist");

  const previewBtn = document.createElement("button");
  previewBtn.className = "tab-btn active";
  previewBtn.textContent = "Preview";
  previewBtn.setAttribute("role", "tab");

  const markdownBtn = document.createElement("button");
  markdownBtn.className = "tab-btn";
  markdownBtn.textContent = "Markdown";
  markdownBtn.setAttribute("role", "tab");

  tabList.append(previewBtn, markdownBtn);

  const actions = document.createElement("div");
  actions.className = "sheet-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "ghost-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => copyText(sheet.markdown || "", copyBtn));

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "ghost-btn";
  downloadBtn.textContent = "Download";
  downloadBtn.addEventListener("click", () => downloadText(`${sheet.name}.md`, sheet.markdown || "", downloadBtn));

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

  previewBtn.addEventListener("click", () => setActiveTab(previewBtn, markdownBtn, preview, markdownBlock));
  markdownBtn.addEventListener("click", () => setActiveTab(markdownBtn, previewBtn, markdownBlock, preview));

  card.append(preview, markdownBlock);
  return card;
}

function renderResults(result) {
  lastResult = result;
  resultsGrid.innerHTML = "";
  emptyState.style.display = "none";

  const summary = `${result.meta.processed} processed • ${result.meta.skipped_count} skipped`;
  resultsMeta.textContent = summary;

  if (result.skipped && result.skipped.length) {
    const skippedCard = document.createElement("div");
    skippedCard.className = "sheet-card";
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
  }

  result.sheets.forEach((sheet) => {
    const card = buildSheetCard(sheet);
    resultsGrid.appendChild(card);
  });

  enableOutputActions(true);
}

async function convertFile() {
  if (!currentFile) {
    return;
  }

  setStatus("Converting sheets…", "progress");
  setButtonsDisabled(true);
  enableOutputActions(false);
  setLoading(true);

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

    setStatus("Conversion complete.", "success");
    renderResults(payload);
    document.getElementById("results").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setStatus(error.message || "Conversion failed.", "error");
    enableOutputActions(false);
  } finally {
    setButtonsDisabled(false);
    setLoading(false);
  }
}

function copyText(text, button) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      setStatus("Copied to clipboard.", "success");
      showToast("Copied to clipboard");
      if (button) bumpButtonLabel(button, "Copied!");
    });
    return;
  }
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

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function setLoading(isLoading) {
  convertBtn.classList.toggle("loading", isLoading);
  convertBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function bumpButtonLabel(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}

function setActiveTab(activeBtn, inactiveBtn, activeContent, inactiveContent) {
  activeBtn.classList.add("active");
  inactiveBtn.classList.remove("active");
  activeContent.classList.remove("hidden");
  inactiveContent.classList.add("hidden");
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
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
removeFileBtn.addEventListener("click", resetUI);
sheetFilter.addEventListener("input", () => applyFilter(sheetFilter.value));

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

function applyFilter(value) {
  const term = value.trim().toLowerCase();
  const cards = resultsGrid.querySelectorAll(".sheet-card");
  let visible = 0;
  cards.forEach((card) => {
    if (!term || card.dataset.sheetName?.includes(term)) {
      card.style.display = "";
      visible += 1;
    } else {
      card.style.display = "none";
    }
  });
  if (term) {
    resultsMeta.textContent = `${visible} sheet${visible === 1 ? "" : "s"} shown`;
  } else if (lastResult) {
    resultsMeta.textContent = `${lastResult.meta.processed} processed • ${lastResult.meta.skipped_count} skipped`;
  }
}

resetUI();
