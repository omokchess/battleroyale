/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Weapon Configurations
export const Weapons = {
  sword: {
    name: '검',
    damage: 24,
    cooldown: 550, // milliseconds
    range: 70,     // pixels
    angle: 110,    // degrees
    type: 'melee_arc',
    description: '공수 밸런스가 뛰어난 무기입니다. 준수한 사거리와 공격 속도를 자랑합니다.',
    color: '#45f3ff'
  },
  axe: {
    name: '도끼',
    damage: 34,
    cooldown: 900,
    range: 58,
    angle: 360,    // Full circle
    type: 'melee_circle',
    description: '파괴적인 360도 회전 공격을 펼칩니다. 자신 주변의 모든 적에게 피해를 줍니다.',
    color: '#f55555'
  },
  bow: {
    name: '활',
    damage: 38,
    cooldown: 800,
    range: 520,
    speed: 520,    // Projectile speed (px/s)
    type: 'projectile',
    description: '장거리 저격 무기입니다. 강력한 피해를 주지만 조준이 까다롭습니다.',
    color: '#a3ff45'
  },
  spear: {
    name: '창',
    damage: 30,
    cooldown: 700,
    range: 115,
    width: 22,     // Width of straight thrust box
    type: 'melee_line',
    description: '직선으로 가하는 찌르기 공격입니다. 사거리가 길고 좌우 범위가 좁습니다.',
    color: '#ffa345'
  },
  gauntlet: {
    name: '건틀릿',
    damage: 12,
    cooldown: 220,
    range: 45,
    angle: 80,
    type: 'melee_arc',
    description: '쉴 새 없는 연속 펀치 공격입니다. 사거리는 극도로 짧지만 공격 속도가 무시무시합니다.',
    color: '#ff45db'
  }
};
