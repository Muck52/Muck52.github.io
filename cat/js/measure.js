// Headless measurement of the model, shared by tests/check.mjs and study.html.
import { Cat, LEG_IDS } from './cat.js';

const DT = 1 / 120;

/** Run the cat at a steady speed and measure what it actually does. */
export function measureGait(speed, { settle = 2.5, seconds = 6, gaitMode = 'auto' } = {}) {
  const cat = new Cat();
  cat.gaitMode = gaitMode;
  cat.setSpeed(speed);
  for (let i = 0; i < settle / DT; i++) cat.update(DT);
  const t0 = cat.t;
  let frames = 0, stance = 0, overReach = 0, maxResidual = 0;
  for (let i = 0; i < seconds / DT; i++) {
    cat.update(DT);
    frames++;
    for (const id of LEG_IDS) {
      const L = cat.legs[id], leg = cat.rig.legs[id];
      const down = L.mode === 'planted' || (L.mode === 'gait' && L.state === 'stance');
      if (down) {
        stance++;
        maxResidual = Math.max(maxResidual, leg.error);
      }
      if (leg.reach > 1) overReach++;
    }
  }
  const ev = cat.events.filter((e) => e.t > t0);
  // registration: where each hind paw lands relative to the last print of the same-side fore paw
  const gaps = [];
  for (const side of ['L', 'R']) {
    const F = ev.filter((e) => e.id === side + 'F');
    for (const h of ev.filter((e) => e.id === side + 'H')) {
      const f = [...F].reverse().find((e) => e.t < h.t);
      if (f) gaps.push(h.x - f.x);
    }
  }
  const lh = ev.filter((e) => e.id === 'LH');
  const strideMeasured = (lh[lh.length - 1].x - lh[0].x) / (lh.length - 1);
  const m = cat.metrics;
  return {
    speed,
    gait: cat.gait,
    Fr: m.Fr,
    lambda: m.lambda,
    strideMeasured,
    f: m.f,
    beta: m.beta,
    dutyMeasured: stance / (frames * 4),
    register: gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1),
    overReach: overReach / (frames * 4),
    maxResidual,
  };
}

export const SWEEP_SPEEDS = [20, 30, 45, 60, 80, 100, 150, 200, 250, 350];
