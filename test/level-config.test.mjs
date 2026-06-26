import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLevel } from '../game/Level.js';

test('platform density controls one-way platform count', () => {
  const off = buildLevel(1000, { platforms: 'none', cover: 'none' });
  const many = buildLevel(1000, { platforms: 'many', platformShape: 'balanced', cover: 'none' });
  assert.equal(off.oneWays.length, 0);
  assert.ok(many.oneWays.length > off.oneWays.length);
});

test('cover density controls solid cover blocks independently from platforms', () => {
  const noCover = buildLevel(1000, { platforms: 'none', cover: 'none' });
  const covered = buildLevel(1000, { platforms: 'none', cover: 'many' });
  assert.equal(noCover.oneWays.length, covered.oneWays.length);
  assert.ok(covered.solids.length > noCover.solids.length);
});

test('platform shape changes platform placement', () => {
  const balanced = buildLevel(1000, { platforms: 'some', platformShape: 'balanced', cover: 'none' });
  const stairs = buildLevel(1000, { platforms: 'some', platformShape: 'stairs', cover: 'none' });
  assert.notDeepEqual(
    stairs.oneWays.map(p => [p.x, p.y]),
    balanced.oneWays.map(p => [p.x, p.y])
  );
});
