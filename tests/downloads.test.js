import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadPlan } from '../core.js';
import { fetchZipEntries, startIndividualDownloads } from '../downloads.js';

const images = [
  { url: 'https://example.com/a.jpg', extension: 'jpg' },
  { url: 'https://example.com/b.webp', extension: 'webp' }
];

test('passes common names to every individual download trigger', async () => {
  const calls = [];
  const revoked = [];
  const result = await startIndividualDownloads(createDownloadPlan(images, 'product'), {
    downloadFile: async (options) => { calls.push(options); return calls.length; },
    fetcher: async (url) => ({ ok: true, blob: async () => new Blob([url]) }),
    urlApi: {
      createObjectURL: (blob) => `blob:test-${blob.size}`,
      revokeObjectURL: (url) => revoked.push(url)
    }
  });
  assert.deepEqual(calls.map(({ filename }) => filename), ['product_01.jpg', 'product_02.webp']);
  assert.ok(calls.every(({ url }) => url.startsWith('blob:test-')));
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
