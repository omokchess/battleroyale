import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlatformerZone } from '../game/PlatformerZone.js';

test('platformer zone rises from the bottom and becomes lethal only after warning', () => {
  const z = new PlatformerZone(1400, 1000, 'medium');
  let t = 1000;

  z.update(t);
  assert.equal(z.phase, 'safe');
  assert.equal(z.isDamaging(), false);
  assert.equal(z.isOutside(700, 900), false);

  t += z.durSafe + 1;
  assert.equal(z.update(t), 'warning');
  assert.equal(z.isDamaging(), false);
  assert.ok(z.nextFloorY < z.floorY);

  t += z.durWarning + 1;
  assert.equal(z.update(t), 'shrinking');
  assert.equal(z.isDamaging(), true);

  t += Math.floor(z.durShrink / 2);
  z.update(t);
  assert.ok(z.floorY < z.startFloorY);
  assert.equal(z.isOutside(700, z.floorY + 2), true);
  assert.equal(z.isOutside(700, z.floorY - 30), false);
});

test('platformer zone serializes the fields clients render from', () => {
  const z = new PlatformerZone(1800, 1200, 'large');
  z.update(0);
  const s = z.serialize();
  for (const key of ['kind', 'phase', 'floorY', 'nextFloorY', 'leftX', 'rightX', 'nextLeftX', 'nextRightX']) {
    assert.ok(key in s, `missing ${key}`);
  }
  assert.equal(s.kind, 'platformer_rise');
});
