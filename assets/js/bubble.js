/* Gapminder 气泡图：横轴人均 GDP（对数），纵轴可切换（默认出生时预期寿命），
   面积 = 人口，颜色 = 地区；自带 1990—2024 逐年回放。
   主要用在首页「展开全球宏观气泡图」的弹层里，详情页不再内嵌。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var NS = 'http://www.w3.org/2000/svg';

  var REGION_COLOR = {
    '东亚与太平洋': '#22D3EE',
    '欧洲与中亚': '#A78BFA',
    '拉丁美洲和加勒比': '#FBBF24',
    '中东与北非': '#FB923C',
    '北美': '#34D399',
    '南亚': '#FB7185',
    '撒哈拉以南非洲': '#8FA6BF'
  };
  var REGION_ORDER = Object.keys(REGION_COLOR);

  /* 纵轴候选。量程写死，气泡才会真的「往右上角挪」；
     跟着数据缩放的话，看起来就是原地抖动。 */
  var Y_META = {
    lifeExp: { label: '出生时预期寿命（岁）', short: '预期寿命', unit: '岁', domain: [25, 88], ticks: [30, 40, 50, 60, 70, 80] },
    dtp3: { label: '一岁儿童疫苗接种率（%）', short: '疫苗率', unit: '%', domain: [0, 100], ticks: [0, 20, 40, 60, 80, 100] },
    electricity: { label: '电力可及率（%）', short: '电力', unit: '%', domain: [0, 100], ticks: [0, 20, 40, 60, 80, 100] },
    schooling: { label: '女性教育(25-34岁)（年）', short: '女性教育', unit: '年', domain: [0, 16], ticks: [0, 4, 8, 12, 16] }
  };
  var Y_ORDER = ['lifeExp', 'dtp3', 'electricity', 'schooling'];

  function node(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** 缺口补齐：最多向后延续 maxGap 年，避免气泡闪烁又不会凭空外推太久 */
  function fillGaps(arr, maxGap) {
    var out = arr.slice();
    var last = null;
    var gap = 0;
    for (var i = 0; i < out.length; i++) {
      if (out[i] !== null && out[i] !== undefined) {
        last = out[i];
        gap = 0;
      } else if (last !== null && gap < maxGap) {
        out[i] = last;
        gap += 1;
      } else {
        out[i] = null;
      }
    }
    return out;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function fmtGdp(v) {
    if (v >= 10000) return (v / 10000).toFixed(1) + ' 万';
    return Math.round(v).toLocaleString('en-US');
  }

  function fmtY(v, key) {
    if (v === null || v === undefined) return '—';
    return key === 'lifeExp' ? v.toFixed(1) : (v >= 100 ? String(Math.round(v)) : v.toFixed(1));
  }

  /**
   * @param {HTMLElement} root 容器（已有确定尺寸）
   * @param {{yKey?:string, iso2?:string, nameZh?:string, onYear?:function, onYChange?:function}} opt
   */
  function create(root, opt) {
    opt = opt || {};
    var D = window.__GPM_DATA__;
    var B = window.__GPM_BUBBLE__;
    if (!D || !B) return null;

    var Y0 = B.meta.years[0];
    var Y1 = B.meta.years[1];
    var N = Y1 - Y0 + 1;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var yKey = Y_META[opt.yKey] ? opt.yKey : 'lifeExp';

    /* ---------- 数据准备 ---------- */
    var rows = [];
    Object.keys(B.gdp).forEach(function (iso2) {
      var c = D.countries[iso2];
      if (!c || !B.pop[iso2]) return;
      rows.push({
        iso2: iso2,
        name: c.nameZh,
        region: c.region,
        g: fillGaps(B.gdp[iso2], 2),
        p: fillGaps(B.pop[iso2], 2),
        yc: {}
      });
    });

    /* 纵轴序列按指标现算并缓存：换轴不重建整个 DOM */
    function yValues(row, key) {
      if (row.yc[key]) return row.yc[key];
      var arr = new Array(N);
      for (var i = 0; i < N; i++) arr[i] = null;
      var s = GPM.seriesOf(row.iso2, key);
      if (s) {
        var ind = GPM.indicator(key);
        for (var j = 0; j < s.length; j++) {
          var idx = s[j][0] - Y0;
          if (idx >= 0 && idx < N) arr[idx] = s[j][1];
        }
        arr = fillGaps(arr, (ind && ind.maxGap) || 2);
      }
      row.yc[key] = arr;
      return arr;
    }

    /* ---------- 骨架 ---------- */
    var plotEl = document.createElement('div');
    plotEl.className = 'bub-plot';
    root.appendChild(plotEl);

    var legend = document.createElement('div');
    legend.className = 'bub-legend';
    legend.innerHTML = REGION_ORDER.map(function (name) {
      return '<span><i style="background:' + REGION_COLOR[name] + '"></i>' + name + '</span>';
    }).join('') + '<span class="bub-legend-size">气泡面积 = 人口</span>';
    root.appendChild(legend);

    var hud = document.createElement('div');
    hud.className = 'bub-hud';
    hud.innerHTML = '<div class="bub-year"><b>1990</b><em>年</em></div>'
      + '<button class="bub-play" type="button" aria-label="播放 1990 到 2024 年的变化">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5.5 18 12 9 18.5Z"/></svg>'
      + '</button>'
      + '<div class="bub-track">'
      + '<input class="bub-range" type="range" min="0" max="' + (N - 1) + '" step="0.02" value="0" aria-label="气泡图年份">'
      + '<div class="bub-ends"><span>' + Y0 + '</span><span>' + Y1 + '</span></div>'
      + '</div>';
    root.appendChild(hud);

    var yearEl = hud.querySelector('.bub-year b');
    var playBtn = hud.querySelector('.bub-play');
    var range = hud.querySelector('.bub-range');

    var tip = document.createElement('div');
    tip.className = 'bub-tip';
    tip.hidden = true;
    plotEl.appendChild(tip);

    /* ---------- 尺寸 ---------- */
    var W = Math.max(320, Math.round(plotEl.clientWidth || root.clientWidth));
    var H = Math.max(220, Math.round(plotEl.clientHeight || root.clientHeight - 90));
    var m = { l: 58, r: 24, t: 36, b: 52 };
    var iw = W - m.l - m.r;
    var ih = H - m.t - m.b;

    var x = d3.scaleLog().domain([250, 200000]).range([0, iw]).clamp(true);
    var y = d3.scaleLinear().domain(Y_META[yKey].domain).range([ih, 0]).clamp(true);
    var rScale = d3.scaleSqrt().domain([1e5, 1.5e9]).range([2.4, 30]).clamp(true);
    var k = Math.min(iw / 820, ih / 430, 1.45);
    if (k < 0.62) k = 0.62;

    var svg = node('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%', height: '100%',
      role: 'img'
    });
    var plot = node('g', { transform: 'translate(' + m.l + ',' + m.t + ')' });
    svg.appendChild(plot);

    /* 纵向网格（对数刻度）+ 横轴刻度。
       窄屏时按像素间距筛刻度，否则 500 / 1k / 2k 会挤成一团。 */
    var xCandidates = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    var lastLabelX = -1e9;
    xCandidates.forEach(function (v) {
      var cx = x(v);
      plot.appendChild(node('line', {
        x1: cx, x2: cx, y1: 0, y2: ih,
        stroke: 'rgba(148,197,214,0.09)', 'stroke-width': 1
      }));
      if (cx - lastLabelX < 46) return;
      lastLabelX = cx;
      var label = v >= 1000 ? (v / 1000) + 'k' : String(v);
      plot.appendChild(node('text', {
        x: cx, y: ih + 22, 'text-anchor': 'middle', 'font-size': 13, fill: '#94A3B8'
      }, label));
    });

    /* 横向网格单独成组：换纵轴时整组重建 */
    var gYGrid = node('g', {});
    plot.appendChild(gYGrid);

    var yTitle = node('text', {
      x: 0, y: -14, 'font-size': 13, fill: '#94A3B8', 'letter-spacing': '0.06em'
    });
    plot.appendChild(yTitle);

    plot.appendChild(node('text', {
      x: iw, y: ih + 42, 'text-anchor': 'end', 'font-size': 13, fill: '#94A3B8',
      'letter-spacing': '0.08em'
    }, '人均 GDP（PPP，国际元 · 对数刻度）→'));

    var gBub = node('g', {});
    plot.appendChild(gBub);

    var circles = [];
    rows.forEach(function (row) {
      var color = REGION_COLOR[row.region] || '#8FA6BF';
      var c = node('circle', {
        r: 0, fill: color, 'fill-opacity': 0.52,
        stroke: color, 'stroke-opacity': 0.85, 'stroke-width': 1
      });
      gBub.appendChild(c);
      circles.push(c);
    });

    /* 选中国家（可选）：一圈亮环 + 标签 */
    var focusIdx = -1;
    if (opt.iso2) {
      for (var i = 0; i < rows.length; i++) if (rows[i].iso2 === opt.iso2) { focusIdx = i; break; }
    }
    var ring = node('circle', { r: 0, fill: 'none', stroke: '#22D3EE', 'stroke-width': 1.6, opacity: 0 });
    var label = node('text', {
      'font-size': 14, 'font-weight': 600, fill: '#FFFFFF', 'text-anchor': 'middle',
      'paint-order': 'stroke', stroke: '#020617', 'stroke-width': 3.5, 'stroke-linejoin': 'round',
      opacity: 0
    }, opt.nameZh || '');
    if (focusIdx >= 0) {
      gBub.appendChild(ring);
      gBub.appendChild(label);
    }

    plotEl.appendChild(svg);

    /* ---------- 渲染 ---------- */
    var cur = 0;
    var raf = null;
    var playing = false;
    var lastTs = 0;

    function valAt(arr, i) {
      var a = Math.floor(i);
      var b = Math.min(N - 1, a + 1);
      var f = i - a;
      if (arr[a] == null) return arr[b] == null ? null : arr[b];
      if (arr[b] == null) return arr[a];
      return arr[a] + (arr[b] - arr[a]) * f;
    }

    function drawY() {
      var meta = Y_META[yKey];
      y.domain(meta.domain);
      while (gYGrid.firstChild) gYGrid.removeChild(gYGrid.firstChild);
      meta.ticks.forEach(function (v) {
        gYGrid.appendChild(node('line', {
          x1: 0, x2: iw, y1: y(v), y2: y(v),
          stroke: 'rgba(148,197,214,0.09)', 'stroke-width': 1
        }));
        gYGrid.appendChild(node('text', {
          x: -12, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 13, fill: '#94A3B8'
        }, String(v)));
      });
      yTitle.textContent = '↑ ' + meta.label;
      svg.setAttribute('aria-label', '气泡图：横轴人均 GDP（对数刻度），纵轴' + meta.label
        + '，气泡面积代表人口，颜色代表地区。');
    }

    function paint() {
      var yy = yValues;
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        var gv = valAt(row.g, cur);
        var pv = valAt(row.p, cur);
        var lv = valAt(yy(row, yKey), cur);
        var cir = circles[j];
        if (gv == null || pv == null || lv == null) {
          cir.setAttribute('r', 0);
          continue;
        }
        var cx = x(gv);
        var cy = y(lv);
        var rr = Math.max(1.6, rScale(pv) * k);
        cir.setAttribute('cx', cx);
        cir.setAttribute('cy', cy);
        cir.setAttribute('r', rr);
        if (j === focusIdx) {
          ring.setAttribute('cx', cx);
          ring.setAttribute('cy', cy);
          ring.setAttribute('r', rr + 4);
          label.setAttribute('x', Math.min(iw - 30, Math.max(30, cx)));
          label.setAttribute('y', Math.max(12, cy - rr - 8));
        }
      }
      var shown = Math.round(Y0 + cur);
      yearEl.textContent = String(shown);
      range.value = String(cur);
      svg.setAttribute('aria-label', '气泡图，' + shown + ' 年：横轴人均 GDP（对数），纵轴'
        + Y_META[yKey].label + '，气泡面积代表人口，颜色代表地区。共 ' + rows.length + ' 个国家与地区。');
      if (opt.onYear) opt.onYear(shown);
    }

    function tweenTo(target, dur) {
      if (raf) cancelAnimationFrame(raf);
      if (reduce || !dur) { cur = target; paint(); return; }
      var from = cur;
      var t0 = 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var t = Math.min(1, (ts - t0) / dur);
        cur = from + (target - from) * easeInOut(t);
        paint();
        if (t < 1) raf = requestAnimationFrame(step);
        else raf = null;
      }
      raf = requestAnimationFrame(step);
    }

    function setPlaying(on) {
      playing = on;
      playBtn.classList.toggle('is-playing', on);
      playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      playBtn.setAttribute('aria-label', on ? '暂停' : '播放 1990 到 2024 年的变化');
      hideTip();
      if (on) {
        if (cur >= N - 1.01) { cur = 0; paint(); }
        lastTs = 0;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        raf = requestAnimationFrame(tick);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(64, ts - lastTs);
      lastTs = ts;
      cur = Math.min(N - 1, cur + (dt / 1000) * (N / 14));   // 全程约 14 秒
      paint();
      if (cur >= N - 1 - 0.001) {
        cur = N - 1;
        paint();
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    playBtn.addEventListener('click', function () { setPlaying(!playing); });

    range.addEventListener('input', function () {
      if (playing) setPlaying(false);
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      cur = Number(range.value);
      paint();
    });

    /* ---------- 悬停读数（弹层里没有「选中国家」，靠它认泡） ---------- */
    var hoverIdx = -1;

    function hideTip() {
      tip.hidden = true;
      if (hoverIdx >= 0 && circles[hoverIdx]) {
        var c0 = circles[hoverIdx];
        c0.setAttribute('stroke-width', 1);
        c0.setAttribute('fill-opacity', 0.52);
        hoverIdx = -1;
      }
    }

    function onMove(e) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var px = (e.clientX - rect.left) / rect.width * W - m.l;
      var py = (e.clientY - rect.top) / rect.height * H - m.t;
      var best = -1, bestD = Infinity, bestR = 0, bestX = 0, bestY = 0;
      for (var j = 0; j < rows.length; j++) {
        var gv = valAt(rows[j].g, cur);
        var pv = valAt(rows[j].p, cur);
        var lv = valAt(yValues(rows[j], yKey), cur);
        if (gv == null || pv == null || lv == null) continue;
        var cx = x(gv), cy = y(lv);
        var rr = Math.max(1.6, rScale(pv) * k);
        var d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        if (d <= rr + 3 && d < bestD) { best = j; bestD = d; bestR = rr; bestX = cx; bestY = cy; }
      }
      if (best < 0) { hideTip(); return; }
      if (hoverIdx !== best) hideTip();
      hoverIdx = best;
      var cir = circles[best];
      cir.setAttribute('stroke-width', 2.4);
      cir.setAttribute('fill-opacity', 0.78);
      var row = rows[best];
      tip.innerHTML = '<b>' + row.name + '</b>'
        + '<span>人均 GDP ' + fmtGdp(valAt(row.g, cur)) + ' 国际元</span>'
        + '<span>' + Y_META[yKey].short + ' ' + fmtY(valAt(yValues(row, yKey), cur), yKey)
        + ' ' + Y_META[yKey].unit + '</span>';
      tip.hidden = false;
      /* cx / cy 是 viewBox 坐标，按当前缩放换算回容器像素 */
      var sc = rect.width / W;
      var left = Math.min(Math.max((bestX + m.l) * sc, 76), rect.width - 76);
      var top = (bestY + m.t) * sc - bestR * sc - 10;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(8, top) + 'px';
      tip.style.transform = 'translate(-50%, -100%)';
    }

    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', hideTip);

    drawY();
    paint();
    requestAnimationFrame(function () { ring.setAttribute('opacity', focusIdx >= 0 ? 1 : 0); label.setAttribute('opacity', focusIdx >= 0 ? 1 : 0); });

    return {
      play: function () { if (!playing) setPlaying(true); },
      stop: function () { if (playing) setPlaying(false); },
      setYear: function (yr) { tweenTo(Math.max(0, Math.min(N - 1, yr - Y0)), 900); },
      setYKey: function (key) {
        if (!Y_META[key] || key === yKey) return;
        yKey = key;
        hideTip();
        drawY();
        paint();
        if (opt.onYChange) opt.onYChange(key);
      },
      yKey: function () { return yKey; },
      current: function () { return Math.round(Y0 + cur); },
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerleave', hideTip);
        root.innerHTML = '';
      }
    };
  }

  GPM.bubble = { create: create, REGION_COLOR: REGION_COLOR, Y_META: Y_META, Y_ORDER: Y_ORDER };
})();
