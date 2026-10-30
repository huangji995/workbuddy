/**
 * 构建气泡图数据快照：人均 GDP（PPP）与总人口，1990—2024。
 * 只覆盖 data/data.js 里已有的国家（iso3 对齐），产出 data/bubble.js。
 *
 * 用法： node scripts/build-bubble.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const Y0 = 1990;
const Y1 = 2024;
const API = 'https://api.worldbank.org/v2';
const CODES = { gdp: 'NY.GDP.PCAP.PP.CD', pop: 'SP.POP.TOTL' };

/** 读 data.js，拿到 iso3 → iso2 映射（只保留有指标数据的国家） */
function loadIso() {
  const src = fs.readFileSync(path.join(ROOT, 'data/data.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  const D = sandbox.window.__GPM_DATA__;
  const map = {};
  for (const iso2 of Object.keys(D.countries)) {
    const c = D.countries[iso2];
    if (!c.iso3) continue;
    map[c.iso3] = iso2;
  }
  return map;
}

async function fetchIndicator(code) {
  const out = {};
  let page = 1;
  let pages = 1;
  do {
    const url = `${API}/country/all/indicator/${code}?format=json&per_page=20000&date=${Y0}:${Y1}&page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'gpm-build/1.0' } });
    if (!res.ok) throw new Error(`${code} page ${page}: HTTP ${res.status}`);
    const json = await res.json();
    pages = json[0].pages;
    for (const row of json[1] || []) {
      const iso3 = row.countryiso3code;
      if (!iso3 || row.value === null) continue;
      const y = Number(row.date);
      if (y < Y0 || y > Y1) continue;
      (out[iso3] = out[iso3] || {})[y] = row.value;
    }
    page += 1;
  } while (page <= pages);
  return out;
}

function toArray(byYear) {
  const arr = new Array(Y1 - Y0 + 1).fill(null);
  for (const y of Object.keys(byYear || {})) {
    const i = Number(y) - Y0;
    if (i >= 0 && i < arr.length) arr[i] = Math.round(byYear[y]);
  }
  return arr;
}

const iso3to2 = loadIso();
console.log('countries in data.js:', Object.keys(iso3to2).length);

const [gdp, pop] = await Promise.all([fetchIndicator(CODES.gdp), fetchIndicator(CODES.pop)]);

const out = { gdp: {}, pop: {} };
let n = 0;
for (const iso3 of Object.keys(iso3to2)) {
  if (!gdp[iso3] && !pop[iso3]) continue;
  const iso2 = iso3to2[iso3];
  if (gdp[iso3]) out.gdp[iso2] = toArray(gdp[iso3]);
  if (pop[iso3]) out.pop[iso2] = toArray(pop[iso3]);
  n += 1;
}

const payload = {
  meta: {
    years: [Y0, Y1],
    source: 'World Bank WDI',
    codes: `${CODES.gdp}, ${CODES.pop}`,
    note: 'gdp 单位：2021 年国际元（PPP）；pop 单位：人。数组下标 = 年份 - 1990，null 表示该年无数据。'
  },
  gdp: out.gdp,
  pop: out.pop
};

const body = '/* 气泡图数据快照（人均 GDP PPP 与总人口），由 scripts/build-bubble.mjs 生成，请勿手改 */\n'
  + 'window.__GPM_BUBBLE__ = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data/bubble.js'), body);
console.log('wrote data/bubble.js', (Buffer.byteLength(body) / 1024).toFixed(0) + 'KB', 'countries:', n);
