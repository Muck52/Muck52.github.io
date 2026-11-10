import { deg } from './math.js';

/**
 * Footfall templates. Values are the phase (fraction of the stride cycle) at which each
 * foot touches down, relative to the left hind. L = near side (we see the cat's left).
 */
export const GAITS = {
  walk: {
    label: 'Walk · lateral-sequence',
    offsets: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 },
  },
  trot: {
    label: 'Trot · diagonal pairs',
    offsets: { LH: 0, RF: 0, RH: 0.5, LF: 0.5 },
  },
  gallop: {
    label: 'Gallop · rotary',
    offsets: { LH: 0, RH: 0.1, RF: 0.52, LF: 0.62 },
  },
};

/**
 * Stride-length law: λ = STRIDE_COEF · h · Fr^0.3 (Alexander 1976; fitted across many
 * quadrupeds, coefficient ≈ 2.3). Kept generic for study 01 — see study §5.6: with this value
 * the model only direct-registers at ≈0.75 m/s, which hints cats stride longer at slow speed.
 */
export const STRIDE_COEF = 2.3;

/** Froude-number thresholds [up, down] for automatic gait choice (hysteresis band). */
export const GAIT_THRESHOLDS = {
  walkTrot: [0.5, 0.4],
  trotGallop: [2.2, 1.7],
};

/** Every numeric posture field. A posture is a full set; postures are blended per-field. */
const BASE = {
  // trunk (heights of the spine line above ground; DX relative to the support centre)
  sacrumDX: -13.6,
  sacrumH: 27.4,
  withersH: 25.8,
  bend: 0.18, // total spinal curvature (rad); + = dorsal flexion (arched), − = extension
  // feet: neutral contact points relative to the support centre
  foreDX: 11.4,
  hindDX: -14.6,
  foreMeta: deg(110), // pastern angle (knuckle → wrist) in stance
  // head & neck
  neck: deg(42), // neck elevation (world)
  head: deg(-14), // face direction (world)
  lookW: 1, // how strongly the head follows a look target
  earBack: 0, // 0 = forward/neutral, 1 = flattened
  whisker: 0, // 0 = relaxed, 1 = fanned forward (hunting)
  pupil: 0.3, // 0 = slit, 1 = fully dilated
  // tail
  tailBase: deg(18), // elevation of the tail root above the spine line
  tailCurl: deg(45), // total extra bend distributed toward the tip
  tailWave: 0.04, // sway amplitude (rad per segment, scaled toward tip)
  tailWaveHz: 0.5,
  tailSag: 0.35, // how much gravity bends the tail (relaxed = high)
  // stepping
  stepH: 3.0, // swing foot clearance (cm)
  swingScale: 1, // multiplier on swing duration
  strideScale: 1, // multiplier on Froude stride length
  legScale: 1, // effective leg length factor (crouched gaits)
  // airborne limb targets, relative to girdle anchors (fore: scapula pivot, hind: hip)
  freeForeDX: 8, freeForeDY: -17, landForeDX: 9, landForeDY: -21,
  freeHindDX: -3, freeHindDY: -17, landHindDX: -2, landHindDY: -20,
  freeMeta: deg(95),
};

export const POSTURE_KEYS = Object.keys(BASE);
const P = (o) => ({ ...BASE, ...o });

export const POSTURES = {
  stand: P({}),
  walk: P({ neck: deg(30), head: deg(-18), tailBase: deg(38), tailCurl: deg(75), tailSag: 0.15 }),
  trot: P({ sacrumH: 26.8, withersH: 25.2, neck: deg(24), head: deg(-12), tailBase: deg(22), tailCurl: deg(30), stepH: 4.2, tailSag: 0.1 }),
  gallop: P({ sacrumH: 25.2, withersH: 23.6, bend: 0.0, neck: deg(12), head: deg(-4), tailBase: deg(4), tailCurl: deg(8), tailSag: 0.05, earBack: 0.35, stepH: 6, pupil: 0.6 }),
  crouch: P({ sacrumDX: -12.6, sacrumH: 18.5, withersH: 16.2, bend: 0.12, foreDX: 14, hindDX: -10.5, neck: deg(8), head: deg(-4), tailBase: deg(-10), tailCurl: deg(-10), tailSag: 0.6, whisker: 1, pupil: 0.85, stepH: 2 }),
  stalk: P({ sacrumDX: -12.8, sacrumH: 19.5, withersH: 16, bend: 0.1, foreDX: 11, hindDX: -12, neck: deg(4), head: deg(-2), tailBase: deg(-6), tailCurl: deg(-6), tailSag: 0.45, whisker: 1, pupil: 0.8, stepH: 2.2, swingScale: 1.3, legScale: 0.85 }),
  sit: P({ sacrumDX: -8.5, sacrumH: 12.8, withersH: 28.4, bend: 0.42, foreDX: 9.5, hindDX: 4.5, foreMeta: deg(100), neck: deg(68), head: deg(-6), tailBase: deg(-55), tailCurl: deg(-40), tailSag: 0.9, tailWave: 0.02 }),
  stretch: P({ sacrumDX: -15, sacrumH: 25.5, withersH: 11, bend: -0.35, foreDX: 22, hindDX: -14.6, foreMeta: deg(150), neck: deg(-5), head: deg(5), tailBase: deg(60), tailCurl: deg(30), earBack: 0.2 }),
  // hunting sequence
  pouncePrep: P({ sacrumDX: -11.2, sacrumH: 17.2, withersH: 12.6, bend: 0.22, foreDX: 10, hindDX: -7.8, neck: deg(4), head: deg(-2), tailBase: deg(-14), tailCurl: deg(-4), tailSag: 0.3, tailWave: 0.22, tailWaveHz: 2.6, whisker: 1, pupil: 1, stepH: 1.6 }),
  push: P({ sacrumDX: -12.5, sacrumH: 24, withersH: 24.5, bend: -0.25, foreDX: 15, hindDX: -7.8, neck: deg(14), head: deg(-4), tailBase: deg(0), tailCurl: 0, whisker: 1, pupil: 1, freeForeDX: 9, freeForeDY: -15 }),
  pounceFlight: P({ sacrumH: 24.5, withersH: 24.5, bend: -0.3, neck: deg(10), head: deg(-14), tailBase: deg(8), tailCurl: 0, tailSag: 0, whisker: 1, pupil: 1, earBack: 0.1,
    freeForeDX: 15, freeForeDY: -15, landForeDX: 15, landForeDY: -21, freeHindDX: -10, freeHindDY: -14, landHindDX: -6, landHindDY: -19, freeMeta: deg(85) }),
  pounceLand: P({ sacrumDX: -12, sacrumH: 19, withersH: 12.5, bend: 0.3, foreDX: 12, hindDX: -9, neck: deg(0), head: deg(-38), tailBase: deg(-8), tailCurl: deg(-5), tailWave: 0.15, tailWaveHz: 2, whisker: 1, pupil: 1, earBack: 0.15 }),
  jumpPrep: P({ sacrumDX: -12.2, sacrumH: 19.5, withersH: 17.5, bend: 0.2, foreDX: 10.5, hindDX: -9.5, neck: deg(58), head: deg(32), tailBase: deg(-5), tailCurl: deg(-10), whisker: 0.5, pupil: 0.7, stepH: 1.6 }),
  jumpPush: P({ sacrumDX: -12.5, sacrumH: 25, withersH: 28, bend: -0.2, foreDX: 13, hindDX: -9.5, neck: deg(60), head: deg(40), tailBase: deg(-25), tailCurl: 0, freeForeDX: 6, freeForeDY: -14 }),
  jumpFlight: P({ sacrumH: 25.5, withersH: 28, bend: 0.1, neck: deg(45), head: deg(5), tailBase: deg(-30), tailCurl: deg(20), tailSag: 0,
    freeForeDX: 6, freeForeDY: -12, landForeDX: 7, landForeDY: -21, freeHindDX: 5, freeHindDY: -12, landHindDX: 0, landHindDY: -20, freeMeta: deg(60) }),
  jumpLand: P({ sacrumH: 21, withersH: 19, bend: 0.25, neck: deg(25), head: deg(-20), tailBase: deg(20), tailCurl: deg(30) }),
};

/** Weighted per-field blend: entries = [[posture, weight], ...]. */
export function blendPostures(entries) {
  const out = {};
  let wSum = 0;
  for (const [, w] of entries) wSum += w;
  for (const k of POSTURE_KEYS) {
    let s = 0;
    for (const [p, w] of entries) s += p[k] * w;
    out[k] = s / (wSum || 1);
  }
  return out;
}
