/* 国家详情：Sticky 双屏舞台 + 复合动画（数据跳动与几何变形共用一条时间轴）。
   初始：第一屏居中「[ 国家 ] 指标 / 1990 年 / 起点值」，右侧没有折线。
   触发：用户向下滚动哪怕一点 → 立刻播一段固定 2.5 秒的动画，
         动作 A（paintAt）数字与年份从 1990 跳到 2024；
         动作 B（paintGeo）--p 从 0 走到 1：数字缩小左移、折线从右侧滑出并同步绘制。
         两者由同一个 rAF 的同一个 t 推进，严格同起同落。
   结束：定格在「2024 今天」，数字在左、折线在右，画面继续 sticky 固定。
   重置：滚回舞台顶部（等价 toggleActions: play none none reset）→ 平滑退回第一屏。
   注意：--p 只由这段动画写，绝不映射滚动位置。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  var DECOR = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 固定动画时长：与滚动位置无关 */
  var ANIM_DUR = 2500;
  /* 重置（平滑退回第一屏）用时，短一些，别让人觉得画面在拖 */
  var RESET_DUR = 380;

  /* 触发/重置的滚动阈值（占整个 200vh 舞台的比例）：
     滚过 1.5%（≈3vh，几像素的滚轮）就触发；退回 0.5% 才算「回到第一屏」。 */
  var TRIGGER_AT = 0.015;
  var RESET_AT = 0.005;

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function easeIO(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  /* 数字动画用 easeOutCubic：一进场就冲，尾段减速收住 */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  /* 几何变形用「easeOut 与 easeInOut 的中点」：起点跟得上数字的冲刺，
     结尾又收得住。直接上 easeInOut 会显得画面比数字慢半拍，像「先跳完再变形」。 */
  function easeGeo(t) { return (easeOut(t) + easeIO(t)) / 2; }

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

  function domainFor(series, ind) {
    var vals = series.map(function (p) { return p[1]; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    if (ind.unit === '%') {
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

    var nameZh = esc(c.nameZh);

    /* 这个国家有哪些指标真的有数据 */
    var metrics = {};
    var avail = {};
    GPM.INDICATORS.forEach(function (m) {
      var mm = GPM.metricOf(iso2, m.key);
      if (mm) { avail[m.key] = true; metrics[m.key] = mm; }
    });
    var keys = GPM.INDICATORS.filter(function (m) { return avail[m.key]; })
      .map(function (m) { return m.key; });

    var hasBubble = !!(window.__GPM_BUBBLE__ && window.__GPM_BUBBLE__.gdp[iso2]);

    if (!keys.length) {
      mount.innerHTML = '<section class="view view-country story-plain">'
        + '<a class="back" href="#/">← 返回地图</a>'
        + '<header class="country-head"><h1>' + nameZh + '</h1>'
        + '<p class="country-meta">' + esc([c.nameEn, c.region].filter(Boolean).join(' · ')) + '</p></header>'
        + '<div class="notice"><strong>这个地区没有可展示的数据。</strong>'
        + '<p>世界银行 WDI 未收录' + nameZh + '的这些指标，所以这里不做任何估算或填充，地图上也保持中性灰。</p>'
        + '<p class="notice-more">本页共收录 ' + D.meta.countriesTotal + ' 个国家与地区，其中 '
        + D.meta.countriesWithData + ' 个有儿童死亡率数据。'
        + '<a class="notice-link" href="#/">回到地图选一个 →</a></p></div>'
        + '</section>';
      return function () { mount.innerHTML = ''; };
    }

    /* 选中指标：默认继承在地球页选中的那一项；该国没数据时退到第一个可用的 */
    var sel = GPM.state.get();
    if (!avail[sel]) sel = keys[0];

    var tabsHTML = GPM.INDICATORS.map(function (ind) {
      var on = ind.key === sel;
      var off = !avail[ind.key];
      return '<button class="tab' + (on ? ' is-on' : '') + (off ? ' is-off' : '') + '"'
        + ' type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + (off ? ' disabled' : '') + ' data-key="' + ind.key + '">'
        + esc(ind.label) + '</button>';
    }).join('');

    var menuHTML = GPM.INDICATORS.map(function (ind) {
      var off = !avail[ind.key];
      return '<button class="pick-item' + (off ? ' is-off' : '') + '" type="button" role="option"'
        + ' aria-selected="' + (ind.key === sel ? 'true' : 'false') + '"'
        + (off ? ' disabled' : '') + ' data-key="' + ind.key + '">'
        + '<span class="pick-item-k">' + esc(ind.label) + '</span>'
        + '<span class="pick-item-v">' + esc(ind.unit) + '</span>'
        + '</button>';
    }).join('');

    mount.innerHTML = ''
      + '<section class="story" id="story">'

      /* ================= 双屏舞台：200vh，里面钉一个 100vh 的视口 ================= */
      + '  <div class="stage" id="stage">'
      /* 第一屏哨兵：高度正好一屏，IntersectionObserver 用它判断「是否在第一屏」 */
      + '    <div class="hero-zone" id="heroZone" aria-hidden="true"></div>'
      + '    <div class="pin" id="pin" style="--p:0">'

      /* 顶栏：返回 + 地区（第二屏出现时不遮挡胶囊） */
      + '      <div class="pin-bar">'
      + '        <a class="story-back" href="#/">← 返回地图</a>'
      + '        <span class="pin-id">' + esc([c.region, c.nameEn].filter(Boolean).join(' · ')) + '</span>'
      + '      </div>'

      /* 第一屏：极简透明胶囊 + 下拉 */
      + '      <div class="ind-pick" id="indPick">'
      + '        <button class="pick-btn" id="pickBtn" type="button" aria-haspopup="listbox" aria-expanded="false">'
      + '          <i class="pick-dot" aria-hidden="true"></i>'
      + '          <b id="pickLabel">' + esc(GPM.indicator(sel).label) + '</b>'
      + '          <svg class="pick-caret" viewBox="0 0 12 12" aria-hidden="true">'
      + '            <path d="M2.5 4.4 6 7.9l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4"'
      + '              stroke-linecap="round" stroke-linejoin="round"/>'
      + '          </svg>'
      + '        </button>'
      + '        <div class="pick-menu" id="pickMenu" role="listbox" aria-label="切换指标">' + menuHTML + '</div>'
      + '      </div>'

      /* 第二屏：横向胶囊导航 */
      + '      <div class="pin-tabs" id="pinTabs">'
      + '        <div class="tabs" role="tablist" aria-label="切换指标" id="tabs">' + tabsHTML + '</div>'
      + '      </div>'

      /* 数字层：从正中缩到左栏。单值结构：年份 + 巨大数字 + 发光下落箭头，
         起点状态就是「1990 年 / 25.0」，滚动后同一位数字跳到「2024 今天 / 59.0」 */
      + '      <div class="pin-num" id="numStage">'
      + '        <div class="num-in">'
      + '          <p class="hero-tag"><b>[ ' + nameZh + ' ]</b><span id="heroInd"></span></p>'
      + '          <div class="st-hero">'
      + '            <p class="st-tick"><b id="stYear">—</b><em>年</em>'
      + '              <span class="st-tick-now" id="stNow" hidden>今天</span></p>'
      + '            <div class="st-big"><b id="stBig">—</b><i class="st-unit" id="stUnit"></i></div>'
      + '            <span class="st-drop" aria-hidden="true">'
      + '              <svg class="st-drop-svg" width="18" height="60" viewBox="0 0 18 60" fill="none">'
      + '                <defs>'
      + '                  <linearGradient id="stDropGrad" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">'
      + '                    <stop offset="0" stop-color="#22D3EE" stop-opacity="0.06"/>'
      + '                    <stop offset="1" stop-color="#22D3EE" stop-opacity="1"/>'
      + '                  </linearGradient>'
      + '                </defs>'
      + '                <path d="M9 0V52" stroke="#22D3EE" stroke-width="3" stroke-opacity="0.14" stroke-linecap="round"/>'
      + '                <path class="st-flow" d="M9 0V52" stroke="url(#stDropGrad)" stroke-width="2" stroke-linecap="round"/>'
      + '                <path d="M4.6 46.8 9 52.6l4.4-5.8" stroke="url(#stDropGrad)" stroke-width="2"'
      + '                  stroke-linecap="round" stroke-linejoin="round"/>'
      + '              </svg>'
      + '            </span>'
      + '          </div>'
      + '        </div>'
      + '      </div>'

      /* 折线层：第二屏从右侧滑入 */
      + '      <div class="pin-chart" id="chartStage">'
      + '        <div class="chart-head">'
      + '          <h2 class="chart-title" id="chartTitle"></h2>'
      + '          <span class="chart-sub" id="chartSub"></span>'
      + '          <span class="chart-delta" id="chartDelta"></span>'
      + '        </div>'
      + '        <div class="chart" id="heroChart"></div>'
      + '      </div>'

      /* 第一屏底部：极小的滚动提示 */
      + '      <p class="pin-hint" id="scrollHint"><span>向下滚动</span>'
      + '        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v9M3.4 7.9 7 11.5l3.6-3.6"'
      + '          fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"'
      + '          stroke-linejoin="round"/></svg></p>'
      + '    </div>'
      + '  </div>'

      /* ================= 气泡图 ================= */
      + (hasBubble
        ? '  <section class="story-bubble" id="bubbleSec">'
        + '    <p class="st-hud-title"><i aria-hidden="true">[</i><span>全球各国：收入与寿命的变迁</span>'
        + '      <i aria-hidden="true">]</i></p>'
        + '    <div class="bub-root" id="bubRoot"></div>'
        + '  </section>'
        : '')

      /* ================= 尾注 + 数据表 ================= */
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

    /* ---------- 节点 ---------- */
    var story = mount.querySelector('#story');
    var stage = mount.querySelector('#stage');
    var pin = mount.querySelector('#pin');
    var numStage = mount.querySelector('#numStage');
    var chartStage = mount.querySelector('#chartStage');
    var chartEl = mount.querySelector('#heroChart');
    var tabBox = mount.querySelector('#tabs');
    var pickBtn = mount.querySelector('#pickBtn');
    var pickLabel = mount.querySelector('#pickLabel');
    var pickMenu = mount.querySelector('#pickMenu');
    var indPick = mount.querySelector('#indPick');
    var bigEl = mount.querySelector('#stBig');
    var yearEl = mount.querySelector('#stYear');
    var unitEl = mount.querySelector('#stUnit');
    var indEl = mount.querySelector('#heroInd');
    var nowEl = mount.querySelector('#stNow');
    var titleEl = mount.querySelector('#chartTitle');
    var subEl = mount.querySelector('#chartSub');
    var deltaEl = mount.querySelector('#chartDelta');
    var tailNoteEl = mount.querySelector('#tailNote');
    var tailTableEl = mount.querySelector('#tailTable');

    /* ---------- 指标状态 ---------- */
    var m = metrics[sel];
    var ind = GPM.indicator(sel);
    var chartView = null;
    var progress = 0;
    var swapToken = 0;
    var menuOpen = false;
    var animated = 'idle';        // idle | playing | settled
    var animRaf = null;
    var geom = 0;                 // --p 的当前值，只由动画写
    var heroMode = true;

    function setNum(v) { bigEl.textContent = numText(v, ind.decimals); }
    function setYear(y) { yearEl.textContent = String(y); }

    /* ---------- 动作 A：数据跳动（数字 + 年份 + 折线笔尖） ---------- */
    function paintAt(e) {
      progress = e;
      setNum(m.base.value + (m.last.value - m.base.value) * e);
      setYear(Math.round(m.base.year + (m.last.year - m.base.year) * e));
      if (chartView) chartView.setProgress(e);
    }

    /* ---------- 动作 B：几何变形（--p 0 → 1） ----------
       p=0 数字居中巨大、折线不可见；p=1 数字缩到左栏、折线滑出到位。 */
    function paintGeo(g) {
      geom = g;
      pin.style.setProperty('--p', g.toFixed(4));
      var hero = g < 0.5;
      if (hero !== heroMode) {
        heroMode = hero;
        story.dataset.scr = hero ? 'hero' : 'detail';
        if (!hero) closeMenu();
      }
    }

    function stopAnim() {
      if (animRaf) { cancelAnimationFrame(animRaf); animRaf = null; }
    }

    /* 定格：数字落到最新一年，亮起「今天 / 最新」，几何收在 geoTo */
    function finish(geoTo) {
      stopAnim();
      animated = 'settled';
      story.classList.remove('is-rolling');
      story.classList.add('is-settled');
      paintAt(1);
      paintGeo(geoTo);
      nowEl.hidden = false;
      nowEl.textContent = m.last.year >= 2023 ? '今天' : '最新';
    }

    /* 触发：一条 2.5 秒的时间轴，同时推进数值与几何，滚轮停在哪里都自己播完 */
    function play(geoTo) {
      stopAnim();
      if (DECOR) { finish(geoTo); return; }
      animated = 'playing';
      story.classList.remove('is-settled');
      story.classList.add('is-rolling');
      nowEl.hidden = true;
      paintAt(0);
      var gFrom = geom;
      var t0 = 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var t = Math.min(1, (ts - t0) / ANIM_DUR);
        /* 同一个 t、同一条时间轴：动作 A 与动作 B 同时开始、同时结束 */
        paintAt(easeOut(t));
        paintGeo(gFrom + (geoTo - gFrom) * easeGeo(t));
        if (t < 1) {
          animRaf = requestAnimationFrame(step);
        } else {
          animRaf = null;
          finish(geoTo);
        }
      }
      animRaf = requestAnimationFrame(step);
    }

    /* 重置：平滑退回第一屏（数字回起点、折线清空），等待下一次触发 */
    function resetAnim() {
      if (animated === 'idle') return;
      stopAnim();
      var gFrom = geom;
      var pFrom = progress;
      animated = 'idle';
      story.classList.remove('is-rolling', 'is-settled');
      nowEl.hidden = true;
      if (DECOR || (!gFrom && !pFrom)) {
        paintAt(0);
        paintGeo(0);
        syncScroll();          // 重置期间又滚下去了就补一次触发
        return;
      }
      var t0 = 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var t = Math.min(1, (ts - t0) / RESET_DUR);
        var e = 1 - easeOut(t);          // 从当前状态退回 0
        paintAt(pFrom * e);
        paintGeo(gFrom * e);
        if (t < 1) {
          animRaf = requestAnimationFrame(step);
        } else {
          animRaf = null;
          paintAt(0);
          paintGeo(0);
          syncScroll();      // 重置期间又滚下去了就补一次触发
        }
      }
      animRaf = requestAnimationFrame(step);
    }

    /* ---------- 折线 ---------- */
    function chartHeight() {
      var head = mount.querySelector('.chart-head');
      /* chart.js 还要在上下各加 18 / 36px 的轴留白，一起扣掉，否则窄屏会被裁掉年份 */
      var h = chartStage.clientHeight - (head ? head.offsetHeight : 44) - 70;
      return Math.max(140, Math.min(560, Math.round(h)));
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

      var better = GPM.isBetter(ind, m.delta);
      story.dataset.trend = better === null ? 'flat' : better ? 'up' : 'down';
      deltaEl.classList.toggle('is-good', better === true);
      deltaEl.classList.toggle('is-bad', better === false);

      var headEl = mount.querySelector('#tailHead');
      if (headEl) headEl.textContent = (m.last.year - m.base.year) + ' 年，一条线。';
      tailNoteEl.innerHTML = '本节指标：<b>' + esc(ind.label) + '</b>（' + esc(ind.unitLong)
        + '），世界银行 WDI ' + esc(ind.code)
        + '。所有数值为构建时的快照，运行时不发起任何网络请求；气泡图另用人均 GDP（PPP）与总人口。';
      tailTableEl.innerHTML = tableHTML(m, ind);
    }

    /* ---------- 控件：下拉胶囊 + 胶囊栏，双向同一份状态 ---------- */
    function syncControls() {
      pickLabel.textContent = ind.label;
      Array.prototype.forEach.call(tabBox.querySelectorAll('.tab'), function (btn) {
        var on = btn.getAttribute('data-key') === sel;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      Array.prototype.forEach.call(pickMenu.querySelectorAll('.pick-item'), function (btn) {
        var on = btn.getAttribute('data-key') === sel;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function openMenu() {
      if (menuOpen) return;
      menuOpen = true;
      indPick.classList.add('is-open');
      pickBtn.setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
      if (!menuOpen) return;
      menuOpen = false;
      indPick.classList.remove('is-open');
      pickBtn.setAttribute('aria-expanded', 'false');
    }

    /* 换指标：淡出 → 换数据重画 → 淡入。数字回到哪里由当前滚动位置决定：
       在第一屏顶部切换 = 回到新指标的起点，滚动时从新起点重新跳；
       已经滚到第二屏 = 直接显示新指标的最新值。 */
    function applyIndicator(key) {
      sel = key;
      m = metrics[key];
      ind = GPM.indicator(key);
      syncControls();
      var my = ++swapToken;
      numStage.classList.add('is-swap');
      chartStage.classList.add('is-swap');
      setTimeout(function () {
        if (my !== swapToken) return;
        story.classList.remove('is-settled', 'is-rolling');
        nowEl.hidden = true;
        applyMeta();
        drawChart();
        numStage.classList.remove('is-swap');
        chartStage.classList.remove('is-swap');
        /* 第一屏（几何还在正中）：只重播数字，版式不动；
           已经变形到第二屏：直接给新指标的定型态 */
        if (geom < 0.5) play(0); else finish(1);
      }, 170);
    }

    function choose(key) {
      closeMenu();
      if (!avail[key] || key === sel) return;
      /* 全局状态已经等于它（本页因缺数据回退过）：直接切，避免 set 空转 */
      if (GPM.state.get() === key) applyIndicator(key);
      else GPM.state.set(key);     // 广播，订阅里统一 applyIndicator
    }

    var offState = GPM.state.subscribe(function (key) {
      if (key !== sel && avail[key]) applyIndicator(key);
    });

    function onTabsClick(e) {
      var btn = e.target.closest ? e.target.closest('.tab') : null;
      if (!btn || btn.disabled) return;
      choose(btn.getAttribute('data-key'));
    }
    tabBox.addEventListener('click', onTabsClick);

    function onMenuClick(e) {
      var btn = e.target.closest ? e.target.closest('.pick-item') : null;
      if (!btn || btn.disabled) return;
      choose(btn.getAttribute('data-key'));
    }
    pickMenu.addEventListener('click', onMenuClick);

    function onPickClick(e) {
      e.stopPropagation();
      if (menuOpen) closeMenu(); else openMenu();
    }
    pickBtn.addEventListener('click', onPickClick);
    pickBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    function onDocDown(e) {
      if (menuOpen && !indPick.contains(e.target)) closeMenu();
    }
    document.addEventListener('pointerdown', onDocDown);

    /* ---------- 滚动只做两件事：判断「有没有滚出一点」和「有没有退回顶部」，
       绝不拿它去插值任何视觉属性 ---------- */
    var scrollP = 0;
    var ticking = false;

    function syncScroll() {
      var total = stage.offsetHeight - window.innerHeight;
      scrollP = total > 0 ? clamp01(-stage.getBoundingClientRect().top / total) : 0;

      if (scrollP <= RESET_AT) {
        /* 退回舞台顶部：重置，等下一次触发 */
        if (animated === 'settled' || animated === 'playing') resetAnim();
      } else if (scrollP > TRIGGER_AT && animated !== 'playing' && geom < 0.5) {
        /* 滚了哪怕一点点、画面还在第一屏：触发一次完整的 2.5 秒复合动画。
           geom >= 0.5 说明已经变形到位，不再重来；animated === 'playing' 时不重入。 */
        play(1);
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; syncScroll(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------- 第一屏哨兵（IntersectionObserver）：
       语义对齐 toggleActions —— 进入不自动播（等滚轮），从下方滚回第一屏（enterBack）时重置。
       离开时不做任何事，否则向下经过第二屏会把左栏数字清成起点。 ---------- */
    var heroZone = mount.querySelector('#heroZone');
    var zoneIO = heroZone ? new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.9 && animated === 'settled') resetAnim();
    }, { threshold: [0.9] }) : null;
    if (zoneIO) zoneIO.observe(heroZone);

    /* ---------- 首帧：停在第 1 屏起点，什么都不播，等用户滚动 ---------- */
    story.dataset.scr = 'hero';
    syncControls();
    applyMeta();
    paintGeo(0);
    drawChart();
    paintAt(0);

    /* 路由在这一帧之后才把页面滚回顶部，所以判定要等两帧，
       否则从地图页中途点进来会被误判成「已经在第二屏」 */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        story.classList.add('is-in');
        var total = stage.offsetHeight - window.innerHeight;
        scrollP = total > 0 ? clamp01(-stage.getBoundingClientRect().top / total) : 0;
        if (scrollP > 0.02) finish(1);   // 从别处回来（带滚动位置）：直接给定型态
      });
    });

    /* ---------- 气泡图：进视口懒创建、只播一次 ---------- */
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
          bubblePlayed = false;
          ensureBubble();
        }
      }, 220);
    }
    window.addEventListener('resize', onResize);

    return function cleanup() {
      clearTimeout(rt);
      stopAnim();
      offState();
      if (zoneIO) zoneIO.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerdown', onDocDown);
      if (bubbleIO) bubbleIO.disconnect();
      if (bubble) bubble.destroy();
      mount.innerHTML = '';
    };
  };
})();
