const WINDOW_KEY = 'imageGrabberWindowId';
const TAB_KEY = 'imageGrabberTabId';

chrome.action.onClicked.addListener(async (sourceTab) => {
  if (!sourceTab.id) return;
  const url = chrome.runtime.getURL(`popup.html?tabId=${sourceTab.id}`);
  const saved = await chrome.storage.session.get([WINDOW_KEY, TAB_KEY]);

  if (saved[WINDOW_KEY] && saved[TAB_KEY]) {
    try {
      await chrome.tabs.update(saved[TAB_KEY], { url, active: true });
      await chrome.windows.update(saved[WINDOW_KEY], { focused: true });
      return;
    } catch {
      await chrome.storage.session.remove([WINDOW_KEY, TAB_KEY]);
    }
  }

  const created = await chrome.windows.create({
    url,
    type: 'popup',
    width: 780,
    height: 700,
    focused: true
  });
  const appTabId = created.tabs?.[0]?.id;
  if (created.id && appTabId) {
    await chrome.storage.session.set({ [WINDOW_KEY]: created.id, [TAB_KEY]: appTabId });
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const saved = await chrome.storage.session.get(WINDOW_KEY);
  if (saved[WINDOW_KEY] === windowId) await chrome.storage.session.remove([WINDOW_KEY, TAB_KEY]);
});
