import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Collision } from '../game/Collision.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

test('harpoon config exists with pull tuning', () => {
  assert.equal(Weapons.harpoon.projectileKind, 'harpoon');
  assert.ok(SkillConfig.harpoon.pullToFront > 0);
  assert.ok(SkillConfig.harpoon.pullRange > 0);
});

test('F grapple anchors toward a wall and zips the player short of it', () => {
  // Pivot: harpoon F is now a grapple — it anchors along the aim and sets a
  // grapple target the player ZIPS toward over the next ticks (not an instant
  // teleport). Verify the anchor target lands stopGap short of the wall.
  const player = { id: 'p', x: 350, y: 350, radius: 14, halfW: 13, halfH: 20, angle: 0, weapon: 'harpoon', isDead: false, skillCdLeft: 0, vx: 0, vy: 0 };
  const g = Object.create(Game.prototype);
  g.players = { p: player };
  g.effects = [];
  g.cover = [];
  g.level = null;
  g.mapWidth = 700; g.mapHeight = 700;

  g._harpoonPull(player, 1000);
  // Wall edge is 350px away (x=700); closer than pullRange(360), so the grapple
  // target sits stopGap short of the wall.
  const dist = Math.min(SkillConfig.harpoon.pullRange, 350);
  const expectedTarget = 350 + (dist - SkillConfig.harpoon.stopGap);
  assert.equal(player.grappling, true);
  assert.ok(Math.abs(player.grappleX - expectedTarget) < 2, `grapple target ~${expectedTarget}, got ${player.grappleX}`);
  assert.ok(player.skillCdLeft > 0);
});

test('the harpoon weapon is a finite-range projectile that can spread=0', () => {
  // The pull itself is applied in the projectile-hit branch (integration), but
  // verify the disc is a normal finite projectile so it expires by distance.
  assert.ok(Number.isFinite(Weapons.harpoon.range));
  assert.equal(Weapons.harpoon.spreadDeg, undefined); // precise, no spread
});
