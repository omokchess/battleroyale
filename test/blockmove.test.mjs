import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockVM } from '../game/BlockVM.js';

test('moveSelf clamps speed to the movement budget cap', () => {
  const vm = new BlockVM({ events: [{ on: 'basicAttack', do: [{ op: 'moveSelf', angle: 0, speed: 99999 }] }] }, 'workshop');
  let got = null;
  vm.run('basicAttack', { api: { moveSelf: (p) => { got = p; } }, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.ok(got, 'moveSelf called');
  assert.ok(got.speed <= 900, `speed clamped to move budget (${got.speed})`);
});

test('impulse clamps its force', () => {
  const vm = new BlockVM({ events: [{ on: 'basicAttack', do: [{ op: 'impulse', angle: 90, force: 5000 }] }] }, 'workshop');
  let got = null;
  vm.run('basicAttack', { api: { impulse: (p) => { got = p; } }, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.ok(got && got.force <= 700, `force clamped (${got && got.force})`);
});
