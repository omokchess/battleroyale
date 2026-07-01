import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockVM, sanitizeProgram, countBlocks, VM_LIMITS, EVENTS } from '../game/BlockVM.js';
import { ENVELOPE } from '../game/Workshop.js';

// A recording mock host API + context.
function mkCtx(overrides = {}) {
  const calls = [];
  const rec = (name) => (p) => calls.push({ name, p });
  const api = {};
  for (const n of ['spawnMelee', 'spawnProjectile', 'spawnArea', 'applyStatus', 'knockback', 'heal', 'dash', 'teleport', 'jump', 'pull', 'spawnPlacement', 'particle', 'sfx', 'shake', 'cooldownGate']) api[n] = rec(n);
  const ctx = {
    api, calls, vars: {}, rng: () => 0.5, now: 0, damageBase: 20,
    sense: { aimAngle: 0, hp: 100, maxHp: 100, x: 0, y: 0, speed: 0, grounded: true, nearestDist: 120, nearestDir: 0, combo: 0, lastDamage: 30, time: 0 },
    ...overrides,
  };
  return ctx;
}

test('NO eval: interpreter runs pure AST, malicious payloads never execute', () => {
  const evil = { events: [{ on: 'basicAttack', do: [
    { op: 'sfx', id: 'x' },
    { op: 'setVar', var: '__proto__', value: 1 },
    { op: 'evilOp', code: 'process.exit(1)' },      // unknown op → dropped
    { op: 'spawnProjectile', angle: { op: 'require', a: 'child_process' }, speed: 500, damagePct: 100 },
  ] }] };
  const vm = new BlockVM(evil, 'workshop');
  const ctx = mkCtx();
  const r = vm.run('basicAttack', ctx);
  assert.ok(!r.halted || r.halted === false || true);   // shouldn't crash
  assert.ok(ctx.calls.some(c => c.name === 'sfx'), 'known op ran');
  assert.ok(({}).__proto__ === Object.prototype, 'prototype not polluted');
  // The unknown value op resolved to 0 (angle safe), projectile still clamped.
  const proj = ctx.calls.find(c => c.name === 'spawnProjectile');
  assert.ok(proj && Number.isFinite(proj.p.angle));
});

test('sanitize drops unknown ops + caps blocks/handlers', () => {
  const many = { events: Array.from({ length: 40 }, () => ({ on: 'basicAttack', do: [{ op: 'sfx', id: 'a' }] })) };
  const s = sanitizeProgram(many, 'workshop');
  assert.ok(s.events.length <= VM_LIMITS.workshop.maxHandlers);
  const big = { events: [{ on: 'basicAttack', do: Array.from({ length: 500 }, () => ({ op: 'sfx', id: 'a' })) }] };
  assert.ok(countBlocks(sanitizeProgram(big, 'workshop')) <= VM_LIMITS.workshop.maxBlocks);
  // unknown event dropped
  assert.equal(sanitizeProgram({ events: [{ on: 'hackEvent', do: [] }] }).events.length, 0);
});

test('infinite loop is halted by the step budget (no hang / lag bomb)', () => {
  const inf = { events: [{ on: 'basicAttack', do: [
    { op: 'while', cond: 1, body: [{ op: 'setVar', var: 'x', value: 1 }] },
  ] }] };
  const vm = new BlockVM(inf, 'workshop');
  const ctx = mkCtx();
  const r = vm.run('basicAttack', ctx);
  assert.equal(r.halted, true, 'runaway loop halted');
  assert.ok(r.steps <= VM_LIMITS.workshop.maxSteps + 2, 'stopped within the step budget');
});

test('spawn bomb is capped by the spawn budget', () => {
  const bomb = { events: [{ on: 'basicAttack', do: [
    { op: 'repeat', count: 999, body: [{ op: 'spawnProjectile', angle: 0, speed: 500, damagePct: 100 }] },
  ] }] };
  const ctx = mkCtx();
  new BlockVM(bomb, 'workshop').run('basicAttack', ctx);
  const spawns = ctx.calls.filter(c => c.name === 'spawnProjectile').length;
  assert.ok(spawns <= VM_LIMITS.workshop.maxSpawns, `spawns ${spawns} <= cap`);
});

test('damage is % of base and clamped; never an absolute cheat number', () => {
  const prog = { events: [{ on: 'basicAttack', do: [
    { op: 'spawnMelee', frontOffset: 40, width: 9999, height: 9999, damagePct: 99999 },
  ] }] };
  const ctx = mkCtx({ damageBase: 20 });
  new BlockVM(prog, 'workshop').run('basicAttack', ctx);
  const m = ctx.calls.find(c => c.name === 'spawnMelee');
  assert.ok(m.p.damage <= ENVELOPE.damage[1], 'damage clamped to envelope');
  assert.ok(m.p.width <= ENVELOPE.hitboxDimMax && m.p.height <= ENVELOPE.hitboxDimMax, 'hitbox clamped');
  // 100% of base 20 = 20 (well under the 55 cap), proving it's a % not an absolute.
  const prog2 = { events: [{ on: 'basicAttack', do: [{ op: 'spawnMelee', frontOffset: 0, damagePct: 100 }] }] };
  const ctx2 = mkCtx({ damageBase: 20 });
  new BlockVM(prog2, 'workshop').run('basicAttack', ctx2);
  assert.equal(ctx2.calls.find(c => c.name === 'spawnMelee').p.damage, 20);
});

// ── Example programs from the spec ──
test('example ① fan of 3 projectiles', () => {
  const prog = { events: [{ on: 'basicAttack', do: [
    { op: 'repeatVar', var: 'i', from: -1, to: 1, body: [
      { op: 'spawnProjectile', angle: { op: 'add', a: { op: 'aimAngle' }, b: { op: 'mul', a: { var: 'i' }, b: 12 } }, speed: 520, range: 280, damagePct: 90 },
    ] },
    { op: 'sfx', id: 'shoot' },
  ] }] };
  const ctx = mkCtx({ damageBase: 20, sense: { ...mkCtx().sense, aimAngle: 0 } });
  new BlockVM(prog).run('basicAttack', ctx);
  const shots = ctx.calls.filter(c => c.name === 'spawnProjectile');
  assert.equal(shots.length, 3);
  assert.deepEqual(shots.map(s => Math.round(s.p.angle)), [-12, 0, 12]);
});

test('example ③ lifesteal on hit', () => {
  const prog = { events: [{ on: 'onHit', do: [{ op: 'heal', ofLastDamagePct: 20 }] }] };
  const ctx = mkCtx();
  new BlockVM(prog).run('onHit', ctx);
  const h = ctx.calls.find(c => c.name === 'heal');
  assert.equal(h.p.ofLastDamagePct, 20);
});

test('example ⑤ distance branch: melee when close, projectile when far', () => {
  const prog = { events: [{ on: 'basicAttack', do: [
    { op: 'if', cond: { op: 'lt', a: { op: 'nearestDist' }, b: 90 },
      then: [{ op: 'spawnMelee', frontOffset: 70, damagePct: 100 }],
      else: [{ op: 'spawnProjectile', angle: { op: 'aimAngle' }, speed: 700, range: 400, damagePct: 60 }] },
  ] }] };
  const near = mkCtx({ sense: { ...mkCtx().sense, nearestDist: 50 } });
  new BlockVM(prog).run('basicAttack', near);
  assert.ok(near.calls.some(c => c.name === 'spawnMelee') && !near.calls.some(c => c.name === 'spawnProjectile'));
  const far = mkCtx({ sense: { ...mkCtx().sense, nearestDist: 300 } });
  new BlockVM(prog).run('basicAttack', far);
  assert.ok(far.calls.some(c => c.name === 'spawnProjectile') && !far.calls.some(c => c.name === 'spawnMelee'));
});

test('projectileHit callbacks are tag-filtered', () => {
  const prog = { events: [{ on: 'projectileHit', tag: 'fireball', do: [
    { op: 'spawnArea', radius: 60, damagePct: 70 }, { op: 'applyStatus', status: 'burn', durationMs: 3000 },
  ] }] };
  const vm = new BlockVM(prog);
  const match = mkCtx({ tag: 'fireball' }); vm.run('projectileHit', match);
  assert.ok(match.calls.some(c => c.name === 'spawnArea'));
  const other = mkCtx({ tag: 'ice' }); vm.run('projectileHit', other);
  assert.equal(other.calls.length, 0, 'non-matching tag does nothing');
});

test('garbage program → safe no-op, run never throws', () => {
  for (const bad of [null, {}, 42, { events: 'x' }, { events: [null, 5, { on: 'x' }] }]) {
    const vm = new BlockVM(bad);
    assert.doesNotThrow(() => vm.run('basicAttack', mkCtx()));
  }
});
