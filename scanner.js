export function scanImages() {
  const found = new Map();

  const add = (rawUrl, width = 0, height = 0, source = 'image') => {
    if (!rawUrl || rawUrl.startsWith('chrome-extension:')) return;
    let url;
    try { url = new URL(rawUrl, document.baseURI).href; } catch { return; }
    if (!/^https?:|^data:|^blob:|^file:/.test(url)) return;
    const current = found.get(url);
    const item = { url, width: Math.round(width || 0), height: Math.round(height || 0), source };
    if (!current || item.width * item.height > current.width * current.height) found.set(url, item);
  };

  document.querySelectorAll('img').forEach((img) => {
    add(img.currentSrc || img.src, img.naturalWidth || img.width, img.naturalHeight || img.height, 'img');
  });

  document.querySelectorAll('svg image').forEach((image) => {
    const box = image.getBoundingClientRect();
    add(image.href?.baseVal || image.getAttribute('href') || image.getAttribute('xlink:href'), box.width, box.height, 'svg');
  });

  document.querySelectorAll('body *').forEach((element) => {
    const background = getComputedStyle(element).backgroundImage;
    if (!background || background === 'none') return;
    const box = element.getBoundingClientRect();
    for (const match of background.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/g)) {
      add(match[1] || match[2] || match[3], box.width, box.height, 'background');
    }
  });

  return [...found.values()];
}
