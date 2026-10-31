/* 全局指标表 + 选中状态。
   地图页和详情页共用这一份：在地球上选了「预期寿命」，点进任何国家，
   第一屏默认就是预期寿命，不需要各页各写一套映射。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  var START = 1990;

  /* betterWhen：'down' 表示越低越好（儿童死亡率），'up' 表示越高越好。
     地图色阶用它决定要不要反转，详情页用它决定「变好」是绿还是红。 */
  var LIST = [
    {
      key: 'u5mr', label: '5岁以下儿童死亡率', short: '儿童死亡率',
      unit: '‰', unitShort: '‰', unitLong: '每 1000 活产儿',
      decimals: 1, betterWhen: 'down', color: '#22D3EE', code: 'SH.DYN.MORT',
      thresholds: [0, 5, 10, 20, 40, 80, 150], source: 'data.js'
    },
    {
      key: 'lifeExp', label: '预期寿命', short: '预期寿命',
      unit: '岁', unitShort: '岁', unitLong: '出生时预期寿命',
      decimals: 1, betterWhen: 'up', color: '#A78BFA', code: 'SP.DYN.LE00.IN',
      thresholds: [40, 55, 62, 68, 74, 80, 90], source: 'data.js'
    },
    {
      key: 'dtp3', label: '一岁儿童疫苗接种率', short: '疫苗率',
      unit: '%', unitShort: '%', unitLong: 'DTP3 疫苗，1 岁前',
      decimals: 1, betterWhen: 'up', color: '#34D399', code: 'SH.IMM.IDPT',
      thresholds: [0, 40, 60, 75, 85, 92, 97], source: 'indicators.js'
    },
    {
      key: 'electricity', label: '电力可及率', short: '电力',
      unit: '%', unitShort: '%', unitLong: '能用上电的人口比例',
      decimals: 1, betterWhen: 'up', color: '#FBBF24', code: 'EG.ELC.ACCS.ZS',
      thresholds: [0, 30, 55, 75, 88, 96, 100], source: 'indicators.js'
    },
    {
      key: 'schooling', label: '女性平均受教育年限', short: '女性教育',
      unit: '年', unitShort: '年', unitLong: '25 岁以上女性，Barro-Lee',
      decimals: 1, betterWhen: 'up', color: '#60A5FA', code: 'BAR.SCHL.15UP.FE',
      thresholds: [0, 2, 4, 6, 8, 10, 13], maxGap: 6, source: 'indicators.js'
    }
  ];

  var BY_KEY = {};
  LIST.forEach(function (m) { BY_KEY[m.key] = m; });

  function indicator(key) { return BY_KEY[key] || null; }

  /** 该国该指标的原始序列；没有就返回 null（绝不补值） */
  function seriesOf(iso2, key) {
    var D = window.__GPM_DATA__;
    var c = D && D.countries && D.countries[iso2];
    if (!c) return null;
    if (key === 'u5mr' || key === 'lifeExp') return (c[key] && c[key].series) || null;
    var X = window.__GPM_IND__;
    var s = X && X.series && X.series[key];
    return (s && s[iso2]) || null;
  }

  /** 起终点摘要：统一从 1990 起算，与地图 / 气泡图同一个时间窗 */
  function metricOf(iso2, key, startYear) {
    var raw = seriesOf(iso2, key);
    if (!raw || raw.length < 2) return null;
    var y0 = startYear || START;
    var series = raw.filter(function (p) { return p[0] >= y0; });
    if (series.length < 2) return null;
    var base = { year: series[0][0], value: series[0][1] };
    var last = { year: series[series.length - 1][0], value: series[series.length - 1][1] };
    var delta = Math.round((last.value - base.value) * 10) / 10;
    var deltaPct = base.value ? Math.round((delta / Math.abs(base.value)) * 1000) / 10 : null;
    return {
      key: key, series: series, base: base, last: last,
      delta: delta, deltaPct: deltaPct
    };
  }

  /** 是否「变好」：方向由 betterWhen 决定，delta=0 算中性 */
  function isBetter(ind, delta) {
    if (!ind || ind.betterWhen === null || delta === 0) return null;
    return ind.betterWhen === 'down' ? delta < 0 : delta > 0;
  }

  /* ---------------- 选中状态：跨页共享，刷新后保留 ---------------- */
  var STORE = 'gpm.indicator';
  var DEFAULT = 'u5mr';

  function readStored() {
    try {
      var v = localStorage.getItem(STORE);
      return BY_KEY[v] ? v : DEFAULT;
    } catch (e) { return DEFAULT; }
  }

  var current = readStored();
  var subs = [];

  function get() { return current; }

  function set(key) {
    if (!BY_KEY[key] || key === current) return;
    current = key;
    try { localStorage.setItem(STORE, key); } catch (e) { /* 隐私模式忽略 */ }
    subs.slice().forEach(function (fn) {
      try { fn(key); } catch (e) { /* 单个订阅出错不影响其他 */ }
    });
  }

  function subscribe(fn) {
    subs.push(fn);
    return function () {
      var i = subs.indexOf(fn);
      if (i > -1) subs.splice(i, 1);
    };
  }

  GPM.INDICATORS = LIST;
  GPM.indicator = indicator;
  GPM.seriesOf = seriesOf;
  GPM.metricOf = metricOf;
  GPM.isBetter = isBetter;
  GPM.state = { get: get, set: set, subscribe: subscribe };
})();
