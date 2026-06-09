import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';
import { Collision } from '../game/Collision.js';
import { getEffectiveWeapon, SkillConfig, DashConfig, Weapons, ComboConfig, MagicConfig, AuxSkillConfig } from '../game/Weapons.js';
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
  assert.equal(SkillConfig.gauntlet.buffMs, 4000);
  assert.equal(buffed.type, 'melee_line');
  assert.equal(buffed.damage, 20);
  assert.equal(buffed.range, 115);
  assert.equal(buffed.width, 22);
});

test('sword skill releases timed swordwaves without a spin effect', () => {
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
  assert.equal(game.pendingSwordWaves.length, SkillConfig.sword.waveCount);
  assert.equal(game.effects.filter(e => e.type === 'sword_skill').length, 0);
  assert.equal(player.skillCdLeft, SkillConfig.sword.cooldownMs / 1000);

  game._releaseDueSwordWaves(1000);
  assert.equal(game.projectiles.filter(p => p.kind === 'swordwave').length, 1);

  game._releaseDueSwordWaves(1000 + SkillConfig.sword.waveIntervalMs - 1);
  assert.equal(game.projectiles.filter(p => p.kind === 'swordwave').length, 1);

  player.angle = Math.PI / 2;
  game._releaseDueSwordWaves(1000 + SkillConfig.sword.waveIntervalMs);
  const wavesAfterSecondSpin = game.projectiles.filter(p => p.kind === 'swordwave');
  assert.equal(wavesAfterSecondSpin.length, 2);
  assert.equal(wavesAfterSecondSpin[1].angle, Math.PI / 2);

  game._releaseDueSwordWaves(1000 + SkillConfig.sword.waveIntervalMs * 2);
  const waves = game.projectiles.filter(p => p.kind === 'swordwave');
  assert.equal(waves.length, SkillConfig.sword.waveCount);
  assert.equal(new Set(waves.map(p => p.id)).size, waves.length);
  assert.equal(game.pendingSwordWaves.length, 0);
});

test('melee combo finishers change weapon shape after the required hits', () => {
  const game = Object.create(Game.prototype);

  const sword = new Player('sword-combo', 'Blade', 'sword', 0, 0);
  sword.comboStep = 2;
  sword.lastAttackTime = 700;
  const swordThird = game._resolveComboAttack(sword, Weapons.sword, 1000);
  assert.equal(swordThird.step, 3);
  assert.equal(swordThird.isFinisher, false);
  assert.equal(swordThird.delayAfterMs, ComboConfig.sword.delayBeforeFinisherMs);
  game._applyComboRecovery(sword, swordThird, 1000);
  assert.equal(sword.comboStep, 3);
  assert.equal(sword.comboDelayUntil, 1000 + ComboConfig.sword.delayBeforeFinisherMs);

  const swordFinisher = game._resolveComboAttack(sword, Weapons.sword, sword.comboDelayUntil);
  assert.equal(swordFinisher.step, 4);
  assert.equal(swordFinisher.isFinisher, true);
  assert.equal(swordFinisher.weaponConfig.type, 'melee_arc');
  assert.equal(swordFinisher.weaponConfig.angle, 360);
  sword.angle = 0;
  const swordBehindTarget = new Player('sword-behind', 'BehindBlade', 'sword', -60, 0);
  assert.equal(Collision.checkMeleeHit(sword, swordBehindTarget, swordFinisher.weaponConfig), true);

  const axe = new Player('axe-combo', 'Chopper', 'axe', 0, 0);
  axe.comboStep = 2;
  axe.lastAttackTime = 2500;
  const axeFinisher = game._resolveComboAttack(axe, Weapons.axe, 3000);
  assert.equal(axeFinisher.isFinisher, true);
  assert.equal(axeFinisher.weaponConfig.type, 'melee_circle');
  assert.ok(axeFinisher.weaponConfig.range > Weapons.axe.range);
  assert.ok(axeFinisher.weaponConfig.damage > Weapons.axe.damage);
  axe.angle = 0;
  const behindTarget = new Player('behind', 'Behind', 'sword', -60, 0);
  assert.equal(Collision.checkMeleeHit(axe, behindTarget, axeFinisher.weaponConfig), true);

  const ragingAxe = new Player('axe-skill-combo', 'Raging', 'axe', 0, 0);
  ragingAxe.buffType = 'axe_rage';
  ragingAxe.comboStep = 2;
  ragingAxe.lastAttackTime = 2500;
  ragingAxe.comboDelayUntil = 5000;
  assert.equal(ragingAxe.canAttack(3000), true);
  const lockedAxeCombo = game._resolveComboAttack(ragingAxe, getEffectiveWeapon('axe', 'axe_rage'), 3000);
  assert.equal(lockedAxeCombo.isFinisher, false);
  assert.equal(lockedAxeCombo.weaponConfig.type, SkillConfig.axe.type);
  assert.equal(ragingAxe.comboStep, 0);

  const spear = new Player('spear-combo', 'Pike', 'spear', 0, 0);
  spear.comboStep = 4;
  spear.lastAttackTime = 4600;
  const spearFinisher = game._resolveComboAttack(spear, Weapons.spear, 5000);
  assert.equal(spearFinisher.isFinisher, true);
  assert.ok(spearFinisher.weaponConfig.range > Weapons.spear.range);

  const gauntlet = new Player('gauntlet-combo', 'Knuckle', 'gauntlet', 0, 0);
  gauntlet.comboStep = 6;
  gauntlet.lastAttackTime = 6900;
  assert.equal(Weapons.gauntlet.cooldown, 240);
  assert.equal(Weapons.gauntlet.type, 'melee_line');
  const gauntletFinisher = game._resolveComboAttack(gauntlet, Weapons.gauntlet, 7000);
  assert.equal(gauntletFinisher.isFinisher, true);
  assert.equal(gauntletFinisher.weaponConfig.type, 'melee_line');
});

test('new melee weapon families expose distinct hit mechanics', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const scythe = new Player('scythe-owner', 'Reaper', 'scythe', 100, 100);
  scythe.angle = 0;
  assert.equal(Weapons.scythe.angle, 190);
  const scytheTarget = new Player('scythe-target', 'Target', 'sword', 184, 100);
  let hit = game._resolveMeleeHitResult(scythe, scytheTarget, Weapons.scythe);
  assert.equal(hit.damage, Weapons.scythe.sweetDamage);
  assert.equal(hit.pull, Weapons.scythe.pull);
  game.players = { [scythe.id]: scythe, [scytheTarget.id]: scytheTarget };
  const beforePullX = scytheTarget.x;
  game._applyMeleeHits(scythe, Weapons.scythe, 1000);
  assert.ok(scytheTarget.x < beforePullX);

  const dagger = new Player('dagger-owner', 'Shade', 'dagger', 100, 100);
  dagger.angle = 0;
  const daggerTarget = new Player('dagger-target', 'Back', 'sword', 150, 100);
  daggerTarget.angle = 0;
  hit = game._resolveMeleeHitResult(dagger, daggerTarget, Weapons.dagger);
  assert.equal(hit.damage, Weapons.dagger.critDamage);

  const rapier = new Player('rapier-owner', 'Needle', 'rapier', 100, 100);
  rapier.angle = 0;
  assert.equal(Weapons.rapier.damage, 20);
  const rapierTarget = new Player('rapier-target', 'Line', 'sword', 180, 102);
  hit = game._resolveMeleeHitResult(rapier, rapierTarget, Weapons.rapier);
  assert.equal(hit.damage, Weapons.rapier.critDamage);

  const hammer = new Player('hammer-owner', 'Bell', 'hammer', 100, 100);
  const hammerTarget = new Player('hammer-target', 'Outer', 'sword', 170, 100);
  hit = game._resolveMeleeHitResult(hammer, hammerTarget, Weapons.hammer);
  assert.equal(hit.damage, Math.round(Weapons.hammer.damage * 0.72));
  assert.equal(hit.knockback, Weapons.hammer.knockback);
});

test('gauntlet basic punch alternates fists and converges the hit tip to center', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};
  game._applyAttackTempoResult = () => {};

  const owner = new Player('gauntlet-owner', 'Knuckle', 'gauntlet', 100, 100);
  owner.angle = 0;
  const offsetAngle = Math.atan2(Weapons.gauntlet.punchConvergeOffset, Weapons.gauntlet.range);
  const aligned = new Player('gauntlet-aligned', 'Aligned', 'sword', 100 + Math.cos(-offsetAngle) * 52, 100 + Math.sin(-offsetAngle) * 52);
  const opposite = new Player('gauntlet-opposite', 'Opposite', 'sword', 100 + Math.cos(offsetAngle) * 52, 100 + Math.sin(offsetAngle) * 52);
  aligned.radius = 1;
  opposite.radius = 1;
  game.players[owner.id] = owner;
  game.players[aligned.id] = aligned;
  game.players[opposite.id] = opposite;

  const attack = game._resolveDirectionalAttack(owner, Weapons.gauntlet);
  assert.equal(attack.punchSide, 1);
  assert.ok(Math.abs(attack.angleOffset + offsetAngle) < 1e-12);
  assert.equal(game._queueOrApplyMeleeHit(owner, attack, 1000), 1);

  const nextAttack = game._resolveDirectionalAttack(owner, Weapons.gauntlet);
  assert.equal(nextAttack.punchSide, -1);
  assert.ok(Math.abs(nextAttack.angleOffset - offsetAngle) < 1e-12);

  assert.equal(aligned.hp, aligned.maxHp - Weapons.gauntlet.damage);
  assert.equal(opposite.hp, opposite.maxHp);
});

test('gauntlet lance skill also alternates the active punching fist', () => {
  const game = Object.create(Game.prototype);
  const owner = new Player('gauntlet-lance-owner', 'Knuckle', 'gauntlet', 100, 100);
  owner.buffType = 'gauntlet_lance';
  owner.angle = 0;

  const weapon = getEffectiveWeapon(owner.weapon, owner.buffType);
  const offsetAngle = Math.atan2(weapon.punchConvergeOffset, weapon.range);
  const first = game._resolveDirectionalAttack(owner, weapon);
  assert.equal(first.type, 'melee_line');
  assert.equal(first.range, SkillConfig.gauntlet.range);
  assert.equal(first.punchSide, 1);
  assert.ok(Math.abs(first.angleOffset + offsetAngle) < 1e-12);

  const second = game._resolveDirectionalAttack(owner, weapon);
  assert.equal(second.punchSide, -1);
  assert.ok(Math.abs(second.angleOffset - offsetAngle) < 1e-12);
});

test('greatsword skill charges quickly into a max-damage heavy cleave', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('greatsword-owner', 'Heavy', 'greatsword', 100, 100);
  owner.angle = 0;
  assert.equal(Weapons.greatsword.cooldown, 900);
  assert.equal(SkillConfig.greatsword.cooldownMs, 800);
  assert.equal(SkillConfig.greatsword.chargeMaxMs, 1000);
  assert.equal(SkillConfig.greatsword.chargeThreshold, 0.5);
  assert.equal(SkillConfig.greatsword.minDamage, 1);
  assert.equal(SkillConfig.greatsword.thresholdDamage, 35);
  assert.equal(SkillConfig.greatsword.damage, 70);
  const target = new Player('greatsword-target', 'Dummy', 'sword', 190, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startGreatswordCharge(owner, 1000);
  assert.equal(owner.greatswordChargeStart, 1000);
  assert.equal(game.effects.some(e => e.type === 'greatsword_charge'), true);

  game._releaseGreatswordCharge(owner, 1000 + SkillConfig.greatsword.chargeMaxMs);
  assert.equal(game.pendingMeleeHits.length, 1);
  assert.equal(game.effects.some(e => e.type === 'melee_heavy_arc' && e.angleDeg === SkillConfig.greatsword.angle), true);
  assert.equal(owner.comboDelayUntil, 1000 + SkillConfig.greatsword.chargeMaxMs + SkillConfig.greatsword.attackLockMs);
  assert.equal(target.hp, target.maxHp);

  game._processPendingMeleeHits(1000 + SkillConfig.greatsword.chargeMaxMs + SkillConfig.greatsword.delayDamageMs - 1);
  assert.equal(target.hp, target.maxHp);

  game._processPendingMeleeHits(1000 + SkillConfig.greatsword.chargeMaxMs + SkillConfig.greatsword.delayDamageMs);
  assert.equal(game.pendingMeleeHits.length, 0);
  assert.equal(target.hp, target.maxHp - SkillConfig.greatsword.damage);
  assert.equal(owner.skillCdLeft, SkillConfig.greatsword.cooldownMs / 1000);
});

test('greatsword cannot use automatic basic attacks', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.projectiles = [];
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('greatsword-no-basic', 'Heavy', 'greatsword', 100, 100);
  owner.angle = 0;
  owner.lastAttackTime = 0;
  game.players[owner.id] = owner;

  assert.equal(Weapons.greatsword.automaticAttack, false);
  assert.equal(owner.canAttack(5000), false);
});

test('greatsword charge damage starts scaling only after the midpoint', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('greatsword-half', 'Heavy', 'greatsword', 100, 100);
  owner.angle = 0;
  const target = new Player('greatsword-target-half', 'Dummy', 'sword', 190, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startGreatswordCharge(owner, 1000);
  game._releaseGreatswordCharge(owner, 1000 + SkillConfig.greatsword.chargeMaxMs * 0.75);

  const expectedDamage = Math.round(
    SkillConfig.greatsword.thresholdDamage +
    (SkillConfig.greatsword.damage - SkillConfig.greatsword.thresholdDamage) * 0.5
  );
  assert.equal(game.pendingMeleeHits[0].attackConfig.damage, expectedDamage);

  game._processPendingMeleeHits(1000 + SkillConfig.greatsword.chargeMaxMs * 0.75 + SkillConfig.greatsword.delayDamageMs);
  assert.equal(target.hp, target.maxHp - expectedDamage);
});

test('greatsword release before midpoint still deals one damage', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('greatsword-before-mid', 'Heavy', 'greatsword', 100, 100);
  owner.angle = 0;
  const target = new Player('greatsword-target-before-mid', 'Dummy', 'sword', 190, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startGreatswordCharge(owner, 1000);
  game._releaseGreatswordCharge(owner, 1000 + SkillConfig.greatsword.chargeMaxMs * 0.49);
  game._processPendingMeleeHits(1000 + SkillConfig.greatsword.chargeMaxMs * 0.49 + SkillConfig.greatsword.delayDamageMs);

  assert.equal(target.hp, target.maxHp - 1);
});

test('greatsword instant release only deals one damage', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('greatsword-instant', 'Heavy', 'greatsword', 100, 100);
  owner.angle = 0;
  // Charge 0 → reach is only 0.38*range, so the target must be close to be hit.
  const target = new Player('greatsword-target-instant', 'Dummy', 'sword', 140, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startGreatswordCharge(owner, 1000);
  game._releaseGreatswordCharge(owner, 1000);
  game._processPendingMeleeHits(1000 + SkillConfig.greatsword.delayDamageMs);

  assert.equal(target.hp, target.maxHp - 1);
});

test('greatsword blade sweep cuts inside the swept arc but not behind/outside it', () => {
  const sk = SkillConfig.greatsword;
  const weapon = { type: 'melee_blade_sweep', range: sk.range, angle: sk.angle, bladeHalfWidth: sk.bladeHalfWidth };
  const attacker = { id: 'gs', x: 100, y: 100, angle: 0, radius: 14 };

  const inFront = { id: 't1', x: 100 + 90, y: 100, isDead: false, radius: 14 };
  const behind = { id: 't2', x: 100 - 90, y: 100, isDead: false, radius: 14 };
  const beyondReach = { id: 't3', x: 100 + sk.range + 40, y: 100, isDead: false, radius: 14 };

  assert.equal(Collision.checkMeleeHit(attacker, inFront, weapon), true);   // along the blade
  assert.equal(Collision.checkMeleeHit(attacker, behind, weapon), false);   // not the whole fan
  assert.equal(Collision.checkMeleeHit(attacker, beyondReach, weapon), false); // past blade length
});

test('rapier hit tempo refunds cooldown on contact', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('rapier-owner', 'Tempo', 'rapier', 100, 100);
  owner.angle = 0;
  const target = new Player('rapier-target', 'Dummy', 'sword', 180, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._performAutomaticAttack(owner, Weapons.rapier, 1000);
  assert.equal(owner.lastAttackTime, 1000 - Weapons.rapier.hitCooldownRefundMs);
});

test('dagger skill QTE teleports behind target and rewards timed F input', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('dagger-owner', 'Shade', 'dagger', 100, 100);
  const target = new Player('dagger-target', 'Mark', 'sword', 180, 100);
  target.angle = 0;
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startDaggerQte(owner, 1000);
  assert.equal(owner.daggerQte.targetId, target.id);
  assert.equal(owner.iframeTimeLeft, (SkillConfig.dagger.lockMs + SkillConfig.dagger.windowMs) / 1000);
  assert.equal(game.effects.some(e => e.type === 'dagger_qte_lock'), true);

  game._processDaggerQtes(1000 + SkillConfig.dagger.lockMs);
  assert.equal(owner.daggerQte.phase, 'window');
  assert.ok(owner.x < target.x);
  assert.equal(owner.angle, 0);

  const hpBefore = target.hp;
  game._handlePlayerAction(owner, { action: 'dash', dx: 1, dy: 0 }, owner.daggerQte.perfectAt);
  assert.equal(target.hp, hpBefore);
  assert.equal(owner.daggerQte.phase, 'window');

  game._handleSkillPressed(owner, owner.daggerQte.perfectAt);
  assert.equal(target.hp, hpBefore - SkillConfig.dagger.damage);
  assert.equal(owner.daggerQte, null);
  assert.equal(owner.iframeTimeLeft, 0);
});

test('dagger QTE mistiming self-damages and stuns instead of attacking', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const owner = new Player('dagger-owner', 'Shade', 'dagger', 100, 100);
  const target = new Player('dagger-target', 'Mark', 'sword', 180, 100);
  target.angle = 0;
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._startDaggerQte(owner, 1000);
  game._processDaggerQtes(1000 + SkillConfig.dagger.lockMs);

  const targetHpBefore = target.hp;
  game._handleSkillPressed(owner, owner.daggerQte.perfectAt + SkillConfig.dagger.toleranceMs + 50);
  assert.equal(target.hp, targetHpBefore);
  assert.equal(owner.hp, owner.maxHp - SkillConfig.dagger.failDamage);
  assert.equal(owner.stunTimeLeft, SkillConfig.dagger.failStunMs / 1000);
  assert.equal(owner.daggerQte, null);
});

test('rapier skill grants the riposte buff (faster, longer reach, no miss penalty)', () => {
  const sk = SkillConfig.rapier;
  const base = Weapons.rapier;

  const buffed = getEffectiveWeapon('rapier', 'rapier_riposte');
  assert.equal(buffed.cooldown, sk.buffCooldown);
  assert.ok(buffed.cooldown < base.cooldown);
  assert.equal(buffed.range, sk.buffRange);
  assert.ok(buffed.range > base.range);
  assert.equal(buffed.hitCooldownRefundMs, sk.buffHitRefundMs);
  assert.equal(buffed.missPenaltyMs, 0);
  // base config is never mutated
  assert.equal(Weapons.rapier.cooldown, base.cooldown);
  assert.equal(Weapons.rapier.missPenaltyMs, base.missPenaltyMs);

  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];

  const owner = new Player('rapier-buff', 'Needle', 'rapier', 100, 100);
  game.players[owner.id] = owner;

  game._activateSkill(owner, 1000);
  assert.equal(owner.buffType, 'rapier_riposte');
  assert.equal(owner.buffTimeLeft, sk.buffMs / 1000);
  assert.equal(game.effects.some(e => e.type === 'buff_activate'), true);
});

test('rapier 5-hit combo finisher reaches farther and crits harder', () => {
  const game = Object.create(Game.prototype);
  const fin = ComboConfig.rapier.finisher;

  const owner = new Player('rapier-combo', 'Needle', 'rapier', 0, 0);
  owner.comboStep = 4;          // the next swing is the 5th = finisher
  owner.lastAttackTime = 1900;  // recent enough to keep the combo alive

  const combo = game._resolveComboAttack(owner, Weapons.rapier, 2000);
  assert.equal(combo.step, 5);
  assert.equal(combo.isFinisher, true);
  assert.equal(combo.weaponConfig.range, fin.range);
  assert.equal(combo.weaponConfig.critDamage, fin.critDamage);
  assert.equal(combo.weaponConfig.knockback, fin.knockback);
  assert.ok(combo.weaponConfig.range > Weapons.rapier.range);
});

test('hammer skill fires three expanding shockwaves with scaling damage and stun', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingHammerSlams = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const sk = SkillConfig.hammer;
  const [w1, w2, w3] = sk.waves;

  const owner = new Player('hammer-owner', 'Bell', 'hammer', 100, 100);
  // 40px away: inside every wave radius. Owner moving later must NOT shift the
  // shockwave centers (they are locked to the cast spot).
  const target = new Player('hammer-target', 'Dummy', 'sword', 140, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  game._castHammerSkill(owner, 1000);
  assert.equal(game.pendingHammerSlams.length, 3);
  assert.equal(game.effects.some(e => e.type === 'hammer_windup'), true);

  // Move the owner away to prove the shockwaves stay at the cast spot.
  owner.x = 500;
  owner.y = 500;

  const d = sk.waveDelaysMs;
  game._processHammerSlams(1000 + sk.previewMs + d[0] - 1);
  assert.equal(target.hp, target.maxHp); // still in the windup

  game._processHammerSlams(1000 + sk.previewMs + d[0]);                     // wave 1
  assert.equal(target.hp, target.maxHp - w1.damage);
  assert.equal(target.stunTimeLeft, w1.stunMs / 1000);

  game._processHammerSlams(1000 + sk.previewMs + d[0] + d[1]);             // wave 2
  assert.equal(target.hp, target.maxHp - w1.damage - w2.damage);

  game._processHammerSlams(1000 + sk.previewMs + d[0] + d[1] + d[2]);      // wave 3
  assert.equal(target.hp, target.maxHp - w1.damage - w2.damage - w3.damage);
  assert.equal(target.stunTimeLeft, w3.stunMs / 1000);
  assert.equal(game.pendingHammerSlams.length, 0);
});

test('hammer skill forbids basic attacks until the final shockwave fires', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingHammerSlams = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const sk = SkillConfig.hammer;
  const d = sk.waveDelaysMs;
  const cast = 2000; // past the 1150ms basic cooldown so only the lockout matters
  const lastFire = cast + sk.previewMs + d[0] + d[1] + d[2]; // cast + windup + all three waves

  const owner = new Player('hammer-owner', 'Bell', 'hammer', 100, 100);
  game.players[owner.id] = owner;

  assert.equal(owner.canAttack(cast), true);                 // free to swing before casting
  game._castHammerSkill(owner, cast);

  // Locked out for the whole skill, including the gaps between shockwaves.
  assert.equal(owner.canAttack(cast), false);                // right after cast
  assert.equal(owner.canAttack(cast + sk.previewMs), false); // during the windup
  assert.equal(owner.canAttack(lastFire - 1), false);        // an instant before the last wave
  assert.equal(owner.canAttack(lastFire), true);             // skill over → free again

  // A respawn (clearCombatTimers) must also lift the lockout immediately.
  owner.skillCdLeft = 0;
  game._castHammerSkill(owner, 6000);
  assert.equal(owner.canAttack(6000), false);
  owner.clearCombatTimers();
  assert.equal(owner.canAttack(6000), true);
});

test('axe rage roots the wielder (no move, no dash) until the buff ends', () => {
  const p = new Player('axe-rager', 'Rage', 'axe', 100, 100);
  p.buffType = 'axe_rage';
  p.buffTimeLeft = 5;
  const x0 = p.x, y0 = p.y;

  p.updatePosition(0.1, { d: true, s: true }, 700, 700); // try to move while raging
  assert.equal(p.x, x0);
  assert.equal(p.y, y0);
  assert.equal(p.startDash(1, 0), false); // dash is blocked too

  // Buff over → locomotion resumes.
  p.buffType = null;
  p.buffTimeLeft = 0;
  p.updatePosition(0.1, { d: true }, 700, 700);
  assert.ok(p.x > x0);
});

test('hammer outer shockwave misses targets beyond the first wave radius', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.pendingHammerSlams = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const sk = SkillConfig.hammer;
  const [w1, w2] = sk.waves;

  const owner = new Player('hammer-owner', 'Bell', 'hammer', 100, 100);
  // 100px away: outside wave 1 (60px) but inside wave 2 (123px).
  const target = new Player('hammer-target', 'Far', 'sword', 200, 100);
  game.players[owner.id] = owner;
  game.players[target.id] = target;

  const d = sk.waveDelaysMs;
  game._castHammerSkill(owner, 1000);
  game._processHammerSlams(1000 + sk.previewMs + d[0]);            // wave 1 — too far, no hit
  assert.equal(target.hp, target.maxHp);

  game._processHammerSlams(1000 + sk.previewMs + d[0] + d[1]);     // wave 2 — now in range
  assert.equal(target.hp, target.maxHp - w2.damage);
});

test('matchlock instakills the first enemy on the aim line and goes on a long cooldown', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const gunner = new Player('gun', 'Gun', 'matchlock', 100, 100);
  gunner.angle = 0; // facing +x
  const victim = new Player('vic', 'Vic', 'sword', 300, 100); // directly on the aim line
  game.players[gunner.id] = gunner;
  game.players[victim.id] = victim;

  game._fireMatchlock(gunner, 1000);
  assert.ok(victim.hp <= 0);                       // instakill regardless of max HP
  assert.ok(gunner.skillCdLeft > 14);              // ~15s cooldown
  assert.equal(game.effects.some(e => e.type === 'railbeam' && e.weapon === 'matchlock'), true);

  // A perpendicular target is NOT on the line and survives.
  const safe = new Player('safe', 'Safe', 'sword', 100, 300);
  game.players[safe.id] = safe;
  gunner.skillCdLeft = 0;
  game._fireMatchlock(gunner, 2000);
  assert.equal(safe.hp, safe.maxHp);
});

test('katana skill queues two slashes and launches a blade wave per slash', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.pendingKatanaSlashes = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const ninja = new Player('kat', 'Kat', 'katana', 100, 100);
  ninja.angle = 0;
  game.players[ninja.id] = ninja;

  const d = SkillConfig.katana;
  game._castKatanaSkill(ninja, 1000);
  assert.equal(game.pendingKatanaSlashes.length, d.slashCount);
  assert.ok(ninja.skillCdLeft > 6);

  game._releaseDueKatanaSlashes(1000);                       // first slash fires now
  assert.equal(game.projectiles.filter(p => p.weapon === 'katana').length, 1);
  assert.equal(game.pendingKatanaSlashes.length, d.slashCount - 1);

  game._releaseDueKatanaSlashes(1000 + d.slashIntervalMs);   // second slash
  assert.equal(game.pendingKatanaSlashes.length, 0);
  assert.equal(game.projectiles.filter(p => p.weapon === 'katana').length, 2);
});

test('katana R iaijutsu charges for one second before cutting a 40px line', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const ninja = new Player('kat-r', 'Iaido', 'katana', 100, 100);
  ninja.angle = 0;
  const target = new Player('kat-r-target', 'Target', 'sword', 210, 112);
  const safe = new Player('kat-r-safe', 'Safe', 'sword', 210, 150);
  game.players[ninja.id] = ninja;
  game.players[target.id] = target;
  game.players[safe.id] = safe;

  game._startKatanaIaijutsuCharge(ninja, 1000);
  assert.equal(ninja.katanaChargeStart, 1000);
  assert.equal(game.effects.some(e => e.type === 'katana_charge'), true);

  game._releaseKatanaIaijutsu(ninja, 1400, false);
  assert.equal(target.hp, target.maxHp);
  assert.equal(ninja.teleportReadyAt, 0);

  game._startKatanaIaijutsuCharge(ninja, 2000);
  game._releaseKatanaIaijutsu(ninja, 2000 + SkillConfig.katana.iaijutsuChargeMs, false);
  assert.equal(target.hp, target.maxHp - SkillConfig.katana.iaijutsuDamage);
  assert.equal(safe.hp, safe.maxHp);
  assert.equal(ninja.teleportReadyAt, 2000 + SkillConfig.katana.iaijutsuChargeMs + SkillConfig.katana.iaijutsuCooldownMs);
  assert.equal(game.effects.some(e => e.type === 'melee_heavy_line' && e.width === SkillConfig.katana.iaijutsuWidth), true);
});

test('magic staff fireball deals direct damage then a burn that ticks 2/sec for 4s', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const mage = new Player('mage', 'Mage', 'magicstaff', 100, 100);
  mage.angle = 0;
  game.players[mage.id] = mage;

  game._castFireball(mage, 1000);
  assert.equal(game.projectiles.length, 1);
  assert.equal(game.projectiles[0].kind, 'fireball');

  const target = new Player('t', 'T', 'sword', 200, 100);
  game.players[target.id] = target;
  const hp0 = target.hp;
  target.takeDamage(MagicConfig.fireball.damage, '파이어볼');         // direct hit
  game._applyBurn(target, mage.id, MagicConfig.fireball.burnDps, MagicConfig.fireball.burnDurationMs);
  assert.equal(target.hp, hp0 - 40);
  assert.ok(target.burnTimeLeft > 3.9);

  game._tickBurns(1.0, 2000);
  assert.equal(target.hp, hp0 - 40 - 2);                            // first tick
  game._tickBurns(1.0, 3000);
  game._tickBurns(1.0, 4000);
  game._tickBurns(1.0, 5000);
  assert.equal(target.hp, hp0 - 40 - 8);                            // 4 ticks total = 8
  assert.equal(target.burnTimeLeft, 0);
});

test('magic staff spells use separate 2s cooldowns and targeted ice shards', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.pendingMagicShards = [];
  game.mapWidth = 700;
  game.mapHeight = 700;

  const mage = new Player('mage', 'Mage', 'magicstaff', 100, 100);
  mage.angle = 0;
  game.players[mage.id] = mage;

  assert.equal(Weapons.magicstaff.automaticAttack, false);
  assert.equal(mage.canAttack(5000), false);

  game._castMagicFireballSkill(mage, 5000);
  assert.equal(game.projectiles.filter(p => p.kind === 'fireball').length, 1);
  assert.equal(mage.magicCooldowns.fireball, MagicConfig.fireball.cooldownMs / 1000);
  assert.equal(mage.magicCooldowns.iceShard, 0);
  assert.equal(mage.magicCooldowns.lifebound, 0);

  game._castMagicIceSkill(mage, 5100, 250, 170);
  assert.equal(game.pendingMagicShards.length, MagicConfig.iceShard.count);
  assert.equal(mage.magicCooldowns.iceShard, MagicConfig.iceShard.cooldownMs / 1000);
  assert.equal(mage.magicCooldowns.lifebound, 0);

  game._releaseDueMagicShards(5100);
  assert.equal(game.projectiles.filter(p => p.kind === 'iceshard').length, 1);
  const firstShard = game.projectiles.find(p => p.kind === 'iceshard');
  assert.ok(Math.abs(firstShard.angle - Math.atan2(70, 150)) < 1e-6);

  game._releaseDueMagicShards(5100 + MagicConfig.iceShard.intervalMs * (MagicConfig.iceShard.count - 1));
  assert.equal(game.projectiles.filter(p => p.kind === 'iceshard').length, MagicConfig.iceShard.count);
  assert.equal(game.pendingMagicShards.length, 0);

  mage.hp = 50;
  game._castMagicLifeboundSkill(mage, 5200);
  assert.equal(mage.hp, 50 + MagicConfig.lifebound.heal);
  assert.equal(mage.magicCooldowns.lifebound, MagicConfig.lifebound.cooldownMs / 1000);
});

test('magic staff lifebound heals the caster, capped at max hp', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];

  const mage = new Player('mage', 'Mage', 'magicstaff', 100, 100);
  game.players[mage.id] = mage;

  mage.hp = 50;
  game._castLifebound(mage, 1000);
  assert.equal(mage.hp, 50 + MagicConfig.lifebound.heal);

  mage.hp = mage.maxHp - 5;
  game._castLifebound(mage, 2000);
  assert.equal(mage.hp, mage.maxHp);
});

test('sniper: F instakills; R arms a bounded targeted blink; dash allowed', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const sniper = new Player('snp', 'Snp', 'sniper', 100, 100);
  sniper.angle = 0;
  const victim = new Player('v', 'V', 'sword', 400, 100); // on the aim line
  game.players[sniper.id] = sniper;
  game.players[victim.id] = victim;

  game._fireSniperShot(sniper, 1000);                         // F = shot
  assert.ok(victim.hp <= 0);                                  // instakill hitscan
  assert.ok(sniper.skillCdLeft > 1.9);                        // F shot's own ~2s cooldown
  assert.equal(game.effects.some(e => e.type === 'railbeam' && e.weapon === 'sniper'), true);

  game._handleTeleport(sniper, 2000);                         // R = target mode
  assert.equal(sniper.teleportReadyAt, 0);
  assert.ok(sniper.sniperTeleportTargetUntil > 2000);
  assert.equal(game.effects.filter(e => e.type === 'sniper_teleport').length, 0);

  game._handleTargetCast(sniper, 500, 100, 2100);              // click farther than 200px
  assert.equal(sniper.teleportReadyAt, 2100 + SkillConfig.sniper.teleportCooldownMs);
  assert.equal(sniper.sniperTeleportTargetUntil, 0);
  assert.ok(Math.abs(sniper.x - 300) < 1e-6);                  // clamped to radius 200
  assert.equal(sniper.y, 100);
  assert.equal(game.effects.filter(e => e.type === 'sniper_teleport').length, 2);

  game._handleTeleport(sniper, 2500);                         // still on cooldown
  assert.equal(sniper.sniperTeleportTargetUntil, 0);
  assert.equal(game.effects.filter(e => e.type === 'sniper_teleport').length, 2);

  assert.equal(sniper.startDash(1, 0), true);                 // dash is now allowed
});

test('generic R and LMB auxiliary skills apply their own cooldowns', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.effects = [];
  game.projectiles = [];
  game.pendingMeleeHits = [];
  game.mapWidth = 700;
  game.mapHeight = 700;
  game._creditKill = () => {};

  const sword = new Player('sword-aux', 'Blade', 'sword', 100, 100);
  sword.angle = 0;
  const close = new Player('close-target', 'Close', 'sword', 150, 100);
  const line = new Player('line-target', 'Line', 'sword', 210, 100);
  game.players[sword.id] = sword;
  game.players[close.id] = close;
  game.players[line.id] = line;

  game._castAuxAltSkill(sword, 1000);
  assert.equal(sword.altSkillCdLeft, AuxSkillConfig.sword.alt.cooldownMs / 1000);
  assert.equal(close.hp, close.maxHp - AuxSkillConfig.sword.alt.damage);

  game._castAuxTargetSkill(sword, 2000, 260, 100);
  assert.equal(sword.targetSkillCdLeft, AuxSkillConfig.sword.target.cooldownMs / 1000);
  assert.equal(sword.angle, 0);
  assert.ok(line.hp < line.maxHp);
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

test('spear throw screen shake only fires for the local caster once', () => {
  const game = Object.create(Game.prototype);
  const shakes = [];
  const vibrations = [];
  game.localPlayerId = 'spear-player';
  game.shakenSpearThrowIds = new Set();
  game.camera = { startShake: (magnitude, durationMs) => shakes.push([magnitude, durationMs]) };
  game._vibrateDevice = pattern => vibrations.push(pattern);

  const effect = {
    id: 'spear-throw-1',
    attackerId: 'spear-player',
    weapon: 'spear',
    type: 'railbeam',
    timestamp: 1000
  };
  game._triggerLocalSpearThrowFeedback(effect);
  game._triggerLocalSpearThrowFeedback(effect);
  game._triggerLocalSpearThrowFeedback({ ...effect, id: 'remote-spear', attackerId: 'other-player' });

  assert.deepEqual(shakes, [[9, 260]]);
  assert.deepEqual(vibrations, [[45, 25, 35]]);
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
  // Windup queued — projectile and damage deferred until windup completes.
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.effects.some(e => e.type === 'spear_windup'), true);
  assert.equal(firstTarget.hp, firstTarget.maxHp); // no outbound damage yet

  // Release the throw after the windup window.
  game._processSpearThrowQueue(1241);
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

test('arc weapons (sword/scythe) use the blade-sweep hit test via hitMode', () => {
  assert.equal(Weapons.sword.hitMode, 'melee_blade_sweep');
  assert.equal(Weapons.scythe.hitMode, 'melee_blade_sweep');

  const sword = { id: 'sw', x: 100, y: 100, angle: 0, radius: 14 };
  const front = { id: 'f', x: 160, y: 100, isDead: false, radius: 14 };  // in the swing
  const behind = { id: 'b', x: 40, y: 100, isDead: false, radius: 14 };  // behind the sweep

  assert.equal(Collision.checkMeleeHit(sword, front, Weapons.sword), true);
  assert.equal(Collision.checkMeleeHit(sword, behind, Weapons.sword), false);
});

test('weapon swap is queued (host) and ignores unknown weapons', () => {
  const game = Object.create(Game.prototype);
  game.players = {};
  game.localPlayerId = 'p';
  game.networkManager = { isHost: true };

  const p = new Player('p', 'Switcher', 'sword', 0, 0);
  game.players['p'] = p;

  game.requestWeaponChange('hammer');
  assert.equal(p.pendingWeapon, 'hammer');
  assert.equal(p.weapon, 'sword'); // not applied until respawn
  assert.equal(game.pendingWeaponChoice, 'hammer');

  game.requestWeaponChange('not-a-weapon');
  assert.equal(p.pendingWeapon, 'hammer'); // invalid weapon ignored
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
