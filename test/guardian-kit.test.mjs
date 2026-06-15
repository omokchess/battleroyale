import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig, AuxSkillConfig } from '../game/Weapons.js';

test('guardian base: 18 dmg / seekRange 130 / seekIntervalMs 500 / radius 60 / 3 blades', () => {
  assert.equal(Weapons.guardian.damage, 18);
  assert.equal(Weapons.guardian.seekRange, 130);
  assert.equal(Weapons.guardian.seekIntervalMs, 500);
  assert.equal(Weapons.guardian.orbitRadius, 60);
  assert.equal(Weapons.guardian.orbitCount, 3);
});

test('guardian aux kit: 사출(launch) on R, 추적칼날(homing) on LMB', () => {
  assert.equal(AuxSkillConfig.guardian.alt.type, 'guardian_launch');
  assert.equal(AuxSkillConfig.guardian.target.type, 'guardian_homing');
});

test('F 집중 사출: fires available orbit blades at enemies within surgeRange', () => {
  const owner = new Player('o', 'Surge', 'guardian', 100, 100);
  const foe = new Player('t', 'T', 'sword', 100 + 150, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: foe };
  g.projectiles = [];
  g.effects = [];
  g._creditKill = () => {};
  const now = 3000;
  g._guardianSurge(owner, now);
  const seekProjs = g.projectiles.filter(p => p.kind === 'guardianseek' && p.ownerId === 'o');
  assert.equal(seekProjs.length, 3, '3 orbit blades dispatched by surge');
  assert.ok(owner.skillCdLeft > 0, 'F cooldown applied');
});

test('auto-seek dispatches one blade per 500ms toward an enemy in range', () => {
  const owner = new Player('o', 'Seek', 'guardian', 100, 100);
  const foe = new Player('t', 'T', 'sword', 100 + 100, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: foe };
  g.projectiles = [];
  g._creditKill = () => {};
  const now = 5000;
  g._guardianAutoSeek(now);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianseek').length, 1, '1 blade dispatched');
  g._guardianAutoSeek(now + 200);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianseek').length, 1, 'stagger blocks 2nd dispatch');
  g._guardianAutoSeek(now + 500);
  assert.equal(g.projectiles.filter(p => p.kind === 'guardianseek').length, 2, '2nd blade after 500ms');
});

test('LMB 추적 칼날 spawns a guardiandart that chases and damages', () => {
  const owner = new Player('o', 'Seek', 'guardian', 100, 100); owner.angle = 0;
  const foe = new Player('t', 'T', 'sword', 150, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: foe };
  g.projectiles = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  const now = 5000;
  g._spawnHomingBlade(owner, now);
  const blade = g.projectiles.find(p => p.kind === 'guardiandart');
  assert.ok(blade, 'guardiandart spawned');
  const before = foe.hp;
  for (let t = 0; t < 30; t++) g._updateHomingBlade(blade, 0.016, now + t * 16);
  assert.ok(foe.hp < before, 'dart reached and damaged the foe');
});
