import * as host from './host-api.js';

const CHANNEL = 'image-grabber-bridge';
const BRIDGE_VERSION = 1;
const REMOTE_ORIGIN = 'https://leestana01.github.io';
const REMOTE_APP = `${REMOTE_ORIGIN}/image-downloader-extension/app.html`;
const methods = {
  loadImages: (args) => host.loadImages(args),
  collector: (args) => host.collector(args),
  preview: (args) => host.preview(args),
  openSurface: (args) => host.openSurface(args),
  download: (args, progress) => host.download(args, progress),
  closeHost: () => host.closeHost()
};

const iframe = document.getElementById('remoteApp');
const loading = document.getElementById('loading');
const token = crypto.randomUUID();
let connected = false;

function localFallback() {
  if (connected) return;
  const url = new URL(chrome.runtime.getURL('app.html'));
  for (const [key, value] of new URLSearchParams(location.search)) url.searchParams.set(key, value);
  location.replace(url.href);
}

const fallbackTimer = setTimeout(localFallback, 5000);
iframe.addEventListener('error', localFallback, { once: true });

window.addEventListener('message', async (event) => {
  if (event.origin !== REMOTE_ORIGIN || event.source !== iframe.contentWindow) return;
  const message = event.data;
  if (!message || message.channel !== CHANNEL || message.token !== token) return;

  if (message.type === 'ready') {
    if (message.requiredBridgeVersion > BRIDGE_VERSION) return localFallback();
    connected = true;
    clearTimeout(fallbackTimer);
    loading.remove();
    iframe.style.display = 'block';
    return;
  }

  if (!connected || message.type !== 'request' || !Object.hasOwn(methods, message.method)) return;
  const progress = (value) => iframe.contentWindow?.postMessage({
    channel: CHANNEL, type: 'progress', token, id: message.id, value
  }, REMOTE_ORIGIN);
  try {
    const value = await methods[message.method](message.args || {}, progress);
    iframe.contentWindow?.postMessage({ channel: CHANNEL, type: 'response', token, id: message.id, ok: true, value }, REMOTE_ORIGIN);
  } catch (error) {
    iframe.contentWindow?.postMessage({ channel: CHANNEL, type: 'response', token, id: message.id, ok: false, error: error.message }, REMOTE_ORIGIN);
  }
});

const remoteUrl = new URL(REMOTE_APP);
for (const [key, value] of new URLSearchParams(location.search)) remoteUrl.searchParams.set(key, value);
remoteUrl.searchParams.set('bridgeToken', token);
remoteUrl.searchParams.set('remote', '1');
iframe.src = remoteUrl.href;
