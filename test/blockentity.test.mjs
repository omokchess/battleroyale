import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockVM, sanitizeProgram, countBlocks } from '../game/BlockVM.js';

// A homing-missile-style entity program: on each tick, home toward the nearest
// enemy; on expiry, split into fragments.
const prog = {
  events: [{ on: 'basicAttack', do: [{ op: 'spawnProjectile', angle: { op: 'aimAngle' }, speed: 400, range: 300, tag: 'missile', damagePct: 80 }] }],
  entities: {
    missile: { events: [
      { on: 'onEntityTick', do: [{ op: 'homing', turnDeg: 200 }] },
      { on: 'onExpire', do: [{ op: 'split', count: 4, spreadDeg: 60, speed: 300, damagePct: 40, tag: 'frag' }] },
      { on: 'onWallHit', do: [{ op: 'setVelocity', angle: { op: 'nearestDir' }, speed: 350 }] },
    ] },
  },
};

test('sanitizeProgram keeps a valid entities section', () => {
  const s = sanitizeProgram(prog, 'workshop');
  assert.ok(s.entities && s.entities.missile, 'missile entity preserved');
  const evs = s.entities.missile.events.map(e => e.on);
  assert.deepEqual(new Set(evs), new Set(['onEntityTick', 'onExpire', 'onWallHit']));
});

test('countBlocks includes entity-script blocks', () => {
  const s = sanitizeProgram(prog, 'workshop');
  // 1 (spawnProjectile) + 3 entity handlers × 1 block each = 4
  assert.equal(countBlocks(s), 4);
});

test('unknown entity events are dropped, unknown ops filtered', () => {
  const s = sanitizeProgram({
    events: [],
    entities: { x: { events: [
      { on: 'notARealEvent', do: [{ op: 'homing' }] },
      { on: 'onEntityTick', do: [{ op: 'deleteUniverse' }, { op: 'homing', turnDeg: 90 }] },
    ] } },
  }, 'workshop');
  const ev = s.entities.x.events;
  assert.equal(ev.length, 1, 'only the real event survives');
  assert.equal(ev[0].do.length, 1, 'the bogus op is dropped, homing kept');
  assert.equal(ev[0].do[0].op, 'homing');
});

test('runEntity invokes the entity api (homing/setVelocity/split)', () => {
  const vm = new BlockVM(prog, 'workshop');
  assert.ok(vm.hasEntityHandler('missile', 'onEntityTick'));
  assert.ok(!vm.hasEntityHandler('missile', 'onKill'));
  const calls = [];
  const api = {
    homing: (a) => calls.push(['homing', a.turnDeg]),
    setVelocity: (a) => calls.push(['setVelocity', Math.round(a.speed)]),
    split: (a) => calls.push(['split', a.count, Math.round(a.damage)]),
  };
  const sense = { nearestDir: 45, vx: 100, vy: 0, life: 0.5 };
  vm.runEntity('missile', 'onEntityTick', { api, vars: {}, rng: Math.random, now: 0, damageBase: 50, sense });
  vm.runEntity('missile', 'onExpire', { api, vars: {}, rng: Math.random, now: 0, damageBase: 50, sense });
  assert.deepEqual(calls[0], ['homing', 200]);
  const split = calls.find(c => c[0] === 'split');
  assert.ok(split, 'split fired on expire');
  assert.equal(split[1], 4, '4 fragments');
  // damage = base 50 × 40% = 20, envelope-clamped
  assert.ok(split[2] > 0 && split[2] <= 55, `frag damage ${split[2]} within envelope`);
});

test('entity senses (myVx/myLife/bounces) read from ctx.sense', () => {
  const vm = new BlockVM({
    events: [],
    entities: { t: { events: [{ on: 'onEntityTick', do: [
      { op: 'if', cond: { op: 'gt', a: { op: 'bounces' }, b: 2 }, then: [{ op: 'removeSelf' }], else: [] },
    ] }] } },
  }, 'workshop');
  let removed = 0;
  const api = { removeSelf: () => removed++ };
  vm.runEntity('t', 'onEntityTick', { api, vars: {}, now: 0, sense: { bounces: 1 } });
  assert.equal(removed, 0, 'not removed at 1 bounce');
  vm.runEntity('t', 'onEntityTick', { api, vars: {}, now: 0, sense: { bounces: 3 } });
  assert.equal(removed, 1, 'removed after 2 bounces');
});
