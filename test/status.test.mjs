import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { STATUS } from '../game/Status.js';

function gameWith(...players) {
  const g = Object.create(Game.prototype);
  g.players = {};
  for (const p of players) g.players[p.id] = p;
  g._creditKill = () => {};
  return g;
}

test('bleed ticks 4/s for 3s (12 total), non-stacking refresh', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  const hp0 = t.hp;
  g._applyBleed(t, 'src');
  assert.ok(t.bleedTimeLeft > 2.9 && t.bleedTimeLeft <= 3);
  for (let i = 0; i < 4; i++) g._tickStatuses(1.0, 1000 + i * 1000);
  assert.equal(hp0 - t.hp, STATUS.bleed.dps * 3); // 12
  assert.equal(t.bleedTimeLeft, 0);
});

test('burn and bleed coexist and both tick', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  const hp0 = t.hp;
  g._applyBurn(t, 'a');   // 6/s 3s
  g._applyBleed(t, 'b');  // 4/s 3s
  for (let i = 0; i < 3; i++) g._tickStatuses(1.0, 1000 + i * 1000);
  assert.equal(hp0 - t.hp, (STATUS.burn.dps + STATUS.bleed.dps) * 3); // 30
});

test('slow is −30% and a longer duration wins', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  g._applySlow(t, 500);
  g._applySlow(t, 1500);
  assert.ok(Math.abs(t.slowTimeLeft - 1.5) < 1e-6);
  g._applySlow(t, 300); // shorter → ignored
  assert.ok(Math.abs(t.slowTimeLeft - 1.5) < 1e-6);
  assert.equal(STATUS.slow.moveFactor, 0.7);
});

test('stun applies once, then immunity blocks re-stun (anti stun-lock)', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  g._applyStun(t, 400, 1000);
  assert.ok(Math.abs(t.stunTimeLeft - 0.4) < 1e-6);
  t.stunTimeLeft = 0; // pretend it wore off
  g._applyStun(t, 400, 1500); // within immunity window → blocked
  assert.equal(t.stunTimeLeft, 0);
  // After the immunity window, stun works again.
  g._applyStun(t, 400, 1000 + 400 + STATUS.stun.immuneMs + 10);
  assert.ok(t.stunTimeLeft > 0);
});

test('status is blocked during i-frames and respawn protection', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  t.iframeTimeLeft = 0.2;                 // dashing → new status blocked
  g._applyBleed(t, 's');
  assert.equal(t.bleedTimeLeft, 0);
  t.iframeTimeLeft = 0;
  t.statusImmuneUntil = Date.now() + 1000; // respawn protection
  g._applyBurn(t, 's');
  assert.equal(t.burnTimeLeft, 0);
});

test('existing DoTs keep ticking even while i-frame blocks new ones', () => {
  const t = new Player('t', 'T', 'sword', 0, 0);
  const g = gameWith(t);
  const hp0 = t.hp;
  g._applyBleed(t, 's');     // applied before i-frames
  t.iframeTimeLeft = 5;      // now invincible to NEW status
  g._tickStatuses(1.0, 2000);
  assert.equal(hp0 - t.hp, STATUS.bleed.dps); // tick still landed
});
