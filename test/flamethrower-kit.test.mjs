import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, AuxSkillConfig } from '../game/Weapons.js';

test('flamethrower base buff: 7/tick, range 105, 3.5s fuel, burns', () => {
  const f = Weapons.flamethrower;
  assert.equal(f.damage, 7);
  assert.equal(f.range, 105);
  assert.equal(f.fuelMs, 3500);
  assert.equal(f.burn, true);
});

test('flamethrower aux kit: 점화(fire_bomb) + 열기방패(heat_shield)', () => {
  const kit = AuxSkillConfig.flamethrower;
  assert.equal(kit.alt.type, 'fire_bomb');
  assert.ok(kit.alt.burn && kit.alt.radius > 0);
  assert.equal(kit.target.type, 'heat_shield');
});

test('점화 bursts for AoE damage + burn', () => {
  const owner = new Player('o', 'Pyro', 'flamethrower', 100, 100); owner.angle = 0;
  const victim = new Player('t', 'T', 'sword', 100 + 88, 100); // at the bomb center (range 88)
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: victim };
  g.effects = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  const before = victim.hp;
  g._executeAuxSkill(owner, AuxSkillConfig.flamethrower.alt, 1000, 'alt');
  assert.ok(victim.hp < before, 'fire bomb damaged the victim');
  assert.ok(victim.burnTimeLeft > 0, 'fire bomb applied burn');
});

test('열기 방패 reduces incoming damage by 30% while active', () => {
  const p = new Player('p', 'Shield', 'flamethrower', 100, 100);
  p.heatShieldUntil = Date.now() + 1000;
  const start = p.hp;
  p.takeDamage(100, 'x');
  assert.equal(start - p.hp, 70); // 30% reduced
});
