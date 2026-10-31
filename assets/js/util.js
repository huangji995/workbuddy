/* 通用工具：色阶、格式化、数据查询 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  // 深色底上的顺序色阶：冷青（低，安全）→ 琥珀 → 红 → 高热玫红（高，危险）。
  // 数值越高越「烫」，在深空底上自然形成发光感；无数据用中性蓝灰，不与色阶混淆。
  var PALETTE = {
    stops: [
      { at: 0.00, hex: '#0C3340' },
      { at: 0.36, hex: '#0F6B80' },
      { at: 0.62, hex: '#B45309' },
      { at: 0.84, hex: '#DC2626' },
      { at: 1.00, hex: '#F87171' }
    ],
    noData: '#243244'
  };

  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  function hexToRgb(hex) {
    var h = hex.slice(-6);
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }

  function toHex2(n) {
    return ('0' + Math.round(n).toString(16)).slice(-2);
  }

  /** 逐通道混合：ratio=0 取 minHex，ratio=1 取 maxHex */
  function mix(maxHex, minHex, ratio) {
    var r = parseFloat(clamp01(ratio)).toFixed(1);
    var a = hexToRgb(maxHex);
    var b = hexToRgb(minHex);
    return '#' + toHex2(Math.ceil(a[0] * r + b[0] * (1 - r)))
      + toHex2(Math.ceil(a[1] * r + b[1] * (1 - r)))
      + toHex2(Math.ceil(a[2] * r + b[2] * (1 - r)));
  }

  /** 色阶取值：t=0 冷青，t=1 高热，中间按 stops 分段线性 */
  function rampAt(t) {
    var s = PALETTE.stops;
    t = clamp01(t);
    for (var i = 1; i < s.length; i++) {
      if (t <= s[i].at) {
        var a = hexToRgb(s[i - 1].hex);
        var b = hexToRgb(s[i].hex);
        var k = (t - s[i - 1].at) / (s[i].at - s[i - 1].at || 1);
        return [
          Math.round(a[0] + (b[0] - a[0]) * k),
          Math.round(a[1] + (b[1] - a[1]) * k),
          Math.round(a[2] + (b[2] - a[2]) * k)
        ];
      }
    }
    return hexToRgb(s[s.length - 1].hex);
  }

  function rampHex(t) {
    var c = rampAt(t);
    return '#' + toHex2(c[0]) + toHex2(c[1]) + toHex2(c[2]);
  }

  /**
   * 连续色阶：把 thresholds 当作锚点，锚点之间线性插值。
   * 离散分档在时间动画里会「跳色」，连续色阶才能让颜色随年份平滑流动。
   */
  /* invert=true：高值才是「好」的指标（寿命、电力、疫苗），把色阶反过来，
     让红色永远表示「糟糕的那一端」，两种方向的地图读法一致 */
  function rampColor(value, thresholds, invert) {
    if (value === null || value === undefined || isNaN(value)) return PALETTE.noData;
    var n = thresholds.length;
    var t = 1;
    if (value <= thresholds[0]) {
      t = 0;
    } else if (value < thresholds[n - 1]) {
      for (var i = 1; i < n; i++) {
        if (value <= thresholds[i]) {
          var v0 = thresholds[i - 1];
          var v1 = thresholds[i];
          t = ((i - 1) + (value - v0) / (v1 - v0 || 1)) / (n - 1);
          break;
        }
      }
    }
    var c = rampAt(invert ? 1 - t : t);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  /** 图例渐变条用的色标（与 rampColor 走同一条曲线） */
  function rampStops(thresholds, invert) {
    var n = thresholds.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      var at = i / (n - 1);
      out.push({ at: at, color: rampHex(invert ? 1 - at : at) });
    }
    return out;
  }

  /** 序列在任意（可为小数的）年份上的取值，相邻年份线性插值；越界则取端点 */
  function valueAt(series, year) {
    if (!series || !series.length) return null;
    if (year <= series[0][0]) return series[0][1];
    var last = series[series.length - 1];
    if (year >= last[0]) return last[1];
    for (var i = 1; i < series.length; i++) {
      if (year <= series[i][0]) {
        var y0 = series[i - 1][0];
        var v0 = series[i - 1][1];
        var y1 = series[i][0];
        var v1 = series[i][1];
        return v0 + (v1 - v0) * ((year - y0) / (y1 - y0 || 1));
      }
    }
    return last[1];
  }

  function fmt(value, decimals) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Number(value).toFixed(decimals === undefined ? 1 : decimals);
  }

  function signed(value, decimals) {
    if (value === null || value === undefined) return '—';
    var s = Math.abs(value).toFixed(decimals === undefined ? 1 : decimals);
    return (value > 0 ? '+' : value < 0 ? '−' : '±') + s;
  }

  function pctText(value) {
    if (value === null || value === undefined) return '';
    var d = Math.abs(value) < 10 ? 1 : 0;
    return (value > 0 ? '+' : '') + value.toFixed(d) + '%';
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  GPM.PALETTE = PALETTE;
  GPM.util = {
    clamp01: clamp01,
    mix: mix,
    rampAt: rampAt,
    rampHex: rampHex,
    rampColor: rampColor,
    rampStops: rampStops,
    valueAt: valueAt,
    fmt: fmt,
    signed: signed,
    pctText: pctText,
    el: el
  };
})();
