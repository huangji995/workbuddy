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

  function hudCard(mod, delay, labelId, label, valueId, note) {
    return '<aside class="hud-card hud-card--' + mod + ' reveal" style="--d:' + delay + 'ms">'
      + '<span class="hud-card-k" id="' + labelId + '">' + label + '</span>'
      + '<span class="hud-card-v"><b id="' + valueId + '">—</b><em>—</em></span>'
      + (note ? '<span class="hud-card-note">' + note + '</span>' : '')
      + '</aside>';
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
      + '<em>世界银行 WDI 未收录</em></p>';
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

    mount.innerHTML = ''
      + '<section class="view view-map">'
      + '  <header class="hero hero--center">'
      + '    <p class="eyebrow reveal" style="--d:0ms">1990 — 2024 · 逐年回放</p>'
      + '    <h1 class="reveal" style="--d:60ms">全球进步地图</h1>'
      + '    <p class="lede reveal" style="--d:120ms">颜色代表各国 <b id="ledeInd">' + esc(ind.label) + '</b>，'
      + '      <strong>越烫越危险</strong>。地球会自己转动，时间往回放，你能看到整颗星球一点点烧红；'
      + '      往前走，红色一点点褪去——点一个国家，看它走了多远。</p>'
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
    var kHighK = mount.querySelector('#kHighK');
    var kLowK = mount.querySelector('#kLowK');
    var ledeInd = mount.querySelector('#ledeInd');

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
      if (ledeInd) ledeInd.textContent = ind.label;
      mount.querySelector('#legendBox').innerHTML = legendHTML(ind);
      kHighK.textContent = '高于 ' + thresholdText(hiCut) + '的国家';
      kLowK.textContent = '低于 ' + thresholdText(loCut) + '的国家';
      Array.prototype.forEach.call(mount.querySelectorAll('.hud-card em'), function (el) {
        el.textContent = ind.unitShort;
      });
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
    Array.prototype.forEach.call(mount.querySelectorAll('.hud-card em'), function (el) {
      el.textContent = ind.unitShort;
    });

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
      mount.removeEventListener('click', onListClick);
      globe.destroy();
      mount.innerHTML = '';
    };
  };
})();
