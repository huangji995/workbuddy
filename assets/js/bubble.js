/* Gapminder 气泡图：横轴人均 GDP（对数），纵轴出生时预期寿命，
   面积 = 人口，颜色 = 地区；支持 1990—2024 逐年回放与拖动。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var NS = 'http://www.w3.org/2000/svg';

  var REGION_COLOR = {
    '东亚与太平洋': '#22D3EE',
    '欧洲与中亚': '#A78BFA',
    '拉丁美洲与加勒比': '#FBBF24',
    '中东与北非': '#FB923C',
    '北美': '#34D399',
    '南亚': '#FB7185',
    '撒哈拉以南非洲': '#8FA6BF'
  };
  var REGION_ORDER = Object.keys(REGION_COLOR);

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

  function fmtPop(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 亿';
    if (n >= 1e4) return Math.round(n / 1e4) + ' 万';
    return String(Math.round(n));
  }

  /**
   * @param {HTMLElement} root 画布容器（需已有确定尺寸）
   * @param {{iso2:string, nameZh:string, onYear:function}} opt
   */
  function create(root, opt) {
    var D = window.__GPM_DATA__;
    var B = window.__GPM_BUBBLE__;
    if (!D || !B) return null;

    var Y0 = B.meta.years[0];
    var Y1 = B.meta.years[1];
    var N = Y1 - Y0 + 1;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- 数据准备 ---------- */
    var rows = [];
    Object.keys(B.gdp).forEach(function (iso2) {
      var c = D.countries[iso2];
      if (!c) return;
      if (!B.pop[iso2]) return;
      var le = new Array(N);
      for (var k = 0; k < N; k++) le[k] = null;
      if (c.lifeExp) {
        for (var s = 0; s < c.lifeExp.series.length; s++) {
          var d = c.lifeExp.series[s];
          var idx = d[0] - Y0;
          if (idx >= 0 && idx < N) le[idx] = d[1];
        }
      }
      rows.push({
        iso2: iso2,
        name: c.nameZh,
        region: c.region,
        g: fillGaps(B.gdp[iso2], 2),
        p: fillGaps(B.pop[iso2], 2),
        le: fillGaps(le, 2)
      });
    });

    /* 图例 */
    var legend = document.createElement('div');
    legend.className = 'bub-legend';
    legend.innerHTML = REGION_ORDER.map(function (name) {
      return '<span><i style="background:' + REGION_COLOR[name] + '"></i>' + name + '</span>';
    }).join('') + '<span class="bub-legend-size">气泡面积 = 人口</span>';
    root.appendChild(legend);

    /* 控制条 */
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

    /* ---------- 尺寸 ----------
       图例与控制条先落地，画框才量得到「扣掉它们之后」的真实高度 */
    var plotEl = document.createElement('div');
    plotEl.className = 'bub-plot';
    root.insertBefore(plotEl, root.firstChild);

    var W = Math.max(320, Math.round(plotEl.clientWidth || root.clientWidth));
    var H = Math.max(220, Math.round(plotEl.clientHeight || root.clientHeight - 90));
    var m = { l: 58, r: 22, t: 34, b: 54 };
    var iw = W - m.l - m.r;
    var ih = H - m.t - m.b;

    var x = d3.scaleLog().domain([250, 200000]).range([0, iw]).clamp(true);
    var y = d3.scaleLinear().domain([25, 88]).range([ih, 0]).clamp(true);
    var rScale = d3.scaleSqrt().domain([1e5, 1.5e9]).range([2.4, 30]).clamp(true);
    var k = Math.min(iw / 820, ih / 430, 1.45);
    if (k < 0.62) k = 0.62;

    var svg = node('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%', height: '100%',
      role: 'img',
      'aria-label': '气泡图：横轴人均 GDP（对数刻度），纵轴出生时预期寿命，气泡面积代表人口，颜色代表地区'
    });
    var plot = node('g', { transform: 'translate(' + m.l + ',' + m.t + ')' });
    svg.appendChild(plot);

    /* 纵向网格（对数刻度）+ 横轴刻度 */
    var xTicks = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    xTicks.forEach(function (v) {
      plot.appendChild(node('line', {
        x1: x(v), x2: x(v), y1: 0, y2: ih,
        stroke: 'rgba(148,197,214,0.09)', 'stroke-width': 1
      }));
      var label = v >= 1000 ? (v / 1000) + 'k' : String(v);
      plot.appendChild(node('text', {
        x: x(v), y: ih + 22, 'text-anchor': 'middle', 'font-size': 13, fill: '#94A3B8'
      }, label));
    });

    /* 横向网格 + 纵轴刻度 */
    [30, 40, 50, 60, 70, 80].forEach(function (v) {
      plot.appendChild(node('line', {
        x1: 0, x2: iw, y1: y(v), y2: y(v),
        stroke: 'rgba(148,197,214,0.09)', 'stroke-width': 1
      }));
      plot.appendChild(node('text', {
        x: -12, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 13, fill: '#94A3B8'
      }, String(v)));
    });

    /* 轴标题 */
    plot.appendChild(node('text', {
      x: iw, y: ih + 44, 'text-anchor': 'end', 'font-size': 13, fill: '#94A3B8',
      'letter-spacing': '0.08em'
    }, '人均 GDP（PPP，国际元 · 对数刻度）→'));
    plot.appendChild(node('text', {
      x: 0, y: -13, 'font-size': 13, fill: '#94A3B8', 'letter-spacing': '0.06em'
    }, '↑ 出生时预期寿命（岁）'));

    var gBub = node('g', {});
    plot.appendChild(gBub);

    var circles = [];
    rows.forEach(function (row) {
      var c = node('circle', {
        r: 0, fill: REGION_COLOR[row.region] || '#8FA6BF',
        'fill-opacity': 0.52, stroke: REGION_COLOR[row.region] || '#8FA6BF',
        'stroke-opacity': 0.85, 'stroke-width': 1
      });
      gBub.appendChild(c);
      circles.push(c);
    });

    /* 选中国家：加一圈亮环 + 标签 */
    var focusIdx = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].iso2 === opt.iso2) { focusIdx = i; break; }
    var ring = node('circle', {
      r: 0, fill: 'none', stroke: '#22D3EE', 'stroke-width': 1.6, opacity: 0
    });
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
    var cur = 0;          // 当前（浮点）年份下标
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

    function paint() {
      var p = i;
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        var gv = valAt(row.g, cur);
        var pv = valAt(row.p, cur);
        var lv = valAt(row.le, cur);
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
      svg.setAttribute('aria-label', '气泡图，' + shown + ' 年：横轴人均 GDP（对数），纵轴出生时预期寿命，'
        + '气泡面积代表人口，颜色代表地区。共 ' + rows.length + ' 个国家与地区。');
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
      cur = Math.min(N - 1, cur + (dt / 1000) * (N / 14));  // 全程约 14 秒
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

    // 键盘左右键由 range 原生处理，会触发 input，无需额外绑定

    paint();
    requestAnimationFrame(function () { ring.setAttribute('opacity', 1); label.setAttribute('opacity', 1); });

    return {
      play: function () { if (!playing) setPlaying(true); },
      stop: function () { if (playing) setPlaying(false); },
      setYear: function (y) { tweenTo(Math.max(0, Math.min(N - 1, y - Y0)), 900); },
      current: function () { return Math.round(Y0 + cur); },
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        root.innerHTML = '';
      }
    };
  }

  GPM.bubble = { create: create, REGION_COLOR: REGION_COLOR };
})();
