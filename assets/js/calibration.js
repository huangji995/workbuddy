/* 开场直觉测试：全屏 HUD 覆盖层，3 道题全部由 data.js 实时计算得出 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  var SESSION_KEY = 'gpm.calib.done';
  var ADVANCE_MS = 1500;   // 答题反馈停留时间，之后自动进入下一题
  var FADE_MS = 420;
  var OPEN_DELAY = 700;    // 等地球首帧落定，避免盖住一张空白画布

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function median(list) {
    var a = list.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return 0;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  function round5(v) {
    return Math.round(v / 5) * 5;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * 把 [数值, 格式化函数, 是否正确] 转成选项，并保证不出现重复数字。
   * 数值全部由真实数据推导，避免题目与数据脱节。
   */
  function makeOptions(pairs) {
    var used = {};
    return pairs.map(function (p) {
      var n = p[0], guard = 0;
      while (used[n] && guard < 12) { n += 5; guard++; }
      used[n] = true;
      return { text: p[1](n), ok: !!p[2] };
    });
  }

  function buildQuestions() {
    var D = window.__GPM_DATA__;
    var all = Object.keys(D.countries).map(function (k) { return D.countries[k]; });

    var u = all.filter(function (c) {
      return c.u5mr && c.u5mr.base && c.u5mr.last &&
        c.u5mr.deltaPct !== null && c.u5mr.delta !== null &&
        c.u5mr.base.value !== null && c.u5mr.last.value !== null;
    });
    var l = all.filter(function (c) {
      return c.lifeExp && c.lifeExp.base && c.lifeExp.last && c.lifeExp.delta !== null;
    });

    var medPct = median(u.map(function (c) { return Math.abs(c.u5mr.deltaPct); }));
    var fell = u.filter(function (c) { return c.u5mr.delta < 0; }).length;
    var under10 = u.filter(function (c) { return c.u5mr.last.value < 10; }).length;
    var under10Base = u.filter(function (c) { return c.u5mr.base.value < 10; }).length;
    var share = u.length ? under10 / u.length * 100 : 0;
    var shareBase = u.length ? under10Base / u.length * 100 : 0;
    var medYears = median(l.map(function (c) { return c.lifeExp.delta; }));
    var gain15 = l.filter(function (c) { return c.lifeExp.delta > 15; }).length;

    var q1 = Math.round(medPct);
    var q2 = Math.round(share);
    var q3 = Math.round(medYears);

    var pctLabel = function (n) { return '下降约 ' + n + '%'; };
    var yearLabel = function (n) { return '约 ' + n + ' 年'; };
    var shareLabel = function (n) { return '约 ' + n + '%'; };

    return [
      {
        stem: '从 1990 年到最新可得年份，中位数国家的 5 岁以下儿童死亡率变化了多少？',
        hint: '中位数 = 把 ' + u.length + ' 个国家按变化幅度排队，站在正中间的那个。',
        options: shuffle(makeOptions([
          [0, function () { return '基本没变'; }, false],
          [round5(q1 * 0.3), pctLabel, false],
          [q1, pctLabel, true],
          [round5(Math.min(97, q1 * 1.38)), pctLabel, false]
        ])),
        truthLabel: pctLabel(q1),
        verify: '实测：中位数降幅 ' + medPct.toFixed(1) + '%，' +
          u.length + ' 个国家里有 ' + fell + ' 个在下降。'
      },
      {
        stem: '如今，这 ' + u.length + ' 个有数据的国家里，5 岁以下儿童死亡率已低于 10‰ 的约占多少？',
        hint: '10‰ 意味着每 1000 个活产儿里有不到 10 个活不过 5 岁。',
        options: shuffle(makeOptions([
          [Math.round(q2 * 0.25), shareLabel, false],
          [Math.round(q2 * 0.65), shareLabel, false],
          [q2, shareLabel, true],
          [Math.round(Math.min(85, q2 * 1.55)), shareLabel, false]
        ])),
        truthLabel: shareLabel(q2),
        verify: '实测：' + under10 + ' / ' + u.length + ' = ' + share.toFixed(1) +
          '%；1990 年这个比例只有 ' + shareBase.toFixed(1) + '%。'
      },
      {
        stem: '同一时期，中位数国家的出生时预期寿命增加了多少？',
        hint: '口径：各国从 1990 年到各自最新可得年份，取所有国家的中位数。',
        options: shuffle(makeOptions([
          [Math.round(q3 * 0.15), yearLabel, false],
          [Math.round(q3 * 0.5), yearLabel, false],
          [q3, yearLabel, true],
          [Math.round(Math.min(30, q3 * 1.9)), yearLabel, false]
        ])),
        truthLabel: yearLabel(q3),
        verify: '实测：中位数 +' + medYears.toFixed(1) + ' 年，' +
          l.length + ' 个地区里有 ' + gain15 + ' 个增加超过 15 年。'
      }
    ];
  }

  /* ---------------- 覆盖层 ---------------- */

  var node = null;
  var state = null;
  var timer = 0;
  var lastFocus = null;
  var keyCaptureBound = false;

  function lockedGet() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function lockedSet() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* 隐私模式下忽略 */ }
  }
  function lockedClear() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 同上 */ }
  }

  function optionHTML(o, i) {
    return '<button class="calib-opt" type="button" data-i="' + i + '">'
      + '<span class="calib-key">' + String.fromCharCode(65 + i) + '</span>'
      + '<span class="calib-text">' + esc(o.text) + '</span>'
      + '</button>';
  }

  function questionHTML(q, idx) {
    var pct = ((idx + 1) / state.questions.length) * 100;
    return '<p class="calib-step">QUESTION ' + pad2(idx + 1) + ' / ' + pad2(state.questions.length) + '</p>'
      + '<h2 class="calib-stem" id="calibStem">' + esc(q.stem) + '</h2>'
      + '<p class="calib-hint">' + esc(q.hint) + '</p>'
      + '<div class="calib-opts" id="calibOpts">' + q.options.map(optionHTML).join('') + '</div>'
      + '<p class="calib-feedback" id="calibFeedback" role="status" aria-live="polite"></p>'
      + '<div class="calib-progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  }

  function resultHTML() {
    var total = state.questions.length;
    var rows = state.answers.map(function (a, i) {
      var q = state.questions[i];
      var ok = q.options[a].ok;
      return '<li class="calib-recap-row">'
        + '<span class="calib-recap-idx">' + pad2(i + 1) + '</span>'
        + '<span class="calib-recap-mark ' + (ok ? 'yes' : 'no') + '">' + (ok ? '✓' : '✗') + '</span>'
        + '<span class="calib-recap-body">' + (ok
          ? esc(q.truthLabel)
          : '你选 ' + esc(q.options[a].text) + ' · 实为 ' + esc(q.truthLabel))
        + '</span></li>';
    }).join('');

    return '<p class="calib-step">CALIBRATION COMPLETE</p>'
      + '<div class="calib-score"><b>' + state.score + '</b><span>/ ' + total + '</span></div>'
      + '<p class="calib-verdict">你的认知准确度：' + state.score + ' / ' + total + '</p>'
      + '<p class="calib-line">大多数人的直觉比随机瞎猜还差，这个世界比你想象的要好。</p>'
      + '<ul class="calib-recap">' + rows + '</ul>'
      + '<button class="calib-cta" id="calibCta" type="button">[ 进入真实数据 -&gt; ]</button>';
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function paint() {
    var body = node.querySelector('#calibBody');
    if (state.step >= state.questions.length) {
      body.innerHTML = resultHTML();
      var cta = body.querySelector('#calibCta');
      if (cta) {
        cta.addEventListener('click', function () { close(); });
        requestAnimationFrame(function () { cta.focus({ preventScroll: true }); });
      }
      return;
    }
    body.innerHTML = questionHTML(state.questions[state.step], state.step);
    var first = body.querySelector('.calib-opt');
    var stem = body.querySelector('#calibStem');
    if (stem) node.setAttribute('aria-label', stem.textContent);
    if (first) requestAnimationFrame(function () { first.focus({ preventScroll: true }); });
  }

  function onOptionClick(e) {
    var btn = e.target.closest ? e.target.closest('.calib-opt') : null;
    if (!btn || state.locked) return;
    var pick = Number(btn.getAttribute('data-i'));
    var q = state.questions[state.step];
    var opts = node.querySelector('#calibOpts');
    var buttons = opts.querySelectorAll('.calib-opt');
    var correctIndex = -1;

    state.locked = true;
    opts.classList.add('is-locked');
    state.answers[state.step] = pick;

    Array.prototype.forEach.call(buttons, function (b, i) {
      b.setAttribute('aria-disabled', 'true');
      if (q.options[i].ok) {
        correctIndex = i;
        b.classList.add('is-right');
        b.insertAdjacentHTML('beforeend', '<span class="calib-mark" aria-hidden="true">✓</span>');
      }
    });
    if (!q.options[pick].ok) {
      btn.classList.remove('is-right');
      btn.classList.add('is-wrong');
      var mark = btn.querySelector('.calib-mark');
      if (mark) mark.textContent = '✗';
      else btn.insertAdjacentHTML('beforeend', '<span class="calib-mark" aria-hidden="true">✗</span>');
    } else {
      state.score++;
    }

    var fb = node.querySelector('#calibFeedback');
    var verdict = q.options[pick].ok ? '命中。' : '偏了。';
    fb.textContent = '// ' + verdict + ' ' + q.verify;
    fb.classList.add(q.options[pick].ok ? 'is-ok' : 'is-no');

    timer = setTimeout(function () {
      state.step++;
      state.locked = false;
      paint();
    }, ADVANCE_MS);

    // 键盘焦点停在被选中的按钮上，别跳到看不见的地方
    btn.focus({ preventScroll: true });
  }

  function onKeyCapture(e) {
    if (!node) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    // 覆盖层开着时，空格不要穿透到首页的时间轴播放/暂停
    if (e.code === 'Space' && e.target && /^(BUTTON|INPUT)$/.test(e.target.tagName)) {
      e.stopPropagation();
    }
  }

  function open() {
    if (node) return;
    state = {
      questions: buildQuestions(),
      step: 0,
      score: 0,
      answers: [],
      locked: false
    };
    lastFocus = document.activeElement;

    node = document.createElement('div');
    node.className = 'calib';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML = ''
      + '<div class="calib-card" id="calibCard">'
      + '  <span class="calib-corner tl" aria-hidden="true"></span>'
      + '  <span class="calib-corner tr" aria-hidden="true"></span>'
      + '  <span class="calib-corner bl" aria-hidden="true"></span>'
      + '  <span class="calib-corner br" aria-hidden="true"></span>'
      + '  <button class="calib-skip" id="calibSkip" type="button">[ Skip &gt;&gt; ]</button>'
      + '  <div class="calib-top"><span class="calib-dot" aria-hidden="true"></span>'
      + '    <span>[ SYSTEM CALIBRATION // COGNITIVE BIAS CHECK ]</span></div>'
      + '  <div class="calib-body" id="calibBody"></div>'
      + '</div>';

    document.body.appendChild(node);
    document.body.classList.add('calib-open');

    node.querySelector('#calibSkip').addEventListener('click', function () { close(); });
    node.querySelector('#calibBody').addEventListener('click', function (e) {
      if (e.target.closest('#calibCta')) return;   // CTA 自己绑
      onOptionClick(e);
    });

    if (!keyCaptureBound) {
      window.addEventListener('keydown', onKeyCapture, true);
      keyCaptureBound = true;
    }

    paint();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.add('is-in'); });
    });
  }

  function close(immediate) {
    if (!node) return;
    clearTimeout(timer);
    timer = 0;
    var dying = node;
    node = null;
    document.body.classList.remove('calib-open');
    if (keyCaptureBound) {
      window.removeEventListener('keydown', onKeyCapture, true);
      keyCaptureBound = false;
    }
    lockedSet();

    var done = function () {
      if (dying.parentNode) dying.parentNode.removeChild(dying);
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 元素可能已移除 */ }
      }
    };

    if (immediate) {
      done();
      return;
    }
    dying.classList.remove('is-in');
    dying.classList.add('is-closing');
    setTimeout(done, FADE_MS);
  }

  /** 首页渲染后调用：本次会话没做过就弹出来 */
  function maybeOpen() {
    var forced = /(?:^|[?&])test=1(?:&|$)/.test(location.search);
    if (forced) {
      lockedClear();
    } else if (lockedGet()) {
      return;
    }
    setTimeout(function () {
      // 用户可能已经滚开或跳去详情页了
      if (!document.getElementById('globeCanvas') || location.hash.indexOf('#/c/') === 0) return;
      open();
    }, OPEN_DELAY);
  }

  GPM.calibration = {
    open: open,
    close: close,
    maybeOpen: maybeOpen,
    isOpen: function () { return !!node; }
  };
})();
