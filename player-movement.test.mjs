import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';
import { Weapons } from '../game/Weapons.js';

test('weapon move speed multipliers affect player movement distance', () => {
  const sword = new Player('sword-player', 'Sword', 'sword', 0, 0);
  const bow = new Player('bow-player', 'Bow', 'bow', 0, 0);
  const gauntlet = new Player('gauntlet-player', 'Gauntlet', 'gauntlet', 0, 0);

  sword.updatePosition(1, { d: true }, 1000, 1000);
  bow.updatePosition(1, { d: true }, 1000, 1000);
  gauntlet.updatePosition(1, { d: true }, 1000, 1000);

  assert.equal(sword.x, 180 * Weapons.sword.moveSpeed);
  assert.equal(bow.x, 180 * Weapons.bow.moveSpeed);
  assert.equal(gauntlet.x, 180 * Weapons.gauntlet.moveSpeed);
});

test('weapon max hp is applied on spawn and serialization', () => {
  const sword = new Player('sword-player', 'Sword', 'sword', 0, 0);
  const axe = new Player('axe-player', 'Axe', 'axe', 0, 0);
  const bow = new Player('bow-player', 'Bow', 'bow', 0, 0);
  const spear = new Player('spear-player', 'Spear', 'spear', 0, 0);
  const gauntlet = new Player('gauntlet-player', 'Gauntlet', 'gauntlet', 0, 0);

  assert.equal(sword.maxHp, 120);
  assert.equal(axe.maxHp, 150);
  assert.equal(bow.maxHp, 80);
  assert.equal(spear.maxHp, 100);
  assert.equal(gauntlet.maxHp, 110);
  assert.equal(bow.hp, bow.maxHp);
  assert.equal(axe.serialize().maxHp, 150);
});
