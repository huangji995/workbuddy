/* 国家详情：顶部指标胶囊栏 + 左侧大字报 + 右侧折线 + 气泡图。
   没有整页吸附、没有锁滚动条：三块都是普通文档流里的区块，
   IntersectionObserver 只负责回答「这块现在该不该播动画」。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  var DECOR = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 动画节奏：先停 0.5 秒让人看清起点，再用 3 秒落到最新一年 */
  var PAUSE = 500;
  var DUR = 3000;

  /* 指标表：u5mr / lifeExp 来自 data.js，其余来自 data/indicators.js（世界银行快照） */
  var INDICATORS = [
    { key: 'u5mr', label: '5岁以下儿童死亡率', unit: '‰', unitLong: '每 1000 活产儿', decimals: 1, betterWhen: 'down', color: '#22D3EE', code: 'SH.DYN.MORT' },
    { key: 'lifeExp', label: '预期寿命', unit: '岁', unitLong: '出生时预期寿命', decimals: 1, betterWhen: 'up', color: '#A78BFA', code: 'SP.DYN.LE00.IN' },
    { key: 'dtp3', label: '一岁儿童疫苗接种率', unit: '%', unitLong: 'DTP3 疫苗，1 岁前', decimals: 1, betterWhen: 'up', color: '#34D399', pct: true, code: 'SH.IMM.IDPT' },
    { key: 'electricity', label: '电力可及率', unit: '%', unitLong: '能用上电的人口比例', decimals: 1, betterWhen: 'up', color: '#FBBF24', pct: true, code: 'EG.ELC.ACCS.ZS' },
    { key: 'childShare', label: '0—14 岁人口占比', unit: '%', unitLong: '儿童占总人口', decimals: 1, betterWhen: null, color: '#F472B6', pct: true, code: 'SP.POP.0014.TO.ZS' },
    { key: 'schooling', label: '女性平均受教育年限', unit: '年', unitLong: '25 岁以上女性，Barro-Lee', decimals: 1, betterWhen: 'up', color: '#60A5FA', maxGap: 6, code: 'BAR.SCHL.15UP.FE' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* 大数字：上百取整（116‰ 比 116.0‰ 好读），小值保留一位 */
  function numText(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (v >= 100) return String(Math.round(v));
    return Number(v).toFixed(dec);
  }

  /* 指标序列：从 1990 起算（与地图、气泡图同一个时间窗），首尾就是「起点 / 最新」 */
  function metricOf(D, iso2, key) {
    var raw = null;
    if (key === 'u5mr' || key === 'lifeExp') {
      var c = D.countries[iso2];
      raw = c && c[key] ? c[key].series : null;
    } else {
      var ext = window.__GPM_IND__;
      raw = ext && ext.series && ext.series[key] ? ext.series[key][iso2] : null;
    }
    if (!raw || raw.length < 2) return null;
    var series = raw.filter(function (p) { return p[0] >= 1990; });
    if (series.length < 2) return null;
    var base = { year: series[0][0], value: series[0][1] };
    var last = { year: series[series.length - 1][0], value: series[series.length - 1][1] };
    var delta = Math.round((last.value - base.value) * 10) / 10;
    var deltaPct = base.value ? Math.round((delta / Math.abs(base.value)) * 1000) / 10 : null;
    return { series: series, base: base, last: last, delta: delta, deltaPct: deltaPct };
  }

  function domainFor(series, ind) {
    var vals = series.map(function (p) { return p[1]; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    if (ind.pct) {
      var lo = Math.max(0, Math.floor((min - 3) / 5) * 5);
      var hi = Math.min(100, Math.ceil((max + 2) / 5) * 5);
      return [lo, hi > lo ? hi : lo + 5];
    }
    if (ind.key === 'u5mr') return [0, Math.max(10, Math.ceil((max * 1.08) / 10) * 10)];
    return [Math.max(0, Math.floor((min - 2) / 5) * 5), Math.ceil((max + 2) / 5) * 5];
  }

  function tableHTML(metric, ind) {
    var rows = metric.series.filter(function (p, i) {
      return p[0] % 5 === 0 || i === metric.series.length - 1;
    }).map(function (p) {
      return '<tr><td>' + p[0] + '</td><td>' + U.fmt(p[1], ind.decimals) + '</td></tr>';
    }).join('');
    return '<details class="data-table"><summary>以数据表查看（每 5 年）</summary>'
      + '<table><thead><tr><th>年份</th><th>' + esc(ind.label) + '（' + esc(ind.unit) + '）</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></details>';
  }

  GPM.renderCountryView = function (mount, iso2) {
    var D = window.__GPM_DATA__;
    var c = D.countries[iso2];

    if (!c) {
      mount.innerHTML = '<section class="view view-country"><a class="back" href="#/">← 返回地图</a>'
        + '<div class="notice">没有找到代码为 <code>' + esc(iso2) + '</code> 的国家或地区。</div></section>';
      return function () { mount.innerHTML = ''; };
    }

    /* 这个国家有哪些指标真的有数据 */
    var available = {};
    var metrics = {};
    INDICATORS.forEach(function (ind) {
      var mm = metricOf(D, iso2, ind.key);
      if (mm) { available[ind.key] = true; metrics[ind.key] = mm; }
    });
    var keys = INDICATORS.filter(function (ind) { return available[ind.key]; })
      .map(function (ind) { return ind.key; });

    var hasBubble = !!(window.__GPM_BUBBLE__ && window.__GPM_BUBBLE__.gdp[iso2]);

    if (!keys.length) {
      mount.innerHTML = '<section class="view view-country story-plain">'
        + '<a class="back" href="#/">← 返回地图</a>'
        + '<header class="country-head"><h1>' + esc(c.nameZh) + '</h1>'
        + '<p class="country-meta">' + esc([c.nameEn, c.region].filter(Boolean).join(' · ')) + '</p></header>'
        + '<div class="notice"><strong>这个地区没有可展示的数据。</strong>'
        + '<p>世界银行 WDI 未收录' + esc(c.nameZh) + '的这些指标，所以这里不做任何估算或填充，地图上也保持中性灰。</p>'
        + '<p class="notice-more">本页共收录 ' + D.meta.countriesTotal + ' 个国家与地区，其中 '
        + D.meta.countriesWithData + ' 个有儿童死亡率数据。'
        + '<a class="notice-link" href="#/">回到地图选一个 →</a></p></div>'
        + '</section>';
      return function () { mount.innerHTML = ''; };
    }

    /* 默认「5岁以下儿童死亡率」，没有就退到第一个有数据的 */
    var sel = available.u5mr ? 'u5mr' : keys[0];
    var nameZh = esc(c.nameZh);

    var tabsHTML = INDICATORS.map(function (ind) {
      var on = ind.key === sel;
      var off = !available[ind.key];
      return '<button class="tab' + (on ? ' is-on' : '') + (off ? ' is-off' : '') + '"'
        + ' type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + (off ? ' disabled' : '') + ' data-key="' + ind.key + '">'
        + esc(ind.label) + '</button>';
    }).join('');

    mount.innerHTML = ''
      + '<section class="story" id="story">'
      + '  <div class="story-top">'
      + '    <nav class="story-nav">'
      + '      <a class="story-back" href="#/">← 返回地图</a>'
      + '      <span class="story-id"><b>' + nameZh + '</b><em>' + esc(c.region || '') + '</em></span>'
      + '    </nav>'
      + '    <div class="tabs-wrap"><div class="tabs" role="tablist" aria-label="切换指标" id="tabs">'
      + tabsHTML
      + '    </div></div>'
      + '  </div>'

      /* ---------- 第 1 块：数字 + 折线 ---------- */
      + '  <section class="hero-block" id="hero">'
      + '    <div class="hero-left">'
      + '      <p class="hero-tag"><b id="heroCountry">[ ' + nameZh + ' ]</b><span id="heroInd"></span></p>'
      + '      <div class="st-cmp">'
      + '        <p class="st-from"><span class="st-from-k" id="stFromYear">1990 年</span>'
      + '          <span class="st-from-v"><b id="stFromVal">—</b><em id="stFromUnit"></em></span></p>'
      + '        <span class="st-drop" aria-hidden="true">'
      + '          <svg class="st-drop-svg" width="18" height="60" viewBox="0 0 18 60" fill="none">'
      + '            <defs>'
      + '              <linearGradient id="stDropGrad" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">'
      + '                <stop offset="0" stop-color="#22D3EE" stop-opacity="0"/>'
      + '                <stop offset="0.4" stop-color="#22D3EE" stop-opacity="0.45"/>'
      + '                <stop offset="1" stop-color="#22D3EE" stop-opacity="1"/>'
      + '              </linearGradient>'
      + '            </defs>'
      + '            <path d="M9 0V52" stroke="#22D3EE" stroke-width="4" stroke-opacity="0.12" stroke-linecap="round"/>'
      + '            <path d="M9 0V52" stroke="url(#stDropGrad)" stroke-width="1.2" stroke-linecap="round"/>'
      + '            <path d="M4.6 46.8 9 52.6l4.4-5.8" stroke="url(#stDropGrad)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '          </svg>'
      + '        </span>'
      + '        <div class="st-to">'
      + '          <p class="st-tick"><b id="stYear">—</b><em>年</em>'
      + '            <span class="st-tick-now" id="stNow">今天</span></p>'
      + '          <div class="st-big"><b id="stBig">—</b><i class="st-unit" id="stUnit"></i></div>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="hero-right">'
      + '      <div class="chart-head">'
      + '        <h2 class="chart-title" id="chartTitle"></h2>'
      + '        <span class="chart-sub" id="chartSub"></span>'
      + '        <span class="chart-delta" id="chartDelta"></span>'
      + '      </div>'
      + '      <div class="chart" id="heroChart"></div>'
      + '    </div>'
      + '  </section>'

      /* ---------- 第 2 块：气泡图 ---------- */
      + (hasBubble
        ? '  <section class="story-bubble" id="bubbleSec">'
        + '    <p class="st-hud-title"><i aria-hidden="true">[</i><span>全球各国：收入与寿命的变迁</span>'
        + '      <i aria-hidden="true">]</i></p>'
        + '    <div class="bub-root" id="bubRoot"></div>'
        + '  </section>'
        : '')

      /* ---------- 第 3 块：尾注 + 数据表 ---------- */
      + '  <section class="story-tail">'
      + '    <div class="story-tail-in">'
      + '      <p class="story-tail-k">' + esc(c.region || '') + ' · ' + nameZh + '</p>'
      + '      <h2 class="story-tail-h" id="tailHead"></h2>'
      + '      <p class="story-tail-p" id="tailNote"></p>'
      + '      <div id="tailTable"></div>'
      + '      <a class="story-tail-link" href="#/">← 回到地球</a>'
      + '    </div>'
      + '  </section>'
      + '</section>';

    var hero = mount.querySelector('#hero');
    var heroLeft = mount.querySelector('.hero-left');
    var heroRight = mount.querySelector('.hero-right');
    var chartEl = mount.querySelector('#heroChart');
    var tabBox = mount.querySelector('#tabs');
    var bigEl = mount.querySelector('#stBig');
    var yearEl = mount.querySelector('#stYear');
    var fromYearEl = mount.querySelector('#stFromYear');
    var fromValEl = mount.querySelector('#stFromVal');
    var fromUnitEl = mount.querySelector('#stFromUnit');
    var unitEl = mount.querySelector('#stUnit');
    var indEl = mount.querySelector('#heroInd');
    var nowEl = mount.querySelector('#stNow');
    var titleEl = mount.querySelector('#chartTitle');
    var subEl = mount.querySelector('#chartSub');
    var deltaEl = mount.querySelector('#chartDelta');
    var tailNoteEl = mount.querySelector('#tailNote');
    var tailTableEl = mount.querySelector('#tailTable');
    var story = mount.querySelector('#story');

    /* ---------- 动画状态 ---------- */
    var m = metrics[sel];
    var ind = INDICATORS.filter(function (x) { return x.key === sel; })[0];
    var chartView = null;
    var raf = null;
    var progress = 0;
    var inView = false;

    function setNum(v) { bigEl.textContent = numText(v, ind.decimals); }
    function setYear(y) { yearEl.textContent = String(y); }

    function paintBase() {
      fromYearEl.textContent = m.base.year + ' 年';
      fromValEl.textContent = U.fmt(m.base.value, ind.decimals);
      fromUnitEl.textContent = ind.unit;
      setNum(m.base.value);
      setYear(m.base.year);
      progress = 0;
      if (chartView) chartView.setProgress(0);
    }

    function settle() {
      story.classList.remove('is-rolling');
      story.classList.add('is-settled');
      setNum(m.last.value);
      setYear(m.last.year);
      progress = 1;
      if (chartView) chartView.setProgress(1);
      /* 最新年份不在今年附近时说「最新」，别硬说「今天」 */
      nowEl.textContent = m.last.year >= 2023 ? '今天' : '最新';
      nowEl.hidden = false;
    }

    function reset() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      story.classList.remove('is-settled', 'is-rolling');
      nowEl.hidden = true;
      paintBase();
    }

    function play() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (DECOR) { settle(); return; }
      story.classList.remove('is-settled');
      story.classList.add('is-rolling');
      nowEl.hidden = true;
      paintBase();
      var from = m.base.value;
      var to = m.last.value;
      var y0 = m.base.year;
      var y1 = m.last.year;
      var t0 = 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var el = ts - t0;
        if (el < PAUSE) { raf = requestAnimationFrame(step); return; }
        var t = Math.min(1, (el - PAUSE) / DUR);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        progress = e;
        setNum(from + (to - from) * e);
        setYear(Math.round(y0 + (y1 - y0) * e));
        if (chartView) chartView.setProgress(e);
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = null; settle(); }
      }
      raf = requestAnimationFrame(step);
    }

    /* ---------- 折线 ---------- */
    function chartHeight() {
      var head = mount.querySelector('.chart-head');
      var h = heroRight.clientHeight - (head ? head.offsetHeight : 44) - 30;
      return Math.max(150, Math.min(420, Math.round(h)));
    }

    function drawChart() {
      chartView = null;
      chartEl.innerHTML = '';
      chartView = GPM.chart.render(chartEl, {
        series: m.series,
        color: ind.color,
        unit: ind.unit,
        yearDomain: [m.series[0][0], m.series[m.series.length - 1][0]],
        yDomain: domainFor(m.series, ind),
        showXAxis: true,
        baseYear: 1990,
        plotHeight: chartHeight(),
        maxGap: ind.maxGap || 1,
        valueFormat: function (v) { return U.fmt(v, ind.decimals); },
        /* 刻度值可能是半步（7.5 / 12.5），四舍五入会让标签和网格线对不上 */
        yFormat: function (v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); },
        ariaLabel: c.nameZh + ind.label + '趋势，' + m.series[0][0] + ' 至 ' + m.series[m.series.length - 1][0] + ' 年'
      });
      if (chartView) chartView.setProgress(progress);
    }

    /* ---------- 文案与配色 ---------- */
    function applyMeta() {
      indEl.textContent = ind.label;
      unitEl.textContent = ind.unit;
      titleEl.textContent = ind.label;
      subEl.textContent = ind.unitLong;
      var pct = m.deltaPct;
      deltaEl.textContent = pct === null ? '' : (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';

      var improved = null;
      if (ind.betterWhen === 'down') improved = m.delta < 0;
      else if (ind.betterWhen === 'up') improved = m.delta > 0;
      story.dataset.trend = improved === null ? 'flat' : improved ? 'up' : 'down';
      story.dataset.dir = m.delta < 0 ? 'down' : 'up';
      deltaEl.classList.toggle('is-good', improved === true);
      deltaEl.classList.toggle('is-bad', improved === false);

      var headEl = mount.querySelector('#tailHead');
      if (headEl) headEl.textContent = (m.last.year - m.base.year) + ' 年，一条线。';
      tailNoteEl.innerHTML = '本节指标：<b>' + esc(ind.label) + '</b>（' + esc(ind.unitLong)
        + '），世界银行 WDI ' + esc(ind.code)
        + '。所有数值为构建时的快照，运行时不发起任何网络请求；气泡图另用人均 GDP（PPP）与总人口。';
      tailTableEl.innerHTML = tableHTML(m, ind);
    }

    /* ---------- 切指标 ---------- */
    function updateTabs() {
      Array.prototype.forEach.call(tabBox.querySelectorAll('.tab'), function (btn) {
        var on = btn.getAttribute('data-key') === sel;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function selectTab(key) {
      if (key === sel || !available[key]) return;
      sel = key;
      m = metrics[key];
      ind = INDICATORS.filter(function (x) { return x.key === key; })[0];
      updateTabs();
      heroLeft.classList.add('is-swap');
      setTimeout(function () {
        /* 换指标时把上一轮的「已落定」清掉，否则数字回到起点但「今天」标签还挂着 */
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        story.classList.remove('is-settled', 'is-rolling');
        nowEl.hidden = true;
        applyMeta();
        drawChart();
        paintBase();
        heroLeft.classList.remove('is-swap');
        if (inView) play();
      }, 150);
    }

    tabBox.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.tab') : null;
      if (!btn || btn.disabled) return;
      selectTab(btn.getAttribute('data-key'));
    });

    applyMeta();
    drawChart();
    paintBase();

    // 首帧之后再触发入场，避免和 innerHTML 同帧
    requestAnimationFrame(function () { story.classList.add('is-in'); });

    /* ---------- 第 1 块：进视口播一次，离开复位，回来再播 ---------- */
    var heroIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var now = e.isIntersecting && e.intersectionRatio >= 0.4;
        if (now === inView) return;
        inView = now;
        if (inView) play();
        else reset();
      });
    }, { threshold: [0, 0.4, 0.8] });
    heroIO.observe(hero);

    /* ---------- 第 2 块：气泡图（懒创建，第一次进视口自动播） ---------- */
    var bubble = null;
    var bubblePlayed = false;

    function ensureBubble() {
      if (bubble) return;
      var root = mount.querySelector('#bubRoot');
      if (!root || !root.clientHeight) return;
      bubble = GPM.bubble.create(root, { iso2: iso2, nameZh: c.nameZh });
    }

    var bubbleIO = null;
    var bubbleSec = mount.querySelector('#bubbleSec');
    if (bubbleSec) {
      bubbleIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.25) {
            ensureBubble();
            if (bubble && !bubblePlayed) { bubblePlayed = true; bubble.play(); }
          } else if (bubble) {
            bubble.stop();
          }
        });
      }, { threshold: [0, 0.25] });
      bubbleIO.observe(bubbleSec);
    }

    /* ---------- 尺寸变化 ---------- */
    var rt = null;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        drawChart();
        if (bubble) {
          bubble.destroy();
          bubble = null;
          ensureBubble();
        }
      }, 220);
    }
    window.addEventListener('resize', onResize);

    return function cleanup() {
      clearTimeout(rt);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      heroIO.disconnect();
      if (bubbleIO) bubbleIO.disconnect();
      if (bubble) bubble.destroy();
      mount.innerHTML = '';
    };
  };
})();
