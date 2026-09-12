import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionFromUrl, makeDownloadName, matchesFilters, sanitizeFileName } from '../core.js';

test('extracts normalized extensions from URLs and data URLs', () => {
  assert.equal(extensionFromUrl('https://example.com/photo.JPEG?size=2'), 'jpg');
  assert.equal(extensionFromUrl('data:image/svg+xml;base64,abc'), 'svg');
  assert.equal(extensionFromUrl('https://example.com/no-extension'), 'image');
});

test('sanitizes filenames and creates numbered common names', () => {
  assert.equal(sanitizeFileName(' bad:/name?. '), 'bad__name_');
  assert.equal(makeDownloadName({ url: 'https://x/a.png', extension: 'png' }, 1, 12, '상품 이미지'), '상품 이미지-02.png');
});

test('applies dimension and extension filters together', () => {
  const image = { width: 800, height: 600, extension: 'webp' };
  assert.equal(matchesFilters(image, { minWidth: 700, maxWidth: 900, minHeight: 500, maxHeight: 700, extensions: new Set(['webp']) }), true);
  assert.equal(matchesFilters(image, { minWidth: 801, maxWidth: 0, minHeight: 0, maxHeight: 0, extensions: new Set() }), false);
});
