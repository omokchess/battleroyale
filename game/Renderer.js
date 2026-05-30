/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons } from './Weapons.js';

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
  render(gameState, localPlayerId, camera, mapWidth, mapHeight) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const nowTime = Date.now();
    const dt = Math.min((nowTime - this.lastTime) / 1000, 0.1);
    this.lastTime = nowTime;

    // Particle logic updates & triggers
    this._triggerInstantSparks(gameState, dt);
    this._updateParticles(dt);

    // Clear Screen
    ctx.fillStyle = '#0f1015';
    ctx.fillRect(0, 0, cw, ch);

    // Grid rendering (only draw grids that are within viewport margins)
    this._drawGrid(ctx, camera, cw, ch, mapWidth, mapHeight);

    // Floor particles rendering (Dust trails, projectile flows)
    this._drawParticles(ctx, camera, cw, ch, 'floor');

    // Draw Map Borders
    this._drawBorders(ctx, camera, cw, ch, mapWidth, mapHeight);

    // Draw Active Attack Visual Effects
    if (gameState.effects) {
      this._drawEffects(ctx, camera, cw, ch, gameState.effects);
    }

    // Draw Bow Projectiles
    if (gameState.projectiles) {
      this._drawProjectiles(ctx, camera, cw, ch, gameState.projectiles);
    }

    // Draw All Connected Players
    if (gameState.players) {
      this._drawPlayers(ctx, camera, cw, ch, gameState.players, localPlayerId);
    }

    // Top particles rendering (Hurt splatters, death grave explosions, weapon arcs)
    this._drawParticles(ctx, camera, cw, ch, 'onTop');
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
        const weapon = Weapons[e.weapon] || Weapons.sword;
        if (Math.random() < 0.55) {
          let px = e.x;
          let py = e.y;
          let angle = e.angle;
          
          if (e.type === 'melee_arc') {
            const spread = (weapon.angle * Math.PI) / 360;
            const ranAngle = e.angle + (Math.random() * spread * 2 - spread);
            const dist = weapon.range * (0.35 + Math.random() * 0.65);
            px += Math.cos(ranAngle) * dist;
            py += Math.sin(ranAngle) * dist;
            angle = ranAngle + Math.PI / 2;
          } else if (e.type === 'melee_circle') {
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
            px += Math.cos(e.angle) * dist;
            py += Math.sin(e.angle) * dist;
          }

          const spd = Math.random() * 30 + 10;
          this.particles.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * spd + (Math.random() * 10 - 5),
            vy: Math.sin(angle) * spd + (Math.random() * 10 - 5),
            color: Math.random() < 0.25 ? '#ffffff' : weapon.color,
            size: Math.random() * 2.2 + 1.0,
            alpha: 0.8,
            decay: Math.random() * 2.5 + 1.5,
            shape: 'circle',
            layer: 'onTop'
          });
        }
      });
    }

    // 4. Bow arrows trace stardust sparkling trails
    if (gameState.projectiles) {
      gameState.projectiles.forEach(proj => {
        if (!proj.isDead && Math.random() < 0.35) {
          this.particles.push({
            x: proj.x,
            y: proj.y,
            vx: (Math.random() * 10 - 5) - proj.vx * 0.05,
            vy: (Math.random() * 10 - 5) - proj.vy * 0.05,
            color: '#a3ff45',
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
      p.alpha -= p.decay * dt;
    });
    this.particles = this.particles.filter(p => p.alpha > 0);
  }

  /**
   * Render active particle traces
   */
  _drawParticles(ctx, camera, cw, ch, layerType) {
    ctx.save();
    this.particles.forEach(p => {
      if (p.layer !== layerType) return;

      const scr = camera.toScreen(p.x, p.y, cw, ch);
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

    projectiles.forEach(p => {
      if (p.isDead) return;

      const scr = camera.toScreen(p.x, p.y, cw, ch);
      if (scr.x < -40 || scr.x > cw + 40 || scr.y < -40 || scr.y > ch + 40) return;

      const angle = Math.atan2(p.vy, p.vx);
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
    });

    ctx.restore();
  }

  /**
   * Fading graphic slices for melee collisions
   */
  _drawEffects(ctx, camera, cw, ch, effects) {
    ctx.save();

    effects.forEach(e => {
      const scr = camera.toScreen(e.x, e.y, cw, ch);
      const weapon = Weapons[e.weapon] || Weapons.sword;
      const alpha = 1 - e.progress; // Fade over time
      
      ctx.shadowBlur = 10 * alpha;
      ctx.shadowColor = weapon.color;

      if (e.type === 'melee_arc') {
        const radius = weapon.range;
        const halfAngleRad = (weapon.angle * Math.PI) / 360;

        ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
        ctx.lineWidth = 8 * alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Draw centered arc
        ctx.arc(
          scr.x, scr.y, 
          radius, 
          e.angle - halfAngleRad, 
          e.angle + halfAngleRad
        );
        ctx.stroke();

        // Inner glowing core
        ctx.strokeStyle = this._hexToRGB('#ffffff', alpha * 0.8);
        ctx.lineWidth = 3 * alpha;
        ctx.stroke();
      } 
      
      else if (e.type === 'melee_circle') {
        const radius = weapon.range * e.progress; // Spreads outwards

        ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
        ctx.lineWidth = 6 * alpha;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Spin ticks
        ctx.beginPath();
        const tickCount = 4;
        const tickLength = 12;
        for (let i = 0; i < tickCount; i++) {
          const tickAngle = e.angle + (i * Math.PI / 2) + (e.progress * Math.PI);
          const startR = radius - tickLength;
          const endR = radius + tickLength;
          ctx.moveTo(scr.x + Math.cos(tickAngle) * startR, scr.y + Math.sin(tickAngle) * startR);
          ctx.lineTo(scr.x + Math.cos(tickAngle) * endR, scr.y + Math.sin(tickAngle) * endR);
        }
        ctx.stroke();
      } 
      
      else if (e.type === 'melee_line') {
        // Thrust rectangle (Spear)
        const length = weapon.range;
        const width = weapon.width;

        // Custom snappy thrust easing curve:
        // 0.0 -> 0.15: ultra fast thrust to max length
        // 0.15 -> 0.35: slight hold & vibrate
        // 0.35 -> 1.0: fade and retract
        let ext = 0;
        let shake = 0;
        if (e.progress < 0.15) {
          const t = e.progress / 0.15;
          ext = 1 - (1 - t) * (1 - t); // Quadratic ease out
        } else if (e.progress < 0.35) {
          const t = (e.progress - 0.15) / 0.20;
          ext = 1.0 - t * 0.1;
          shake = Math.sin(e.progress * 130) * 1.5; // Tiny rapid high-frequency buzz for vibration feel
        } else {
          const t = (e.progress - 0.35) / 0.65;
          ext = 0.9 * (1 - t);
        }

        const angleWithShake = e.angle + (shake * Math.PI / 180);
        const startX = scr.x;
        const startY = scr.y;
        const tipX = scr.x + Math.cos(angleWithShake) * length * ext;
        const tipY = scr.y + Math.sin(angleWithShake) * length * ext;

        // 1. Draw a subtle warning/trajectory zone under the spear (during the first half) to help judge range!
        // This is a thin transparent laser beam or rectangle extending to the absolute range.
        if (e.progress < 0.5) {
          const zoneAlpha = 0.18 * (1 - e.progress * 2);
          ctx.save();
          ctx.strokeStyle = this._hexToRGB(weapon.color, zoneAlpha);
          ctx.fillStyle = this._hexToRGB(weapon.color, zoneAlpha * 0.4);
          ctx.lineWidth = 1;
          
          // Draw a long thin capsule/rectangle representing the full attack range/width
          ctx.beginPath();
          const targetLength = length;
          const leftAngle = e.angle - Math.PI / 2;
          const rightAngle = e.angle + Math.PI / 2;
          const hw = width / 2;
          
          const p1x = scr.x + Math.cos(leftAngle) * hw;
          const p1y = scr.y + Math.sin(leftAngle) * hw;
          const p2x = scr.x + Math.cos(rightAngle) * hw;
          const p2y = scr.y + Math.sin(rightAngle) * hw;
          const p3x = p2x + Math.cos(e.angle) * targetLength;
          const p3y = p2y + Math.sin(e.angle) * targetLength;
          const p4x = p1x + Math.cos(e.angle) * targetLength;
          const p4y = p1y + Math.sin(e.angle) * targetLength;
          
          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.lineTo(p3x, p3y);
          ctx.lineTo(p4x, p4y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // 2. Draw outer energetic spear shaft aura
        ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
        ctx.lineWidth = width * (1 - e.progress * 0.7);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // 3. Highlight spear tip with a diamond/glowing head shape!
        const headSize = Math.max(6, width * 0.6) * (1 - e.progress * 0.5);
        ctx.fillStyle = this._hexToRGB('#ffffff', alpha);
        ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
        ctx.lineWidth = 2;
        
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(angleWithShake);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-headSize * 1.5, -headSize / 2);
        ctx.lineTo(-headSize * 2, 0);
        ctx.lineTo(-headSize * 1.5, headSize / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 4. Draw critical white spear hot-core line
        ctx.strokeStyle = this._hexToRGB('#ffffff', alpha);
        ctx.lineWidth = 4 * (1 - e.progress * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // Slightly shorter than tip to keep head clean
        const innerTipX = scr.x + Math.cos(angleWithShake) * length * Math.max(0, ext - 0.1);
        const innerTipY = scr.y + Math.sin(angleWithShake) * length * Math.max(0, ext - 0.1);
        ctx.lineTo(innerTipX, innerTipY);
        ctx.stroke();

        // 5. Draw circular impact rings at the base of thrust (thrust puff!)
        if (e.progress < 0.25) {
          const puffSize = (width * 1.5) * (e.progress / 0.25);
          const puffAlpha = 0.5 * (1 - e.progress / 0.25);
          ctx.strokeStyle = this._hexToRGB('#ffffff', puffAlpha);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(scr.x + Math.cos(e.angle) * 10, scr.y + Math.sin(e.angle) * 10, puffSize, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    ctx.restore();
  }

  /**
   * Draw Players with beautiful pixel graphics
   */
  _drawPlayers(ctx, camera, cw, ch, players, localPlayerId) {
    const radius = 14;

    Object.keys(players).forEach(id => {
      const p = players[id];
      if (p.isDead) {
        this._drawGrave(ctx, camera, cw, ch, p);
        return;
      }

      const scr = camera.toScreen(p.x, p.y, cw, ch);
      const isLocal = id === localPlayerId;

      ctx.save();
      
      // Glow and Shadow under player
      ctx.shadowBlur = isLocal ? 8 : 4;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;

      // Draw Main Player Chassis Circle
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isLocal ? '#ffffff' : '#0b0c10';
      ctx.stroke();

      // Local Player Highlight Marker Ring
      if (isLocal) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw Sight Pointer / Helmet Visor face vector direction
      ctx.strokeStyle = '#0b0c10';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x + Math.cos(p.angle) * (radius - 2), scr.y + Math.sin(p.angle) * (radius - 2));
      ctx.stroke();

      // Highlight core represent eye visor
      ctx.strokeStyle = p.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Side ticks showing helmet look direction
      const leftVisor = p.angle - 0.4;
      const rightVisor = p.angle + 0.4;
      ctx.moveTo(scr.x + Math.cos(leftVisor) * (radius - 4), scr.y + Math.sin(leftVisor) * (radius - 4));
      ctx.lineTo(scr.x + Math.cos(p.angle) * (radius - 2), scr.y + Math.sin(p.angle) * (radius - 2));
      ctx.lineTo(scr.x + Math.cos(rightVisor) * (radius - 4), scr.y + Math.sin(rightVisor) * (radius - 4));
      ctx.stroke();

      // Draw Weapon Frame
      this._drawPlayerWeapon(ctx, scr, p);

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
      ctx.fillRect(scr.x - textWidth / 2 - 4, scr.y - radius - 24, textWidth + 8, 14);

      ctx.fillStyle = isLocal ? '#ffffff' : '#ccd6f6';
      ctx.fillText(tagText, scr.x, scr.y - radius - 13);

      // Mini floating HP bars (hovering above head)
      const barW = 32;
      const barH = 3.5;
      const barX = scr.x - barW / 2;
      const barY = scr.y - radius - 8;

      // Hp Bar Background border
      ctx.fillStyle = '#111216';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // Hp Bar Filled portion
      const hpPct = Math.max(0, p.hp / 100);
      ctx.fillStyle = hpPct > 0.5 ? '#10b981' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      ctx.restore();
    });
  }

  /**
   * Draw miniature weapon icons on player circle boundary
   */
  _drawPlayerWeapon(ctx, scr, player) {
    const radius = 14;
    const wAngle = player.angle + 0.55; // Slightly to the side of look direction
    const wX = scr.x + Math.cos(wAngle) * radius;
    const wY = scr.y + Math.sin(wAngle) * radius;

    ctx.save();
    ctx.strokeStyle = player.accentColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.fillStyle = '#111216';

    const weaponType = player.weapon;

    if (weaponType === 'sword') {
      // Small blade
      ctx.translate(wX, wY);
      ctx.rotate(player.angle + Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, -12);
      ctx.stroke();
    } 
    
    else if (weaponType === 'axe') {
      // Axe head
      ctx.translate(wX, wY);
      ctx.rotate(player.angle);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.lineTo(8, 8);
      ctx.lineTo(8, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } 
    
    else if (weaponType === 'bow') {
      // Curved bow arc
      ctx.translate(wX, wY);
      ctx.rotate(player.angle);
      ctx.beginPath();
      ctx.arc(0, 0, 8, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    } 
    
    else if (weaponType === 'spear') {
      // Long stick tip
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wX, wY);
      ctx.lineTo(wX + Math.cos(player.angle) * 16, wY + Math.sin(player.angle) * 16);
      ctx.stroke();

      // Spear Tip
      ctx.fillStyle = player.accentColor;
      ctx.beginPath();
      const tx = wX + Math.cos(player.angle) * 16;
      const ty = wY + Math.sin(player.angle) * 16;
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } 
    
    else if (weaponType === 'gauntlet') {
      // Fists represent double small shields
      ctx.fillStyle = player.accentColor;
      ctx.beginPath();
      ctx.arc(wX, wY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      
      const wAngleLeft = player.angle - 0.55;
      const wXLeft = scr.x + Math.cos(wAngleLeft) * radius;
      const wYLeft = scr.y + Math.sin(wAngleLeft) * radius;
      ctx.beginPath();
      ctx.arc(wXLeft, wYLeft, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

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
