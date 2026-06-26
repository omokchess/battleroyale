import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';
import { Weapons } from '../game/Weapons.js';
import { buildLevel } from '../game/Level.js';

// Platformer pivot: horizontal movement accelerates toward a capped run speed
// (no instant top-down velocity), so we assert the per-weapon move-speed
// multiplier still SCALES how far a grounded player runs over a fixed window.
test('weapon move-speed multipliers scale horizontal run distance', () => {
  const level = buildLevel(1000);
  const groundTop = level.solids[0].y;
  const runDist = (weapon) => {
    const p = new Player('p', 'N', weapon, 240, groundTop - 21); // feet just above ground
    for (let i = 0; i < 45; i++) p.updatePosition(1 / 60, { d: true }, level);
    return p.x - 240;
  };
  const order = (wa, wb) => {
    const a = runDist(wa), b = runDist(wb);
    if (Weapons[wa].moveSpeed > Weapons[wb].moveSpeed) assert.ok(a > b + 1, `${wa} should outrun ${wb}`);
    else if (Weapons[wa].moveSpeed < Weapons[wb].moveSpeed) assert.ok(a < b - 1, `${wb} should outrun ${wa}`);
    else assert.ok(Math.abs(a - b) < 2, `${wa}/${wb} equal move speed → equal distance`);
  };
  order('bow', 'sword');
  order('sword', 'gauntlet');
  order('dagger', 'hammer');
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
  assert.equal(axe.maxHp, 155);
  assert.equal(bow.maxHp, 85);
  assert.equal(spear.maxHp, 105);
  assert.equal(gauntlet.maxHp, 110);
  assert.equal(greatsword.maxHp, 140);
  assert.equal(scythe.maxHp, 115);
  assert.equal(dagger.maxHp, 90);
  assert.equal(rapier.maxHp, 100);
  assert.equal(hammer.maxHp, 150);
  assert.equal(bow.hp, bow.maxHp);
  assert.equal(axe.serialize().maxHp, 155);
  assert.equal(hammer.serialize().maxHp, 150);
});
