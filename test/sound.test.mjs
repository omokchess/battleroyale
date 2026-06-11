import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sound } from '../game/Sound.js';

test('play() is a safe no-op without an AudioContext (Node)', () => {
  assert.doesNotThrow(() => { Sound.play('hit'); Sound.play('nonexistent'); });
});

test('attackSoundFor maps weapon families', () => {
  assert.equal(Sound.attackSoundFor({ type: 'projectile' }), 'shoot');
  assert.equal(Sound.attackSoundFor({ type: 'melee_slam' }), 'slam');
  assert.equal(Sound.attackSoundFor({ type: 'melee_line' }), 'thrust');
  assert.equal(Sound.attackSoundFor({ type: 'melee_precise_line' }), 'thrust');
  assert.equal(Sound.attackSoundFor({ type: 'melee_arc' }), 'slash');
  assert.equal(Sound.attackSoundFor({ type: 'melee_arc', hitMode: 'melee_blade_sweep' }), 'slash');
  assert.equal(Sound.attackSoundFor(null), 'slash');
});

test('mute toggles and notifies subscribers', () => {
  const seen = [];
  const off = Sound.onMuteChange(m => seen.push(m));
  const start = Sound.isMuted();

  const a = Sound.toggleMute();
  assert.equal(a, !start);
  assert.equal(Sound.isMuted(), !start);
  assert.deepEqual(seen, [!start]);

  Sound.setMuted(start); // restore
  off();
});
