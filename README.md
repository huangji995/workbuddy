# 全球进步地图

一颗会自转的 3D 地球，用 5 岁以下儿童死亡率着色；时间可以逐年回放——从 1990 播到 2024，你能看到整颗星球一点点褪去高热色。点进任意国家，会掉进一段滚动叙事：数字一路往下跳，折线一路往上走，最后落到一张 Gapminder 气泡图上。

**零构建、零依赖安装、零网络请求**：双击 `index.html` 即可运行，断网也能完整使用。

视觉：深空底色 `#020617` + 青色强调 `#06B5D4`，数字一律等宽字体加粗；地球海洋半透明（透出背景），经纬线暗青，边缘一圈外发光；陆地用「冷青 → 琥珀 → 红 → 高热」的连续热成像色阶，数值越高越烫。

排版尺度（可用性优先）：

| 层级 | 字号 | 用途 |
|---|---|---|
| 展示级 | `clamp(86px, 18vw, 250px)` → 第 2 屏 `clamp(56px, 9vw, 124px)` | 详情页那个数字 |
| 正文 | 16–17px | 首页说明、详情页尾注 |
| 标题 | 15–19px / 600 | 图表标题、国家名、面板标题 |
| 辅助 | 13–14px | 坐标轴刻度、图例、tooltip、列表数值 |
| 装饰 | 11–12px | 顶部 HUD 条、卡片脚注（纯装饰，不承载信息） |
| HUD 标题 | `clamp(14px, 1.15vw, 17px)` / 0.14em 字距 | 气泡屏左上角那一行 |

次级文字统一用 `#94A3B8`（在 `#020617` 上约 7:1），不再用 `#64748B`。第 2 屏的数字缩放改成**字号过渡**（`transition: font-size`）而不是把整块 `scale(0.46)`。

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
assets/js/country-view.js     详情页：指标胶囊栏、数字+折线区块、气泡图区块
assets/js/bubble.js          Gapminder 气泡图（对数横轴、气泡面积=人口、逐年回放）
assets/js/chart.js            手写 SVG 折线图（缺失年份断线、逐点绘制）
assets/js/util.js             连续色阶、按年取值、格式化
assets/vendor/d3.min.js       d3 v7（仅用到 d3-geo 一族，MIT）
data/data.js                  数据快照（挂 window.__GPM_DATA__）
data/bubble.js                人均 GDP（PPP）与总人口快照（挂 window.__GPM_BUBBLE__，1990—2024）
data/indicators.js            疫苗率 / 电力 / 儿童人口 / 女性教育快照（挂 window.__GPM_IND__）
data/geo.js                   国界 GeoJSON（挂 window.__GPM_GEO__，Natural Earth 110m）
scripts/build-data.mjs        WDI 数据重建（开发期一次性运行，需要网络）
scripts/build-bubble.mjs      气泡图数据重建：NY.GDP.PCAP.PP.CD + SP.POP.TOTL
scripts/build-indicators.mjs  详情页补充指标重建：SH.IMM.IDPT / EG.ELC.ACCS.ZS / SP.POP.0014.TO.ZS / BAR.SCHL.15UP.FE
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
- 详情页另有 4 个可按国家拆开的指标（疫苗率、电力可及率、0—14 岁人口占比、女性平均受教育年限），来自同样的 WDI，见 `data/indicators.js`。
- 重建：`node scripts/build-data.mjs`、`node scripts/build-bubble.mjs`、`node scripts/build-geo.mjs`、`node scripts/build-indicators.mjs`（均需网络，只在开发期运行）；页面本身永远不联网。

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

## 详情页：指标切换 + 三段式区块

整页没有任何滚动锁定、没有 scroll-snap、没有撑满视口的 sticky 画布 —— 三块内容都是普通的
文档流区块，随便上下滚：

| 区块 | 高度 | 内容 |
|---|---|---|
| 顶部固定条 | 约 119px | 返回 + 国家名 + 一排可横向滑动的指标胶囊（sticky） |
| 1 数字 + 折线 | `min-height: 80vh` | 左：`[ 国家 ]` + 指标名 + 起点 → 连接线 → 巨大终值；右：该指标的折线 |
| 2 气泡图 | 约一屏 | Gapminder：横轴人均 GDP（对数），纵轴预期寿命，面积=人口，颜色=地区 |
| 3 尾注 | 自适应 | 指标跨度、WDI 指标号、可展开的数据表 |

### 指标（6 个，全部按国家拆开）

| 指标 | 单位 | WDI | 覆盖 |
|---|---|---|---|
| 5岁以下儿童死亡率（默认选中） | ‰ | `SH.DYN.MORT` | 196 国 |
| 预期寿命 | 岁 | `SP.DYN.LE00.IN` | 196 国 |
| 一岁儿童疫苗接种率 | % | `SH.IMM.IDPT` | 193 国 |
| 电力可及率 | % | `EG.ELC.ACCS.ZS` | 214 国 |
| 0—14 岁人口占比 | % | `SP.POP.0014.TO.ZS` | 215 国 |
| 女性平均受教育年限 | 年 | `BAR.SCHL.15UP.FE` | 144 国（5 年一档） |

前两个在 `data/data.js`，后四个由 `scripts/build-indicators.mjs` 抓成 `data/indicators.js`
（一次 `country/all` 请求拿全量，构建期抓取，运行时零请求）。某个国家缺哪项，那颗胶囊就置灰、
进不去；一个都没有的国家退回纯文字页。

- 点胶囊 → 左侧数字、单位、起点、年份、右侧 Y 轴与数据线一起换；换完如果这块在视口里，动画重播一次
- **进入播、离开重置**：`IntersectionObserver`（`threshold 0.4`）只看「这块够不够显眼」，
  滚走就 `reset()`（数字回起点、折线清空），滚回来再播一次；向上滚同样能重播
- 动画节奏不变：先停 0.5 秒把起点读清楚，再用 3 秒 `easeInOutCubic` 落到最新一年；折线进度直接取数字补间的那个缓动值，笔尖和数字同起同落
- 连接线的箭头跟着指标方向翻：数值整体在跌就朝下（`scaleY(-1)` 由 `data-dir` 控制）
- 终值颜色看指标语义：跌了更好（儿童死亡率）走绿，涨了更好走绿，涨跌都不代表好坏（儿童人口占比）走中性青，变差走暗红
- 气泡图懒创建：第一次进视口才建，之后用自带时间轴（▶ 播放约 14 秒跑完 1990—2024、拖动、键盘左右）
- `≤900` 上下分栏（1024 仍是左右两栏）；手机端胶囊栏横向滑动、右侧有渐隐提示
- `prefers-reduced-motion` 下数字直接落定、折线直接画完
- 数字落定后终值仍写在 DOM 里（`#stBig`），读屏与搜索都能读到

## 已知限制

- 110m 分辨率下，小国（新加坡、香港等）没有独立多边形，地球上点不到——通过**搜索框 + 国家列表**进入（列表项是原生 `<button>`，可键盘操作）。
- 110m 数据在小国与海岸线上有可感知的简化；如需更精细可换 Natural Earth 50m（`build-geo.mjs` 换源即可，体积约 ×4）。
- 1990 年前的历史数据（1960 起）不再展示：地图、趋势图、气泡图统一用 1990—2024 这一段，口径一致。
- 个别国家存在异常尖峰（例如南苏丹 1988 年 780.9‰），这是 WDI 原始数据，未做任何平滑或裁剪，趋势图 y 轴会因此被拉高。
