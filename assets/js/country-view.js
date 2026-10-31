/* 国家详情：双屏滚动叙事（Hero → Detail）+ 全局指标状态。
   第 1 屏：屏幕正中一个巨大数字；第 2 屏：数字缩小左移，折线从右侧滑出。
   两屏之间不是「锁死滚动」，就是普通滚动，进度完全由滚动位置决定，所以上滚必然可逆。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  var DECOR = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 动画节奏：先停 0.5 秒让人看清起点，再用 2.5 秒落到最新一年 */
  var PAUSE = 500;
  var DUR = 2500;

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

      /* 数字层：从正中缩到左栏 */
      + '      <div class="pin-num" id="numStage">'
      + '        <div class="num-in">'
      + '          <p class="hero-tag"><b>[ ' + nameZh + ' ]</b><span id="heroInd"></span></p>'
      + '          <div class="st-cmp">'
      + '            <p class="st-from"><span class="st-from-k" id="stFromYear">1990 年</span>'
      + '              <span class="st-from-v"><b id="stFromVal">—</b><em id="stFromUnit"></em></span></p>'
      + '            <span class="st-drop" aria-hidden="true">'
      + '              <svg class="st-drop-svg" width="18" height="60" viewBox="0 0 18 60" fill="none">'
      + '                <defs>'
      + '                  <linearGradient id="stDropGrad" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">'
      + '                    <stop offset="0" stop-color="#22D3EE" stop-opacity="0"/>'
      + '                    <stop offset="0.4" stop-color="#22D3EE" stop-opacity="0.45"/>'
      + '                    <stop offset="1" stop-color="#22D3EE" stop-opacity="1"/>'
      + '                  </linearGradient>'
      + '                </defs>'
      + '                <path d="M9 0V52" stroke="#22D3EE" stroke-width="4" stroke-opacity="0.12" stroke-linecap="round"/>'
      + '                <path d="M9 0V52" stroke="url(#stDropGrad)" stroke-width="1.2" stroke-linecap="round"/>'
      + '                <path d="M4.6 46.8 9 52.6l4.4-5.8" stroke="url(#stDropGrad)" stroke-width="1.2"'
      + '                  stroke-linecap="round" stroke-linejoin="round"/>'
      + '              </svg>'
      + '            </span>'
      + '            <div class="st-to">'
      + '              <p class="st-tick"><b id="stYear">—</b><em>年</em>'
      + '                <span class="st-tick-now" id="stNow">今天</span></p>'
      + '              <div class="st-big"><b id="stBig">—</b><i class="st-unit" id="stUnit"></i></div>'
      + '            </div>'
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

    /* ---------- 指标状态 ---------- */
    var m = metrics[sel];
    var ind = GPM.indicator(sel);
    var chartView = null;
    var raf = null;
    var progress = 0;
    var swapToken = 0;
    var menuOpen = false;

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

    function stopAnim() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    function play() {
      stopAnim();
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
      story.dataset.dir = m.delta < 0 ? 'down' : 'up';
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

    /* 换指标：淡出 → 换数据重画 → 淡入 → 重新播跳动 */
    function applyIndicator(key) {
      sel = key;
      m = metrics[key];
      ind = GPM.indicator(key);
      syncControls();
      stopAnim();
      var my = ++swapToken;
      numStage.classList.add('is-swap');
      chartStage.classList.add('is-swap');
      setTimeout(function () {
        if (my !== swapToken) return;
        story.classList.remove('is-settled', 'is-rolling');
        nowEl.hidden = true;
        applyMeta();
        drawChart();
        paintBase();
        numStage.classList.remove('is-swap');
        chartStage.classList.remove('is-swap');
        play();
      }, DECOR ? 0 : 170);
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

    /* ---------- 滚动进度：0 = 巨大数字，1 = 左数字 + 右折线 ---------- */
    var scrollP = 0;
    var heroMode = true;
    var ticking = false;

    function setP(v) {
      scrollP = v < 0 ? 0 : v > 1 ? 1 : v;
      pin.style.setProperty('--p', scrollP.toFixed(4));
      var hero = scrollP < 0.52;
      if (hero !== heroMode) {
        heroMode = hero;
        story.dataset.scr = hero ? 'hero' : 'detail';
        if (!hero) closeMenu();
      }
    }

    function measure() {
      var total = stage.offsetHeight - window.innerHeight;
      if (total <= 0) { setP(0); return; }
      setP(-stage.getBoundingClientRect().top / total);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; measure(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------- 首帧 ---------- */
    story.dataset.scr = 'hero';
    syncControls();
    applyMeta();
    drawChart();
    paintBase();

    /* 路由在这一帧之后才把页面滚回顶部，所以量进度要等一帧，避免开门就闪第二屏 */
    requestAnimationFrame(function () {
      measure();
      story.classList.add('is-in');
      play();
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
        measure();
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
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerdown', onDocDown);
      if (bubbleIO) bubbleIO.disconnect();
      if (bubble) bubble.destroy();
      mount.innerHTML = '';
    };
  };
})();
