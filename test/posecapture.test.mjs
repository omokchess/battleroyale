import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landmarksToPose, posesToMotion } from '../game/PoseCapture.js';
import { MOTION_LIMITS } from '../game/Motion.js';

// Build a full 33-landmark array from a sparse {index: {x,y}} map.
function lms(map) {
  const arr = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const i in map) arr[i] = { ...map[i], visibility: 1 };
  return arr;
}

test('landmarksToPose returns a stick pose with a roughly upright spine', () => {
  // A plain standing figure (image y-down): shoulders above hips, head above.
  const p = landmarksToPose(lms({
    0: { x: 0.5, y: 0.10 },                       // nose
    11: { x: 0.42, y: 0.30 }, 12: { x: 0.58, y: 0.30 }, // shoulders
    13: { x: 0.40, y: 0.45 }, 14: { x: 0.60, y: 0.45 }, // elbows
    15: { x: 0.39, y: 0.60 }, 16: { x: 0.61, y: 0.60 }, // wrists
    23: { x: 0.45, y: 0.55 }, 24: { x: 0.55, y: 0.55 }, // hips
    25: { x: 0.45, y: 0.75 }, 26: { x: 0.55, y: 0.75 }, // knees
    27: { x: 0.45, y: 0.95 }, 28: { x: 0.55, y: 0.95 }, // ankles
  }), { mirror: false });
  assert.ok(p, 'pose should be produced');
  // neck above pelvis → spine points up → angle near -90.
  assert.ok(Math.abs(p.spine + 90) < 35, `spine ~ -90, got ${p.spine}`);
  // legs hang downward → near +90.
  assert.ok(Math.abs(p.legNearU - 90) < 35, `legNearU ~ 90, got ${p.legNearU}`);
  // all angles within the schema clamp
  for (const k in p) assert.ok(p[k] >= MOTION_LIMITS.angleMin && p[k] <= MOTION_LIMITS.angleMax);
});

test('landmarksToPose rejects missing / low-confidence frames', () => {
  assert.equal(landmarksToPose(null), null);
  assert.equal(landmarksToPose([{ x: 0.5, y: 0.5 }]), null); // too short
  const arr = lms({ 11: { x: 0.4, y: 0.3 } });
  arr[12] = { x: 0.6, y: 0.3, visibility: 0.1 };             // low-confidence shoulder
  assert.equal(landmarksToPose(arr), null);
});

test('posesToMotion downsamples to <= 8 keyframes and is sanitized', () => {
  const base = { spine: -90, head: -90, armNearU: 60, armNearL: 75, armFarU: 110, armFarL: 95, legNearU: 86, legNearL: 90, legFarU: 96, legFarL: 92 };
  const seq = Array.from({ length: 30 }, (_, i) => ({ ...base, spine: -90 + i }));
  const m = posesToMotion(seq, 0.9);
  assert.ok(m, 'motion produced');
  assert.ok(m.keyframes.length <= 8 && m.keyframes.length >= 2);
  assert.equal(m.keyframes[0].t, 0);
  assert.equal(m.keyframes[m.keyframes.length - 1].t, 1);
  assert.ok(m.events.some(e => e.type === 'impact'));
  assert.ok(m.duration <= MOTION_LIMITS.maxDuration);
});

test('posesToMotion needs at least two frames', () => {
  assert.equal(posesToMotion([], 0.5), null);
  assert.equal(posesToMotion([{ spine: -90 }], 0.5), null);
});
