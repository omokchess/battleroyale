/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons, getEffectiveWeapon, DashConfig } from './Weapons.js';

export class Player {
  constructor(id, nickname, weaponType, x = 0, y = 0, costume = null) {
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
    this.stunTimeLeft = 0;

    // --- F skill state ---
    this.skillCdLeft = 0;     // seconds remaining on the skill cooldown
    this.buffType = null;     // 'axe_rage' | 'gauntlet_lance' | null
    this.buffTimeLeft = 0;    // seconds remaining on the active buff
    this.spearThrown = false; // true while the javelin skill is airborne
    this.hammerSkillUntil = 0; // host-ms timestamp: no basic attacks until the hammer skill fully ends
    this.pendingIcicles = 0;   // magic staff: ice shards loaded, waiting for F to fire
    this.burnTimeLeft = 0;     // fire DoT: seconds remaining
    this.burnTickLeft = 0;     // fire DoT: seconds until the next tick
    this.burnDps = 0;          // fire DoT: damage per tick
    this.burnSourceId = null;  // fire DoT: who applied it (kill credit)
    this.pendingWeapon = null; // queued weapon swap, applied on next respawn
    this.arrowStacks = 0;     // bow skill charges earned by landing arrows
    this.greatswordChargeStart = 0;
    this.greatswordChargeAngle = 0;
    this.daggerQte = null;

    // Equipped costume overrides the auto-generated colors; otherwise derive
    // a unique color scheme from the peer ID hash.
    if (costume && costume.color) {
      this.color = costume.color;
      this.accentColor = costume.accentColor || costume.color;
    } else {
      const colors = this._generateColorsFromId(id);
      this.color = colors.primary;
      this.accentColor = colors.accent;
    }
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
    if (this.stunTimeLeft > 0) this.stunTimeLeft = Math.max(0, this.stunTimeLeft - deltaTime);
  }

  /**
   * Handles local or server physics tick
   */
  updatePosition(deltaTime, keys, mapWidth, mapHeight) {
    if (this.isDead) return;
    if (this.stunTimeLeft > 0) {
      this._tickTimers(deltaTime);
      return;
    }
    if (this.daggerQte) {
      this._tickTimers(deltaTime);
      return;
    }
    // Axe rage roots the wielder: no movement (or dash) until the buff expires.
    if (this.buffType === 'axe_rage' && this.buffTimeLeft > 0) {
      this._tickTimers(deltaTime);
      return;
    }

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
    if (this.isDead || this.stunTimeLeft > 0 || this.dashCdLeft > 0 || this.dashTimeLeft > 0) return false;
    if (this.buffType === 'axe_rage' && this.buffTimeLeft > 0) return false; // rooted during axe rage
    if (this.weapon === 'sniper') return false; // immobile — only the F teleport moves it

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
    this.stunTimeLeft = 0;
    this.skillCdLeft = 0;
    this.buffType = null;
    this.buffTimeLeft = 0;
    this.spearThrown = false;
    this.hammerSkillUntil = 0;
    this.pendingIcicles = 0;
    this.burnTimeLeft = 0;
    this.burnTickLeft = 0;
    this.burnDps = 0;
    this.burnSourceId = null;
    this.arrowStacks = 0;
    this.greatswordChargeStart = 0;
    this.greatswordChargeAngle = 0;
    this.daggerQte = null;
    this.comboStep = 0;
    this.comboDelayUntil = 0;
  }

  /**
   * Try to initiate an attack based on weapon cooldown
   */
  canAttack(now) {
    if (this.isDead || this.stunTimeLeft > 0 || this.spearThrown || this.greatswordChargeStart > 0 || this.daggerQte) return false;
    // Hammer skill: absolutely no basic attacks from cast until the last shockwave fires.
    if (now < (this.hammerSkillUntil || 0)) return false;
    // Magic staff: don't auto-cast again while ice shards are loaded (waiting for F).
    if (this.weapon === 'magicstaff' && this.pendingIcicles > 0) return false;
    const ignoresComboDelay = this.weapon === 'axe' && this.buffType === 'axe_rage';
    if (!ignoresComboDelay && now < (this.comboDelayUntil || 0)) return false;
    const weaponConfig = getEffectiveWeapon(this.weapon, this.buffType);
    if (weaponConfig.automaticAttack === false) return false;
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
      stunMs: Math.round(this.stunTimeLeft * 1000),
      spearThrown: this.spearThrown,
      arrowStacks: this.arrowStacks || 0,
      greatswordChargeMs: this.greatswordChargeStart > 0 ? Math.max(0, Date.now() - this.greatswordChargeStart) : 0,
      daggerQte: serializeDaggerQte(this.daggerQte),
      comboStep: this.comboStep || 0,
      comboDelayMs: Math.max(0, Math.round((this.comboDelayUntil || 0) - Date.now())),
      pendingIcicles: this.pendingIcicles || 0,
      burnMs: Math.round((this.burnTimeLeft || 0) * 1000),
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
    this.stunTimeLeft = (data.stunMs || 0) / 1000;
    this.spearThrown = Boolean(data.spearThrown);
    this.arrowStacks = Math.max(0, Math.floor(data.arrowStacks || 0));
    this.greatswordChargeStart = data.greatswordChargeMs > 0 ? Date.now() - data.greatswordChargeMs : 0;
    this.daggerQte = deserializeDaggerQte(data.daggerQte);
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

function serializeDaggerQte(qte) {
  if (!qte) return null;
  const now = Date.now();
  return {
    targetId: qte.targetId,
    phase: qte.phase || 'lock',
    actionMs: Math.max(0, Math.round((qte.actionAt || now) - now)),
    perfectMs: Math.max(0, Math.round((qte.perfectAt || now) - now)),
    expiresMs: Math.max(0, Math.round((qte.expiresAt || now) - now))
  };
}

function deserializeDaggerQte(qte) {
  if (!qte) return null;
  const now = Date.now();
  return {
    targetId: qte.targetId,
    phase: qte.phase || 'lock',
    actionAt: now + Math.max(0, Math.round(qte.actionMs || 0)),
    perfectAt: now + Math.max(0, Math.round(qte.perfectMs || 0)),
    expiresAt: now + Math.max(0, Math.round(qte.expiresMs || 0))
  };
}
