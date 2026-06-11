import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.effects = [];
  g.firePatches = [];
  g._patchSeq = 0;
  g.cover = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  return g;
}

test('flamethrower config: cone, fuel, no manual swing', () => {
  assert.equal(Weapons.flamethrower.automaticAttack, false);
  assert.equal(Weapons.flamethrower.type, 'cone');
  assert.ok(Weapons.flamethrower.fuelMs > 0);
  assert.ok(Weapons.flamethrower.sprayMoveSpeed < Weapons.flamethrower.moveSpeed);
});

test('spraying drains fuel, hits enemies in the cone, and locks empty', () => {
  const owner = { id: 'o', x: 100, y: 100, angle: 0, radius: 14, weapon: 'flamethrower', isDead: false, stunTimeLeft: 0, flameFuel: Weapons.flamethrower.fuelMs, flameEmpty: false, flameSpraying: false };
  const inCone = { id: 'a', x: 160, y: 100, radius: 14, isDead: false, hits: 0, isInvincible: () => false, takeDamage() { this.hits++; return false; } }; // dead ahead
  const behind = { id: 'b', x: 40, y: 100, radius: 14, isDead: false, hits: 0, isInvincible: () => false, takeDamage() { this.hits++; return false; } }; // behind
  const g = makeGame({ o: owner, a: inCone, b: behind });

  let now = 1000;
  let everEmpty = false;
  for (let i = 0; i < 200; i++) { g._updateFlamethrower(now, 0.05); if (owner.flameEmpty) everEmpty = true; now += 50; } // ~10s
  assert.ok(inCone.hits >= 1, 'enemy in the cone burns');
  assert.equal(behind.hits, 0, 'enemy behind is untouched');
  assert.ok(everEmpty, 'fuel runs out and locks for recharge at least once');
});

test('fire patch burns enemies in radius over its lifetime then expires', () => {
  const owner = { id: 'o', x: 100, y: 100, angle: 0, weapon: 'flamethrower', isDead: false, skillCdLeft: 0 };
  const victim = { id: 'v', x: 176, y: 100, radius: 14, isDead: false, hits: 0, isInvincible: () => false, takeDamage() { this.hits++; return false; } };
  const g = makeGame({ o: owner, v: victim });

  g._throwFirePatch(owner, 1000);
  assert.equal(g.firePatches.length, 1);
  assert.ok(owner.skillCdLeft > 0);
  for (let now = 1000; now <= 1000 + SkillConfig.flamethrower.patchMs + 100; now += 100) g._updateFirePatches(now);
  assert.ok(victim.hits >= 1, 'patch burned the nearby enemy');
  assert.equal(g.firePatches.length, 0, 'patch expired');
});
