import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.mjs";

const MM_TO_CSS_PX = 96 / 25.4;
const BASE_RENDER_SCALE = 1.35;
const STORAGE_PREFIX = "pdf-hanko-reader:v0.2:";
const HISTORY_KEY = "pdf-hanko-reader:history:v0.2";
const FILE_HANDLE_DB_NAME = "pdf-hanko-reader-file-handles";
const FILE_HANDLE_STORE_NAME = "handles";
const MAX_HISTORY_ITEMS = 12;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const TARGET_TEXT_PX = 17;

const stamps = [
  {
    id: "panda-good-job",
    label: "パンダ\nグッジョブ",
    displayName: "パンダ『グッジョブ』",
    colorName: "みどり",
    colorClass: "green",
    sizeLabel: "ふつう",
    sizeMm: 18,
  },
  {
    id: "check-required",
    label: "要\nチェック",
    displayName: "要チェック",
    colorName: "あか",
    colorClass: "red",
    sizeLabel: "ふつう",
    sizeMm: 18,
  },
  {
    id: "read-later",
    label: "あとで\n読む",
    displayName: "あとで読む",
    colorName: "あお",
    colorClass: "blue",
    sizeLabel: "ふつう",
    sizeMm: 18,
  },
  {
    id: "ok-large",
    label: "OK!",
    displayName: "OK！",
    colorName: "みどり",
    colorClass: "green",
    sizeLabel: "大きい",
    sizeMm: 28,
  },
  {
    id: "tiny-note",
    label: "ちょこっと\nメモ",
    displayName: "ちょこっとメモ",
    colorName: "あお",
    colorClass: "blue",
    sizeLabel: "ちょこっと",
    sizeMm: 12,
  },
];

const state = {
  pdfDoc: null,
  documentKey: null,
  documentLabel: null,
  sourceType: null,
  sourceUrl: null,
  selectedStampId: stamps[0].id,
  placements: [],
  currentPage: 1,
  zoom: 1,
  pageLayer: null,
  renderToken: 0,
  lastSavedAt: null,
  lastAutoZoomInfo: null,
  currentFileHandle: null,
  pendingHorizontalScrollRatio: null,
};

const elements = {
  openLocalPdfButton: document.querySelector("#openLocalPdfButton"),
  pdfInput: document.querySelector("#pdfInput"),
  pdfUrlInput: document.querySelector("#pdfUrlInput"),
  urlForm: document.querySelector("#urlForm"),
  jsonInput: document.querySelector("#jsonInput"),
  stampPalette: document.querySelector("#stampPalette"),
  viewerScroller: document.querySelector("#viewerScroller"),
  pdfViewer: document.querySelector("#pdfViewer"),
  emptyState: document.querySelector("#emptyState"),
  jsonOutput: document.querySelector("#jsonOutput"),
  copyJsonButton: document.querySelector("#copyJsonButton"),
  downloadJsonButton: document.querySelector("#downloadJsonButton"),
  documentLabel: document.querySelector("#documentLabel"),
  saveStatus: document.querySelector("#saveStatus"),
  historyList: document.querySelector("#historyList"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageNumberInput: document.querySelector("#pageNumberInput"),
  pageTotalLabel: document.querySelector("#pageTotalLabel"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomResetButton: document.querySelector("#zoomResetButton"),
  autoZoomButton: document.querySelector("#autoZoomButton"),
  zoomSlider: document.querySelector("#zoomSlider"),
  horizontalScrollRange: document.querySelector("#horizontalScrollRange"),
  zoomLabel: document.querySelector("#zoomLabel"),
};

function init() {
  renderStampPalette();
  renderHistory();
  updateDocumentInfo();
  updateToolbarState();
  updateJsonOutput();

  elements.openLocalPdfButton.addEventListener("click", openLocalPdf);
  elements.pdfInput.addEventListener("change", handlePdfInput);
  elements.urlForm.addEventListener("submit", handleUrlSubmit);
  elements.jsonInput.addEventListener("change", handleJsonInput);
  elements.copyJsonButton.addEventListener("click", copyJson);
  elements.downloadJsonButton.addEventListener("click", downloadJson);
  elements.clearHistoryButton.addEventListener("click", clearHistory);
  elements.prevPageButton.addEventListener("click", () => movePage(-1));
  elements.nextPageButton.addEventListener("click", () => movePage(1));
  elements.pageNumberInput.addEventListener("change", handlePageNumberChange);
  elements.zoomOutButton.addEventListener("click", () => changeZoom(-ZOOM_STEP));
  elements.zoomInButton.addEventListener("click", () => changeZoom(ZOOM_STEP));
  elements.zoomResetButton.addEventListener("click", resetZoom);
  elements.autoZoomButton.addEventListener("click", applyReadableZoom);
  elements.zoomSlider.addEventListener("input", handleZoomSliderInput);
  elements.horizontalScrollRange.addEventListener("input", handleHorizontalScrollRangeInput);
  elements.viewerScroller.addEventListener("scroll", updateHorizontalScrollControls, { passive: true });
  window.addEventListener("resize", () => {
    rerenderPlacedStamps();
    updateHorizontalScrollControls();
  });
}

function renderStampPalette() {
  elements.stampPalette.replaceChildren();

  for (const stamp of stamps) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stamp-option";
    button.setAttribute("aria-pressed", String(stamp.id === state.selectedStampId));
    button.addEventListener("click", () => {
      state.selectedStampId = stamp.id;
      renderStampPalette();
    });

    const previewWrap = document.createElement("div");
    previewWrap.className = "stamp-preview-wrap";
    previewWrap.append(createStampElement(stamp));

    const meta = document.createElement("div");
    meta.className = "stamp-meta";
    meta.innerHTML = `
      <strong>${escapeHtml(stamp.displayName)}</strong>
      <span>${escapeHtml(stamp.colorName)} / ${escapeHtml(stamp.sizeLabel)} / ${stamp.sizeMm}mm</span>
    `;

    button.append(previewWrap, meta);
    elements.stampPalette.append(button);
  }
}

async function openLocalPdf() {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "PDF",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });

      if (!handle) return;
      const file = await handle.getFile();
      await loadPdfFromFile(file, { handle });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("ファイルピッカーを使えなかったため、通常のファイル選択に戻します。", error);
    }
  }

  elements.pdfInput.click();
}

async function handlePdfInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  await loadPdfFromFile(file);
  event.target.value = "";
}

async function handleUrlSubmit(event) {
  event.preventDefault();
  const url = elements.pdfUrlInput.value.trim();
  if (!url) return;

  await loadPdfFromUrl(url);
}

async function loadPdfFromFile(file, options = {}) {
  try {
    setStatus("PDFを読み込んでいます…");
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    state.pdfDoc = pdfDoc;
    state.documentKey = `file:${file.name}`;
    state.documentLabel = file.name;
    state.sourceType = "file";
    state.sourceUrl = null;
    state.currentFileHandle = options.handle ?? null;
    state.currentPage = 1;
    state.zoom = await estimateReadableZoom(pdfDoc);
    state.lastAutoZoomInfo = "文字サイズまたはページ幅から初期倍率を自動調整しました。";

    restorePlacementsForCurrentDocument({ restoreView: true });
    const hasFileHandle = await rememberFileHandle(state.documentKey, options.handle);
    addHistoryEntry({
      key: state.documentKey,
      label: state.documentLabel,
      sourceType: state.sourceType,
      url: state.sourceUrl,
      pageCount: pdfDoc.numPages,
      hasFileHandle,
    });

    await renderCurrentPage();
    updateDocumentInfo();
    updateToolbarState();
    updateJsonOutput();
  } catch (error) {
    showLoadError(error, "ローカルPDFを開けませんでした。");
  }
}

async function loadPdfFromUrl(url) {
  try {
    const normalizedUrl = new URL(url).href;
    setStatus("URL PDFを読み込んでいます…");
    const pdfDoc = await pdfjsLib.getDocument({ url: normalizedUrl }).promise;

    state.pdfDoc = pdfDoc;
    state.documentKey = `url:${normalizedUrl}`;
    state.documentLabel = normalizedUrl;
    state.sourceType = "url";
    state.sourceUrl = normalizedUrl;
    state.currentFileHandle = null;
    state.currentPage = 1;
    state.zoom = await estimateReadableZoom(pdfDoc);
    state.lastAutoZoomInfo = "文字サイズまたはページ幅から初期倍率を自動調整しました。";

    restorePlacementsForCurrentDocument({ restoreView: true });
    addHistoryEntry({
      key: state.documentKey,
      label: state.documentLabel,
      sourceType: state.sourceType,
      url: state.sourceUrl,
      pageCount: pdfDoc.numPages,
    });

    await renderCurrentPage();
    updateDocumentInfo();
    updateToolbarState();
    updateJsonOutput();
  } catch (error) {
    showLoadError(
      error,
      "URL PDFを開けませんでした。PDF配信元のCORS制限により、ブラウザから直接読めない場合があります。"
    );
  }
}

async function renderCurrentPage() {
  if (!state.pdfDoc) return;

  const token = ++state.renderToken;
  const scrollSnapshot = getScrollSnapshot();
  const pageNumber = state.currentPage;
  const page = await state.pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: BASE_RENDER_SCALE * state.zoom });

  if (token !== state.renderToken) return;

  elements.pdfViewer.replaceChildren();
  elements.emptyState.style.display = "none";
  state.pageLayer = null;

  elements.pdfViewer.style.width = `${viewport.width}px`;

  const pageWrap = document.createElement("div");
  pageWrap.className = "page-wrap";
  pageWrap.style.width = `${viewport.width}px`;
  pageWrap.style.height = `${viewport.height}px`;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const stampLayer = document.createElement("div");
  stampLayer.className = "stamp-layer";
  stampLayer.dataset.pageNumber = String(pageNumber);
  stampLayer.addEventListener("click", handleStampLayerClick);

  pageWrap.append(canvas, stampLayer);
  elements.pdfViewer.append(pageWrap);
  state.pageLayer = stampLayer;

  await page.render({ canvasContext: context, viewport }).promise;

  if (token !== state.renderToken) return;

  rerenderPlacedStamps();
  restoreScrollFromSnapshot(scrollSnapshot);
  updateToolbarState();
  scheduleHorizontalScrollControlsUpdate();
  persistViewState();
}

function handleStampLayerClick(event) {
  if (!state.pdfDoc || !state.pageLayer) return;

  const layer = event.currentTarget;
  const pageNumber = Number(layer.dataset.pageNumber);
  const rect = layer.getBoundingClientRect();
  const stamp = getSelectedStamp();

  const rawXRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const rawYRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const { xMarginRatio, yMarginRatio } = getStampMarginRatios(stamp, layer);
  const xRatio = clamp(rawXRatio, xMarginRatio, 1 - xMarginRatio);
  const yRatio = clamp(rawYRatio, yMarginRatio, 1 - yMarginRatio);

  const placement = {
    id: crypto.randomUUID(),
    pageNumber,
    stampId: stamp.id,
    stampName: stamp.displayName,
    colorName: stamp.colorName,
    sizeLabel: stamp.sizeLabel,
    sizeMm: stamp.sizeMm,
    xRatio: roundRatio(xRatio),
    yRatio: roundRatio(yRatio),
    createdAt: new Date().toISOString(),
  };

  state.placements.push(placement);
  renderPlacement(placement);
  saveCurrentDocument();
}

function renderPlacement(placement) {
  const layer = state.pageLayer;
  if (!layer || Number(layer.dataset.pageNumber) !== placement.pageNumber) return;

  const stamp = stamps.find((item) => item.id === placement.stampId);
  if (!stamp) return;

  const element = createStampElement(stamp);
  element.classList.add("placed-stamp");
  element.dataset.placementId = placement.id;

  const sizePx = mmToCssPx(placement.sizeMm) * state.zoom;
  const layerWidth = layer.clientWidth;
  const layerHeight = layer.clientHeight;

  const maxLeft = Math.max(0, layerWidth - sizePx);
  const maxTop = Math.max(0, layerHeight - sizePx);
  const left = clamp(placement.xRatio * layerWidth - sizePx / 2, 0, maxLeft);
  const top = clamp(placement.yRatio * layerHeight - sizePx / 2, 0, maxTop);

  element.style.width = `${sizePx}px`;
  element.style.height = `${sizePx}px`;
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;

  layer.append(element);
}

function getStampMarginRatios(stamp, layer) {
  const sizePx = mmToCssPx(stamp.sizeMm) * state.zoom;
  const layerWidth = Math.max(1, layer.clientWidth);
  const layerHeight = Math.max(1, layer.clientHeight);

  return {
    xMarginRatio: Math.min(0.5, sizePx / 2 / layerWidth),
    yMarginRatio: Math.min(0.5, sizePx / 2 / layerHeight),
  };
}

function rerenderPlacedStamps() {
  if (!state.pageLayer) return;

  state.pageLayer.querySelectorAll(".placed-stamp").forEach((item) => item.remove());

  for (const placement of state.placements) {
    renderPlacement(placement);
  }
}

function createStampElement(stamp) {
  const element = document.createElement("span");
  element.className = `stamp color-${stamp.colorClass} ${sizeClass(stamp.sizeMm)}`;
  element.textContent = stamp.label;
  return element;
}

async function handleJsonInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const placements = Array.isArray(data) ? data : data.placements;

    if (!Array.isArray(placements)) {
      throw new Error("placements配列が見つかりません。JSON形式を確認してください。");
    }

    state.placements = placements.filter(isValidPlacement);
    rerenderPlacedStamps();
    saveCurrentDocument();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
}

function movePage(delta) {
  if (!state.pdfDoc) return;
  const nextPage = clamp(state.currentPage + delta, 1, state.pdfDoc.numPages);
  if (nextPage === state.currentPage) return;
  state.currentPage = nextPage;
  renderCurrentPage();
}

function handlePageNumberChange() {
  if (!state.pdfDoc) return;
  const requestedPage = Number(elements.pageNumberInput.value);
  const nextPage = clamp(Math.round(requestedPage || 1), 1, state.pdfDoc.numPages);
  state.currentPage = nextPage;
  renderCurrentPage();
}

function handleZoomSliderInput() {
  if (!state.pdfDoc) return;
  const requestedPercent = Number(elements.zoomSlider.value);
  const nextZoom = clamp(roundZoom(requestedPercent / 100), MIN_ZOOM, MAX_ZOOM);
  if (nextZoom === state.zoom) return;
  state.zoom = nextZoom;
  renderCurrentPage();
}

function handleHorizontalScrollRangeInput() {
  const maxLeft = getMaxHorizontalScroll();
  if (maxLeft <= 0) return;

  const nextLeft = clamp(Number(elements.horizontalScrollRange.value) || 0, 0, maxLeft);
  elements.viewerScroller.scrollTo({ left: nextLeft, behavior: "auto" });

  requestAnimationFrame(updateHorizontalScrollControls);
}

function changeZoom(delta) {
  if (!state.pdfDoc) return;
  const nextZoom = clamp(roundZoom(state.zoom + delta), MIN_ZOOM, MAX_ZOOM);
  if (nextZoom === state.zoom) return;
  state.zoom = nextZoom;
  renderCurrentPage();
}

function resetZoom() {
  if (!state.pdfDoc || state.zoom === 1) return;
  state.zoom = 1;
  renderCurrentPage();
}

async function applyReadableZoom() {
  if (!state.pdfDoc) return;
  setStatus("読みやすい倍率を計算しています…");
  state.zoom = await estimateReadableZoom(state.pdfDoc);
  state.lastAutoZoomInfo = "読みやすい倍率を再計算しました。";
  await renderCurrentPage();
  setStatus(`読みやすい倍率にしました：${Math.round(state.zoom * 100)}%`);
}

async function estimateReadableZoom(pdfDoc) {
  try {
    const page = await pdfDoc.getPage(1);
    const medianTextSize = await detectMedianTextSize(page);

    if (medianTextSize) {
      const zoom = TARGET_TEXT_PX / (medianTextSize * BASE_RENDER_SCALE);
      return clamp(roundZoom(zoom), MIN_ZOOM, MAX_ZOOM);
    }

    return estimateFitWidthZoom(page);
  } catch (error) {
    console.warn("自動倍率の推定に失敗しました。", error);
    return 1;
  }
}

async function detectMedianTextSize(page) {
  const textContent = await page.getTextContent();
  const sizes = [];

  for (const item of textContent.items ?? []) {
    if (!item.str || !item.str.trim()) continue;

    const transform = item.transform;
    const verticalSize = Array.isArray(transform)
      ? Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0)
      : 0;
    const fallbackSize = Number(item.height) || 0;
    const size = verticalSize || fallbackSize;

    if (Number.isFinite(size) && size >= 5 && size <= 40) {
      sizes.push(size);
    }
  }

  if (sizes.length < 8) return null;

  sizes.sort((a, b) => a - b);
  const middle = Math.floor(sizes.length * 0.5);
  return sizes[middle];
}

function estimateFitWidthZoom(page) {
  const viewport = page.getViewport({ scale: BASE_RENDER_SCALE });
  const container = elements.viewerScroller;
  const availableWidth = Math.max(360, (container?.clientWidth ?? 900) - 48);
  const zoom = availableWidth / viewport.width;
  return clamp(roundZoom(Math.min(zoom, 1.25)), MIN_ZOOM, MAX_ZOOM);
}

function saveCurrentDocument() {
  if (!state.documentKey) {
    updateJsonOutput();
    return;
  }

  state.lastSavedAt = new Date().toISOString();
  const payload = buildJsonPayload();

  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    updateCurrentHistoryEntry();
    setStatus(`自動保存しました：${formatDateTime(state.lastSavedAt)}`);
  } catch (error) {
    setStatus("自動保存に失敗しました。JSONを書き出して保存してください。", true);
  }

  updateJsonOutput();
}

function persistViewState() {
  if (!state.documentKey) return;

  const existing = readSavedDocumentData() ?? {};
  const payload = {
    ...buildJsonPayload(),
    savedAt: existing.savedAt ?? state.lastSavedAt,
    placements: state.placements,
  };

  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    updateCurrentHistoryEntry();
    updateJsonOutput();
  } catch (error) {
    console.warn("表示状態の保存に失敗しました。", error);
  }
}

function restorePlacementsForCurrentDocument({ restoreView = false } = {}) {
  state.placements = [];
  state.lastSavedAt = null;

  if (!state.documentKey) return;

  try {
    const savedData = readSavedDocumentData();
    if (!savedData) {
      setStatus(
        state.lastAutoZoomInfo
          ? `${state.lastAutoZoomInfo} このPDFの保存済みハンコはまだありません。`
          : "このPDFの保存済みハンコはまだありません。"
      );
      return;
    }

    const placements = Array.isArray(savedData) ? savedData : savedData.placements;
    state.placements = Array.isArray(placements) ? placements.filter(isValidPlacement) : [];
    state.lastSavedAt = savedData.savedAt ?? null;

    if (restoreView && savedData.view) {
      const restoredPage = Number(savedData.view.currentPage);
      const restoredZoom = Number(savedData.view.zoom);
      if (Number.isFinite(restoredPage) && state.pdfDoc) {
        state.currentPage = clamp(Math.round(restoredPage), 1, state.pdfDoc.numPages);
      }
      if (Number.isFinite(restoredZoom)) {
        state.zoom = clamp(roundZoom(restoredZoom), MIN_ZOOM, MAX_ZOOM);
      }
      const restoredScrollRatio = Number(savedData.view.horizontalScrollRatio);
      state.pendingHorizontalScrollRatio = Number.isFinite(restoredScrollRatio)
        ? clamp(restoredScrollRatio, 0, 1)
        : null;
    }

    setStatus(
      state.lastSavedAt
        ? `保存済みハンコを読み込みました：${formatDateTime(state.lastSavedAt)}`
        : "保存済みハンコを読み込みました。"
    );
  } catch (error) {
    setStatus("保存済みJSONを読み込めませんでした。", true);
  }
}

function readSavedDocumentData() {
  if (!state.documentKey) return null;
  const savedText = localStorage.getItem(storageKey());
  return savedText ? JSON.parse(savedText) : null;
}

function storageKey() {
  return `${STORAGE_PREFIX}${state.documentKey}`;
}

function buildJsonPayload() {
  return {
    app: "PDFハンコリーダー",
    version: "0.2.4",
    document: {
      key: state.documentKey,
      label: state.documentLabel,
      sourceType: state.sourceType,
      url: state.sourceUrl,
    },
    pdfName: state.sourceType === "file" ? state.documentLabel : null,
    pdfUrl: state.sourceUrl,
    savedAt: state.lastSavedAt,
    view: {
      currentPage: state.currentPage,
      zoom: state.zoom,
      zoomPercent: Math.round(state.zoom * 100),
      horizontalScrollRatio: getSavedHorizontalScrollRatio(),
    },
    placements: state.placements,
  };
}

function updateJsonOutput() {
  elements.jsonOutput.value = JSON.stringify(buildJsonPayload(), null, 2);
}

function updateDocumentInfo() {
  elements.documentLabel.textContent = state.documentLabel ?? "まだPDFを開いていません。";
}

function updateToolbarState() {
  const hasPdf = Boolean(state.pdfDoc);
  const totalPages = state.pdfDoc?.numPages ?? 0;

  elements.prevPageButton.disabled = !hasPdf || state.currentPage <= 1;
  elements.nextPageButton.disabled = !hasPdf || state.currentPage >= totalPages;
  elements.pageNumberInput.disabled = !hasPdf;
  elements.pageNumberInput.max = hasPdf ? String(totalPages) : "1";
  elements.pageNumberInput.value = String(state.currentPage);
  elements.pageTotalLabel.textContent = hasPdf ? `/ ${totalPages}` : "/ -";

  elements.zoomOutButton.disabled = !hasPdf || state.zoom <= MIN_ZOOM;
  elements.zoomInButton.disabled = !hasPdf || state.zoom >= MAX_ZOOM;
  elements.zoomResetButton.disabled = !hasPdf || state.zoom === 1;
  elements.autoZoomButton.disabled = !hasPdf;
  elements.zoomSlider.disabled = !hasPdf;
  elements.zoomSlider.value = String(Math.round(state.zoom * 100));
  elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  updateHorizontalScrollControls();
}

function getScrollSnapshot() {
  const maxLeft = getMaxHorizontalScroll();
  return {
    leftRatio: maxLeft > 0 ? elements.viewerScroller.scrollLeft / maxLeft : 0,
  };
}

function restoreScrollFromSnapshot(snapshot) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const maxLeft = getMaxHorizontalScroll();
      const pendingRatio = state.pendingHorizontalScrollRatio;
      const snapshotRatio = Number.isFinite(snapshot?.leftRatio) ? snapshot.leftRatio : 0;
      const leftRatio = pendingRatio ?? snapshotRatio;
      elements.viewerScroller.scrollLeft = Math.round(maxLeft * clamp(leftRatio, 0, 1));
      state.pendingHorizontalScrollRatio = null;
      updateHorizontalScrollControls();
    });
  });
}

function getSavedHorizontalScrollRatio() {
  const maxLeft = getMaxHorizontalScroll();
  return maxLeft > 0 ? roundRatio(elements.viewerScroller.scrollLeft / maxLeft) : 0;
}

function scheduleHorizontalScrollControlsUpdate() {
  requestAnimationFrame(() => {
    requestAnimationFrame(updateHorizontalScrollControls);
  });
}

function getMaxHorizontalScroll() {
  return Math.max(0, elements.viewerScroller.scrollWidth - elements.viewerScroller.clientWidth);
}

function updateHorizontalScrollControls() {
  const hasPdf = Boolean(state.pdfDoc);
  const maxLeft = getMaxHorizontalScroll();
  const range = elements.horizontalScrollRange;

  range.disabled = !hasPdf || maxLeft <= 0;
  range.max = String(Math.round(maxLeft));
  range.value = String(Math.round(clamp(elements.viewerScroller.scrollLeft, 0, maxLeft)));
}

function setStatus(message, isError = false) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = isError ? "#b33838" : "";
}

function readHistory() {
  try {
    const text = localStorage.getItem(HISTORY_KEY);
    const history = text ? JSON.parse(text) : [];
    return Array.isArray(history) ? history.filter(isValidHistoryItem) : [];
  } catch (error) {
    console.warn("履歴を読み込めませんでした。", error);
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
  renderHistory();
}

function addHistoryEntry(entry) {
  const history = readHistory();
  const now = new Date().toISOString();
  const normalizedEntry = {
    key: entry.key,
    label: entry.label,
    sourceType: entry.sourceType,
    url: entry.url ?? null,
    pageCount: entry.pageCount ?? null,
    hasFileHandle: Boolean(entry.hasFileHandle),
    lastPageNumber: state.currentPage,
    lastZoom: state.zoom,
    stampCount: state.placements.length,
    lastOpenedAt: now,
  };

  const nextHistory = [
    normalizedEntry,
    ...history.filter((item) => item.key !== normalizedEntry.key),
  ];

  writeHistory(nextHistory);
}

function updateCurrentHistoryEntry() {
  if (!state.documentKey) return;

  const history = readHistory();
  const item = history.find((entry) => entry.key === state.documentKey);
  if (!item) return;

  const updated = {
    ...item,
    lastPageNumber: state.currentPage,
    lastZoom: state.zoom,
    stampCount: state.placements.length,
    lastOpenedAt: new Date().toISOString(),
  };

  writeHistory([
    updated,
    ...history.filter((entry) => entry.key !== state.documentKey),
  ]);
}

function renderHistory() {
  const history = readHistory();
  elements.historyList.replaceChildren();
  elements.clearHistoryButton.disabled = history.length === 0;

  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "履歴はまだありません。";
    elements.historyList.append(empty);
    return;
  }

  for (const item of history) {
    const row = document.createElement("article");
    row.className = "history-item";

    const title = document.createElement("strong");
    title.textContent = item.label;

    const meta = document.createElement("span");
    const sourceLabel = item.sourceType === "url" ? "URL" : "ローカル";
    const pageText = item.lastPageNumber ? `${item.lastPageNumber}ページ目` : "ページ未記録";
    const zoomText = item.lastZoom ? `${Math.round(item.lastZoom * 100)}%` : "倍率未記録";
    meta.textContent = `${sourceLabel} / ${pageText} / ${zoomText} / ハンコ${item.stampCount ?? 0}個`;

    const action = document.createElement("button");
    action.type = "button";
    action.className = "history-action";

    if (item.sourceType === "url" && item.url) {
      action.textContent = "開く";
      action.addEventListener("click", () => loadPdfFromUrl(item.url));
    } else if (item.sourceType === "file" && item.hasFileHandle) {
      action.textContent = "開く";
      action.addEventListener("click", () => openLocalPdfFromHistory(item));
    } else {
      action.textContent = "選び直す";
      action.addEventListener("click", () => {
        setStatus(`「${item.label}」を選び直すと、保存済みハンコを読み込みます。`);
        openLocalPdf();
      });
    }

    row.append(title, meta, action);
    elements.historyList.append(row);
  }
}

async function openLocalPdfFromHistory(item) {
  try {
    setStatus(`履歴から「${item.label}」を開いています…`);
    const handle = await readFileHandle(item.key);

    if (!handle) {
      throw new Error("保存済みのファイル参照が見つかりません。");
    }

    const permission = await ensureReadPermission(handle);
    if (!permission) {
      throw new Error("ファイルを開く許可がありません。");
    }

    const file = await handle.getFile();
    await loadPdfFromFile(file, { handle });
  } catch (error) {
    console.warn("履歴からローカルPDFを開けませんでした。", error);
    markHistoryItemHandleUnavailable(item.key);
    setStatus(`履歴から直接開けませんでした。「${item.label}」を選び直してください。`, true);
    alert("履歴から直接開けませんでした。もう一度ローカルPDFを選び直してください。次回以降は履歴から開ける場合があります。");
    openLocalPdf();
  }
}

async function ensureReadPermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return false;

  const options = { mode: "read" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function rememberFileHandle(documentKey, handle) {
  if (!documentKey || !handle) return false;

  try {
    await writeFileHandle(documentKey, handle);
    return true;
  } catch (error) {
    console.warn("ファイル参照を保存できませんでした。", error);
    return false;
  }
}

function markHistoryItemHandleUnavailable(key) {
  const history = readHistory();
  const nextHistory = history.map((item) =>
    item.key === key ? { ...item, hasFileHandle: false } : item
  );
  writeHistory(nextHistory);
}

function openFileHandleDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDBを利用できません。"));
      return;
    }

    const request = indexedDB.open(FILE_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILE_HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeFileHandle(key, handle) {
  const db = await openFileHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_HANDLE_STORE_NAME).put(handle, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function readFileHandle(key) {
  const db = await openFileHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE_NAME, "readonly");
    const request = tx.objectStore(FILE_HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function clearHistory() {
  const ok = confirm("PDF履歴を消去しますか？ハンコ配置の保存データは消しません。");
  if (!ok) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  setStatus("PDF履歴を消去しました。ハンコ配置データは残っています。やり直す場合は同じPDFを開いてください。");
}

function isValidHistoryItem(item) {
  return (
    item &&
    typeof item.key === "string" &&
    typeof item.label === "string" &&
    (item.sourceType === "file" || item.sourceType === "url")
  );
}

async function copyJson() {
  await navigator.clipboard.writeText(elements.jsonOutput.value);
  setStatus("JSONをコピーしました。");
}

function downloadJson() {
  const blob = new Blob([elements.jsonOutput.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = safeFileBaseName(state.documentLabel ?? "placements");

  link.href = url;
  link.download = `${safeName}-hanko.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function showLoadError(error, prefix) {
  console.error(error);
  state.pdfDoc = null;
  state.pageLayer = null;
  elements.pdfViewer.replaceChildren();
  elements.pdfViewer.style.width = "";
  elements.emptyState.style.display = "grid";
  updateToolbarState();
  updateHorizontalScrollControls();
  setStatus(prefix, true);
  alert(prefix);
}

function getSelectedStamp() {
  return stamps.find((stamp) => stamp.id === state.selectedStampId) ?? stamps[0];
}

function mmToCssPx(mm) {
  return Math.round(mm * MM_TO_CSS_PX);
}

function sizeClass(sizeMm) {
  if (sizeMm <= 12) return "size-small";
  if (sizeMm >= 28) return "size-large";
  return "size-medium";
}

function roundRatio(value) {
  return Math.round(value * 100000) / 100000;
}

function roundZoom(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isValidPlacement(placement) {
  return (
    Number.isInteger(placement.pageNumber) &&
    typeof placement.stampId === "string" &&
    typeof placement.xRatio === "number" &&
    typeof placement.yRatio === "number" &&
    placement.xRatio >= 0 &&
    placement.xRatio <= 1 &&
    placement.yRatio >= 0 &&
    placement.yRatio <= 1
  );
}

function safeFileBaseName(value) {
  return String(value)
    .replace(/\.pdf$/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9\-_一-龠ぁ-んァ-ンー]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "placements";
}

function formatDateTime(isoText) {
  if (!isoText) return "";
  const date = new Date(isoText);
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
