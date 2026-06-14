import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig, AuxSkillConfig } from '../game/Weapons.js';

test('harpoon base buff: 16 dmg / range 230, pull stuns 0.4s', () => {
  assert.equal(Weapons.harpoon.damage, 16);
  assert.equal(Weapons.harpoon.range, 230);
  assert.equal(SkillConfig.harpoon.pullStunMs, 400);
  assert.equal(SkillConfig.harpoon.cooldownMs, 4000); // F 당겨가기
});

test('harpoon aux kit: 갈고리(30)/사슬(0.5s stun)', () => {
  const kit = AuxSkillConfig.harpoon;
  assert.equal(kit.alt.damage, 30);
  assert.equal(kit.target.stunMs, 500);
});

test('F 당겨가기 slows nearby enemies on arrival', () => {
  const owner = new Player('o', 'Hook', 'harpoon', 100, 100); owner.angle = 0;
  const near = new Player('t', 'T', 'sword', 140, 100); // ahead, near landing
  const g = Object.create(Game.prototype);
  g.players = { o: owner, t: near };
  g.cover = []; g.effects = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._harpoonPull(owner, 2000);
  assert.ok(near.slowTimeLeft > 0, 'arrival slowed the nearby enemy');
});
