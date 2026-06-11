import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Zone } from '../game/Zone.js';

test('zone cycles safe → warning → shrinking → hold → safe', () => {
  const z = new Zone(700, 700, 'tiny');
  let t = 1000;

  z.update(t);
  assert.equal(z.phase, 'safe');
  assert.ok(Math.abs(z.radius - z.maxRadius) < 1e-6);
  assert.equal(z.isDamaging(), false);

  t += z.durSafe + 1;
  assert.equal(z.update(t), 'warning');
  // The next circle is smaller and stays fully inside the arena.
  assert.ok(z.nextRadius >= z.minRadius - 1e-6);
  assert.ok(z.nextRadius <= z.maxRadius + 1e-6);
  assert.ok(z.nextCx - z.nextRadius >= -1e-6 && z.nextCx + z.nextRadius <= 700 + 1e-6);
  assert.ok(z.nextCy - z.nextRadius >= -1e-6 && z.nextCy + z.nextRadius <= 700 + 1e-6);

  t += z.durWarning + 1;
  assert.equal(z.update(t), 'shrinking');
  assert.equal(z.isDamaging(), true);

  t += z.durShrink + 1;
  assert.equal(z.update(t), 'hold');
  assert.ok(Math.abs(z.radius - z.nextRadius) < 1e-6);
  assert.equal(z.isDamaging(), true);

  t += z.durHold + 1;
  assert.equal(z.update(t), 'safe');
  assert.ok(Math.abs(z.radius - z.maxRadius) < 1e-6);
  assert.equal(z.isDamaging(), false);
});

test('isOutside reflects the current safe circle', () => {
  const z = new Zone(700, 700, 'tiny');
  z.update(0);
  // Shrink the circle by forcing a small hold state.
  z.cx = 350; z.cy = 350; z.radius = 100;
  assert.equal(z.isOutside(350, 350), false);   // dead center
  assert.equal(z.isOutside(350 + 150, 350), true); // 150px out > radius 100
});

test('serialize exposes the fields clients render from', () => {
  const z = new Zone(1400, 1400, 'medium');
  z.update(0);
  const s = z.serialize();
  for (const k of ['phase', 'cx', 'cy', 'radius', 'nextCx', 'nextCy', 'nextRadius']) {
    assert.ok(k in s, `missing ${k}`);
  }
});

test('bigger arenas get a larger min radius and longer shrink', () => {
  const small = new Zone(700, 700, 'tiny');
  const big = new Zone(2200, 2200, 'huge');
  assert.ok(big.minRadius > small.minRadius);
  assert.ok(big.durShrink > small.durShrink);
});
