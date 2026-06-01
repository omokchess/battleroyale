/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons, getEffectiveWeapon, DashConfig } from './Weapons.js';

export class Player {
  constructor(id, nickname, weaponType, x = 0, y = 0) {
    this.id = id;
    this.nickname = nickname || 'Gladiator';
    this.weapon = weaponType in Weapons ? weaponType : 'sword';
    const weaponConfig = Weapons[this.weapon] || Weapons.sword;
    this.x = x;
    this.y = y;

    // Core parameters
    this.maxHp = weaponConfig.maxHp || 100;
    this.hp = this.maxHp;
    this.speed = 180; // px/s
    this.radius = 14;
    this.angle = 0; // aim angle in radians
    this.kills = 0;
    this.isDead = false;
    this.respawnRemainingMs = 0;

    // Cool down tracker
    this.lastAttackTime = 0;
    this.swingDirection = -1;
    this.comboStep = 0;
    this.comboDelayUntil = 0;

    // --- Dash / i-frame state (seconds remaining) ---
    this.dashTimeLeft = 0;
    this.iframeTimeLeft = 0;
    this.dashCdLeft = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;

    // --- F skill state ---
    this.skillCdLeft = 0;     // seconds remaining on the skill cooldown
    this.buffType = null;     // 'axe_rage' | 'gauntlet_lance' | null
    this.buffTimeLeft = 0;    // seconds remaining on the active buff
    this.spearThrown = false; // true while the javelin skill is airborne
    this.arrowStacks = 0;     // bow skill charges earned by landing arrows

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
   * Decrement the per-frame movement/i-frame timers. Buff & skill cooldown
   * timers are advanced authoritatively by the host (see Game).
   */
  _tickTimers(deltaTime) {
    if (this.dashTimeLeft > 0) this.dashTimeLeft = Math.max(0, this.dashTimeLeft - deltaTime);
    if (this.iframeTimeLeft > 0) this.iframeTimeLeft = Math.max(0, this.iframeTimeLeft - deltaTime);
    if (this.dashCdLeft > 0) this.dashCdLeft = Math.max(0, this.dashCdLeft - deltaTime);
  }

  /**
   * Handles local or server physics tick
   */
  updatePosition(deltaTime, keys, mapWidth, mapHeight) {
    if (this.isDead) return;

    // A dash overrides normal locomotion with a fixed-direction burst. Consume
    // (up to) the remaining dash window *before* advancing the timers so even a
    // single large tick still produces the full dash distance.
    if (this.dashTimeLeft > 0) {
      const step = Math.min(deltaTime, this.dashTimeLeft);
      this.x += this.dashDirX * DashConfig.speed * step;
      this.y += this.dashDirY * DashConfig.speed * step;
      this._tickTimers(deltaTime);
      return;
    }

    this._tickTimers(deltaTime);

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
      const weaponConfig = Weapons[this.weapon] || Weapons.sword;
      const moveSpeed = this.speed * (weaponConfig.moveSpeed ?? 1);
      this.x += (dx / length) * moveSpeed * deltaTime;
      this.y += (dy / length) * moveSpeed * deltaTime;
    }
  }

  /**
   * Begin a dash in the given direction. Falls back to the aim direction when
   * no movement is held. Returns true when the dash actually started.
   */
  startDash(dirX = 0, dirY = 0) {
    if (this.isDead || this.dashCdLeft > 0 || this.dashTimeLeft > 0) return false;

    let len = Math.hypot(dirX, dirY);
    if (len < 1e-4) {
      dirX = Math.cos(this.angle);
      dirY = Math.sin(this.angle);
      len = 1;
    }

    this.dashDirX = dirX / len;
    this.dashDirY = dirY / len;
    this.dashTimeLeft = DashConfig.durationMs / 1000;
    this.iframeTimeLeft = DashConfig.iframeMs / 1000;
    this.dashCdLeft = DashConfig.cooldownMs / 1000;
    return true;
  }

  isInvincible() {
    return this.iframeTimeLeft > 0;
  }

  /**
   * Reset all combat timers — used on respawn and on death so buffs/cooldowns
   * never linger across lives.
   */
  clearCombatTimers() {
    this.dashTimeLeft = 0;
    this.iframeTimeLeft = 0;
    this.dashCdLeft = 0;
    this.dashDirX = 0;
    this.dashDirY = 0;
    this.skillCdLeft = 0;
    this.buffType = null;
    this.buffTimeLeft = 0;
    this.spearThrown = false;
    this.arrowStacks = 0;
    this.comboStep = 0;
    this.comboDelayUntil = 0;
  }

  /**
   * Try to initiate an attack based on weapon cooldown
   */
  canAttack(now) {
    if (this.isDead || this.spearThrown) return false;
    const ignoresComboDelay = this.weapon === 'axe' && this.buffType === 'axe_rage';
    if (!ignoresComboDelay && now < (this.comboDelayUntil || 0)) return false;
    const weaponConfig = getEffectiveWeapon(this.weapon, this.buffType);
    return (now - this.lastAttackTime) >= weaponConfig.cooldown;
  }

  triggerAttack(now) {
    this.lastAttackTime = now;
    this.swingDirection *= -1;
    return this.swingDirection;
  }

  takeDamage(amount, attackerName) {
    if (this.isDead || this.isInvincible()) return false;

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
      maxHp: this.maxHp,
      x: this.x,
      y: this.y,
      hp: this.hp,
      angle: this.angle,
      kills: this.kills,
      isDead: this.isDead,
      respawnRemainingMs: this.respawnRemainingMs || 0,
      iframeMs: Math.round(this.iframeTimeLeft * 1000),
      buffType: this.buffType,
      buffMs: Math.round(this.buffTimeLeft * 1000),
      skillCdMs: Math.round(this.skillCdLeft * 1000),
      dashCdMs: Math.round(this.dashCdLeft * 1000),
      spearThrown: this.spearThrown,
      arrowStacks: this.arrowStacks || 0,
      comboStep: this.comboStep || 0,
      comboDelayMs: Math.max(0, Math.round((this.comboDelayUntil || 0) - Date.now())),
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
    this.maxHp = Number.isFinite(data.maxHp) ? data.maxHp : (Weapons[this.weapon]?.maxHp || this.maxHp || 100);
    this.hp = Number.isFinite(data.hp) ? Math.min(data.hp, this.maxHp) : this.maxHp;
    this.kills = data.kills;
    this.isDead = data.isDead;
    this.respawnRemainingMs = data.respawnRemainingMs || 0;
    this.iframeTimeLeft = (data.iframeMs || 0) / 1000;
    this.buffType = data.buffType || null;
    this.buffTimeLeft = (data.buffMs || 0) / 1000;
    this.skillCdLeft = (data.skillCdMs || 0) / 1000;
    this.dashCdLeft = (data.dashCdMs || 0) / 1000;
    this.spearThrown = Boolean(data.spearThrown);
    this.arrowStacks = Math.max(0, Math.floor(data.arrowStacks || 0));
    this.comboStep = Math.max(0, Math.floor(data.comboStep || 0));
    this.comboDelayUntil = Date.now() + Math.max(0, Math.round(data.comboDelayMs || 0));
    this.color = data.color;
    this.accentColor = data.accentColor;

    // Coordinate smoothing can be applied in game loop,
    // but assign directly first
    this.x = data.x;
    this.y = data.y;
    this.angle = data.angle;
  }
}
