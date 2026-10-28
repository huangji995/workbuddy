/* 3D 自转地球：d3.geoOrthographic + Canvas 2D
   无瓦片、无纹理图、无网络请求；所有国界来自本地 data/geo.js。 */
(function () {
  'use strict';
  var GPM = (window.GPM = window.GPM || {});

  var OCEAN = '#E9EDEA';
  var BORDER = 'rgba(255,255,255,0.62)';
  var DEG = 180 / Math.PI;

  GPM.globe = {
    create: function (canvas, opts) {
      var d3 = window.d3;
      var ctx = canvas.getContext('2d');
      var geo = window.__GPM_GEO__;
      if (!d3 || !geo) throw new Error('缺少 d3 或地理数据');

      // GeoJSON + 每个国家的「包围圆」，用于背面剔除和命中测试的快速筛选
      var items = geo.features.map(function (f) {
        var feature = { type: 'Feature', properties: { iso2: f.iso2 }, geometry: f.geom };
        var c = d3.geoCentroid(feature);
        var r = 0;
        eachPoint(f.geom.coordinates, function (p) {
          var d = d3.geoDistance(c, p);
          if (d > r) r = d;
        });
        return { iso2: f.iso2, feature: feature, c: c, r: r };
      });

      var proj = d3.geoOrthographic().precision(0.4);
      var path = d3.geoPath(proj, ctx);
      var graticule = d3.geoGraticule10();
      var sphere = { type: 'Sphere' };

      var W = 0, H = 0, R = 0;
      var rot = [-100, -16, 0];      // 初始视角：东亚居中
      var vel = 0, spinning = true, paused = false, dragging = false;
      var dirty = true, raf = 0, lastT = 0;
      var hovered = null;
      var year = opts.year || 2024;
      var reveal = 1;
      var SPIN = 4.2;                // 度/秒，一圈约 86 秒：慢到不打扰阅读

      function eachPoint(coords, fn) {
        if (typeof coords[0] === 'number') { fn(coords); return; }
        for (var i = 0; i < coords.length; i++) eachPoint(coords[i], fn);
      }

      function resize() {
        var rect = canvas.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        W = Math.round(rect.width);
        H = Math.round(rect.height);
        if (!W || !H) return;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        R = Math.min(W, H) / 2 - 6;
        proj.translate([W / 2, H / 2]).scale(R);
        dirty = true;
      }

      function center() {
        return [-rot[0], -rot[1]];
      }

      function draw() {
        var cx = W / 2, cy = H / 2;
        proj.rotate(rot);
        ctx.clearRect(0, 0, W, H);

        // 大气光晕（圆外一圈，先画，被球体压住内侧）
        var ag = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.1);
        ag.addColorStop(0, 'rgba(122,150,168,0.20)');
        ag.addColorStop(1, 'rgba(122,150,168,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = ag;
        ctx.fill();

        // 海洋
        ctx.beginPath();
        path(sphere);
        ctx.fillStyle = OCEAN;
        ctx.fill();

        // 经纬网
        ctx.beginPath();
        path(graticule);
        ctx.strokeStyle = 'rgba(120,132,138,0.16)';
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // 国家：背面剔除 → 逐个填充
        var c0 = center();
        var limit = reveal < 1 ? reveal : 2;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (d3.geoDistance(it.c, c0) > Math.PI / 2 + it.r) continue;
          if (limit < 2 && lonProgress(it.c[0]) > limit) continue;
          ctx.beginPath();
          path(it.feature);
          ctx.fillStyle = opts.getColor(opts.getValue(it.iso2));
          ctx.fill();
          ctx.strokeStyle = BORDER;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // 球面明暗：左上高光 + 边缘压暗，3D 感主要靠这一层
        ctx.save();
        ctx.beginPath();
        path(sphere);
        ctx.clip();
        var sg = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R * 1.04);
        sg.addColorStop(0, 'rgba(255,255,255,0.30)');
        sg.addColorStop(0.45, 'rgba(255,255,255,0.02)');
        sg.addColorStop(1, 'rgba(45,36,26,0.28)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 地平线
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(45,36,26,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 悬停国家描边（画在最上层，不受明暗影响）
        if (hovered) {
          var h = null;
          for (var k = 0; k < items.length; k++) if (items[k].iso2 === hovered) { h = items[k]; break; }
          if (h) {
            ctx.beginPath();
            path(h.feature);
            ctx.strokeStyle = '#2B2620';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }
      }

      // 经度 → 0..1，用于入场时从西向东依次出现
      function lonProgress(lon) {
        return (((lon + 180) % 360) + 360) % 360 / 360;
      }

      var lastDraw = 0;
      function frame(t) {
        raf = requestAnimationFrame(frame);
        if (paused) { lastT = t; return; }
        var dt = lastT ? Math.min(0.06, (t - lastT) / 1000) : 0;
        lastT = t;
        var moved = false;
        if (spinning && !dragging) {
          rot[0] -= SPIN * dt;
          moved = true;
        }
        if (Math.abs(vel) > 0.02) {
          rot[0] += vel * dt;
          vel *= Math.pow(0.06, dt);
          moved = true;
        }
        if (rot[0] > 180) rot[0] -= 360;
        if (rot[0] < -180) rot[0] += 360;

        // 自转/惯性时把重绘限到约 40fps；拖动、悬停等交互保持全速
        if (!moved || dirty || dragging) {
          draw();
          dirty = false;
          lastDraw = t;
        } else if (t - lastDraw >= 24) {
          draw();
          lastDraw = t;
        }
      }

      // ---- 交互 ----
      var lastX = 0, lastY = 0, lastMoveT = 0, moved = 0;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function pickAt(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var inv = proj.invert([clientX - rect.left, clientY - rect.top]);
        if (!inv || d3.geoDistance(inv, center()) > Math.PI / 2) return null;
        var best = null, bestR = Infinity;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (d3.geoDistance(it.c, inv) > it.r + 0.02) continue;
          if (!d3.geoContains(it.feature, inv)) continue;
          if (it.r < bestR) { best = it.iso2; bestR = it.r; }   // 小国优先，避免被大国抢走
        }
        return best;
      }

      function setHover(iso2, x, y) {
        if (hovered === iso2) {
          if (iso2 && opts.onHover) opts.onHover(iso2, x, y);
          return;
        }
        hovered = iso2;
        dirty = true;
        canvas.style.cursor = iso2 ? 'pointer' : 'grab';
        if (opts.onHover) opts.onHover(iso2, x, y);
      }

      canvas.addEventListener('pointerdown', function (e) {
        dragging = true;
        vel = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        moved = 0;
        lastMoveT = performance.now();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有活动指针 */ }
        canvas.style.cursor = 'grabbing';
      });

      canvas.addEventListener('pointermove', function (e) {
        if (dragging) {
          var dx = e.clientX - lastX;
          var dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          moved += Math.abs(dx) + Math.abs(dy);

          rot[0] += dx * 0.28;
          rot[1] = Math.max(-80, Math.min(80, rot[1] - dy * 0.22));

          var now = performance.now();
          var dt = Math.max(0.016, (now - lastMoveT) / 1000);
          vel = Math.max(-160, Math.min(160, (dx * 0.28) / dt));
          lastMoveT = now;

          dirty = true;
          if (hovered) setHover(null, 0, 0);
          return;
        }
        var iso2 = pickAt(e.clientX, e.clientY);
        var rect = canvas.getBoundingClientRect();
        setHover(iso2, e.clientX - rect.left, e.clientY - rect.top);
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
        if (moved < 6) {
          var iso2 = pickAt(e.clientX, e.clientY);
          if (iso2 && opts.onClick) opts.onClick(iso2);
        }
        dirty = true;
      }
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', function () { dragging = false; });
      canvas.addEventListener('pointerleave', function () { setHover(null, 0, 0); });

      // ---- 入场：从西向东扫过 ----
      function playIntro() {
        if (reduced) { reveal = 1; dirty = true; return; }
        reveal = 0;
        var t0 = performance.now();
        var dur = 1250;
        (function step() {
          var p = Math.min(1, (performance.now() - t0) / dur);
          reveal = 1 - Math.pow(1 - p, 3);
          dirty = true;
          if (p < 1) requestAnimationFrame(step);
        })();
      }

      resize();
      if (window.ResizeObserver) {
        new ResizeObserver(function () { resize(); draw(); }).observe(canvas.parentElement || canvas);
      } else {
        window.addEventListener('resize', resize);
      }

      draw();
      raf = requestAnimationFrame(frame);
      playIntro();

      return {
        setYear: function (y) { year = y; dirty = true; },
        setSpinning: function (v) { spinning = !!v; },
        setPaused: function (v) {
          paused = !!v;
          if (paused) { lastT = 0; } else { dirty = true; }
        },
        setSelected: function (iso2) { hovered = iso2; dirty = true; },
        isReducedMotion: function () { return reduced; },
        resize: function () { resize(); draw(); },
        destroy: function () {
          cancelAnimationFrame(raf);
          paused = true;
        }
      };
    }
  };
})();
