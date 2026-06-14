import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, AuxSkillConfig } from '../game/Weapons.js';

test('chakram base buff: 26 dmg / 750ms cd / 1 wall reflect', () => {
  assert.equal(Weapons.chakram.damage, 26);
  assert.equal(Weapons.chakram.cooldown, 750);
  assert.equal(Weapons.chakram.wallReflect, 1);
});

test('chakram has a full R(3연발)/LMB(맴돌이) aux kit', () => {
  const kit = AuxSkillConfig.chakram;
  assert.ok(kit.alt && kit.alt.deflectProjectile, 'R deflects projectiles');
  assert.equal(kit.alt.type, 'chakram_throw');
  assert.equal(kit.alt.count, 3);
  assert.equal(kit.target.type, 'chakram_orbit');
  assert.ok(kit.target.durationMs > 0 && kit.target.orbitDamage > 0);
});

test('R throws 3 chakram discs', () => {
  const owner = new Player('o', 'Tri', 'chakram', 120, 120); owner.angle = 0;
  const g = Object.create(Game.prototype);
  g.players = { o: owner };
  g.projectiles = [];
  g.effects = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._executeAuxSkill(owner, AuxSkillConfig.chakram.alt, 5000, 'alt');
  const discs = g.projectiles.filter(p => p.kind === 'chakram');
  assert.equal(discs.length, 3);
});

test('LMB 맴돌이 disc deals contact damage to a nearby enemy', () => {
  const owner = new Player('o', 'Disc', 'chakram', 100, 100);
  const target = new Player('t', 'T', 'sword', 100, 100);
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: target };
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};

  const now = 10000;
  // Activate the orbit and place the target where the disc will be this tick.
  g._executeAuxSkill(owner, AuxSkillConfig.chakram.target, now, 'target');
  const ang = (now / 140) % (Math.PI * 2);
  target.x = owner.x + Math.cos(ang) * owner.chakramOrbitRadius;
  target.y = owner.y + Math.sin(ang) * owner.chakramOrbitRadius;

  const before = target.hp;
  g._updateChakramOrbit(now);
  assert.ok(target.hp < before, 'orbit disc damaged the adjacent enemy');
});

test('쳐내기 deflects one incoming enemy projectile in front', () => {
  const owner = new Player('o', 'Parry', 'chakram', 100, 100); owner.angle = 0;
  const g = Object.create(Game.prototype);
  g.players = { o: owner };
  // a foe arrow just in front of the player, within reach
  const arrow = { id: 'a', ownerId: 'x', x: 140, y: 100, radius: 6, isDead: false };
  g.projectiles = [arrow];
  g._deflectProjectile(owner, 60);
  assert.equal(arrow.isDead, true);
});
