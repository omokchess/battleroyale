/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons, getEffectiveWeapon, SkillConfig, DashConfig } from './Weapons.js';

const WEAPON_SPRITE_META = {
  sword: { src: '/assets/weapons/sword.png', scale: 0.55, anchorX: 0.24, anchorY: 0.5, angleOffset: 0 },
  axe: { src: '/assets/weapons/axe.png', scale: 0.64, anchorX: 0.22, anchorY: 0.52, angleOffset: 0 },
  bow: { src: '/assets/weapons/bow.png', scale: 0.58, anchorX: 0.32, anchorY: 0.5, angleOffset: 0 },
  spear: { src: '/assets/weapons/spear.png', scale: 0.68, anchorX: 0.2, anchorY: 0.5, angleOffset: 0 },
  gauntlet: { src: '/assets/weapons/gauntlet.png', scale: 0.56, anchorX: 0.36, anchorY: 0.52, angleOffset: 0 },
  greatsword: { src: '/assets/weapons/greatsword.png', scale: 0.78, anchorX: 0.2, anchorY: 0.54, angleOffset: 0 },
  scythe: { src: '/assets/weapons/scythe.png', scale: 0.82, anchorX: 0.18, anchorY: 0.72, angleOffset: -0.2 },
  dagger: { src: '/assets/weapons/dagger.png', scale: 0.44, anchorX: 0.26, anchorY: 0.5, angleOffset: 0 },
  rapier: { src: '/assets/weapons/rapier.png', scale: 0.56, anchorX: 0.18, anchorY: 0.5, angleOffset: 0 },
  hammer: { src: '/assets/weapons/hammer.png', scale: 0.68, anchorX: 0.22, anchorY: 0.56, angleOffset: 0 },
  matchlock: { src: '/assets/weapons/matchlock.png', scale: 0.62, anchorX: 0.2, anchorY: 0.5, angleOffset: 0 },
  katana: { src: '/assets/weapons/katana.png', scale: 0.62, anchorX: 0.2, anchorY: 0.5, angleOffset: 0 },
  magicstaff: { src: '/assets/weapons/magicstaff.png', scale: 0.62, anchorX: 0.2, anchorY: 0.5, angleOffset: 0 },
  sniper: { src: '/assets/weapons/sniper.png', scale: 0.72, anchorX: 0.18, anchorY: 0.5, angleOffset: 0 }
};
const WEAPON_ASSET_VERSION = '20260606a';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.lastTime = Date.now();
    this.lastPlayersInfo = {};
    this.weaponSprites = {};
    this._glow = 1;     // shadowBlur multiplier — set to 0 by performance mode
    this._perf = false; // performance mode: glows + particles disabled
    this._initWeaponSprites();
  }

  _initWeaponSprites() {
    if (typeof Image === 'undefined') return;
    Object.entries(WEAPON_SPRITE_META).forEach(([key, meta]) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = `${meta.src}?v=${WEAPON_ASSET_VERSION}`;
      this.weaponSprites[key] = { image, meta, ready: false };
      image.onload = () => {
        this.weaponSprites[key].ready = true;
      };
    });
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

    // Performance mode kills the two heaviest canvas costs: glows (every
    // shadowBlur is multiplied by _glow) and particles. Everything else still
    // renders normally.
    this._perf = !!visualSettings.performanceMode;
    this._glow = this._perf ? 0 : 1;

    // Particle logic updates & triggers
    if (this._perf) {
      if (this.particles.length) this.particles.length = 0;
    } else {
      this._triggerInstantSparks(gameState, dt);
      this._updateParticles(dt);
    }

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
    ctx.shadowBlur = this._glow *15;
    ctx.shadowColor = '#45f3ff';
    ctx.strokeStyle = '#45f3ff';
    ctx.lineWidth = 4;

    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Subtly darken outside of boundary
    ctx.shadowBlur = this._glow *0;
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
      } else if (p.kind === 'greatswordwave') {
        this._drawGreatswordWave(ctx, scr, angle, zoom);
      } else if (p.kind === 'fireball') {
        this._drawFireball(ctx, scr, angle, zoom);
      } else if (p.kind === 'iceshard') {
        this._drawIceShard(ctx, scr, angle, zoom);
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

  // Trace a regular polygon (used by the fireball's hexagon trail).
  _tracePolygon(ctx, cx, cy, r, sides, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // 마법 지팡이 — 파이어볼: orange orb with a trailing chain of hexagons.
  _drawFireball(ctx, scr, angle, zoom) {
    ctx.save();
    const r = 9 * (0.7 + zoom * 0.4);
    const t = Date.now();
    for (let i = 3; i >= 1; i--) {
      const tx = scr.x - Math.cos(angle) * (i * 9);
      const ty = scr.y - Math.sin(angle) * (i * 9);
      ctx.strokeStyle = this._hexToRGB('#fb923c', 0.5 - i * 0.12);
      ctx.lineWidth = 2;
      this._tracePolygon(ctx, tx, ty, r * (1 - i * 0.2), 6, t / 280 + i);
      ctx.stroke();
    }
    ctx.shadowBlur = this._glow * 16;
    ctx.shadowColor = '#fb923c';
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 마법 지팡이 — 아이스 샤드: light-blue icicle with a dotted trail.
  _drawIceShard(ctx, scr, angle, zoom) {
    ctx.save();
    const s = 7 * (0.7 + zoom * 0.4);
    for (let i = 3; i >= 1; i--) {
      const tx = scr.x - Math.cos(angle) * (i * 7);
      const ty = scr.y - Math.sin(angle) * (i * 7);
      ctx.fillStyle = this._hexToRGB('#7dd3fc', 0.5 - i * 0.12);
      ctx.beginPath();
      ctx.arc(tx, ty, (4 - i) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(scr.x, scr.y);
    ctx.rotate(angle);
    ctx.shadowBlur = this._glow * 10;
    ctx.shadowColor = '#7dd3fc';
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.moveTo(s * 1.6, 0);
    ctx.lineTo(-s * 0.4, -s * 0.55);
    ctx.lineTo(-s * 0.9, 0);
    ctx.lineTo(-s * 0.4, s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(s * 1.2, 0);
    ctx.lineTo(-s * 0.2, -s * 0.28);
    ctx.lineTo(-s * 0.2, s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Fire DoT: flickering flames ringing a burning player.
  _drawBurnFlames(ctx, scr, radius, zoom) {
    ctx.save();
    const t = Date.now();
    ctx.shadowBlur = this._glow * 8;
    ctx.shadowColor = '#f97316';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t / 220;
      const wob = Math.sin(t / 90 + i * 1.7);
      const fx = scr.x + Math.cos(a) * radius * 0.75;
      const fy = scr.y + Math.sin(a) * radius * 0.75 - radius * 0.3;
      const h = (6 + wob * 3) * (0.7 + zoom * 0.3);
      ctx.fillStyle = this._hexToRGB(i % 2 ? '#fb923c' : '#fbbf24', 0.85);
      ctx.beginPath();
      ctx.moveTo(fx, fy - h);
      ctx.quadraticCurveTo(fx + 3, fy, fx, fy + 2);
      ctx.quadraticCurveTo(fx - 3, fy, fx, fy - h);
      ctx.fill();
    }
    ctx.restore();
  }

  // Loaded ice shards orbiting a magic-staff caster (waiting for F).
  _drawLoadedIcicles(ctx, scr, count, radius, zoom) {
    ctx.save();
    const t = Date.now();
    const orbit = radius + 16;
    ctx.shadowBlur = this._glow * 8;
    ctx.shadowColor = '#7dd3fc';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + t / 600;
      const ix = scr.x + Math.cos(a) * orbit;
      const iy = scr.y + Math.sin(a) * orbit;
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(a + Math.PI / 2); // tip pointing outward
      const s = 6 * (0.7 + zoom * 0.3);
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.45, s * 0.5);
      ctx.lineTo(-s * 0.45, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.lineTo(s * 0.22, s * 0.4);
      ctx.lineTo(-s * 0.22, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 라이프바운드: a green heal ring with rising sparkles.
  _drawLifeboundHeal(ctx, scr, e, alpha, zoom) {
    const progress = clamp01(e.progress);
    ctx.save();
    const r = (14 + 40 * easeOutCubic(progress)) * (0.6 + zoom * 0.4);
    ctx.shadowBlur = this._glow * 10 * alpha;
    ctx.shadowColor = '#a3e635';
    ctx.strokeStyle = this._hexToRGB('#a3e635', 0.7 * alpha);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this._hexToRGB('#bef264', 0.85 * alpha);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rise = progress * 30;
      ctx.beginPath();
      ctx.arc(scr.x + Math.cos(a) * r * 0.6, scr.y + Math.sin(a) * r * 0.6 - rise, 2.4 * (1 - progress) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 아이스 샤드 장전: a quick light-blue ripple when shards are loaded.
  _drawIcicleLoad(ctx, scr, e, alpha, zoom) {
    const progress = clamp01(e.progress);
    ctx.save();
    const r = (10 + 30 * easeOutCubic(progress)) * (0.6 + zoom * 0.4);
    ctx.strokeStyle = this._hexToRGB('#7dd3fc', 0.6 * (1 - progress));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 스나이퍼 순간이동: an expanding green scope ring with crosshair ticks.
  _drawSniperTeleport(ctx, scr, e, alpha, zoom) {
    const progress = clamp01(e.progress);
    ctx.save();
    const r = (8 + 34 * easeOutCubic(progress)) * (0.6 + zoom * 0.4);
    ctx.shadowBlur = this._glow * 10 * alpha;
    ctx.shadowColor = '#22c55e';
    ctx.strokeStyle = this._hexToRGB('#22c55e', 0.8 * alpha);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = this._hexToRGB('#bbf7d0', 0.7 * alpha);
    ctx.lineWidth = 1.5;
    for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(ang) * r * 0.5, scr.y + Math.sin(ang) * r * 0.5);
      ctx.lineTo(scr.x + Math.cos(ang) * r, scr.y + Math.sin(ang) * r);
      ctx.stroke();
    }
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
    ctx.shadowBlur = this._glow *14;
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

      ctx.shadowBlur = this._glow *(minimized ? 4 : 14) * alpha;
      ctx.shadowColor = weapon.color;

      if (e.type === 'melee_heavy_arc') {
        this._drawHeavyCleave(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'greatsword_charge') {
        this._drawGreatswordCharge(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'katana_charge') {
        this._drawKatanaCharge(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_sweet_arc') {
        this._drawScytheSweep(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_backstab') {
        this._drawDaggerStab(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'dagger_qte_lock') {
        this._drawDaggerQteLock(ctx, camera, cw, ch, scr, anchoredEffect, players, weapon, alpha);
      } else if (e.type === 'dagger_qte_window') {
        this._drawDaggerQteWindow(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'dagger_qte_hit') {
        this._drawDaggerQteHit(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'dagger_qte_fail') {
        this._drawDaggerQteFail(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_precise_line') {
        if (e.weapon === 'dagger') {
          this._drawDaggerPierce(ctx, scr, anchoredEffect, weapon, alpha);
        } else {
          this._drawRapierPierce(ctx, scr, anchoredEffect, weapon, alpha);
        }
      } else if (e.type === 'melee_heavy_line') {
        this._drawHeavyLine(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'melee_slam') {
        this._drawHammerSlam(ctx, scr, anchoredEffect, weapon, alpha);
      } else if (e.type === 'hammer_windup') {
        this._drawHammerWindup(ctx, scr, anchoredEffect, weapon, alpha);
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
      } else if (e.type === 'lifebound_heal') {
        this._drawLifeboundHeal(ctx, scr, e, alpha, zoom);
      } else if (e.type === 'icicle_load') {
        this._drawIcicleLoad(ctx, scr, e, alpha, zoom);
      } else if (e.type === 'sniper_teleport') {
        this._drawSniperTeleport(ctx, scr, e, alpha, zoom);
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
    const fullCircleStart = e.weapon === 'sword'
      ? e.angle - Math.PI * 0.75
      : e.angle - halfAngleRad;
    const startAngle = isFullCircleSlash ? fullCircleStart : e.angle - halfAngleRad;
    const endAngle = isFullCircleSlash ? fullCircleStart + Math.PI * 2 : e.angle + halfAngleRad;
    const swingDirection = isFullCircleSlash && e.weapon === 'sword'
      ? 1
      : (e.swingDirection === -1 ? -1 : 1);
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
    ctx.shadowBlur = this._glow *(finisher ? 18 : 12) * alpha;
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

  _drawGreatswordWave(ctx, scr, angle, zoom) {
    const radius = Math.max(34, Weapons.greatsword.range * 0.62) * Math.max(0.7, zoom);
    const halfAngle = ((Weapons.greatsword.angle || 100) * Math.PI) / 360;
    const apexX = -radius;

    ctx.save();
    ctx.translate(scr.x, scr.y);
    ctx.rotate(angle);
    ctx.shadowBlur = this._glow *16;
    ctx.shadowColor = Weapons.greatsword.color;
    ctx.lineCap = 'round';

    ctx.fillStyle = 'rgba(139, 211, 255, 0.17)';
    ctx.beginPath();
    ctx.moveTo(apexX, 0);
    ctx.arc(apexX, 0, radius, -halfAngle, halfAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = Weapons.greatsword.color;
    ctx.lineWidth = 5.8;
    ctx.beginPath();
    ctx.arc(apexX, 0, radius, -halfAngle, halfAngle);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(apexX, 0, radius - 5, -halfAngle * 0.9, halfAngle * 0.9);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.6;
    [-halfAngle, 0, halfAngle].forEach(edge => {
      ctx.beginPath();
      ctx.moveTo(apexX + Math.cos(edge) * 10, Math.sin(edge) * 10);
      ctx.lineTo(apexX + Math.cos(edge) * (radius - 3), Math.sin(edge) * (radius - 3));
      ctx.stroke();
    });
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

    // The blade-arc slash used to render ~100ms ahead of the character's swing
    // motion. Delay the slash by 100ms (converted to progress units) so the arc
    // lands together with the motion instead of leading it.
    const slashDelay = 100 / (e.lifetime || 720);
    const slashProgress = clamp01(Math.max(progress, release * 0.9) - slashDelay);
    this._drawArcSlash(ctx, scr, { ...e, progress: slashProgress, comboFinisher: true }, weapon, alpha);
  }

  _drawGreatswordCharge(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const radius = weapon.range * (0.38 + 0.62 * progress);
    const halfAngle = ((weapon.angle || 210) * Math.PI) / 360;
    const threshold = clamp01(SkillConfig.greatsword.chargeThreshold ?? 0.5);
    const thresholdRadius = weapon.range * threshold;
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 80);

    // Below the charge threshold the strike only deals 1 damage — show that as a
    // dashed gray fan so the player can tell when the hit is still "weak".
    const underThreshold = progress < threshold;

    ctx.save();
    ctx.fillStyle = this._hexToRGB(underThreshold ? '#9ca3af' : weapon.color, (0.05 + 0.1 * progress) * alpha);
    ctx.strokeStyle = underThreshold
      ? this._hexToRGB('#9ca3af', (0.42 + 0.3 * pulse) * alpha)
      : this._hexToRGB(weapon.color, (0.35 + 0.3 * pulse) * alpha);
    ctx.lineWidth = (2 + 3 * progress) * alpha;
    ctx.setLineDash(underThreshold ? [7, 6] : []);
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.arc(scr.x, scr.y, radius, e.angle - halfAngle, e.angle + halfAngle);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this._hexToRGB('#ffffff', (0.36 + 0.22 * pulse) * alpha);
    ctx.lineWidth = 1.8 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, thresholdRadius, e.angle - halfAngle, e.angle + halfAngle);
    ctx.stroke();
    ctx.restore();

    [-0.72, 0, 0.72].forEach(t => {
      const a = e.angle + halfAngle * t;
      ctx.strokeStyle = this._hexToRGB('#ffffff', (0.22 + 0.28 * progress) * alpha);
      ctx.lineWidth = 1.7 * alpha;
      ctx.beginPath();
      ctx.moveTo(scr.x + Math.cos(a) * 16, scr.y + Math.sin(a) * 16);
      ctx.lineTo(scr.x + Math.cos(a) * radius, scr.y + Math.sin(a) * radius);
      ctx.stroke();
    });
    ctx.restore();
  }

  _drawKatanaCharge(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const range = weapon.range || 150;
    const width = Math.max(8, weapon.width || 40);
    const fill = 0.25 + 0.75 * progress;
    const x = scr.x + Math.cos(e.angle) * 16;
    const y = scr.y + Math.sin(e.angle) * 16;

    ctx.save();
    ctx.shadowBlur = this._glow * 12 * alpha;
    ctx.shadowColor = weapon.color;
    this._drawAttackLane(
      ctx,
      x,
      y,
      e.angle,
      range * fill,
      width,
      this._hexToRGB(weapon.color, 0.08 * alpha)
    );

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.42 * alpha);
    ctx.lineWidth = 2 * alpha;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.angle) * range, y + Math.sin(e.angle) * range);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.82 * alpha);
    ctx.lineWidth = 3 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 19 + 4 * progress, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.restore();
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

  _drawDaggerQteLock(ctx, camera, cw, ch, scr, e, players, weapon, alpha) {
    const target = this._findPlayerById(players, e.targetId);
    if (!target || target.isDead) return;
    const targetScr = camera.toScreen(target.x, target.y, cw, ch);
    const progress = clamp01(e.progress);

    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = `rgba(209, 213, 219, ${0.25 + 0.35 * (1 - progress)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scr.x, scr.y);
    ctx.lineTo(targetScr.x, targetScr.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const scanR = 14 + 28 * progress;
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.65 * alpha);
    ctx.beginPath();
    ctx.arc(targetScr.x, targetScr.y, scanR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawDaggerQteWindow(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const perfectT = clamp01((e.perfectMs || 560) / (e.lifetime || 900));
    const outer = 52 - 36 * progress;
    const target = 52 - 36 * perfectT;

    ctx.save();
    ctx.shadowBlur = this._glow *14 * alpha;
    ctx.shadowColor = weapon.color;
    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.65 * alpha);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, target, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.9 * alpha);
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, Math.max(4, outer), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawDaggerQteHit(ctx, scr, e, weapon, alpha) {
    ctx.save();
    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.86 * alpha);
    ctx.lineWidth = 5 * alpha;
    ctx.beginPath();
    ctx.moveTo(scr.x - 28, scr.y + 18);
    ctx.lineTo(scr.x + 26, scr.y - 18);
    ctx.stroke();
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.75 * alpha);
    ctx.lineWidth = 2.2 * alpha;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 18 + 22 * e.progress, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawDaggerQteFail(ctx, scr, e, weapon, alpha) {
    ctx.save();
    ctx.strokeStyle = this._hexToRGB('#ef4444', 0.8 * alpha);
    ctx.lineWidth = 3 * alpha;
    ctx.beginPath();
    ctx.moveTo(scr.x - 12, scr.y - 12);
    ctx.lineTo(scr.x + 12, scr.y + 12);
    ctx.moveTo(scr.x + 12, scr.y - 12);
    ctx.lineTo(scr.x - 12, scr.y + 12);
    ctx.stroke();
    ctx.restore();
  }

  _drawRapierPierce(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const thrust = progress < 0.16
      ? easeOutBack(progress / 0.16)
      : Math.max(0, 1 - (progress - 0.16) / 0.84);
    const reach = weapon.range * (0.2 + 0.8 * thrust);
    const width = Math.max(1.2, weapon.width || 1);
    const tipX = scr.x + Math.cos(e.angle) * reach;
    const tipY = scr.y + Math.sin(e.angle) * reach;
    const baseX = scr.x + Math.cos(e.angle) * Math.max(8, reach - 18);
    const baseY = scr.y + Math.sin(e.angle) * Math.max(8, reach - 18);
    const pX = -Math.sin(e.angle);
    const pY = Math.cos(e.angle);
    const flare = 5.5 * thrust;

    ctx.save();
    if (progress < 0.42) {
      this._drawAttackLane(ctx, scr.x, scr.y, e.angle, weapon.range, 6, this._hexToRGB(weapon.color, 0.08 * alpha));
    }
    this._drawCapsuleLine(ctx, scr.x, scr.y, tipX, tipY, 1.1 * alpha, this._hexToRGB('#ffffff', 0.92 * alpha), 'butt');
    this._drawCapsuleLine(ctx, scr.x, scr.y, tipX, tipY, 3.6 * alpha, this._hexToRGB(weapon.color, 0.24 * alpha), 'butt');

    ctx.fillStyle = this._hexToRGB('#ffffff', 0.88 * alpha);
    ctx.strokeStyle = this._hexToRGB(weapon.color, 0.9 * alpha);
    ctx.lineWidth = 1.2 * alpha;
    ctx.beginPath();
    ctx.moveTo(tipX + Math.cos(e.angle) * 12, tipY + Math.sin(e.angle) * 12);
    ctx.lineTo(baseX + pX * flare, baseY + pY * flare);
    ctx.lineTo(baseX - pX * flare, baseY - pY * flare);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.72 * alpha);
    ctx.lineWidth = 0.9 * alpha;
    ctx.beginPath();
    ctx.moveTo(scr.x + pX * 3, scr.y + pY * 3);
    ctx.lineTo(baseX + pX * flare * 0.55, baseY + pY * flare * 0.55);
    ctx.moveTo(scr.x - pX * 3, scr.y - pY * 3);
    ctx.lineTo(baseX - pX * flare * 0.55, baseY - pY * flare * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  _drawDaggerPierce(ctx, scr, e, weapon, alpha) {
    const progress = clamp01(e.progress);
    const thrust = progress < 0.14
      ? easeOutBack(progress / 0.14)
      : Math.max(0, 1 - (progress - 0.14) / 0.86);
    const reach = weapon.range * (0.12 + 0.88 * thrust);
    const tipX = scr.x + Math.cos(e.angle) * reach;
    const tipY = scr.y + Math.sin(e.angle) * reach;
    const baseX = scr.x + Math.cos(e.angle) * Math.max(6, reach - 18);
    const baseY = scr.y + Math.sin(e.angle) * Math.max(6, reach - 18);
    const pX = -Math.sin(e.angle);
    const pY = Math.cos(e.angle);
    const flare = 8 * thrust;

    ctx.save();
    if (progress < 0.36) {
      this._drawAttackLane(ctx, scr.x, scr.y, e.angle, weapon.range, 10, this._hexToRGB(weapon.color, 0.08 * alpha));
    }

    ctx.shadowBlur = this._glow *12 * alpha;
    ctx.shadowColor = weapon.color;
    ctx.fillStyle = this._hexToRGB(weapon.color, 0.32 * alpha);
    ctx.strokeStyle = this._hexToRGB('#ffffff', 0.88 * alpha);
    ctx.lineWidth = 1.8 * alpha;
    ctx.beginPath();
    ctx.moveTo(tipX + Math.cos(e.angle) * 9, tipY + Math.sin(e.angle) * 9);
    ctx.lineTo(baseX + pX * flare, baseY + pY * flare);
    ctx.lineTo(baseX - pX * flare, baseY - pY * flare);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    this._drawCapsuleLine(ctx, scr.x, scr.y, tipX, tipY, 1.5 * alpha, this._hexToRGB('#ffffff', 0.92 * alpha), 'butt');
    [-1, 1].forEach(side => {
      ctx.strokeStyle = this._hexToRGB(weapon.color, 0.36 * alpha);
      ctx.lineWidth = 1.1 * alpha;
      ctx.beginPath();
      ctx.moveTo(scr.x + pX * side * 4, scr.y + pY * side * 4);
      ctx.lineTo(baseX + pX * side * flare * 0.7, baseY + pY * side * flare * 0.7);
      ctx.stroke();
    });
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

  _drawHammerWindup(ctx, scr, e, weapon, alpha) {
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 70);
    const lifetime = e.lifetime || 1;
    const elapsed = clamp01(e.progress) * lifetime; // ms since cast
    // e.ranges are raw world radii; weapon.range is already zoom-scaled, so
    // recover the zoom factor to scale each telegraphed ring.
    const zoom = e.range ? weapon.range / e.range : 1;
    const ranges = (Array.isArray(e.ranges) && e.ranges.length ? e.ranges : [e.range || weapon.range]).map(r => r * zoom);
    const hits = Array.isArray(e.hitOffsets) ? e.hitOffsets : [];
    const fillStart = e.fillStartMs ?? 0;

    // The filling disc reaches ranges[i] exactly at hitOffsets[i], so it visibly
    // touches each dashed ring the instant that shockwave fires.
    let fillR = 0;
    let prevT = fillStart;
    let prevR = 0;
    for (let i = 0; i < ranges.length; i++) {
      const at = Number.isFinite(hits[i]) ? hits[i] : lifetime;
      if (elapsed >= at) { prevT = at; prevR = ranges[i]; fillR = ranges[i]; continue; }
      const span = at - prevT;
      const seg = span > 0 ? clamp01((elapsed - prevT) / span) : 1;
      fillR = prevR + (ranges[i] - prevR) * seg;
      break;
    }

    ctx.save();

    // Filling disc (the "countdown" that touches each ring on its hit).
    if (fillR > 0) {
      ctx.fillStyle = this._hexToRGB(weapon.color, 0.1 * alpha);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, fillR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.6 * alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, fillR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The shockwave radii as dashed rings; already-fired ones glow in weapon color.
    ctx.setLineDash([8, 7]);
    ctx.lineCap = 'round';
    ranges.forEach((r, i) => {
      const fired = elapsed >= (Number.isFinite(hits[i]) ? hits[i] : Infinity);
      ctx.strokeStyle = this._hexToRGB(fired ? weapon.color : '#ffffff', (fired ? 0.7 : 0.3 + 0.25 * pulse) * alpha);
      ctx.lineWidth = ((fired ? 2.6 : 1.6) + 0.5 * i) * Math.max(0.6, alpha);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);
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
      effect.type === 'greatsword_charge' ||
      effect.type === 'katana_charge' ||
      effect.type === 'dagger_qte_lock' ||
      effect.type === 'dagger_qte_window' ||
      effect.type === 'dagger_qte_hit' ||
      effect.type === 'hammer_windup' ||
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

    ctx.shadowBlur = this._glow *12 * alpha;
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
    ctx.shadowBlur = this._glow *12 * alpha;

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
      effect.type === 'greatsword_charge' ||
      effect.type === 'dagger_qte_lock' ||
      effect.type === 'dagger_qte_window' ||
      effect.type === 'dagger_qte_hit' ||
      effect.type === 'hammer_windup' ||
      effect.type === 'spear_windup' ||
      effect.type === 'finisher_ready'
    );
  }

  _isPlayerBoundEffect(effect) {
    return Boolean(effect && effect.attackerId) &&
      !effect.worldAnchored &&
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
      // Keep the whole delay alive so the prep does not snap into a frozen pose.
      const chargeT = progress * progress * (3 - 2 * progress);
      const pullPulse = Math.sin(Math.PI * progress);
      const readyOffset = effect.weapon === 'sword' ? -Math.PI * 0.75 : Math.PI * 0.82;
      const pullDirection = effect.weapon === 'sword' ? -1 : 1;
      lunge = -5.5 * chargeT - 1.2 * pullPulse;
      weaponReach = -13 * chargeT - 2.5 * pullPulse;
      weaponAngle = angle + readyOffset * chargeT + pullDirection * 0.12 * pullPulse;
      bodyScale = 1.35 * chargeT + 0.25 * pullPulse;

    } else if (effect.type === 'greatsword_charge') {
      const chargeT = easeOutCubic(clamp01((progress + 0.12) / 0.58));
      lunge = -7 * chargeT;
      weaponReach = -24 * chargeT;
      weaponAngle = angle - 1.95 * chargeT;
      bodyScale = 2.1 * chargeT;

    } else if (effect.type === 'katana_charge') {
      const chargeT = progress * progress * (3 - 2 * progress);
      lunge = -4 * chargeT;
      weaponReach = -11 * chargeT;
      weaponAngle = angle - 1.05 * chargeT;
      bodyScale = 0.9 * chargeT;

    } else if (effect.type === 'hammer_windup') {
      const chargeT = easeOutCubic(progress);
      lunge = -4 * chargeT;
      weaponReach = -12 * chargeT;
      weaponAngle = angle - Math.PI * 0.72 * chargeT;
      bodyScale = 1.8 * chargeT;

    } else if (effect.type === 'dagger_qte_hit') {
      const stab = progress < 0.22 ? easeOutBack(progress / 0.22) : Math.max(0, 1 - (progress - 0.22) / 0.78);
      lunge = 15 * stab;
      weaponReach = 24 * stab;
      weaponAngle = angle;
      bodyScale = 1.4 * stab;

    } else if (effect.type === 'melee_heavy_arc' || effect.type === 'melee_heavy_line') {
      const isGreatsword = effect.weapon === 'greatsword';
      const motionProgress = isGreatsword ? clamp01(progress + 0.1) : progress;
      const windupPortion = isGreatsword ? 0.16 : 0.45;
      const chargeT = motionProgress < windupPortion ? easeOutCubic(motionProgress / windupPortion) : 1;
      const releaseT = progress < windupPortion ? 0 : easeOutBack((progress - windupPortion) / (1 - windupPortion));
      const swingDirection = effect.swingDirection === -1 ? -1 : 1;
      lunge = (isGreatsword ? -7 : -8) * chargeT + (isGreatsword ? 18 : 13) * releaseT;
      weaponReach = (isGreatsword ? -14 : -12) * chargeT + (isGreatsword ? 28 : 20) * releaseT;
      weaponAngle = angle + swingDirection * ((isGreatsword ? -2.05 : -1.15) * chargeT + (isGreatsword ? 3.25 : 2.25) * releaseT);
      bodyScale = 2.1 * Math.sin(Math.PI * clamp01(progress));

    } else if (effect.type === 'melee_sweet_arc') {
      const swingDirection = effect.swingDirection === -1 ? -1 : 1;
      const sweep = easeOutCubic(clamp01(progress / 0.92));
      lunge = 5 * Math.sin(Math.PI * progress);
      weaponReach = 20 * Math.sin(Math.PI * progress);
      weaponAngle = angle + swingDirection * (-1.55 + sweep * 3.1);
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

    } else if (effect.weapon === 'sword' && effect.comboFinisher) {
      // Sword finisher: keep the charged lower-left pose, then sweep a full 360.
      const motionProgress = clamp01(progress + 0.08);
      const readyOffset = -Math.PI * 0.75;
      if (motionProgress < 0.08) {
        const t = easeOutCubic(motionProgress / 0.08);
        lunge = -6 + 2 * t;
        weaponReach = -14 + 2 * t;
        weaponAngle = angle + readyOffset;
        bodyScale = 1.55 + 0.35 * t;
      } else {
        const t = easeOutCubic((motionProgress - 0.08) / 0.92);
        const fadeOut = Math.max(0, 1 - (motionProgress - 0.08) / 0.55);
        lunge = -4 * fadeOut;
        weaponReach = -12 + 24 * t;
        weaponAngle = angle + readyOffset + t * Math.PI * 2;
        bodyScale = 1.9 * (1 - easeOutCubic(Math.min(1, (motionProgress - 0.08) / 0.92)));
      }

    } else if (effect.weapon === 'axe') {
      // Axe: spin the weapon around the body on every attack (regular + finisher)
      const spinMult = effect.comboFinisher ? 3.0 : 2.2;
      const spin = easeOutCubic(Math.min(1, progress / 0.65));
      weaponAngle = angle + spin * Math.PI * spinMult;
      bodyScale = (effect.comboFinisher ? 2.6 : 1.8) * Math.sin(Math.PI * clamp01(progress));

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
      const motionProgress = effect.weapon === 'sword' ? clamp01((progress + 0.1) / 0.62) : progress;
      const slashProgress = effect.weapon === 'sword' ? clamp01((progress + 0.06) / 0.72) : clamp01(motionProgress * 0.95);
      const slash = Math.sin(Math.PI * slashProgress);
      const finisherBoost = effect.comboFinisher ? 1.7 : 1;
      lunge = 4 * slash * finisherBoost;
      weaponReach = 10 * slash * finisherBoost;
      weaponAngle = angle + swingDirection * (-0.9 + easeOutCubic(motionProgress) * 1.8) * finisherBoost;
      bodyScale = 1.0 * slash * finisherBoost;
    }

    return {
      active: true,
      effectType: effect.type,
      attackProgress: progress,
      isFinisher: Boolean(effect.comboFinisher),
      swingDirection: effect.swingDirection === -1 ? -1 : 1,
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
      ctx.shadowBlur = this._glow * (isLocal ? 15 : 4);
      ctx.shadowColor = isLocal ? '#ef4444' : p.color;
      ctx.fillStyle = p.color;

      // Active skill-buff floor burst (axe rage / gauntlet lance).
      if (p.buffTimeLeft > 0) {
        const auraColor = p.buffType === 'axe_rage' ? '#f55555'
          : p.buffType === 'gauntlet_lance' ? '#ff45db'
          : p.accentColor;
        this._drawSustainedBuffBurst(ctx, bodyScr, p.buffType, auraColor, 0.72, camera.zoom || 1, Date.now());
      }
      this._drawCostumeEffect(ctx, bodyScr, p, radius, Date.now());

      // Draw Main Player Chassis Circle
      ctx.beginPath();
      ctx.arc(bodyScr.x, bodyScr.y, radius + motion.bodyScale, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.shadowBlur = this._glow *0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isLocal ? '#ef4444' : '#0b0c10';
      ctx.stroke();

      // Magic staff status overlays: fire DoT flames + loaded ice shards orbiting.
      if (p.burnTimeLeft > 0) this._drawBurnFlames(ctx, bodyScr, radius, camera.zoom || 1);
      if (p.pendingIcicles > 0) this._drawLoadedIcicles(ctx, bodyScr, p.pendingIcicles, radius, camera.zoom || 1);

      // Dash i-frame white highlight — bright flash that fades as the
      // invulnerability window expires.
      if (p.iframeTimeLeft > 0) {
        const iAlpha = clamp01(p.iframeTimeLeft / (DashConfig.iframeMs / 1000));
        ctx.save();
        ctx.shadowBlur = this._glow *16 * iAlpha;
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
        ctx.shadowBlur = this._glow *12;
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
      this._drawCostumeDecoration(ctx, bodyScr, p, radius, Date.now());

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

  _drawCostumeEffect(ctx, scr, player, radius, now) {
    const effect = player.costumeEffect;
    if (!effect) return;
    const t = now / 1000;
    ctx.save();
    ctx.shadowBlur = this._glow * 8;
    ctx.shadowColor = player.accentColor;

    if (effect === 'embers' || effect === 'sparkles' || effect === 'leaves') {
      const color = effect === 'embers' ? '#fb923c' : effect === 'leaves' ? '#86efac' : '#fde68a';
      const count = effect === 'sparkles' ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const a = t * (effect === 'leaves' ? -1.4 : 1.7) + i * Math.PI * 2 / count;
        const d = radius + 6 + Math.sin(t * 2 + i) * 2;
        const x = scr.x + Math.cos(a) * d;
        const y = scr.y + Math.sin(a) * d;
        ctx.fillStyle = this._hexToRGB(color, 0.68);
        if (effect === 'sparkles') {
          ctx.strokeStyle = this._hexToRGB(color, 0.78);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x - 3, y);
          ctx.lineTo(x + 3, y);
          ctx.moveTo(x, y - 3);
          ctx.lineTo(x, y + 3);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, effect === 'embers' ? 2 : 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (effect === 'runes') {
      ctx.strokeStyle = this._hexToRGB('#c084fc', 0.48);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius + 8, t * 1.4, t * 1.4 + Math.PI * 1.4);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (effect === 'shade') {
      const back = player.angle + Math.PI;
      ctx.fillStyle = this._hexToRGB('#020617', 0.32);
      ctx.beginPath();
      ctx.ellipse(
        scr.x + Math.cos(back) * 7,
        scr.y + Math.sin(back) * 7,
        radius + 8,
        radius * 0.58,
        back,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  _drawCostumeDecoration(ctx, scr, player, radius, now) {
    const decoration = player.costumeDecoration;
    if (!decoration) return;
    const upX = scr.x;
    const upY = scr.y - radius - 4;
    const accent = player.accentColor || '#66fcf1';

    ctx.save();
    ctx.shadowBlur = this._glow * 7;
    ctx.shadowColor = accent;
    ctx.strokeStyle = accent;
    ctx.fillStyle = this._hexToRGB(accent, 0.86);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (decoration === 'crown') {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(upX - 8, upY + 1);
      ctx.lineTo(upX - 5, upY - 7);
      ctx.lineTo(upX, upY - 2);
      ctx.lineTo(upX + 5, upY - 7);
      ctx.lineTo(upX + 8, upY + 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else if (decoration === 'crest') {
      ctx.beginPath();
      ctx.moveTo(upX, upY - 9);
      ctx.lineTo(upX - 6, upY + 2);
      ctx.lineTo(upX + 6, upY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (decoration === 'halo') {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(upX, upY - 4 + Math.sin(now / 220) * 1.5, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (decoration === 'wings') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = this._hexToRGB(accent, 0.78);
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(scr.x - Math.cos(player.angle) * 3, scr.y);
        ctx.quadraticCurveTo(scr.x + side * 17, scr.y - 11, scr.x + side * 24, scr.y + 2);
        ctx.quadraticCurveTo(scr.x + side * 12, scr.y + 3, scr.x + side * 8, scr.y + 11);
        ctx.stroke();
      });
    } else if (decoration === 'cape') {
      const back = player.angle + Math.PI;
      const side = back + Math.PI / 2;
      const bx = scr.x + Math.cos(back) * 7;
      const by = scr.y + Math.sin(back) * 7;
      ctx.fillStyle = this._hexToRGB(accent, 0.34);
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(side) * 6, by + Math.sin(side) * 6);
      ctx.lineTo(bx - Math.cos(side) * 6, by - Math.sin(side) * 6);
      ctx.lineTo(bx + Math.cos(back) * 20, by + Math.sin(back) * 20);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
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
    ctx.shadowBlur = this._glow * (active ? 8 : 0);
    ctx.shadowColor = player.accentColor;

    const weaponType = player.weapon;
    if (this._drawWeaponSprite(ctx, scr, player, motion, radius, weaponAngle, reach, active)) {
      ctx.restore();
      return;
    }

    if (weaponType === 'sword') {
      const isFinisherSpin = motion.isFinisher && active;
      const swingDir = motion.swingDirection === -1 ? -1 : 1;

      if (isFinisherSpin) {
        // 360° finisher: orbit the blade around the body (kept as the spin sweep).
        const orbitDist = radius + 4 + Math.max(0, reach * 0.4);
        ctx.translate(scr.x + Math.cos(weaponAngle) * orbitDist, scr.y + Math.sin(weaponAngle) * orbitDist);
        ctx.rotate(weaponAngle);
        const ext = 18;
        ctx.fillStyle = this._hexToRGB('#dbeafe', 0.88);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-1, 1);
        ctx.lineTo(ext, -ext);
        ctx.lineTo(ext - 4, -ext + 1.2);
        ctx.lineTo(1, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = player.accentColor;
        ctx.lineWidth = 3.1;
        ctx.beginPath();
        ctx.moveTo(-6, 4);
        ctx.lineTo(4, -6);
        ctx.stroke();
        ctx.fillStyle = '#111216';
        ctx.beginPath();
        ctx.arc(-6, 4, 2.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Real slash: the hilt is pinned near the hand and the blade extends along
        // the swing angle, rotating through the arc as weaponAngle sweeps. The
        // scale(1, swingDir) flip keeps the SAME cutting edge leading on every
        // alternating swing (instead of hitting with the back of the blade).
        const drawAngle = active ? weaponAngle : weaponAngle + 0.5;
        const hilt = radius - 3;
        const len = 20 + Math.max(0, reach * 0.5);

        ctx.translate(scr.x, scr.y);
        ctx.rotate(drawAngle);
        ctx.scale(1, swingDir);

        // Blade: hilt → tip along +x, cutting edge on the -y side.
        ctx.fillStyle = this._hexToRGB('#dbeafe', 0.9);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(hilt, 2.4);
        ctx.lineTo(hilt + len, -0.6);
        ctx.lineTo(hilt + len - 3, -2.6);
        ctx.lineTo(hilt, -2.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bright cutting edge (-y).
        ctx.strokeStyle = this._hexToRGB('#ffffff', 0.7);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(hilt, -2.2);
        ctx.lineTo(hilt + len - 3, -2.6);
        ctx.stroke();

        // Crossguard + pommel at the hand.
        ctx.strokeStyle = player.accentColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hilt - 1, -4.5);
        ctx.lineTo(hilt - 1, 4.5);
        ctx.stroke();
        ctx.fillStyle = '#111216';
        ctx.beginPath();
        ctx.arc(hilt - 4, 0, 2, 0, Math.PI * 2);
        ctx.fill();
      }
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

        ctx.fillStyle = player.accentColor;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(3, -2.2);
        ctx.lineTo(4.5, 0);
        ctx.lineTo(3, 2.2);
        ctx.closePath();
        ctx.fill();
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

      ctx.strokeStyle = this._hexToRGB(player.accentColor, 0.55);
      ctx.lineWidth = 1;
      const sideX = Math.cos(player.angle + Math.PI / 2) * 2;
      const sideY = Math.sin(player.angle + Math.PI / 2) * 2;
      ctx.beginPath();
      ctx.moveTo(baseX + sideX, baseY + sideY);
      ctx.lineTo(tipX + sideX, tipY + sideY);
      ctx.stroke();

      ctx.fillStyle = player.accentColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(player.angle);
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
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
        ctx.fillStyle = this._hexToRGB('#ffffff', active ? 0.82 : 0.55);
        ctx.beginPath();
        ctx.arc(fistX - Math.cos(fistAngle) * 1.8, fistY - Math.sin(fistAngle) * 1.8, active ? 1.6 : 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = player.accentColor;
      });
    }

    else if (weaponType === 'greatsword') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle - Math.PI / 4);
      const len = 23 + Math.max(0, reach * 0.28);
      ctx.fillStyle = this._hexToRGB('#e5e7eb', 0.9);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5, -4);
      ctx.lineTo(len, len);
      ctx.lineTo(len - 5, len - 1);
      ctx.lineTo(-1, -7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = this._hexToRGB(player.accentColor, 0.6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(len - 6, len - 6);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(2, 4);
      ctx.stroke();
      ctx.fillStyle = '#111216';
      ctx.beginPath();
      ctx.arc(-8, -6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    else if (weaponType === 'scythe') {
      const scytheAngle = active ? weaponAngle + 0.35 : player.angle + 0.12;
      const gripX = scr.x + Math.cos(player.angle) * (active ? 5 : 7);
      const gripY = scr.y + Math.sin(player.angle) * (active ? 5 : 7);
      const handleTop = -31 - Math.max(0, reach * 0.12);
      const handleBottom = 38;
      ctx.translate(gripX, gripY);
      ctx.rotate(scytheAngle);

      ctx.shadowBlur = this._glow * (active ? 8 : 3);
      ctx.shadowColor = player.accentColor;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-6, handleBottom + 6);
      ctx.lineTo(7, handleTop);
      ctx.stroke();

      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-6, handleBottom + 6);
      ctx.lineTo(7, handleTop);
      ctx.stroke();

      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.36);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-4, handleBottom + 2);
      ctx.lineTo(9, handleTop + 2);
      ctx.stroke();

      const jointX = 7;
      const jointY = handleTop;
      ctx.fillStyle = '#111216';
      ctx.strokeStyle = this._hexToRGB(player.accentColor, 0.78);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(jointX - 4, jointY + 1);
      ctx.bezierCurveTo(jointX + 15, jointY - 13, jointX + 38, jointY - 13, jointX + 54, jointY - 5);
      ctx.bezierCurveTo(jointX + 36, jointY - 5, jointX + 16, jointY - 2, jointX + 1, jointY + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(jointX + 2, jointY - 1);
      ctx.bezierCurveTo(jointX + 17, jointY - 9, jointX + 39, jointY - 9, jointX + 51, jointY - 5);
      ctx.stroke();

      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(jointX - 4, jointY - 5);
      ctx.lineTo(jointX + 7, jointY + 6);
      ctx.stroke();

      ctx.fillStyle = this._hexToRGB('#ffffff', 0.92);
      ctx.beginPath();
      ctx.arc(jointX + 1, jointY + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    else if (weaponType === 'dagger') {
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      const len = 13 + Math.max(0, reach * 0.22);
      ctx.fillStyle = this._hexToRGB('#ffffff', 0.86);
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(len + 4, 0);
      ctx.lineTo(0, -3.2);
      ctx.lineTo(2, 0);
      ctx.lineTo(0, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(1, -4);
      ctx.lineTo(1, 4);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(1, 0);
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
      ctx.strokeStyle = this._hexToRGB(player.accentColor, 0.7);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-2, -1.8);
      ctx.lineTo(len - 4, -1.8);
      ctx.stroke();
      ctx.strokeStyle = player.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-4, 0, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(len, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.strokeStyle = this._hexToRGB('#ffffff', 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(len + 1, -4);
      ctx.lineTo(len + 8, -4);
      ctx.moveTo(len + 1, 4);
      ctx.lineTo(len + 8, 4);
      ctx.stroke();
      ctx.fillStyle = player.accentColor;
      ctx.beginPath();
      ctx.arc(len - 2, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (weaponType === 'matchlock') {
      // 화승총: short musket — wood stock + steel barrel + red muzzle.
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      ctx.fillStyle = '#5b3b1a';
      ctx.fillRect(-11, -2.6, 9, 5.2);              // stock
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-3, -0.4);
      ctx.lineTo(19, -0.4);                          // barrel
      ctx.stroke();
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(-3, 1.4, 6, 2.4);                 // lock/trigger block
      ctx.shadowBlur = this._glow * 6;
      ctx.shadowColor = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(19, -0.4, 2.3, 0, Math.PI * 2);        // muzzle
      ctx.fill();
    }
    else if (weaponType === 'katana') {
      // 카타나: long slim blade, rose guard + dark wrapped handle.
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      const len = 25 + Math.max(0, reach * 0.5);
      ctx.fillStyle = this._hexToRGB('#ffe4e6', 0.92);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1, 1.5);
      ctx.lineTo(len, -0.2);
      ctx.lineTo(len - 3, -1.9);
      ctx.lineTo(-1, -1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#f43f5e';                   // tsuba (guard)
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-1, -3.6);
      ctx.lineTo(-1, 3.6);
      ctx.stroke();
      ctx.strokeStyle = '#9f1239';                   // handle
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(-9, 0);
      ctx.stroke();
    }
    else if (weaponType === 'magicstaff') {
      // 마법 지팡이: wooden shaft with a glowing purple orb at the tip.
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      ctx.strokeStyle = '#7c4d2a';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(15, 0);                             // shaft
      ctx.stroke();
      ctx.shadowBlur = this._glow * 9;
      ctx.shadowColor = '#a855f7';
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(17, 0, 4, 0, Math.PI * 2);             // orb
      ctx.fill();
      ctx.fillStyle = '#f3e8ff';
      ctx.beginPath();
      ctx.arc(17, 0, 1.8, 0, Math.PI * 2);           // orb core
      ctx.fill();
    }
    else if (weaponType === 'sniper') {
      // 스나이퍼: long rifle with a green scope.
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle);
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(-13, -2.6, 7, 5.2);               // stock
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(24, 0);                             // long barrel
      ctx.stroke();
      ctx.fillStyle = '#111216';                     // scope body
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.4;
      ctx.fillRect(1, -5.5, 9, 3.2);
      ctx.strokeRect(1, -5.5, 9, 3.2);
      ctx.shadowBlur = this._glow * 6;
      ctx.shadowColor = '#22c55e';
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(24, 0, 2, 0, Math.PI * 2);             // muzzle
      ctx.fill();
    }

    ctx.restore();
  }

  _drawWeaponSprite(ctx, scr, player, motion, radius, weaponAngle, reach, active) {
    const weaponType = player.weapon;
    const sprite = this.weaponSprites?.[weaponType];
    if (!sprite?.ready || !sprite.image?.naturalWidth) return false;

    const meta = sprite.meta;
    const rageActive = weaponType === 'axe' && player.buffType === 'axe_rage';
    let drawAngle = weaponAngle;
    if (weaponType === 'axe' && !active) {
      drawAngle = rageActive ? player.angle : -Math.PI / 4;
    } else if (weaponType === 'bow') {
      drawAngle = player.angle;
    } else if (weaponType === 'scythe') {
      drawAngle = active ? weaponAngle + 0.35 : player.angle + 0.12;
    }

    const spriteScale = meta.scale * (active ? 1.06 : 1);
    const size = Math.max(18, 64 * spriteScale + Math.max(0, reach) * 0.08);
    const handDist = Math.max(radius - 3, radius + 6 + reach * 0.2);
    const handX = scr.x + Math.cos(drawAngle) * handDist;
    const handY = scr.y + Math.sin(drawAngle) * handDist;

    const drawSingle = (offsetAngle = 0, offsetDist = 0, flipY = 1) => {
      const a = drawAngle + offsetAngle;
      const x = handX + Math.cos(drawAngle + Math.PI / 2) * offsetDist;
      const y = handY + Math.sin(drawAngle + Math.PI / 2) * offsetDist;
      ctx.save();
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, y);
      ctx.rotate(a + (meta.angleOffset || 0));
      ctx.scale(1, flipY);
      ctx.globalAlpha = active ? 1 : 0.94;
      ctx.shadowBlur = this._glow * (active ? 8 : 2);
      ctx.shadowColor = player.accentColor;
      ctx.drawImage(
        sprite.image,
        -size * meta.anchorX,
        -size * meta.anchorY,
        size,
        size
      );
      ctx.imageSmoothingEnabled = smoothing;
      ctx.restore();
    };

    if (weaponType === 'gauntlet') {
      drawSingle(0.05, -5, 1);
      drawSingle(-0.05, 5, -1);
    } else {
      drawSingle(0, 0, 1);
    }
    return true;
  }

  /**
   * Draw attack range helper outline and subtle fill
   */
  _drawPlayerAttackRange(ctx, camera, cw, ch, scr, player, isLocal, isAttacking = false, mapWidth = 0, mapHeight = 0, activeAttack = null) {
    if (!player || player.isDead) return;
    const baseWeapon = getEffectiveWeapon(player.weapon, player.buffType);
    if (!baseWeapon) return;
    // Reaching here means the guide should be shown: the local player always, and
    // enemies whenever the viewer hasn't hidden them (gated by hideEnemyAttackPreviews
    // in the caller). So enemy guides show whether or not they're mid-attack —
    // idle draws the dashed guide, attacking overlays the solid shape.

    // Charging up the combo finisher? Preview its (bigger) hit range instead.
    const isFinisherPreview = activeAttack?.type === 'finisher_ready' && Boolean(activeAttack.previewType);
    const isGreatswordChargePreview = activeAttack?.type === 'greatsword_charge' && player.weapon === 'greatsword';
    const skillPreview = isGreatswordChargePreview ? SkillConfig.greatsword : null;

    // Only these are real hit-shapes. Motion-only effects (projectile_shot,
    // spear_windup, finisher_ready) must NOT override the drawn shape, or the
    // guide vanishes mid-attack (e.g. the bow path disappears the instant you
    // fire). For those, fall back to the weapon's base shape.
    const SHAPE_TYPES = [
      'melee_arc', 'melee_circle', 'melee_line', 'projectile',
      'melee_heavy_arc', 'melee_sweet_arc', 'melee_backstab',
      'melee_precise_line', 'melee_heavy_line', 'melee_slam', 'melee_blade_sweep'
    ];
    const activeShapeType = SHAPE_TYPES.includes(activeAttack?.type) ? activeAttack.type : null;

    // Scale the world-space reach to screen pixels so the guide matches the
    // real hitbox at any zoom (and reflects active skill buffs).
    const zoom = camera.zoom || 1;
    let shapeType = activeShapeType || baseWeapon.type;
    let shapeRange = Number.isFinite(activeAttack?.range) ? activeAttack.range : baseWeapon.range;
    let shapeWidth = Number.isFinite(activeAttack?.width) ? activeAttack.width : baseWeapon.width;
    let shapeInnerRange = Number.isFinite(activeAttack?.innerRange) ? activeAttack.innerRange : baseWeapon.innerRange;
    let shapeAngleDeg = Number.isFinite(activeAttack?.angleDeg) ? activeAttack.angleDeg : baseWeapon.angle;
    if (isFinisherPreview) {
      shapeType = activeAttack.previewType;
      shapeRange = activeAttack.previewRange;
      shapeWidth = activeAttack.previewWidth;
      shapeAngleDeg = activeAttack.previewAngleDeg;
    } else if (skillPreview) {
      shapeType = skillPreview.type;
      shapeRange = skillPreview.range;
      shapeWidth = skillPreview.width;
      shapeInnerRange = skillPreview.innerRange;
      shapeAngleDeg = skillPreview.angle;
    } else if (player.weapon === 'greatsword' && !activeShapeType) {
      // Idle (not charging) greatsword guide is drawn at the full charged reach
      // so its resting footprint matches the charge preview's size.
      shapeRange = SkillConfig.greatsword.range;
      shapeAngleDeg = SkillConfig.greatsword.angle;
    }

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
    const arcShapeTypes = ['melee_arc', 'melee_heavy_arc', 'melee_sweet_arc', 'melee_backstab', 'melee_blade_sweep'];
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

      if (isGreatswordChargePreview) {
        const thresholdRadius = range * clamp01(SkillConfig.greatsword.chargeThreshold ?? 0.5);
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = this._hexToRGB('#ffffff', 0.44);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, thresholdRadius, startAngle, endAngle);
        ctx.stroke();
        ctx.restore();
      }

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
    ctx.shadowBlur = this._glow * (bright ? 10 : 4);
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
    ctx.shadowBlur = this._glow *0;
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
