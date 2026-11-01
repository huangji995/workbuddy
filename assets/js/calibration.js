/* 开场直觉测试：全屏 HUD 覆盖层，题库为《事实》原书 5 题（固定答案，仅打乱选项顺序） */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  var SESSION_KEY = 'gpm.calib.done';
  var ADVANCE_MS = 1900;   // 答题反馈停留时间，之后自动进入下一题
  var FADE_MS = 420;
  var OPEN_DELAY = 700;    // 等地球首帧落定，避免盖住一张空白画布

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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
   * 题库：汉斯·罗斯林《事实》开篇的 5 道直觉题。
   * 只有选项顺序在每次打开时打乱，正确项靠 ok 标记跟随，不写死字母。
   */
  var QUESTION_BANK = [
    {
      stem: '在过去的 20 年里，全世界生活在极度贫困状态下的人口是如何变化的？',
      options: [
        { text: '几乎翻倍' },
        { text: '保持不变' },
        { text: '几乎减半', ok: true }
      ],
      truth: '几乎减半',
      right: '[ 校准成功：你避开了“负面思维本能” ]',
      wrong: '[ 警告：检测到“负面思维本能”干扰，人类往往只关注坏消息 ]',
      /* 贫困只有全球口径，不在图层里，指一下首页左下角的宏观面板 */
      more: '[ 请在地球右侧的宏观数据面板中查看该项真实数据 ]'
    },
    {
      stem: '全世界人口的预期寿命现在是多少岁？',
      options: [
        { text: '50 岁' },
        { text: '60 岁' },
        { text: '70 岁', ok: true }
      ],
      truth: '70 岁',
      right: '[ 校准成功：你掌握了真实的人口健康状况 ]',
      wrong: '[ 警告：人类总是低估全球健康水平的进步 ]'
    },
    {
      stem: '现在全世界有多少一岁儿童接种过疫苗？',
      options: [
        { text: '20%' },
        { text: '50%' },
        { text: '80%', ok: true }
      ],
      truth: '80%',
      right: '[ 校准成功：你看到了全球卫生的普及 ]',
      wrong: '[ 警告：人类往往低估现代医疗的覆盖率 ]'
    },
    {
      stem: '在全世界范围内，30 岁的男人平均接受教育的时间超过 10 年。' +
        '请问 30 岁的女性，平均在学校接受教育的时间是多少年？',
      options: [
        { text: '9 年', ok: true },
        { text: '6 年' },
        { text: '3 年' }
      ],
      truth: '9 年',
      right: '[ 校准成功：你避开了“单一视角本能”，看到了全球性别平等的进步 ]',
      wrong: '[ 警告：检测到“单一视角本能”，全球女性的受教育程度已大幅提升 ]'
    },
    {
      stem: '全世界有多少人能够使用电？',
      options: [
        { text: '20%' },
        { text: '50%' },
        { text: '80%', ok: true }
      ],
      truth: '80%',
      right: '[ 校准成功：你避开了“恐惧本能” ]',
      wrong: '[ 警告：黑暗正在消退，但你的直觉还没跟上 ]'
    }
  ];

  function buildQuestions() {
    return QUESTION_BANK.map(function (q) {
      return {
        stem: q.stem,
        options: shuffle(q.options).map(function (o) {
          return { text: o.text, ok: !!o.ok };
        }),
        truth: q.truth,
        right: q.right,
        wrong: q.wrong,
        more: q.more || ''
      };
    });
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
          ? esc(q.truth)
          : '你选 ' + esc(q.options[a].text) + ' · 实为 ' + esc(q.truth))
        + '</span></li>';
    }).join('');

    return '<p class="calib-step">CALIBRATION COMPLETE</p>'
      + '<div class="calib-score"><b>' + state.score + '</b><span>/ ' + total + '</span></div>'
      + '<p class="calib-verdict">你的认知准确度：' + state.score + ' / ' + total + '</p>'
      + '<ul class="calib-recap">' + rows + '</ul>'
      + '<p class="calib-invite">这个世界，比你想象的要好。来看看真实的数据。</p>'
      + '<button class="calib-cta" id="calibCta" type="button">[ 进入真实数据地球 -&gt; ]</button>';
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
    var okPick = q.options[pick].ok;
    fb.innerHTML = esc(okPick ? q.right : q.wrong)
      + (q.more ? '<span class="calib-feedback-more">' + esc(q.more) + '</span>' : '');
    fb.classList.add(okPick ? 'is-ok' : 'is-no');

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
    var self = node;
    requestAnimationFrame(function () {
      /* 双 rAF 落地前可能已经被 close() 掉（快速切路由），别对 null 操作 */
      requestAnimationFrame(function () { if (node === self) self.classList.add('is-in'); });
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

  /** 首页渲染后调用：本次会话没做过就弹出来（启动日志还在播就等它播完） */
  function maybeOpen() {
    var forced = /(?:^|[?&])test=1(?:&|$)/.test(location.search);
    if (forced) {
      lockedClear();
    } else if (lockedGet()) {
      return;
    }
    function arm() {
      setTimeout(function () {
        // 用户可能已经滚开或跳去详情页了
        if (!document.getElementById('globeCanvas') || location.hash.indexOf('#/c/') === 0) return;
        if (document.body.classList.contains('boot-open')) return;
        open();
      }, OPEN_DELAY);
    }
    if (GPM.boot && GPM.boot.isActive()) GPM.boot.onDone(arm);
    else arm();
  }

  GPM.calibration = {
    open: open,
    close: close,
    maybeOpen: maybeOpen,
    isOpen: function () { return !!node; }
  };
})();
