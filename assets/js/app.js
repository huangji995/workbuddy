/* 路由与启动 */
(function () {
  'use strict';
  var GPM = window.GPM;
  var mount = document.getElementById('app');
  var cleanup = null;
  var mapScrollY = 0;
  var lastWasMap = true;

  function parse(hash) {
    var h = (hash || '').replace(/^#/, '');
    var m = h.match(/^\/c\/([A-Za-z]{2})$/);
    if (m) return { view: 'country', iso2: m[1].toUpperCase() };
    return { view: 'map' };
  }

  function render() {
    var r = parse(location.hash);
    document.body.dataset.view = r.view;

    // 必须在 cleanup 之前记录：清空地图会让页面变矮，浏览器会把 scrollY 归零
    if (lastWasMap && r.view === 'country') mapScrollY = window.scrollY || 0;

    // 离开首页时收起开场测试层，避免它悬在详情页上
    if (r.view !== 'map' && GPM.calibration && GPM.calibration.isOpen()) {
      GPM.calibration.close(true);
    }

    if (typeof cleanup === 'function') cleanup();
    cleanup = null;

    if (r.view === 'country') {
      cleanup = GPM.renderCountryView(mount, r.iso2);
      window.scrollTo(0, 0);
      lastWasMap = false;
    } else {
      cleanup = GPM.renderMapView(mount);
      requestAnimationFrame(function () { window.scrollTo(0, mapScrollY); });
      lastWasMap = true;
      if (GPM.calibration) GPM.calibration.maybeOpen();
    }
    document.title = r.view === 'country'
      ? (countryName(r.iso2) + ' · 循此苦旅，终抵群星')
      : '循此苦旅，终抵群星 · 《事实》全球进步数据可视化';
  }

  function countryName(iso2) {
    var c = window.__GPM_DATA__.countries[iso2];
    return c ? c.nameZh : '未找到';
  }

  window.addEventListener('hashchange', render);

  if (!window.__GPM_DATA__) {
    mount.innerHTML = '<div class="notice">数据文件未加载（data/data.js）。请确认文件完整。</div>';
    return;
  }

  render();
})();
