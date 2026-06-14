import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player } from '../game/Player.js';

const LOADOUT = {
  weaponskin: { id: 'weaponskin:ember', data: { skin: 'ember', tint: '#ff6b3d' } },
  dashtrail: { id: 'dashtrail:flame', data: { color: '#ff7a3d' } },
  killfx: { id: 'killfx:firework', data: { style: 'firework', color: '#ffd24a' } },
  respawnfx: { id: 'respawnfx:warp', data: { color: '#67e8f9' } },
  title: { id: 'title:slayer', data: { text: '학살자', color: '#f87171' } },
};

test('applyCosmetics maps the equipped loadout onto the player', () => {
  const p = new Player('a', 'Nick', 'sword', 0, 0, { cosmetics: LOADOUT });
  assert.equal(p.weaponTint, '#ff6b3d');
  assert.equal(p.weaponSkin, 'ember');
  assert.equal(p.dashTrailColor, '#ff7a3d');
  assert.deepEqual(p.killFx, { style: 'firework', color: '#ffd24a' });
  assert.equal(p.respawnFxColor, '#67e8f9');
  assert.deepEqual(p.title, { text: '학살자', color: '#f87171' });
});

test('cosmetics survive serialize → deserialize (P2P sync)', () => {
  const src = new Player('a', 'Nick', 'sword', 10, 20, { cosmetics: LOADOUT });
  const snap = src.serialize();
  const dst = new Player('a', 'Nick', 'sword');
  dst.deserialize(snap);
  assert.equal(dst.weaponTint, '#ff6b3d');
  assert.equal(dst.weaponSkin, 'ember');
  assert.equal(dst.dashTrailColor, '#ff7a3d');
  assert.deepEqual(dst.title, { text: '학살자', color: '#f87171' });
  assert.deepEqual(dst.killFx, { style: 'firework', color: '#ffd24a' });
});

test('no cosmetics → all null (default look)', () => {
  const p = new Player('a', 'Nick', 'sword');
  assert.equal(p.weaponTint, null);
  assert.equal(p.weaponSkin, null);
  assert.equal(p.title, null);
  assert.equal(p.killFx, null);
});
