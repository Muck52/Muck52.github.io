import { Cat, LEG_IDS } from './cat.js';
import { drawCat, drawJointLabels, COATS } from './render.js';
import { GAITS } from './motion.js';
import { clamp, damp } from './math.js';

const $ = (s) => document.querySelector(s);
const scene = $('#scene');
const ctx = scene.getContext('2d');
const chart = $('#gaitchart');
const cctx = chart.getContext('2d');

const cat = new Cat();
const ui = {
  skin: true, skeleton: false, labels: false, prints: true, grid: true,
  coat: 'tabby', timeScale: 1, paused: false, stepOnce: false,
};
const view = { camX: 0, camY: 0, scale: 5, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
/** Screen y of the ground line (the camera rises to follow jumps). */
const groundY = () => view.oy + view.camY * view.scale;
const prints = []; // {x, id}
cat.onFootfall = (e) => {
  prints.push(e);
  if (prints.length > 160) prints.shift();
};

// ------------------------------------------------------------------ layout
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [scene, chart]) {
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  view.dpr = dpr;
  view.w = scene.width;
  view.h = scene.height;
  // show ~150 cm of world across (≈90 cm on phones), but never smaller than 2.4 px/cm
  const span = view.w / dpr < 600 ? 90 : 150;
  view.scale = Math.max(view.w / span, 2.4 * dpr);
  view.scale = Math.min(view.scale, (view.h * 0.62) / 60);
  view.oy = view.h * 0.78;
}
window.addEventListener('resize', resize);

const toScreen = (p) => ({ x: (p.x - view.camX) * view.scale + view.w / 2, y: groundY() - p.y * view.scale });
const toWorld = (sx, sy) => ({ x: (sx - view.w / 2) / view.scale + view.camX, y: (groundY() - sy) / view.scale });

// ------------------------------------------------------------------ pointer = look target
let pointer = null;
function setPointer(ev) {
  const r = scene.getBoundingClientRect();
  const sx = (ev.clientX - r.left) * view.dpr, sy = (ev.clientY - r.top) * view.dpr;
  pointer = toWorld(sx, sy);
  pointer.y = Math.max(pointer.y, 0.5);
}
scene.addEventListener('pointermove', setPointer);
scene.addEventListener('pointerdown', (ev) => {
  setPointer(ev);
});
scene.addEventListener('pointerleave', (ev) => {
  if (ev.pointerType === 'mouse') pointer = null;
});

// ------------------------------------------------------------------ controls
const speed = $('#speed');
const speedOut = $('#speedOut');
function setSpeed(cm) {
  speed.value = cm;
  speedOut.textContent = (cm / 100).toFixed(2) + ' m/s';
  cat.setSpeed(cm);
}
speed.addEventListener('input', () => setSpeed(+speed.value));

function markActive(btn) {
  document.querySelectorAll('[data-mode],[data-speed]').forEach((b) => b.classList.toggle('on', b === btn));
}
document.querySelectorAll('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if (m === 'stalk') {
      cat.setMode('stalk');
      setSpeed(18);
      cat.mode = 'stalk';
    } else {
      setSpeed(0);
      cat.setMode(m);
    }
    markActive(b);
  }),
);
document.querySelectorAll('[data-speed]').forEach((b) =>
  b.addEventListener('click', () => {
    cat.mode = 'move';
    setSpeed(+b.dataset.speed);
    markActive(b);
  }),
);
$('#pounce').addEventListener('click', () => {
  setSpeed(0);
  cat.pounce(pointer && pointer.x > cat.rig.head.nose.x + 30 ? pointer.x : null);
  markActive(null);
});
$('#jump').addEventListener('click', () => {
  setSpeed(0);
  cat.jump(+$('#jumpH').value);
  markActive(null);
});
$('#gaitMode').addEventListener('change', (e) => (cat.gaitMode = e.target.value));
for (const k of ['skin', 'skeleton', 'labels', 'prints', 'grid']) {
  const el = $('#v-' + k);
  el.checked = ui[k];
  el.addEventListener('change', () => (ui[k] = el.checked));
}
const coatSel = $('#coat');
for (const [k, c] of Object.entries(COATS)) coatSel.add(new Option(c.name, k));
coatSel.addEventListener('change', () => (ui.coat = coatSel.value));
$('#timeScale').addEventListener('change', (e) => (ui.timeScale = +e.target.value));
$('#pause').addEventListener('click', togglePause);
$('#step').addEventListener('click', () => {
  ui.paused = true;
  ui.stepOnce = true;
  $('#pause').textContent = 'Play';
});
function togglePause() {
  ui.paused = !ui.paused;
  $('#pause').textContent = ui.paused ? 'Play' : 'Pause';
}
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.key === '.') { ui.paused = true; ui.stepOnce = true; }
});

// ------------------------------------------------------------------ drawing
function drawBackdrop() {
  const { w, h, scale: s } = view;
  const gy = groundY();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const gf = clamp(gy / h, 0, 1);
  g.addColorStop(0, '#1d2420');
  g.addColorStop(gf, '#2a322d');
  g.addColorStop(gf, '#363d36');
  g.addColorStop(1, '#232823');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const x0 = toWorld(0, 0).x, x1 = toWorld(w, 0).x;
  if (ui.grid) {
    // a measurement backdrop in the spirit of Muybridge's 1887 locomotion plates (10 cm cells)
    ctx.strokeStyle = 'rgba(143,199,154,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(x0 / 10) * 10; x <= x1; x += 10) {
      const sx = Math.round(toScreen({ x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx, gy - 60 * s);
    }
    for (let y = 10; y <= 60; y += 10) {
      const sy = Math.round(gy - y * s) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(143,199,154,0.45)';
    ctx.font = `${10 * view.dpr}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    for (let y = 10; y <= 60; y += 10) ctx.fillText(y + ' cm', 4 * view.dpr, gy - y * s - 3 * view.dpr);
  }
  // ground line + distance ticks
  ctx.strokeStyle = '#8a918b';
  ctx.lineWidth = view.dpr;
  ctx.beginPath();
  ctx.moveTo(0, gy + 0.5);
  ctx.lineTo(w, gy + 0.5);
  for (let x = Math.floor(x0 / 10) * 10; x <= x1; x += 10) {
    const sx = Math.round(toScreen({ x, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, gy);
    ctx.lineTo(sx, gy + (x % 50 === 0 ? 8 : 4) * view.dpr);
  }
  ctx.stroke();
  ctx.fillStyle = '#8a918b';
  ctx.textAlign = 'center';
  for (let x = Math.floor(x0 / 50) * 50; x <= x1; x += 50) {
    ctx.fillText((x / 100).toFixed(1) + ' m', toScreen({ x, y: 0 }).x, gy + 20 * view.dpr);
  }

  // trackway: top-down view of the footprints under the ground line
  if (ui.prints) {
    const band = gy + 30 * view.dpr;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, band - 4 * view.dpr, w, 40 * view.dpr);
    for (const e of prints) {
      const sx = toScreen({ x: e.x, y: 0 }).x;
      if (sx < -20 || sx > w + 20) continue;
      const left = e.id[0] === 'L', hind = e.id[1] === 'H';
      const sy = band + (left ? 8 : 26) * view.dpr;
      const r = (hind ? 2.0 : 2.3) * s * 0.5;
      ctx.fillStyle = hind ? 'rgba(224,112,90,0.8)' : 'rgba(143,199,154,0.85)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 4; k++) {
        const ta = -0.9 + k * 0.6;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(ta) * r * 1.7, sy + Math.sin(ta) * r * 1.5, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(232,226,208,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('L', 4 * view.dpr, band + 11 * view.dpr);
    ctx.fillText('R', 4 * view.dpr, band + 29 * view.dpr);
  }
}

let skinLayer = null;
function drawScene() {
  drawBackdrop();
  const s = view.scale;
  const worldXf = (c) => c.setTransform(s, 0, 0, -s, view.w / 2 - view.camX * s, groundY());

  // contact shadow
  worldXf(ctx);
  const sh = (cat.rig.S.x + cat.rig.W.x) / 2;
  const lift = Math.max(0, cat.lift.x);
  ctx.fillStyle = `rgba(0,0,0,${0.28 / (1 + lift / 25)})`;
  ctx.beginPath();
  ctx.ellipse(sh, 0, 22 + lift * 0.1, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ui.skin && ui.skeleton) {
    // ghost the skin through an offscreen layer so overlaps don't double up
    if (!skinLayer || skinLayer.width !== view.w || skinLayer.height !== view.h) {
      skinLayer = document.createElement('canvas');
      skinLayer.width = view.w;
      skinLayer.height = view.h;
    }
    const lc = skinLayer.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, view.w, view.h);
    worldXf(lc);
    drawCat(lc, cat, { coat: ui.coat, skin: true, skeleton: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.38;
    ctx.drawImage(skinLayer, 0, 0);
    ctx.globalAlpha = 1;
    worldXf(ctx);
    drawCat(ctx, cat, { skin: false, skeleton: true });
  } else {
    drawCat(ctx, cat, { coat: ui.coat, skin: ui.skin, skeleton: ui.skeleton || !ui.skin });
  }

  // look target
  if (pointer) {
    worldXf(ctx);
    ctx.strokeStyle = 'rgba(143,199,154,0.9)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 1.2, 0, Math.PI * 2);
    ctx.moveTo(pointer.x - 2.2, pointer.y);
    ctx.lineTo(pointer.x + 2.2, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 2.2);
    ctx.lineTo(pointer.x, pointer.y + 2.2);
    ctx.stroke();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (ui.labels) {
    ctx.save();
    ctx.scale(view.dpr, view.dpr);
    drawJointLabels(ctx, cat, (p) => {
      const q = toScreen(p);
      return { x: q.x / view.dpr, y: q.y / view.dpr };
    }, cat.jointAngles());
    ctx.restore();
  }
}

// ------------------------------------------------------------------ footfall (Hildebrand) diagram
const ROWS = ['LH', 'LF', 'RF', 'RH'];
const ROW_COL = { LH: '#e0705a', RH: '#e0705a', LF: '#8fc79a', RF: '#8fc79a' };
function drawChart() {
  const W = chart.width, H = chart.height, d = view.dpr;
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.fillStyle = '#141715';
  cctx.fillRect(0, 0, W, H);
  const span = 3; // seconds shown
  const left = 30 * d, right = W - 6 * d, top = 6 * d, rowH = (H - top - 16 * d) / 4;
  const t1 = cat.t, t0 = t1 - span;
  const xOf = (t) => left + ((t - t0) / span) * (right - left);
  cctx.font = `${10 * d}px ui-monospace, Menlo, monospace`;
  cctx.textBaseline = 'middle';
  ROWS.forEach((id, r) => {
    const y = top + r * rowH;
    cctx.fillStyle = '#8a918b';
    cctx.textAlign = 'left';
    cctx.fillText(id, 4 * d, y + rowH / 2);
    cctx.fillStyle = ROW_COL[id];
    let start = null;
    const hist = cat.history;
    for (let i = 0; i < hist.length; i++) {
      const hs = hist[i];
      if (hs.t < t0) continue;
      const on = hs.stance[id];
      if (on && start === null) start = hs.t;
      if ((!on || i === hist.length - 1) && start !== null) {
        cctx.fillRect(xOf(start), y + rowH * 0.18, Math.max(1, xOf(hs.t) - xOf(start)), rowH * 0.64);
        start = null;
      }
    }
  });
  cctx.strokeStyle = 'rgba(138,145,139,0.4)';
  cctx.lineWidth = 1;
  cctx.beginPath();
  for (let t = Math.ceil(t0 * 2) / 2; t <= t1; t += 0.5) {
    const x = Math.round(xOf(t)) + 0.5;
    cctx.moveTo(x, top);
    cctx.lineTo(x, H - 14 * d);
  }
  cctx.stroke();
  cctx.fillStyle = '#8a918b';
  cctx.textAlign = 'right';
  cctx.fillText('now', right, H - 6 * d);
  cctx.textAlign = 'left';
  cctx.fillText(`−${span}s`, left, H - 6 * d);
}

// ------------------------------------------------------------------ read-outs
const out = {
  gait: $('#r-gait'), v: $('#r-v'), fr: $('#r-fr'), lambda: $('#r-lambda'), f: $('#r-f'), beta: $('#r-beta'),
};
const angEls = Object.fromEntries(['hip', 'stifle', 'hock', 'shoulder', 'elbow', 'carpus'].map((k) => [k, $('#a-' + k)]));
const angRange = {};
let readoutT = 0;
function updateReadouts(dt) {
  readoutT -= dt;
  const angles = cat.jointAngles();
  for (const [k, v] of Object.entries(angles)) {
    const r = (angRange[k] ||= { lo: v, hi: v });
    r.lo = Math.min(v, damp(r.lo, v, 0.5, dt));
    r.hi = Math.max(v, damp(r.hi, v, 0.5, dt));
  }
  if (readoutT > 0) return;
  readoutT = 0.12;
  const m = cat.metrics;
  const name = cat.action ? cat.action.type + ' · ' + cat.action.stage : cat.gaitActive ? GAITS[cat.gait].label : cat.airborne ? 'airborne' : cat.mode;
  out.gait.textContent = name;
  out.v.textContent = (m.v / 100).toFixed(2) + ' m/s  (' + (m.v / 46).toFixed(1) + ' BL/s)';
  out.fr.textContent = m.Fr.toFixed(2);
  out.lambda.textContent = cat.gaitActive ? m.lambda.toFixed(1) + ' cm' : '—';
  out.f.textContent = cat.gaitActive ? m.f.toFixed(2) + ' Hz' : '—';
  out.beta.textContent = cat.gaitActive ? m.beta.toFixed(2) : '—';
  for (const [k, el] of Object.entries(angEls)) {
    const r = angRange[k];
    el.textContent = `${angles[k].toFixed(0)}°`;
    el.title = `recent range ${r.lo.toFixed(0)}–${r.hi.toFixed(0)}°`;
    el.nextElementSibling.textContent = `${r.lo.toFixed(0)}–${r.hi.toFixed(0)}°`;
  }
}

// ------------------------------------------------------------------ loop
const FIXED = 1 / 120;
let acc = 0, last = performance.now();
function frame(now) {
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  let simDt = 0;
  if (!ui.paused) {
    acc += real * ui.timeScale;
    while (acc >= FIXED) {
      cat.setLook(pointer);
      cat.update(FIXED);
      acc -= FIXED;
      simDt += FIXED;
    }
  } else if (ui.stepOnce) {
    for (let i = 0; i < 4; i++) cat.update(FIXED);
    simDt = 4 * FIXED;
    ui.stepOnce = false;
  }
  // follow the body exactly; only the look-ahead lead is smoothed (no lag at speed)
  view.lead = damp(view.lead || 0, clamp(cat.metrics.v * 0.05, 0, 18), 2, real);
  const body = (cat.rig.S.x + cat.rig.W.x) / 2;
  view.camX = body + view.lead;
  view.camY = damp(view.camY, Math.max(0, cat.lift.x - 4), 6, real);
  drawScene();
  drawChart();
  if (simDt > 0 || readoutT <= 0) updateReadouts(simDt || 0.016);
  requestAnimationFrame(frame);
}
resize();
view.camX = (cat.rig.S.x + cat.rig.W.x) / 2;
setSpeed(0);
requestAnimationFrame(frame);

// for console tinkering
window.cat = cat;
