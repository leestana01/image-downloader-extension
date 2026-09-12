export function extensionFromUrl(url) {
  if (url.startsWith('data:image/')) {
    const mime = url.slice(11).split(/[;,]/)[0].toLowerCase();
    return mime === 'jpeg' ? 'jpg' : mime === 'svg+xml' ? 'svg' : mime || 'image';
  }
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'image';
  } catch {
    return 'image';
  }
}

export function fileNameFromUrl(url, index = 0) {
  try {
    const raw = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    if (raw && /\.[a-zA-Z0-9]{2,5}$/.test(raw)) return sanitizeFileName(raw);
  } catch { /* fallback below */ }
  return `image-${index + 1}.${extensionFromUrl(url)}`;
}

export function sanitizeFileName(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').trim() || 'image';
}

export function makeDownloadName(image, index, total, baseName) {
  if (!baseName.trim()) return fileNameFromUrl(image.url, index);
  const base = sanitizeFileName(baseName);
  const suffix = total > 1 ? `_${String(index + 1).padStart(Math.max(2, String(total).length), '0')}` : '';
  return `${base}${suffix}.${image.extension}`;
}

export function createDownloadPlan(images, baseName) {
  return images.map((image, index) => ({
    image,
    url: image.url,
    filename: makeDownloadName(image, index, images.length, baseName)
  }));
}

export function matchesFilters(image, filters) {
  const { minWidth, maxWidth, minHeight, maxHeight, extensions } = filters;
  return (!minWidth || image.width >= minWidth)
    && (!maxWidth || image.width <= maxWidth)
    && (!minHeight || image.height >= minHeight)
    && (!maxHeight || image.height <= maxHeight)
    && (!extensions.size || extensions.has(image.extension));
}
