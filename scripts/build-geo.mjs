/**
 * 构建期：world-atlas TopoJSON → GeoJSON → 内联 JS 资源（离线可用）
 * 产出 data/geo.js：window.__GPM_GEO__ = { features: [...] }
 *
 * 说明：运行时不做任何网络请求，file:// 直接双击也能跑。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/countries-110m.json'), 'utf8'));
const codes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/iso-codes.json'), 'utf8'));
const dataSrc = fs.readFileSync(path.join(ROOT, 'data/data.js'), 'utf8');
const DATA = JSON.parse(dataSrc.slice(dataSrc.indexOf('{'), dataSrc.lastIndexOf('}') + 1));

// 在 Node 里加载 UMD 版的 topojson-client
const umdSrc = fs.readFileSync(path.join(ROOT, 'scripts/topojson-client.min.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', umdSrc)(mod, mod.exports);
const topojson = mod.exports;

// numeric -> alpha2
const numericToAlpha2 = new Map();
for (const [alpha2, , numeric] of codes) numericToAlpha2.set(numeric, alpha2);

// id 异常（world-atlas 部分争议/属地不写 ISO 数字码）时按名称兜底
const NAME_FIX = {
  Kosovo: 'XK',
  Somaliland: 'SO',
  'N. Cyprus': 'CY',
  'Fr. S. Antarctic Lands': 'TF',
  'Northern Cyprus': 'CY',
};

const coll = topojson.feature(topo, topo.objects.countries);
const round = (n) => Math.round(n * 100) / 100;

function cleanCoords(coords) {
  if (typeof coords[0] === 'number') return [round(coords[0]), round(coords[1])];
  return coords.map(cleanCoords);
}

const features = [];
const unmapped = [];
for (const f of coll.features) {
  const name = f.properties?.name ?? '';
  let iso2 = numericToAlpha2.get(String(f.id).padStart(3, '0')) || NAME_FIX[name] || null;
  if (!iso2) { unmapped.push(`${name}(${f.id})`); continue; }
  const known = !!DATA.countries[iso2];
  features.push({
    iso2,
    known,
    name,
    geom: { type: f.geometry.type, coordinates: cleanCoords(f.geometry.coordinates) },
  });
}

const out = {
  meta: {
    source: 'Natural Earth 110m via world-atlas@2',
    generatedAt: new Date().toISOString().slice(0, 10),
    count: features.length,
  },
  features,
};

fs.writeFileSync(
  path.join(ROOT, 'data/geo.js'),
  'window.__GPM_GEO__ = ' + JSON.stringify(out) + ';\n',
  'utf8',
);

const bytes = fs.statSync(path.join(ROOT, 'data/geo.js')).size;
console.log(`features=${features.length} known=${features.filter((f) => f.known).length} bytes=${bytes}`);
if (unmapped.length) console.log('未映射（已跳过）:', unmapped.join(', '));

const missing = Object.keys(DATA.countries).filter(
  (k) => !features.some((f) => f.iso2 === k),
);
console.log(`数据里有、地图上没有的条目 ${missing.length} 个:`, missing.slice(0, 30).join(' '));
