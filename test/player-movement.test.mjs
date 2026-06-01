import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';
import { Weapons } from '../game/Weapons.js';

test('weapon move speed multipliers affect player movement distance', () => {
  const sword = new Player('sword-player', 'Sword', 'sword', 0, 0);
  const bow = new Player('bow-player', 'Bow', 'bow', 0, 0);
  const gauntlet = new Player('gauntlet-player', 'Gauntlet', 'gauntlet', 0, 0);
  const dagger = new Player('dagger-player', 'Dagger', 'dagger', 0, 0);
  const hammer = new Player('hammer-player', 'Hammer', 'hammer', 0, 0);

  sword.updatePosition(1, { d: true }, 1000, 1000);
  bow.updatePosition(1, { d: true }, 1000, 1000);
  gauntlet.updatePosition(1, { d: true }, 1000, 1000);
  dagger.updatePosition(1, { d: true }, 1000, 1000);
  hammer.updatePosition(1, { d: true }, 1000, 1000);

  assert.equal(sword.x, 180 * Weapons.sword.moveSpeed);
  assert.equal(bow.x, 180 * Weapons.bow.moveSpeed);
  assert.equal(gauntlet.x, 180 * Weapons.gauntlet.moveSpeed);
  assert.equal(dagger.x, 180 * Weapons.dagger.moveSpeed);
  assert.equal(hammer.x, 180 * Weapons.hammer.moveSpeed);
});

test('weapon max hp is applied on spawn and serialization', () => {
  const sword = new Player('sword-player', 'Sword', 'sword', 0, 0);
  const axe = new Player('axe-player', 'Axe', 'axe', 0, 0);
  const bow = new Player('bow-player', 'Bow', 'bow', 0, 0);
  const spear = new Player('spear-player', 'Spear', 'spear', 0, 0);
  const gauntlet = new Player('gauntlet-player', 'Gauntlet', 'gauntlet', 0, 0);
  const greatsword = new Player('greatsword-player', 'Greatsword', 'greatsword', 0, 0);
  const scythe = new Player('scythe-player', 'Scythe', 'scythe', 0, 0);
  const dagger = new Player('dagger-player', 'Dagger', 'dagger', 0, 0);
  const rapier = new Player('rapier-player', 'Rapier', 'rapier', 0, 0);
  const hammer = new Player('hammer-player', 'Hammer', 'hammer', 0, 0);

  assert.equal(sword.maxHp, 120);
  assert.equal(axe.maxHp, 150);
  assert.equal(bow.maxHp, 80);
  assert.equal(spear.maxHp, 100);
  assert.equal(gauntlet.maxHp, 110);
  assert.equal(greatsword.maxHp, 140);
  assert.equal(scythe.maxHp, 115);
  assert.equal(dagger.maxHp, 90);
  assert.equal(rapier.maxHp, 100);
  assert.equal(hammer.maxHp, 145);
  assert.equal(bow.hp, bow.maxHp);
  assert.equal(axe.serialize().maxHp, 150);
  assert.equal(hammer.serialize().maxHp, 145);
});
