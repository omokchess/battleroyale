import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebaseEffectSnapshot } from '../game/Game.js';
import { Renderer } from '../game/Renderer.js';

test('rebases host effect progress onto the client clock', () => {
  const effect = rebaseEffectSnapshot({
    x: 10,
    y: 20,
    angle: 0.5,
    weapon: 'spear',
    type: 'melee_line',
    attackerId: 'peer-a',
    progress: 0.25,
    timestamp: 999999,
    lifetime: 800
  }, 10000);

  assert.equal(effect.progress, 0.25);
  assert.equal(effect.timestamp, 9800);
  assert.equal(effect.lifetime, 800);
  assert.equal(effect.attackerId, 'peer-a');
});

test('renderer can anchor effects when player map keys differ from peer ids', () => {
  const renderer = Object.create(Renderer.prototype);
  const effect = {
    x: 0,
    y: 0,
    angle: 0,
    weapon: 'gauntlet',
    type: 'melee_arc',
    attackerId: 'peer-a',
    progress: 0.2
  };
  const players = {
    guestSlot: { id: 'peer-a', x: 120, y: 90, isDead: false }
  };

  const anchored = renderer._resolveEffectAttachment(effect, players);

  assert.equal(anchored.x, 120);
  assert.equal(anchored.y, 90);
});
