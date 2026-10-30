# 全球进步地图

一颗会自转的 3D 地球，用 5 岁以下儿童死亡率着色；时间可以逐年回放——从 1990 播到 2024，你能看到整颗星球一点点变浅。点进任意国家，看它这些年走了多远。

**零构建、零依赖安装、零网络请求**：双击 `index.html` 即可运行，断网也能完整使用。

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
- **点击**国家：进入该国详情页（1990 vs 现在对比卡 + 两条趋势线）
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
assets/js/country-view.js     详情页：对比卡 + 两张小多图
assets/js/chart.js            手写 SVG 折线图（缺失年份断线）
assets/js/util.js             连续色阶、按年取值、格式化
assets/vendor/d3.min.js       d3 v7（仅用到 d3-geo 一族，MIT）
data/data.js                  数据快照（挂 window.__GPM_DATA__）
data/geo.js                   国界 GeoJSON（挂 window.__GPM_GEO__，Natural Earth 110m）
scripts/build-data.mjs        WDI 数据重建（开发期一次性运行，需要网络）
scripts/build-geo.mjs         国界重建：world-atlas TopoJSON → GeoJSON → data/geo.js
scripts/countries-110m.json   构建素材：world-atlas@2
scripts/iso-codes.json        构建素材：ISO numeric → alpha2 映射
scripts/topojson-client.min.js 构建素材：TopoJSON 解码（仅构建期用）
scripts/probe.mjs             无头浏览器探针（自测用，不进交付物）
scripts/fetch-remote.mjs      命令行被墙时用浏览器抓取远程文本（开发工具）
```

## 数据

- 指标：**World Bank WDI** `SH.DYN.MORT`（5 岁以下儿童死亡率，每 1000 活产儿）、`SP.DYN.LE00.IN`（出生时预期寿命，岁）。
- 国界：**Natural Earth 110m**（经 world-atlas@2），177 个国家多边形，全部能与 WDI 数据对上 ISO2。
- 覆盖：245 个地图区域，其中 196 个有数据；无数据的国家在地球上是中性灰，悬停显示「暂无数据」，不填任何估算值。
- 重建：`node scripts/build-data.mjs` 与 `node scripts/build-geo.mjs`（均需网络，只在开发期运行）；页面本身永远不联网。

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
| hash 路由 | `file://` 下 `pushState` 受限，hash 的直链/刷新/后退都安全 |

## 已知限制

- 110m 分辨率下，小国（新加坡、香港等）没有独立多边形，地球上点不到——通过**搜索框 + 国家列表**进入（列表项是原生 `<button>`，可键盘操作）。
- 110m 数据在小国与海岸线上有可感知的简化；如需更精细可换 Natural Earth 50m（`build-geo.mjs` 换源即可，体积约 ×4）。
- 1990 年前的历史数据（1960 起）只用于趋势图，不参与回放与对比卡。
- 个别国家存在异常尖峰（例如南苏丹 1988 年 780.9‰），这是 WDI 原始数据，未做任何平滑或裁剪，趋势图 y 轴会因此被拉高。
