/* =========================================================
   Portfolio v4 — vanilla JS, no dependencies
   ========================================================= */
(function () {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ---- Year ---- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---- THEME TOGGLE (light default, remembers choice) ---- */
  const themeToggle = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  themeToggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  /* ---- Nav: scrolled state + progress + mobile toggle ---- */
  const nav = document.getElementById('nav');
  const navLinks = document.getElementById('nav-links');
  const navToggle = document.getElementById('nav-toggle');
  const progress = document.getElementById('scroll-progress');
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 40);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.addEventListener('click', (e) => { if (e.target.tagName === 'A') navLinks.classList.remove('open'); });

  /* ---- Reveal on scroll ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in'), (i % 4) * 70);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else { revealEls.forEach((el) => el.classList.add('in')); }

  /* ---- Metric counters ---- */
  const metricsWrap = document.getElementById('metrics');
  let counted = false;
  function runCounters() {
    if (counted) return; counted = true;
    document.querySelectorAll('.metric__num').forEach((el) => {
      const target = parseFloat(el.dataset.target), suffix = el.dataset.suffix || '', dur = 1600, start = performance.now();
      (function step(now) {
        const p = Math.min((now - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * e) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    });
  }
  if ('IntersectionObserver' in window && metricsWrap) {
    const mo = new IntersectionObserver((es) => { if (es[0].isIntersecting) { runCounters(); mo.disconnect(); } }, { threshold: 0.4 });
    mo.observe(metricsWrap);
  } else { runCounters(); }

  /* ---- Active nav link ---- */
  const linkMap = {};
  document.querySelectorAll('.nav__links a').forEach((a) => linkMap[a.getAttribute('href')] = a);
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver((es) => {
      es.forEach((e) => {
        const link = linkMap['#' + e.target.id];
        if (link && e.isIntersecting) {
          Object.values(linkMap).forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('main section[id]').forEach((s) => so.observe(s));
  }

  /* =======================================================
     SIGNATURE ANIMATION — data flows, a node breaks,
     the engineer travels to it and fixes it.
     ======================================================= */
  const canvas = document.getElementById('pipeline-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const statusWrap = document.getElementById('viz-status');
  const statusText = document.getElementById('viz-status-text');

  // read live theme colors (re-read on theme change)
  let C = {};
  function readColors() {
    const cs = getComputedStyle(root);
    const g = (n) => cs.getPropertyValue(n).trim();
    C = {
      accent: g('--accent'), accent2: g('--accent-2'), amber: g('--accent-3'),
      err: g('--err'), ok: g('--ok'), line: g('--viz-line'),
      surface: g('--surface'), text: g('--text-soft'), mute: g('--text-mute'),
    };
  }
  readColors();
  new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  let W, H, dpr, nodes = [], packets = [], sparks = [];
  const LABELS = ['SRC', 'RAW', 'CLEAN', 'KPI'];
  const SUBS = ['source', 'bronze', 'silver', 'gold'];

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 46, n = LABELS.length;
    const y = H * 0.40;
    nodes = LABELS.map((label, i) => ({
      x: pad + (W - pad * 2) * (i / (n - 1)),
      y, r: 22, label, sub: SUBS[i],
      state: 'ok',            // ok | error | fixing
      shake: 0, fixT: 0,
    }));
    // engineer starts parked at bottom-left "ops" home
    eng.homeX = pad - 8; eng.homeY = H - 30;
    if (!eng.placed) { eng.x = eng.homeX; eng.y = eng.homeY; eng.placed = true; }
  }

  // engineer "fixer" agent
  const eng = { x: 0, y: 0, homeX: 0, homeY: 0, target: null, mode: 'idle', placed: false, bob: 0 };

  function spawnPacket() {
    packets.push({ seg: 0, t: 0, speed: 0.006 + Math.random() * 0.004, hue: Math.random() < 0.5 ? C.accent : C.accent2, size: 3 + Math.random() * 1.5 });
  }

  // periodic "issue" generator
  let nextBreak = 220;       // frames until first break
  function maybeBreak() {
    if (eng.mode !== 'idle') return;
    if (nextBreak-- > 0) return;
    const candidates = nodes.filter((n, i) => i > 0 && n.state === 'ok'); // never break SRC
    if (!candidates.length) { nextBreak = 120; return; }
    const node = candidates[Math.floor(Math.random() * candidates.length)];
    node.state = 'error'; node.shake = 1;
    setStatus('error', 'issue @ ' + node.sub);
    // dispatch engineer
    eng.target = node; eng.mode = 'travel';
    nextBreak = 9999; // suppress new breaks until resolved
  }

  function setStatus(state, text) {
    statusWrap.setAttribute('data-state', state);
    statusText.textContent = text;
  }

  function makeSparks(x, y, color) {
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 2.2;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }

  function nodeColor(n) {
    if (n.state === 'error') return C.err;
    if (n.state === 'fixing') return C.amber;
    return n.sub === 'gold' ? '#e0b341' : n.sub === 'silver' ? '#9aa6b8' : n.sub === 'bronze' ? '#cd7f32' : C.accent;
  }

  function update() {
    maybeBreak();

    // spawn packets steadily (slower while broken — backpressure)
    const broken = nodes.some((n) => n.state !== 'ok');
    if (!reduceMotion && Math.random() < (broken ? 0.012 : 0.06)) spawnPacket();

    // packets travel; stop before a broken node (queue up)
    for (let p = packets.length - 1; p >= 0; p--) {
      const pk = packets[p];
      const nextNode = nodes[pk.seg + 1];
      if (nextNode && nextNode.state !== 'ok') {
        // pile up just before broken node
        pk.t = Math.min(pk.t + pk.speed * 0.3, 0.82);
      } else {
        pk.t += pk.speed;
      }
      if (pk.t >= 1) { pk.seg++; pk.t = 0; if (pk.seg >= nodes.length - 1) packets.splice(p, 1); }
    }

    // node shake decay + fixing progress
    nodes.forEach((n) => {
      if (n.shake > 0) n.shake *= 0.9;
      if (n.state === 'fixing') {
        n.fixT += 0.02;
        if (n.fixT >= 1) { n.state = 'ok'; n.fixT = 0; }
      }
    });

    // engineer behaviour
    eng.bob += 0.1;
    if (eng.mode === 'travel' && eng.target) {
      const tx = eng.target.x, ty = eng.target.y + eng.target.r + 18;
      eng.x += (tx - eng.x) * 0.07; eng.y += (ty - eng.y) * 0.07;
      if (Math.hypot(tx - eng.x, ty - eng.y) < 2.5) {
        eng.mode = 'fix'; eng.fixFrames = 46;
        makeSparks(eng.target.x, eng.target.y, C.amber);
        eng.target.state = 'fixing'; eng.target.fixT = 0;
        setStatus('fixing', 'fixing ' + eng.target.sub + '…');
      }
    } else if (eng.mode === 'fix') {
      if (eng.fixFrames-- % 12 === 0) makeSparks(eng.target.x, eng.target.y, C.amber);
      if (eng.fixFrames <= 0) {
        makeSparks(eng.target.x, eng.target.y, C.ok);
        eng.mode = 'return'; eng.target = null;
        setStatus('ok', 'streaming');
        nextBreak = 200 + Math.floor(Math.random() * 240);
      }
    } else if (eng.mode === 'return') {
      eng.x += (eng.homeX - eng.x) * 0.06; eng.y += (eng.homeY - eng.y) * 0.06;
      if (Math.hypot(eng.homeX - eng.x, eng.homeY - eng.y) < 2) eng.mode = 'idle';
    }

    // sparks
    for (let s = sparks.length - 1; s >= 0; s--) {
      const sk = sparks[s];
      sk.x += sk.vx; sk.y += sk.vy; sk.vy += 0.04; sk.life -= 0.03;
      if (sk.life <= 0) sparks.splice(s, 1);
    }
  }

  function posOnSeg(seg, t) {
    const a = nodes[seg], b = nodes[seg + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // edges
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const downstreamBroken = b.state !== 'ok';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = downstreamBroken ? C.err : C.line;
      ctx.lineWidth = 2;
      if (downstreamBroken) ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
      ctx.globalAlpha = downstreamBroken ? 0.7 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }

    // packets
    packets.forEach((pk) => {
      const pos = posOnSeg(pk.seg, pk.t);
      ctx.beginPath();
      ctx.fillStyle = pk.hue;
      ctx.shadowBlur = 8; ctx.shadowColor = pk.hue;
      ctx.roundRect(pos.x - pk.size, pos.y - pk.size, pk.size * 2, pk.size * 2, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // nodes
    nodes.forEach((n) => {
      const col = nodeColor(n);
      const ox = n.shake > 0.02 ? (Math.random() - 0.5) * 6 * n.shake : 0;
      const x = n.x + ox;

      // error halo
      if (n.state === 'error') {
        ctx.beginPath();
        ctx.arc(x, n.y, n.r + 6 + Math.sin(eng.bob * 2) * 2, 0, Math.PI * 2);
        ctx.fillStyle = hexA(C.err, 0.16); ctx.fill();
      }
      if (n.state === 'fixing') {
        ctx.beginPath();
        ctx.arc(x, n.y, n.r + 8, 0, Math.PI * 2 * n.fixT);
        ctx.strokeStyle = C.ok; ctx.lineWidth = 3; ctx.stroke();
      }

      // node circle
      ctx.beginPath();
      ctx.arc(x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = C.surface; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();

      // label
      ctx.fillStyle = col;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.label, x, n.y);

      // sub label
      ctx.fillStyle = C.mute;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(n.sub, x, n.y + n.r + 14);

      // status glyph
      if (n.state === 'error') { ctx.fillStyle = C.err; ctx.font = '700 13px Inter, sans-serif'; ctx.fillText('!', x, n.y - n.r - 11); }
    });

    // sparks
    sparks.forEach((sk) => {
      ctx.globalAlpha = Math.max(sk.life, 0);
      ctx.beginPath(); ctx.fillStyle = sk.color;
      ctx.arc(sk.x, sk.y, 2.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // engineer
    drawEngineer();
  }

  function drawEngineer() {
    const bob = eng.mode === 'idle' ? Math.sin(eng.bob) * 1.5 : 0;
    const x = eng.x, y = eng.y + bob;
    const active = eng.mode === 'travel' || eng.mode === 'fix';

    // connecting "tether" line while working
    if (eng.mode === 'fix' && eng.target) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(eng.target.x, eng.target.y);
      ctx.strokeStyle = hexA(C.amber, 0.5); ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // body chip
    ctx.beginPath();
    ctx.fillStyle = active ? C.amber : C.accent;
    ctx.shadowBlur = active ? 14 : 6; ctx.shadowColor = active ? C.amber : C.accent;
    ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // wrench glyph
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Inter", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔧', x, y + 0.5);

    // "DE" tag underneath when idle/home
    if (eng.mode === 'idle') {
      ctx.fillStyle = C.mute; ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('on-call', x, y + 22);
    }
  }

  function hexA(hex, a) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // roundRect polyfill (older browsers)
  if (!ctx.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      this.beginPath(); this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
    };
  }

  layout();
  window.addEventListener('resize', layout);

  // seed a few packets
  for (let i = 0; i < 4; i++) packets.push({ seg: i % 3, t: Math.random(), speed: 0.006, hue: C.accent, size: 3.5 });

  let running = true;
  // pause when offscreen to save cycles
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
  }

  if (reduceMotion) {
    // static frame: draw once, no motion
    update(); draw();
  } else {
    (function loop() {
      if (running) { update(); draw(); }
      requestAnimationFrame(loop);
    })();
  }
})();
