import {
  TAU, deg, clamp, lerp, damp, wrap01, wrapHalf, smoothstep, springStep, angDiff,
  add, sub, scale, dir, polar, local, dist, angleOf, jointAngle,
} from './math.js';
import { ANATOMY as A, HIP_HEIGHT } from './anatomy.js';
import { POSTURES, GAITS, GAIT_THRESHOLDS, POSTURE_KEYS, STRIDE_COEF, blendPostures } from './motion.js';
import { solvePantograph } from './ik.js';

export const GRAVITY = 981; // cm/s²
export const LEG_IDS = ['LH', 'LF', 'RH', 'RF'];
const CPG_COUPLING = 3.0; // how fast leg oscillators lock onto the gait template (1/s)
const ACCEL = 420; // cm/s² — comfortable acceleration on the ground
const DECEL = 650;

/** Circular mean of cycle fractions: entries = [[phase01, weight], ...]. */
function circMean(entries) {
  let sx = 0, sy = 0;
  for (const [p, w] of entries) {
    sx += w * Math.cos(TAU * p);
    sy += w * Math.sin(TAU * p);
  }
  return wrap01(Math.atan2(sy, sx) / TAU);
}

/**
 * Build the spine as a circular arc of fixed length between the sacrum and the withers.
 * bend = total turning angle (+ arches the back). Returns sample points & tangent angles.
 */
function buildSpine(sx, sy, wy, bend, L, n = 16) {
  const k = bend / L;
  const chord = Math.abs(bend) < 1e-5 ? L : (2 * Math.sin(bend / 2)) / k;
  const dy = clamp(wy - sy, -chord * 0.97, chord * 0.97);
  const psi = Math.asin(dy / chord);
  const th0 = psi + bend / 2;
  const pts = [], ang = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    const th = th0 - k * s;
    let x, y;
    if (Math.abs(k) < 1e-7) {
      x = s * Math.cos(th0);
      y = s * Math.sin(th0);
    } else {
      x = (Math.sin(th0) - Math.sin(th)) / k;
      y = (Math.cos(th) - Math.cos(th0)) / k;
    }
    pts.push({ x: sx + x, y: sy + y });
    ang.push(th);
  }
  return { pts, ang, L, n };
}

/** Sample a spine at u (0 = sacrum, 1 = withers), extrapolating past the ends. */
function spineAt(sp, u) {
  const { pts, ang, n, L } = sp;
  if (u <= 0) return { p: polar(pts[0], u * L, ang[0]), a: ang[0] };
  if (u >= 1) return { p: polar(pts[n], (u - 1) * L, ang[n]), a: ang[n] };
  const f = u * n, i = Math.floor(f), t = f - i;
  const p = { x: lerp(pts[i].x, pts[i + 1].x, t), y: lerp(pts[i].y, pts[i + 1].y, t) };
  return { p, a: lerp(ang[i], ang[i + 1], t) };
}

export class Cat {
  constructor(opts = {}) {
    this.t = 0;
    this.rootX = opts.x ?? 0; // support centre (world cm)
    this.v = 0; // forward speed, cm/s
    this.speedCmd = 0;
    this.mode = 'stand'; // stand | move | stalk | sit | crouch | stretch
    this.gaitMode = 'auto'; // auto | walk | trot | gallop
    this.gait = 'walk';
    this.gaitW = { walk: 1, trot: 0, gallop: 0 };
    this.pose = { ...POSTURES.stand };
    this.poseRate = 4;
    this.phaseRef = 0;
    this.gaitActive = false;
    this.dyn = { sacrumLift: 0, withersLift: 0, bend: 0 };

    // ballistic state
    this.airborne = false;
    this.lift = { x: 0, v: 0 }; // whole-body vertical offset (spring/projectile)
    this.vx = 0;
    this.action = null;

    // head
    this.look = null; // world point the cat attends to, or null
    this.headAng = this.pose.head;
    this.eye = { open: 1, blinkT: 0, nextBlink: 2.5, lookX: 0, lookY: 0 };

    this.events = []; // footfall events {t, id, x}
    this.history = []; // {t, stance:{LH,LF,RH,RF}}
    this.onFootfall = null;
    this.metrics = { v: 0, Fr: 0, lambda: 0, f: 0, beta: 1, gait: 'stand' };

    this.legs = {};
    for (const id of LEG_IDS) {
      this.legs[id] = {
        id,
        hind: id[1] === 'H',
        near: id[0] === 'L',
        phase: -GAITS.walk.offsets[id], // phase leads by −offset so touchdown lags LH by +offset
        state: 'stance', // gait sub-state
        mode: 'planted', // planted | gait | step | free
        foot: { x: 0, y: 0 }, // contact point (centre of the digital pads)
        from: { x: 0, y: 0 },
        step: null,
        air: 0, // 0 = loaded, 1 = fully unloaded/flexed (drives paw flexion)
        metaAng: deg(110),
        toeAng: deg(-12),
        swingS: 0,
      };
    }
    for (const id of LEG_IDS) {
      const L = this.legs[id];
      L.foot.x = this.neutralX(L);
    }
    this.tail = null;
    this.computeRig(0);
  }

  // ---------------------------------------------------------------- public API
  setMode(mode) {
    if (this.action) return;
    this.mode = mode;
    if (mode !== 'move' && mode !== 'stalk') this.speedCmd = 0;
  }
  setSpeed(cmPerS) {
    this.speedCmd = Math.max(0, cmPerS);
    if (this.action) return;
    if (this.speedCmd > 0 && this.mode !== 'stalk') this.mode = 'move';
  }
  setLook(p) { this.look = p; }

  /** Stalk-crouch-wiggle-pounce. targetX (world) optional. */
  pounce(targetX) {
    if (this.action || this.airborne) return false;
    const nose = this.rig ? this.rig.head.nose.x : this.rootX + 25;
    const want = clamp(targetX != null ? targetX - nose : 100, 40, 170);
    // the body's ballistic range is shorter than the nose's travel: the neck/forelimbs
    // reach forward at take-off and the landing slides a little (calibrated in tests)
    const D = Math.max(20, want - 22);
    this.action = { type: 'pounce', stage: 'prep', t: 0, D, want, theta: deg(22), prepDur: 1.25 };
    return true;
  }
  /** Standing vertical leap (height in cm). */
  jump(height = 60) {
    if (this.action || this.airborne) return false;
    const D = 26;
    const theta = Math.atan2(4 * height, D);
    this.action = { type: 'jump', stage: 'prep', t: 0, D, theta, prepDur: 0.55 };
    return true;
  }

  neutralX(leg) {
    return this.rootX + (leg.hind ? this.pose.hindDX : this.pose.foreDX);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    const target = this.updateAction(dt);
    this.targetSpeed = target.speed;
    this.updateSpeed(dt, target.speed);
    this.updatePosture(dt, target.posture, target.rate);
    this.updateGaitChoice(dt);

    if (this.airborne) {
      this.rootX += this.vx * dt;
      this.lift.v -= GRAVITY * dt;
      this.lift.x += this.lift.v * dt;
    } else {
      this.rootX += this.v * dt + this.vx * dt;
      this.vx = damp(this.vx, 0, 9, dt);
      springStep(this.lift, 0, 11, dt);
    }

    this.updateLegs(dt);
    this.computeRig(dt);
    this.updateEyes(dt);
    this.record();
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) {
      let speed = 0;
      if (this.mode === 'move') speed = this.speedCmd;
      else if (this.mode === 'stalk') speed = Math.min(this.speedCmd || 15, 30);
      return { speed, posture: null, rate: 4 };
    }
    a.t += dt;
    const P = POSTURES;
    const isPounce = a.type === 'pounce';
    switch (a.stage) {
      case 'prep': {
        // stop, gather the hind feet under the body, (pounce) wiggle the hindquarters
        if (a.t > a.prepDur && Math.abs(this.v) < 3 && !this.anyStepping()) {
          a.stage = 'push';
          a.t = 0;
          for (const id of ['LF', 'RF']) this.freeLeg(this.legs[id]);
        }
        if (isPounce) {
          const env = smoothstep((a.t - 0.45) / 0.2) * (1 - smoothstep((a.t - a.prepDur + 0.08) / 0.1));
          this.dyn.sacrumLift = 0.9 * env * Math.sin(TAU * 4.2 * a.t);
        }
        return { speed: 0, posture: isPounce ? P.pouncePrep : P.jumpPrep, rate: 5 };
      }
      case 'push': {
        // hind limbs extend explosively while the fore limbs come off the ground
        const dur = 0.13;
        if (a.t >= dur) {
          const v0 = Math.sqrt((GRAVITY * a.D) / Math.sin(2 * a.theta));
          this.vx = v0 * Math.cos(a.theta);
          this.lift.v = v0 * Math.sin(a.theta);
          this.v = 0;
          this.airborne = true;
          this.gaitActive = false;
          for (const L of Object.values(this.legs)) this.freeLeg(L);
          a.stage = 'air';
          a.t = 0;
        }
        return { speed: 0, posture: isPounce ? P.push : P.jumpPush, rate: 22 };
      }
      case 'air': {
        let anyFore = false;
        for (const L of Object.values(this.legs)) {
          if (L.mode === 'free' && this.lift.v < 0 && L.foot.y <= 0) this.plantLeg(L);
          if (!L.hind && L.mode === 'planted') anyFore = true;
        }
        if (anyFore || this.lift.x < -6) {
          this.airborne = false;
          this.vx *= 0.3;
          // the limbs soak up most of the impact; the body keeps only a little sink
          this.lift.v *= 0.22;
          a.stage = 'land';
          a.t = 0;
        }
        return { speed: 0, posture: isPounce ? P.pounceFlight : P.jumpFlight, rate: 6 };
      }
      case 'land': {
        for (const L of Object.values(this.legs)) {
          if (L.mode === 'free' && (L.foot.y <= 0 || a.t > 0.3)) this.plantLeg(L);
        }
        if (a.t > (isPounce ? 0.9 : 0.5)) {
          this.action = null;
          this.mode = isPounce ? 'crouch' : 'stand';
          this.speedCmd = 0;
        }
        return { speed: 0, posture: isPounce ? P.pounceLand : P.jumpLand, rate: 8 };
      }
    }
    return { speed: 0, posture: null, rate: 4 };
  }

  updateSpeed(dt, target) {
    // don't set off until the body has got up out of a sit / stretch
    const ready = Math.abs(this.pose.sacrumH - POSTURES.walk.sacrumH) < 4 || this.mode === 'stalk' || this.v > 1;
    if (!ready) target = 0;
    if (this.airborne) return;
    const a = target > this.v ? ACCEL : DECEL;
    this.v += clamp(target - this.v, -a * dt, a * dt);
    if (target === 0 && this.v < 0.5) this.v = 0;
  }

  updatePosture(dt, override, rate) {
    let target;
    if (override) target = override;
    else if (this.mode === 'stalk') target = POSTURES.stalk;
    else if (this.mode === 'move' && (this.v > 2 || this.speedCmd > 0)) {
      const g = this.gaitW;
      target = blendPostures([[POSTURES.walk, g.walk + 1e-6], [POSTURES.trot, g.trot], [POSTURES.gallop, g.gallop]]);
    } else target = POSTURES[this.mode] || POSTURES.stand;
    this.poseTarget = target;
    for (const k of POSTURE_KEYS) this.pose[k] = damp(this.pose[k], target[k], rate, dt);
  }

  updateGaitChoice(dt) {
    const h = (HIP_HEIGHT * this.pose.legScale) / 100;
    const Fr = (this.v / 100) ** 2 / (9.81 * h);
    this.metrics.Fr = Fr;
    let g = this.gait;
    if (this.mode === 'stalk') g = 'walk';
    else if (this.gaitMode !== 'auto') g = this.gaitMode;
    else {
      const [wtUp, wtDn] = GAIT_THRESHOLDS.walkTrot;
      const [tgUp, tgDn] = GAIT_THRESHOLDS.trotGallop;
      if (g === 'walk' && Fr > wtUp) g = 'trot';
      if (g === 'trot' && Fr > tgUp) g = 'gallop';
      if (g === 'gallop' && Fr < tgDn) g = 'trot';
      if (g === 'trot' && Fr < wtDn) g = 'walk';
    }
    this.gait = g;
    for (const k of Object.keys(this.gaitW)) this.gaitW[k] = damp(this.gaitW[k], k === g ? 1 : 0, 3.5, dt);
  }

  // ---------------------------------------------------------------- legs
  anyStepping() {
    return Object.values(this.legs).some((L) => L.mode === 'step');
  }

  freeLeg(L) {
    L.mode = 'free';
    L.step = null;
    L.rel = null; // initialised from the current pose on the next update
  }

  plantLeg(L) {
    if (L.mode !== 'planted' && L.mode !== 'gait') this.footfall(L);
    L.mode = 'planted';
    L.state = 'stance';
    L.step = null;
    L.foot.y = 0;
  }

  footfall(L) {
    const e = { t: this.t, id: L.id, x: L.foot.x };
    this.events.push(e);
    if (this.events.length > 400) this.events.shift();
    if (this.onFootfall) this.onFootfall(e);
  }

  /** Stride parameters from speed (dynamic similarity, Alexander 1976/1983). */
  strideParams() {
    const P = this.pose;
    const h = HIP_HEIGHT * P.legScale;
    const v = Math.max(this.v, 1);
    const Fr = (v * v) / (GRAVITY * h);
    const lambda = h * STRIDE_COEF * Math.pow(Fr, 0.3) * P.strideScale; // stride length (cm)
    const f = v / lambda; // stride frequency (Hz)
    // Swing time is nearly speed-independent in cats; speed comes from shorter stance.
    const Tsw = clamp(0.26 - 0.025 * (v / 100), 0.17, 0.3) * P.swingScale;
    const beta = clamp(1 - Tsw * f, 0.22, 0.85); // duty factor
    return { lambda, f, beta, Tsw, Fr };
  }

  updateLegs(dt) {
    const legs = Object.values(this.legs);
    const P = this.pose;
    const wantMove = !this.airborne && !this.action && this.targetSpeed > 0 && this.v > 0;

    // ---- start / stop the gait
    if (wantMove && !this.gaitActive && !this.anyStepping()) {
      this.gaitActive = true;
      this.phaseRef = this.legs.LH.phase;
      for (const L of legs) {
        L.mode = 'gait';
        L.state = 'stance';
      }
    }
    if (this.gaitActive && (!wantMove || this.airborne) && this.v < 3) {
      this.gaitActive = false;
      for (const L of legs) {
        if (L.state === 'swing') {
          L.mode = 'step';
          L.step = { t: 0, dur: Math.max(0.1, (1 - L.swingS) * 0.25), h: L.foot.y + 1, from: { ...L.foot } };
        } else L.mode = 'planted';
      }
    }

    this.dyn.withersLift = 0;
    this.dyn.bend = 0;
    if (!(this.action && this.action.stage === 'prep' && this.action.type === 'pounce')) this.dyn.sacrumLift = 0;

    if (this.gaitActive) {
      const sp = this.strideParams();
      Object.assign(this.metrics, { lambda: sp.lambda, f: sp.f, beta: sp.beta, gait: this.gait });
      this.phaseRef += sp.f * dt;
      const g = this.gaitW;
      for (const L of legs) {
        const off = circMean([
          [GAITS.walk.offsets[L.id], g.walk + 1e-6],
          [GAITS.trot.offsets[L.id], g.trot],
          [GAITS.gallop.offsets[L.id], g.gallop],
        ]);
        L.phase += (sp.f + CPG_COUPLING * wrapHalf(this.phaseRef - off - L.phase)) * dt;
        const p = wrap01(L.phase);
        const inStance = p < sp.beta;
        if (inStance && L.state === 'swing') {
          L.state = 'stance';
          L.foot.y = 0;
          this.footfall(L);
        } else if (!inStance && L.state === 'stance') {
          L.state = 'swing';
          L.from = { ...L.foot };
        }
        if (L.state === 'swing') {
          const s = clamp((p - sp.beta) / (1 - sp.beta), 0, 1);
          L.swingS = s;
          const remaining = Math.min(((1 - s) * (1 - sp.beta)) / sp.f, 1);
          const land = this.rootX + this.v * remaining + (L.hind ? P.hindDX : P.foreDX) + (sp.beta * sp.lambda) / 2;
          L.foot.x = lerp(L.from.x, land, smoothstep(s));
          L.foot.y = L.from.y * (1 - s) + P.stepH * Math.pow(Math.sin(Math.PI * s), 0.85);
          L.air = Math.sin(Math.PI * Math.min(s * 1.2, 1));
        } else {
          L.air = 0;
          L.swingS = 0;
        }
      }
      // body oscillations, expressed against the left-hind phase
      const phi = wrap01(this.legs.LH.phase);
      const b = sp.beta;
      const walkBob = 0.35 * Math.cos(TAU * 2 * (phi - b / 2)); // vaulting: high at mid-stance
      const trotBob = -0.7 * Math.cos(TAU * 2 * (phi - b / 2)); // bouncing: low at mid-stance
      const s = this.v / 300;
      this.dyn.sacrumLift = g.walk * walkBob + g.trot * trotBob + g.gallop * -2.0 * s * Math.cos(TAU * (phi - 0.2));
      this.dyn.withersLift = g.walk * walkBob + g.trot * trotBob + g.gallop * -2.0 * s * Math.cos(TAU * (phi - 0.72));
      this.dyn.bend = g.gallop * 0.8 * Math.min(1, s * 1.2) * Math.cos(TAU * (phi - 0.95));
    } else {
      this.metrics.gait = this.airborne ? 'airborne' : 'stand';
      this.metrics.beta = 1;
      this.metrics.f = 0;
      this.metrics.lambda = 0;
      if (!this.airborne) this.settle(legs);
    }

    // settle steps and free (airborne) limbs
    for (const L of legs) {
      if (L.mode === 'step') {
        const st = L.step;
        st.t += dt;
        const s = clamp(st.t / st.dur, 0, 1);
        const to = this.neutralX(L);
        L.foot.x = lerp(st.from.x, to, smoothstep(s));
        L.foot.y = lerp(st.from.y, 0, s) + st.h * Math.sin(Math.PI * s);
        L.air = Math.sin(Math.PI * s);
        L.swingS = s;
        if (s >= 1) this.plantLeg(L);
      } else if (L.mode === 'free') {
        // airborne limbs are sprung in the girdle's frame, not the world's, so they keep up
        // with the body however fast it is travelling
        const r = this.rig;
        if (!r) continue;
        const anchor = r.legs[L.id].points[0];
        if (!L.rel) L.rel = { x: L.foot.x - anchor.x, y: L.foot.y - anchor.y, vx: 0, vy: 0 };
        const desc = smoothstep((-this.lift.v + 60) / 160); // 0 rising → 1 falling
        const dx = L.hind ? lerp(P.freeHindDX, P.landHindDX, desc) : lerp(P.freeForeDX, P.landForeDX, desc);
        const dy = L.hind ? lerp(P.freeHindDY, P.landHindDY, desc) : lerp(P.freeForeDY, P.landForeDY, desc);
        const sx = { x: L.rel.x, v: L.rel.vx }, sy = { x: L.rel.y, v: L.rel.vy };
        springStep(sx, dx, 22, dt);
        springStep(sy, dy, 22, dt);
        L.rel = { x: sx.x, y: sy.x, vx: sx.v, vy: sy.v };
        L.foot.x = anchor.x + L.rel.x;
        L.foot.y = Math.max(anchor.y + L.rel.y, this.airborne ? -1 : 0);
        L.air = 1;
      } else if (L.mode === 'planted') {
        L.air = 0;
      }
    }
  }

  /** Idle foot placement: one leg at a time steps toward its neutral spot. */
  settle(legs) {
    if (this.anyStepping()) return;
    if (this.action && this.action.stage !== 'prep') return;
    let worst = null, wErr = 1.2;
    for (const L of legs) {
      if (L.mode !== 'planted') continue;
      const e = Math.abs(L.foot.x - this.neutralX(L));
      if (e > wErr) { wErr = e; worst = L; }
    }
    if (!worst) return;
    worst.mode = 'step';
    const dur = (0.18 + 0.004 * wErr) * this.pose.swingScale;
    worst.step = { t: 0, dur, h: Math.min(this.pose.stepH, 0.8 + wErr * 0.25), from: { ...worst.foot } };
  }

  // ---------------------------------------------------------------- rig
  computeRig(dt) {
    const P = this.pose;
    const lift = this.lift.x;
    const airPitch = this.airborne ? clamp(this.lift.v * 0.03, -9, 9) : 0;
    const sx = this.rootX + P.sacrumDX;
    const sy = P.sacrumH + this.dyn.sacrumLift + lift;
    const wy = P.withersH + this.dyn.withersLift + lift + airPitch;
    const spine = buildSpine(sx, sy, wy, P.bend + this.dyn.bend, A.spine.length);
    const S = spine.pts[0], aS = spine.ang[0];
    const W = spine.pts[spine.n], aW = spine.ang[spine.n];

    const hip = local(S, aS, -A.pelvis.back, -A.pelvis.down);
    const scap = local(W, aW, -A.scapulaPivot.back, -A.scapulaPivot.down);

    // legs ------------------------------------------------------------
    const legs = {};
    for (const id of LEG_IDS) {
      const L = this.legs[id];
      if (L.hind) {
        const mtpGoal = { x: L.foot.x, y: L.foot.y + A.hind.padH };
        const sol = solvePantograph(hip, mtpGoal, A.hind);
        const [h, knee, hock, mtp] = sol.points;
        const mtAng = sol.angles[2];
        const toeTarget = lerp(deg(-12), mtAng + deg(28), L.air);
        L.toeAng = dt ? damp(L.toeAng, toeTarget, 30, dt) : toeTarget;
        const toe = polar(mtp, A.hind.toe, L.toeAng);
        const heel = polar(hock, A.hind.heel, sol.angles[1] + Math.PI + deg(35));
        legs[id] = { points: [h, knee, hock, mtp, toe], heel, reach: sol.reach, error: sol.error };
      } else {
        const free = L.mode === 'free';
        const s = L.swingS;
        const flex = L.air > 0 ? Math.sin(Math.PI * clamp(s / 0.8, 0, 1)) : 0;
        const metaTarget = free ? P.freeMeta : lerp(P.foreMeta, deg(40), flex);
        L.metaAng = dt ? damp(L.metaAng, metaTarget, 28, dt) : metaTarget;
        const mcpGoal = { x: L.foot.x, y: L.foot.y + A.fore.padH };
        const wristGoal = polar(mcpGoal, A.fore.meta, L.metaAng);
        const sol = solvePantograph(scap, wristGoal, A.fore);
        const [p0, shoulder, elbow, wrist] = sol.points;
        const mcp = polar(wrist, A.fore.meta, L.metaAng + Math.PI);
        const toeTarget = lerp(deg(-10), L.metaAng + Math.PI + deg(18), Math.max(L.air, free ? 1 : 0));
        L.toeAng = dt ? damp(L.toeAng, toeTarget, 30, dt) : toeTarget;
        const toe = polar(mcp, A.fore.toe, L.toeAng);
        legs[id] = { points: [p0, shoulder, elbow, wrist, mcp, toe], reach: sol.reach, error: sol.error };
      }
    }

    // neck & head -----------------------------------------------------
    const neckBase = local(W, aW, 0.6, -1.0);
    const restLift = P.withersH + lift + airPitch; // withers height without gait bob
    let desiredY = restLift + (neckBase.y - wy) + A.neck.length * Math.sin(P.neck);
    let headTarget = P.head;
    if (this.look) {
      const atlas0 = polar(neckBase, A.neck.length, P.neck);
      const aim = angleOf(sub(this.look, atlas0));
      headTarget = P.head + clamp(angDiff(P.head, aim), -0.75, 0.75) * P.lookW;
      desiredY += clamp((this.look.y - atlas0.y) * 0.12, -3, 3) * P.lookW;
    }
    const neckAng = Math.asin(clamp((desiredY - neckBase.y) / A.neck.length, -0.98, 0.98));
    const neckAngF = Math.cos(P.neck) >= 0 ? neckAng : Math.PI - neckAng;
    const atlas = polar(neckBase, A.neck.length, neckAngF);
    this.headAng = dt ? damp(this.headAng, headTarget, 9, dt) : headTarget;
    const h = this.headAng;
    const head = {
      atlas,
      ang: h,
      cranium: local(atlas, h, 2.4, 1.0),
      cheek: local(atlas, h, 3.6, -1.3),
      muzzle: local(atlas, h, 6.3, -1.0),
      chin: local(atlas, h, 5.4, -2.4),
      nose: local(atlas, h, 8.2, -0.2),
      eye: local(atlas, h, 5.0, 1.0),
    };

    // tail --------------------------------------------------------------
    const tailBase = local(S, aS, -2.2, 0.2);
    const tail = this.updateTail(dt, tailBase, aS);

    this.rig = { spine, S, W, aS, aW, hip, scap, legs, neckBase, atlas, head, tail, spineAt: (u) => spineAt(spine, u) };
    return this.rig;
  }

  updateTail(dt, base, aS) {
    const P = this.pose;
    const n = A.tail.segments, seg = A.tail.length / n;
    if (!this.tail) {
      this.tail = { a: [], v: [], prevBase: { ...base } };
      let a = aS + Math.PI - P.tailBase;
      for (let i = 0; i < n; i++) {
        this.tail.a.push(a);
        this.tail.v.push(0);
      }
    }
    const T = this.tail;
    const vb = dt ? scale(sub(base, T.prevBase), 1 / dt) : { x: 0, y: 0 };
    T.prevBase = { ...base };
    let wsum = 0;
    for (let i = 1; i < n; i++) wsum += (i / n) ** 2;
    const pts = [base];
    let prev = aS + Math.PI;
    for (let i = 0; i < n; i++) {
      const fi = i / n;
      let rel = i === 0 ? -P.tailBase : (-P.tailCurl * fi * fi) / wsum;
      rel += P.tailWave * Math.sin(TAU * P.tailWaveHz * this.t - i * 0.35) * fi;
      const a0 = T.a[i];
      rel += P.tailSag * 0.09 * -Math.cos(a0) * (0.3 + fi); // gravity
      const d = dir(a0);
      rel += clamp(0.0016 * (d.x * -vb.y - d.y * -vb.x), -0.35, 0.35); // drag/inertia
      const target = prev + rel;
      if (dt) {
        const s = { x: a0, v: T.v[i] };
        // unwrap so the spring goes the short way round
        s.x = target + angDiff(target, a0);
        springStep(s, target, lerp(30, 10, fi), dt);
        T.a[i] = s.x;
        T.v[i] = s.v;
      } else T.a[i] = target;
      let p = polar(pts[i], seg, T.a[i]);
      const r = lerp(A.tail.rBase, A.tail.rTip, fi) * 0.9;
      if (p.y < r) {
        // lie on the ground instead of passing through it
        p.y = r;
        const q = pts[i];
        const dx2 = seg * seg - (p.y - q.y) ** 2;
        p.x = q.x + Math.sign(Math.cos(T.a[i]) || -1) * Math.sqrt(Math.max(dx2, 0));
        T.a[i] = angleOf(sub(p, q));
      }
      pts.push(p);
      prev = T.a[i];
    }
    return pts;
  }

  updateEyes(dt) {
    const E = this.eye;
    E.blinkT -= dt;
    E.nextBlink -= dt;
    if (E.nextBlink <= 0) {
      E.blinkT = 0.16;
      E.nextBlink = 2 + Math.random() * 4;
    }
    const closed = E.blinkT > 0 ? Math.sin((Math.PI * E.blinkT) / 0.16) : 0;
    E.open = 1 - closed;
    let lx = 0, ly = 0;
    if (this.look && this.rig) {
      const d = sub(this.look, this.rig.head.eye);
      const a = angDiff(this.headAng, angleOf(d));
      lx = clamp(Math.cos(a), -1, 1);
      ly = clamp(Math.sin(a) * 2, -1, 1);
    }
    E.lookX = damp(E.lookX, lx, 14, dt);
    E.lookY = damp(E.lookY, ly, 14, dt);
  }

  record() {
    const s = {};
    for (const id of LEG_IDS) {
      const L = this.legs[id];
      s[id] = L.mode === 'planted' || (L.mode === 'gait' && L.state === 'stance');
    }
    this.history.push({ t: this.t, stance: s });
    while (this.history.length && this.history[0].t < this.t - 6) this.history.shift();
    this.metrics.v = this.v + (this.airborne ? this.vx : 0);
  }

  /** Interior joint angles (degrees) of the near-side limbs, for study read-outs. */
  jointAngles() {
    const r = this.rig;
    const H = r.legs.LH.points, F = r.legs.LF.points;
    const ilium = local(r.S, r.aS, 1.0, 0.4);
    return {
      hip: jointAngle(ilium, H[0], H[1]),
      stifle: jointAngle(H[0], H[1], H[2]),
      hock: jointAngle(H[1], H[2], H[3]),
      shoulder: jointAngle(F[0], F[1], F[2]),
      elbow: jointAngle(F[1], F[2], F[3]),
      carpus: jointAngle(F[2], F[3], F[4]),
    };
  }
}
