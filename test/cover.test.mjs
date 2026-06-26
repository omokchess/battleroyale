import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateCover, coverBlocksCircle, coverClearOfPoint,
  resolveCover, coverBlocksSegment, coverRayDistance
} from '../game/Cover.js';

test('no cover when density is none', () => {
  assert.deepEqual(generateCover({ cover: 'none' }, 700, 700), []);
  assert.deepEqual(generateCover({}, 1400, 1400), []);
});

test('generated cover is deterministic, freely scattered, and scales with area', () => {
  // Pivot: cover is no longer left-right mirrored — it is a seeded free scatter
  // (same seed → identical, different seed → different), still scaling with area.
  const a1 = generateCover({ cover: 'some' }, 700, 700, 1234);
  const a2 = generateCover({ cover: 'some' }, 700, 700, 1234);
  const b = generateCover({ cover: 'some' }, 700, 700, 9999);
  const big = generateCover({ cover: 'some' }, 1400, 1400, 1234);
  assert.ok(a1.length > 0);
  assert.deepEqual(a1, a2);                         // deterministic from the seed
  assert.notDeepEqual(a1, b);                       // varies with the seed
  assert.ok(big.length > a1.length);               // 4x area → more tiles

  // It must NOT be a perfect mirror: most tiles have no exact mirror twin.
  const W = 700;
  const mirrored = a1.filter(t =>
    a1.some(o => Math.abs(o.x - (W - t.x - t.w)) < 1e-6 && Math.abs(o.y - t.y) < 1e-6));
  assert.ok(mirrored.length < a1.length, 'cover should not be left-right mirrored');
});

test('circle overlap + point clearance', () => {
  const cover = [{ x: 100, y: 100, w: 46, h: 46 }];
  assert.equal(coverBlocksCircle(cover, 123, 123, 14), true);  // inside
  assert.equal(coverBlocksCircle(cover, 300, 300, 14), false); // far
  assert.equal(coverClearOfPoint(cover, 300, 300, 24), true);
  assert.equal(coverClearOfPoint(cover, 123, 123, 24), false);
});

test('resolveCover ejects a circle out of a tile', () => {
  const cover = [{ x: 100, y: 100, w: 46, h: 46 }];
  const p = { x: 120, y: 90 };  // overlapping the top edge
  const moved = resolveCover(cover, p, 14);
  assert.equal(moved, true);
  assert.equal(coverBlocksCircle(cover, p.x, p.y, 14), false); // now clear
});

test('segment blocking (melee / projectile line of sight)', () => {
  const cover = [{ x: 100, y: 100, w: 46, h: 46 }];
  assert.equal(coverBlocksSegment(cover, 50, 123, 250, 123), true);  // passes through
  assert.equal(coverBlocksSegment(cover, 50, 50, 250, 50), false);   // above it
});

test('ray distance stops hitscan at the tile', () => {
  const cover = [{ x: 100, y: 100, w: 46, h: 46 }];
  // Ray from the left heading +x at y=123 enters the tile at x=100 → dist 50.
  const d = coverRayDistance(cover, 50, 123, 1, 0);
  assert.ok(Math.abs(d - 50) < 1e-6);
  // Ray pointing away misses.
  assert.equal(coverRayDistance(cover, 50, 123, -1, 0), Infinity);
  // Ray on a clear lane misses.
  assert.equal(coverRayDistance(cover, 50, 50, 1, 0), Infinity);
});
