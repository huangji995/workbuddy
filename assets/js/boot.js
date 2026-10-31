/* 开场启动日志：深空底上逐行打字，最后一行交代灵感与数据来源。
   只跑一次（sessionStorage），点击 / 任意按键 / 滚轮可跳过；
   测试题会等这份日志播完再弹，避免两层遮罩打架。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  var KEY = 'gpm.boot.done';
  var CHAR_MS = 11;
  var LINE_GAP = 62;
  var LEAD_IN = 180;
  var FADE_MS = 420;

  var LINES = [
    { t: '[ GPM // GLOBAL PROGRESS RADAR ]', cls: 'boot-hd' },
    { t: '> load world_bank_snapshot ....... ok', cls: '' },
    { t: '> index 245 countries / 34 years .. ok', cls: '' },
    { t: '> init globe + timeline .......... ready', cls: '' },
    { t: '[ 灵感与数据来源：汉斯·罗斯林《事实》 ]', cls: 'boot-src' },
    { t: '> enter', cls: 'boot-enter' }
  ];

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var node = null;
  var log = null;
  var caret = null;
  var done = false;
  var active = false;
  var skipped = false;
  var waiters = [];
  var timers = [];

  function stored() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function store() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* 隐私模式忽略 */ }
  }
  function forced() {
    return /(?:^|[?&])test=1(?:&|$)/.test(location.search);
  }

  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function onKeySkip(e) {
    if (e.key === 'Tab') return;   // 键盘用户先能用 Tab 找到跳过的位置
    skip();
  }
  function onWheelSkip() { skip(); }

  function finish() {
    if (done) return;
    done = true;
    clearTimers();
    document.body.classList.remove('boot-open');
    window.removeEventListener('keydown', onKeySkip, true);
    window.removeEventListener('wheel', onWheelSkip);
    var dying = node;
    node = null;
    if (dying) {
      dying.classList.add('is-out');
      setTimeout(function () {
        if (dying.parentNode) dying.parentNode.removeChild(dying);
      }, reduced ? 0 : FADE_MS);
    }
    waiters.splice(0).forEach(function (fn) {
      try { fn(); } catch (e) { /* 单个回调出错不影响其他 */ }
    });
  }

  function skip() {
    if (done || skipped || !node) return;
    skipped = true;
    var rows = log.querySelectorAll('.boot-line');
    if (rows.length < LINES.length) {
      clearTimers();
      for (var k = rows.length; k < LINES.length; k++) {
        var p = document.createElement('p');
        p.className = 'boot-line ' + LINES[k].cls;
        p.textContent = LINES[k].t;
        log.insertBefore(p, caret);
      }
      later(finish, 220);
    } else {
      finish();
    }
  }

  /* 打字：逐字改 textContent */
  function typeLine(el, text, cb) {
    if (reduced || skipped) {
      el.textContent = text;
      cb();
      return;
    }
    var i = 0;
    (function step() {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { later(cb, LINE_GAP); return; }
      later(step, CHAR_MS);
    })();
  }

  function run() {
    var i = 0;
    (function next() {
      if (i >= LINES.length) { later(finish, reduced ? 320 : 460); return; }
      var spec = LINES[i++];
      var row = document.createElement('p');
      row.className = 'boot-line ' + spec.cls;
      log.insertBefore(row, caret);
      typeLine(row, spec.t, next);
    })();
  }

  function setup() {
    if (!document.body) return;
    node = document.createElement('div');
    node.className = 'boot';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = '<div class="boot-log" aria-label="启动日志">'
      + '<span class="boot-caret" aria-hidden="true"></span></div>';
    document.body.appendChild(node);
    document.body.classList.add('boot-open');
    active = true;

    log = node.querySelector('.boot-log');
    caret = node.querySelector('.boot-caret');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.add('is-in'); });
    });

    node.addEventListener('click', skip);
    window.addEventListener('keydown', onKeySkip, true);
    window.addEventListener('wheel', onWheelSkip, { passive: true });

    later(run, LEAD_IN);
    store();
  }

  GPM.boot = {
    /** 覆盖层是否还在流程中（决定测试题要不要等） */
    isActive: function () { return active && !done; },
    /** 启动日志结束后执行；已经结束则立刻执行 */
    onDone: function (fn) {
      if (done) { fn(); return; }
      waiters.push(fn);
    },
    skip: function () { skip(); }
  };

  if (forced()) {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  if (stored()) {
    done = true;
    active = false;
  } else {
    active = true;
    setup();
  }
})();
