import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePointerAimAngle } from '../game/Input.js';

const camera = {
  x: 350,
  y: 350,
  zoom: 1,
  toScreen(worldX, worldY, viewportWidth, viewportHeight) {
    return {
      x: (worldX - this.x) * this.zoom + viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + viewportHeight / 2
    };
  },
  toWorld(screenX, screenY, viewportWidth, viewportHeight) {
    return {
      x: (screenX - viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - viewportHeight / 2) / this.zoom + this.y
    };
  }
};

test('mouse aim projects arena-center pointer direction onto the wall', () => {
  const player = { x: 100, y: 100 };
  const pointerNearCenterRight = { x: 360, y: 350 };

  const angle = resolvePointerAimAngle(
    player,
    camera,
    pointerNearCenterRight,
    700,
    700,
    700,
    700,
    0
  );

  assert.ok(Math.abs(angle - Math.atan2(250, 600)) < 0.0001);
});

test('mouse aim keeps the previous angle at exact arena center', () => {
  const player = { x: 100, y: 100 };
  const fallbackAngle = 1.234;

  const angle = resolvePointerAimAngle(
    player,
    camera,
    { x: 350, y: 350 },
    700,
    700,
    700,
    700,
    fallbackAngle
  );

  assert.equal(angle, fallbackAngle);
});

