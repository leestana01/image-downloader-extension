import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadPlan } from '../core.js';
import { fetchZipEntries, startIndividualDownloads } from '../downloads.js';

const images = [
  { url: 'https://example.com/a.jpg', extension: 'jpg' },
  { url: 'https://example.com/b.webp', extension: 'webp' }
];

test('passes common names to every chrome.downloads.download call', async () => {
  const calls = [];
  const result = await startIndividualDownloads(createDownloadPlan(images, 'product'), {
    download: async (options) => { calls.push(options); return calls.length; }
  });
  assert.deepEqual(calls.map(({ filename }) => filename), ['product_01.jpg', 'product_02.webp']);
  assert.ok(calls.every(({ conflictAction, saveAs }) => conflictAction === 'uniquify' && saveAs === false));
  assert.deepEqual(result, { completed: 2, failed: 0 });
});

test('uses the identical common names for ZIP entries', async () => {
  const plan = createDownloadPlan(images, 'product');
  const { files, failed } = await fetchZipEntries(plan, async (url) => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode(url).buffer
  }));
  assert.deepEqual(files.map(({ name }) => name), ['product_01.jpg', 'product_02.webp']);
  assert.equal(failed, 0);
});
