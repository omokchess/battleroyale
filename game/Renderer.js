/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons, getEffectiveWeapon, SkillConfig, DashConfig } from './Weapons.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.lastTime = Date.now();
    this.lastPlayersInfo = {};
  }

  /**
   * Main render call
   */
  render(gameState, localPlayerId, camera, mapWidth, mapHeight, visualSettings = {}) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const nowTime = Date.now();
    const dt = Math.min((nowTime - this.lastTime) / 1000, 0.1);
    this.lastTime = nowTime;
    const activeEffects = gameState.effects || [];

    // Particle logic updates & triggers
    this._triggerInstantSparks(gameState, dt);
    this._updateParticles(dt);

    // Clear Screen
    ctx.fillStyle = '#0f1015';
    ctx.fillRect(0, 0, cw, ch);

    const shake = typeof camera.getShakeOffset === 'function'
      ? camera.getShakeOffset(nowTime)
      : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(shake.x || 0, shake.y || 0);

    // Grid rendering (only draw grids that are within viewport margins)
    this._drawGrid(ctx, camera, cw, ch, mapWidth, mapHeight);

    // Floor particles rendering (Dust trails, projectile flows)
    this._drawParticles(ctx, camera, cw, ch, 'floor', gameState.players);

    // Draw Map Borders
    this._drawBorders(ctx, camera, cw, ch, mapWidth, mapHeight);

    // Draw Active Attack Visual Effects
    if (activeEffects.length) {
      this._drawEffects(ctx, camera, cw, ch, activeEffects, gameState.players, localPlayerId, visualSettings);
    }

    // Draw Bow Projectiles
    if (gameState.projectiles) {
      this._drawProjectiles(ctx, camera, cw, ch, gameState.projectiles);
    }

    // Draw All Connected Players
    if (gameState.players) {
      this._drawPlayers(ctx, camera, cw, ch, gameState.players, localPlayerId, activeEffects, mapWidth, mapHeight, visualSettings);
    }

    // Top particles rendering (Hurt splatters, death grave explosions, weapon arcs)
    this._drawParticles(ctx, camera, cw, ch, 'onTop', gameState.players);

    // Cursor crosshair — drawn last so it's always on top. Coordinates are
    // already in canvas-buffer-space (no camera transform needed).
    if (gameState.cursorPos) {
      this._drawCursorCrosshair(ctx, gameState.cursorPos.x, gameState.cursorPos.y);
    }

    ctx.restore();
  }

  /**
   * Process dynamic triggers for particle bursts
   */
  _triggerInstantSparks(gameState, dt) {
    if (!gameState || !gameState.players) return;

    Object.keys(gameState.players).forEach(id => {
      const p = gameState.players[id];
      const prev = this.lastPlayersInfo[id];

      if (p.isDead) {
        // Just died check
        if (prev && !prev.isDead) {
          // Play colossal death core smoke and sparks ring
          for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 110 + 20;
            this.particles.push({
              x: p.x,
              y: p.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              color: i % 2 === 0 ? p.color : '#374151',
              size: Math.random() * 4 + 2,
              alpha: 1.0,
              decay: Math.random() * 1.5 + 0.8,
              shape: 'circle',
              layer: 'onTop'
            });
          }
        }
        this.lastPlayersInfo[id] = { hp: p.hp, isDead: p.isDead, x: p.x, y: p.y };
        return;
      }

      // 1. Hurt check (Spatter bloody/shield shards)
      if (prev && prev.hp > p.hp) {
        const dmgGap = prev.hp - p.hp;
        const count = Math.min(25, Math.ceil(dmgGap * 0.8) + 6);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 150 + 50;
          this.particles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? p.color : '#ffffff',
            size: Math.random() * 3 + 1,
            alpha: 1.0,
            decay: Math.random() * 2.2 + 1.2,
            shape: i % 2 === 0 ? 'rect' : 'circle',
            layer: 'onTop'
          });
        }
      }

      // 2. Dust trails when moving
      if (prev && (Math.abs(prev.x - p.x) > 0.4 || Math.abs(prev.y - p.y) > 0.4)) {
        if (Math.random() < 0.22) {
          const oppositeAngle = Math.atan2(prev.y - p.y, prev.x - p.x) + (Math.random() * 0.4 - 0.2);
          const speed = Math.random() * 20 + 5;
          this.particles.push({
            x: p.x + (Math.random() * 8 - 4),
            y: p.y + 11, // At the feet
            vx: Math.cos(oppositeAngle) * speed,
            vy: Math.sin(oppositeAngle) * speed,
            color: 'rgba(255, 255, 255, 0.12)',
            size: Math.random() * 2.5 + 1.0,
            alpha: 0.5,
            decay: Math.random() * 2.0 + 1.5,
            shape: 'circle',
            layer: 'floor'
          });
        }
      }

      this.lastPlayersInfo[id] = { hp: p.hp, isDead: p.isDead, x: p.x, y: p.y };
    });

    // 3. Melee Swing slash sparks trails
    if (gameState.effects) {
      gameState.effects.forEach(e => {
        const weapon = getEffectiveWeapon(e.weapon, e.buffType) || Weapons.sword;
        const anchoredEffect = this._resolveEffectAttachment(e, gameState.players);
        if (e.type === 'projectile_shot') {
          if (Math.random() < 0.75) {
            const dist = 16 + Math.random() * 8;
            const side = e.angle + Math.PI + (Math.random() * 0.8 - 0.4);
            this.particles.push({
              x: e.x + Math.cos(e.angle) * dist,
              y: e.y + Math.sin(e.angle) * dist,
              vx: Math.cos(side) * (20 + Math.random() * 40),
              vy: Math.sin(side) * (20 + Math.random() * 40),
              color: Math.random() < 0.45 ? '#ffffff' : weapon.color,
              size: Math.random() * 2.4 + 1.0,
              alpha: 0.9,
              decay: Math.random() * 2.6 + 2.0,
              shape: 'circle',
              layer: 'onTop'
            });
          }
          return;
        }

        if (e.type === 'projectile_burst') {
          if (e.progress < 0.35 && Math.random() < 0.8) {
            for (let i = 0; i < 3; i++) {
              const burstAngle = e.angle + Math.PI + (Math.random() * 1.6 - 0.8);
              const speed = 25 + Math.random() * 85;
              this.particles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(burstAngle) * speed,
                vy: Math.sin(burstAngle) * speed,
                color: Math.random() < 0.45 ? '#ffffff' : weapon.color,
                size: Math.random() * 2.4 + 1.0,
                alpha: 0.9,
                decay: Math.random() * 2.4 + 2.0,
                shape: 'circle',
                layer: 'onTop'
              });
            }
          }
          return;
        }

        // Sword-energy explosion: a quick spark burst at the blast point.
        if (e.type === 'explosion') {
          if (e.progress < 0.32 && Math.random() < 0.9) {
            for (let i = 0; i < 4; i++) {
              const a = Math.random() * Math.PI * 2;
              const speed = 70 + Math.random() * 180;
              this.particles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                color: Math.random() < 0.5 ? '#ffffff' : weapon.color,
                size: Math.random() * 2.8 + 1.2,
                alpha: 1.0,
                decay: Math.random() * 2.2 + 1.8,
                shape: Math.random() < 0.5 ? 'rect' : 'circle',
                layer: 'onTop'
              });
            }
          }
          return;
        }

        // Only arc/circle swings emit trailing spark dots. This removes the
        // stray spear dots that flew past the hitbox, and keeps the new skill
        // effects (line thrust, railbeam, buff) clean.
        const sparkArcTypes = ['melee_arc', 'melee_heavy_arc', 'melee_sweet_arc', 'melee_backstab'];
        const sparkCircleTypes = ['melee_circle', 'melee_slam'];
        if (!sparkArcTypes.includes(e.type) && !sparkCircleTypes.includes(e.type)) return;

        if (Math.random() < 0.45) {
          let px = anchoredEffect.x;
          let py = anchoredEffect.y;
          let angle = anchoredEffect.angle;

          if (sparkArcTypes.includes(e.type)) {
            const spread = (weapon.angle * Math.PI) / 360;
            const ranAngle = anchoredEffect.angle + (Math.random() * spread * 2 - spread);
            const dist = weapon.range * (0.35 + Math.random() * 0.65);
            px += Math.cos(ranAngle) * dist;
            py += Math.sin(ranAngle) * dist;
            angle = ranAngle + Math.PI / 2;
          } else if (sparkCircleTypes.includes(e.type)) {
            const ranAngle = Math.random() * Math.PI * 2;
            const dist = weapon.range * e.progress;
            px += Math.cos(ranAngle) * dist;
            py += Math.sin(ranAngle) * dist;
            angle = ranAngle;
          } else if (e.type === 'melee_line') {
            let ext = 0;
            if (e.progress < 0.15) {
              const t = e.progress / 0.15;
              ext = 1 - (1 - t) * (1 - t);
            } else if (e.progress < 0.35) {
              const t = (e.progress - 0.15) / 0.20;
              ext = 1.0 - t * 0.1;
            } else {
              const t = (e.progress - 0.35) / 0.65;
              ext = 0.9 * (1 - t);
            }
            const dist = weapon.range * ext;
            px += Math.cos(anchoredEffect.angle) * dist;
            py += Math.sin(anchoredEffect.angle) * dist;
          }

          const spd = Math.random() * 30 + 10;
          const particle = {
            x: px,
            y: py,
            vx: Math.cos(angle) * spd + (Math.random() * 10 - 5),
            vy: Math.sin(angle) * spd + (Math.random() * 10 - 5),
            color: Math.random() < 0.25 ? '#ffffff' : weapon.color,
            size: Math.random() * 2.2 + 1.0,
            alpha: 0.8,
            decay: Math.random() * 5.0 + 4.5,
            shape: 'circle',
            layer: 'onTop'
          };

          if (this._isPlayerBoundEffect(e)) {
            particle.anchorId = e.attackerId;
            particle.anchorAngle = anchoredEffect.angle;
            particle.rotateWithAnchor = true;
            particle.offsetX = px - anchoredEffect.x;
            particle.offsetY = py - anchoredEffect.y;
          }

          this.particles.push(particle);
        }
      });
    }

    // 4. Bow arrows trace stardust sparkling trails
    if (gameState.projectiles) {
      const trailColors = { arrow: '#a3ff45', swordwave: '#45f3ff', thrownspear: '#ffa345' };
      gameState.projectiles.forEach(proj => {
        if (!proj.isDead && Math.random() < 0.35) {
          this.particles.push({
            x: proj.x,
            y: proj.y,
            vx: (Math.random() * 10 - 5) - proj.vx * 0.05,
            vy: (Math.random() * 10 - 5) - proj.vy * 0.05,
            color: trailColors[proj.kind] || '#a3ff45',
            size: Math.random() * 1.8 + 0.8,
            alpha: 0.7,
            decay: Math.random() * 3.0 + 1.8,
            shape: 'circle',
            layer: 'floor'
          });
        }
      });
    }
  }

  /**
   * Propagate particle positions and decay lifetimes
   */
  _updateParticles(dt) {
    this.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.anchorId) {
        p.offsetX = (p.offsetX || 0) + p.vx * dt;
        p.offsetY = (p.offsetY || 0) + p.vy * dt;
      }
      p.alpha -= p.decay * dt;
    });
    this.particles = this.particles.filter(p => p.alpha > 0);
  }

  /**
   * Render active particle traces
   */
  _drawParticles(ctx, camera, cw, ch, layerType, players = {}) {
    ctx.save();
    this.particles.forEach(p => {
      if (p.layer !== layerType) return;

      const pos = this._resolveParticlePosition(p, players);
      const scr = camera.toScreen(pos.x, pos.y, cw, ch);
      if (scr.x < -20 || scr.x > cw + 20 || scr.y < -20 || scr.y > ch + 20) return;

      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));

      if (p.shape === 'rect') {
        const sz = p.size;
        ctx.fillRect(scr.x - sz / 2, scr.y - sz / 2, sz, sz);
      } else {
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  /**
   * Draw modular pixelated grid background
   */
  _drawGrid(ctx, camera, cw, ch, mapWidth, mapHeight) {
    ctx.save();
    ctx.strokeStyle = '#1d212b';
    ctx.lineWidth = 1;

    const gridSize = 60;
    
    // Calculate first visible line from camera coords
    const startX = Math.floor((camera.x - cw / 2) / gridSize) * gridSize;
    const endX = Math.ceil((camera.x + cw / 2) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - ch / 2) / gridSize) * gridSize;
    const endY = Math.ceil((camera.y + ch / 2) / gridSize) * gridSize;

    // Vertical grid lines
    for (let x = startX; x <= endX; x++) {
      if (x < 0 || x > mapWidth) continue;
      const screenPos = camera.toScreen(x, 0, cw, ch);
      ctx.beginPath();
      ctx.moveTo(screenPos.x, Math.max(0, camera.toScreen(0, 0, cw, ch).y));
      ctx.lineTo(screenPos.x, Math.min(ch, camera.toScreen(0, mapHeight, cw, ch).y));
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let y = startY; y <= endY; y++) {
      if (y < 0 || y > mapHeight) continue;
      const screenPos = camera.toScreen(0, y, cw, ch);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, camera.toScreen(0, 0, cw, ch).x), screenPos.y);
      ctx.lineTo(Math.min(cw, camera.toScreen(mapWidth, 0, cw, ch).x), screenPos.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw high intensity boundaries
   */
  _drawBorders(ctx, camera, cw, ch, mapWidth, mapHeight) {
    ctx.save();
    
    const topLeft = camera.toScreen(0, 0, cw, ch);
    const bottomRight = camera.toScreen(mapWidth, mapHeight, cw, ch);

    // Glowing Neon Border shadow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#45f3ff';
    ctx.strokeStyle = '#45f3ff';
    ctx.lineWidth = 4;

    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Subtly darken outside of boundary
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    
    // Top outside
    if (topLeft.y > 0) ctx.fillRect(0, 0, cw, topLeft.y);
    // Left outside
    if (topLeft.x > 0) ctx.fillRect(0, topLeft.y, topLeft.x, ch - topLeft.y);
    // Right outside
    if (bottomRight.x < cw) ctx.fillRect(bottomRight.x, topLeft.y, cw - bottomRight.x, ch - topLeft.y);
    // Bottom outside
    if (bottomRight.y < ch) ctx.fillRect(0, bottomRight.y, cw, ch - bottomRight.y);

    ctx.restore();
  }

  /**
   * Graphic drawings for bow arrows
   */
  _drawProjectiles(ctx, camera, cw, ch, projectiles) {
    ctx.save();
    const zoom = camera.zoom || 1;

    projectiles.forEach(p => {
      if (p.isDead) return;

      const scr = camera.toScreen(p.x, p.y, cw, ch);
      if (scr.x < -60 || scr.x > cw + 60 || scr.y < -60 || scr.y > ch + 60) return;

      const angle = Number.isFinite(p.angle) ? p.angle : Math.atan2(p.vy, p.vx);

      if (p.kind === 'thrownspear') {
        this._drawThrownSpear(ctx, scr, angle, zoom);
      } else if (p.kind === 'swordwave') {
        this._drawSwordWave(ctx, scr, angle, zoom);
      } else {
        this._drawArrow(ctx, scr, angle);
      }
    });

    ctx.restore();
  }

  _drawArrow(ctx, scr, angle) {
    ctx.save();
    const length = 22;

    // 1. Draw glowing outer energy trace aura
      ctx.strokeStyle = 'rgba(163, 255, 69, 0.4)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x - Math.cos(angle) * length, scr.y - Math.sin(angle) * length);
      ctx.stroke();

      // 2. Draw solid primary energetic arrow shaft (neon lime)
      ctx.strokeStyle = '#a3ff45';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x - Math.cos(angle) * length, scr.y - Math.sin(angle) * length);
      ctx.stroke();

      // 3. Draw bright white core shaft line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x - Math.cos(angle) * (length * 0.75), scr.y - Math.sin(angle) * (length * 0.75));
      ctx.stroke();

      // 4. Draw a beautifully styled arrowhead triangle
      ctx.save();
      ctx.translate(scr.x, scr.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#a3ff45';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 5. Draw arrow tail fletching wings
      ctx.save();
      const tailX = scr.x - Math.cos(angle) * length;
      const tailY = scr.y - Math.sin(angle) * length;
      ctx.translate(tailX, tailY);
      ctx.rotate(angle);
      ctx.strokeStyle = '#a3ff45';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Draw fletch lines branching backwards
      ctx.moveTo(-2, -3);
      ctx.lineTo(2, 0);
      ctx.lineTo(-2, 3);
      ctx.stroke();
      ctx.restore();

    ctx.restore();
  }

  _drawThrownSpear(ctx, scr, angle, zoom) {
    const len = 30 * Math.max(0.6, zoom);
    const tailX = scr.x - Math.cos(angle) * len;
    const tailY = scr.y - Math.sin(angle) * len;

    ctx.save();
    ctx.lineCap = 'round';
    // Glowing shaft
    ctx.strokeStyle = 'rgba(255, 163, 69, 0.4)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    // Spear head
    ctx.save();
    ctx.translate(scr.x, scr.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffa345';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  _drawSwordWave(ctx, scr, angle, zoom) {
    const radius = Math.max(26, Weapons.sword.range * 0.56) * Math.max(0.7, zoom);
    const halfAngle = ((Weapons.sword.angle || 110) * Math.PI) / 360;
    const apexX = -radius;

    ctx.save();
    ctx.translate(scr.x, scr.y);
    ctx.rotate(angle);
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#45f3ff';
    ctx.lineCap = 'round';

    // Pizza-slice blade energy: the projectile sits on the far edge of the sword arc.
    ctx.fillStyle = 'rgba(69, 243, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(apexX, 0);
    ctx.arc(apexX, 0, radius, -halfAngle, halfAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(69, 243, 255, 0.72)';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.arc(apexX, 0, radius, -halfAngle, halfAngle);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(apexX, 0, radius - 5, -halfAngle * 0.9, halfAngle * 0.9);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
    ctx.lineWidth = 1.5;
    [-halfAngle, halfAngle].forEach(edge => {
      ctx.beginPath();
      ctx.moveTo(apexX + Math.cos(edge) * 8, Math.sin(edge) * 8);
      ctx.lineTo(apexX + Math.cos(edge) * (radius - 3), Math.sin(edge) * (radius - 3));
      ctx.stroke();
    });

    ctx.restore();
  }

  /**
   * Fading graphic slices for melee collisions
   */
  _drawEffects(ctx, camera, cw, ch, effects, players = {}, localPlayerId = null, visualSettings = {}) {
    ctx.save();
    const zoom = camera.zoom || 1;

    effects.forEach(e => {
      if (!e || !Number.isFinite(e.progress)) return;

      const anchoredEffect = this._resolveEffectAttachment(e, players);
      const scr = camera.toScreen(anchoredEffect.x, anchoredEffect.y, cw, ch);
      const baseWeapon = getEffectiveWeapon(e.weapon, e.buffType) || Weapons.sword;
      // Convert the weapon's world-space reach into screen pixels so the drawn
      // effect lines up with the actual hitbox at any camera zoom. This is what
      // fixes the spear effect spilling past its hitbox on zoomed-out screens.
      const weapon = {
        ...baseWeapon,
        range: (Number.isFinite(e.range) ? e.range : (baseWeapon.range || 0)) * zoom,
        width: (Number.isFinite(e.width) ? e.width : (baseWeapon.width || 0)) * zoom,
        innerRange: (Number.isFinite(e.innerRange) ? e.innerRange : (baseWeapon.innerRange || 0)) * zoom,
        angle: Number.isFinite(e.angleDeg) ? e.angleDeg : baseWeapon.angle
      };
      const isEnemyEffect = Boolean(e.attackerId && e.attackerId !== localPlayerId);
      const minimized = Boolean(visualSettings.minimizeEnemyAttackEffects && isEnemyEffect && this._isCombatEffect(e));
      let alpha = clamp01(1 - e.progress);
      if (minimized) alpha *= 0.28;

      if (scr.x < -260 || scr.x > cw + 260 || scr.y < -260 || scr.y > ch + 260) {
        return;
      }

      ctx.shadowBlur = (minimized ? 4 : 14) * alpha;
      ctx.shadowColor = weapon.color;

      if (e.type === 'melee_heavy_arc') {
        this._drawHeavyCleave(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_sweet_arc') {
        this._drawScytheSweep(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_backstab') {
        this._drawDaggerStab(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_precise_line') {
        this._drawRapierPierce(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_heavy_line') {
        this._drawHeavyLine(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_slam') {
        this._drawHammerSlam(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_arc') {
        if (e.weapon === 'gauntlet') {
          this._drawPunchCombo(ctx, scr, anchoredEffect, weapon, alpha);
        } else {
          this._drawArcSlash(ctx, scr, anchoredEffect, weapon, alpha);
        }
      } else if (e.type === 'melee_circle') {
        if (e.weapon === 'axe') {
          this._drawArcSlash(ctx, scr, anchoredEffect, { ...weapon, angle: 360 }, alpha);
        } else {
          this._drawAxeSpin(ctx, scr, anchoredEffect, weapon, alpha);
        }
      } else if (e.type === 'melee_line') {
        if (e.weapon === 'gauntlet') {
          this._drawGauntletLance(ctx, scr, anchoredEffect, weapon, alpha);
        } else {
          this._drawSpearThrust(ctx, scr, anchoredEffect, weapon, alpha);
        }
      } else if (e.type === 'projectile_shot') {
        this._drawShotFlash(ctx, scr, e, weapon, alpha);
      } else if (e.type === 'projectile_burst') {
        this._drawProjectileBurst(ctx, scr, e, weapon, alpha);
      } else if (e.type === 'explosion') {
        this._drawExplosion(ctx, scr, e, weapon, alpha, zoom);
      } else if (e.type === 'railbeam') {
        const endScr = camera.toScreen(e.x2, e.y2, cw, ch);
        this._drawRailBeam(ctx, scr, endScr, e, weapon, alpha);
      } else if (e.type === 'buff_activate') {
        this._drawBuffActivate(ctx, scr, e, weapon, alpha, zoom);
      }
    });

    ctx.restore();
  }

  _drawArcSlash(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const headT = easeOutCubic(clamp01(progress / 0.58));
    const tailT = progress < 0.58 ? 0 : easeOutCubic((progress - 0.58) / 0.42);
    const sweep = headT;
    const finisher = Boolean(e.comboFinisher);
    const isFullCircleSlash = weapon.angle >= 359;
    const radius = weapon.range * ((finisher ? 0.74 : 0.82) + (finisher ? 0.26 : 0.18) * sweep);
    const halfAngleRad = (weapon.angle * Math.PI) / 360;
    const startAngle = e.angle - halfAngleRad;
    const endAngle = e.angle + halfAngleRad;
    const swingDirection = e.swingDirection === -1 ? -1 : 1;
    const arcSize = endAngle - startAngle;
    const angleAt = t => swingDirection > 0
      ? startAngle + arcSize * t
      : endAngle - arcSize * t;
    const leadingAngle = angleAt(headT);
    const trailAngle = angleAt(tailT);

    ctx.save();

    ctx.fillStyle = this._hexToRGB(weapon.color, (finisher ? 0.18 : 0.11) * alpha);
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.clip();

    const activeArcStart = trailAngle;
    const activeArcEnd = leadingAngle;
    const activeSpan = Math.max(0.001, Math.abs(headT - tailT) * arcSize);
    const anticlockwise = swingDirection < 0;
    const bladeEdge = leadingAngle;
    const normal = bladeEdge + Math.PI / 2 * swingDirection;
    const tipX = scr.x + Math.cos(bladeEdge) * radius;
    const tipY = scr.y + Math.sin(bladeEdge) * radius;
    const rootX = scr.x;
    const rootY = scr.y;

    ctx.fillStyle = this._hexToRGB(weapon.color, (finisher ? 0.24 : 0.16) * alpha);
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, radius, activeArcStart, activeArcEnd, anticlockwise);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = (finisher ? 18 : 12) * alpha;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = this._hexToRGB('#ffffff', (finisher ? 0.1 : 0.07) * alpha);
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, radius * 0.96, activeArcStart, activeArcEnd, anticlockwise);
    ctx.closePath();
    ctx.fill();

    const routeBands = finisher ? 7 : 6;
    const trimScale = clamp01(activeSpan / 0.32);
    const directedSpan = activeArcEnd - activeArcStart;
    for (let i = 0; i < routeBands; i++) {
      const bandT = routeBands === 1 ? 1 : i / (routeBands - 1);
      const easedBand = easeOutCubic(bandT);
      const bandRadius = radius * (0.08 + easedBand * 0.86);
      const startTrim = (0.012 + bandT * 0.014) * trimScale;
      const endTrim = (0.075 * (1 - bandT) + 0.006) * trimScale;
      const bandStart = activeArcStart + directedSpan * startTrim;
      const bandEnd = activeArcEnd - directedSpan * endTrim;
      const bandWidth = (finisher ? 7.2 : 5.2) * (1 - bandT * 0.28) * alpha;
      const bandAlpha = (finisher ? 0.82 : 0.68) * alpha * (1 - bandT * 0.16);
      if (Math.abs(bandEnd - bandStart) < 0.018 || bandWidth <= 0.2) continue;

      ctx.lineCap = 'round';
      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.36 * bandAlpha);
      ctx.lineWidth = bandWidth + (finisher ? 4.2 : 3.2);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, bandRadius, bandStart, bandEnd, anticlockwise);
      ctx.stroke();

      ctx.strokeStyle = this._hexToRGB('#ffffff', bandAlpha);
      ctx.lineWidth = bandWidth;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, bandRadius, bandStart, bandEnd, anticlockwise);
      ctx.stroke();
    }

    const bladeStart = Math.max(8, radius * 0.08);
    const bladeEnd = radius * 0.98;
    const bladeStartX = scr.x + Math.cos(bladeEdge) * bladeStart;
    const bladeStartY = scr.y + Math.sin(bladeEdge) * bladeStart;
    const bladeEndX = scr.x + Math.cos(bladeEdge) * bladeEnd;
    const bladeEndY = scr.y + Math.sin(bladeEdge) * bladeEnd;
    this._drawCapsuleLine(
      ctx,
      bladeStartX,
      bladeStartY,
      bladeEndX,
      bladeEndY,
      (finisher ? 13 : 10) * alpha,
      this._hexToRGB(weapon.color, (finisher ? 0.66 : 0.52) * alpha)
    );
    this._drawCapsuleLine(
      ctx,
      bladeStartX,
      bladeStartY,
      bladeEndX,
      bladeEndY,
      (finisher ? 6.2 : 4.8) * alpha,
      this._hexToRGB('#ffffff', (finisher ? 0.92 : 0.84) * alpha)
    );

    const tipForward = finisher ? 14 : 10;
    const tipHalf = finisher ? 8 : 6;
    ctx.fillStyle = this._hexToRGB('#ffffff', (finisher ? 0.72 : 0.56) * alpha);
    ctx.beginPath();
    ctx.moveTo(
      bladeEndX + Math.cos(bladeEdge) * tipForward,
      bladeEndY + Math.sin(bladeEdge) * tipForward
    );
    ctx.lineTo(
      bladeEndX - Math.cos(bladeEdge) * 5 + Math.cos(normal) * tipHalf,
      bladeEndY - Math.sin(bladeEdge) * 5 + Math.sin(normal) * tipHalf
    );
    ctx.lineTo(
      bladeEndX - Math.cos(bladeEdge) * 5 - Math.cos(normal) * tipHalf,
      bladeEndY - Math.sin(bladeEdge) * 5 - Math.sin(normal) * tipHalf
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = this._hexToRGB('#ffffff', (finisher ? 0.22 : 0.14) * alpha);
    ctx.beginPath();
    ctx.moveTo(rootX + Math.cos(normal) * 4, rootY + Math.sin(normal) * 4);
    ctx.lineTo(tipX + Math.cos(normal) * (finisher ? 16 : 10), tipY + Math.sin(normal) * (finisher ? 16 : 10));
    ctx.lineTo(tipX - Math.cos(normal) * (finisher ? 9 : 6), tipY - Math.sin(normal) * (finisher ? 9 : 6));
    ctx.lineTo(rootX - Math.cos(normal) * 3, rootY - Math.sin(normal) * 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = this._hexToRGB(weapon.color, (finisher ? 0.92 : 0.78) * alpha);
    ctx.lineWidth = (finisher ? 15 : 10) * (0.35 + alpha * 0.65);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, trailAngle, leadingAngle, swingDirection < 0);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.82 * alpha);
    ctx.lineWidth = (finisher ? 4.6 : 3.2) * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius - 4, trailAngle + 0.05 * swingDirection, leadingAngle, swingDirection < 0);
    ctx.stroke();

    const hitX = scr.x + Math.cos(leadingAngle) * radius;
    const hitY = scr.y + Math.sin(leadingAngle) * radius;
    ctx.fillStyle = this._hexToRGB('#ffffff', 0.8 * alpha);
    ctx.beginPath();
    ctx.arc(hitX, hitY, 3.5 + 3 * alpha, 0, Math.PI * 2);
    ctx.fill();

    if (finisher && !isFullCircleSlash) {
      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.34 * alpha);
      ctx.lineWidth = 2.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius * (0.45 + 0.45 * sweep), e.angle - halfAngleRad * 0.85, e.angle + halfAngleRad * 0.85);
      ctx.stroke();
    }

    if (!isFullCircleSlash) {
      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.3 * alpha);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(e.angle) * 18, scr.y + Math.sin(e.angle) * 18);
      ctx.lineTo(scr.x + Math.cos(e.angle) * (weapon.range + 18), scr.y + Math.sin(e.angle) * (weapon.range + 18));
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawHeavyCleave(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const charge = clamp01(progress / 0.42);
    const release = progress < 0.42 ? 0 : easeOutCubic((progress - 0.42) / 0.58);
    const pulse = 0.7 + 0.3 * Math.sin(progress * Math.PI * 8);

    ctx.save();
    if (progress < 0.42) {
      const halfAngle = ((weapon.angle || 95) * Math.PI) / 360;
      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.35 * alpha * pulse);
      ctx.lineWidth = 2.4 * alpha;
      ctx.setLineDash([6, 7]);
      [-halfAngle, 0, halfAngle].forEach(offset => {
        ctx.beginPath();
        ctx.moveTo(scr.x + Math.cos(e.angle + offset) * 18, scr.y + Math.sin(e.angle + offset) * 18);
        ctx.lineTo(
          scr.x + Math.cos(e.angle + offset) * weapon.range * (0.45 + charge * 0.45),
          scr.y + Math.sin(e.angle + offset) * weapon.range * (0.45 + charge * 0.45)
        );
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ctx.restore();

    this._drawArcSlash(ctx, scr, { ...e, progress: Math.max(progress, release * 0.9), comboFinisher: true }, weapon, alpha);
  }

  _drawScytheSweep(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    this._drawArcSlash(ctx, scr, e, weapon, alpha * 0.88);

    const halfAngle = ((weapon.angle || 150) * Math.PI) / 360;
    const start = e.angle - halfAngle;
    const end = e.angle + halfAngle;
    const sweetR = weapon.range;
    const innerR = Math.max(8, weapon.innerRange || sweetR * 0.58);
    const sweep = easeOutCubic(clamp01(progress / 0.65));
    const dir = e.swingDirection === -1 ? -1 : 1;
    const head = dir > 0 ? start + (end - start) * sweep : end - (end - start) * sweep;
    const tail = dir > 0 ? Math.max(start, head - (end - start) * 0.26) : Math.min(end, head + (end - start) * 0.26);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.78 * alpha);
    ctx.lineWidth = 5.2 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, sweetR, tail, head, dir < 0);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.52 * alpha);
    ctx.lineWidth = 2.2 * alpha;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, innerR, start, end);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const a = start + (end - start) * t;
      const pull = 1 - progress;
      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.23 * alpha * pull);
      ctx.lineWidth = 1.6 * alpha;
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(a) * sweetR, scr.y + Math.sin(a) * sweetR);
      ctx.lineTo(scr.x + Math.cos(a) * innerR, scr.y + Math.sin(a) * innerR);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDaggerStab(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const thrust = progress < 0.22
      ? easeOutBack(progress / 0.22)
      : Math.max(0, 1 - (progress - 0.22) / 0.78);
    const reach = weapon.range * (0.35 + 0.65 * thrust);
    const side = e.swingDirection === -1 ? -1 : 1;
    const angle = e.angle + side * 0.16;
    const tipX = scr.x + Math.cos(angle) * reach;
    const tipY = scr.y + Math.sin(angle) * reach;

    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 0.18 * side;
      const a = angle + offset;
      const start = 12 + i * 3;
      const end = reach - i * 5;
      this._drawCapsuleLine(
        ctx,
        scr.x + Math.cos(a) * start,
        scr.y + Math.sin(a) * start,
        scr.x + Math.cos(a) * end,
        scr.y + Math.sin(a) * end,
        (5 - i) * alpha,
        this._hexToRGB(i === 0 ? '#ffffff' : weapon.color, (0.55 - i * 0.12) * alpha)
      );
    }

    ctx.fillStyle = this._hexToRGB('#ffffff', 0.82 * alpha);
    ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -3.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  _drawRapierPierce(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const thrust = progress < 0.16
      ? easeOutBack(progress / 0.16)
      : Math.max(0, 1 - (progress - 0.16) / 0.84);
    const reach = weapon.range * (0.2 + 0.8 * thrust);
    const width = Math.max(4, weapon.width || 8);
    const tipX = scr.x + Math.cos(e.angle) * reach;
    const tipY = scr.y + Math.sin(e.angle) * reach;

    ctx.save();
    if (progress < 0.42) {
      this._drawAttackLane(ctx, scr.x, scr.y, e.angle, weapon.range, width, this._hexToRGB(weapon.color, 0.12 * alpha));
    }
    this._drawCapsuleLine(ctx, scr.x, scr.y, tipX, tipY, width * 1.55 * alpha, this._hexToRGB(weapon.color, 0.42 * alpha), 'butt');
    this._drawCapsuleLine(ctx, scr.x, scr.y, tipX, tipY, 2.4 * alpha, this._hexToRGB('#ffffff', 0.92 * alpha), 'butt');

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.72 * alpha);
    ctx.lineWidth = 1.4 * alpha;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 5 + 9 * thrust, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawHeavyLine(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const charge = clamp01(progress / 0.28);
    const release = progress < 0.28 ? 0 : easeOutCubic((progress - 0.28) / 0.72);
    const length = weapon.range * (0.35 + release * 0.65);
    const width = weapon.width || 46;

    ctx.save();
    this._drawAttackLane(ctx, scr.x, scr.y, e.angle, weapon.range, width, this._hexToRGB(weapon.color, 0.13 * alpha));
    this._drawCapsuleLine(ctx, scr.x, scr.y, scr.x + Math.cos(e.angle) * length, scr.y + Math.sin(e.angle) * length, width * 0.34 * alpha, this._hexToRGB(weapon.color, 0.44 * alpha), 'round');
    this._drawCapsuleLine(ctx, scr.x, scr.y, scr.x + Math.cos(e.angle) * length, scr.y + Math.sin(e.angle) * length, 5.2 * alpha, this._hexToRGB('#ffffff', 0.86 * alpha), 'round');

    const pX = -Math.sin(e.angle);
    const pY = Math.cos(e.angle);
    [0.38, 0.66, 0.9].forEach((t, i) => {
      const cx = scr.x + Math.cos(e.angle) * weapon.range * t;
      const cy = scr.y + Math.sin(e.angle) * weapon.range * t;
      const crack = width * (0.2 + i * 0.07) * (0.4 + charge * 0.6);
      ctx.strokeStyle = this._hexToRGB('#ffffff', (0.34 - i * 0.06) * alpha);
      ctx.lineWidth = 1.7 * alpha;
      ctx.beginPath();
      ctx.moveTo(cx - pX * crack, cy - pY * crack);
      ctx.lineTo(cx + pX * crack, cy + pY * crack);
      ctx.stroke();
    });
    ctx.restore();
  }

  _drawHammerSlam(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const charge = clamp01(progress / 0.42);
    const release = progress < 0.42 ? 0 : easeOutCubic((progress - 0.42) / 0.58);
    const radius = weapon.range * (0.35 + 0.65 * Math.max(charge * 0.45, release));
    const inner = Math.max(8, weapon.innerRange || weapon.range * 0.45);

    ctx.save();
    ctx.fillStyle = this._hexToRGB(weapon.color, 0.13 * alpha);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.72 * alpha);
    ctx.lineWidth = (progress < 0.42 ? 2.2 : 5.4) * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.55 * alpha);
    ctx.lineWidth = 2.2 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, inner, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = e.angle + i * Math.PI / 4 + release * 0.24;
      const start = inner * (0.62 + 0.18 * Math.sin(i));
      const end = radius * (0.72 + 0.22 * Math.cos(i * 1.7));
      ctx.strokeStyle = this._hexToRGB(i % 2 === 0 ? '#ffffff' : weapon.color, 0.32 * alpha * Math.max(charge, release));
      ctx.lineWidth = (i % 2 === 0 ? 2 : 1.4) * alpha;
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(a) * start, scr.y + Math.sin(a) * start);
      ctx.lineTo(scr.x + Math.cos(a + 0.12) * end, scr.y + Math.sin(a + 0.12) * end);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPunchCombo(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const thrust = progress < 0.38
      ? easeOutBack(progress / 0.38)
      : Math.max(0, 1 - (progress - 0.38) / 0.62);
    const fistRadius = 5.5;
    const reach = Math.min(weapon.range - fistRadius, weapon.range * (0.35 + 0.5 * thrust));
    const offsets = [-0.22, 0.22];

    ctx.save();
    offsets.forEach((offset, index) => {
      const angle = e.angle + offset;
      const base = 10 + index * 2;
      const x1 = scr.x + Math.cos(angle) * base;
      const y1 = scr.y + Math.sin(angle) * base;
      const x2 = scr.x + Math.cos(angle) * reach;
      const y2 = scr.y + Math.sin(angle) * reach;

      this._drawCapsuleLine(ctx, x1, y1, x2, y2, 10 * alpha, this._hexToRGB(weapon.color, 0.48 * alpha));
      this._drawCapsuleLine(ctx, x1, y1, x2, y2, 5 * alpha, this._hexToRGB('#ffffff', 0.75 * alpha));

      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.65 * alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x2, y2, fistRadius, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.fillStyle = this._hexToRGB(weapon.color, 0.12 * alpha);
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, weapon.range, e.angle - 0.42, e.angle + 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawAxeSpin(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const finisher = Boolean(e.comboFinisher);
    const scale = progress < 0.22
      ? easeOutCubic(progress / 0.22)
      : 1 + (progress - 0.22) * (finisher ? 0.18 : 0.06);
    const radius = Math.max(2, weapon.range * scale);
    const spinAngle = e.angle + progress * Math.PI * (finisher ? 6.2 : 4.4);

    ctx.save();
    ctx.fillStyle = this._hexToRGB(weapon.color, (finisher ? 0.2 : 0.13) * alpha);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.72 * alpha);
    ctx.lineWidth = (finisher ? 11 : 8) * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.7 * alpha);
    ctx.lineWidth = 2.2 * alpha;
    if (radius > 7) {
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius - 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const bladeCount = finisher ? 4 : 3;
    for (let i = 0; i < bladeCount; i++) {
      const a = spinAngle + i * (Math.PI * 2 / bladeCount);
      ctx.strokeStyle = i === 0 ? this._hexToRGB('#ffffff', 0.85 * alpha) : this._hexToRGB(weapon.color, 0.82 * alpha);
      ctx.lineWidth = i === 0 ? (finisher ? 5.4 : 4) * alpha : (finisher ? 4 : 3) * alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius * 0.76, a, a + Math.PI * (finisher ? 0.68 : 0.52));
      ctx.stroke();
    }

    if (finisher) {
      const swirlCount = 7;
      for (let i = 0; i < swirlCount; i++) {
        const a = spinAngle + i * (Math.PI * 2 / swirlCount);
        const inner = radius * 0.18;
        const outer = radius * 0.95;
        const mid = radius * 0.58;
        ctx.strokeStyle = this._hexToRGB(i % 2 === 0 ? '#ffffff' : weapon.color, (i % 2 === 0 ? 0.52 : 0.36) * alpha);
        ctx.lineWidth = (i % 2 === 0 ? 3.2 : 2.4) * alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(scr.x + Math.cos(a - 0.32) * inner, scr.y + Math.sin(a - 0.32) * inner);
        ctx.quadraticCurveTo(
          scr.x + Math.cos(a + 0.55) * mid,
          scr.y + Math.sin(a + 0.55) * mid,
          scr.x + Math.cos(a + 1.02) * outer,
          scr.y + Math.sin(a + 1.02) * outer
        );
        ctx.stroke();
      }

      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.28 * alpha);
      ctx.lineWidth = 2.2 * alpha;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius * 0.45, spinAngle, spinAngle + Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawSpearThrust(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const finisher = Boolean(e.comboFinisher);
    const length = weapon.range;
    const width = weapon.width;
    const ext = progress < 0.16
      ? easeOutCubic(progress / 0.16)
      : progress < 0.38
        ? 1 - ((progress - 0.16) / 0.22) * 0.06
        : Math.max(0, 0.94 * (1 - (progress - 0.38) / 0.62));
    const shake = progress > 0.14 && progress < 0.36 ? Math.sin(progress * 120) * 0.02 : 0;
    const angle = e.angle + shake;
    const tipX = scr.x + Math.cos(angle) * length * ext;
    const tipY = scr.y + Math.sin(angle) * length * ext;

    ctx.save();

    if (progress < 0.5) {
      const laneAlpha = (finisher ? 0.25 : 0.16) * (1 - progress / 0.5);
      this._drawAttackLane(ctx, scr.x, scr.y, e.angle, length, width, this._hexToRGB(weapon.color, laneAlpha));
    }

    const headSize = Math.max(6, width * (finisher ? 0.68 : 0.52)) * (0.75 + alpha * 0.25);
    const shaftEndX = scr.x + Math.cos(angle) * Math.max(0, length * ext - headSize * 0.6);
    const shaftEndY = scr.y + Math.sin(angle) * Math.max(0, length * ext - headSize * 0.6);

    this._drawCapsuleLine(ctx, scr.x, scr.y, shaftEndX, shaftEndY, width * (finisher ? 0.96 : 0.78) * alpha, this._hexToRGB(weapon.color, (finisher ? 0.68 : 0.54) * alpha), 'butt');
    this._drawCapsuleLine(ctx, scr.x, scr.y, shaftEndX, shaftEndY, (finisher ? 5.2 : 4.0) * alpha, this._hexToRGB('#ffffff', 0.86 * alpha), 'butt');

    ctx.fillStyle = this._hexToRGB('#ffffff', 0.88 * alpha);
    ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-headSize, -headSize * 0.52);
    ctx.lineTo(-headSize * 0.62, 0);
    ctx.lineTo(-headSize, headSize * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (progress < 0.25) {
      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.42 * (1 - progress / 0.25));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(scr.x + Math.cos(e.angle) * 12, scr.y + Math.sin(e.angle) * 12, 8 + 28 * progress, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _isCombatEffect(effect) {
    return Boolean(effect && (
      effect.type === 'melee_arc' ||
      effect.type === 'melee_circle' ||
      effect.type === 'melee_line' ||
      effect.type === 'melee_heavy_arc' ||
      effect.type === 'melee_sweet_arc' ||
      effect.type === 'melee_backstab' ||
      effect.type === 'melee_precise_line' ||
      effect.type === 'melee_heavy_line' ||
      effect.type === 'melee_slam' ||
      effect.type === 'projectile_shot' ||
      effect.type === 'projectile_burst' ||
      effect.type === 'railbeam'
    ));
  }

  _drawGauntletLance(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const finisher = Boolean(e.comboFinisher);
    const length = weapon.range;
    const width = weapon.width;
    const rawThrust = progress < 0.14
      ? easeOutBack(progress / 0.14)
      : Math.max(0, 1 - (progress - 0.14) / 0.86);
    const thrust = clamp01(rawThrust);
    const angle = e.angle;
    const pulse = 0.75 + 0.25 * Math.sin(progress * Math.PI * (finisher ? 11 : 8));
    const fistRadius = Math.max(6, width * (finisher ? 0.56 : 0.42)) * pulse;
    const burstRadius = progress < 0.28 ? Math.min(width * 0.5, 7 + 12 * progress) : 0;
    const maxVisualRadius = Math.max(fistRadius, burstRadius);
    const rawReach = length * (0.28 + 0.62 * thrust);
    const reach = Math.max(maxVisualRadius + 2, Math.min(length - maxVisualRadius - 2, rawReach));
    const fistX = scr.x + Math.cos(angle) * reach;
    const fistY = scr.y + Math.sin(angle) * reach;

    ctx.save();
    ctx.lineCap = 'round';

    if (progress < 0.55) {
      const laneAlpha = (finisher ? 0.24 : 0.13) * (1 - progress / 0.55);
      this._drawAttackLane(ctx, scr.x, scr.y, angle, length, width, this._hexToRGB(weapon.color, laneAlpha));
    }

    const trailStart = Math.max(10, reach - length * 0.48);
    this._drawCapsuleLine(
      ctx,
      scr.x + Math.cos(angle) * trailStart,
      scr.y + Math.sin(angle) * trailStart,
      fistX,
      fistY,
      width * (finisher ? 0.92 : 0.72) * alpha,
      this._hexToRGB(weapon.color, (finisher ? 0.52 : 0.36) * alpha),
      'round'
    );
    this._drawCapsuleLine(
      ctx,
      scr.x + Math.cos(angle) * Math.max(8, reach - length * 0.28),
      scr.y + Math.sin(angle) * Math.max(8, reach - length * 0.28),
      fistX,
      fistY,
      (finisher ? 5.4 : 4.2) * alpha,
      this._hexToRGB('#ffffff', 0.72 * alpha),
      'round'
    );

    ctx.save();
    ctx.translate(fistX, fistY);
    ctx.rotate(angle);

    ctx.shadowBlur = 12 * alpha;
    ctx.shadowColor = weapon.color;
    ctx.fillStyle = this._hexToRGB(weapon.color, 0.72 * alpha);
    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.82 * alpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, fistRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.72 * alpha);
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-fistRadius * 0.35, i * fistRadius * 0.34);
      ctx.lineTo(fistRadius * 0.45, i * fistRadius * 0.22);
      ctx.stroke();
    }
    ctx.restore();

    if (progress < 0.28) {
      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.48 * (1 - progress / 0.28));
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(fistX, fistY, burstRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawShotFlash(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const flash = 1 - easeOutCubic(progress);
    const length = 42 * flash;
    const half = 0.18 + 0.2 * flash;
    const start = e.angle - half;
    const end = e.angle + half;

    ctx.save();
    ctx.fillStyle = this._hexToRGB(weapon.color, 0.22 * alpha);
    ctx.beginPath();
    ctx.moveTo(scr.x + Math.cos(e.angle) * 12, scr.y + Math.sin(e.angle) * 12);
    ctx.arc(scr.x, scr.y, length + 18, start, end);
    ctx.closePath();
    ctx.fill();

    this._drawCapsuleLine(
      ctx,
      scr.x + Math.cos(e.angle) * 8,
      scr.y + Math.sin(e.angle) * 8,
      scr.x + Math.cos(e.angle) * (length + 26),
      scr.y + Math.sin(e.angle) * (length + 26),
      4 + 8 * flash,
      this._hexToRGB('#ffffff', 0.72 * alpha)
    );
    ctx.restore();
  }

  _drawProjectileBurst(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const radius = 8 + easeOutCubic(progress) * 24;

    ctx.save();
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.78 * alpha);
    ctx.lineWidth = 3.5 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = this._hexToRGB(weapon.color, 0.18 * alpha);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.75 * alpha);
    ctx.lineWidth = 2 * alpha;
    for (let i = 0; i < 8; i++) {
      const angle = e.angle + Math.PI + (i - 3.5) * 0.34;
      const inner = radius * 0.25;
      const outer = radius * (0.82 + (i % 2) * 0.16);
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(angle) * inner, scr.y + Math.sin(angle) * inner);
      ctx.lineTo(scr.x + Math.cos(angle) * outer, scr.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawExplosion(ctx, scr, e, weapon, alpha, zoom) {
    const progress = clamp01(e.progress);
    const maxR = (e.radius || 70) * zoom;
    const radius = maxR * easeOutCubic(progress);

    ctx.save();
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.85 * alpha);
    ctx.lineWidth = 5 * alpha + 1;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = this._hexToRGB('#ffffff', 0.5 * alpha * (1 - progress));
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this._hexToRGB(weapon.color, 0.18 * alpha);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawRailBeam(ctx, startScr, endScr, e, weapon, alpha) {
    ctx.save();
    ctx.lineCap = 'round';

    // Outer glow → core → white-hot center give the railgun beam its punch.
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.35 * alpha);
    ctx.lineWidth = 14 * alpha + 2;
    ctx.beginPath();
    ctx.moveTo(startScr.x, startScr.y);
    ctx.lineTo(endScr.x, endScr.y);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.9 * alpha);
    ctx.lineWidth = 5 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(startScr.x, startScr.y);
    ctx.lineTo(endScr.x, endScr.y);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.95 * alpha);
    ctx.lineWidth = 2 * alpha + 0.5;
    ctx.beginPath();
    ctx.moveTo(startScr.x, startScr.y);
    ctx.lineTo(endScr.x, endScr.y);
    ctx.stroke();

    ctx.fillStyle = this._hexToRGB('#ffffff', 0.8 * alpha);
    ctx.beginPath();
    ctx.arc(endScr.x, endScr.y, 5 * alpha + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawBuffActivate(ctx, scr, e, weapon, alpha, zoom) {
    const progress = clamp01(e.progress);
    const radius = (18 + 46 * easeOutCubic(progress)) * (0.6 + zoom * 0.4);

    ctx.save();
    this._drawSustainedBuffBurst(ctx, scr, e.buffType, weapon.color, alpha, zoom, Date.now() + progress * 420);

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.8 * alpha);
    ctx.lineWidth = 4 * alpha + 1;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.7 * alpha);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(a) * radius * 0.5, scr.y + Math.sin(a) * radius * 0.5);
      ctx.lineTo(scr.x + Math.cos(a) * radius * 0.9, scr.y + Math.sin(a) * radius * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawSustainedBuffBurst(ctx, scr, buffType, color, alpha = 1, zoom = 1, timeMs = Date.now()) {
    const isAxe = buffType === 'axe_rage';
    const baseRadius = (isAxe ? 42 : 34) * (0.7 + zoom * 0.3);
    const spin = timeMs / (isAxe ? 520 : 460);
    const counterSpin = -timeMs / (isAxe ? 760 : 640);
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 150);
    const ringRadius = baseRadius + pulse * (isAxe ? 5 : 4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * alpha;

    ctx.fillStyle = this._hexToRGB(color, (isAxe ? 0.12 : 0.1) * alpha);
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, ringRadius * 0.78, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.strokeStyle = this._hexToRGB(color, 0.48 * alpha);
    ctx.lineWidth = (isAxe ? 4.2 : 3.4) * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, ringRadius, spin, spin + Math.PI * 1.35);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.46 * alpha);
    ctx.lineWidth = (isAxe ? 2.8 : 2.2) * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, ringRadius * 0.72, counterSpin, counterSpin + Math.PI * 1.05);
    ctx.stroke();

    const burstCount = isAxe ? 8 : 7;
    for (let i = 0; i < burstCount; i++) {
      const t = i / burstCount;
      const a = spin * 0.55 + t * Math.PI * 2;
      const flicker = 0.72 + 0.28 * Math.sin(timeMs / 95 + i * 1.7);
      const inner = ringRadius * (0.28 + (i % 2) * 0.08);
      const outer = ringRadius * (0.82 + (i % 3) * 0.08) * flicker;
      ctx.strokeStyle = this._hexToRGB(i % 3 === 0 ? '#ffffff' : color, (i % 3 === 0 ? 0.56 : 0.42) * alpha);
      ctx.lineWidth = (isAxe ? 2.6 : 2.1) * alpha * flicker;
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(a) * inner, scr.y + Math.sin(a) * inner);
      ctx.lineTo(scr.x + Math.cos(a) * outer, scr.y + Math.sin(a) * outer);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawCapsuleLine(ctx, x1, y1, x2, y2, width, color, lineCap = 'round') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.1, width);
    ctx.lineCap = lineCap;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  _drawAttackLane(ctx, x, y, angle, length, width, color) {
    const uX = Math.cos(angle);
    const uY = Math.sin(angle);
    const pX = -uY * width / 2;
    const pY = uX * width / 2;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + pX, y + pY);
    ctx.lineTo(x - pX, y - pY);
    ctx.lineTo(x - pX + uX * length, y - pY + uY * length);
    ctx.lineTo(x + pX + uX * length, y + pY + uY * length);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _getActiveAttacks(effects) {
    const active = {};

    effects.forEach(effect => {
      if (!effect.attackerId || effect.progress >= 1) return;
      if (!this._isWeaponMotionEffect(effect)) return;
      const current = active[effect.attackerId];
      if (!current || effect.timestamp >= current.timestamp) {
        active[effect.attackerId] = effect;
      }
    });

    return active;
  }

  _isWeaponMotionEffect(effect) {
    return Boolean(effect) && (
      effect.type === 'projectile_shot' ||
      effect.type === 'melee_arc' ||
      effect.type === 'melee_circle' ||
      effect.type === 'melee_line' ||
      effect.type === 'melee_heavy_arc' ||
      effect.type === 'melee_sweet_arc' ||
      effect.type === 'melee_backstab' ||
      effect.type === 'melee_precise_line' ||
      effect.type === 'melee_heavy_line' ||
      effect.type === 'melee_slam' ||
      effect.type === 'spear_windup' ||
      effect.type === 'finisher_ready'
    );
  }

  _isPlayerBoundEffect(effect) {
    return Boolean(effect && effect.attackerId) &&
      effect.type !== 'projectile_shot' &&
      effect.type !== 'projectile_burst' &&
      effect.type !== 'explosion' &&
      effect.type !== 'railbeam';
  }

  _resolveEffectAttachment(effect, players = {}) {
    if (!this._isPlayerBoundEffect(effect)) return effect;

    const attacker = this._findPlayerById(players, effect.attackerId);
    if (!attacker || attacker.isDead) return effect;

    return {
      ...effect,
      x: attacker.x,
      y: attacker.y,
      angle: Number.isFinite(attacker.angle) ? attacker.angle : effect.angle
    };
  }

  _resolveParticlePosition(particle, players = {}) {
    if (!particle.anchorId) {
      return { x: particle.x, y: particle.y };
    }

    const anchor = this._findPlayerById(players, particle.anchorId);
    if (!anchor || anchor.isDead) {
      return { x: particle.x, y: particle.y };
    }

    let offsetX = particle.offsetX || 0;
    let offsetY = particle.offsetY || 0;
    if (particle.rotateWithAnchor && Number.isFinite(particle.anchorAngle) && Number.isFinite(anchor.angle)) {
      const delta = anchor.angle - particle.anchorAngle;
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      const rotatedX = offsetX * cos - offsetY * sin;
      const rotatedY = offsetX * sin + offsetY * cos;
      offsetX = rotatedX;
      offsetY = rotatedY;
    }

    return {
      x: anchor.x + offsetX,
      y: anchor.y + offsetY
    };
  }

  _findPlayerById(players = {}, id) {
    if (!id) return null;
    if (players[id]) return players[id];
    return Object.values(players).find(player => player && player.id === id) || null;
  }

  _getAttackMotion(player, effect) {
    const empty = { active: false, bodyX: 0, bodyY: 0, bodyScale: 0, weaponReach: 0, weaponAngle: player.angle };
    if (!effect) return empty;

    const progress = clamp01(effect.progress);
    const angle = this._isPlayerBoundEffect(effect) && Number.isFinite(player.angle)
      ? player.angle
      : (Number.isFinite(effect.angle) ? effect.angle : player.angle);
    let lunge = 0;
    let weaponReach = 0;
    let weaponAngle = angle;
    let bodyScale = 0;

    if (effect.type === 'projectile_shot') {
      const draw = progress < 0.45
        ? easeOutCubic(progress / 0.45)
        : Math.max(0, 1 - (progress - 0.45) / 0.55);
      lunge = -2 * draw;
      weaponReach = -11 * draw;
      bodyScale = 1.1 * draw;

    } else if (effect.type === 'spear_windup') {
      // Pull spear back (0%→50% progress), hold at peak, release (50%→100%)
      const pullT = progress < 0.5
        ? easeOutCubic(progress / 0.5)
        : 1 - easeOutCubic((progress - 0.5) / 0.5);
      lunge = -6 * pullT;
      weaponReach = -16 * pullT;  // negative = tip retreats toward body
      bodyScale = 1.3 * pullT;

    } else if (effect.type === 'finisher_ready') {
      // Sword held in pull-back pose while waiting for finisher window.
      // Quickly ramps to full pull-back and stays there until the finisher fires.
      const chargeT = Math.min(1, progress / 0.25); // reach full charge in 25% of the delay
      lunge = -5 * chargeT;
      weaponReach = -12 * chargeT;
      weaponAngle = angle + Math.PI * 0.82 * chargeT; // weapon rotates toward lower-left
      bodyScale = 1.4 * chargeT;

    } else if (effect.type === 'melee_heavy_arc' || effect.type === 'melee_heavy_line') {
      const chargeT = progress < 0.45 ? easeOutCubic(progress / 0.45) : 1;
      const releaseT = progress < 0.45 ? 0 : easeOutBack((progress - 0.45) / 0.55);
      const swingDirection = effect.swingDirection === -1 ? -1 : 1;
      lunge = -8 * chargeT + 13 * releaseT;
      weaponReach = -12 * chargeT + 20 * releaseT;
      weaponAngle = angle + swingDirection * (-1.15 * chargeT + 2.25 * releaseT);
      bodyScale = 2.1 * Math.sin(Math.PI * clamp01(progress));

    } else if (effect.type === 'melee_sweet_arc') {
      const swingDirection = effect.swingDirection === -1 ? -1 : 1;
      const sweep = easeOutCubic(progress);
      lunge = 5 * Math.sin(Math.PI * progress);
      weaponReach = 15 * Math.sin(Math.PI * progress);
      weaponAngle = angle + swingDirection * (-1.25 + sweep * 2.5);
      bodyScale = 1.25 * Math.sin(Math.PI * progress);

    } else if (effect.type === 'melee_backstab') {
      const stab = progress < 0.24
        ? easeOutBack(progress / 0.24)
        : Math.max(0, 1 - (progress - 0.24) / 0.76);
      lunge = 12 * stab;
      weaponReach = 18 * stab;
      weaponAngle = angle + (effect.swingDirection === -1 ? -0.25 : 0.25) * stab;
      bodyScale = 1.25 * stab;

    } else if (effect.type === 'melee_precise_line') {
      const thrust = progress < 0.16
        ? easeOutBack(progress / 0.16)
        : Math.max(0, 1 - (progress - 0.16) / 0.84);
      lunge = 9 * thrust;
      weaponReach = 22 * thrust;
      weaponAngle = angle;
      bodyScale = 1.1 * thrust;

    } else if (effect.type === 'melee_slam') {
      const lift = progress < 0.45 ? easeOutCubic(progress / 0.45) : 1 - easeOutCubic((progress - 0.45) / 0.55);
      lunge = progress < 0.45 ? -5 * lift : 4 * (1 - lift);
      weaponReach = progress < 0.45 ? -10 * lift : 8 * (1 - lift);
      weaponAngle = angle - Math.PI / 2 * lift;
      bodyScale = 2.4 * Math.sin(Math.PI * clamp01(progress));

    } else if (effect.type === 'melee_circle' && effect.weapon !== 'axe') {
      const spin = easeOutCubic(Math.min(1, progress / 0.6));
      weaponAngle = angle + spin * Math.PI * (effect.comboFinisher ? 2.8 : 2.1);
      bodyScale = (effect.comboFinisher ? 2.4 : 1.5) * Math.sin(Math.PI * clamp01(progress));

    } else if (effect.weapon === 'axe') {
      // Axe: spin the weapon around the body on every attack (regular + finisher)
      const spinMult = effect.comboFinisher ? 3.0 : 2.2;
      const spin = easeOutCubic(Math.min(1, progress / 0.65));
      weaponAngle = angle + spin * Math.PI * spinMult;
      bodyScale = (effect.comboFinisher ? 2.6 : 1.8) * Math.sin(Math.PI * clamp01(progress));

    } else if (effect.weapon === 'sword' && effect.comboFinisher) {
      // Sword finisher: pull blade to lower-left then sweep 360°
      if (progress < 0.28) {
        const t = easeOutCubic(progress / 0.28);
        lunge = -7 * t;
        weaponReach = -16 * t;
        weaponAngle = angle + Math.PI * 0.85 * t;   // rotate toward lower-left
        bodyScale = 2.0 * t;
      } else {
        const t = easeOutCubic((progress - 0.28) / 0.72);
        const fadeOut = Math.max(0, 1 - (progress - 0.28) / 0.35);
        lunge = -7 * fadeOut;
        weaponReach = Math.max(0, 10 * t);
        weaponAngle = angle + Math.PI * 0.85 + t * Math.PI * 2; // full 360° sweep
        bodyScale = 2.0 * (1 - easeOutCubic(Math.min(1, (progress - 0.28) / 0.72)));
      }

    } else if (effect.type === 'melee_line') {
      const thrust = progress < 0.18
        ? easeOutBack(progress / 0.18)
        : Math.max(0, 1 - (progress - 0.18) / 0.82);
      const finisherBoost = effect.comboFinisher ? 1.45 : 1;
      lunge = 8 * thrust * finisherBoost;
      weaponReach = 18 * thrust * finisherBoost;
      bodyScale = 1.2 * thrust * finisherBoost;

    } else if (effect.weapon === 'gauntlet') {
      const punch = progress < 0.28
        ? easeOutBack(progress / 0.28)
        : Math.max(0, 1 - (progress - 0.28) / 0.72);
      lunge = 7 * punch;
      weaponReach = 16 * punch;
      bodyScale = 1.4 * punch;

    } else {
      const swingDirection = effect.swingDirection === -1 ? -1 : 1;
      const slash = Math.sin(Math.PI * clamp01(progress * 0.95));
      const finisherBoost = effect.comboFinisher ? 1.7 : 1;
      lunge = 4 * slash * finisherBoost;
      weaponReach = 10 * slash * finisherBoost;
      weaponAngle = angle + swingDirection * (-0.9 + easeOutCubic(progress) * 1.8) * finisherBoost;
      bodyScale = 1.0 * slash * finisherBoost;
    }

    return {
      active: true,
      effectType: effect.type,
      attackProgress: progress,
      isFinisher: Boolean(effect.comboFinisher),
      bodyX: Math.cos(angle) * lunge,
      bodyY: Math.sin(angle) * lunge,
      bodyScale,
      weaponReach,
      weaponAngle
    };
  }

  /**
   * Draw Players with beautiful pixel graphics
   */
  _drawPlayers(ctx, camera, cw, ch, players, localPlayerId, activeEffects = [], mapWidth = 0, mapHeight = 0, visualSettings = {}) {
    const radius = 14;
    const activeAttacks = this._getActiveAttacks(activeEffects);

    Object.keys(players).forEach(id => {
      const p = players[id];
      if (p.isDead) {
        this._drawGrave(ctx, camera, cw, ch, p);
        return;
      }

      const scr = camera.toScreen(p.x, p.y, cw, ch);
      const isLocal = id === localPlayerId;
      const activeAttack = activeAttacks[id] || activeAttacks[p.id] || null;
      const motion = this._getAttackMotion(p, activeAttack);
      const bodyScr = {
        x: scr.x + motion.bodyX,
        y: scr.y + motion.bodyY
      };

      if (isLocal || !visualSettings.hideEnemyAttackPreviews) {
        this._drawPlayerAttackRange(ctx, camera, cw, ch, scr, p, isLocal, Boolean(activeAttack), mapWidth, mapHeight, activeAttack);
      }

      ctx.save();
      
      // Glow and Shadow under player
      ctx.shadowBlur = isLocal ? 15 : 4;
      ctx.shadowColor = isLocal ? '#ef4444' : p.color;
      ctx.fillStyle = p.color;

      // Active skill-buff floor burst (axe rage / gauntlet lance).
      if (p.buffTimeLeft > 0) {
        const auraColor = p.buffType === 'axe_rage' ? '#f55555'
          : p.buffType === 'gauntlet_lance' ? '#ff45db'
          : p.accentColor;
        this._drawSustainedBuffBurst(ctx, bodyScr, p.buffType, auraColor, 0.72, camera.zoom || 1, Date.now());
      }

      // Draw Main Player Chassis Circle
      ctx.beginPath();
      ctx.arc(bodyScr.x, bodyScr.y, radius + motion.bodyScale, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isLocal ? '#ef4444' : '#0b0c10';
      ctx.stroke();

      // Dash i-frame white highlight — bright flash that fades as the
      // invulnerability window expires.
      if (p.iframeTimeLeft > 0) {
        const iAlpha = clamp01(p.iframeTimeLeft / (DashConfig.iframeMs / 1000));
        ctx.save();
        ctx.shadowBlur = 16 * iAlpha;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = this._hexToRGB('#ffffff', 0.85 * iAlpha);
        ctx.beginPath();
        ctx.arc(bodyScr.x, bodyScr.y, radius + motion.bodyScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this._hexToRGB('#ffffff', iAlpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bodyScr.x, bodyScr.y, radius + motion.bodyScale + 3 + 5 * (1 - iAlpha), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Local Player Highlight Marker Ring
      if (isLocal) {
        // Broad pulsing red warning circle representing absolute player presence
        const pulse = 8 + Math.sin(Date.now() / 120) * 3.5;
        
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bodyScr.x, bodyScr.y, radius + pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // High intensity floating indicator arrow pointing directly to player
        const arrowOffset = radius + 22 + Math.sin(Date.now() / 120) * 4;
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bodyScr.x - 7, bodyScr.y - arrowOffset);
        ctx.lineTo(bodyScr.x + 7, bodyScr.y - arrowOffset);
        ctx.lineTo(bodyScr.x, bodyScr.y - arrowOffset + 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (p.weapon !== 'axe') {
        // Draw Sight Pointer / Helmet Visor face vector direction
        ctx.strokeStyle = '#0b0c10';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bodyScr.x, bodyScr.y);
        ctx.lineTo(bodyScr.x + Math.cos(p.angle) * (radius - 2), bodyScr.y + Math.sin(p.angle) * (radius - 2));
        ctx.stroke();

        // Highlight core represent eye visor
        ctx.strokeStyle = p.accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Side ticks showing helmet look direction
        const leftVisor = p.angle - 0.4;
        const rightVisor = p.angle + 0.4;
        ctx.moveTo(bodyScr.x + Math.cos(leftVisor) * (radius - 4), bodyScr.y + Math.sin(leftVisor) * (radius - 4));
        ctx.lineTo(bodyScr.x + Math.cos(p.angle) * (radius - 2), bodyScr.y + Math.sin(p.angle) * (radius - 2));
        ctx.lineTo(bodyScr.x + Math.cos(rightVisor) * (radius - 4), bodyScr.y + Math.sin(rightVisor) * (radius - 4));
        ctx.stroke();
      }

      // Draw Weapon Frame
      this._drawPlayerWeapon(ctx, bodyScr, p, motion);

      // Restore style frame before text elements
      ctx.restore();

      // Floating Username Indicator
      ctx.save();
      ctx.font = 'bold 11px "JetBrains Mono", Courier, monospace';
      ctx.textAlign = 'center';
      
      // Calculate text background padding sizes
      const tagText = `${p.nickname} [${p.kills}]`;
      const textWidth = ctx.measureText(tagText).width;

      ctx.fillStyle = 'rgba(11, 12, 16, 0.75)';
      ctx.fillRect(bodyScr.x - textWidth / 2 - 4, bodyScr.y - radius - 24, textWidth + 8, 14);

      ctx.fillStyle = isLocal ? '#ffffff' : '#ccd6f6';
      ctx.fillText(tagText, bodyScr.x, bodyScr.y - radius - 13);

      // Mini floating HP bars (hovering above head)
      const barW = 32;
      const barH = 3.5;
      const barX = bodyScr.x - barW / 2;
      const barY = bodyScr.y - radius - 8;

      // Hp Bar Background border
      ctx.fillStyle = '#111216';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // Hp Bar Filled portion
      const hpPct = Math.max(0, p.hp / (p.maxHp || 100));
      ctx.fillStyle = hpPct > 0.5 ? '#10b981' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      if (p.weapon === 'bow') {
        const maxStacks = SkillConfig.bow.maxStacks || 5;
        const stacks = Math.max(0, Math.min(maxStacks, Math.floor(p.arrowStacks || 0)));
        const stackText = `[${stacks} / ${maxStacks} 스택]`;
        const stackWidth = ctx.measureText(stackText).width;
        const stackY = bodyScr.y + radius + 21;

        ctx.fillStyle = 'rgba(11, 12, 16, 0.72)';
        ctx.fillRect(bodyScr.x - stackWidth / 2 - 4, stackY - 10, stackWidth + 8, 13);
        ctx.fillStyle = stacks > 0 ? '#a3ff45' : '#9ca3af';
        ctx.fillText(stackText, bodyScr.x, stackY);
      }

      ctx.restore();
    });
  }

  /**
   * Draw miniature weapon icons on player circle boundary
   */
  _drawPlayerWeapon(ctx, scr, player, motion = {}) {
    const radius = 14;
    const weaponAngle = Number.isFinite(motion.weaponAngle) ? motion.weaponAngle : player.angle;
    const reach = Number.isFinite(motion.weaponReach) ? motion.weaponReach : 0;
    const active = Boolean(motion.active) || Math.abs(reach) > 1;
    const holdOffset = active ? 0.24 : 0.55;
    const wAngle = weaponAngle + holdOffset;
    const wDistance = radius + Math.max(0, reach * 0.38);
    const wX = scr.x + Math.cos(wAngle) * wDistance;
    const wY = scr.y + Math.sin(wAngle) * wDistance;

    ctx.save();
    ctx.strokeStyle = player.accentColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.fillStyle = '#111216';
    ctx.shadowBlur = active ? 8 : 0;
    ctx.shadowColor = player.accentColor;

    const weaponType = player.weapon;

    if (weaponType === 'sword') {
      // Finisher: orbit the sword around the body along weaponAngle (lower-left pull → 360° sweep)
      const isFinisherSpin = motion.isFinisher && active;
      const orbitAngle = isFinisherSpin ? weaponAngle : (weaponAngle + Math.PI / 4);
      const orbitDist = isFinisherSpin
        ? radius + 4 + Math.max(0, reach * 0.4)
        : radius + Math.max(0, reach * 0.38);
      const swX = isFinisherSpin
        ? scr.x + Math.cos(weaponAngle) * orbitDist
        : wX;
      const swY = isFinisherSpin
        ? scr.y + Math.sin(weaponAngle) * orbitDist
        : wY;
      ctx.translate(swX, swY);
      ctx.rotate(orbitAngle);
      ctx.strokeStyle = '#dbeafe';
      ctx.lineWidth = 2.2;
      const ext = isFinisherSpin ? 18 : (15 + Math.max(0, reach * 0.32));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ext, -ext);
      ctx.stroke();

      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.lineTo(3, -4);
      ctx.stroke();
    }

    else if (weaponType === 'axe') {
      const idleHoldAngle = -Math.PI / 4;
      const rageActive = player.buffType === 'axe_rage';

      // During any attack: orbit the axe around the body using the spinning weaponAngle.
      const orbitAngle = active ? weaponAngle : (rageActive ? player.angle : idleHoldAngle);
      const orbitR = active
        ? radius + 4 + Math.max(0, reach * 0.08)
        : rageActive
          ? radius + 1
          : radius + 2;
      const axeX = scr.x + Math.cos(orbitAngle) * orbitR;
      const axeY = scr.y + Math.sin(orbitAngle) * orbitR;

      const shaftEnd = active ? 12 : (rageActive ? 19 + Math.max(0, reach * 0.24) : 9);
      const bladeRoot = shaftEnd - 6;
      const bladeTip = shaftEnd + 5;

      ctx.translate(axeX, axeY);
      ctx.rotate(orbitAngle);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(shaftEnd, 0);
      ctx.stroke();

      ctx.strokeStyle = player.accentColor;
      ctx.fillStyle = '#111216';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bladeRoot, -9);
      ctx.lineTo(bladeTip, -5);
      ctx.lineTo(bladeTip, 5);
      ctx.lineTo(bladeRoot, 9);
      ctx.quadraticCurveTo(shaftEnd, 0, bladeRoot, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    else if (weaponType === 'bow') {
      const bowX = scr.x + Math.cos(player.angle) * (radius - 1);
      const bowY = scr.y + Math.sin(player.angle) * (radius - 1);
      ctx.translate(bowX, bowY);
      ctx.rotate(player.angle);

      // Bow limb
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 9, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      // String is always drawn back (ready to fire). On attack, it snaps
      // forward (releases) then returns to full draw.
      const maxPull = 6;
      let stringPull;
      if (active) {
        // Release: quick forward snap using attackProgress
        const releaseT = clamp01((motion.attackProgress || 0) / 0.35);
        stringPull = maxPull * (1 - easeOutCubic(releaseT));
      } else {
        stringPull = maxPull; // always at full draw between shots
      }
      const nockX = -3 - stringPull;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = active ? 1 : 0.75;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(nockX, 0);
      ctx.lineTo(0, 9);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Arrow nock visible when drawn
      if (stringPull > 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(nockX, 0);
        ctx.lineTo(5, 0);
        ctx.stroke();
      }
    }
    
    else if (weaponType === 'spear') {
      // Allow negative reach (pull-back during windup) — just clamp so tip
      // doesn't clip into the player body.
      const ext = Math.max(-radius + 4, radius + 18 + reach);
      const baseX = scr.x + Math.cos(player.angle) * (radius - 2);
      const baseY = scr.y + Math.sin(player.angle) * (radius - 2);
      const tipX = scr.x + Math.cos(player.angle) * ext;
      const tipY = scr.y + Math.sin(player.angle) * ext;

      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      ctx.fillStyle = player.accentColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(player.angle);
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } 
    
    else if (weaponType === 'gauntlet') {
      ctx.fillStyle = player.accentColor;
      [-0.24, 0.24].forEach(offset => {
        const fistAngle = player.angle + offset;
        const fistDist = radius + 2 + Math.max(0, reach * 0.45);
        const fistX = scr.x + Math.cos(fistAngle) * fistDist;
        const fistY = scr.y + Math.sin(fistAngle) * fistDist;

        ctx.beginPath();
        ctx.arc(fistX, fistY, active ? 5.2 : 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = active ? '#ffffff' : '#111216';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    }

    else if (weaponType === 'greatsword') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle + Math.PI / 4);
      const len = 23 + Math.max(0, reach * 0.28);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-6, 3);
      ctx.lineTo(len, -len);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-8, 5);
      ctx.lineTo(0, -2);
      ctx.stroke();
    }

    else if (weaponType === 'scythe') {
      const handleLen = 25 + Math.max(0, reach * 0.24);
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(handleLen, 0);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(handleLen - 2, 2, 12, -Math.PI * 0.95, -Math.PI * 0.1);
      ctx.stroke();
    }

    else if (weaponType === 'dagger') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      const len = 13 + Math.max(0, reach * 0.22);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(1, -4);
      ctx.lineTo(1, 4);
      ctx.stroke();
    }

    else if (weaponType === 'rapier') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      const len = 25 + Math.max(0, reach * 0.36);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-4, 0, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }

    else if (weaponType === 'hammer') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle - Math.PI / 8);
      const len = 18 + Math.max(0, reach * 0.2);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.fillStyle = '#111216';
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2.2;
      ctx.fillRect(len - 2, -7, 13, 14);
      ctx.strokeRect(len - 2, -7, 13, 14);
    }

    ctx.restore();
  }

  /**
   * Draw attack range helper outline and subtle fill
   */
  _drawPlayerAttackRange(ctx, camera, cw, ch, scr, player, isLocal, isAttacking = false, mapWidth = 0, mapHeight = 0, activeAttack = null) {
    if (!player || player.isDead) return;
    const baseWeapon = getEffectiveWeapon(player.weapon, player.buffType);
    if (!baseWeapon) return;
    if (!isLocal && !isAttacking) return;
    // Local player always shows the dashed range guide; attacking overlays it with the solid shape.

    // Charging up the combo finisher? Preview its (bigger) hit range instead.
    const isFinisherPreview = activeAttack?.type === 'finisher_ready' && Boolean(activeAttack.previewType);

    // Only these are real hit-shapes. Motion-only effects (projectile_shot,
    // spear_windup, finisher_ready) must NOT override the drawn shape, or the
    // guide vanishes mid-attack (e.g. the bow path disappears the instant you
    // fire). For those, fall back to the weapon's base shape.
    const SHAPE_TYPES = [
      'melee_arc', 'melee_circle', 'melee_line', 'projectile',
      'melee_heavy_arc', 'melee_sweet_arc', 'melee_backstab',
      'melee_precise_line', 'melee_heavy_line', 'melee_slam'
    ];
    const activeShapeType = SHAPE_TYPES.includes(activeAttack?.type) ? activeAttack.type : null;

    // Scale the world-space reach to screen pixels so the guide matches the
    // real hitbox at any zoom (and reflects active skill buffs).
    const zoom = camera.zoom || 1;
    const shapeType = isFinisherPreview ? activeAttack.previewType : (activeShapeType || baseWeapon.type);
    const shapeRange = isFinisherPreview ? activeAttack.previewRange
      : (Number.isFinite(activeAttack?.range) ? activeAttack.range : baseWeapon.range);
    const shapeWidth = isFinisherPreview ? activeAttack.previewWidth
      : (Number.isFinite(activeAttack?.width) ? activeAttack.width : baseWeapon.width);
    const shapeInnerRange = Number.isFinite(activeAttack?.innerRange) ? activeAttack.innerRange : baseWeapon.innerRange;
    const shapeAngleDeg = isFinisherPreview ? activeAttack.previewAngleDeg
      : (Number.isFinite(activeAttack?.angleDeg) ? activeAttack.angleDeg : baseWeapon.angle);

    const weapon = {
      ...baseWeapon,
      type: shapeType,
      range: (shapeRange || 0) * zoom,
      width: (shapeWidth || 0) * zoom,
      innerRange: (shapeInnerRange || 0) * zoom,
      angle: shapeAngleDeg
    };

    ctx.save();

    // Ranged weapons keep a constant gray dashed path preview at all times so
    // opponents can read & dodge incoming fire — it never flips to a solid
    // highlight on attack.
    const isProjectile = weapon.type === 'projectile';

    // Finisher preview pulses in the weapon color so the player can pre-aim the
    // big strike. Active attacks use a solid bright overlay; idle uses a faint
    // dashed guide.
    const showStrong = isAttacking && !isFinisherPreview && !isProjectile;
    let guideColor;
    let fillAlpha;
    let strokeAlpha;
    if (isFinisherPreview) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 110);
      guideColor = weapon.color;
      fillAlpha = 0.06 + 0.06 * pulse;
      strokeAlpha = 0.45 + 0.35 * pulse;
    } else {
      guideColor = showStrong ? weapon.color : '#d1d5db';
      fillAlpha = showStrong ? 0.035 : 0.018;
      strokeAlpha = showStrong ? 0.36 : 0.18;
    }

    ctx.fillStyle = this._hexToRGB(guideColor, fillAlpha);
    ctx.strokeStyle = this._hexToRGB(guideColor, strokeAlpha);
    ctx.lineWidth = isFinisherPreview ? 2.2 : (showStrong ? 1.6 : 1.1);
    ctx.setLineDash(isFinisherPreview ? [9, 5] : (showStrong ? [] : [6, 7]));

    const range = weapon.range;
    const angle = player.angle;
    const arcShapeTypes = ['melee_arc', 'melee_heavy_arc', 'melee_sweet_arc', 'melee_backstab'];
    const circleShapeTypes = ['melee_circle', 'melee_slam'];
    const lineShapeTypes = ['melee_line', 'melee_precise_line', 'melee_heavy_line'];

    if (circleShapeTypes.includes(weapon.type)) {
      // Circle shape (Axe)
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    else if (arcShapeTypes.includes(weapon.type)) {
      // Arc shape (Sword, Gauntlet)
      const halfAngleRad = (weapon.angle * Math.PI) / 360;
      const startAngle = angle - halfAngleRad;
      const endAngle = angle + halfAngleRad;

      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.arc(scr.x, scr.y, range, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (weapon.type === 'melee_sweet_arc' && weapon.innerRange > 0) {
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = this._hexToRGB(guideColor, strokeAlpha * 0.75);
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, weapon.innerRange, startAngle, endAngle);
        ctx.stroke();
        ctx.restore();
      }
    }
    else if (lineShapeTypes.includes(weapon.type)) {
      // Rectangular line/thrust shape (Spear)
      const uX = Math.cos(angle);
      const uY = Math.sin(angle);
      
      // Orthogonal offset vector
      const halfWidth = weapon.width / 2;
      const pX = -uY * halfWidth;
      const pY = uX * halfWidth;

      // Draw the four corners of the box
      ctx.beginPath();
      ctx.moveTo(scr.x + pX, scr.y + pY);
      ctx.lineTo(scr.x - pX, scr.y - pY);
      ctx.lineTo(scr.x - pX + uX * range, scr.y - pY + uY * range);
      ctx.lineTo(scr.x + pX + uX * range, scr.y + pY + uY * range);
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();
    } 
    else if (weapon.type === 'projectile') {
      const start = 22;
      const distanceToWall = rayToMapBoundaryDistance(player.x, player.y, angle, mapWidth, mapHeight);
      const previewRange = Number.isFinite(distanceToWall) ? distanceToWall : Math.max(cw, ch);
      const startWorldX = player.x + Math.cos(angle) * start;
      const startWorldY = player.y + Math.sin(angle) * start;
      const endWorldX = player.x + Math.cos(angle) * previewRange;
      const endWorldY = player.y + Math.sin(angle) * previewRange;
      const startScr = camera.toScreen(startWorldX, startWorldY, cw, ch);
      const endScr = camera.toScreen(endWorldX, endWorldY, cw, ch);

      ctx.beginPath();
      ctx.moveTo(startScr.x, startScr.y);
      ctx.lineTo(endScr.x, endScr.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = this._hexToRGB(guideColor, 0.25);
      ctx.beginPath();
      ctx.arc(endScr.x, endScr.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair always visible for local player — use weapon color so it
      // stands out clearly against any background, regardless of attack state.
      if (isLocal) this._drawCrosshair(ctx, endScr.x, endScr.y, weapon.color || guideColor, true);
    }

    // Dashed aim line + crosshair at reach tip for melee arc/line (local player).
    if (isLocal && (arcShapeTypes.includes(weapon.type) || lineShapeTypes.includes(weapon.type))) {
      const tipSx = scr.x + Math.cos(angle) * range;
      const tipSy = scr.y + Math.sin(angle) * range;
      ctx.save();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = this._hexToRGB(guideColor, isAttacking ? 0.42 : 0.25);
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(angle) * 20, scr.y + Math.sin(angle) * 20);
      ctx.lineTo(tipSx, tipSy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      this._drawCrosshair(ctx, tipSx, tipSy, guideColor, isAttacking);
    }

    // Axe (melee_circle): direction dot at ring edge.
    if (isLocal && circleShapeTypes.includes(weapon.type)) {
      const dotSx = scr.x + Math.cos(angle) * range * 0.88;
      const dotSy = scr.y + Math.sin(angle) * range * 0.88;
      ctx.save();
      ctx.fillStyle = this._hexToRGB(guideColor, isAttacking ? 0.85 : 0.5);
      ctx.beginPath();
      ctx.arc(dotSx, dotSy, isAttacking ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Draw a + crosshair at (sx, sy) — used for weapon endpoint guides.
   * color is the weapon color; bright=true when the player is actively attacking.
   */
  _drawCrosshair(ctx, sx, sy, color, bright = false) {
    const sz = bright ? 10 : 7;
    const gap = bright ? 3 : 2;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';

    // Dark outline for contrast against any background
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = (bright ? 2.2 : 1.4) + 2;
    ctx.beginPath();
    ctx.moveTo(sx - sz, sy); ctx.lineTo(sx - gap, sy);
    ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + sz, sy);
    ctx.moveTo(sx, sy - sz); ctx.lineTo(sx, sy - gap);
    ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + sz);
    ctx.stroke();

    // Colored inner lines
    ctx.shadowBlur = bright ? 10 : 4;
    ctx.shadowColor = color;
    ctx.strokeStyle = bright ? color : this._hexToRGB(color, 0.85);
    ctx.lineWidth = bright ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(sx - sz, sy); ctx.lineTo(sx - gap, sy);
    ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + sz, sy);
    ctx.moveTo(sx, sy - sz); ctx.lineTo(sx, sy - gap);
    ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + sz);
    ctx.stroke();

    // Center dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, bright ? 2.8 : 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw the cursor crosshair at the exact mouse position (screen space, no
   * camera transform). Always white + black outline so it reads on any background.
   */
  _drawCursorCrosshair(ctx, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const sz = 11;
    const gap = 4;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';

    // Shadow / outline
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x - sz, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + sz, y);
    ctx.moveTo(x, y - sz); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + sz);
    ctx.stroke();

    // White lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - sz, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + sz, y);
    ctx.moveTo(x, y - sz); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + sz);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Dead player tombstone/grave visual representation
   */
  _drawGrave(ctx, camera, cw, ch, player) {
    const scr = camera.toScreen(player.x, player.y, cw, ch);
    ctx.save();

    // Semi-translucent Tombstone
    ctx.fillStyle = 'rgba(74, 85, 104, 0.65)';
    ctx.strokeStyle = 'rgba(26, 32, 44, 0.8)';
    ctx.lineWidth = 2.5;

    // Drawing Headstone SVG alternative arch
    ctx.beginPath();
    ctx.moveTo(scr.x - 9, scr.y + 10);
    ctx.lineTo(scr.x - 9, scr.y - 6);
    ctx.quadraticCurveTo(scr.x, scr.y - 15, scr.x + 9, scr.y - 6);
    ctx.lineTo(scr.x + 9, scr.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // RIP sign or standard Cross inner lining
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y - 8);
    ctx.lineTo(scr.x, scr.y + 4);
    ctx.moveTo(scr.x - 4, scr.y - 4);
    ctx.lineTo(scr.x + 4, scr.y - 4);
    ctx.stroke();

    // Faded nickname hovering under
    ctx.fillStyle = 'rgba(160, 174, 192, 0.5)';
    ctx.font = '9px "JetBrains Mono", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.nickname} [RIP]`, scr.x, scr.y + 20);

    ctx.restore();
  }

  /**
   * Conversion helpers for HEX color sets
   */
  _hexToRGB(hex, alpha = 1) {
    // If HSL passed directly, bypass hex process
    if (hex.startsWith('hsl')) {
      return hex.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
    }

    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(value) {
  const t = clamp01(value);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function rayToMapBoundaryDistance(x, y, angle, mapWidth, mapHeight) {
  if (!mapWidth || !mapHeight) return Infinity;

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const candidates = [];

  if (dx > 0) candidates.push((mapWidth - x) / dx);
  if (dx < 0) candidates.push((0 - x) / dx);
  if (dy > 0) candidates.push((mapHeight - y) / dy);
  if (dy < 0) candidates.push((0 - y) / dy);

  const distance = Math.min(...candidates.filter(value => value > 0 && Number.isFinite(value)));
  return Number.isFinite(distance) ? distance : Infinity;
}
