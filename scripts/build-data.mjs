/**
 * 构建数据快照：从 World Bank WDI 拉取两个指标，固化成 data/data.js。
 * 只在开发期运行一次；产出物提交进仓库，应用运行时零网络请求。
 *
 * 用法： node scripts/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const START_YEAR = 1990;          // 对比基准年
const YEAR_FROM = 1960;
const YEAR_TO = new Date().getFullYear();
const API = 'https://api.worldbank.org/v2';

const INDICATORS = {
  u5mr: { code: 'SH.DYN.MORT', label: '5岁以下儿童死亡率', short: '儿童死亡率', unit: '每 1000 活产儿', betterWhen: 'down', decimals: 1 },
  lifeExp: { code: 'SP.DYN.LE00.IN', label: '出生时预期寿命', short: '预期寿命', unit: '岁', betterWhen: 'up', decimals: 1 },
};

// 6 档分档边界（7 个值），保证档位比例 0/0.2/0.4/0.6/0.8/1.0 与 svgMap 的色值插值完全对齐
const THRESHOLDS = {
  u5mr: [0, 5, 10, 20, 40, 80, 150],
  lifeExp: [40, 55, 62, 68, 74, 80, 90],
};

// 区域名中文化
const REGION_ZH = {
  'East Asia & Pacific': '东亚与太平洋',
  'Europe & Central Asia': '欧洲与中亚',
  'Latin America & Caribbean': '拉丁美洲与加勒比',
  'Middle East & North Africa': '中东与北非',
  'North America': '北美',
  'South Asia': '南亚',
  'Sub-Saharan Africa': '撒哈拉以南非洲',
};

// 命名覆盖：香港、澳门在 WDI 是独立经济体，台湾无 WDI 数据
const NAME_EN_OVERRIDE = {
  TW: 'Taiwan, China',
};

const NAME_ZH_OVERRIDE = {
  HK: '中国香港特别行政区',
  MO: '中国澳门特别行政区',
  TW: '中国台湾',
};

/** 国家元数据：iso2 -> 区域名（指标端点不返回 region，需单独拉一次） */
async function fetchRegions() {
  const res = await fetch(`${API}/country?format=json&per_page=400`, { headers: { 'User-Agent': 'gpm-build/1.0' } });
  if (!res.ok) throw new Error(`country meta: HTTP ${res.status}`);
  const json = await res.json();
  const map = {};
  for (const c of json[1] || []) {
    if (!c.iso2Code || c.region.id === 'NA') continue;
    map[c.iso2Code] = c.region.value;
  }
  console.log(`  区域元数据：${Object.keys(map).length} 个国家/地区`);
  return map;
}

async function fetchIndicator(code) {
  const rows = [];
  let page = 1;
  let pages = 1;
  do {
    const url = `${API}/country/all/indicator/${code}?format=json&per_page=20000&date=${YEAR_FROM}:${YEAR_TO}&page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'gpm-build/1.0' } });
    if (!res.ok) throw new Error(`${code} page ${page}: HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json) || !json[1]) throw new Error(`${code} page ${page}: unexpected payload`);
    rows.push(...json[1]);
    pages = json[0].pages;
    console.log(`  ${code} page ${page}/${pages} (${json[1].length} rows)`);
    page += 1;
  } while (page <= pages);
  return rows;
}

/** 取基准年：优先 1990；缺则取 1990 之后最近一年；再缺取序列最早的年份 */
function pickBase(series) {
  if (!series.length) return null;
  const exact = series.find((p) => p[0] === START_YEAR);
  if (exact) return exact;
  const after = series.find((p) => p[0] > START_YEAR);
  return after || series[0];
}

function buildMetric(series) {
  if (!series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const base = pickBase(series);
  const delta = +(last[1] - base[1]).toFixed(2);
  const deltaPct = base[1] ? +((delta / base[1]) * 100).toFixed(1) : null;
  return {
    series,
    first: { year: first[0], value: first[1] },
    last: { year: last[0], value: last[1] },
    base: { year: base[0], value: base[1] },
    delta,
    deltaPct,
  };
}

async function main() {
  // 地图支持的国家白名单（svgMap 官方国家表），避免把聚合体 / 地图上不存在的代码塞进数据
  const countriesSrc = fs.readFileSync(path.join(ROOT, 'assets/vendor/countries.js'), 'utf8');
  const mapCountries = new Function(`${countriesSrc}; return countries;`)();
  console.log(`地图国家白名单：${Object.keys(mapCountries).length} 个`);

  const zh = JSON.parse(fs.readFileSync(path.join(__dirname, 'zh-countries.json'), 'utf8')).countries;

  const raw = {};
  for (const [key, cfg] of Object.entries(INDICATORS)) {
    console.log(`拉取 ${cfg.label} (${cfg.code}) …`);
    raw[key] = await fetchIndicator(cfg.code);
  }

  console.log('拉取区域元数据 …');
  const regions = await fetchRegions();

  // iso2 -> { iso3, nameEn, region, series: { u5mr: [], lifeExp: [] } }
  const acc = {};
  for (const [key, rows] of Object.entries(raw)) {
    for (const row of rows) {
      if (!row.country) continue;
      // all 查询里 country.id 就是 ISO2（聚合体是 'ZH'/'1A' 这类，被白名单挡掉）
      const iso2 = row.country.iso2Code || row.country.id;
      if (!iso2 || !mapCountries[iso2]) continue; // 聚合体（World、1A 等）与地图外的代码在此被过滤
      if (row.value === null || row.value === '') continue;
      const year = Number(row.date);
      if (!Number.isFinite(year)) continue;
      acc[iso2] ||= { iso3: row.countryiso3code, nameEn: row.country.value, region: REGION_ZH[regions[iso2]] || regions[iso2] || null, series: { u5mr: [], lifeExp: [] } };
      acc[iso2].series[key].push([year, +Number(row.value).toFixed(2)]);
    }
  }

  const countries = {};
  for (const iso2 of Object.keys(acc).sort()) {
    const entry = acc[iso2];
    const metrics = {};
    let any = false;
    for (const key of Object.keys(INDICATORS)) {
      const series = entry.series[key].sort((a, b) => a[0] - b[0]);
      metrics[key] = buildMetric(series);
      if (metrics[key]) any = true;
    }
    if (!any) continue;
    const nameZh = NAME_ZH_OVERRIDE[iso2] || zh[iso2] || entry.nameEn;
    countries[iso2] = {
      iso2,
      iso3: entry.iso3,
      nameZh,
      nameEn: NAME_EN_OVERRIDE[iso2] || entry.nameEn,
      region: entry.region,
      ...metrics,
    };
  }

  // 完全无数据的地图国家也保留条目（列表里显示"暂无数据"）
  for (const iso2 of Object.keys(mapCountries)) {
    if (countries[iso2]) continue;
    countries[iso2] = {
      iso2,
      nameZh: NAME_ZH_OVERRIDE[iso2] || zh[iso2] || mapCountries[iso2],
      nameEn: NAME_EN_OVERRIDE[iso2] || mapCountries[iso2],
      region: null,
      u5mr: null,
      lifeExp: null,
    };
  }

  const withData = Object.values(countries).filter((c) => c.u5mr);
  const snapshot = {
    meta: {
      version: '1.0',
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'World Bank WDI',
      codes: Object.values(INDICATORS).map((i) => i.code).join(', '),
      startYear: START_YEAR,
      yearRange: [YEAR_FROM, YEAR_TO],
      countriesWithData: withData.length,
      countriesTotal: Object.keys(countries).length,
    },
    indicators: {},
    countries,
  };
  for (const [key, cfg] of Object.entries(INDICATORS)) {
    snapshot.indicators[key] = {
      key,
      label: cfg.label,
      short: cfg.short,
      unit: cfg.unit,
      betterWhen: cfg.betterWhen,
      decimals: cfg.decimals,
      wdiCode: cfg.code,
      thresholds: THRESHOLDS[key],
    };
  }

  const out = path.join(ROOT, 'data/data.js');
  const json = JSON.stringify(snapshot, null, 0);
  fs.writeFileSync(out, `/* 自动生成，勿手改。来源：World Bank WDI / ${snapshot.meta.generatedAt} */\nwindow.__GPM_DATA__ = ${json};\n`, 'utf8');

  console.log(`\n写入 ${path.relative(ROOT, out)}  (${(json.length / 1024).toFixed(0)} KB)`);
  console.log(`有数据国家：${withData.length} / 地图国家：${snapshot.meta.countriesTotal}`);
  const cn = countries.CN;
  console.log(`抽查 中国：u5mr ${cn.u5mr.base.year} ${cn.u5mr.base.value} -> ${cn.u5mr.last.year} ${cn.u5mr.last.value} (${cn.u5mr.deltaPct}%)`);
  console.log(`抽查 中国：lifeExp ${cn.lifeExp.base.year} ${cn.lifeExp.base.value} -> ${cn.lifeExp.last.year} ${cn.lifeExp.last.value}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
