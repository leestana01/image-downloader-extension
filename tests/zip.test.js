import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32 } from '../zip.js';

test('calculates the standard CRC-32 vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('creates a ZIP with local, central, and end records', async () => {
  const zip = new Uint8Array(await createZip([
    { name: '이미지_1.txt', data: new TextEncoder().encode('hello') },
    { name: 'image_2.txt', data: new TextEncoder().encode('world') }
  ], new Date(2026, 0, 1)).arrayBuffer());
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 12, true), 2);
});
