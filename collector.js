(() => {
  const KEY = '__imageGrabberCollector';
  if (globalThis[KEY]) return;

  const state = { active: false, images: new Map(), observer: null };
  globalThis[KEY] = state;

  function add(rawUrl, width = 0, height = 0, source = 'image') {
    if (!rawUrl || rawUrl.startsWith('chrome-extension:')) return;
    let url;
    try { url = new URL(rawUrl, document.baseURI).href; } catch { return; }
    if (!/^https?:|^data:|^blob:|^file:/.test(url)) return;
    const item = { url, width: Math.round(width || 0), height: Math.round(height || 0), source };
    const current = state.images.get(url);
    if (!current || item.width * item.height > current.width * current.height) state.images.set(url, item);
  }

  function largestSrcset(srcset) {
    if (!srcset) return '';
    return srcset.split(',').map((candidate) => {
      const [url, descriptor = '1x'] = candidate.trim().split(/\s+/);
      return { url, score: Number.parseFloat(descriptor) || 1 };
    }).sort((a, b) => b.score - a.score)[0]?.url || '';
  }

  function scanElement(element) {
    if (!(element instanceof Element)) return;
    const box = element.getBoundingClientRect();
    if (element instanceof HTMLImageElement) {
      const width = element.naturalWidth || box.width;
      const height = element.naturalHeight || box.height;
      add(element.currentSrc || element.src, width, height, 'img');
      add(largestSrcset(element.srcset), width, height, 'srcset');
      for (const attribute of ['data-src', 'data-original', 'data-lazy-src']) {
        add(element.getAttribute(attribute), width, height, 'lazy');
      }
    } else if (element.matches('svg image')) {
      add(element.href?.baseVal || element.getAttribute('href') || element.getAttribute('xlink:href'), box.width, box.height, 'svg');
    }

    const background = getComputedStyle(element).backgroundImage;
    if (background && background !== 'none') {
      for (const match of background.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/g)) {
        add(match[1] || match[2] || match[3], box.width, box.height, 'background');
      }
    }
  }

  function scanTree(root) {
    if (root instanceof Element) scanElement(root);
    root.querySelectorAll?.('img, svg image, [style], [class]').forEach(scanElement);
  }

  function start() {
    if (state.active) return;
    state.active = true;
    scanTree(document);
    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') scanElement(mutation.target);
        else mutation.addedNodes.forEach(scanTree);
      }
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'style', 'class', 'data-src', 'data-original', 'data-lazy-src']
    });
  }

  function stop() {
    state.active = false;
    state.observer?.disconnect();
    state.observer = null;
  }

  function snapshot() { return { active: state.active, images: [...state.images.values()] }; }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'collector:start') start();
    else if (message?.action === 'collector:stop') stop();
    else if (message?.action !== 'collector:status') return false;
    sendResponse(snapshot());
    return false;
  });
})();
