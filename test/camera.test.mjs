import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera } from '../game/Camera.js';

// In Node there is no `window`, so isMobilePortrait is false and there are no
// reserves — usableHeight === viewportHeight. These tests use a 1280x720 view.
const VW = 1280, VH = 720, PAD = 60, REF = 700;
const settle = (cam, tx, ty, mapW, mapH, n = 400) => {
  for (let i = 0; i < n; i++) cam.update(tx, ty, VW, VH, mapW, mapH);
};

test('tiny arena stays in legacy full-map view (centered, target ignored)', () => {
  const cam = new Camera();
  settle(cam, 10, 10, 700, 700); // target off-center on purpose
  assert.equal(cam.tracking, false);
  // fit zoom = min(VW, VH)/(700+pad) here (height-bound) — equals the track zoom.
  assert.ok(Math.abs(cam.zoom - VH / (700 + PAD)) < 1e-9);
  // Focus is the map center regardless of where the player is.
  assert.ok(Math.abs(cam.x - 350) < 1.0);
  assert.ok(Math.abs(cam.y - 350) < 1.0);
});

test('large arena switches to player tracking', () => {
  const cam = new Camera();
  settle(cam, 900, 900, 1800, 1800);
  assert.equal(cam.tracking, true);
  // Tracking zoom = fit zoom of a REF (700) arena on this screen.
  assert.ok(Math.abs(cam.zoom - VH / (REF + PAD)) < 1e-9);
  // Player is centered (well inside the map) → camera follows it.
  assert.ok(Math.abs(cam.x - 900) < 1.0);
  assert.ok(Math.abs(cam.y - 900) < 1.0);
});

test('tracking camera clamps so the viewport never leaves the map', () => {
  const cam = new Camera();
  settle(cam, 0, 0, 1800, 1800); // player jammed into the top-left corner
  const z = VH / (REF + PAD);
  const halfW = VW / (2 * z);
  const halfH = VH / (2 * z); // screenOffsetY is 0 in node
  // Camera center can't go below the half-extent, or the view would show
  // outside the map.
  assert.ok(Math.abs(cam.x - halfW) < 1.0);
  assert.ok(Math.abs(cam.y - halfH) < 1.0);
  // And the visible left/top edge sits exactly on the map boundary (>= 0).
  assert.ok(cam.x - halfW >= -1e-6);
  assert.ok(cam.y - halfH >= -1e-6);
});

test('any arena larger than the tiny reference tracks (so the minimap shows)', () => {
  // The full-map view is reserved for the tiny reference arena; anything bigger
  // is viewed through a tiny-sized window with a minimap, even on a big screen.
  const cam = new Camera();
  for (let i = 0; i < 400; i++) cam.update(700, 700, 1600, 1600, 1400, 1400);
  assert.equal(cam.tracking, true);
});
