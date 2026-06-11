import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.effects = [];
  g.mines = [];
  g._mineSeq = 0;
  g._creditKill = () => {};
  return g;
}

test('minebag config: weak melee arc + mine skill params', () => {
  assert.equal(Weapons.minebag.type, 'melee_arc');
  assert.ok(Weapons.minebag.damage <= 14);
  assert.ok(SkillConfig.minebag.blastRadius > 0);
  assert.ok(SkillConfig.minebag.maxMines >= 1);
});

test('placing over the cap drops the oldest mine', () => {
  const owner = { id: 'o', x: 100, y: 100, weapon: 'minebag', isDead: false, skillCdLeft: 0 };
  const g = makeGame({ o: owner });
  const max = SkillConfig.minebag.maxMines;
  let now = 1000;
  const firstIds = [];
  for (let i = 0; i < max + 2; i++) { g._placeMine(owner, now); firstIds.push(g.mines[g.mines.length - 1].id); now += 10; }
  assert.equal(g.mines.length, max, 'capped at maxMines');
  assert.ok(!g.mines.some(m => m.id === firstIds[0]), 'oldest dropped');
});

test('an armed mine detonates on a nearby enemy and damages the blast radius', () => {
  const owner = { id: 'o', x: 100, y: 100, weapon: 'minebag', isDead: false, skillCdLeft: 0 };
  const enemy = { id: 'e', x: 100, y: 100, radius: 14, isDead: false, hits: 0,
    isInvincible: () => false, takeDamage() { this.hits++; return false; } };
  const g = makeGame({ o: owner, e: enemy });

  g._placeMine(owner, 1000);
  // Before arming: no detonation.
  g._updateMines(1500);
  assert.equal(enemy.hits, 0);
  assert.equal(g.mines.length, 1);
  // After arming (>1s): the co-located enemy triggers it.
  g._updateMines(1000 + SkillConfig.minebag.armMs + 50);
  assert.ok(enemy.hits >= 1, 'enemy took blast damage');
  assert.equal(g.mines.length, 0, 'mine consumed');
});

test('mines vanish when their placer dies', () => {
  const owner = { id: 'o', x: 100, y: 100, weapon: 'minebag', isDead: false, skillCdLeft: 0 };
  const g = makeGame({ o: owner });
  g._placeMine(owner, 1000);
  owner.isDead = true;
  g._updateMines(1100);
  assert.equal(g.mines.length, 0);
});
