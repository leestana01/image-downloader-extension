import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const extensionId = [...createHash('sha256').update(extensionDir).digest('hex').slice(0, 32)]
  .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
  .join('');

async function poll(operation, message, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result) return result;
    } catch { /* retry while Chromium starts */ }
    await wait(100);
  }
  throw new Error(message);
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  return {
    send(method, params = {}) {
      sequence += 1;
      return new Promise((resolve, reject) => {
        pending.set(sequence, { resolve, reject });
        socket.send(JSON.stringify({ id: sequence, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

function createFixtureServer() {
  return http.createServer((request, response) => {
    if (request.url === '/gallery.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><img src="/original-a.svg"><img src="/original-b.svg">');
      return;
    }
    const match = request.url?.match(/^\/original-([abcd])\.svg$/);
    if (match) {
      response.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="original-${match[1]}.svg"`,
        'Access-Control-Allow-Origin': '*'
      });
      response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${match[1] === 'a' ? 'blue' : 'red'}"/></svg>`);
      return;
    }
    response.writeHead(404).end();
  });
}

const server = createFixtureServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const serverPort = server.address().port;
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'image-grabber-profile-'));
const downloadDir = await mkdtemp(path.join(os.tmpdir(), 'image-grabber-downloads-'));
const debugPort = 19226;
const chromium = spawn('chromium-browser', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-networking', '--no-first-run', '--remote-allow-origins=*',
  `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`,
  `--user-data-dir=${profileDir}`, `--remote-debugging-port=${debugPort}`, 'about:blank'
], { stdio: 'ignore' });

try {
  const version = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  }, 'Chromium debugging endpoint did not start');
  const browserCdp = await connectCdp(version.webSocketDebuggerUrl);
  await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

  assert.ok(extensionId);

  const galleryUrl = `http://127.0.0.1:${serverPort}/gallery.html`;
  const galleryTarget = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(galleryUrl)}`, { method: 'PUT' })).json();
  const galleryCdp = await connectCdp(galleryTarget.webSocketDebuggerUrl);
  const popupUrl = `chrome-extension://${extensionId}/app.html?surface=tab`;
  const popupTarget = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' })).json();
  const popupCdp = await connectCdp(popupTarget.webSocketDebuggerUrl);
  await popupCdp.send('Runtime.enable');
  await poll(async () => {
    const result = await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("summary")?.textContent', returnByValue: true });
    return result.result.value?.startsWith('전체 2개');
  }, 'Popup did not discover fixture images');

  await popupCdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('baseName').value = 'product';
      document.getElementById('selectAll').click();
      document.getElementById('download').click();
    })()`
  });
  const downloaded = await poll(async () => {
    const names = (await readdir(downloadDir)).filter((name) => !name.endsWith('.crdownload')).sort();
    return names.length === 2 ? names : null;
  }, 'Two downloads did not complete');
  assert.deepEqual(downloaded, ['product_01.svg', 'product_02.svg']);

  await popupCdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('input[name="downloadMode"][value="zip"]').click();
      document.getElementById('download').click();
    })()`
  });
  const downloadsWithZip = await poll(async () => {
    const names = (await readdir(downloadDir)).filter((name) => !name.endsWith('.crdownload')).sort();
    return names.includes('product.zip') ? names : null;
  }, 'ZIP did not use the common archive name');
  assert.deepEqual(downloadsWithZip, ['product.zip', 'product_01.svg', 'product_02.svg']);

  await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("collectionMode").click()' });
  await poll(async () => {
    const result = await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("collectionStatus").textContent', returnByValue: true });
    return result.result.value === '수집 중 · 2';
  }, 'Collection mode did not start');
  await galleryCdp.send('Runtime.evaluate', { expression: 'document.body.innerHTML = `<img src="/original-c.svg">`' });
  await poll(async () => {
    const result = await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("summary").textContent', returnByValue: true });
    return result.result.value === '전체 3개 · 표시 3개';
  }, 'Removed virtual-scroll images were not retained');

  await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("collectionMode").click()' });
  await poll(async () => {
    const result = await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("collectionStatus").textContent', returnByValue: true });
    return result.result.value === '수집됨 · 3';
  }, 'Collection mode did not stop');
  await galleryCdp.send('Runtime.evaluate', { expression: 'document.body.innerHTML = `<img src="/original-d.svg">`' });
  await wait(1_000);
  const stoppedSummary = await popupCdp.send('Runtime.evaluate', { expression: 'document.getElementById("summary").textContent', returnByValue: true });
  assert.equal(stoppedSummary.result.value, '전체 3개 · 표시 3개');

  galleryCdp.close();
  popupCdp.close();
  browserCdp.close();
  console.log(`Chromium downloads: ${downloadsWithZip.join(', ')}; collector retained 3 and ignored changes after stop`);
} finally {
  const exitAfterTerm = chromium.exitCode === null
    ? new Promise((resolve) => chromium.once('exit', resolve))
    : Promise.resolve();
  chromium.kill('SIGTERM');
  server.close();
  await Promise.race([
    exitAfterTerm,
    wait(1_000)
  ]);
  if (chromium.exitCode === null) {
    const exitAfterKill = new Promise((resolve) => chromium.once('exit', resolve));
    chromium.kill('SIGKILL');
    await exitAfterKill;
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(downloadDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
