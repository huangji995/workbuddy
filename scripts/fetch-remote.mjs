/**
 * 构建期抓取：用本机无头浏览器读取远程文本文件，直接写盘（内容不经过 stdout）。
 * 用法： node fetch-remote.mjs <url> <outPath>
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
const outPath = process.argv[3];
if (!url || !outPath) throw new Error('usage: node fetch-remote.mjs <url> <outPath>');

const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) throw new Error('no browser found');

const port = 9900 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-'));
const child = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('page target not found');
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Runtime.enable');

const read = async () => (await send('Runtime.evaluate', {
  expression: 'document.body ? document.body.innerText : ""',
  returnByValue: true,
})).result?.result?.value ?? '';

let text = '';
for (let i = 0; i < 40; i++) {
  const next = await read();
  if (next.length > 0 && next.length === text.length) { text = next; break; }
  text = next;
  await sleep(700);
}

fs.writeFileSync(outPath, text, 'utf8');
console.log(JSON.stringify({ bytes: Buffer.byteLength(text, 'utf8'), outPath }));

child.kill();
ws.close();
process.exit(0);
