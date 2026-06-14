import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWater, WATER_CELL_SIZE } from '../game/Water.js';

test('water is deterministic for a given map size (no sync needed)', () => {
  const a = generateWater(1400, 1000);
  const b = generateWater(1400, 1000);
  assert.deepEqual([...a.cells].sort(), [...b.cells].sort());
  assert.deepEqual(a.tiles, b.tiles);
});

test('water exists and stays inside the arena bounds', () => {
  const w = generateWater(1400, 1000);
  assert.ok(w.tiles.length > 0, 'a normal arena should have a lake');
  for (const t of w.tiles) {
    assert.ok(t.x >= 0 && t.y >= 0, 'top-left non-negative');
    assert.ok(t.x + t.w <= 1400, 'within width');
    assert.ok(t.y + t.h <= 1000, 'within height');
  }
});

test('water is mirrored left↔right for fair 1v1s', () => {
  const w = generateWater(1400, 1000);
  for (const key of w.cells) {
    const [c, r] = key.split(',').map(Number);
    assert.ok(w.cells.has(`${w.cols - 1 - c},${r}`), `mirror of ${key} present`);
  }
});

test('the dead-center stays clear of water (spawn safety)', () => {
  const W = 1400, H = 1000;
  const w = generateWater(W, H);
  const cx = W / 2, cy = H / 2;
  for (const t of w.tiles) {
    const overlapsCenter = t.x < cx + 60 && t.x + t.w > cx - 60 &&
                           t.y < cy + 60 && t.y + t.h > cy - 60;
    assert.ok(!overlapsCenter, 'no water tile covers the arena center');
  }
});

test('tiny arenas produce no water (guarded)', () => {
  const w = generateWater(120, 120);
  assert.equal(w.tiles.length, 0);
  assert.equal(WATER_CELL_SIZE, 32);
});
