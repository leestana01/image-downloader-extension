const CHANNEL = 'image-grabber-bridge';
const params = new URLSearchParams(location.search);

function createRemoteRuntime(token) {
  let nextId = 1;
  const pending = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.token !== token) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    if (message.type === 'progress') {
      entry.onProgress?.(message.value);
      return;
    }
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.value);
    else entry.reject(new Error(message.error || '확장프로그램 브리지 요청에 실패했습니다.'));
  });

  function request(method, args = {}, onProgress) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      window.parent.postMessage({ channel: CHANNEL, type: 'request', token, id, method, args }, '*');
    });
  }

  window.parent.postMessage({
    channel: CHANNEL,
    type: 'ready',
    token,
    requiredBridgeVersion: 1
  }, '*');

  return {
    isRemote: true,
    loadImages: (requestedTabId) => request('loadImages', { requestedTabId }),
    collector: (tabId, action) => request('collector', { tabId, action }),
    preview: (url) => request('preview', { url }),
    openSurface: (surface, sourceTabId) => request('openSurface', { surface, sourceTabId }),
    download: (mode, plan, archiveName, onProgress) => request('download', { mode, plan, archiveName }, onProgress),
    closeHost: () => request('closeHost')
  };
}

export async function createRuntime() {
  const token = params.get('bridgeToken');
  if (token && window.parent !== window) return createRemoteRuntime(token);

  const host = await import('./host-api.js');
  return {
    isRemote: false,
    loadImages: (requestedTabId) => host.loadImages({ requestedTabId }),
    collector: (tabId, action) => host.collector({ tabId, action }),
    preview: (url) => Promise.resolve(url),
    openSurface: (surface, sourceTabId) => host.openSurface({ surface, sourceTabId }),
    download: (mode, plan, archiveName, onProgress) => host.download({ mode, plan, archiveName }, onProgress),
    closeHost: host.closeHost
  };
}
