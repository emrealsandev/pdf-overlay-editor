# PDF Overlay Editor

A Manifest V3 Chrome extension that reroutes PDF navigation into a custom viewer powered by PDF.js and Fabric.js. Users can draw freehand, drop rectangles or arrows, insert editable text, and export a flattened, annotated copy of the PDF via jsPDF.

## Features

- **Smart PDF routing** – background service worker listens for `.pdf` navigations and redirects tabs to the bundled `viewer.html` with the original file URL.
- **Custom viewer shell** – PDF.js renders each page on a polished surface with smooth scrolling plus a theme toggle for light/dark modes.
- **Fabric.js annotation layer** – aligned overlays per page enable selection, pencil drawing, rectangles, arrows, and inline text editing.
- **Enhanced toolbar controls** – icon-only tool buttons, swatch-based color picking, range slider for stroke width, eraser drag mode, undo (Ctrl/Cmd + Z), delete shortcuts and quick exporting.
- **Thumbnail navigation** – left sidebar lists per-page previews; click any thumbnail (with page numbers) to jump instantly. Active pages are mirrored to assistive tech via `aria-current`.
- **Live page indicator & scroll tracking** – the toolbar center shows the currently visible page vs. total (e.g., `3 / 12`) using a robust viewport-based detector so undo always targets the page you're editing.
- **Contextual cursors** – each tool swaps in a purpose-built cursor (dot for pencil, block for eraser, crosshair for shapes, I‑beam for text) for instant feedback.
- **One-click export** – flattens the PDF canvas and Fabric overlays into a brand-new PDF using jsPDF.

## Project structure

```
.
├── background.js          # Service worker that intercepts PDF URLs and redirects them to viewer.html
├── content_script.js      # Lightweight detector that notifies the service worker and shows a loading overlay
├── manifest.json          # Manifest V3 definition with required permissions and scripts
├── libs/                  # Vendored builds of PDF.js, Fabric.js, and jsPDF for offline use
├── viewer.css             # Dark theme styling for the viewer shell and toolbar
├── viewer.html            # Custom PDF viewer entry point
├── viewer.js              # PDF.js rendering, Fabric.js tooling, and export logic
└── README.md
```

## Getting started

1. **Install dependencies** – all runtime dependencies (PDF.js, Fabric.js, jsPDF) are vendored inside the `libs/` folder, so no additional install or build step is required.
2. **Load the extension**
   1. Open `chrome://extensions`.
   2. Enable **Developer mode**.
   3. Click **Load unpacked** and select this project folder.
3. **Test the flow**
   1. Navigate to any PDF URL (e.g., `https://arxiv.org/pdf/2107.00001.pdf`).
   2. The tab should redirect to `viewer.html?file=<original-url>`.
   3. Use the icon toolbar (Select/Pencil/Rectangle/Arrow/Text/Eraser), modern color/stroke controls, and left thumbnails to annotate and navigate pages.
   4. Toggle light/dark mode from the toolbar, undo with **Ctrl/Cmd + Z**, or delete selections with the **Delete** key.
   5. Click **Download** to save the annotated PDF.

### Notes & tips

- Some third-party PDF hosts block cross-origin requests. If PDF.js cannot fetch the document you will see an error banner; downloading the PDF locally and opening it via `file://` or a CORS-friendly host resolves it.
- When using the rectangle or arrow tools, switch back to **Select** to move or resize existing annotations. Delete removes the active selection, and **Ctrl/Cmd + Z** undoes the last change on the current page.
- The eraser removes whichever annotation you click or drag across, while the Select tool enables multi-select and transforms.
- Text fields start pre-filled with `Text`; begin typing immediately to replace it.
- The viewer remembers your theme preference (light/dark) using `localStorage`.

## Development workflow

- **Linting/tests** – there are no automated tests for this extension. Use Chrome's extension errors page for runtime diagnostics.
- **Manual validation** – reload the unpacked extension after making changes and retest against a few multi-page PDFs to ensure annotations align with each page.

## Future enhancements

- Persistent drafts via `chrome.storage` so annotations survive reloads.
- Additional shapes (ellipses, highlights) and configurable export DPI.
- Collaboration or commenting support on top of the same PDF.
