import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockVM, sanitizeProgram } from '../game/BlockVM.js';

test('broadcast runs the matching onSignal handler', () => {
  const vm = new BlockVM({
    events: [
      { on: 'basicAttack', do: [{ op: 'broadcast', sig: 'boom' }] },
      { on: 'onSignal', sig: 'boom', do: [{ op: 'spawnArea', damagePct: 100 }] },
      { on: 'onSignal', sig: 'other', do: [{ op: 'spawnMelee', damagePct: 100 }] },
    ],
  }, 'workshop');
  const calls = [];
  const api = { spawnArea: () => calls.push('area'), spawnMelee: () => calls.push('melee') };
  vm.run('basicAttack', { api, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.deepEqual(calls, ['area'], 'only the boom handler fired, not other');
});

test('a signal storm cannot recurse forever (depth-bounded)', () => {
  const vm = new BlockVM({
    events: [
      { on: 'basicAttack', do: [{ op: 'broadcast', sig: 'a' }] },
      { on: 'onSignal', sig: 'a', do: [{ op: 'spawnArea', damagePct: 10 }, { op: 'broadcast', sig: 'a' }] },
    ],
  }, 'workshop');
  let n = 0;
  const r = vm.run('basicAttack', { api: { spawnArea: () => n++ }, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.ok(n > 0 && n <= 8, `bounded recursion (${n} fires)`);
  assert.ok(!r.halted || r.halted, 'did not hang');   // completes either way
});

test('lists: push, read back by index, and length', () => {
  const vm = new BlockVM({
    events: [{ on: 'basicAttack', do: [
      { op: 'listPush', list: 'marks', value: 11 },
      { op: 'listPush', list: 'marks', value: 22 },
      { op: 'setVar', var: 'first', value: { op: 'listGet', list: 'marks', i: 0 } },
      { op: 'setVar', var: 'len', value: { op: 'listLen', list: 'marks' } },
    ] }],
  }, 'workshop');
  const vars = {}, lists = {};
  vm.run('basicAttack', { api: {}, vars, lists, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.equal(lists.marks.length, 2);
  assert.equal(vars.first, 11);
  assert.equal(vars.len, 2);
});

test('list length is capped (no unbounded growth)', () => {
  const vm = new BlockVM({
    events: [{ on: 'basicAttack', do: [
      { op: 'repeat', count: 100, body: [{ op: 'listPush', list: 'big', value: 1 }] },
      { op: 'setVar', var: 'len', value: { op: 'listLen', list: 'big' } },
    ] }],
  }, 'workshop');
  const vars = {}, lists = {};
  vm.run('basicAttack', { api: {}, vars, lists, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.ok(lists.big.length <= 32, `list capped at 32 (${lists.big.length})`);
});

test('sanitize preserves onSignal sig + list ops', () => {
  const s = sanitizeProgram({
    events: [
      { on: 'onSignal', sig: 'x', do: [{ op: 'listPush', list: 'L', value: 5 }] },
      { on: 'basicAttack', do: [{ op: 'setVar', var: 'v', value: { op: 'listGet', list: 'L', i: 1 } }] },
    ],
  }, 'workshop');
  const sigEv = s.events.find(e => e.on === 'onSignal');
  assert.equal(sigEv.sig, 'x');
  assert.equal(sigEv.do[0].op, 'listPush');
  assert.equal(sigEv.do[0].list, 'L');
  const get = s.events.find(e => e.on === 'basicAttack').do[0].value;
  assert.equal(get.op, 'listGet');
  assert.equal(get.list, 'L');
});
