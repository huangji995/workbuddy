/**
 * 无头浏览器探针：启动 Edge，注入一段 JS 求值，输出结果。
 * 用法： node scripts/probe.mjs <url> "<js expression>" [width] [height]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const url = process.argv[2];
const expr = process.argv[3];
const width = Number(process.argv[4] || 1280);
const height = Number(process.argv[5] || 900);
const outPng = process.argv[6];
const port = 9333 + Math.floor(Math.random() * 400);

const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) throw new Error('no browser found');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpm-probe-'));
const child = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page'
        && (t.url.includes('index.html') || t.url.startsWith('http')));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('page target not found');
}

async function main() {
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const send = (method, params = {}) => new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  if (process.argv[7] === 'full') {
    await send('Page.enable');
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: Number(process.env.DSF || 1), mobile: width < 700,
  });
  await sleep(1800);
  const out = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(out.result?.result?.value ?? out, null, 2));
  if (errors.length) console.log('PAGE ERRORS:', JSON.stringify(errors, null, 2));

  if (outPng) {
    await send('Page.enable');
    if (process.argv[7] === 'full') {
      const m = await send('Page.getLayoutMetrics');
      const h = Math.min(4000, Math.ceil(m.result.cssContentSize.height));
      await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: Number(process.env.DSF || 1), mobile: width < 700 });
      await sleep(700);
    }
    let params = { format: 'png', captureBeyondViewport: false };
    if (process.env.CLIP) {
      const [x, y, w, hh] = process.env.CLIP.split(',').map(Number);
      params.clip = { x, y, width: w, height: hh, scale: Number(process.env.CLIP_SCALE || 3) };
    }
    const shot = await send('Page.captureScreenshot', params);
    fs.writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
    console.log('shot ->', outPng);
  }
  ws.close();
}

main()
  .catch((e) => { console.error('PROBE ERROR', e.message); process.exitCode = 1; })
  .finally(() => {
    child.kill();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 500);
  });
