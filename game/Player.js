/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons } from './Weapons.js';

export class Player {
  constructor(id, nickname, weaponType, x = 0, y = 0) {
    this.id = id;
    this.nickname = nickname || 'Gladiator';
    this.weapon = weaponType in Weapons ? weaponType : 'sword';
    this.x = x;
    this.y = y;
    
    // Core parameters
    this.hp = 100;
    this.maxHp = 100;
    this.speed = 180; // px/s
    this.radius = 14;
    this.angle = 0; // aim angle in radians
    this.kills = 0;
    this.isDead = false;
    
    // Cool down tracker
    this.lastAttackTime = 0;

    // Generate unique colors based on hash of peer ID
    const colors = this._generateColorsFromId(id);
    this.color = colors.primary;
    this.accentColor = colors.accent;
  }

  /**
   * Generates a balanced, nice looking color scheme using HSL
   */
  _generateColorsFromId(id) {
    let hash = 0;
    const str = String(id);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Hue from 0 to 360
    const hue = Math.abs(hash) % 360;
    // Saturation 80-95% for bright vivid hues
    const saturation = 85 + (Math.abs(hash >> 8) % 15);
    // Lightness 45-55% for legibility against dark canvas background
    const lightness = 50 + (Math.abs(hash >> 16) % 10);

    return {
      primary: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      accent: `hsl(${(hue + 180) % 360}, ${saturation}%, 65%)` // Complementary color
    };
  }

  /**
   * Handles local or server physics tick
   */
  updatePosition(deltaTime, keys, mapWidth, mapHeight) {
    if (this.isDead) return;

    let dx = 0;
    let dy = 0;

    // Movement vectors from input maps
    if (keys.w || keys.ArrowUp) dy -= 1;
    if (keys.s || keys.ArrowDown) dy += 1;
    if (keys.a || keys.ArrowLeft) dx -= 1;
    if (keys.d || keys.ArrowRight) dx += 1;

    // Normalize diagonal velocity vectors
    if (dx !== 0 || dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      this.x += (dx / length) * this.speed * deltaTime;
      this.y += (dy / length) * this.speed * deltaTime;
    }
  }

  /**
   * Try to initiate an attack based on weapon cooldown
   */
  canAttack(now) {
    if (this.isDead) return false;
    const weaponConfig = Weapons[this.weapon];
    return (now - this.lastAttackTime) >= weaponConfig.cooldown;
  }

  triggerAttack(now) {
    this.lastAttackTime = now;
  }

  takeDamage(amount, attackerName) {
    if (this.isDead) return false;

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      return true; // Indicates player died in this damage hit
    }
    return false;
  }

  /**
   * Full serialization for sync transmission
   */
  serialize() {
    return {
      id: this.id,
      nickname: this.nickname,
      weapon: this.weapon,
      x: this.x,
      y: this.y,
      hp: this.hp,
      angle: this.angle,
      kills: this.kills,
      isDead: this.isDead,
      color: this.color,
      accentColor: this.accentColor
    };
  }

  /**
   * Reconstitute client values from server package
   */
  deserialize(data) {
    this.nickname = data.nickname;
    this.weapon = data.weapon;
    this.hp = data.hp;
    this.kills = data.kills;
    this.isDead = data.isDead;
    this.color = data.color;
    this.accentColor = data.accentColor;
    
    // Coordinate smoothing can be applied in game loop,
    // but assign directly first
    this.x = data.x;
    this.y = data.y;
    this.angle = data.angle;
  }
}
