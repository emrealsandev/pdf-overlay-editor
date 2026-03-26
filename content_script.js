(() => {
  const currentUrl = window.location.href;
  const isPdf = /\.pdf($|[?#])/i.test(currentUrl);
  if (!isPdf) return;

  const overlayId = 'pdf-editor-redirect-overlay';
  if (!document.getElementById(overlayId)) {
    const style = document.createElement('style');
    style.textContent = `
      #${overlayId} {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(18, 18, 18, 0.92);
        color: #f0f0f0;
        font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 1.1rem;
        z-index: 2147483647;
        letter-spacing: 0.02em;
      }
      #${overlayId} span {
        padding: 1rem 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
      }
    `;
    document.documentElement.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    const label = document.createElement('span');
    label.textContent = 'Loading PDF Overlay Editor…';
    overlay.appendChild(label);
    document.documentElement.appendChild(overlay);
  }

  try {
    chrome.runtime.sendMessage({ type: 'pdfDetected', url: currentUrl });
  } catch (error) {
    console.warn('Unable to dispatch PDF detection message', error);
  }
})();
