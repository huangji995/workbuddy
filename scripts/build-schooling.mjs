/* 用 OWID 整理的 UNDP Human Development Report 2025 口径，
   重建「女性平均受教育年限」这一条序列，写回 data/indicators.js。

   旧口径是世行 WDI `BAR.SCHL.15UP.FE`（Barro-Lee，5 年一档、144 国、只到 2015/2020 前后）。
   新口径是 OWID `mean-years-of-schooling-female`（25 岁以上女性平均受教育年数，逐年、192 国、1990–2023）。

   运行：node scripts/build-schooling.mjs [源 JSON 路径]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2]
  || 'C:/Users/wangyiyang/WorkBuddy/2026-10-29-23-31-30/schooling_female_by_country.json';

/* data.js 挂在 window 上，用 vm 取一次 iso3 -> iso2 */
function loadData() {
  const src = fs.readFileSync(path.join(ROOT, 'data/data.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.__GPM_DATA__;
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const D = loadData();

const iso3to2 = new Map();
Object.values(D.countries).forEach((c) => {
  if (c.iso3) iso3to2.set(c.iso3.toUpperCase(), c.iso2);
});

/* records: [{ country, iso3, year, value }] */
const byCountry = new Map();
let skipped = 0;
for (const r of raw.records) {
  const iso2 = iso3to2.get(String(r.iso3 || '').toUpperCase());
  if (!iso2) { skipped++; continue; }
  const y = Number(r.year);
  const v = Number(r.value);
  if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
  if (!byCountry.has(iso2)) byCountry.set(iso2, new Map());
  byCountry.get(iso2).set(y, Math.round(v * 100) / 100);
}

const series = {};
let points = 0;
for (const [iso2, m] of byCountry) {
  const arr = [...m.entries()].sort((a, b) => a[0] - b[0]);
  if (arr.length < 2) continue;          // 一个点画不出线
  series[iso2] = arr;
  points += arr.length;
}

/* 读出现有快照，只替换 schooling 这一条 */
const indSrc = fs.readFileSync(path.join(ROOT, 'data/indicators.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(indSrc, ctx);
const payload = ctx.window.__GPM_IND__;

const before = payload.series.schooling || {};
const beforeYears = Object.keys(before).length;

payload.series.schooling = series;
payload.indicators.schooling = {
  key: 'schooling',
  label: '女性平均受教育年限',
  short: '女性教育',
  unit: '年',
  decimals: 1,
  betterWhen: 'up',
  pct: false,
  wdiCode: '',                                   // 不再是世行口径
  sourceId: 'OWID:mean-years-of-schooling-female',
  sourceName: 'UNDP HDR 2025 · OWID',
  sourceUrl: raw.source_url,
  valueDefinition: raw.value_definition
};
payload.meta.schoolingSource = {
  name: raw.source_name,
  url: raw.source_url,
  timeRange: raw.time_range,
  updatedAt: new Date().toISOString().slice(0, 10)
};

const out = path.join(ROOT, 'data/indicators.js');
fs.writeFileSync(
  out,
  '/* 世界银行 WDI + UNDP HDR 2025（经 OWID 整理）快照，构建时抓取，运行时不发请求 */\n'
  + 'window.__GPM_IND__ = '
  + JSON.stringify(payload)
  + ';\n',
  'utf8'
);

const years = new Set();
Object.values(series).forEach((arr) => arr.forEach((p) => years.add(p[0])));
const all = Object.values(series).flat();
const min = Math.min(...all.map((p) => p[1]));
const max = Math.max(...all.map((p) => p[1]));

console.log(`源文件：${path.basename(SRC)}（${raw.time_range}，${raw.country_count} 国 / ${raw.record_count} 条）`);
console.log(`映射到本项目：${Object.keys(series).length} 国（未匹配 ${skipped} 条区域或缺失 ISO3 记录）`);
console.log(`年份：${Math.min(...years)}–${Math.max(...years)}，共 ${years.size} 个年份 / ${points} 点`);
console.log(`值域：${min} – ${max} 年`);
console.log(`替换前：${beforeYears} 国 → 替换后：${Object.keys(series).length} 国`);
console.log(`写入 data/indicators.js  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
