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

test('F self-pull yanks the player toward a wall, stopping short', () => {
  const player = { id: 'p', x: 350, y: 350, radius: 14, angle: 0, weapon: 'harpoon', isDead: false, skillCdLeft: 0, prevX: 350, prevY: 350 };
  const g = Object.create(Game.prototype);
  g.players = { p: player };
  g.effects = [];
  g.cover = [];
  g.mapWidth = 700; g.mapHeight = 700;

  g._harpoonPull(player, 1000);
  // Wall edge is 350px away (x=700); that's closer than pullRange(360), so the
  // pull stops stopGap short of the wall.
  const dist = Math.min(SkillConfig.harpoon.pullRange, 350);
  const expected = 350 + (dist - SkillConfig.harpoon.stopGap);
  assert.ok(Math.abs(player.x - expected) < 2, `pulled to ~${expected}, got ${player.x}`);
  assert.ok(player.skillCdLeft > 0);
  assert.equal(player.prevX, player.x); // discontinuous move recorded
});

test('the harpoon weapon is a finite-range projectile that can spread=0', () => {
  // The pull itself is applied in the projectile-hit branch (integration), but
  // verify the disc is a normal finite projectile so it expires by distance.
  assert.ok(Number.isFinite(Weapons.harpoon.range));
  assert.equal(Weapons.harpoon.spreadDeg, undefined); // precise, no spread
});
