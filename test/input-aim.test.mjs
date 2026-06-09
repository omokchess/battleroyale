import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Input, resolvePointerAimAngle } from '../game/Input.js';

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

test('mobile joystick cursor only flashes after target casts', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDateNow = Date.now;

  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  globalThis.localStorage = { getItem: () => 'true' };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { maxTouchPoints: 1 }
  });

  try {
    const input = new Input();
    input.joystickEnabled = true;
    input.hasMouseInput = false;
    input.mouse = { x: 120, y: 180 };

    assert.equal(input.getCursorPos(1000), null);

    input.targetCursorVisibleUntil = 1100;
    assert.deepEqual(input.getCursorPos(1050), { x: 120, y: 180 });
    assert.equal(input.getCursorPos(1101), null);

    input.hasMouseInput = true;
    assert.deepEqual(input.getCursorPos(1101), { x: 120, y: 180 });

    Date.now = () => 2000;
    input._markTouchInput();
    Date.now = () => 2200;
    assert.equal(input._isSyntheticTouchMouseEvent(), true);
    Date.now = () => 2701;
    assert.equal(input._isSyntheticTouchMouseEvent(), false);
    assert.equal(input._isSyntheticTouchMouseEvent({ sourceCapabilities: { firesTouchEvents: true } }), true);
  } finally {
    Date.now = originalDateNow;

    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;

    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;

    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});

