import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

test('pistols config: rapid, capped range, with spread', () => {
  const p = Weapons.pistols;
  assert.equal(p.projectileKind, 'pistol');
  assert.ok(p.cooldown <= 250);
  assert.ok(Number.isFinite(p.range));     // capped (not Infinity like the bow)
  assert.ok(p.spreadDeg > 0);
});

test('F barrage fires all bullets over its window, then hops back once', () => {
  const player = { id: 'p', x: 100, y: 100, radius: 14, angle: 0, weapon: 'pistols', isDead: false, skillCdLeft: 0 };
  const g = Object.create(Game.prototype);
  g.players = { p: player };
  g.projectiles = [];
  let hops = 0;
  g._lungePlayer = (pl, dist) => { hops++; assert.ok(dist < 0, 'hop is backward'); };

  g._firePistolBarrage(player, 1000);
  assert.ok(player.skillCdLeft > 0, 'skill goes on cooldown');

  const sk = SkillConfig.pistols;
  // Drive past the whole 0.6s window.
  for (let t = 1000; t <= 1000 + (sk.burstMs || 600) + 50; t += 20) {
    g._processPistolBursts(t);
  }
  assert.equal(g.projectiles.length, sk.burstCount, 'all barrage bullets spawned');
  assert.ok(g.projectiles.every(p => p.kind === 'pistol'));
  assert.equal(hops, 1, 'exactly one back-hop after the barrage');
  assert.equal(g.pendingPistolBursts.length, 0, 'burst cleared when done');
});

test('a dead shooter drops their pending barrage', () => {
  const player = { id: 'p', x: 0, y: 0, radius: 14, angle: 0, weapon: 'pistols', isDead: true, skillCdLeft: 0 };
  const g = Object.create(Game.prototype);
  g.players = { p: player };
  g.projectiles = [];
  g._lungePlayer = () => {};
  g._firePistolBarrage(player, 1000);
  g._processPistolBursts(1700);
  assert.equal(g.pendingPistolBursts.length, 0);
  assert.equal(g.projectiles.length, 0);
});
