/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Weapons } from './Weapons.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Main render call
   */
  render(gameState, localPlayerId, camera, mapWidth, mapHeight) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Clear Screen
    ctx.fillStyle = '#0f1015';
    ctx.fillRect(0, 0, cw, ch);

    // Grid rendering (only draw grids that are within viewport margins)
    this._drawGrid(ctx, camera, cw, ch, mapWidth, mapHeight);

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
    ctx.strokeStyle = '#a3ff45';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    projectiles.forEach(p => {
      if (p.isDead) return;

      const scr = camera.toScreen(p.x, p.y, cw, ch);
      
      // Calculate travel trace line
      const angle = Math.atan2(p.vy, p.vx);
      const length = 18;

      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x - Math.cos(angle) * length, scr.y - Math.sin(angle) * length);
      ctx.stroke();

      // Sharp arrowhead SVG alternative
      ctx.fillStyle = '#a3ff45';
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
      ctx.fill();
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

        const tipX = scr.x + Math.cos(e.angle) * length * e.progress;
        const tipY = scr.y + Math.sin(e.angle) * length * e.progress;

        ctx.strokeStyle = this._hexToRGB(weapon.color, alpha);
        ctx.lineWidth = width * (1 - e.progress);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(scr.x, scr.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Critical visual core
        ctx.strokeStyle = this._hexToRGB('#ffffff', alpha);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(scr.x, scr.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
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
