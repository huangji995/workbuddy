/* 通用工具：色阶、格式化、数据查询 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  // 地理单色相色阶：浅 → 深 = 数值低 → 高。无数据用中性灰，不与色阶混淆。
  var PALETTE = {
    colorMin: '#F8DDC6',
    colorMax: '#6E2A0B',
    noData: '#D9D7D1'
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

  /** 逐通道混合：ratio=0 取 minHex（浅），ratio=1 取 maxHex（深） */
  function mix(maxHex, minHex, ratio) {
    var r = parseFloat(clamp01(ratio)).toFixed(1);
    var a = hexToRgb(maxHex);
    var b = hexToRgb(minHex);
    var out = '#' + toHex2(Math.ceil(a[0] * r + b[0] * (1 - r)))
      + toHex2(Math.ceil(a[1] * r + b[1] * (1 - r)))
      + toHex2(Math.ceil(a[2] * r + b[2] * (1 - r)));
    return out;
  }





  /**
   * 连续色阶：把 thresholds 当作锚点，锚点之间线性插值。
   * 离散分档在时间动画里会「跳色」，连续色阶才能让颜色随年份平滑流动。
   */
  function rampColor(value, thresholds) {
    if (value === null || value === undefined || isNaN(value)) return PALETTE.noData;
    var n = thresholds.length;
    if (value <= thresholds[0]) return mix(PALETTE.colorMax, PALETTE.colorMin, 0);
    if (value >= thresholds[n - 1]) return mix(PALETTE.colorMax, PALETTE.colorMin, 1);
    for (var i = 1; i < n; i++) {
      if (value <= thresholds[i]) {
        var v0 = thresholds[i - 1];
        var v1 = thresholds[i];
        var t = (value - v0) / (v1 - v0 || 1);
        var a = hexToRgb(mix(PALETTE.colorMax, PALETTE.colorMin, (i - 1) / (n - 1)));
        var b = hexToRgb(mix(PALETTE.colorMax, PALETTE.colorMin, i / (n - 1)));
        return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t)
          + ',' + Math.round(a[1] + (b[1] - a[1]) * t)
          + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
      }
    }
    return PALETTE.noData;
  }

  /** 图例渐变条用的色标（与 rampColor 同一套锚点） */
  function rampStops(thresholds) {
    var n = thresholds.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        at: i / (n - 1),
        color: mix(PALETTE.colorMax, PALETTE.colorMin, i / (n - 1))
      });
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
    rampColor: rampColor,
    rampStops: rampStops,
    valueAt: valueAt,
    fmt: fmt,
    signed: signed,
    pctText: pctText,
    el: el
  };
})();
