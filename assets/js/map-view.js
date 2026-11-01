/* 首页：3D 自转地球 + 年份回放 + 图例 + 搜索 + 榜单
   指标（儿童死亡率 / 预期寿命 / 疫苗 / 电力 / 教育）由全局 GPM.state 决定，
   详情页继承的正是这里选中的那一项。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  var YEAR_START = 1990;
  var YEAR_END = 2024;
  var PLAY_MS_PER_YEAR = 360;   // 匀速：13s 走完 34 年
  var HOLD_MS = 2200;           // 停在最新年份，让人读完
  var RESET_MS = 620;           // 回到起点时的淡出，明确表示「循环重播」

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 时间轴刻度：每年一根，5 的倍数加长，两端再加一道更亮的端标 */
  function rulerHTML() {
    var out = '';
    for (var y = YEAR_START; y <= YEAR_END; y++) {
      var p = ((y - YEAR_START) / (YEAR_END - YEAR_START)) * 100;
      var isEnd = y === YEAR_START || y === YEAR_END;
      var cls = isEnd ? ' is-end' : (y % 5 === 0 ? ' is-major' : '');
      out += '<i' + (cls ? ' class="' + cls.trim() + '"' : '') + ' style="left:' + p.toFixed(3) + '%"></i>';
    }
    return out;
  }

  /* 单位槽位单独给 id（valueId + 'U'）：中位数用指标单位，
     两侧的「高于/低于 X 的国家」是计数，永远写死「个」，两者彻底解耦。 */
  function hudCard(mod, delay, labelId, label, valueId, note) {
    return '<aside class="hud-card hud-card--' + mod + ' reveal" style="--d:' + delay + 'ms">'
      + '<span class="hud-card-k" id="' + labelId + '">' + label + '</span>'
      + '<span class="hud-card-v"><b id="' + valueId + '">—</b><em id="' + valueId + 'U">—</em></span>'
      + (note ? '<span class="hud-card-note">' + note + '</span>' : '')
      + '</aside>';
  }

  /* 顶部导语必须跟着指标方向走：
     负向指标（儿童死亡率）是「越深越危险」，正向指标（预期寿命 / 疫苗 / 电力 / 女性教育）
     是「越亮越高」。以前这段写死成「星球一点点烧红」，
     选到预期寿命时那句话是彻底反的。 */
  function ledeHTML(ind) {
    var name = '<b id="ledeInd">' + esc(ind.label) + '</b>';
    if (ind.betterWhen === 'down') {
      return '颜色代表各国 ' + name + '，<strong>颜色越深越危险</strong>。'
        + '地球会自己转动，时间往回放，你能看到整颗星球一点点烧红；'
        + '往前走，红色一点点褪去——点一个国家，看它走了多远。';
    }
    return '颜色代表各国 ' + name + '，<strong>颜色越亮代表程度越高</strong>。'
      + '地球会自己转动，时间往回放，光亮一点点暗下去；'
      + '往前走，整颗星球被慢慢点亮——点一个国家，看它走了多远。';
  }

  function legendHTML(ind) {
    var invert = ind.betterWhen === 'up';
    var stops = U.rampStops(ind.thresholds, invert);
    var grad = stops.map(function (s) {
      return s.color + ' ' + (s.at * 100).toFixed(1) + '%';
    }).join(', ');
    var ticks = ind.thresholds.map(function (v, i) {
      var pct = i / (ind.thresholds.length - 1) * 100;
      return '<span style="left:' + pct.toFixed(2) + '%">' + v + (i === ind.thresholds.length - 1 ? '+' : '') + '</span>';
    }).join('');
    return '<div class="legend-head"><span>' + esc(ind.label) + '</span><span class="legend-unit">' + esc(ind.unit) + '</span></div>'
      + '<div class="legend-bar"><i style="background:linear-gradient(90deg,' + grad + ')"></i>'
      + '<div class="legend-ticks">' + ticks + '</div></div>'
      + '<p class="legend-nodata"><i style="background:' + GPM.PALETTE.noData + '"></i><span>暂无数据</span>'
      + '<em>' + esc(ind.sourceShort || '世界银行 WDI') + ' 未收录</em></p>';
  }

  GPM.renderMapView = function (mount) {
    var D = window.__GPM_DATA__;
    var all = Object.keys(D.countries).map(function (k) { return D.countries[k]; });
    var sorted = all.slice().sort(function (a, b) { return a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN'); });

    var ind = GPM.indicator(GPM.state.get()) || GPM.INDICATORS[0];

    /* 当前指标下每个国家的前后对照，切指标时重建一次，避免反复 filter */
    var cache = {};
    var cacheKey = null;

    function ensureCache() {
      if (cacheKey === ind.key) return;
      cacheKey = ind.key;
      cache = {};
      Object.keys(D.countries).forEach(function (k) {
        var mm = GPM.metricOf(k, ind.key);
        if (mm) cache[k] = mm;
      });
    }

    function withData() {
      return Object.keys(cache).map(function (k) { return D.countries[k]; });
    }

    function thresholdText(v) {
      return v + (ind.unitShort === '%' || ind.unitShort === '‰' ? ind.unitShort : ' ' + ind.unitShort);
    }

    function rowHTML(c) {
      var mm = cache[c.iso2];
      if (!mm) {
        return '<button class="row" data-iso2="' + c.iso2 + '">'
          + '<span class="row-name">' + esc(c.nameZh) + '</span>'
          + '<span class="row-val muted">暂无数据</span></button>';
      }
      var better = GPM.isBetter(ind, mm.delta);
      var cls = better === true ? 'is-good' : better === false ? 'is-bad' : 'is-flat';
      return '<button class="row" data-iso2="' + c.iso2 + '">'
        + '<span class="row-name">' + esc(c.nameZh) + '</span>'
        + '<span class="row-val">' + U.fmt(mm.last.value, 1) + '</span>'
        + '<span class="row-delta ' + cls + '">' + U.pctText(mm.deltaPct) + '</span>'
        + '</button>';
    }

    /* mode='best'：改善幅度最大（按「好」的方向算绝对变化）；mode='now'：最新值最高 */
    function rankHTML(list, mode) {
      if (!list.length) return '<p class="empty-line">暂无</p>';
      return '<ol class="rank">' + list.map(function (c) {
        var mm = cache[c.iso2];
        var right = mode === 'best'
          ? U.fmt(mm.base.value, 0) + ' → ' + U.fmt(mm.last.value, 1)
          : U.fmt(mm.last.value, 1);
        var sub = mode === 'best' ? U.pctText(mm.deltaPct) : (mm.base.year + ' 年 ' + U.fmt(mm.base.value, 0));
        return '<li><button class="rank-item" data-iso2="' + c.iso2 + '">'
          + '<span class="rank-name">' + esc(c.nameZh) + '</span>'
          + '<span class="rank-num">' + right + '<em>' + sub + '</em></span>'
          + '</button></li>';
      }).join('') + '</ol>';
    }

    function topLists() {
      var rows = withData();
      var best = rows.map(function (c) {
        var mm = cache[c.iso2];
        var gain = ind.betterWhen === 'down' ? -mm.delta : mm.delta;
        return { c: c, gain: gain };
      }).filter(function (o) { return o.gain > 0; })
        .sort(function (a, b) { return b.gain - a.gain; })
        .slice(0, 5)
        .map(function (o) { return o.c; });
      var now = rows.slice().sort(function (a, b) {
        return cache[b.iso2].last.value - cache[a.iso2].last.value;
      }).slice(0, 5);
      return { best: best, now: now };
    }

    ensureCache();
    var lists = topLists();

    var pillsHTML = GPM.INDICATORS.map(function (m) {
      return '<button class="ind-pill' + (m.key === ind.key ? ' is-on' : '') + '" type="button"'
        + ' role="tab" aria-selected="' + (m.key === ind.key ? 'true' : 'false') + '"'
        + ' data-key="' + m.key + '">' + esc(m.short) + '</button>';
    }).join('');

    var yOrder = (GPM.bubble && GPM.bubble.Y_ORDER) || ['lifeExp'];
    var ySwitchHTML = '<span class="bub-y-k">Y 轴</span>' + yOrder.map(function (key) {
      var mm = GPM.indicator(key);
      var on = key === 'lifeExp';
      return '<button class="bub-y-btn' + (on ? ' is-on' : '') + '" type="button" role="tab"'
        + ' aria-selected="' + (on ? 'true' : 'false') + '" data-y="' + key + '">'
        + esc(mm ? mm.short : key) + '</button>';
    }).join('');

    mount.innerHTML = ''
      + '<section class="view view-map">'
      /* 顶部细长横幅：极度贫困只有全球口径，放这里不挡地球 */
      + '  <aside class="macro-bar reveal" style="--d:0ms" id="macroBar" aria-label="全球宏观数据">'
      + '    <span class="macro-bar-k">[ 全球宏观数据 // GLOBAL MACRO ]</span>'
      + '    <p class="macro-line">极度贫困人口比例：<b>1990 年 38%</b><i>→</i><b>2024 年 10%</b></p>'
      + '    <span class="macro-note">[ 注：国家层面仅有抽样年份数据，故不在地球展示 ]</span>'
      + '  </aside>'
      + '  <header class="hero hero--center">'
      + '    <p class="eyebrow reveal" style="--d:0ms">1990 — 2024 · 逐年回放</p>'
      + '    <h1 class="reveal" style="--d:60ms">全球进步地图</h1>'
      + '    <p class="lede reveal" id="ledeBox" style="--d:120ms">' + ledeHTML(ind) + '</p>'
      + '  </header>'
      + '  <div class="ind-bar reveal" style="--d:150ms">'
      + '    <span class="ind-bar-k">指标</span>'
      + '    <div class="ind-bar-list" role="tablist" aria-label="切换地图指标" id="indBar">' + pillsHTML + '</div>'
      + '  </div>'
      + '  <section class="globe-block">'
      + '    <div class="globe-zone" id="globeZone">'
      + hudCard('a', 180, 'kMedK', '各国中位数', 'kMed', '1990 → 2024')
      + hudCard('b', 260, 'kHighK', '高值国家', 'kHigh', '')
      + hudCard('c', 220, 'kLowK', '低值国家', 'kLow', '')
      + '      <div class="globe-stage" id="globeStage">'
      + '        <canvas id="globeCanvas" class="globe-canvas reveal" style="--d:200ms" aria-label="可旋转的世界地图，颜色表示各国所选指标的数值"></canvas>'
      + '        <div class="globe-year" id="globeYear"><b>1990</b><em>年</em></div>'
      + '        <div class="globe-tip" id="globeTip" hidden></div>'
      + '      </div>'
      + '      <p class="zone-hint" id="globeHint">拖动旋转<br>点击国家看详情</p>'
      + '      <button class="bub-open" id="bubOpen" type="button" aria-haspopup="dialog">'
      + '        [ 展开全球宏观气泡图 ]</button>'
      + '    </div>'
      + '    <div class="timebar reveal" style="--d:300ms">'
      + '      <button class="play-btn" id="playBtn" type="button" aria-label="播放或暂停时间轴" aria-pressed="false">'
      + '        <svg class="pb-icon pb-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '          <path d="M9 5.5 18 12 9 18.5Z"/>'
      + '        </svg>'
      + '        <svg class="pb-icon pb-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'
      + '          <path d="M9.5 5.5v13M14.5 5.5v13"/>'
      + '        </svg>'
      + '      </button>'
      + '      <div class="timebar-main">'
      + '        <div class="year-track">'
      + '          <div class="year-ruler" aria-hidden="true">' + rulerHTML() + '</div>'
      + '          <input id="yearRange" class="year-range" type="range" min="' + YEAR_START + '" max="' + YEAR_END + '" step="0.1" value="' + YEAR_END + '" aria-label="年份">'
      + '        </div>'
      + '        <div class="year-ticks"><span style="left:0.0%">1990</span><span style="left:29.41%">2000</span><span style="left:58.82%">2010</span><span style="left:100.0%">2024</span></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="legend reveal" style="--d:400ms" id="legendBox">' + legendHTML(ind) + '</div>'
      + '  </section>'
      + '  <div class="grid-2">'
      + '    <section class="panel reveal" style="--d:460ms">'
      + '      <div class="panel-head"><h2>找一个国家</h2><span class="panel-count" id="countData">' + withData().length + ' 个有数据</span></div>'
      + '      <input id="countrySearch" class="search" type="search" placeholder="搜索国家名 / 英文名 / 代码" autocomplete="off" aria-label="搜索国家">'
      + '      <div class="country-list" id="countryList">' + sorted.map(rowHTML).join('') + '</div>'
      + '    </section>'
      + '    <section class="panel reveal" style="--d:520ms">'
      + '      <div class="panel-head"><h2>改善最多</h2><span class="panel-count">1990 → 最新</span></div>'
      + '      <div id="rankBest">' + rankHTML(lists.best, 'best') + '</div>'
      + '      <div class="panel-head panel-head-sub"><h2>仍然最高</h2><span class="panel-count">最新年份</span></div>'
      + '      <div id="rankNow">' + rankHTML(lists.now, 'now') + '</div>'
      + '    </section>'
      + '  </div>'
      /* ================= 全球宏观气泡图：全屏弹层 ================= */
      + '  <div class="bub-modal" id="bubModal" hidden>'
      + '    <div class="bub-modal-bg" id="bubBackdrop"></div>'
      + '    <section class="bub-panel" role="dialog" aria-modal="true" aria-labelledby="bubTitle">'
      + '      <header class="bub-panel-head">'
      + '        <p class="st-hud-title"><i aria-hidden="true">[</i><span id="bubTitle">全球宏观气泡图</span>'
      + '          <i aria-hidden="true">]</i></p>'
      + '        <p class="bub-sub" id="bubSub">横轴人均 GDP（对数）· 气泡面积 = 人口 · 颜色 = 地区</p>'
      + '        <div class="bub-y-switch" id="bubYSwitch" role="tablist" aria-label="切换纵轴指标">'
      + ySwitchHTML + '</div>'
      + '        <button class="bub-close" id="bubClose" type="button" aria-label="关闭气泡图">[ X ]</button>'
      + '      </header>'
      + '      <div class="bub-root" id="bubRoot"></div>'
      + '    </section>'
      + '  </div>'
      + '</section>';

    /* ---------- 入场：逐元素 6px 上浮 + 2px 模糊消解 ---------- */
    var reduces = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduces) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          Array.prototype.forEach.call(mount.querySelectorAll('.reveal'), function (el) {
            el.classList.add('in');
          });
        });
      });
    } else {
      Array.prototype.forEach.call(mount.querySelectorAll('.reveal'), function (el) {
        el.classList.add('in');
      });
    }

    /* ---------- 列表与搜索 ---------- */
    function onListClick(e) {
      var btn = e.target.closest('[data-iso2]');
      if (!btn) return;
      location.hash = '#/c/' + btn.getAttribute('data-iso2');
    }
    mount.addEventListener('click', onListClick);

    var search = mount.querySelector('#countrySearch');
    var listBox = mount.querySelector('#countryList');

    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      var rows = listBox.querySelectorAll('.row');
      var visible = 0;
      Array.prototype.forEach.call(rows, function (row) {
        var c = D.countries[row.getAttribute('data-iso2')];
        var hay = (c.nameZh + ' ' + (c.nameEn || '') + ' ' + c.iso2 + ' ' + (c.iso3 || '')).toLowerCase();
        var show = !q || hay.indexOf(q) !== -1;
        row.hidden = !show;
        if (show) visible++;
      });
      listBox.classList.toggle('is-empty', visible === 0);
    }
    search.addEventListener('input', applyFilter);

    /* ---------- 时间轴状态机 ---------- */
    var canvas = mount.querySelector('#globeCanvas');
    var stage = mount.querySelector('#globeStage');
    var yearEl = mount.querySelector('#globeYear b');
    var tip = mount.querySelector('#globeTip');
    var range = mount.querySelector('#yearRange');
    var playBtn = mount.querySelector('#playBtn');
    var kMed = mount.querySelector('#kMed');
    var kHigh = mount.querySelector('#kHigh');
    var kLow = mount.querySelector('#kLow');
    var kMedU = mount.querySelector('#kMedU');
    var kHighU = mount.querySelector('#kHighU');
    var kLowU = mount.querySelector('#kLowU');
    var kHighK = mount.querySelector('#kHighK');
    var kLowK = mount.querySelector('#kLowK');
    var ledeBox = mount.querySelector('#ledeBox');

    /* 三块 HUD 的单位绑定就这一处：中位数用指标单位，两种计数固定「个」。
       以前是把 .hud-card em 一次性刷成 ind.unitShort，才出现「24 岁个国家」。 */
    function syncUnits() {
      if (kMedU) kMedU.textContent = ind.unitShort;
      if (kHighU) kHighU.textContent = '个';
      if (kLowU) kLowU.textContent = '个';
    }

    var year = YEAR_END;
    var playing = !reduces;
    var phase = 'play';         // play | hold | reset
    var phaseT = 0;
    var playFrom = YEAR_START;  // 续播起点，暂停后从当前年份继续
    var lastShownYear = -1;
    var rafId = 0;
    var last = 0;
    var visible = true;

    function currentValue(iso2) {
      var s = GPM.seriesOf(iso2, ind.key);
      if (!s || !s.length) return null;
      return U.valueAt(s, year);
    }

    var globe = GPM.globe.create(canvas, {
      year: year,
      getValue: currentValue,
      getColor: function (v) { return U.rampColor(v, ind.thresholds, ind.betterWhen === 'up'); },
      onHover: function (iso2, x, y) {
        if (!iso2) { tip.hidden = true; return; }
        var c = D.countries[iso2];
        var s = GPM.seriesOf(iso2, ind.key);
        var v = currentValue(iso2);
        var base = s ? U.valueAt(s, YEAR_START) : null;
        var nowY = Math.round(year);
        var deltaTxt = '';
        if (v !== null && base !== null && base > 0) {
          var diff = v - base;
          var better = GPM.isBetter(ind, diff);
          var cls = better === true ? 'is-good' : better === false ? 'is-bad' : 'is-flat';
          deltaTxt = '<div class="tip-delta ' + cls + '">'
            + (diff <= 0 ? '较 1990 下降 ' : '较 1990 上升 ')
            + Math.abs((diff / base) * 100).toFixed(1) + '%</div>';
        }
        tip.innerHTML = '<div class="tip-name">' + esc(c.nameZh) + '</div>'
          + (v === null
            ? '<div class="tip-none">暂无数据</div>'
            : '<div class="tip-val">' + U.fmt(v, 1) + '<span class="tip-unit">' + esc(ind.unit) + '</span></div>'
              + '<div class="tip-meta">' + nowY + ' 年</div>' + deltaTxt);
        tip.hidden = false;
        var w = tip.offsetWidth, h = tip.offsetHeight;
        var sx = x + 16, sy = y - h - 12;
        if (sx + w > stage.clientWidth - 8) sx = x - w - 16;
        if (sy < 8) sy = y + 18;
        tip.style.transform = 'translate(' + Math.max(8, sx) + 'px,' + Math.max(8, sy) + 'px)';
      },
      onClick: function (iso2) { location.hash = '#/c/' + iso2; }
    });

    /* ---------- 全球宏观气泡图：全屏弹层（不跳页） ----------
       点开才创建，关掉立刻销毁：既不用一进首页就算 192×34 的气泡，
       也让每次打开都按当前窗口重新量尺寸。 */
    var modal = mount.querySelector('#bubModal');
    var bubRoot = mount.querySelector('#bubRoot');
    var bubTitle = mount.querySelector('#bubTitle');
    var ySwitch = mount.querySelector('#bubYSwitch');
    var bubOpenBtn = mount.querySelector('#bubOpen');
    var bubView = null;
    var bubY = 'lifeExp';
    var bubCloseTimer = null;

    function bubTitleText(key) {
      var meta = GPM.bubble && GPM.bubble.Y_META && GPM.bubble.Y_META[key];
      return '全球各国：收入与' + (meta ? meta.short : '预期寿命') + '的变迁';
    }

    function openBubble() {
      if (!modal || !GPM.bubble) return;
      if (!modal.hidden) return;
      clearTimeout(bubCloseTimer);
      bubTitle.textContent = bubTitleText(bubY);
      modal.hidden = false;
      document.body.classList.add('bub-modal-open');
      globe.setPaused(true);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          modal.classList.add('is-on');
          if (!bubView) bubView = GPM.bubble.create(bubRoot, { yKey: bubY });
          if (bubView) bubView.play();
        });
      });
    }

    function closeBubble(focusBack) {
      if (!modal || modal.hidden) return;
      modal.classList.remove('is-on');
      document.body.classList.remove('bub-modal-open');
      if (bubView) { bubView.stop(); bubView.destroy(); bubView = null; }
      clearTimeout(bubCloseTimer);
      bubCloseTimer = setTimeout(function () {
        if (modal && !modal.classList.contains('is-on')) modal.hidden = true;
      }, 240);
      globe.setPaused(document.hidden || !visible);
      if (focusBack && bubOpenBtn) {
        try { bubOpenBtn.focus({ preventScroll: true }); } catch (e) { bubOpenBtn.focus(); }
      }
    }

    if (bubOpenBtn) bubOpenBtn.addEventListener('click', openBubble);
    var bubCloseBtn = mount.querySelector('#bubClose');
    if (bubCloseBtn) bubCloseBtn.addEventListener('click', function () { closeBubble(true); });
    var bubBackdrop = mount.querySelector('#bubBackdrop');
    if (bubBackdrop) bubBackdrop.addEventListener('click', function () { closeBubble(true); });

    if (ySwitch) {
      ySwitch.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.bub-y-btn') : null;
        if (!btn) return;
        var key = btn.getAttribute('data-y');
        if (!key || key === bubY) return;
        bubY = key;
        Array.prototype.forEach.call(ySwitch.querySelectorAll('.bub-y-btn'), function (b) {
          var on = b.getAttribute('data-y') === key;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        bubTitle.textContent = bubTitleText(key);
        if (bubView) bubView.setYKey(key);
      });
    }

    function onModalKey(e) {
      if (e.key === 'Escape' && modal && !modal.hidden) {
        e.preventDefault();
        closeBubble(true);
      }
    }
    document.addEventListener('keydown', onModalKey);

    /* ---------- KPI：只在整数年变化 / 换指标时重算 ---------- */
    var hiCut = ind.thresholds[4];
    var loCut = ind.thresholds[2];

    function updateStats(y) {
      var vals = [];
      var high = 0, low = 0;
      Object.keys(D.countries).forEach(function (k) {
        var v = (function () {
          var s = GPM.seriesOf(k, ind.key);
          return s && s.length ? U.valueAt(s, y) : null;
        })();
        if (v === null) return;
        vals.push(v);
        if (v > hiCut) high++;
        if (v < loCut) low++;
      });
      vals.sort(function (a, b) { return a - b; });
      var med = vals.length ? (vals[Math.floor(vals.length / 2)] + vals[Math.ceil((vals.length - 1) / 2)]) / 2 : null;
      kMed.textContent = med === null ? '—' : U.fmt(med, 1);
      kHigh.textContent = String(high);
      kLow.textContent = String(low);
    }

    function renderTime(y) {
      year = y;
      range.value = String(y);
      // 滑块左侧轨道亮起（::-webkit-slider-runnable-track 用 var(--fill) 取色）
      range.style.setProperty('--fill',
        (((y - YEAR_START) / (YEAR_END - YEAR_START)) * 100).toFixed(2) + '%');
      var shown = Math.round(y);
      if (shown !== lastShownYear) {
        lastShownYear = shown;
        yearEl.textContent = String(shown);
        updateStats(shown);
      }
      globe.setYear(y);
    }

    function setPlaying(on) {
      playing = on;
      playBtn.classList.toggle('is-playing', on);
      playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) return;
      last = 0;
      phaseT = 0;
      if (year >= YEAR_END) {
        // 已经在终点：淡出后从 1990 重播
        stage.classList.add('is-reset');
        renderTime(YEAR_START);
        phase = 'reset';
      } else {
        phase = 'play';
        playFrom = year;
      }
    }

    playBtn.addEventListener('click', function () { setPlaying(!playing); });

    range.addEventListener('input', function () {
      playing = false;
      playBtn.classList.remove('is-playing');
      phase = 'play';
      stage.classList.remove('is-reset');
      renderTime(parseFloat(range.value));
    });

    function onKey(e) {
      if (e.code !== 'Space' || e.target === range || /input|textarea/i.test(e.target.tagName)) return;
      if (!document.body.contains(canvas)) return;
      if (document.body.classList.contains('calib-open') || document.body.classList.contains('boot-open')) return;
      if (document.body.classList.contains('bub-modal-open')) return;
      e.preventDefault();
      setPlaying(!playing);
    }
    document.addEventListener('keydown', onKey);

    /* ---------- 换指标：地图着色、图例、榜单、列表、KPI 一起换 ---------- */
    function applyIndicator(key) {
      ind = GPM.indicator(key);
      ensureCache();
      lists = topLists();
      hiCut = ind.thresholds[4];
      loCut = ind.thresholds[2];

      var bar = mount.querySelector('#indBar');
      if (bar) {
        Array.prototype.forEach.call(bar.querySelectorAll('.ind-pill'), function (btn) {
          var on = btn.getAttribute('data-key') === ind.key;
          btn.classList.toggle('is-on', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
      /* 导语整段重写：负向指标说「越深越危险」，正向指标说「越亮代表程度越高」 */
      if (ledeBox) ledeBox.innerHTML = ledeHTML(ind);
      mount.querySelector('#legendBox').innerHTML = legendHTML(ind);
      kHighK.textContent = '高于 ' + thresholdText(hiCut) + '的国家';
      kLowK.textContent = '低于 ' + thresholdText(loCut) + '的国家';
      syncUnits();
      listBox.innerHTML = sorted.map(rowHTML).join('');
      mount.querySelector('#countData').textContent = withData().length + ' 个有数据';
      mount.querySelector('#rankBest').innerHTML = rankHTML(lists.best, 'best');
      mount.querySelector('#rankNow').innerHTML = rankHTML(lists.now, 'now');
      applyFilter();
      lastShownYear = -1;
      renderTime(year);
      globe.setYear(year);      // 标记重绘，颜色换成新指标
    }

    mount.querySelector('#indBar').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.ind-pill') : null;
      if (!btn) return;
      GPM.state.set(btn.getAttribute('data-key'));
    });

    var offState = GPM.state.subscribe(function (key) {
      if (GPM.indicator(key) && key !== ind.key) applyIndicator(key);
    });

    /* 初始化 HUD 文案与单位（首屏静态标签是泛化的） */
    kHighK.textContent = '高于 ' + thresholdText(hiCut) + '的国家';
    kLowK.textContent = '低于 ' + thresholdText(loCut) + '的国家';
    syncUnits();

    /* ---------- 主循环 ---------- */
    function tick(t) {
      rafId = requestAnimationFrame(tick);
      if (!last) { last = t; return; }
      var dt = Math.min(80, t - last);
      last = t;
      if (!playing || !visible) return;

      phaseT += dt;
      if (phase === 'play') {
        var next = playFrom + (phaseT / PLAY_MS_PER_YEAR);
        if (next >= YEAR_END) {
          renderTime(YEAR_END);
          phase = 'hold';
          phaseT = 0;
        } else {
          renderTime(next);
        }
      } else if (phase === 'hold') {
        if (phaseT >= HOLD_MS) {
          phase = 'reset';
          phaseT = 0;
          stage.classList.add('is-reset');
          renderTime(YEAR_START);
        }
      } else if (phase === 'reset') {
        if (phaseT >= RESET_MS) {
          stage.classList.remove('is-reset');
          phase = 'play';
          playFrom = year;
          phaseT = 0;
        }
      }
    }

    /* ---------- 离开视口 / 切后台就停 ---------- */
    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          globe.setPaused(!visible || document.hidden);
        });
      }, { threshold: 0.12 });
      io.observe(stage);
    }
    function onVis() { globe.setPaused(document.hidden || !visible); }
    document.addEventListener('visibilitychange', onVis);

    renderTime(reduces ? YEAR_END : YEAR_START);
    rafId = requestAnimationFrame(tick);

    return function cleanup() {
      cancelAnimationFrame(rafId);
      if (io) io.disconnect();
      offState();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onModalKey);
      clearTimeout(bubCloseTimer);
      if (bubView) { bubView.destroy(); bubView = null; }
      document.body.classList.remove('bub-modal-open');
      mount.removeEventListener('click', onListClick);
      globe.destroy();
      mount.innerHTML = '';
    };
  };
})();
