/* 首页：3D 自转地球 + 年份回放 + 图例 + 搜索 + 榜单 */
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

  function hudCard(mod, delay, label, id, unit, note) {
    return '<aside class="hud-card hud-card--' + mod + ' reveal" style="--d:' + delay + 'ms">'
      + '<span class="hud-card-k">' + label + '</span>'
      + '<span class="hud-card-v"><b id="' + id + '">—</b><em>' + unit + '</em></span>'
      + (note ? '<span class="hud-card-note">' + note + '</span>' : '')
      + '</aside>';
  }

  function legendHTML(ind) {
    var stops = U.rampStops(ind.thresholds);
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

  function rowHTML(c) {
    var m = c.u5mr;
    if (!m) {
      return '<button class="row" data-iso2="' + c.iso2 + '">'
        + '<span class="row-name">' + esc(c.nameZh) + '</span>'
        + '<span class="row-val muted">暂无数据</span></button>';
    }
    var down = m.deltaPct !== null && m.deltaPct < 0;
    return '<button class="row" data-iso2="' + c.iso2 + '">'
      + '<span class="row-name">' + esc(c.nameZh) + '</span>'
      + '<span class="row-val">' + U.fmt(m.last.value, 1) + '</span>'
      + '<span class="row-delta ' + (down ? 'is-down' : 'is-up') + '">' + U.pctText(m.deltaPct) + '</span>'
      + '</button>';
  }

  function rankHTML(list, mode) {
    if (!list.length) return '<p class="empty-line">暂无</p>';
    return '<ol class="rank">' + list.map(function (c) {
      var m = c.u5mr;
      var right = mode === 'drop'
        ? U.fmt(m.base.value, 0) + ' → ' + U.fmt(m.last.value, 1)
        : U.fmt(m.last.value, 1);
      var sub = mode === 'drop' ? U.pctText(m.deltaPct) : (m.base.year + ' 年 ' + U.fmt(m.base.value, 0));
      return '<li><button class="rank-item" data-iso2="' + c.iso2 + '">'
        + '<span class="rank-name">' + esc(c.nameZh) + '</span>'
        + '<span class="rank-num">' + right + '<em>' + sub + '</em></span>'
        + '</button></li>';
    }).join('') + '</ol>';
  }

  GPM.renderMapView = function (mount) {
    var D = window.__GPM_DATA__;
    var ind = D.indicators.u5mr;
    var list = Object.keys(D.countries).map(function (k) { return D.countries[k]; });

    var withData = list.filter(function (c) { return c.u5mr; });
    var ranked = withData.slice().sort(function (a, b) { return a.u5mr.delta - b.u5mr.delta; });
    var topDrop = ranked.filter(function (c) { return c.u5mr.base.value >= 20; }).slice(0, 5);
    var topNow = withData.slice().sort(function (a, b) { return b.u5mr.last.value - a.u5mr.last.value; }).slice(0, 5);
    var sorted = list.slice().sort(function (a, b) { return a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN'); });

    mount.innerHTML = ''
      + '<section class="view view-map">'
      + '  <header class="hero hero--center">'
      + '    <p class="eyebrow reveal" style="--d:0ms">1990 — 2024 · 逐年回放</p>'
      + '    <h1 class="reveal" style="--d:60ms">全球进步地图</h1>'
      + '    <p class="lede reveal" style="--d:120ms">颜色代表各国 5 岁以下儿童死亡率，<strong>越烫越危险</strong>。'
      + '      地球会自己转动，时间往回放，你能看到整颗星球一点点烧红；往前走，红色一点点褪去——点一个国家，看它走了多远。</p>'
      + '  </header>'
      + '  <section class="globe-block">'
      + '    <div class="globe-zone" id="globeZone">'
      + hudCard('a', 180, '各国中位数', 'kMed', '‰', '1990 → 2024')
      + hudCard('b', 260, '高于 50‰ 的国家', 'kHigh', '个', '')
      + hudCard('c', 220, '低于 10‰ 的国家', 'kLow', '个', '')
      + '      <div class="globe-stage" id="globeStage">'
      + '        <canvas id="globeCanvas" class="globe-canvas reveal" style="--d:200ms" aria-label="可旋转的世界地图，颜色表示各国 5 岁以下儿童死亡率"></canvas>'
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
      + '    <div class="legend reveal" style="--d:400ms">' + legendHTML(ind) + '</div>'
      + '  </section>'
      + '  <div class="grid-2">'
      + '    <section class="panel reveal" style="--d:460ms">'
      + '      <div class="panel-head"><h2>找一个国家</h2><span class="panel-count">' + withData.length + ' 个有数据</span></div>'
      + '      <input id="countrySearch" class="search" type="search" placeholder="搜索国家名 / 英文名 / 代码" autocomplete="off" aria-label="搜索国家">'
      + '      <div class="country-list" id="countryList">' + sorted.map(rowHTML).join('') + '</div>'
      + '    </section>'
      + '    <section class="panel reveal" style="--d:520ms">'
      + '      <div class="panel-head"><h2>下降最多</h2><span class="panel-count">1990 → 最新</span></div>'
      + rankHTML(topDrop, 'drop')
      + '      <div class="panel-head panel-head-sub"><h2>仍然最高</h2><span class="panel-count">最新年份</span></div>'
      + rankHTML(topNow, 'now')
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
    var rows = Array.prototype.slice.call(listBox.querySelectorAll('.row'));
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var visible = 0;
      rows.forEach(function (row) {
        var c = D.countries[row.getAttribute('data-iso2')];
        var hay = (c.nameZh + ' ' + (c.nameEn || '') + ' ' + c.iso2 + ' ' + (c.iso3 || '')).toLowerCase();
        var show = !q || hay.indexOf(q) !== -1;
        row.hidden = !show;
        if (show) visible++;
      });
      listBox.classList.toggle('is-empty', visible === 0);
    });

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
      var c = D.countries[iso2];
      if (!c || !c.u5mr) return null;
      return U.valueAt(c.u5mr.series, year);
    }

    var globe = GPM.globe.create(canvas, {
      year: year,
      getValue: currentValue,
      getColor: function (v) { return U.rampColor(v, ind.thresholds); },
      onHover: function (iso2, x, y) {
        if (!iso2) { tip.hidden = true; return; }
        var c = D.countries[iso2];
        var v = currentValue(iso2);
        var base = c.u5mr ? U.valueAt(c.u5mr.series, YEAR_START) : null;
        var nowY = Math.round(year);
        var deltaTxt = (v !== null && base !== null && base > 0)
          ? '<div class="tip-delta ' + (v <= base ? 'is-down' : 'is-up') + '">'
            + (v <= base ? '较 1990 下降 ' : '较 1990 上升 ')
            + Math.abs((v - base) / base * 100).toFixed(1) + '%</div>'
          : '';
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

    /* ---------- KPI：只在整数年变化时重算 ---------- */
    function updateStats(y) {
      var vals = [];
      var high = 0, low = 0;
      Object.keys(D.countries).forEach(function (k) {
        var c = D.countries[k];
        if (!c.u5mr) return;
        var v = U.valueAt(c.u5mr.series, y);
        if (v === null) return;
        vals.push(v);
        if (v > 50) high++;
        if (v < 10) low++;
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

    document.addEventListener('keydown', onKey);
    function onKey(e) {
      if (e.code !== 'Space' || e.target === range || /input|textarea/i.test(e.target.tagName)) return;
      if (!document.body.contains(canvas)) return;
      e.preventDefault();
      setPlaying(!playing);
    }

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
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      mount.removeEventListener('click', onListClick);
      globe.destroy();
      mount.innerHTML = '';
    };
  };
})();
