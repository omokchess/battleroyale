import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWeaponSpriteDrawAngle } from '../game/Renderer.js';

test('idle weapon sprites point at aim except greatsword', () => {
  const aimAngle = 0.42;
  const motionAngle = 1.25;
  const normalizedWeapons = [
    'sword',
    'axe',
    'bow',
    'spear',
    'gauntlet',
    'scythe',
    'dagger',
    'rapier',
    'hammer',
    'matchlock',
    'katana',
    'magicstaff',
    'sniper'
  ];

  for (const weapon of normalizedWeapons) {
    assert.equal(resolveWeaponSpriteDrawAngle(weapon, aimAngle, motionAngle, false), aimAngle);
  }

  assert.equal(resolveWeaponSpriteDrawAngle('greatsword', aimAngle, motionAngle, false), aimAngle - 0.7);
});

test('active weapon sprites keep attack animation angles', () => {
  const aimAngle = 0.42;
  const motionAngle = 1.25;

  assert.equal(resolveWeaponSpriteDrawAngle('sniper', aimAngle, motionAngle, true), motionAngle);
  assert.equal(resolveWeaponSpriteDrawAngle('bow', aimAngle, motionAngle, true), aimAngle);
  assert.equal(resolveWeaponSpriteDrawAngle('scythe', aimAngle, motionAngle, true), motionAngle + 0.35);
});
