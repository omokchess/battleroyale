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

test('axe rage buff turns the axe into a fast arc burst', () => {
  const base = Weapons.axe;
  const buffed = getEffectiveWeapon('axe', 'axe_rage');
  assert.equal(SkillConfig.axe.buffMs, 4000);
  assert.equal(buffed.type, 'melee_arc');
  assert.equal(buffed.damage, 50);
  assert.equal(buffed.cooldown, 300);
  assert.equal(buffed.range, 100);
  assert.equal(buffed.angle, 120);
  // The base config is never mutated.
  assert.equal(Weapons.axe.damage, base.damage);
  assert.equal(Weapons.axe.type, base.type);
  assert.equal(Weapons.axe.cooldown, base.cooldown);
});

test('gauntlet lance buff turns the punch into a straight spear-like thrust', () => {
  const buffed = getEffectiveWeapon('gauntlet', 'gauntlet_lance');
  assert.equal(buffed.type, 'melee_line');
  assert.equal(buffed.damage, 30);
  assert.equal(buffed.range, 115);
  assert.equal(buffed.width, 22);
});

test('sword skill releases one swordwave per timed spin', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.projectiles = [];
  game.effects = [];
  game.pendingSwordWaves = [];

  const player = new Player('p4', 'Blade', 'sword', 100, 100);
  player.angle = Math.PI / 4;
  game.players[player.id] = player;
  game._castSwordSkill(player, 1000);

  assert.equal(game.projectiles.length, 0);
  assert.equal(game.pendingSwordWaves.length, SkillConfig.sword.spinCount);
  assert.equal(game.effects.filter(e => e.type === 'sword_skill').length, 1);
  assert.equal(game.effects[0].spins, SkillConfig.sword.spinCount);
  assert.equal(game.effects[0].lifetime, SkillConfig.sword.spinCount * SkillConfig.sword.spinIntervalMs);
  assert.equal(player.skillCdLeft, SkillConfig.sword.cooldownMs / 1000);

  game._releaseDueSwordWaves(1000);
  assert.equal(game.projectiles.filter(p => p.kind === 'swordwave').length, 1);

  game._releaseDueSwordWaves(1000 + SkillConfig.sword.spinIntervalMs - 1);
  assert.equal(game.projectiles.filter(p => p.kind === 'swordwave').length, 1);

  player.angle = Math.PI / 2;
  game._releaseDueSwordWaves(1000 + SkillConfig.sword.spinIntervalMs);
  const wavesAfterSecondSpin = game.projectiles.filter(p => p.kind === 'swordwave');
  assert.equal(wavesAfterSecondSpin.length, 2);
  assert.equal(wavesAfterSecondSpin[1].angle, Math.PI / 2);

  game._releaseDueSwordWaves(1000 + SkillConfig.sword.spinIntervalMs * 2);
  const waves = game.projectiles.filter(p => p.kind === 'swordwave');
  assert.equal(waves.length, SkillConfig.sword.spinCount);
  assert.equal(new Set(waves.map(p => p.id)).size, waves.length);
  assert.equal(game.pendingSwordWaves.length, 0);
});

test('bow railgun vibration only fires for the local caster once', () => {
  const game = Object.create(Game.prototype);
  const calls = [];
  game.localPlayerId = 'local-player';
  game.vibratedRailbeamIds = new Set();
  game._vibrateDevice = pattern => calls.push(pattern);

  game._triggerLocalBowSkillVibration({
    id: 'remote-beam',
    attackerId: 'remote-player',
    weapon: 'bow',
    type: 'railbeam',
    timestamp: 1000
  });
  assert.equal(calls.length, 0);

  const localBeam = {
    id: 'local-beam',
    attackerId: 'local-player',
    weapon: 'bow',
    type: 'railbeam',
    timestamp: 1000
  };
  game._triggerLocalBowSkillVibration(localBeam);
  game._triggerLocalBowSkillVibration(localBeam);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [35, 20, 55]);
});

test('bow arrows build capped stacks that fuel timed railgun bursts', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingRailguns = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._triggerLocalBowSkillVibration = () => {};

  const player = new Player('bow-player', 'Archer', 'bow', 100, 100);
  player.angle = 0;
  game.players[player.id] = player;

  for (let i = 0; i < SkillConfig.bow.maxStacks + 2; i++) {
    game._awardBowArrowStack(player);
  }
  assert.equal(player.arrowStacks, SkillConfig.bow.maxStacks);
  assert.equal(game._canUseSkill(player), true);

  game._castRailgun(player, 1000);
  assert.equal(player.arrowStacks, 0);
  assert.equal(player.skillCdLeft, SkillConfig.bow.cooldownMs / 1000);
  assert.equal(game.pendingRailguns.length, SkillConfig.bow.maxStacks);

  game._releaseDueBowRailguns(1000);
  assert.equal(game.effects.filter(e => e.type === 'railbeam' && e.weapon === 'bow').length, 1);

  game._releaseDueBowRailguns(1000 + SkillConfig.bow.burstIntervalMs - 1);
  assert.equal(game.effects.filter(e => e.type === 'railbeam' && e.weapon === 'bow').length, 1);

  game._releaseDueBowRailguns(1000 + SkillConfig.bow.burstIntervalMs);
  assert.equal(game.effects.filter(e => e.type === 'railbeam' && e.weapon === 'bow').length, 2);
});

test('bow arrow stacks survive serialization', () => {
  const player = new Player('bow-sync', 'Archer', 'bow', 0, 0);
  player.arrowStacks = 4;

  const restored = new Player('bow-sync', 'Archer', 'bow', 0, 0);
  restored.deserialize(player.serialize());

  assert.equal(restored.arrowStacks, 4);
});

test('spear skill pierces outbound path and damages enemies again on return', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.projectiles = [];
  game.effects = [];
  game.mapWidth = 700;
  game.mapHeight = 700;

  const owner = new Player('spear-owner', 'Lancer', 'spear', 100, 100);
  owner.angle = 0;
  const firstTarget = new Player('target-1', 'TargetOne', 'sword', 672, 100);
  const secondTarget = new Player('target-2', 'TargetTwo', 'sword', 649, 100);
  game.players[owner.id] = owner;
  game.players[firstTarget.id] = firstTarget;
  game.players[secondTarget.id] = secondTarget;

  game._throwSpear(owner, 1000);
  assert.equal(owner.spearThrown, true);
  assert.equal(game.projectiles.length, 1);
  assert.equal(game.effects.some(e => e.type === 'railbeam' && e.weapon === 'spear'), true);

  const spear = game.projectiles[0];
  assert.equal(spear.phase, 'return');
  assert.ok(spear.x > 690);
  assert.equal(spear.damage, SkillConfig.spear.returnDamage);
  assert.equal(firstTarget.hp, firstTarget.maxHp - SkillConfig.spear.damage);
  assert.equal(secondTarget.hp, secondTarget.maxHp - SkillConfig.spear.damage);

  game._updateThrownSpear(spear, 0.03, 1030);
  assert.equal(firstTarget.hp, firstTarget.maxHp - SkillConfig.spear.damage - SkillConfig.spear.returnDamage);
  assert.equal(secondTarget.hp, secondTarget.maxHp - SkillConfig.spear.damage);

  game._updateThrownSpear(spear, 0.03, 1060);
  assert.equal(firstTarget.hp, firstTarget.maxHp - SkillConfig.spear.damage - SkillConfig.spear.returnDamage);
  assert.equal(secondTarget.hp, secondTarget.maxHp - SkillConfig.spear.damage - SkillConfig.spear.returnDamage);
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
