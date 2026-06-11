import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeRoomConfig,
  arenaDimensions,
  roomConfigBadges,
  DEFAULT_ROOM_CONFIG,
  ARENA_SIZES
} from '../game/RoomConfig.js';

test('normalizeRoomConfig fills defaults for empty / missing input', () => {
  assert.deepEqual(normalizeRoomConfig(undefined), { ...DEFAULT_ROOM_CONFIG });
  assert.deepEqual(normalizeRoomConfig(null), { ...DEFAULT_ROOM_CONFIG });
  assert.deepEqual(normalizeRoomConfig({}), { ...DEFAULT_ROOM_CONFIG });
});

test('normalizeRoomConfig rejects unknown enum values (anti-cheat on network input)', () => {
  const c = normalizeRoomConfig({ arenaSize: 'gigantic', cover: 'hax', healingRate: 'instant', storm: 'yes' });
  assert.equal(c.arenaSize, 'tiny');     // unknown → default
  assert.equal(c.cover, 'none');
  assert.equal(c.healingRate, 'normal');
  assert.equal(c.storm, true);           // any truthy coerces to boolean
});

test('normalizeRoomConfig keeps valid values', () => {
  const c = normalizeRoomConfig({ arenaSize: 'large', storm: true, cover: 'many', healing: true, healingRate: 'fast' });
  assert.deepEqual(c, { arenaSize: 'large', storm: true, cover: 'many', healing: true, healingRate: 'fast' });
});

test('arenaDimensions maps presets to a square map; default stays 700', () => {
  assert.deepEqual(arenaDimensions(undefined), { mapWidth: 700, mapHeight: 700 });
  assert.deepEqual(arenaDimensions({ arenaSize: 'huge' }), { mapWidth: ARENA_SIZES.huge, mapHeight: ARENA_SIZES.huge });
});

test('roomConfigBadges shows arena size always, extras only when enabled', () => {
  assert.deepEqual(roomConfigBadges({}), ['초소형']);
  assert.deepEqual(
    roomConfigBadges({ arenaSize: 'large', storm: true, cover: 'many', healing: true }),
    ['대형', '자기장', '엄폐물 많음', '회복']
  );
  // cover 'none' must not produce a badge
  assert.deepEqual(roomConfigBadges({ arenaSize: 'small', cover: 'none' }), ['소형']);
});
