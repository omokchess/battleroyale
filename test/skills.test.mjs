import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';
import { Collision } from '../game/Collision.js';
import { getEffectiveWeapon, SkillConfig, DashConfig, Weapons } from '../game/Weapons.js';
import { Game, rebaseEffectSnapshot } from '../game/Game.js';

test('dash grants i-frames and bursts the player along the held direction', () => {
  const p = new Player('p1', 'Dasher', 'sword', 100, 100);

  assert.equal(p.startDash(1, 0), true);
  assert.equal(p.isInvincible(), true);

  // One 0.16s tick of dash should move ~the full dash distance.
  p.updatePosition(DashConfig.durationMs / 1000, {}, 1000, 1000);
  assert.ok(Math.abs(p.x - (100 + DashConfig.distance)) < 1e-6);

  // Invincibility outlasts the movement window (13 frames > 0.16s).
  assert.equal(p.isInvincible(), true);
});

test('an invincible player ignores damage', () => {
  const p = new Player('p2', 'Ghost', 'sword', 0, 0);
  p.startDash(1, 0);
  assert.equal(p.takeDamage(50), false);
  assert.equal(p.hp, p.maxHp);
});

test('dash is gated by its cooldown', () => {
  const p = new Player('p3', 'Spammer', 'sword', 0, 0);
  assert.equal(p.startDash(1, 0), true);
  // Let the movement window end but stay within the cooldown.
  p.updatePosition(DashConfig.durationMs / 1000, {}, 1000, 1000);
  assert.equal(p.startDash(1, 0), false);
});

test('axe rage buff triples attack speed and widens range', () => {
  const base = Weapons.axe;
  const buffed = getEffectiveWeapon('axe', 'axe_rage');
  assert.equal(buffed.cooldown, base.cooldown / SkillConfig.axe.attackSpeedMult);
  assert.equal(buffed.range, SkillConfig.axe.range);
  // The base config is never mutated.
  assert.equal(Weapons.axe.cooldown, base.cooldown);
});

test('gauntlet lance buff turns the punch into a straight spear-like thrust', () => {
  const buffed = getEffectiveWeapon('gauntlet', 'gauntlet_lance');
  assert.equal(buffed.type, 'melee_line');
  assert.equal(buffed.damage, 30);
  assert.equal(buffed.range, 115);
  assert.equal(buffed.width, 22);
});

test('sword skill fires the configured swordwave volley', () => {
  const game = Object.create(Game.prototype);
  game.projectiles = [];
  game.effects = [];

  const player = new Player('p4', 'Blade', 'sword', 100, 100);
  player.angle = Math.PI / 4;
  game._castSwordSkill(player, 1000);

  const waves = game.projectiles.filter(p => p.kind === 'swordwave');
  assert.equal(waves.length, SkillConfig.sword.waveCount);
  assert.equal(new Set(waves.map(p => p.id)).size, waves.length);
  assert.equal(game.effects.filter(e => e.type === 'sword_skill').length, 1);
  assert.equal(player.skillCdLeft, SkillConfig.sword.cooldownMs / 1000);
});

test('railgun hitscan reports the closest contact distance and misses cleanly', () => {
  // Ray from origin heading +x toward a circle centered at (100,0) r=14.
  const hit = Collision.rayCircleHitDistance(0, 0, 1, 0, 100, 0, 14);
  assert.ok(Math.abs(hit - 86) < 1e-6);

  // A circle off to the side is missed.
  const miss = Collision.rayCircleHitDistance(0, 0, 1, 0, 100, 100, 14);
  assert.equal(miss, null);
});

test('effect rebase preserves extra skill fields (railbeam endpoints, blast radius)', () => {
  const rebased = rebaseEffectSnapshot({
    x: 0, y: 0, x2: 300, y2: 120, radius: 70,
    type: 'railbeam', weapon: 'bow',
    progress: 0.5, timestamp: 1000, lifetime: 400
  }, 5000);

  assert.equal(rebased.x2, 300);
  assert.equal(rebased.y2, 120);
  assert.equal(rebased.radius, 70);
  assert.equal(rebased.progress, 0.5);
});
