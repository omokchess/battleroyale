import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Projectile } from '../game/Projectile.js';

test('infinite-range arrows stop when they hit the arena wall', () => {
  const arrow = new Projectile('arrow-1', 'player-1', 690, 350, 0, 520, Infinity, 38);

  arrow.update(0.1);

  assert.equal(arrow.isDead, false);
  assert.equal(arrow.checkWallCollision(700, 700), true);
  assert.equal(arrow.isDead, true);
  assert.equal(arrow.hitWall, true);
  assert.equal(arrow.x, 695);
});

test('finite-range projectiles still expire by distance', () => {
  const projectile = new Projectile('short-1', 'player-1', 100, 100, 0, 100, 10, 1);

  projectile.update(0.11);

  assert.equal(projectile.isDead, true);
  assert.equal(projectile.hitWall, undefined);
});
