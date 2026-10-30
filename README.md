# 全球进步地图

一颗会自转的 3D 地球，用 5 岁以下儿童死亡率着色；时间可以逐年回放——从 1990 播到 2024，你能看到整颗星球一点点褪去高热色。点进任意国家，会掉进一段滚动叙事：数字一路往下跳，折线一路往上走，最后落到一张 Gapminder 气泡图上。

**零构建、零依赖安装、零网络请求**：双击 `index.html` 即可运行，断网也能完整使用。

视觉：深空底色 `#020617` + 青色强调 `#06B5D4`，数字一律等宽字体加粗；地球海洋半透明（透出背景），经纬线暗青，边缘一圈外发光；陆地用「冷青 → 琥珀 → 红 → 高热」的连续热成像色阶，数值越高越烫。

---

## 运行

直接双击 `index.html`（`file://` 即可，不需要本地服务器）。

如果想用服务器：
```bash
npx serve .        # 或 python -m http.server 8080
```

## 交互

- **拖动**旋转地球（带惯性），松手后缓慢自转
- **悬停**国家：显示当年数值、较 1990 的变化幅度
- **点击**国家：进入滚动叙事详情页——大数字倒数 → 两条趋势线 → Gapminder 气泡图
- **时间轴**：播放/暂停（空格键也行），或直接拖到任意年份；播完停在 2024，稍候自动淡出重播
- 顶部三个指标（各国中位数 / 高于 50‰ 的国家数 / 低于 10‰ 的国家数）随年份实时重算
- **开场直觉测试**：首次打开先做 3 道单选题，题目数值由数据实时计算；右上角 `[ Skip >> ]` 或 Esc 可跳过

### 开场测试怎么重看

- 每个浏览器会话只弹一次（`sessionStorage`）；新开标签页会再弹
- 想强制重看：地址后加 `?test=1`，或在控制台执行 `GPM.calibration.open()`

## 目录

```
index.html                    入口
assets/css/style.css          样式（含响应式与入场动效）
assets/js/app.js              hash 路由（#/ 与 #/c/XX）
assets/js/globe.js            3D 地球渲染器（d3.geoOrthographic + Canvas 2D）
assets/js/map-view.js         首页：时间轴状态机、KPI、图例、搜索、榜单
assets/js/calibration.js      开场直觉测试层（3 题 + 结算，独立于地球渲染）
assets/js/country-view.js     详情页：滚动叙事（sticky 画布 + IntersectionObserver 状态机）
assets/js/bubble.js          Gapminder 气泡图（对数横轴、气泡面积=人口、逐年回放）
assets/js/chart.js            手写 SVG 折线图（缺失年份断线）
assets/js/util.js             连续色阶、按年取值、格式化
assets/vendor/d3.min.js       d3 v7（仅用到 d3-geo 一族，MIT）
data/data.js                  数据快照（挂 window.__GPM_DATA__）
data/bubble.js                人均 GDP（PPP）与总人口快照（挂 window.__GPM_BUBBLE__，1990—2024）
data/geo.js                   国界 GeoJSON（挂 window.__GPM_GEO__，Natural Earth 110m）
scripts/build-data.mjs        WDI 数据重建（开发期一次性运行，需要网络）
scripts/build-bubble.mjs      气泡图数据重建：NY.GDP.PCAP.PP.CD + SP.POP.TOTL
scripts/build-geo.mjs         国界重建：world-atlas TopoJSON → GeoJSON → data/geo.js
scripts/countries-110m.json   构建素材：world-atlas@2
scripts/iso-codes.json        构建素材：ISO numeric → alpha2 映射
scripts/topojson-client.min.js 构建素材：TopoJSON 解码（仅构建期用）
scripts/probe.mjs             无头浏览器探针（自测用，不进交付物）
scripts/fetch-remote.mjs      命令行被墙时用浏览器抓取远程文本（开发工具）
```

## 数据

- 指标：**World Bank WDI** `SH.DYN.MORT`（5 岁以下儿童死亡率，每 1000 活产儿）、`SP.DYN.LE00.IN`（出生时预期寿命，岁）；气泡图另用 `NY.GDP.PCAP.PP.CD`（人均 GDP，PPP 国际元）与 `SP.POP.TOTL`（总人口）。
- 国界：**Natural Earth 110m**（经 world-atlas@2），177 个国家多边形，全部能与 WDI 数据对上 ISO2。
- 覆盖：245 个地图区域，其中 196 个有数据；无数据的国家在地球上是中性灰，悬停显示「暂无数据」，不填任何估算值。
- 重建：`node scripts/build-data.mjs`、`node scripts/build-bubble.mjs`、`node scripts/build-geo.mjs`（均需网络，只在开发期运行）；页面本身永远不联网。

### 为什么数据都是 `.js`
`file://` 下 `fetch('data.json')` 会被 CORS 拦掉，这是"离线可跑"最常见的翻车点。`.js` 文件把同一份 JSON 字面量挂到 `window` 全局，内容仍可按 JSON 解析。

### 口径
- 回放区间 **1990 → 2024**；相邻年份线性插值（各国缺测年份连续时平滑过渡，折线图仍按缺测断线）。
- 各国最新可得年份不同（多为 2024），tooltip 和卡片一律显示实际年份，不写"现在"。
- 香港、澳门按 WDI 单独经济体收录，显示为「中国香港特别行政区」「中国澳门特别行政区」；台湾无 WDI 数据，按无数据处理。

## 几个设计决定

| 决定 | 理由 |
|---|---|
| d3.geoOrthographic + Canvas 2D，不用 three.js | 真实的大圆裁剪与地平线；Canvas 每帧重绘 177 个多边形毫无压力，还免掉 WebGL 的拾取复杂度。无需任何纹理图片 |
| 连续色阶而不是 6 档离散色 | 离散分档在年份动画里会"跳色"；连续色阶才能让颜色随时间流动。锚点仍取 `0/5/10/20/40/80/150`，分布观感与原分档一致 |
| 自转很慢（约 86 秒一圈） | 地球是背景，数据才是主角；转太快会抢走注意力。拖动有惯性，停下后恢复慢速自转 |
| 播完停在 2024，淡出后重播 | 回放是"讲故事"的主循环；淡出让重播读作"循环"，而不是时间倒流 |
| 3 个 KPI 随年份重算 | 中位数、高于 50‰ 国家数、低于 10‰ 国家数——三个数字讲清"世界在变好" |
| 滚出视口 / 切后台自动暂停 | 不白烧电；`prefers-reduced-motion` 下不自转、直接停在 2024 |
| 手写 SVG 折线图（详情页） | 需要"缺 1 年就断线"、随容器重算、可展开数据表 |
| 详情页用滚动叙事，而不是卡片瀑布 | 一个数字一段话地推进，比一屏塞满图表更像"讲故事"；`IntersectionObserver` 触发离散状态，状态间只动 transform/opacity |
| 气泡图坐标轴写死量程（GDP 250—200000、寿命 25—88） | 量程固定，气泡才会真的"往右上角挪"；量程跟着数据走的话，看起来就是原地抖动 |
| hash 路由 | `file://` 下 `pushState` 受限，hash 的直链/刷新/后退都安全 |

## 详情页的滚动叙事

四段式，全部由 `IntersectionObserver`（中线触发）驱动，`data-state` 切三种画布状态：

| 步 | 画布 | 文字 |
|---|---|---|
| 0 | 1990 年的数字，整屏居中 | —（只有「向下滚动」） |
| 1 | 数字缩到左侧并一路倒数到今天；右侧两条趋势线淡入，末尾浮出降幅 | 「每一个点都是一年真实观测」 |
| 2 | Gapminder 气泡图接管：横轴人均 GDP（对数），纵轴预期寿命，面积=人口，颜色=地区 | 「放回世界的坐标里」 |
| 3 | 同上，留白让自动播放跑完 | — |

- 数字倒数期间，真实终值始终写在 DOM 里（`#stBig` / `#stLineNum`），读屏与搜索都能读到
- 画布状态只改 `opacity` / `transform`，不碰 `top/width/height`
- `prefers-reduced-motion` 下过渡压到 1ms、数字直接落定、气泡图不自动播放
- 气泡图有自己的时间轴：▶ 播放（约 14 秒跑完 1990—2024）、拖动、键盘左右

## 已知限制

- 110m 分辨率下，小国（新加坡、香港等）没有独立多边形，地球上点不到——通过**搜索框 + 国家列表**进入（列表项是原生 `<button>`，可键盘操作）。
- 110m 数据在小国与海岸线上有可感知的简化；如需更精细可换 Natural Earth 50m（`build-geo.mjs` 换源即可，体积约 ×4）。
- 1990 年前的历史数据（1960 起）不再展示：地图、趋势图、气泡图统一用 1990—2024 这一段，口径一致。
- 个别国家存在异常尖峰（例如南苏丹 1988 年 780.9‰），这是 WDI 原始数据，未做任何平滑或裁剪，趋势图 y 轴会因此被拉高。
