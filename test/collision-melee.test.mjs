import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collision } from '../game/Collision.js';

const attacker = (over = {}) => ({ id: 'a', x: 0, y: 0, angle: 0, radius: 14, ...over });
// A target whose prev/current position you control. radius 14 by default.
const target = (x, y, prevX = x, prevY = y, over = {}) =>
  ({ id: 'b', x, y, prevX, prevY, radius: 14, isDead: false, ...over });

const RAPIER = { type: 'melee_precise_line', range: 87, width: 1 };
// Greatsword-style narrow blade sweep (±30°).
const CLEAVE = { type: 'melee_arc', hitMode: 'melee_blade_sweep', range: 88, angle: 60, bladeHalfWidth: 18 };

test('thin line: a stationary target off the blade axis is missed', () => {
  // 30px off the +x axis, well outside halfWidth(0.5)+radius(14).
  assert.equal(Collision.checkMeleeHit(attacker(), target(40, 30), RAPIER), false);
});

test('thin line: a target sweeping ACROSS the blade between frames connects', () => {
  // Same endpoint, but this frame it crossed from y=-30 to y=+30 through y=0.
  const t = target(40, 30, 40, -30);
  assert.equal(Collision.checkMeleeHit(attacker(), t, RAPIER), true);
});

test('thin line: a stationary on-axis target still hits (identity preserved)', () => {
  assert.equal(Collision.checkMeleeHit(attacker(), target(40, 0), RAPIER), true);
});

test('thin line: out of range is still a miss', () => {
  assert.equal(Collision.checkMeleeHit(attacker(), target(200, 0), RAPIER), false);
});

test('teleport-sized jumps do NOT sweep a giant line (collapse to a point)', () => {
  // Endpoint is far off-axis; the "path" would cross the blade, but the 600px
  // jump is treated as a teleport so only the current point is tested → miss.
  const t = target(40, 300, 40, -300);
  assert.equal(Collision.checkMeleeHit(attacker(), t, RAPIER), false);
});

test('blade sweep: target crossing into the fan between frames connects', () => {
  // Current position is outside the ±30° fan; previous was dead ahead.
  const t = target(60, 80, 60, 0);
  assert.equal(Collision.checkMeleeHit(attacker(), t, CLEAVE), true);
  // Stationary at the outside position misses.
  assert.equal(Collision.checkMeleeHit(attacker(), target(60, 80), CLEAVE), false);
});

test('missing prev fields fall back to a point test (no crash)', () => {
  const t = { id: 'b', x: 40, y: 0, radius: 14, isDead: false }; // no prevX/prevY
  assert.equal(Collision.checkMeleeHit(attacker(), t, RAPIER), true);
});

test('self and dead targets never register', () => {
  const self = { id: 'a', x: 40, y: 0, radius: 14, isDead: false };
  assert.equal(Collision.checkMeleeHit(attacker(), self, RAPIER), false);
  assert.equal(Collision.checkMeleeHit(attacker(), target(40, 0, 40, 0, { isDead: true }), RAPIER), false);
});
