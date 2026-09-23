import { createDownloadPlan, extensionFromUrl, makeArchiveName, matchesFilters } from './core.js';
import { fetchZipEntries, startIndividualDownloads } from './downloads.js';
import { scanImages } from './scanner.js';
import { createZip } from './zip.js';

const params = new URLSearchParams(location.search);
const state = {
  images: [], selected: new Set(), extensions: new Set(), view: 'grid',
  sourceTabId: null, nextImageId: 0, collectedCount: 0
};
if (params.has('surface')) document.body.classList.add('standalone');
const $ = (id) => document.getElementById(id);
const elements = {
  summary: $('summary'), results: $('results'), empty: $('empty'), extensions: $('extensions'),
  selectAll: $('selectAll'), download: $('download'), baseName: $('baseName'), status: $('status'),
  minWidth: $('minWidth'), maxWidth: $('maxWidth'), minHeight: $('minHeight'), maxHeight: $('maxHeight'),
  gridView: $('gridView'), listView: $('listView'), rescan: $('rescan'), resetFilters: $('resetFilters'),
  openWindow: $('openWindow'), openTab: $('openTab'), openFullscreen: $('openFullscreen'),
  collectionMode: $('collectionMode'), collectionStatus: $('collectionStatus'),
  downloadModes: [...document.querySelectorAll('input[name="downloadMode"]')]
};

function filters() {
  return {
    minWidth: Number(elements.minWidth.value) || 0,
    maxWidth: Number(elements.maxWidth.value) || 0,
    minHeight: Number(elements.minHeight.value) || 0,
    maxHeight: Number(elements.maxHeight.value) || 0,
    extensions: state.extensions
  };
}

function filteredImages() { return state.images.filter((image) => matchesFilters(image, filters())); }

function downloadMode() { return elements.downloadModes.find((input) => input.checked)?.value || 'individual'; }

function normalizeImage(image) {
  const id = state.nextImageId;
  state.nextImageId += 1;
  return {
    ...image,
    id,
    extension: extensionFromUrl(image.url),
    name: (() => {
      try {
        const url = new URL(image.url);
        if (!['http:', 'https:', 'file:'].includes(url.protocol)) return `image-${id + 1}`;
        return decodeURIComponent(url.pathname.split('/').pop()) || `image-${id + 1}`;
      } catch { return `image-${id + 1}`; }
    })()
  };
}

function mergeImages(images) {
  const byUrl = new Map(state.images.map((image) => [image.url, image]));
  let changed = false;
  for (const image of images) {
    const current = byUrl.get(image.url);
    if (!current) {
      const normalized = normalizeImage(image);
      state.images.push(normalized);
      byUrl.set(normalized.url, normalized);
      changed = true;
    } else if ((image.width || 0) * (image.height || 0) > current.width * current.height) {
      current.width = image.width;
      current.height = image.height;
      changed = true;
    }
  }
  return changed;
}

async function collectorMessage(action) {
  return chrome.tabs.sendMessage(state.sourceTabId, { action });
}

function updateCollectorControl(snapshot) {
  elements.collectionMode.checked = snapshot.active;
  state.collectedCount = snapshot.images.length;
  elements.collectionStatus.textContent = snapshot.active
    ? `수집 중 · ${snapshot.images.length}`
    : (snapshot.images.length ? `수집됨 · ${snapshot.images.length}` : '수집 모드');
  elements.collectionMode.closest('.collector-control').classList.toggle('collecting', snapshot.active);
}

async function refreshCollector() {
  if (!state.sourceTabId) return;
  const snapshot = await collectorMessage('collector:status');
  updateCollectorControl(snapshot);
  if (mergeImages(snapshot.images)) {
    renderExtensions();
    render();
  }
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

function renderExtensions() {
  const types = [...new Set(state.images.map((image) => image.extension))].sort();
  if (!types.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'extension-placeholder';
    placeholder.textContent = '확장자 옵션이 여기에 표시됩니다';
    elements.extensions.replaceChildren(placeholder);
    return;
  }
  elements.extensions.replaceChildren(...types.map((type) => {
    const label = document.createElement('label');
    label.className = 'extension-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = type;
    input.checked = state.extensions.has(type);
    input.addEventListener('change', () => {
      input.checked ? state.extensions.add(type) : state.extensions.delete(type);
      render();
    });
    const text = document.createElement('span');
    text.textContent = type;
    label.append(input, text);
    return label;
  }));
}

function createCard(image) {
  const card = document.createElement('article');
  card.className = `media-item${state.selected.has(image.id) ? ' selected' : ''}`;
  card.title = image.url;
  card.tabIndex = 0;
  card.setAttribute('role', 'checkbox');
  card.setAttribute('aria-checked', state.selected.has(image.id));
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'check';
  checkbox.checked = state.selected.has(image.id);
  checkbox.setAttribute('aria-label', `${image.name} 선택`);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? state.selected.add(image.id) : state.selected.delete(image.id);
    updateSelection();
    card.classList.toggle('selected', checkbox.checked);
    card.setAttribute('aria-checked', checkbox.checked);
  });
  const visual = document.createElement('div');
  visual.className = 'visual';
  const preview = document.createElement('img');
  preview.className = 'thumb';
  preview.src = image.url;
  preview.alt = '';
  preview.loading = 'lazy';
  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = image.name;
  const dimensions = document.createElement('div');
  dimensions.className = 'dimensions';
  dimensions.textContent = `${image.width || '?'} × ${image.height || '?'} · ${image.extension}`;
  meta.append(name, dimensions);
  visual.append(preview, checkbox);
  card.append(visual, meta);
  const toggle = () => {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  };
  card.addEventListener('click', (event) => { if (event.target !== checkbox) toggle(); });
  card.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  });
  return card;
}

function updateSelection() {
  const visible = filteredImages();
  const selectedVisible = visible.filter((item) => state.selected.has(item.id)).length;
  elements.selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
  elements.selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  elements.download.disabled = state.selected.size === 0;
  elements.download.textContent = state.selected.size
    ? (downloadMode() === 'zip' ? `${state.selected.size}개 ZIP` : `${state.selected.size}개 다운로드`)
    : '선택 다운로드';
}

function render() {
  const visible = filteredImages();
  elements.results.replaceChildren(...visible.map(createCard));
  elements.results.className = `results ${state.view}`;
  elements.empty.hidden = visible.length !== 0;
  elements.results.hidden = visible.length === 0;
  elements.summary.textContent = `전체 ${state.images.length}개 · 표시 ${visible.length}개`;
  updateSelection();
}

async function loadImages() {
  elements.status.textContent = '';
  elements.summary.textContent = '이미지를 검색하는 중…';
  elements.rescan.disabled = true;
  try {
    const requestedTabId = Number(params.get('tabId'));
    const tab = Number.isInteger(requestedTabId) && requestedTabId > 0
      ? await chrome.tabs.get(requestedTabId)
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id || !/^https?:|^file:/.test(tab.url || '')) throw new Error('일반 웹페이지에서만 사용할 수 있습니다.');
    state.sourceTabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['collector.js'] });
    const [[{ result }], collector] = await Promise.all([
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanImages }),
      collectorMessage('collector:status')
    ]);
    state.images = [];
    state.nextImageId = 0;
    state.selected.clear();
    state.extensions.clear();
    mergeImages(result);
    mergeImages(collector.images);
    updateCollectorControl(collector);
    renderExtensions();
    render();
  } catch (error) {
    state.images = [];
    render();
    elements.status.textContent = error.message;
  } finally {
    elements.rescan.disabled = false;
  }
}

async function downloadIndividually(plan) {
  const { completed, failed } = await startIndividualDownloads(plan, {
    downloadFile: downloadFromPage,
    fetcher: fetch,
    urlApi: URL,
    onProgress: ({ completed: done, failed: errors, total }) => {
      elements.status.textContent = `${done + errors}/${total} 처리 중…`;
    }
  });
  elements.status.textContent = failed ? `${completed}개 완료, ${failed}개 실패` : `${completed}개 다운로드를 시작했습니다.`;
}

async function downloadAsZip(plan) {
  const { files, failed } = await fetchZipEntries(plan, fetch, ({ processed, total }) => {
    elements.status.textContent = `${processed}/${total} ZIP 준비 중…`;
  });
  if (!files.length) throw new Error('ZIP에 추가할 이미지를 가져오지 못했습니다.');

  elements.status.textContent = 'ZIP 파일을 생성하는 중…';
  const blobUrl = URL.createObjectURL(createZip(files));
  try {
    downloadFromPage({ url: blobUrl, filename: makeArchiveName(elements.baseName.value) });
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
  elements.status.textContent = failed
    ? `ZIP 다운로드 시작 · ${files.length}개 포함, ${failed}개 실패`
    : `${files.length}개 이미지 ZIP 다운로드를 시작했습니다.`;
}

async function downloadSelected() {
  const selected = state.images.filter((image) => state.selected.has(image.id));
  const plan = createDownloadPlan(selected, elements.baseName.value);
  elements.download.disabled = true;
  elements.status.textContent = '';
  try {
    if (downloadMode() === 'zip') await downloadAsZip(plan);
    else await downloadIndividually(plan);
  } catch (error) {
    elements.status.textContent = error.message;
  }
  updateSelection();
}

for (const input of [elements.minWidth, elements.maxWidth, elements.minHeight, elements.maxHeight]) {
  input.addEventListener('input', render);
}
elements.selectAll.addEventListener('change', () => {
  for (const image of filteredImages()) elements.selectAll.checked ? state.selected.add(image.id) : state.selected.delete(image.id);
  render();
});
elements.gridView.addEventListener('click', () => setView('grid'));
elements.listView.addEventListener('click', () => setView('list'));
elements.rescan.addEventListener('click', loadImages);
elements.collectionMode.addEventListener('change', async () => {
  elements.collectionMode.disabled = true;
  try {
    const snapshot = await collectorMessage(elements.collectionMode.checked ? 'collector:start' : 'collector:stop');
    updateCollectorControl(snapshot);
    if (mergeImages(snapshot.images)) {
      renderExtensions();
      render();
    }
  } catch (error) {
    elements.collectionMode.checked = !elements.collectionMode.checked;
    elements.status.textContent = `수집 모드: ${error.message}`;
  } finally {
    elements.collectionMode.disabled = false;
  }
});
async function openSurface(surface) {
  if (!state.sourceTabId) return;
  const response = await chrome.runtime.sendMessage({ action: 'openSurface', surface, sourceTabId: state.sourceTabId });
  if (!response?.ok) throw new Error(response?.error || '화면을 열지 못했습니다.');
  if (!params.has('surface')) window.close();
}
elements.openWindow.addEventListener('click', () => openSurface('window').catch((error) => { elements.status.textContent = error.message; }));
elements.openTab.addEventListener('click', () => openSurface('tab').catch((error) => { elements.status.textContent = error.message; }));
elements.openFullscreen.addEventListener('click', () => openSurface('fullscreen').catch((error) => { elements.status.textContent = error.message; }));
elements.resetFilters.addEventListener('click', () => {
  for (const input of [elements.minWidth, elements.maxWidth, elements.minHeight, elements.maxHeight]) input.value = '';
  state.extensions.clear();
  renderExtensions();
  render();
});
elements.download.addEventListener('click', downloadSelected);
for (const input of elements.downloadModes) input.addEventListener('change', updateSelection);

function setView(view) {
  state.view = view;
  elements.gridView.classList.toggle('active', view === 'grid');
  elements.listView.classList.toggle('active', view === 'list');
  elements.gridView.setAttribute('aria-pressed', view === 'grid');
  elements.listView.setAttribute('aria-pressed', view === 'list');
  render();
}

loadImages();
setInterval(() => {
  if (elements.collectionMode.checked) refreshCollector().catch(() => {});
}, 800);
