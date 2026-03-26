const viewerPageUrl = chrome.runtime.getURL('viewer.html');

const shouldHandlePdf = (url = '') => {
  const normalized = url.toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith(viewerPageUrl.toLowerCase())) return false;
  if (normalized.startsWith('chrome-extension://')) return false;
  return /\.pdf($|[?#])/i.test(normalized);
};

const redirectToViewer = (tabId, targetUrl) => {
  if (!tabId || !targetUrl) return;
  const destination = `${viewerPageUrl}?file=${encodeURIComponent(targetUrl)}`;
  chrome.tabs.update(tabId, { url: destination }, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.warn('Unable to redirect tab to custom viewer:', err.message);
    }
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'pdfDetected' && message.url && sender?.tab?.id) {
    redirectToViewer(sender.tab.id, message.url);
  }
  sendResponse?.();
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  if (shouldHandlePdf(details.url)) {
    redirectToViewer(details.tabId, details.url);
  }
});
