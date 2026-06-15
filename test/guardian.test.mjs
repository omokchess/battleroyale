import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.projectiles = [];
  g.effects = [];
  g._creditKill = () => {};
  return g;
}

test('guardian config: no manual attack, seek range 130', () => {
  assert.equal(Weapons.guardian.automaticAttack, false);
  assert.equal(Weapons.guardian.seekRange, 130);
  assert.ok(SkillConfig.guardian.launchDamage > 0);
});

test('auto-seek does not dispatch when no enemy is in seekRange', () => {
  const owner = { id: 'o', x: 100, y: 100, radius: 14, weapon: 'guardian', isDead: false,
    guardianNextSeekAt: 0 };
  const farFoe = { id: 't', x: 100 + 200, y: 100, radius: 14, isDead: false,
    isInvincible: () => false };
  const g = makeGame({ o: owner, t: farFoe });
  g._guardianAutoSeek(5000);
  assert.equal(g.projectiles.length, 0, 'no dispatch when foe is outside 130px');
});

test('seek blade flies to target, deals damage, returns to owner', () => {
  const owner = new Player('o', 'Def', 'guardian', 100, 100);
  const foe = new Player('t', 'T', 'sword', 100 + 80, 100);
  const g = makeGame({ o: owner, t: foe });
  g.mapWidth = 700; g.mapHeight = 700;
  g._guardianAutoSeek(5000);
  const blade = g.projectiles.find(p => p.kind === 'guardianseek');
  assert.ok(blade, 'seek blade spawned');
  const before = foe.hp;
  for (let t = 0; t < 60; t++) g._updateGuardianSeek(blade, 0.016, 5000 + t * 16);
  assert.ok(foe.hp < before, 'seek blade damaged the foe');
  assert.equal(blade.phase, 'return', 'blade enters return phase after hit');
});

test('launched blades fire as guardianlaunch kind (do not rejoin orbit)', () => {
  const owner = { id: 'o', x: 100, y: 100, radius: 14, weapon: 'guardian', isDead: false, skillCdLeft: 0 };
  const g = makeGame({ o: owner });
  g.mapWidth = 700; g.mapHeight = 700; g.cover = [];
  g._launchGuardianBlades(owner, 1000);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianlaunch').length, Weapons.guardian.orbitCount);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianseek').length, 0);
});
