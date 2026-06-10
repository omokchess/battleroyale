import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Protocol, MsgType } from '../multiplayer/Protocol.js';

test('Protocol.killEvent carries killer/victim/weapon for the feed', () => {
  const e = Protocol.killEvent('k', 'Kira', 'v', 'Vlad', 'sniper', '스나이퍼로');
  assert.equal(e.type, MsgType.KILL_EVENT);
  assert.equal(e.killerId, 'k');
  assert.equal(e.killerName, 'Kira');
  assert.equal(e.victimId, 'v');
  assert.equal(e.victimName, 'Vlad');
  assert.equal(e.weapon, 'sniper');
  assert.equal(e.via, '스나이퍼로');
  assert.ok(Number.isFinite(e.timestamp));
});

test('_pushKillFeed flags local involvement and local kills', () => {
  const game = Object.create(Game.prototype);
  game.localPlayerId = 'me';

  game._pushKillFeed(Protocol.killEvent('me', 'Me', 'b', 'Bob', 'sword'));
  game._pushKillFeed(Protocol.killEvent('x', 'X', 'me', 'Me', 'bow'));
  game._pushKillFeed(Protocol.killEvent('x', 'X', 'y', 'Y', 'axe'));

  const [a, b, c] = game._killFeed;
  assert.equal(a.involvesLocal, true);
  assert.equal(a.isLocalKill, true);     // I got the kill
  assert.equal(b.involvesLocal, true);
  assert.equal(b.isLocalKill, false);    // I was the victim
  assert.equal(c.involvesLocal, false);  // unrelated
});

test('_pushKillFeed caps the feed length', () => {
  const game = Object.create(Game.prototype);
  game.localPlayerId = 'me';
  for (let i = 0; i < 12; i++) {
    game._pushKillFeed(Protocol.killEvent('a', 'A', 'b', 'B', 'sword'));
  }
  assert.ok(game._killFeed.length <= 6);
});

test('damage tier thresholds drive popup styling', () => {
  // damageTier isn't exported, but _onLocalDamaged clamps shake/flash by amount.
  const game = Object.create(Game.prototype);
  game.localPlayerId = 'me';
  game.camera = { startShake() {} };
  game._hitFlashStrength = 0;
  game._onLocalDamaged(9999, 1000); // instakill → vignette maxes out
  assert.ok(game._hitFlashStrength >= 0.99);
  assert.ok(game._hitFlashUntil > 1000);
});
