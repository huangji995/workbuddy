/* 国家详情：全屏滚动叙事。
   sticky 画布 + 步进文字，IntersectionObserver 触发离散状态；
   状态间只用 transform / opacity 过渡，不碰布局属性。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  var DECOR = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /** 大数字的显示格式：上百取整，小值保留一位 */
  function numText(v) {
    if (v >= 100) return String(Math.round(v));
    return v.toFixed(1);
  }

  /* 大数字这一块只说“起点 → 今天”这一件事，不再重复读数：数字本身已经是读数 */
  function heroCopy(key) {
    if (key === 'u5mr') {
      return {
        unit: '‰',
        cap: '每 1000 个活产儿里，有多少没能活过五岁。'
      };
    }
    return {
      unit: '岁',
      cap: '出生时预期寿命，一个人平均能活多少年。'
    };
  }

  function domainFor(series, key) {
    var vals = series.map(function (p) { return p[1]; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    if (key === 'u5mr') {
      var top = Math.max(10, Math.ceil((max * 1.08) / 10) * 10);
      return [0, top];
    }
    return [Math.max(0, Math.floor((min - 2) / 5) * 5), Math.ceil((max + 2) / 5) * 5];
  }

  function deltaText(key, m) {
    if (!m || m.deltaPct === null || m.deltaPct === undefined) return '';
    var pct = m.deltaPct;
    if (key === 'u5mr') return (pct <= 0 ? '−' : '+') + Math.abs(pct).toFixed(0) + '%';
    return (m.delta >= 0 ? '+' : '−') + U.fmt(Math.abs(m.delta), 1) + ' 岁';
  }

  function chartBlock(key, ind, m, suffix) {
    return '<div class="st-chart">'
      + '<div class="st-chart-head">'
      + '  <span class="st-chart-name">' + ind.label + '<em>' + ind.unit + '</em></span>'
      + '  <span class="st-chart-delta">' + deltaText(key, m) + '</span>'
      + '</div>'
      + '<div class="chart" id="chart-' + suffix + '-' + key + '"></div>'
      + '</div>';
  }

  function tableHTML(c, indU, indL) {
    var map = {};
    (c.u5mr ? c.u5mr.series : []).forEach(function (p) { (map[p[0]] = map[p[0]] || {}).u5mr = p[1]; });
    (c.lifeExp ? c.lifeExp.series : []).forEach(function (p) { (map[p[0]] = map[p[0]] || {}).le = p[1]; });
    var years = Object.keys(map).map(Number).sort(function (x, y) { return x - y; });
    if (!years.length) return '';
    var rows = years.filter(function (y, i) { return y % 5 === 0 || i === years.length - 1; })
      .map(function (y) {
        var r = map[y];
        return '<tr><td>' + y + '</td>'
          + '<td>' + (r.u5mr === undefined ? '—' : U.fmt(r.u5mr, 1)) + '</td>'
          + '<td>' + (r.le === undefined ? '—' : U.fmt(r.le, 1)) + '</td></tr>';
      }).join('');
    return '<details class="data-table"><summary>以数据表查看（每 5 年）</summary>'
      + '<table><thead><tr><th>年份</th><th>' + indU.label + '</th><th>' + indL.label + '</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></details>';
  }

  function footCodes(c) {
    var codes = [];
    if (c.u5mr) codes.push('SH.DYN.MORT');
    if (c.lifeExp) codes.push('SP.DYN.LE00.IN');
    return codes.length ? ' · ' + codes.join(' / ') : '';
  }

  GPM.renderCountryView = function (mount, iso2) {
    var D = window.__GPM_DATA__;
    var c = D.countries[iso2];
    var indU = D.indicators.u5mr;
    var indL = D.indicators.lifeExp;

    if (!c) {
      mount.innerHTML = '<section class="view view-country"><a class="back" href="#/">← 返回地图</a>'
        + '<div class="notice">没有找到代码为 <code>' + esc(iso2) + '</code> 的国家或地区。</div></section>';
      return function () { mount.innerHTML = ''; };
    }

    var hasHero = !!(c.u5mr || c.lifeExp);
    var hasBubble = !!(window.__GPM_BUBBLE__ && window.__GPM_BUBBLE__.gdp[iso2]);

    if (!hasHero) {
      mount.innerHTML = '<section class="view view-country story-plain">'
        + '<a class="back" href="#/">← 返回地图</a>'
        + '<header class="country-head"><h1>' + esc(c.nameZh) + '</h1>'
        + '<p class="country-meta">' + esc([c.nameEn, c.region].filter(Boolean).join(' · ')) + '</p></header>'
        + '<div class="notice"><strong>这个地区没有可展示的数据。</strong>'
        + '<p>世界银行 WDI 未收录' + esc(c.nameZh) + '的 5 岁以下儿童死亡率与出生时预期寿命，'
        + '所以这里不做任何估算或填充，地图上也保持中性灰。</p>'
        + '<p class="notice-more">本页共收录 ' + D.meta.countriesTotal + ' 个国家与地区，其中 '
        + D.meta.countriesWithData + ' 个有儿童死亡率数据。'
        + '<a class="notice-link" href="#/">回到地图选一个 →</a></p></div>'
        + '</section>';
      return function () { mount.innerHTML = ''; };
    }

    /* ---------- 主指标 ---------- */
    var heroKey = c.u5mr ? 'u5mr' : 'lifeExp';
    var heroM = c[heroKey];
    var copy = heroCopy(heroKey);
    var lastVal = heroM.last.value;
    var baseVal = heroM.base.value;
    var baseYear = heroM.base.year;
    var lastYear = heroM.last.year;
    /* 变好还是变差：寿命看涨，儿童死亡看跌 */
    var improved = heroKey === 'u5mr' ? lastVal < baseVal : lastVal > baseVal;
    var trend = improved ? 'up' : 'down';

    /* ---------- 文案 ---------- */
    var nameZh = esc(c.nameZh);
    var cap1 = '这条线上的每一个点，都是一年真实观测。没有估算，也没有插值。';
    var cap2 = heroKey === 'u5mr'
      ? '上面那条往下走，下面那条往上走。它们是同一件事的两面：孩子活下来了，人也就活得更久。'
      : '上面那条往下走，下面那条往上走。死亡在退，寿命在长——同一件事的两面。';
    var cap3 = '把' + nameZh + '放回世界的坐标里：横轴人均收入，纵轴预期寿命，每个气泡是一个国家。'
      + '按下播放，看这一整片气泡怎么挪。';

    /* ---------- 结构 ---------- */
    var chartsHTML = function (suffix) {
      return (c.u5mr ? chartBlock('u5mr', indU, c.u5mr, suffix) : '')
        + (c.lifeExp ? chartBlock('lifeExp', indL, c.lifeExp, suffix) : '');
    };

    mount.innerHTML = ''
      + '<section class="story" id="story" data-state="0" data-trend="' + trend + '">'
      + '  <nav class="story-nav">'
      + '    <a class="story-back" href="#/">← 返回地图</a>'
      + '    <span class="story-id"><b>' + nameZh + '</b><em>' + esc(c.region || '') + '</em></span>'
      + '  </nav>'
      + '  <div class="story-stage" id="storyStage">'
      + '    <div class="st-layer st-num">'
      + '      <div class="st-inner">'
      + '        <div class="st-cmp">'
      // 起点：小字号，先把锚点交代清楚
      + '          <p class="st-from"><span class="st-from-k">' + baseYear + ' 年</span>'
      + '            <span class="st-from-v">' + U.fmt(baseVal, 1) + '<em>' + copy.unit + '</em></span></p>'
      // 中间：青色发光的坠落线，把上下两段连起来（一条路径画完，线头就是箭头）
      + '          <span class="st-drop" aria-hidden="true">'
      + '            <svg class="st-drop-svg" width="18" height="60" viewBox="0 0 18 60" fill="none">'
      + '              <defs>'
      + '                <linearGradient id="stDropGrad" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">'
      + '                  <stop offset="0" stop-color="#22D3EE" stop-opacity="0"/>'
      + '                  <stop offset="0.4" stop-color="#22D3EE" stop-opacity="0.45"/>'
      + '                  <stop offset="1" stop-color="#22D3EE" stop-opacity="1"/>'
      + '                </linearGradient>'
      + '              </defs>'
      + '              <path d="M9 0V52" stroke="#22D3EE" stroke-width="4" stroke-opacity="0.12" stroke-linecap="round"/>'
      + '              <path d="M9 0V52" stroke="url(#stDropGrad)" stroke-width="1.2" stroke-linecap="round"/>'
      + '              <path d="M4.6 46.8 9 52.6l4.4-5.8" stroke="url(#stDropGrad)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '            </svg>'
      + '          </span>'
      // 终点：年份随数字一起跳，落定后亮起“今天”
      + '          <div class="st-to">'
      + '            <p class="st-tick"><b id="stYear">' + baseYear + '</b><em>年</em>'
      + '              <span class="st-tick-now">今天</span></p>'
      + '            <div class="st-big"><b id="stBig">' + U.fmt(baseVal, 1) + '</b>'
      + '              <i class="st-unit">' + copy.unit + '</i></div>'
      + '          </div>'
      + '        </div>'
      + '        <p class="st-line">' + copy.cap + '</p>'
      + '        <p class="st-hint" aria-hidden="true">向下滚动<span class="st-chev">↓</span></p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="st-layer st-charts">'
      + '      <div class="st-inner">' + chartsHTML('side') + '</div>'
      + '    </div>'
      + '    <div class="st-layer st-bubble">'
      + '      <div class="st-inner"><div class="bub-root" id="bubRoot"></div></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="story-steps">'
      + '    <div class="st-step" data-step="0" aria-hidden="true"></div>'
      + '    <div class="st-step" data-step="1"><p class="st-cap">' + cap1 + '</p></div>'
      + '    <div class="st-step" data-step="2"><p class="st-cap">' + cap3 + '</p></div>'
      + '    <div class="st-step" data-step="3" aria-hidden="true"></div>'
      + '    <div class="st-step" data-step="4" aria-hidden="true"></div>'
      + '  </div>'
      + '</section>'
      + '<section class="story-tail">'
      + '  <div class="story-tail-in">'
      + '    <p class="story-tail-k">' + esc(c.region || '') + ' · ' + nameZh + '</p>'
      + '    <h2 class="story-tail-h">三十四年，一条线。</h2>'
      + '    <p class="story-tail-p">数据来自世界银行 WDI，指标编号 ' + footCodes(c).replace(/^ · /, '')
      + '；气泡图另用人均 GDP（PPP）与总人口。所有数值为构建时的快照，运行时不发起任何网络请求。</p>'
      + tableHTML(c, indU, indL)
      + '    <a class="story-tail-link" href="#/">← 回到地球</a>'
      + '  </div>'
      + '</section>';

    var story = mount.querySelector('#story');
    var stage = mount.querySelector('#storyStage');
    var bigEl = mount.querySelector('#stBig');
    var yearEl = mount.querySelector('#stYear');

    /* ---------- 数字：先停 0.5s 让人看清起点，再用 3s 落下来 ---------- */
    /* 这一年 / 这十年的读数要能被看清，所以节奏比一般 count-up 慢一倍，
       缓动也换成进出都慢的 easeInOutCubic，像数字在往下坠。 */
    var PAUSE = 500;
    var DUR = 3000;

    var curVal = baseVal;
    var settled = false;
    var numRaf = null;

    function setNum(v) {
      curVal = v;
      if (bigEl) bigEl.textContent = numText(v);
    }

    function setYear(y) {
      if (yearEl) yearEl.textContent = String(y);
    }

    function settle() {
      settled = true;
      story.classList.remove('is-rolling');
      story.classList.add('is-settled');
      setNum(lastVal);
      setYear(lastYear);
      applyChartProgress(1);      // 数字定格那一刻，笔尖正好收在终点
    }

    function resetNum() {
      settled = false;
      story.classList.remove('is-settled', 'is-rolling');
      if (numRaf) { cancelAnimationFrame(numRaf); numRaf = null; }
      setNum(baseVal);
      setYear(baseYear);
      applyChartProgress(0);
    }

    function tweenNum(to) {
      if (numRaf) { cancelAnimationFrame(numRaf); numRaf = null; }
      if (DECOR) { settle(); return; }
      var from = curVal;
      var t0 = 0;
      story.classList.remove('is-settled');
      story.classList.add('is-rolling');
      function step(ts) {
        if (!t0) t0 = ts;
        var el = ts - t0;
        if (el < PAUSE) { numRaf = requestAnimationFrame(step); return; }   // 停顿：数字停在起点不动
        var t = Math.min(1, (el - PAUSE) / DUR);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setNum(from + (to - from) * e);
        setYear(Math.round(baseYear + (lastYear - baseYear) * e));
        applyChartProgress(e);     // 右边那条线跟着笔尖一起长出来
        if (t < 1) numRaf = requestAnimationFrame(step);
        else { numRaf = null; settle(); }
      }
      numRaf = requestAnimationFrame(step);
    }

    /* ---------- 折线图：侧栏版与全宽版各画一套，各自保持原生字号 ---------- */
    // 叙事从 1990 起算：折线也只画 1990 之后，和地图、气泡图同一个时间窗
    function clip(ctx) {
      return ctx.series.filter(function (p) { return p[0] >= 1990; });
    }

    // 折线的绘制进度与左边数字共用一条时间线
    var chartViews = [];
    var chartProgress = 0;

    function applyChartProgress(p) {
      chartProgress = p;
      for (var i = 0; i < chartViews.length; i++) chartViews[i].setProgress(p);
    }

    function drawCharts() {
      var su = c.u5mr ? clip(c.u5mr) : null;
      var sl = c.lifeExp ? clip(c.lifeExp) : null;
      var years = [];
      [su, sl].forEach(function (s) { if (s && s.length) years.push(s[0][0], s[s.length - 1][0]); });
      if (!years.length) return;
      var yearDomain = [Math.min.apply(null, years), Math.max.apply(null, years)];
      var h = stage.clientHeight || window.innerHeight;
      var nCharts = (c.u5mr ? 1 : 0) + (c.lifeExp ? 1 : 0);

      // 绘图高度按这一栏实际剩下多少空间算，避免两张图挤到旁白上
      var innerEl = mount.querySelector('.st-charts .st-inner');
      var cs = innerEl ? window.getComputedStyle(innerEl) : null;
      var padT = cs ? parseFloat(cs.paddingTop) || 0 : 0;
      var padB = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
      var gap = cs ? (parseFloat(cs.rowGap) || 16) : 16;
      var avail = (innerEl ? innerEl.clientHeight || h : h) - padT - padB;
      var per = (avail - gap * (nCharts - 1)) / nCharts;
      // 只有一条线时把这一栏用满，别让单张图缩成一条细带
      var cap = nCharts === 1 ? 330 : 210;
      var plotH = Math.round(Math.max(70, Math.min(cap, per - 82)));

      var blocks = [
        { key: 'u5mr', color: '#22D3EE', ind: indU, series: su },
        { key: 'lifeExp', color: '#A78BFA', ind: indL, series: sl }
      ].filter(function (b) { return b.series && b.series.length; });

      function draw(suffix, plotH) {
        chartViews = [];
        blocks.forEach(function (b, i) {
          var el = mount.querySelector('#chart-' + suffix + '-' + b.key);
          if (!el) return;
          var view = GPM.chart.render(el, {
            series: b.series,
            color: b.color,
            unit: b.ind.unit,
            yearDomain: yearDomain,
            yDomain: domainFor(b.series, b.key),
            showXAxis: i === nCharts - 1,
            baseYear: 1990,
            plotHeight: plotH,
            valueFormat: function (v) { return U.fmt(v, 1); },
            yFormat: function (v) { return String(Math.round(v)); },
            ariaLabel: c.nameZh + b.ind.label + '趋势，' + yearDomain[0] + ' 至 ' + yearDomain[1] + ' 年'
          });
          if (view) chartViews.push(view);
        });
        // 重绘（窗口尺寸变化）后要把当前进度补回去，不能让线重新变空
        applyChartProgress(chartProgress);
      }

      draw('side', plotH);
    }

    drawCharts();

    /* ---------- 气泡图（懒初始化，第一次进入第 4 屏时才建） ---------- */
    var bubble = null;
    var bubblePlayed = false;

    function ensureBubble() {
      if (bubble || !hasBubble) return;
      var root = mount.querySelector('#bubRoot');
      if (!root || !root.clientHeight) return;
      bubble = GPM.bubble.create(root, {
        iso2: iso2,
        nameZh: c.nameZh
      });
    }

    /* ---------- 状态机 ---------- */
    var curState = 0;

    function applyState(s) {
      if (s === curState) return;
      var prev = curState;
      curState = s;
      story.dataset.state = String(s);

      if (s === 0) {
        if (settled || numRaf) resetNum();
      } else if (s === 1) {
        if (!settled && !numRaf) tweenNum(lastVal);
      } else if (!settled && !numRaf) {
        /* 一路跳到第 3 屏、跳动还没开始：直接落定。
           但如果正在坠落，就让它把 3 秒走完，不掐断。 */
        settle();
      }

      if (s === 2) {
        ensureBubble();
        if (bubble && !bubblePlayed) { bubblePlayed = true; bubble.play(); }
      } else if (bubble) {
        bubble.stop();
      }
    }

    var steps = Array.prototype.slice.call(mount.querySelectorAll('.st-step'));

    var io = new IntersectionObserver(function (entries) {
      var best = -1;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var idx = Number(e.target.dataset.step);
        if (idx > best) best = idx;
      });
      if (best < 0) {
        // 一次跳很远时，中线可能刚好落在两段之间或故事之外：取离中线最近的那段
        var mid = window.innerHeight / 2;
        var bestD = Infinity;
        steps.forEach(function (el, i) {
          var r = el.getBoundingClientRect();
          var d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (d < bestD) { bestD = d; best = i; }
        });
      }
      if (best >= 0) applyState(Math.min(best, 2));
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });

    steps.forEach(function (el) { io.observe(el); });

    /* ---------- 尺寸变化 ---------- */
    var rt = null;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(function () {
        drawCharts();
        if (bubble) {
          bubble.destroy();
          bubble = null;
          ensureBubble();
        }
      }, 220);
    }
    window.addEventListener('resize', onResize);

    // 首帧之后再触发一次入场，避免和 innerHTML 同帧
    requestAnimationFrame(function () { story.classList.add('is-in'); });

    // 只有叙事页开吸附：每滑一次正好停在一屏，画布不会被撕成半屏
    var rootEl = document.documentElement;
    rootEl.classList.add('snap-story');

    return function cleanup() {
      clearTimeout(rt);
      rootEl.classList.remove('snap-story');
      window.removeEventListener('resize', onResize);
      io.disconnect();
      if (numRaf) cancelAnimationFrame(numRaf);
      if (bubble) bubble.destroy();
      mount.innerHTML = '';
    };
  };
})();
