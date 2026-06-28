/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Motion layer (Phase B of the stickman pivot): the formal motion schema, a
 * sanitizer/validator, the per-weapon motion-set registry, and the per-player
 * animation state machine (StickAnimator). Rendering + the FK skeleton live in
 * Stickman.js; this module decides WHICH motion plays and guarantees any motion
 * data — built-in, user-authored (Phase C) or AI-derived (Phase D) — is safe.
 *
 * Schema (the format the editor and AI both emit):
 *   {
 *     duration: seconds (clamped),
 *     loop: bool,
 *     keyframes: [{ t: 0..1, pose: { joint: degrees } }],   // ≤ MAX_KEYFRAMES
 *     events:    [{ t: 0..1, type: 'impact'|'projectile'|'sfx' }]
 *   }
 * Angles are absolute degrees (see Stickman.js). Joints outside the known set
 * are dropped; missing joints inherit the neutral pose at sample time.
 *
 * INVARIANT: motions are pure cosmetics. They never carry hitbox/range/damage/
 * cooldown/physics — those stay in Weapons.js / Game.js. The engine only aligns a
 * motion's `impact` event to the weapon's fixed hit window. Incoming P2P motion
 * data is clamped + schema-checked here and falls back to the default on any
 * mismatch (a malicious or out-of-date peer can't crash or cheat via motions).
 */

import { STICK_MOTIONS, STICK_NEUTRAL, samplePose, WEAPON_STICK_COLOR } from './Stickman.js';

const JOINTS = Object.keys(STICK_NEUTRAL);
const JOINT_SET = new Set(JOINTS);
const VALID_EVENTS = new Set(['impact', 'projectile', 'sfx']);

// Hard limits enforced on every motion (built-in, user or AI). The editor budget
// (Phase C) is stricter still (≤ 8 keyframes); these are the absolute ceilings.
export const MOTION_LIMITS = {
  minDuration: 0.05,
  maxDuration: 6,
  maxKeyframes: 16,
  maxEvents: 12,
  angleMin: -360,
  angleMax: 360,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The guaranteed-safe fallback motion (a calm idle) returned for any invalid input.
export const DEFAULT_MOTION = Object.freeze(deepFreeze(cloneMotion(STICK_MOTIONS.idle)));

/**
 * Validate + clamp arbitrary motion data into a safe motion. Returns a brand-new
 * object (never aliases the input). On any structural problem returns a clone of
 * `fallback` (default: DEFAULT_MOTION) so callers always get something playable.
 */
export function sanitizeMotion(raw, fallback = DEFAULT_MOTION) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.keyframes) || raw.keyframes.length === 0) {
    return cloneMotion(fallback);
  }
  const duration = Number.isFinite(raw.duration)
    ? clamp(raw.duration, MOTION_LIMITS.minDuration, MOTION_LIMITS.maxDuration)
    : 0.5;

  const kfsIn = raw.keyframes.slice(0, MOTION_LIMITS.maxKeyframes);
  const keyframes = [];
  for (const kf of kfsIn) {
    if (!kf || typeof kf !== 'object' || typeof kf.pose !== 'object' || !kf.pose) continue;
    const t = Number.isFinite(kf.t) ? clamp(kf.t, 0, 1) : 0;
    const pose = {};
    for (const j in kf.pose) {
      if (!JOINT_SET.has(j)) continue;                       // drop unknown joints
      const a = kf.pose[j];
      if (!Number.isFinite(a)) continue;
      pose[j] = clamp(a, MOTION_LIMITS.angleMin, MOTION_LIMITS.angleMax);
    }
    keyframes.push({ t, pose });
  }
  if (!keyframes.length) return cloneMotion(fallback);
  keyframes.sort((a, b) => a.t - b.t);

  const events = [];
  if (Array.isArray(raw.events)) {
    for (const e of raw.events.slice(0, MOTION_LIMITS.maxEvents)) {
      if (!e || !VALID_EVENTS.has(e.type)) continue;
      events.push({ t: Number.isFinite(e.t) ? clamp(e.t, 0, 1) : 0, type: e.type });
    }
  }
  return { duration, loop: !!raw.loop, keyframes, events };
}

/** Sanitize a whole motion set ({ stateName: motion }). Unknown states pass
 *  through (any state name is allowed); every motion is individually sanitized. */
export function sanitizeMotionSet(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const state in raw) out[state] = sanitizeMotion(raw[state]);
  }
  return out;
}

// --- Weapon-flavoured attack motions ---------------------------------------
// These mostly animate the torso/legs (the weapon arm follows the aim in
// Stickman.drawStickman), giving each family a distinct weight. impact marks the
// frame the engine aligns to the real hit.
const ATTACK_THRUST = {              // spear / rapier / harpoon: quick forward lunge
  duration: 0.34, loop: false,
  keyframes: [
    { t: 0,    pose: { spine: -94, legNearU: 80, legFarU: 100, armFarU: 120 } },
    { t: 0.35, pose: { spine: -86, legNearU: 64, legFarU: 112 } },
    { t: 0.5,  pose: { spine: -80, legNearU: 58, legFarU: 116, armFarU: 80 } },
    { t: 1,    pose: { spine: -90, legNearU: 84, legFarU: 96, armFarU: 110 } },
  ],
  events: [{ t: 0.5, type: 'impact' }],
};
const ATTACK_HEAVY = {               // hammer / greatsword / axe: big overhead slam
  duration: 0.62, loop: false,
  keyframes: [
    { t: 0,    pose: { spine: -84, armFarU: 150, legNearU: 86, legFarU: 92 } },
    { t: 0.35, pose: { spine: -70, armFarU: 175, legNearU: 92, legFarU: 84 } },
    { t: 0.55, pose: { spine: -108, armFarU: 50, legNearU: 66, legFarU: 110 } },
    { t: 1,    pose: { spine: -88, armFarU: 120, legNearU: 84, legFarU: 96 } },
  ],
  events: [{ t: 0.55, type: 'impact' }],
};
const ATTACK_RANGED = {              // bow / guns / chakram / staff: braced + recoil
  duration: 0.3, loop: false,
  keyframes: [
    { t: 0,   pose: { spine: -90, legNearU: 78, legFarU: 100, armFarU: 110 } },
    { t: 0.4, pose: { spine: -92, legNearU: 76, legFarU: 102, armFarU: 100 } },
    { t: 0.5, pose: { spine: -94, legNearU: 74, legFarU: 104 } },   // recoil kick
    { t: 1,   pose: { spine: -90, legNearU: 78, legFarU: 100, armFarU: 110 } },
  ],
  events: [{ t: 0.45, type: 'projectile' }],
};

// Sparse motion sets: each only overrides what differs from the base locomotion
// (STICK_MOTIONS). Resolution falls back base → idle, so a set need only name its
// signature moves. Registered (sanitized) at module load.
const BUILTIN_SETS = {
  default: {},
  thrust:  { attack: ATTACK_THRUST },
  heavy:   { attack: ATTACK_HEAVY },
  ranged:  { attack: ATTACK_RANGED },
};

// Weapon → motion-set id. Anything unlisted uses 'default'.
const WEAPON_SET_ID = {
  spear: 'thrust', rapier: 'thrust', harpoon: 'thrust', dagger: 'thrust',
  hammer: 'heavy', greatsword: 'heavy', axe: 'heavy',
  bow: 'ranged', pistols: 'ranged', sniper: 'ranged', chakram: 'ranged', magicstaff: 'ranged',
};

// The live registry (built-ins + any user/AI sets registered at runtime).
const MOTION_SETS = {};
for (const id in BUILTIN_SETS) MOTION_SETS[id] = sanitizeMotionSet(BUILTIN_SETS[id]);

/**
 * Register a user/AI motion set under an id (e.g. a content hash). The set is
 * sanitized before storage, so nothing unsafe ever enters the registry. Phase C
 * (editor) and Phase D (AI) call this; multiplayer only ever ships the id.
 */
export function registerMotionSet(id, rawSet) {
  if (!id || typeof id !== 'string') return null;
  MOTION_SETS[id] = sanitizeMotionSet(rawSet);
  return id;
}

export function hasMotionSet(id) { return !!(id && MOTION_SETS[id]); }

/** A loadout id received over the wire is honoured only if we actually hold that
 *  set locally; otherwise null → caller falls back to the weapon's default set. */
export function sanitizeMotionSetId(id) {
  return (typeof id === 'string' && MOTION_SETS[id]) ? id : null;
}

export function weaponSetId(weapon) { return WEAPON_SET_ID[weapon] || 'default'; }
export function weaponStickColor(weapon) { return WEAPON_STICK_COLOR[weapon] || null; }

/**
 * Resolve the motion for (setId, stateName): the set's own motion, else the base
 * locomotion, else idle. Always returns a safe, sanitized motion.
 */
export function resolveMotion(setId, stateName) {
  const set = MOTION_SETS[setId] || MOTION_SETS.default;
  if (set && set[stateName]) return set[stateName];
  if (STICK_MOTIONS[stateName]) return STICK_MOTIONS[stateName];
  return STICK_MOTIONS.idle;
}

/**
 * Per-player animation state machine (one per id, kept on the Renderer). Picks
 * the locomotion motion from synced flags (vx/grounded/vy) and times the attack
 * swing off lastAttackTime so the impact frame lines up with the real hit. The
 * motion set comes from the player's synced loadout id, falling back to the
 * weapon's default set — combat is unaffected either way.
 */
export class StickAnimator {
  constructor() { this.state = {}; }

  _for(id) {
    if (!this.state[id]) {
      this.state[id] = { motion: 'idle', phase: 0, last: 0, attackUntil: 0, attackStart: 0, attackDur: 0.42, prevAttack: 0 };
    }
    return this.state[id];
  }

  /** Advance + sample a player's pose this frame. Returns { pose, motionName }. */
  sample(player, now) {
    const s = this._for(player.id);
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
    s.last = now;

    const setId = sanitizeMotionSetId(player.motionSetId) || weaponSetId(player.weapon);
    const moving = Math.abs(player.vx || 0) > 30;
    const airborne = player.grounded === false;
    const vy = player.vy || 0;

    // Attack trigger: lastAttackTime advanced this frame → (re)start the swing,
    // using the resolved attack motion's own duration for impact alignment.
    if (player.lastAttackTime && player.lastAttackTime !== s.prevAttack) {
      s.prevAttack = player.lastAttackTime;
      s.attackStart = now;
      s.attackDur = resolveMotion(setId, 'attack').duration || 0.42;
      s.attackUntil = now + s.attackDur * 1000;
    }
    const attacking = now < s.attackUntil;

    let motionName;
    if (attacking) motionName = 'attack';
    else if (airborne) motionName = vy < -40 ? 'jump' : 'fall';
    else if (moving) motionName = 'run';
    else motionName = 'idle';

    const motion = resolveMotion(setId, motionName);
    if (motionName !== s.motion) { s.motion = motionName; s.phase = 0; }

    let speedMul = 1;
    if (motionName === 'run') speedMul = Math.min(2.2, Math.max(0.7, Math.abs(player.vx || 0) / 300));
    if (motionName === 'attack') {
      s.phase = Math.min(0.999, (now - s.attackStart) / 1000 / (s.attackDur || 0.42));
    } else {
      s.phase += (dt / (motion.duration || 0.5)) * speedMul;
      if (motion.loop) s.phase %= 1; else s.phase = Math.min(0.999, s.phase);
    }

    return { pose: samplePose(motion, s.phase), motionName };
  }
}

// --- small helpers ----------------------------------------------------------
function cloneMotion(m) {
  return {
    duration: m.duration, loop: !!m.loop,
    keyframes: m.keyframes.map(k => ({ t: k.t, pose: { ...k.pose } })),
    events: (m.events || []).map(e => ({ t: e.t, type: e.type })),
  };
}
function deepFreeze(m) {
  m.keyframes.forEach(k => { Object.freeze(k.pose); Object.freeze(k); });
  Object.freeze(m.keyframes);
  (m.events || []).forEach(e => Object.freeze(e));
  Object.freeze(m.events);
  return m;
}
