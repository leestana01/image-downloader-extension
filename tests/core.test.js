import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadPlan, extensionFromUrl, makeDownloadName, matchesFilters, sanitizeFileName } from '../core.js';

test('extracts normalized extensions from URLs and data URLs', () => {
  assert.equal(extensionFromUrl('https://example.com/photo.JPEG?size=2'), 'jpg');
  assert.equal(extensionFromUrl('data:image/svg+xml;base64,abc'), 'svg');
  assert.equal(extensionFromUrl('https://example.com/no-extension'), 'image');
});

test('sanitizes filenames and creates numbered common names', () => {
  assert.equal(sanitizeFileName(' bad:/name?. '), 'bad__name_');
  assert.equal(makeDownloadName({ url: 'https://x/a.png', extension: 'png' }, 1, 12, '상품 이미지'), '상품 이미지_02.png');
  assert.equal(makeDownloadName({ url: 'https://x/a.png', extension: 'png' }, 0, 2, '상품 이미지'), '상품 이미지_01.png');
});

test('creates one shared filename plan for all download modes', () => {
  const images = [
    { url: 'https://x/a.jpg', extension: 'jpg' },
    { url: 'https://x/b.png', extension: 'png' }
  ];
  assert.deepEqual(createDownloadPlan(images, '여행'), [
    { image: images[0], url: images[0].url, filename: '여행_01.jpg' },
    { image: images[1], url: images[1].url, filename: '여행_02.png' }
  ]);
});

test('applies dimension and extension filters together', () => {
  const image = { width: 800, height: 600, extension: 'webp' };
  assert.equal(matchesFilters(image, { minWidth: 700, maxWidth: 900, minHeight: 500, maxHeight: 700, extensions: new Set(['webp']) }), true);
  assert.equal(matchesFilters(image, { minWidth: 801, maxWidth: 0, minHeight: 0, maxHeight: 0, extensions: new Set() }), false);
});
