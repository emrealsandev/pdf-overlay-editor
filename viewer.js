import * as pdfjsLib from './libs/pdf.min.js';

const pdfContainer = document.getElementById('pdf-container');
const statusBanner = document.getElementById('status-banner');
const toolbarButtons = Array.from(document.querySelectorAll('.tool-button'));
const colorPicker = document.getElementById('color-picker');
const colorSwatchButton = document.getElementById('color-swatch');
const strokeWidthInput = document.getElementById('stroke-width');
const strokeValueLabel = document.getElementById('stroke-value');
const downloadButton = document.getElementById('download-btn');
const thumbnailList = document.getElementById('thumbnail-list');
const pageIndicatorLabel = document.getElementById('page-indicator');
const themeToggleButton = document.getElementById('theme-toggle');
const viewerMain = document.getElementById('viewer-main');

const createCursorStyle = (svgMarkup, hotSpotX, hotSpotY, fallback = 'crosshair') =>
  `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}") ${hotSpotX} ${hotSpotY}, ${fallback}`;

const createPencilCursorSvg = (strokeWidth) => {
  const size = 12 + Math.min(strokeWidth, 20);
  const radius = Math.max(1, Math.min(strokeWidth / 2, size / 2 - 2));
  const center = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="white" stroke="black" stroke-width="1.5"/></svg>`;
};

const createEraserCursorSvg = (strokeWidth) => {
  const size = 16 + Math.min(strokeWidth, 24);
  const padding = 3;
  const innerSize = size - padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" rx="3" fill="white" stroke="black" stroke-width="1.5"/></svg>`;
};

const pencilCursorSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="3" fill="white" stroke="black" stroke-width="1.5"/></svg>';
const eraserCursorSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3" fill="white" stroke="black" stroke-width="1.5"/></svg>';

const cursorMap = {
  select: 'default',
  pencil: createCursorStyle(pencilCursorSvg, 9, 9, 'crosshair'),
  rectangle: 'crosshair',
  arrow: 'crosshair',
  text: 'text',
  eraser: createCursorStyle(eraserCursorSvg, 10, 10, 'cell')
};

const getCursorForTool = () => {
  const { activeTool, strokeWidth } = toolState;
  switch (activeTool) {
    case 'pencil': {
      const svg = createPencilCursorSvg(strokeWidth);
      const size = 12 + Math.min(strokeWidth, 20);
      return createCursorStyle(svg, size / 2, size / 2, 'crosshair');
    }
    case 'eraser': {
      const svg = createEraserCursorSvg(strokeWidth);
      const size = 16 + Math.min(strokeWidth, 24);
      return createCursorStyle(svg, size / 2, size / 2, 'cell');
    }
    default:
      return cursorMap[activeTool] || 'default';
  }
};

const getHoverCursorForTool = () => {
    const { activeTool } = toolState;
    if (activeTool === 'select') {
        return 'move';
    }
    return getCursorForTool();
};

const hoverCursorMap = {
  select: 'move',
  pencil: cursorMap.pencil,
  rectangle: 'crosshair',
  arrow: 'crosshair',
  text: 'text',
  eraser: cursorMap.eraser
};

const toolState = {
  activeTool: 'select',
  color: colorPicker.value,
  strokeWidth: Number(strokeWidthInput.value) || 2
};

const fabricEntries = [];
const canvasState = new WeakMap();
const thumbnailMap = new Map();
let currentPdfUrl = null;
let totalPageCount = 0;
let activePageNumber = 1;
let scrollRafId = null;
let lastInteractedCanvas = null;
const pdfjsLibInstance = pdfjsLib;
const THEME_STORAGE_KEY = 'pdf-overlay-theme';

const showStatus = (message, isError = false) => {
  statusBanner.textContent = message;
  statusBanner.hidden = false;
  statusBanner.style.background = isError
    ? 'rgba(255, 107, 107, 0.18)'
    : 'rgba(91, 192, 190, 0.18)';
  statusBanner.style.borderColor = isError ? 'rgba(255,107,107,0.5)' : 'rgba(91,192,190,0.5)';
};

const hideStatus = () => {
  statusBanner.hidden = true;
};

const applyColorToSwatch = (value) => {
  if (colorSwatchButton) {
    colorSwatchButton.style.setProperty('--swatch-color', value);
  }
};

const updateStrokeLabel = () => {
  if (strokeValueLabel) {
    strokeValueLabel.textContent = `${toolState.strokeWidth} px`;
  }
};

const updatePageIndicator = () => {
  const safeCurrent = Math.min(activePageNumber, totalPageCount || 0);
  pageIndicatorLabel.textContent = `Page ${Math.max(safeCurrent, 0)} / ${totalPageCount || 0}`;
};

const setActivePageNumber = (pageNumber) => {
  if (!pageNumber || pageNumber === activePageNumber) return;
  activePageNumber = pageNumber;
  updatePageIndicator();
  highlightThumbnail(pageNumber);
  const entry = fabricEntries.find((item) => item.pageNumber === pageNumber);
  if (entry?.fabricCanvas) {
    lastInteractedCanvas = entry.fabricCanvas;
  }
};

const highlightThumbnail = (pageNumber) => {
  thumbnailMap.forEach((element, key) => {
    const isActive = key === pageNumber;
    element.classList.toggle('active', isActive);
    element.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
};

const scrollToPage = (pageNumber) => {
  const target = document.querySelector(`.page-wrapper[data-page-number='${pageNumber}']`);
  if (target) {
    setActivePageNumber(pageNumber);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

const updateActivePageFromScroll = () => {
  if (!fabricEntries.length || !pdfContainer) return;

  const viewportCenter = (window.scrollY || document.documentElement.scrollTop || 0) + window.innerHeight / 2;
  let closestPageNumber = activePageNumber;
  let minDistance = Infinity;

  fabricEntries.forEach((entry) => {
    const rect = entry.wrapper.getBoundingClientRect();
    const elementTop = rect.top + (window.scrollY || document.documentElement.scrollTop || 0);
    const rectCenter = elementTop + entry.wrapper.offsetHeight / 2;
    const distance = Math.abs(rectCenter - viewportCenter);
    if (distance < minDistance) {
      minDistance = distance;
      closestPageNumber = entry.pageNumber;
    }
  });

  if (closestPageNumber) {
    setActivePageNumber(closestPageNumber);
  }
};

const bindScrollTracking = () => {
  const scheduleUpdate = () => {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      updateActivePageFromScroll();
    });
  };

  if (pdfContainer) {
    pdfContainer.addEventListener('scroll', scheduleUpdate, { passive: true });
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
};

const createThumbnailEntry = async (page, pageNumber) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'thumbnail-item';
  button.dataset.pageNumber = String(pageNumber);
  button.setAttribute('aria-label', `Go to page ${pageNumber}`);

  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = 140;
  const thumbScale = Math.min(targetWidth / baseViewport.width, 0.4);
  const thumbViewport = page.getViewport({ scale: thumbScale });

  const canvas = document.createElement('canvas');
  canvas.width = thumbViewport.width;
  canvas.height = thumbViewport.height;
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport: thumbViewport }).promise;

  const label = document.createElement('span');
  label.textContent = `Page ${pageNumber}`;

  button.appendChild(canvas);
  button.appendChild(label);
  button.addEventListener('click', () => scrollToPage(pageNumber));

  thumbnailList.appendChild(button);
  thumbnailMap.set(pageNumber, button);
};

const applyTheme = (theme) => {
  document.body.dataset.theme = theme;
  if (themeToggleButton) {
    themeToggleButton.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
};

const initThemeToggle = () => {
  if (!themeToggleButton) return;
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const initialTheme = storedTheme || (systemPrefersLight ? 'light' : 'dark');
  applyTheme(initialTheme);

  themeToggleButton.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  });
};

const initKeyboardShortcuts = () => {
  document.addEventListener('keydown', (event) => {
    if (event.target && (['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable)) {
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && deleteSelectedObjects()) {
      event.preventDefault();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoActiveCanvas();
    }
  });
};

const deleteSelectedObjects = () => {
  let removed = false;
  fabricEntries.forEach(({ fabricCanvas }) => {
    const activeObjects = fabricCanvas.getActiveObjects();
    if (activeObjects.length && !activeObjects.some((obj) => obj.isEditing)) {
      lastInteractedCanvas = fabricCanvas;
      activeObjects.forEach((obj) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      removed = true;
    }
  });
  return removed;
};

const getActiveCanvas = () => {
  if (lastInteractedCanvas && fabricEntries.some((entry) => entry.fabricCanvas === lastInteractedCanvas)) {
    return lastInteractedCanvas;
  }
  const entry = fabricEntries.find((item) => item.pageNumber === activePageNumber);
  return entry?.fabricCanvas;
};

const undoActiveCanvas = () => {
  const canvas = getActiveCanvas();
  if (!canvas) return;
  lastInteractedCanvas = canvas;
  const state = ensureCanvasState(canvas);
  if (!state.history || state.history.length <= 1) return;
  state.history.pop();
  const previous = state.history[state.history.length - 1];
  state.isRestoring = true;
  canvas.loadFromJSON(previous, () => {
    state.isRestoring = false;
    canvas.renderAll();
  });
};

const registerHistoryListeners = (fabricCanvas) => {
  const state = ensureCanvasState(fabricCanvas);
  if (!state.history) {
    state.history = [];
  }

  const pushSnapshot = () => {
    if (state.isRestoring) return;
    state.history.push(fabricCanvas.toDatalessJSON());
    if (state.history.length > 40) {
      state.history.shift();
    }
  };

  pushSnapshot();

  fabricCanvas.on('object:added', pushSnapshot);
  fabricCanvas.on('object:modified', pushSnapshot);
  fabricCanvas.on('object:removed', pushSnapshot);
  fabricCanvas.on('path:created', pushSnapshot);
};

const ensureLibrariesLoaded = () => {
  if (!pdfjsLibInstance?.GlobalWorkerOptions) {
    throw new Error('PDF.js failed to load. Please reload the extension.');
  }

  const workerUrl = chrome?.runtime?.getURL
    ? chrome.runtime.getURL('libs/pdf.worker.min.js')
    : 'libs/pdf.worker.min.js';
  pdfjsLibInstance.GlobalWorkerOptions.workerSrc = workerUrl;

  if (!window.fabric) {
    throw new Error('Fabric.js failed to load.');
  }

  if (!window.jspdf?.jsPDF) {
    throw new Error('jsPDF failed to load.');
  }
};

const getPdfUrlFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get('file');
  if (!param) return null;
  try {
    return decodeURIComponent(param);
  } catch (error) {
    return param;
  }
};

const initToolbar = () => {
  toolbarButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const selectedTool = button.dataset.tool;
      if (selectedTool === toolState.activeTool) return;
      setActiveTool(selectedTool);
    });
  });

  colorPicker.addEventListener('input', (event) => {
    toolState.color = event.target.value;
    applyColorToSwatch(toolState.color);
    fabricEntries.forEach(({ fabricCanvas }) => {
      if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = toolState.color;
      }
    });
  });

  if (colorSwatchButton) {
    colorSwatchButton.addEventListener('click', () => colorPicker.click());
    applyColorToSwatch(toolState.color);
  }

  strokeWidthInput.addEventListener('input', (event) => {
    const parsed = Number(event.target.value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    toolState.strokeWidth = parsed;
    updateStrokeLabel();
    fabricEntries.forEach(({ fabricCanvas }) => {
      if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.width = toolState.strokeWidth;
      }
      updateCanvasInteraction(fabricCanvas);
    });
  });
  updateStrokeLabel();

  downloadButton.addEventListener('click', exportAnnotatedPdf);
};

const setActiveTool = (tool) => {
  toolState.activeTool = tool;
  toolbarButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  fabricEntries.forEach(({ fabricCanvas }) => {
    updateCanvasInteraction(fabricCanvas);
  });
};

const updateCanvasInteraction = (fabricCanvas) => {
  const tool = toolState.activeTool;
  fabricCanvas.isDrawingMode = tool === 'pencil';
  fabricCanvas.skipTargetFind = tool === 'pencil';
  const cursor = getCursorForTool();
  fabricCanvas.defaultCursor = cursor;
  fabricCanvas.hoverCursor = getHoverCursorForTool();
  fabricCanvas.freeDrawingCursor = cursor;
  if (fabricCanvas.upperCanvasEl) {
    fabricCanvas.upperCanvasEl.style.cursor = cursor;
  }

  if (fabricCanvas.freeDrawingBrush) {
    fabricCanvas.freeDrawingBrush.color = toolState.color;
    fabricCanvas.freeDrawingBrush.width = toolState.strokeWidth;
    fabricCanvas.freeDrawingBrush.decimate = 6;
  }

  const enableSelection = tool === 'select';
  const allowHitTest = tool === 'select' || tool === 'eraser';
  fabricCanvas.selection = enableSelection;
  fabricCanvas.forEachObject((object) => {
    object.selectable = enableSelection;
    object.evented = allowHitTest;
  });
};

const ensureCanvasState = (fabricCanvas) => {
  if (!canvasState.has(fabricCanvas)) {
    canvasState.set(fabricCanvas, {
      isDrawingShape: false,
      startPoint: null,
      currentShape: null,
      history: [],
      isRestoring: false,
      isErasing: false
    });
  }
  return canvasState.get(fabricCanvas);
};

const attachCanvasHandlers = (fabricCanvas) => {
  fabricCanvas.on('mouse:down', (event) => handlePointerDown(fabricCanvas, event));
  fabricCanvas.on('mouse:move', (event) => handlePointerMove(fabricCanvas, event));
  fabricCanvas.on('mouse:up', (event) => handlePointerUp(fabricCanvas));
};

const findEraseTarget = (fabricCanvas, pointer) => {
  const objects = fabricCanvas.getObjects();
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!object.evented) continue;
    if (object.containsPoint(new fabric.Point(pointer.x, pointer.y))) {
      return object;
    }
  }
  return null;
};

const eraseAtPointer = (fabricCanvas, pointer) => {
  const target = findEraseTarget(fabricCanvas, pointer);
  if (target) {
    fabricCanvas.remove(target);
    fabricCanvas.requestRenderAll();
  }
};

const handlePointerDown = (fabricCanvas, event) => {
  const pointer = fabricCanvas.getPointer(event.e);
  const state = ensureCanvasState(fabricCanvas);
  lastInteractedCanvas = fabricCanvas;

  if (toolState.activeTool === 'eraser') {
    state.isErasing = true;
    eraseAtPointer(fabricCanvas, pointer);
    return;
  }

  if (toolState.activeTool === 'rectangle') {
    state.isDrawingShape = true;
    state.startPoint = pointer;
    state.currentShape = new fabric.Rect({
      left: pointer.x,
      top: pointer.y,
      width: 1,
      height: 1,
      fill: 'rgba(0,0,0,0)',
      stroke: toolState.color,
      strokeWidth: toolState.strokeWidth,
      selectable: false,
      evented: false,
      name: 'rectangle'
    });
    fabricCanvas.add(state.currentShape);
  } else if (toolState.activeTool === 'arrow') {
    state.isDrawingShape = true;
    state.startPoint = pointer;
    state.currentShape = createArrow(pointer, pointer, toolState.color, toolState.strokeWidth);
    fabricCanvas.add(state.currentShape);
  } else if (toolState.activeTool === 'text') {
    const text = new fabric.IText('Text', {
      left: pointer.x,
      top: pointer.y,
      fontSize: 20,
      fill: toolState.color,
      editable: true
    });
    text.on('editing:entered', () => {
      text.selectAll();
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    text.enterEditing();
    fabricCanvas.requestRenderAll();
    setActiveTool('select');
  }
};

const handlePointerMove = (fabricCanvas, event) => {
  const state = ensureCanvasState(fabricCanvas);
  if (toolState.activeTool === 'eraser' && state.isErasing) {
    const pointer = fabricCanvas.getPointer(event.e);
    eraseAtPointer(fabricCanvas, pointer);
    return;
  }
  if (!state.isDrawingShape || !state.currentShape) return;

  const pointer = fabricCanvas.getPointer(event.e);

  if (toolState.activeTool === 'rectangle') {
    const width = pointer.x - state.startPoint.x;
    const height = pointer.y - state.startPoint.y;
    state.currentShape.set({
      left: width < 0 ? pointer.x : state.startPoint.x,
      top: height < 0 ? pointer.y : state.startPoint.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
    fabricCanvas.requestRenderAll();
  } else if (toolState.activeTool === 'arrow') {
    updateArrow(state.currentShape, state.startPoint, pointer);
    fabricCanvas.requestRenderAll();
  }
};

const handlePointerUp = (fabricCanvas) => {
  const state = ensureCanvasState(fabricCanvas);
  if (state.isErasing) {
    state.isErasing = false;
    return;
  }
  if (state.currentShape) {
    let shouldDiscardShape = false;
    if (state.currentShape.name === 'rectangle') {
      shouldDiscardShape = state.currentShape.width < 4 || state.currentShape.height < 4;
    } else if (state.currentShape.name === 'arrow') {
      const [shaft] = state.currentShape.getObjects();
      const length = Math.hypot(shaft.x2 - shaft.x1, shaft.y2 - shaft.y1);
      shouldDiscardShape = length < 8;
    }

    if (shouldDiscardShape) {
      fabricCanvas.remove(state.currentShape);
      fabricCanvas.requestRenderAll();
    } else {
      state.currentShape.set({ selectable: true, evented: true });
      fabricCanvas.fire('object:modified', { target: state.currentShape });
    }
  }
  state.isDrawingShape = false;
  state.startPoint = null;
  state.currentShape = null;
};

const createArrow = (startPoint, endPoint, color, strokeWidth) => {
  const angle = (Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180) / Math.PI;
  const shaft = new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
    strokeLineCap: 'round',
    originX: 'center',
    originY: 'center'
  });

  const head = new fabric.Triangle({
    width: 10 + strokeWidth * 2,
    height: 12 + strokeWidth * 2,
    fill: color,
    left: endPoint.x,
    top: endPoint.y,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    angle: angle + 90
  });

  const arrowGroup = new fabric.Group([shaft, head], {
    left: startPoint.x,
    top: startPoint.y,
    selectable: false,
    evented: false,
    name: 'arrow',
    angle: 0
  });

  return arrowGroup;
};

const updateArrow = (arrowGroup, startPoint, endPoint) => {
  if (!arrowGroup) return;

  const angle = (Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180) / Math.PI;
  const distance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);

  const [shaft, head] = arrowGroup.getObjects();

  arrowGroup.set({
    width: distance,
    height: head.height,
    angle: angle
  });

  shaft.set({
    x1: -distance / 2,
    y1: 0,
    x2: distance / 2,
    y2: 0
  });

  head.set({
    left: distance / 2,
    top: 0,
    angle: 90
  });

  arrowGroup.setCoords();
};

const renderDocument = async (url) => {
  currentPdfUrl = url;
  pdfContainer.innerHTML = '';
  pdfContainer.scrollTop = 0;
  fabricEntries.length = 0;
  thumbnailList.innerHTML = '';
  thumbnailMap.clear();
  totalPageCount = 0;
  activePageNumber = 1;
  lastInteractedCanvas = null;
  updatePageIndicator();
  showStatus('Loading PDF…');

  try {
    const loadingTask = pdfjsLibInstance.getDocument({ url, withCredentials: false });
    const pdf = await loadingTask.promise;
    totalPageCount = pdf.numPages;
    updatePageIndicator();
    hideStatus();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      await renderPage(pdf, pageNumber);
    }
    updateActivePageFromScroll();
  } catch (error) {
    console.error(error);
    showStatus(`Unable to load PDF: ${error.message}`, true);
  }
};

const renderPage = async (pdfDocument, pageNumber) => {
  const page = await pdfDocument.getPage(pageNumber);
  const targetWidth = Math.min(pdfContainer.clientWidth || window.innerWidth || 900, 1100);
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(targetWidth / unscaledViewport.width, 1);
  const viewport = page.getViewport({ scale });

  const wrapper = document.createElement('article');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.pageNumber = String(pageNumber);
  wrapper.id = `page-${pageNumber}`;

  const stage = document.createElement('div');
  stage.className = 'page-stage';

  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.className = 'pdf-surface page-canvas';
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  const canvasContext = pdfCanvas.getContext('2d');

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'fabric-overlay page-canvas';
  overlayCanvas.width = viewport.width;
  overlayCanvas.height = viewport.height;

  stage.appendChild(pdfCanvas);
  stage.appendChild(overlayCanvas);
  wrapper.appendChild(stage);
  pdfContainer.appendChild(wrapper);

  await page.render({ canvasContext, viewport }).promise;

  const fabricCanvas = new fabric.Canvas(overlayCanvas, {
    preserveObjectStacking: true
  });

  fabricCanvas.setBackgroundColor('rgba(0,0,0,0)', fabricCanvas.requestRenderAll.bind(fabricCanvas));
  updateCanvasInteraction(fabricCanvas);
  attachCanvasHandlers(fabricCanvas);
  registerHistoryListeners(fabricCanvas);

  fabricEntries.push({ pageNumber, pdfCanvas, fabricCanvas, wrapper });
  await createThumbnailEntry(page, pageNumber);
  page.cleanup();
  if (pageNumber === 1) {
    highlightThumbnail(1);
    lastInteractedCanvas = fabricCanvas;
  }
};

const exportAnnotatedPdf = async () => {
  if (!fabricEntries.length) {
    showStatus('Nothing to export yet. Add at least one annotation.', true);
    return;
  }

  if (!window.jspdf?.jsPDF) {
    showStatus('jsPDF failed to initialize. Please reload the viewer.', true);
    return;
  }

  const { jsPDF } = window.jspdf;
  showStatus('Preparing annotated PDF…');

  try {
    let doc = null;
    for (let index = 0; index < fabricEntries.length; index += 1) {
      const { pdfCanvas, fabricCanvas } = fabricEntries[index];
      const merged = await mergeCanvases(pdfCanvas, fabricCanvas);
      if (!doc) {
        doc = new jsPDF({
          orientation: merged.width >= merged.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [merged.width, merged.height]
        });
      } else {
        doc.addPage([merged.width, merged.height], merged.width >= merged.height ? 'landscape' : 'portrait');
      }
      doc.addImage(merged.dataUrl, 'PNG', 0, 0, merged.width, merged.height);
    }

    doc.save('annotated.pdf');
    hideStatus();
  } catch (error) {
    console.error(error);
    showStatus(`Failed to export PDF: ${error.message}`, true);
  }
};

const mergeCanvases = (pdfCanvas, fabricCanvas) => {
  return new Promise(async (resolve, reject) => {
    try {
      const mergedCanvas = document.createElement('canvas');
      mergedCanvas.width = pdfCanvas.width;
      mergedCanvas.height = pdfCanvas.height;
      const context = mergedCanvas.getContext('2d');
      context.drawImage(pdfCanvas, 0, 0);
      const overlayDataUrl = fabricCanvas.toDataURL({ format: 'png' });
      const overlayImage = await loadImage(overlayDataUrl);
      context.drawImage(overlayImage, 0, 0);
      resolve({
        dataUrl: mergedCanvas.toDataURL('image/png'),
        width: mergedCanvas.width,
        height: mergedCanvas.height
      });
    } catch (error) {
      reject(error);
    }
  });
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const bootstrap = async () => {
  initToolbar();
  initThemeToggle();
  initKeyboardShortcuts();
  bindScrollTracking();

  try {
    ensureLibrariesLoaded();
  } catch (error) {
    console.error(error);
    showStatus(error.message, true);
    return;
  }

  const pdfUrl = getPdfUrlFromQuery();
  if (!pdfUrl) {
    showStatus('No PDF URL supplied. Append ?file=<PDF URL> to load a document.', true);
    return;
  }
  await renderDocument(pdfUrl);
  updateActivePageFromScroll();
};

bootstrap();
