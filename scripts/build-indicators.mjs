/* 把「事实」里还能按国家拆开的几项指标，从世界银行 WDI 拉成一份内联快照。
   每个指标一次请求（country/all + per_page=20000），只保留 data.js 里已有的国家。
   输出：data/indicators.js -> window.__GPM_IND__

   运行：node scripts/build-indicators.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = 1990;
const END = 2024;

/* key -> WDI 指标；label/unit 直接写死，避免每次都读官方英文名 */
const CODES = [
  { key: 'dtp3', code: 'SH.IMM.IDPT', label: '一岁儿童疫苗接种率', short: '疫苗率', unit: '%', decimals: 1, betterWhen: 'up', pct: true },
  { key: 'electricity', code: 'EG.ELC.ACCS.ZS', label: '电力可及率', short: '电力', unit: '%', decimals: 1, betterWhen: 'up', pct: true },
  { key: 'schooling', code: 'BAR.SCHL.15UP.FE', label: '女性平均受教育年限', short: '女性教育', unit: '年', decimals: 1, betterWhen: 'up', pct: false }
];

/* data.js 是在 window 上挂全局的，用 vm 取一次 iso3 -> iso2 */
function loadCountryIndex() {
  const src = fs.readFileSync(path.join(ROOT, 'data/data.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const D = ctx.window.__GPM_DATA__;
  const map = new Map();
  Object.values(D.countries).forEach((c) => {
    if (c.iso3) map.set(c.iso3.toUpperCase(), c.iso2);
  });
  console.log(`data.js: ${map.size} 个国家有 ISO3`);
  return map;
}

async function fetchIndicator(code) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}`
    + `?format=json&per_page=20000&date=${START}:${END}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json) || !json[1]) throw new Error(`${code}: 返回结构异常`);
  return json[1].filter((r) => r.value !== null && r.value !== undefined);
}

const iso3to2 = loadCountryIndex();
const indicators = {};
const series = {};

for (const spec of CODES) {
  process.stdout.write(`拉取 ${spec.code} … `);
  const rows = await fetchIndicator(spec.code);
  const byCountry = new Map();
  for (const r of rows) {
    const iso2 = iso3to2.get(String(r.countryiso3code || '').toUpperCase());
    if (!iso2) continue;                      // 区域 / 收入组等聚合项，丢掉
    const y = Number(r.date);
    if (!(y >= START && y <= END)) continue;
    if (!byCountry.has(iso2)) byCountry.set(iso2, []);
    byCountry.get(iso2).push([y, Math.round(r.value * 10) / 10]);
  }
  const out = {};
  let points = 0;
  for (const [iso2, arr] of byCountry) {
    arr.sort((a, b) => a[0] - b[0]);
    if (arr.length < 2) continue;             // 一个点画不出线
    out[iso2] = arr;
    points += arr.length;
  }
  const n = Object.keys(out).length;
  series[spec.key] = out;
  indicators[spec.key] = {
    key: spec.key,
    label: spec.label,
    short: spec.short,
    unit: spec.unit,
    decimals: spec.decimals,
    betterWhen: spec.betterWhen,
    pct: spec.pct,
    wdiCode: spec.code
  };
  console.log(`${n} 国 / ${points} 点`);
}

const payload = {
  meta: {
    version: '1.0',
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'World Bank WDI',
    startYear: START,
    endYear: END,
    codes: CODES.map((c) => c.code).join(', ')
  },
  indicators,
  series
};

const out = path.join(ROOT, 'data/indicators.js');
fs.writeFileSync(
  out,
  '/* 世界银行 WDI 快照，构建时抓取，运行时不发请求 */\n'
  + 'window.__GPM_IND__ = '
  + JSON.stringify(payload)
  + ';\n',
  'utf8'
);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`\n写入 ${path.relative(ROOT, out)}  ${kb}KB`);
