import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Projectile } from '../game/Projectile.js';
import { Weapons, SkillConfig } from '../game/Weapons.js';

function makePlayer(id, x, y, over = {}) {
  return {
    id, x, y, radius: 14, isDead: false,
    hits: 0,
    isInvincible: () => false,
    takeDamage(dmg) { this.hits++; return false; },
    ...over
  };
}

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.projectiles = [];
  g.cover = [];
  g.mapWidth = 700;
  g.mapHeight = 700;
  g._creditKill = () => {};
  return g;
}

test('chakram weapon + skill config exist', () => {
  assert.ok(Weapons.chakram);
  assert.equal(Weapons.chakram.projectileKind, 'chakram');
  assert.ok(SkillConfig.chakram.fanCount >= 2);
});

test('chakram hits on the outbound leg and returns, re-arming the owner', () => {
  const owner = makePlayer('o', 100, 100, { chakramOut: true });
  const target = makePlayer('t', 240, 100); // sits on the outbound path (+x)
  const g = makeGame({ o: owner, t: target });

  // Disc thrown along +x with a 280px out range.
  const proj = new Projectile('o-chakram-1', 'o', 117, 100, 0, 640, Infinity, 22, 'chakram');
  proj.phase = 'out';
  proj.outRange = 280;
  proj.locksOwner = true;
  proj.hitOut = new Set();
  proj.hitBack = new Set();
  proj.radius = 13;

  let now = 1000;
  let reachedReturn = false;
  for (let i = 0; i < 400 && !proj.isDead; i++) {
    now += 20;
    g._updateChakram(proj, 0.02, now);
    if (proj.phase === 'return') reachedReturn = true;
  }

  assert.ok(target.hits >= 1, 'target should be hit by the disc');
  assert.equal(reachedReturn, true, 'disc should turn back');
  assert.equal(proj.isDead, true, 'disc should expire on return');
  assert.equal(owner.chakramOut, false, 'owner re-armed after the disc returns');
});

test('a disc whose owner dies frees the disarm flag', () => {
  const owner = makePlayer('o', 100, 100, { chakramOut: true, isDead: true });
  const g = makeGame({ o: owner });
  const proj = new Projectile('o-chakram-2', 'o', 117, 100, 0, 640, Infinity, 22, 'chakram');
  proj.phase = 'out'; proj.outRange = 280; proj.locksOwner = true;
  proj.hitOut = new Set(); proj.hitBack = new Set(); proj.radius = 13;
  g._updateChakram(proj, 0.02, 1000);
  assert.equal(proj.isDead, true);
  assert.equal(owner.chakramOut, false);
});
