import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig, AuxSkillConfig } from '../game/Weapons.js';

test('guardian base buff: 18 dmg / 400ms rehit / radius 60 / 3 blades', () => {
  assert.equal(Weapons.guardian.damage, 18);
  assert.equal(Weapons.guardian.rehitMs, 400);
  assert.equal(Weapons.guardian.orbitRadius, 60);
  assert.equal(Weapons.guardian.orbitCount, 3);
});

test('guardian aux kit: 사출(launch) on R, 추적칼날(homing) on LMB', () => {
  assert.equal(AuxSkillConfig.guardian.alt.type, 'guardian_launch');
  assert.equal(AuxSkillConfig.guardian.target.type, 'guardian_homing');
});

test('F 수호 태세 widens the orbit and sets the buff window', () => {
  const owner = new Player('o', 'Stance', 'guardian', 100, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner };
  g.projectiles = [];
  const now = 3000;
  g._guardianStance(owner, now);
  assert.ok(owner.guardianStanceUntil > now);
  const r0 = g._guardianBladePositions(owner, now)[0];
  const baseR = Math.hypot(r0.x - owner.x, r0.y - owner.y);
  assert.ok(baseR > Weapons.guardian.orbitRadius - 0.01, 'orbit radius widened during stance');
});

test('LMB 추적 칼날 spawns a homing blade that chases and damages', () => {
  const owner = new Player('o', 'Seek', 'guardian', 100, 100); owner.angle = 0;
  const foe = new Player('t', 'T', 'sword', 150, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: foe };
  g.projectiles = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  const now = 5000;
  g._spawnHomingBlade(owner, now);
  const blade = g.projectiles.find(p => p.kind === 'guardianhoming');
  assert.ok(blade, 'homing blade spawned');
  const before = foe.hp;
  // advance the blade toward the foe a few ticks
  for (let t = 0; t < 30; t++) g._updateHomingBlade(blade, 0.016, now + t * 16);
  assert.ok(foe.hp < before, 'homing blade reached and damaged the foe');
});
