// Model validation: runs the cat headlessly and measures it against what the study claims.
// Usage: node tests/check.mjs   (from the cat/ folder, or `npm run check`)
import { Cat, LEG_IDS } from '../js/cat.js';
import { POSTURES } from '../js/motion.js';
import { wrap01 } from '../js/math.js';
import { measureGait, SWEEP_SPEEDS } from '../js/measure.js';

const DT = 1 / 120;
let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
}
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

function run(cat, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    cat.update(DT);
    if (each) each(cat, i);
  }
}

function isStance(L) {
  return L.mode === 'planted' || (L.mode === 'gait' && L.state === 'stance');
}

// ---------------------------------------------------------------- static postures
for (const mode of ['stand', 'sit', 'crouch', 'stretch']) {
  const cat = new Cat();
  cat.setMode(mode);
  run(cat, 5);
  const errs = LEG_IDS.map((id) => cat.rig.legs[id].error);
  const maxErr = Math.max(...errs);
  const hock = cat.rig.legs.LH.points[2];
  check(`${mode}: every paw reaches its contact point`, maxErr < 0.05, `max residual ${fmt(maxErr, 3)} cm`);
  check(`${mode}: no joint below ground`, Object.values(cat.rig.legs).every((l) => l.points.every((p) => p.y > -0.3)), `hock y ${fmt(hock.y)}`);
}
{
  const cat = new Cat();
  run(cat, 2);
  const a = cat.jointAngles();
  const inRange = (v, lo, hi) => v >= lo && v <= hi;
  // Model targets for the quiet stance (see study §3.4); generous bands, intended as a sanity net.
  check('stand: stifle 110–135°', inRange(a.stifle, 110, 135), `${fmt(a.stifle, 0)}°`);
  check('stand: hock 115–140°', inRange(a.hock, 115, 140), `${fmt(a.hock, 0)}°`);
  check('stand: elbow 120–150°', inRange(a.elbow, 120, 150), `${fmt(a.elbow, 0)}°`);
  check('stand: shoulder 95–125°', inRange(a.shoulder, 95, 125), `${fmt(a.shoulder, 0)}°`);
  check('stand: rump higher than withers', cat.rig.S.y > cat.rig.W.y, `sacrum ${fmt(cat.rig.S.y, 1)} vs withers ${fmt(cat.rig.W.y, 1)} cm`);
}
{
  const cat = new Cat();
  cat.setMode('sit');
  run(cat, 5);
  const hock = cat.rig.legs.LH.points[2];
  check('sit: hock rests on the ground (metatarsus flat)', hock.y < 2.0, `hock height ${fmt(hock.y)} cm`);
}

// ---------------------------------------------------------------- locomotion
function gaitTrial(speed, gaitMode = 'auto', seconds = 8) {
  const cat = new Cat();
  cat.gaitMode = gaitMode;
  cat.setSpeed(speed);
  run(cat, 2.5); // reach steady state
  const t0 = cat.t;
  const stanceFrames = Object.fromEntries(LEG_IDS.map((id) => [id, 0]));
  let frames = 0, maxSlip = 0, overReach = 0, betaSum = 0;
  const lastPlant = {};
  run(cat, seconds, (c) => {
    frames++;
    betaSum += c.metrics.beta;
    for (const id of LEG_IDS) {
      const L = c.legs[id];
      const leg = c.rig.legs[id];
      if (isStance(L)) {
        stanceFrames[id]++;
        maxSlip = Math.max(maxSlip, leg.error);
        if (lastPlant[id] && Math.abs(L.foot.x - lastPlant[id]) > 1e-9 && L.state === 'stance') {
          // planted contact must not move in the world
          maxSlip = Math.max(maxSlip, Math.abs(L.foot.x - lastPlant[id]));
        }
        lastPlant[id] = L.foot.x;
      } else lastPlant[id] = null;
      if (leg.reach > 1) overReach++;
    }
  });
  const ev = cat.events.filter((e) => e.t >= t0);
  const duty = Object.fromEntries(LEG_IDS.map((id) => [id, stanceFrames[id] / frames]));
  const lh = ev.filter((e) => e.id === 'LH');
  const strides = lh.slice(1).map((e, i) => e.x - lh[i].x);
  const stride = strides.reduce((a, b) => a + b, 0) / (strides.length || 1);
  // phase of each foot's touchdown relative to LH, over the last strides
  const period = (lh[lh.length - 1].t - lh[0].t) / (lh.length - 1);
  const phases = {};
  for (const id of LEG_IDS) {
    const ps = ev.filter((e) => e.id === id && e.t > lh[1].t).map((e) => {
      const prev = [...lh].reverse().find((l) => l.t <= e.t + 1e-9);
      return wrap01((e.t - prev.t) / period);
    });
    phases[id] = ps.length ? ps[ps.length - 1] : NaN;
  }
  return { cat, duty, stride, period, phases, maxSlip, overReach: overReach / (frames * 4), beta: betaSum / frames, lambda: cat.metrics.lambda, gait: cat.gait, events: ev.length };
}

const near = (a, b, tol) => Math.abs(wrap01(a - b + 0.5) - 0.5) <= tol;

{
  const r = gaitTrial(45);
  check('walk 0.45 m/s: auto-selects walk', r.gait === 'walk', r.gait);
  check('walk: lateral sequence LH→LF→RH→RF (≈0, .25, .5, .75)',
    near(r.phases.LF, 0.25, 0.08) && near(r.phases.RH, 0.5, 0.08) && near(r.phases.RF, 0.75, 0.08),
    `LF ${fmt(r.phases.LF)} RH ${fmt(r.phases.RH)} RF ${fmt(r.phases.RF)}`);
  const d = Object.values(r.duty).reduce((a, b) => a + b) / 4;
  check('walk: measured duty factor matches commanded (±0.05)', Math.abs(d - r.beta) < 0.05, `measured ${fmt(d)} vs β ${fmt(r.beta)}`);
  check('walk: duty factor > 0.5 (always ≥2 feet down)', d > 0.5, fmt(d));
  check('walk: measured stride ≈ λ (±8%)', Math.abs(r.stride / r.lambda - 1) < 0.08, `${fmt(r.stride, 1)} cm vs λ ${fmt(r.lambda, 1)} cm`);
  check('walk: stance feet never slip (< 0.1 cm)', r.maxSlip < 0.1, `max ${fmt(r.maxSlip, 3)} cm`);
  check('walk: limbs within reach (>99% of samples)', r.overReach < 0.01, `${fmt(r.overReach * 100, 1)}% over-reach`);
}
{
  const r = gaitTrial(150);
  check('trot 1.5 m/s: auto-selects trot', r.gait === 'trot', r.gait);
  check('trot: diagonal pairs (RF≈LH, LF≈RH≈0.5)', near(r.phases.RF, 0, 0.08) && near(r.phases.LF, 0.5, 0.08) && near(r.phases.RH, 0.5, 0.08),
    `RF ${fmt(r.phases.RF)} LF ${fmt(r.phases.LF)} RH ${fmt(r.phases.RH)}`);
  const d = Object.values(r.duty).reduce((a, b) => a + b) / 4;
  check('trot: duty factor 0.35–0.55', d > 0.35 && d < 0.55, fmt(d));
  check('trot: measured stride ≈ λ (±8%)', Math.abs(r.stride / r.lambda - 1) < 0.08, `${fmt(r.stride, 1)} vs ${fmt(r.lambda, 1)} cm`);
  check('trot: stance feet never slip (< 0.3 cm)', r.maxSlip < 0.3, `max ${fmt(r.maxSlip, 3)} cm`);
  check('trot: limbs within reach (>97% of samples)', r.overReach < 0.03, `${fmt(r.overReach * 100, 1)}% over-reach`);
}
{
  const r = gaitTrial(320);
  check('gallop 3.2 m/s: auto-selects gallop', r.gait === 'gallop', r.gait);
  check('gallop: rotary sequence LH→RH→RF→LF',
    r.phases.RH < r.phases.RF && r.phases.RF < r.phases.LF, `RH ${fmt(r.phases.RH)} RF ${fmt(r.phases.RF)} LF ${fmt(r.phases.LF)}`);
  const d = Object.values(r.duty).reduce((a, b) => a + b) / 4;
  check('gallop: duty factor 0.2–0.4 (aerial phases)', d > 0.2 && d < 0.4, fmt(d));
  check('gallop: measured stride ≈ λ (±10%)', Math.abs(r.stride / r.lambda - 1) < 0.1, `${fmt(r.stride, 1)} vs ${fmt(r.lambda, 1)} cm`);
  check('gallop: limbs within reach (>90% of samples)', r.overReach < 0.1, `${fmt(r.overReach * 100, 1)}% over-reach, max slip ${fmt(r.maxSlip, 2)} cm`);
}
{
  // starting and stopping: the cat must end square on its feet
  const cat = new Cat();
  cat.setSpeed(60);
  run(cat, 3);
  cat.setMode('stand');
  run(cat, 3);
  const off = Math.max(...LEG_IDS.map((id) => Math.abs(cat.legs[id].foot.x - cat.neutralX(cat.legs[id]))));
  check('stop: comes to rest with every paw planted near neutral (< 1.5 cm)', off < 1.5 && !cat.gaitActive && LEG_IDS.every((id) => cat.legs[id].mode === 'planted'), `worst ${fmt(off)} cm`);
}

// ---------------------------------------------------------------- jumping & pouncing
{
  const cat = new Cat();
  run(cat, 1);
  const nose0 = cat.rig.head.nose.x;
  cat.pounce(nose0 + 100);
  let peak = -1e9, airborne = false, sawAir = false;
  run(cat, 4, (c) => {
    if (c.airborne) { sawAir = true; peak = Math.max(peak, c.lift.x); }
  });
  const nose1 = cat.rig.head.nose.x;
  check('pounce: goes airborne and lands', sawAir && !cat.airborne && !cat.action, `peak lift ${fmt(peak, 1)} cm`);
  check('pounce: nose travels ≈ commanded distance (±25%)', Math.abs(nose1 - nose0 - 100) < 25, `${fmt(nose1 - nose0, 1)} cm for 100 cm`);
  check('pounce: low, flat trajectory (peak < 20 cm)', peak < 20, `${fmt(peak, 1)} cm`);
}
{
  const cat = new Cat();
  run(cat, 1);
  cat.jump(60);
  let peak = -1e9;
  run(cat, 4, (c) => { if (c.airborne) peak = Math.max(peak, c.lift.x); });
  check('jump 60 cm: body rises 60 cm (±10%)', Math.abs(peak - 60) < 6, `${fmt(peak, 1)} cm`);
  check('jump: lands and recovers', !cat.airborne && !cat.action);
}

// ---------------------------------------------------------------- numerical health
{
  const cat = new Cat();
  let bad = false;
  const script = [[0, () => cat.setSpeed(300)], [3, () => cat.setMode('sit')], [6, () => cat.setSpeed(120)], [8, () => cat.pounce()], [11, () => cat.setMode('stretch')], [13, () => cat.jump(90)]];
  let k = 0;
  run(cat, 16, (c) => {
    while (k < script.length && c.t >= script[k][0]) script[k++][1]();
    const pts = [c.rig.S, c.rig.W, ...c.rig.tail, ...Object.values(c.rig.legs).flatMap((l) => l.points)];
    if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) bad = true;
  });
  check('stress script (gallop→sit→trot→pounce→stretch→jump): no NaN', !bad);
}

// ---------------------------------------------------------------- speed sweep (informational)
console.log('speed  gait    Fr     λ(cm)  stride  f(Hz)  β      β meas  hind−fore print');
for (const v of SWEEP_SPEEDS) {
  const m = measureGait(v);
  console.log(`${(v / 100).toFixed(2).padStart(4)}   ${m.gait.padEnd(6)}  ${fmt(m.Fr).padStart(5)}  ${fmt(m.lambda, 1).padStart(5)}  ${fmt(m.strideMeasured, 1).padStart(6)}  ${fmt(m.f).padStart(5)}  ${fmt(m.beta)}   ${fmt(m.dutyMeasured)}    ${fmt(m.register, 1).padStart(5)} cm`);
}
console.log('');

// ---------------------------------------------------------------- report
const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${r.detail ?? ''}`);
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
