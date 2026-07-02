import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockBudget, BUDGET, weaponBaseDps } from '../game/BlockBudget.js';

test('damage per second converges near the cap no matter how hits are stacked', () => {
  const base = weaponBaseDps({ damage: 20, cooldownMs: 500 }); // 40 dps
  const cap = base * BUDGET.damageMul;                          // 48
  const b = new BlockBudget(base);
  // Fire 100 huge hits in the SAME second (a spam combo).
  let landed = 0;
  for (let i = 0; i < 100; i++) landed += b.grantDamage(500, 999);
  // Soft cap: total lands near cap (+ a bounded trickle), never the raw 99900.
  assert.ok(landed >= cap, `landed ${landed} >= cap ${cap}`);
  assert.ok(landed < cap * 1.4, `landed ${landed} soft-capped (< 1.4× cap)`);
  assert.ok(landed < 200, 'nowhere near the uncapped 99900');
});

test('a new second refills the damage budget', () => {
  const b = new BlockBudget(40); // cap 48
  const s1 = b.grantDamage(1000, 999);
  const s2 = b.grantDamage(2000, 999);   // next second
  assert.ok(s2 >= s1 * 0.9, 'budget refilled next second');
});

test('under-cap damage passes through fully', () => {
  const b = new BlockBudget(40); // cap 48
  assert.equal(b.grantDamage(0, 10), 10);
  assert.equal(b.grantDamage(0, 10), 10);   // 20 total < 48
});

test('CC budget caps status seconds granted per second', () => {
  const b = new BlockBudget(40);
  let granted = 0;
  for (let i = 0; i < 20; i++) granted += b.grantCC(0, 1000);
  assert.ok(granted <= BUDGET.ccCapMs, `cc granted ${granted} <= ${BUDGET.ccCapMs}`);
  assert.equal(b.grantCC(1000, 500), 500); // next second refills
});

test('spawn budget caps rate + concurrent entities', () => {
  const b = new BlockBudget(40);
  let ok = 0;
  for (let i = 0; i < 50; i++) if (b.allowSpawn(0, 0)) ok++;
  assert.equal(ok, BUDGET.spawnPerSec, 'spawn rate capped per second');
  // Concurrent cap: even in a fresh second, too many live entities blocks spawns.
  assert.equal(new BlockBudget(40).allowSpawn(0, BUDGET.concurrent), false);
});

test('fill() reports 0..1 budget usage for the editor gauge', () => {
  const b = new BlockBudget(40); // cap 48
  b.grantDamage(0, 24);
  const f = b.fill(0);
  assert.ok(f.damage > 0.4 && f.damage < 0.6, `damage fill ~0.5, got ${f.damage}`);
});

test('slow weapons still get the floor DPS cap', () => {
  const b = new BlockBudget(weaponBaseDps({ damage: 4, cooldownMs: 2500 })); // ~1.6 dps
  assert.ok(b.dpsCap >= BUDGET.minDpsCap, 'floor applied so the weapon still works');
});
