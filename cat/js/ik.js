import { clamp, polar, dist } from './math.js';

/**
 * Three-segment "pantograph" limb solver.
 *
 * Cat limbs have three long segments below the girdle (hind: femur, tibia, metatarsus;
 * fore: scapula, humerus, radius/ulna). Kinematic studies of small therian mammals show the
 * first and third segments stay close to parallel through most of the stride (the
 * "pantograph" leg, Fischer & Blickhan 2006). We generalise that to: segment 3 is held at
 * a fixed angle `delta` relative to segment 1.
 *
 * Trick: s1·e^{iu} + s3·e^{i(u+δ)} = e^{iu}(s1 + s3·e^{iδ}) — segments 1 and 3 collapse into
 * one rigid virtual segment of length A = |s1 + s3·e^{iδ}| rotated by γ = arg(...). The limb
 * then reduces to a classic analytic 2-bone IK with lengths (A, s2). Exact, no iteration.
 *
 * bend = +1 puts the virtual joint on the +x (forward) side of base→target, which gives the
 * correct zig-zag for a right-facing cat: knee/shoulder forward, hock/elbow back.
 */
export function solvePantograph(base, target, seg, bend = 1) {
  const { s1, s2, s3, delta } = seg;
  const vx = s1 + s3 * Math.cos(delta);
  const vy = s3 * Math.sin(delta);
  const A = Math.hypot(vx, vy);
  const gamma = Math.atan2(vy, vx);
  const B = s2;

  const d = dist(base, target);
  const dMax = A + B - 1e-3;
  const dMin = Math.abs(A - B) + 1e-3;
  const dc = clamp(d, dMin, dMax);
  const phi = Math.atan2(target.y - base.y, target.x - base.x);
  const cosAlpha = (A * A + dc * dc - B * B) / (2 * A * dc);
  const alpha = Math.acos(clamp(cosAlpha, -1, 1));

  const w = phi + bend * alpha; // virtual segment direction
  const u = w - gamma; // segment-1 direction
  const j1 = polar(base, s1, u);
  const vJoint = polar(base, A, w);
  const goal = polar(base, dc, phi);
  const v = Math.atan2(goal.y - vJoint.y, goal.x - vJoint.x); // segment-2 direction
  const j2 = polar(j1, s2, v);
  const end = polar(j2, s3, u + delta);

  return {
    points: [base, j1, j2, end],
    angles: [u, v, u + delta],
    reach: d / (A + B), // >1 means the target was out of reach and the limb straightened
    error: dist(end, target), // residual (0 when reachable)
  };
}
