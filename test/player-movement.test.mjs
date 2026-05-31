import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';

test('weapon move speed multipliers affect player movement distance', () => {
  const sword = new Player('sword-player', 'Sword', 'sword', 0, 0);
  const bow = new Player('bow-player', 'Bow', 'bow', 0, 0);
  const gauntlet = new Player('gauntlet-player', 'Gauntlet', 'gauntlet', 0, 0);

  sword.updatePosition(1, { d: true }, 1000, 1000);
  bow.updatePosition(1, { d: true }, 1000, 1000);
  gauntlet.updatePosition(1, { d: true }, 1000, 1000);

  assert.equal(sword.x, 180);
  assert.equal(bow.x, 108);
  assert.equal(gauntlet.x, 234);
});
