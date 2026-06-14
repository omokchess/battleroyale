import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons } from '../game/Weapons.js';

function setup(attacker, target) {
  const g = Object.create(Game.prototype);
  g.players = { [attacker.id]: attacker, [target.id]: target };
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  return g;
}

test('spear tip hit (far 30px) deals 28 + slow; mid-thrust is base', () => {
  const owner = new Player('s', 'Pike', 'spear', 0, 100); owner.angle = 0;
  const far = new Player('far', 'F', 'sword', 110, 100);   // proj 110 ≥ range(130)-30
  const near = new Player('near', 'N', 'sword', 60, 100);
  let g = setup(owner, far);
  let hit = g._resolveMeleeHitResult(owner, far, Weapons.spear, 1000);
  assert.equal(hit.damage, Weapons.spear.tipDamage);
  assert.equal(hit.slowMs, Weapons.spear.tipSlowMs);
  g = setup(owner, near);
  hit = g._resolveMeleeHitResult(owner, near, Weapons.spear, 1000);
  assert.equal(hit.damage, Weapons.spear.damage);
  assert.equal(hit.slowMs, 0);
});

test('gauntlet uppercut on the 4th consecutive hit (25 + knockback)', () => {
  const owner = new Player('g', 'Fist', 'gauntlet', 0, 100); owner.angle = 0;
  const t = new Player('t', 'T', 'sword', 40, 100);
  const g = setup(owner, t);
  let hit;
  for (let i = 1; i <= 4; i++) hit = g._resolveMeleeHitResult(owner, t, Weapons.gauntlet, 1000 + i * 300);
  assert.equal(hit.damage, Weapons.gauntlet.uppercutDamage);
  assert.ok(hit.knockback >= Weapons.gauntlet.uppercutKnockback);
});

test('katana chain ramps to 24 from the 3rd same-target hit', () => {
  const owner = new Player('k', 'Edge', 'katana', 0, 100); owner.angle = 0;
  const t = new Player('t', 'T', 'sword', 40, 100);
  const g = setup(owner, t);
  const h1 = g._resolveMeleeHitResult(owner, t, Weapons.katana, 1000);
  const h2 = g._resolveMeleeHitResult(owner, t, Weapons.katana, 1300);
  const h3 = g._resolveMeleeHitResult(owner, t, Weapons.katana, 1600);
  assert.equal(h1.damage, Weapons.katana.damage);          // 18
  assert.equal(h2.damage, Weapons.katana.damage);
  assert.equal(h3.damage, Weapons.katana.chainDamage);     // 24
});

test('chain resets after switching targets', () => {
  const owner = new Player('k', 'Edge', 'katana', 0, 100); owner.angle = 0;
  const a = new Player('a', 'A', 'sword', 40, 100);
  const b = new Player('b', 'B', 'sword', 40, 100);
  const g = Object.create(Game.prototype);
  g.players = { [owner.id]: owner, [a.id]: a, [b.id]: b };
  g.mapWidth = 700; g.mapHeight = 700; g._creditKill = () => {};
  g._resolveMeleeHitResult(owner, a, Weapons.katana, 1000);
  g._resolveMeleeHitResult(owner, a, Weapons.katana, 1300);
  g._resolveMeleeHitResult(owner, b, Weapons.katana, 1600); // different target → reset
  const back = g._resolveMeleeHitResult(owner, a, Weapons.katana, 1900);
  assert.equal(back.damage, Weapons.katana.damage);        // chain was reset, base again
});

test('axe applies bleed; hammer applies slow on hit', () => {
  const axe = new Player('x', 'Chop', 'axe', 0, 100); axe.angle = 0;
  const t1 = new Player('t1', 'T', 'sword', 30, 100);
  let g = setup(axe, t1);
  let hit = g._resolveMeleeHitResult(axe, t1, Weapons.axe, 1000);
  assert.equal(hit.bleed, true);

  const hammer = new Player('h', 'Bell', 'hammer', 0, 100); hammer.angle = 0;
  const t2 = new Player('t2', 'T', 'sword', 30, 100);
  g = setup(hammer, t2);
  hit = g._resolveMeleeHitResult(hammer, t2, Weapons.hammer, 1000);
  assert.equal(hit.slowMs, Weapons.hammer.onHitSlowMs);
});

test('bow close-range falloff is configured', () => {
  assert.equal(Weapons.bow.closeRange, 120);
  assert.equal(Weapons.bow.closeDamage, 20);
  assert.ok(Weapons.bow.closeDamage < Weapons.bow.damage);
});
