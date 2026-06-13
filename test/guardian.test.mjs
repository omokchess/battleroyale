import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.projectiles = [];
  g.effects = [];
  g._creditKill = () => {};
  return g;
}

test('guardian config: no manual attack, orbit reach', () => {
  assert.equal(Weapons.guardian.automaticAttack, false);
  assert.ok(Weapons.guardian.orbitRadius > 0);
  assert.ok(SkillConfig.guardian.launchDamage > 0);
});

test('orbiting blades damage a touching enemy, then respect the re-hit gap', () => {
  const owner = { id: 'o', x: 100, y: 100, radius: 14, weapon: 'guardian', isDead: false };
  // Place the target right on the orbit ring so a blade reaches it at some angle.
  const target = { id: 't', x: 100 + Weapons.guardian.orbitRadius, y: 100, radius: 14, isDead: false,
    hits: 0, isInvincible: () => false, takeDamage() { this.hits++; return false; } };
  const g = makeGame({ o: owner, t: target });

  // Sweep a full revolution; the blade must connect at least once.
  for (let now = 0; now <= 1200; now += 30) g._updateGuardianBlades(now);
  assert.ok(target.hits >= 1, 'orbit should hit a target on the ring');
  // Re-hit gap caps how often it can land (≈ window / rehitMs + slack).
  assert.ok(target.hits <= Math.ceil(1200 / Weapons.guardian.rehitMs) + 1);
});

test('launched blades suppress orbit damage and boomerang back', () => {
  const owner = { id: 'o', x: 100, y: 100, radius: 14, weapon: 'guardian', isDead: false, skillCdLeft: 0 };
  const g = makeGame({ o: owner });
  g.mapWidth = 700; g.mapHeight = 700; g.cover = [];

  g._launchGuardianBlades(owner, 1000);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianblade').length, Weapons.guardian.orbitCount);
  // Launch is now the LMB aux; its cooldown is governed by the executor, so
  // _launchGuardianBlades itself no longer stamps the F skill cooldown.

  // While blades are out, orbit deals no damage even to an on-ring target.
  const target = { id: 't', x: 100 + Weapons.guardian.orbitRadius, y: 100, radius: 14, isDead: false,
    hits: 0, isInvincible: () => false, takeDamage() { this.hits++; return false; } };
  g.players.t = target;
  for (let now = 1000; now <= 1300; now += 30) g._updateGuardianBlades(now);
  assert.equal(target.hits, 0, 'orbit disarmed while launched');
});
