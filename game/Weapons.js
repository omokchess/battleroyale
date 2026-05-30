/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Weapon Configurations
export const Weapons = {
  sword: {
    name: 'Sword',
    damage: 24,
    cooldown: 550, // milliseconds
    range: 70,     // pixels
    angle: 110,    // degrees
    type: 'melee_arc',
    description: 'Balanced swing. Decent range and speed.',
    color: '#45f3ff'
  },
  axe: {
    name: 'Axe',
    damage: 34,
    cooldown: 900,
    range: 58,
    angle: 360,    // Full circle
    type: 'melee_circle',
    description: 'Devastating spin. Deals damage around yourself.',
    color: '#f55555'
  },
  bow: {
    name: 'Bow',
    damage: 38,
    cooldown: 800,
    range: 520,
    speed: 520,    // Projectile speed (px/s)
    type: 'projectile',
    description: 'Long-range projectile. High damage, harder to aim.',
    color: '#a3ff45'
  },
  spear: {
    name: 'Spear',
    damage: 30,
    cooldown: 700,
    range: 115,
    width: 22,     // Width of straight thrust box
    type: 'melee_line',
    description: 'Straight pierce. High range, narrow hit area.',
    color: '#ffa345'
  },
  gauntlet: {
    name: 'Gauntlets',
    damage: 12,
    cooldown: 220,
    range: 45,
    angle: 80,
    type: 'melee_arc',
    description: 'Rapid punch. Low range, extremely high speed.',
    color: '#ff45db'
  }
};
