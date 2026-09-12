const WINDOW_KEY = 'imageGrabberWindowId';
const TAB_KEY = 'imageGrabberTabId';

function appUrl(sourceTabId, surface) {
  return chrome.runtime.getURL(`popup.html?tabId=${sourceTabId}&surface=${surface}`);
}

async function openWindow(sourceTabId, fullscreen = false) {
  const saved = await chrome.storage.session.get([WINDOW_KEY, TAB_KEY]);
  const url = appUrl(sourceTabId, fullscreen ? 'fullscreen' : 'window');
  if (saved[WINDOW_KEY] && saved[TAB_KEY]) {
    try {
      await chrome.tabs.update(saved[TAB_KEY], { url, active: true });
      await chrome.windows.update(saved[WINDOW_KEY], { focused: true, state: fullscreen ? 'fullscreen' : 'normal' });
      return;
    } catch {
      await chrome.storage.session.remove([WINDOW_KEY, TAB_KEY]);
    }
  }

  const options = { url, type: 'popup', focused: true, state: fullscreen ? 'fullscreen' : 'normal' };
  if (!fullscreen) Object.assign(options, { width: 780, height: 700 });
  const created = await chrome.windows.create(options);
  const appTabId = created.tabs?.[0]?.id;
  if (created.id && appTabId) await chrome.storage.session.set({ [WINDOW_KEY]: created.id, [TAB_KEY]: appTabId });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'openSurface' || !message.sourceTabId) return false;
  (async () => {
    if (message.surface === 'tab') await chrome.tabs.create({ url: appUrl(message.sourceTabId, 'tab') });
    else await openWindow(message.sourceTabId, message.surface === 'fullscreen');
  })().then(() => sendResponse({ ok: true }), (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const saved = await chrome.storage.session.get(WINDOW_KEY);
  if (saved[WINDOW_KEY] === windowId) await chrome.storage.session.remove([WINDOW_KEY, TAB_KEY]);
});
