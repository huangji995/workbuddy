/* 国家详情：起点 vs 现在对比卡 + 两张共用时间轴的趋势图 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});
  var U = GPM.util;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function yearLabel(m) {
    return m.base.year === 1990 ? '1990' : m.base.year + '（1990 无数据）';
  }

  function cardHTML(c, key, ind) {
    var m = c[key];
    if (!m) {
      return '<article class="cmp-card is-empty">'
        + '<div class="cmp-head"><h2>' + ind.label + '</h2><span class="cmp-unit">' + ind.unit + '</span></div>'
        + '<p class="cmp-none">暂无数据</p>'
        + '<p class="cmp-foot">世界银行 WDI 未收录该地区的此项指标。</p>'
        + '</article>';
    }
    var better = ind.betterWhen === 'down' ? m.delta < 0 : m.delta > 0;
    var dir = m.delta < 0 ? '↓' : m.delta > 0 ? '↑' : '→';
    var absDelta = Math.abs(m.delta);
    var deltaText = ind.betterWhen === 'down'
      ? (m.delta < 0 ? '减少 ' : '增加 ') + U.fmt(absDelta, 1)
      : (m.delta > 0 ? '增加 ' : '减少 ') + U.fmt(absDelta, 1);
    var extra = ind.betterWhen === 'down' ? '（越少越好）' : '（越多越好）';

    return '<article class="cmp-card">'
      + '<div class="cmp-head"><h2>' + ind.label + '</h2><span class="cmp-unit">' + ind.unit + '</span></div>'
      + '<div class="cmp-body">'
      + '  <div class="cmp-point"><span class="cmp-year">' + esc(yearLabel(m)) + '</span>'
      + '    <span class="cmp-value">' + U.fmt(m.base.value, ind.decimals) + '</span>'
      + '    <span class="cmp-tag">起点</span></div>'
      + '  <div class="cmp-arrow" aria-hidden="true">→</div>'
      + '  <div class="cmp-point is-now"><span class="cmp-year">' + m.last.year + '</span>'
      + '    <span class="cmp-value">' + U.fmt(m.last.value, ind.decimals) + '</span>'
      + '    <span class="cmp-tag">最近</span></div>'
      + '</div>'
      + '<p class="cmp-foot"><span class="cmp-delta ' + (better ? 'is-good' : 'is-bad') + '">'
      + dir + ' ' + deltaText + ' ' + extra + '</span>'
      + '<span class="cmp-pct">' + (m.deltaPct === null ? '' : U.pctText(m.deltaPct)) + '</span></p>'
      + '</article>';
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

  function trendBlock(c, key, ind) {
    var head = '<div class="trend-head"><h2>' + ind.label + '</h2><span>' + ind.unit + '</span></div>';
    if (!c[key]) {
      return head + '<p class="trend-empty">暂无数据：世界银行 WDI 未收录该指标，所以这里没有趋势线。</p>';
    }
    return head + '<div class="chart" id="chart-' + key + '"></div>';
  }

  function tableHTML(c, ind) {
    var a = c.u5mr ? c.u5mr.series : [];
    var b = c.lifeExp ? c.lifeExp.series : [];
    var map = {};
    a.forEach(function (p) { (map[p[0]] = map[p[0]] || {})[ind[0]] = p[1]; });
    b.forEach(function (p) { (map[p[0]] = map[p[0]] || {})[ind[1]] = p[1]; });
    var years = Object.keys(map).map(Number).sort(function (x, y) { return x - y; });
    var rows = years.filter(function (y) { return y % 5 === 0 || y === years[years.length - 1]; })
      .map(function (y) {
        var r = map[y];
        return '<tr><td>' + y + '</td><td>' + (r.u5mr === undefined ? '—' : U.fmt(r.u5mr, 1)) + '</td>'
          + '<td>' + (r.lifeExp === undefined ? '—' : U.fmt(r.lifeExp, 1)) + '</td></tr>';
      }).join('');
    return '<details class="data-table"><summary>以数据表查看（每 5 年）</summary>'
      + '<table><thead><tr><th>年份</th><th>5岁以下儿童死亡率</th><th>出生时预期寿命</th></tr></thead>'
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

    var hasAny = !!(c.u5mr || c.lifeExp);
    var meta = [c.nameEn, c.region].filter(Boolean).join(' · ');

    var noticeHTML = hasAny ? '' :
      '<div class="notice"><strong>这个地区没有可展示的数据。</strong>'
      + '<p>世界银行 WDI 未收录' + esc(c.nameZh) + '的 5 岁以下儿童死亡率与出生时预期寿命，'
      + '所以这里不做任何估算或填充，地图上也保持中性灰。</p>'
      + '<p class="notice-more">本页共收录 ' + D.meta.countriesTotal + ' 个国家与地区，'
      + '其中 ' + D.meta.countriesWithData + ' 个有儿童死亡率数据。'
      + '<a class="notice-link" href="#/">回到地图选一个 →</a></p></div>';

    mount.innerHTML = ''
      + '<section class="view view-country">'
      + '  <a class="back" href="#/">← 返回地图</a>'
      + '  <header class="country-head">'
      + '    <h1>' + esc(c.nameZh) + '</h1>'
      + '    <p class="country-meta">' + esc(meta) + '</p>'
      + '  </header>'
      + noticeHTML
      + (hasAny ? '<div class="cmp-grid">' + cardHTML(c, 'u5mr', indU) + cardHTML(c, 'lifeExp', indL) + '</div>' : '')
      + (hasAny ? '<section class="trend">'
        + trendBlock(c, 'u5mr', indU)
        + trendBlock(c, 'lifeExp', indL)
        + '<p class="chart-note">两张图共用同一条时间轴，纵向可直接对齐比较。缺失年份处折线断开，不做插值。</p>'
        + (hasAny ? tableHTML(c, ['u5mr', 'lifeExp']) : '')
        + '</section>' : '')
      + '  <footer class="view-foot">数据：World Bank WDI'
      + footCodes(c) + ' · 快照日期 ' + D.meta.generatedAt + '</footer>'
      + '</section>';

    function drawCharts() {
      var years = [];
      [c.u5mr, c.lifeExp].forEach(function (m) {
        if (m) years.push(m.series[0][0], m.series[m.series.length - 1][0]);
      });
      if (!years.length) return;
      var yearDomain = [Math.min.apply(null, years), Math.max.apply(null, years)];

      var blocks = [
        { key: 'u5mr', el: mount.querySelector('#chart-u5mr'), color: '#8A3A12', ind: indU },
        { key: 'lifeExp', el: mount.querySelector('#chart-lifeExp'), color: '#1F6F8B', ind: indL }
      ].filter(function (b) { return b.el && c[b.key]; });

      blocks.forEach(function (b, i) {
        var isLast = i === blocks.length - 1; // 只有最下面那张画年份刻度
        GPM.chart.render(b.el, {
          series: c[b.key].series,
          color: b.color,
          unit: b.ind.unit,
          yearDomain: yearDomain,
          yDomain: domainFor(c[b.key].series, b.key),
          showXAxis: isLast,
          baseYear: 1990,
          valueFormat: function (v) { return U.fmt(v, 1); },
          yFormat: function (v) { return String(Math.round(v)); },
          ariaLabel: c.nameZh + ' ' + b.ind.label + '趋势，' + yearDomain[0] + ' 至 ' + yearDomain[1] + ' 年'
        });
      });
    }

    drawCharts();
    window.addEventListener('resize', drawCharts);

    return function cleanup() {
      window.removeEventListener('resize', drawCharts);
      mount.innerHTML = '';
    };
  };
})();
