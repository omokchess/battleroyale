import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockVM, sanitizeProgram, countBlocks } from '../game/BlockVM.js';

// A weapon with a reusable "burst(n)" custom block that fires n projectiles.
const prog = {
  funcs: { burst: { params: ['n'], do: [{ op: 'repeat', count: { op: 'var', var: 'n' }, body: [{ op: 'spawnProjectile', damagePct: 50 }] }] } },
  events: [{ on: 'basicAttack', do: [{ op: 'callFunc', name: 'burst', args: [3] }] }],
};

test('sanitizeProgram keeps funcs + callFunc with its args', () => {
  const s = sanitizeProgram(prog, 'workshop');
  assert.ok(s.funcs && s.funcs.burst, 'burst func preserved');
  assert.deepEqual(s.funcs.burst.params, ['n']);
  const call = s.events[0].do[0];
  assert.equal(call.op, 'callFunc');
  assert.equal(call.name, 'burst');
  assert.equal(call.args.length, 1);
});

test('countBlocks includes function-body blocks', () => {
  const s = sanitizeProgram(prog, 'workshop');
  // callFunc(1) + burst body: repeat(1) + spawnProjectile(1) = 3
  assert.equal(countBlocks(s), 3);
});

test('calling a custom block runs its body with params bound', () => {
  const vm = new BlockVM(prog, 'workshop');
  let shots = 0;
  const api = { spawnProjectile: () => shots++ };
  vm.run('basicAttack', { api, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.equal(shots, 3, 'burst(3) fired 3 projectiles');
});

test('params are locals — restored after the call, no leak', () => {
  const vm = new BlockVM({
    funcs: { f: { params: ['x'], do: [{ op: 'setVar', var: 'out', value: { op: 'var', var: 'x' } }] } },
    events: [{ on: 'basicAttack', do: [
      { op: 'setVar', var: 'x', value: 99 },
      { op: 'callFunc', name: 'f', args: [7] },
      { op: 'setVar', var: 'seen', value: { op: 'var', var: 'x' } },
    ] }],
  }, 'workshop');
  const vars = {};
  vm.run('basicAttack', { api: {}, vars, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.equal(vars.out, 7, 'inside the call x was the arg 7');
  assert.equal(vars.seen, 99, 'after the call the caller\'s x is restored');
});

test('recursive custom block cannot hang — call-depth cap halts it', () => {
  const vm = new BlockVM({
    funcs: { loop: { params: [], do: [{ op: 'spawnProjectile', damagePct: 10 }, { op: 'callFunc', name: 'loop', args: [] }] } },
    events: [{ on: 'basicAttack', do: [{ op: 'callFunc', name: 'loop', args: [] }] }],
  }, 'workshop');
  let shots = 0;
  const r = vm.run('basicAttack', { api: { spawnProjectile: () => shots++ }, vars: {}, rng: Math.random, now: 0, damageBase: 20, sense: {} });
  assert.ok(r.halted, 'runaway recursion was halted, not hung');
  assert.ok(shots <= 8, `bounded by the call-depth cap (${shots} shots)`);
});
