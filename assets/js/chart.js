/* 手写 SVG 折线图：单指标、支持缺失年份断线、指针读数、随容器宽度重绘 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var NS = 'http://www.w3.org/2000/svg';

  function node(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function niceStep(range, count) {
    if (range <= 0) return 1;
    var raw = range / count;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function tickValues(min, max, count) {
    var step = niceStep(max - min, count || 4);
    var out = [];
    for (var v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
      out.push(Math.abs(v) < 1e-9 ? 0 : +v.toFixed(6));
    }
    return out;
  }

  /** 缺 1 年以上就断开，不做插值 */
  function splitSegments(series) {
    var segs = [];
    var cur = null;
    var prev = null;
    for (var i = 0; i < series.length; i++) {
      var p = series[i];
      if (prev !== null && p[0] - prev > 1) cur = null;
      if (!cur) {
        cur = [];
        segs.push(cur);
      }
      cur.push(p);
      prev = p[0];
    }
    return segs;
  }

  function render(container, cfg) {
    container.innerHTML = '';
    var series = cfg.series || [];
    if (!series.length) return false;

    var W = Math.max(260, Math.round(container.clientWidth || 620));
    var showX = cfg.showXAxis !== false;
    var m = { l: 58, r: 22, t: 18, b: showX ? 36 : 12 };
    // 绘图区高度固定：上下两张小多图才能沿时间轴严格对齐
    var ih = cfg.plotHeight || 160;
    var H = m.t + ih + m.b;
    var iw = W - m.l - m.r;

    var y0 = cfg.yDomain[0];
    var y1 = cfg.yDomain[1];
    var yr0 = cfg.yearDomain[0];
    var yr1 = cfg.yearDomain[1];
    var spanX = Math.max(1, yr1 - yr0);

    function sx(year) { return m.l + ((year - yr0) / spanX) * iw; }
    function sy(v) { return m.t + ih - ((v - y0) / (y1 - y0)) * ih; }

    var svg = node('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      height: H,
      role: 'img',
      'aria-label': cfg.ariaLabel || ''
    });

    // 水平网格 + y 轴刻度
    tickValues(y0, y1, 4).forEach(function (v) {
      var y = sy(v);
      svg.appendChild(node('line', { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: 'rgba(148,197,214,0.10)', 'stroke-width': 1 }));
      svg.appendChild(node('text', {
        x: m.l - 10, y: y + 4, 'text-anchor': 'end',
        'font-size': 13, fill: '#94A3B8', 'font-variant-numeric': 'tabular-nums'
      }, cfg.yFormat ? cfg.yFormat(v) : String(v)));
    });

    // 起点年参考线
    if (cfg.baseYear && cfg.baseYear > yr0 && cfg.baseYear < yr1) {
      svg.appendChild(node('line', {
        x1: sx(cfg.baseYear), x2: sx(cfg.baseYear), y1: m.t, y2: m.t + ih,
        stroke: 'rgba(6,181,212,0.40)', 'stroke-width': 1, 'stroke-dasharray': '3 4'
      }));
    }

    // x 轴：轴线两张图都画（便于上下对齐），年份标签只给最下面那张
    svg.appendChild(node('line', {
      x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih,
      stroke: showX ? 'rgba(148,197,214,0.24)' : 'rgba(148,197,214,0.10)', 'stroke-width': 1
    }));
    if (showX) {
      var step = spanX > 40 ? 10 : spanX > 14 ? 5 : 2;
      // 窄屏防止年份标签互相挤压
      if (iw < 340 && step < 10) step = 10;
      if (iw < 210) step = 20;
      var start = Math.ceil(yr0 / step) * step;
      for (var yv = start; yv <= yr1; yv += step) {
        svg.appendChild(node('text', {
          x: sx(yv), y: m.t + ih + 23, 'text-anchor': 'middle', 'font-size': 13, fill: '#94A3B8'
        }, String(yv)));
      }
    }

    // 折线（按缺口分段）：先铺一层半透明粗线做辉光，再画主线
    // 两组 path 走同一套 dasharray，动画时前进量完全一致，不会错位
    var segs = splitSegments(series);
    var segNodes = segs.map(function (seg) {
      var d = '';
      seg.forEach(function (p, i) {
        d += (i ? 'L' : 'M') + sx(p[0]).toFixed(2) + ' ' + sy(p[1]).toFixed(2);
      });
      var glow = node('path', {
        d: d, fill: 'none', stroke: cfg.color, 'stroke-width': 7,
        'stroke-opacity': 0.14, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      });
      var line = node('path', {
        d: d, fill: 'none', stroke: cfg.color, 'stroke-width': 1.8,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      });
      svg.appendChild(glow);
      svg.appendChild(line);
      return { glow: glow, line: line, len: 0, base: 0 };
    });

    // 首尾点：起点跟着笔尖亮，终点等画完再亮
    var first = series[0];
    var last = series[series.length - 1];
    var startDot = node('circle', {
      cx: sx(first[0]), cy: sy(first[1]), r: 2.6,
      fill: '#020617', stroke: cfg.color, 'stroke-width': 1.6, opacity: 0
    });
    svg.appendChild(startDot);

    // 尾值标注（画到终点才浮现，避免提前剧透结果）
    var tailText = cfg.valueFormat ? cfg.valueFormat(last[1]) : String(last[1]);
    var tailX = sx(last[0]);
    var tailY = sy(last[1]);
    var anchor = tailX > m.l + iw - 44 ? 'end' : 'start';
    var tail = node('g', { class: 'ch-tail' });
    tail.appendChild(node('circle', {
      class: 'ch-halo', cx: tailX, cy: tailY, r: 9,
      fill: 'none', stroke: cfg.color, 'stroke-width': 1.2, 'stroke-opacity': 0.55
    }));
    tail.appendChild(node('circle', {
      class: 'ch-end', cx: tailX, cy: tailY, r: 3.4,
      fill: cfg.color, stroke: '#020617', 'stroke-width': 1.2
    }));
    tail.appendChild(node('text', {
      x: tailX + (anchor === 'end' ? -8 : 8),
      y: tailY - 12,
      'text-anchor': anchor,
      'font-size': 14,
      'font-weight': 500,
      fill: cfg.color,
      'font-variant-numeric': 'tabular-nums'
    }, tailText));
    svg.appendChild(tail);

    // 指针读数
    var cursor = node('g', { opacity: 0, 'pointer-events': 'none' });
    var vLine = node('line', { y1: m.t, y2: m.t + ih, stroke: 'rgba(148,197,214,0.45)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
    var dot = node('circle', { r: 4, fill: cfg.color, stroke: '#020617', 'stroke-width': 1.6 });
    cursor.appendChild(vLine);
    cursor.appendChild(dot);
    svg.appendChild(cursor);

    var hit = node('rect', {
      x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair'
    });
    svg.appendChild(hit);

    function nearest(year) {
      var best = null;
      var bestD = Infinity;
      for (var i = 0; i < series.length; i++) {
        var d = Math.abs(series[i][0] - year);
        if (d < bestD) { bestD = d; best = series[i]; }
      }
      return bestD <= 1 ? best : null;
    }

    container.appendChild(svg);

    /* ---------- 逐点绘制：stroke-dasharray / dashoffset ---------- */
    /* 分段按累计长度排队，进度 0→1 时笔尖从左往右扫过所有缺口，
       有断线的国家也不会几段同时冒出来。dash 只写 style，不碰属性，省重排。 */
    var totalLen = 0;
    segNodes.forEach(function (s) {
      s.len = s.line.getTotalLength() || 0;
      s.base = totalLen;
      totalLen += s.len;
      [s.glow, s.line].forEach(function (p) {
        p.style.strokeDasharray = s.len ? s.len.toFixed(2) : 'none';
        p.style.strokeDashoffset = s.len ? s.len.toFixed(2) : '0';
      });
    });

    var curProgress = -1;
    function setProgress(p) {
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (p === curProgress) return;
      curProgress = p;
      var budget = totalLen * p;
      segNodes.forEach(function (s) {
        if (!s.len) return;
        var local = (budget - s.base) / s.len;
        local = local < 0 ? 0 : local > 1 ? 1 : local;
        var off = (s.len * (1 - local)).toFixed(2);
        s.glow.style.strokeDashoffset = off;
        s.line.style.strokeDashoffset = off;
      });
      startDot.setAttribute('opacity', p > 0.008 ? 1 : 0);
      if (p >= 0.999) tail.classList.add('is-on');
      else tail.classList.remove('is-on');
    }
    setProgress(0);

    var readout = document.createElement('div');
    readout.className = 'chart-readout';
    readout.setAttribute('aria-live', 'polite');
    container.appendChild(readout);

    function showAt(clientX) {
      var rect = svg.getBoundingClientRect();
      var scale = W / rect.width;
      var px = (clientX - rect.left) * scale;
      var year = Math.round(yr0 + ((px - m.l) / iw) * spanX);
      var hitPoint = nearest(year);
      if (!hitPoint) {
        hide();
        return;
      }
      var x = sx(hitPoint[0]);
      vLine.setAttribute('x1', x);
      vLine.setAttribute('x2', x);
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', sy(hitPoint[1]));
      cursor.setAttribute('opacity', 1);
      readout.innerHTML = '<span class="chart-readout-year">' + hitPoint[0] + ' 年</span>'
        + '<span class="chart-readout-val">' + (cfg.valueFormat ? cfg.valueFormat(hitPoint[1]) : hitPoint[1]) + '</span>'
        + '<span class="chart-readout-unit">' + (cfg.unit || '') + '</span>';
      readout.classList.add('is-on');
    }
    function hide() {
      cursor.setAttribute('opacity', 0);
      readout.classList.remove('is-on');
    }

    hit.addEventListener('pointermove', function (e) { showAt(e.clientX); });
    hit.addEventListener('pointerdown', function (e) { showAt(e.clientX); });
    hit.addEventListener('pointerleave', hide);

    return {
      setProgress: setProgress,
      finish: function () { setProgress(1); },
      reset: function () { setProgress(0); },
      length: totalLen
    };
  }

  GPM.chart = { render: render, tickValues: tickValues };
})();
