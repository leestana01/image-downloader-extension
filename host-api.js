import { fetchZipEntries, startIndividualDownloads } from './downloads.js';
import { scanImages } from './scanner.js';
import { createZip } from './zip.js';

function collectorMessage(tabId, action) {
  return chrome.tabs.sendMessage(tabId, { action });
}

function downloadFromPage({ url, filename }) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function loadImages({ requestedTabId }) {
  let tab;
  if (Number.isInteger(requestedTabId) && requestedTabId > 0) {
    tab = await chrome.tabs.get(requestedTabId);
  } else {
    const tabs = await chrome.tabs.query({});
    tab = tabs
      .filter((candidate) => /^https?:|^file:/.test(candidate.url || ''))
      .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
  }
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || '')) {
    throw new Error('일반 웹페이지에서만 사용할 수 있습니다.');
  }

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['collector.js'] });
  const [[{ result }], collector] = await Promise.all([
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanImages }),
    collectorMessage(tab.id, 'collector:status')
  ]);
  return { tabId: tab.id, images: result, collector };
}

export function collector({ tabId, action }) {
  return collectorMessage(tabId, action);
}

export async function preview({ url }) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`미리보기 요청 실패 (${response.status})`);
  const blob = await response.blob();
  if (blob.size > 8 * 1024 * 1024) throw new Error('미리보기 이미지가 너무 큽니다.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

export async function openSurface({ surface, sourceTabId }) {
  const response = await chrome.runtime.sendMessage({ action: 'openSurface', surface, sourceTabId });
  if (!response?.ok) throw new Error(response?.error || '화면을 열지 못했습니다.');
  return response;
}

export async function download({ mode, plan, archiveName }, onProgress = () => {}) {
  if (mode === 'individual') {
    return startIndividualDownloads(plan, {
      downloadFile: downloadFromPage,
      fetcher: fetch,
      urlApi: URL,
      onProgress
    });
  }

  const { files, failed } = await fetchZipEntries(plan, fetch, onProgress);
  if (!files.length) throw new Error('ZIP에 추가할 이미지를 가져오지 못했습니다.');
  onProgress({ phase: 'archive', processed: files.length, total: plan.length, failed });
  const blobUrl = URL.createObjectURL(createZip(files));
  try {
    downloadFromPage({ url: blobUrl, filename: archiveName });
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
  return { files: files.length, failed };
}

export function closeHost() {
  window.close();
}
