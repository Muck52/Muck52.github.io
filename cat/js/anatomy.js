import { deg } from './math.js';

/**
 * Reference animal: adult domestic shorthair, ~4.5 kg, head-body ≈ 46 cm, tail ≈ 27 cm,
 * withers ≈ 25 cm. Units: centimetres / radians. See study.html §2 for sources & reasoning.
 *
 * Bone lengths are functional lengths (joint centre to joint centre), not max bone length.
 */
export const ANATOMY = {
  massKg: 4.5,

  // Axial skeleton --------------------------------------------------------
  vertebrae: { cervical: 7, thoracic: 13, lumbar: 7, sacral: 3, caudal: 20 },
  spine: { length: 27 }, // withers (T1) → sacrum (S1), measured along the curve
  pelvis: { back: 2.6, down: 3.6, ischium: 3.6 }, // hip joint offset from sacrum, spine frame
  scapulaPivot: { back: 1.4, down: 0.8 }, // rotation centre of the scapula, from the withers
  neck: { length: 8.5 },
  head: { length: 9.0, height: 6.5 },
  tail: { length: 27, segments: 20, rBase: 1.5, rTip: 0.7 },

  // Limbs: s1/s2/s3 = proximal/middle/distal long segments, delta = s3 angle relative to s1.
  fore: {
    s1: 7.2, // scapula: dorsal border pivot → shoulder joint
    s2: 9.2, // humerus
    s3: 8.8, // radius/ulna
    delta: deg(-30), // forearm held ~30° steeper than the scapula
    meta: 3.0, // carpus + metacarpus (wrist → knuckle)
    toe: 1.9, // digits
    padH: 0.9, // knuckle height above ground in stance
  },
  hind: {
    s1: 9.6, // femur
    s2: 10.4, // tibia/fibula
    s3: 5.6, // tarsus + metatarsus (hock → ball of foot)
    delta: deg(-8),
    toe: 2.4,
    padH: 1.0,
    heel: 1.5, // calcaneal tuber projection behind the hock
  },
};

/** Standing hip-joint height, used as "leg length" h for Froude scaling (cm). */
export const HIP_HEIGHT = 23;

/**
 * Soft-tissue envelope of the trunk: [u, dorsal, ventral] where u is position along the spine
 * (0 = sacrum, 1 = withers; values outside extrapolate along the end tangents) and the two
 * numbers are distances (cm) above/below the spine line.
 */
export const TORSO_PROFILE = [
  [-0.17, 0.2, 1.8],
  [-0.12, 1.7, 5.2],
  [-0.04, 2.3, 7.6],
  [0.1, 2.2, 8.9], // haunch
  [0.3, 1.8, 9.0], // loin (primordial pouch hangs here)
  [0.5, 1.8, 9.6],
  [0.68, 2.0, 10.8],
  [0.84, 2.4, 11.6], // deepest chest, just behind the elbow
  [0.97, 2.8, 11.0],
  [1.06, 2.6, 8.4], // point of the chest / manubrium
  [1.12, 1.6, 4.0],
];
