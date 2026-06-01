/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const Collision = {
  /**
   * Keep players inside map boundaries
   */
  clampToMap(player, mapWidth, mapHeight) {
    const rx = player.radius || 14;
    const ry = player.radius || 14;

    if (player.x < rx) {
      player.x = rx;
      player.vx = 0;
    } else if (player.x > mapWidth - rx) {
      player.x = mapWidth - rx;
      player.vx = 0;
    }

    if (player.y < ry) {
      player.y = ry;
      player.vy = 0;
    } else if (player.y > mapHeight - ry) {
      player.y = mapHeight - ry;
      player.vy = 0;
    }
  },

  /**
   * Prevent two players from clipping into each other
   */
  resolvePlayerCollisions(players, localPlayerId) {
    const ids = Object.keys(players);
    const radius = 14; // Player basic radius

    for (let i = 0; i < ids.length; i++) {
      const p1 = players[ids[i]];
      if (p1.isDead) continue;

      for (let j = i + 1; j < ids.length; j++) {
        const p2 = players[ids[j]];
        if (p2.isDead) continue;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = radius * 2;

        if (dist < minDist) {
          // If perfectly overlapping, nudge them
          const overlap = minDist - dist;
          const forceX = dist === 0 ? 1 : dx / dist;
          const forceY = dist === 0 ? 0 : dy / dist;

          // Push them apart 50/50
          p1.x -= forceX * overlap * 0.5;
          p1.y -= forceY * overlap * 0.5;
          p2.x += forceX * overlap * 0.5;
          p2.y += forceY * overlap * 0.5;
        }
      }
    }
  },

  /**
   * Sweep and check if attacker hits target using weapon properties
   */
  checkMeleeHit(attacker, target, weapon) {
    if (attacker.id === target.id || target.isDead) return false;

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Attacker custom weapon range + target boundary radius
    const maxRange = weapon.range + (target.radius || 14);

    if (dist > maxRange) return false;

    if (weapon.type === 'melee_circle') {
      // 360 degree attack
      return true;
    }

    if (weapon.type === 'melee_arc') {
      if ((weapon.angle || 0) >= 360) {
        return true;
      }

      // Angular arc check (Sword/Gauntlets)
      // Angle between attacker aim direction and target vector
      const targetAngle = Math.atan2(dy, dx);

      // Calculate angular delta between target angle and weapon center angle
      let angleDiff = targetAngle - attacker.angle;

      // Norm to [-PI, PI]
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      // Half weapon angle in radians
      const halfWeaponAngleRad = (weapon.angle * Math.PI) / 360;

      return Math.abs(angleDiff) <= halfWeaponAngleRad;
    }

    if (weapon.type === 'melee_line') {
      // Directional thrust rect check (Spear)
      // Project target vector onto the aim unit vector
      const uX = Math.cos(attacker.angle);
      const uY = Math.sin(attacker.angle);

      // Dot product: projection distance along spear direction
      const projLength = dx * uX + dy * uY;

      // Parallel check
      if (projLength < 0 || projLength > weapon.range + (target.radius || 14)) {
        return false;
      }

      // Cross product or perpendicular component tells orthogonal deviation from centerline
      const perpDiff = Math.abs(dx * uY - dy * uX);
      const halfWidthLimit = (weapon.width / 2) + (target.radius || 14);

      return perpDiff <= halfWidthLimit;
    }

    return false;
  },

  /**
   * Projectile vs Player collides
   */
  checkProjectileHit(proj, target) {
    if (proj.ownerId === target.id || target.isDead) return false;

    const dx = target.x - proj.x;
    const dy = target.y - proj.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const hitRadius = (target.radius || 14) + proj.radius;
    return dist <= hitRadius;
  },

  /**
   * Hitscan helper: distance from a ray origin to the first contact with a
   * circle, or null when the ray misses. `dirX/dirY` must be a unit vector.
   * Used by the bow railgun skill to resolve an instant 50000px/s shot.
   */
  rayCircleHitDistance(ox, oy, dirX, dirY, cx, cy, r) {
    const mx = ox - cx;
    const my = oy - cy;
    const b = mx * dirX + my * dirY;
    const c = mx * mx + my * my - r * r;

    // Origin outside the circle and pointing away from it → no hit.
    if (c > 0 && b > 0) return null;

    const disc = b * b - c;
    if (disc < 0) return null;

    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t; // origin already inside → contact at distance 0
  },

  /**
   * Distance from a point to the arena boundary along a unit direction.
   * Returns Infinity if the direction never leaves the box.
   */
  rayToBoundsDistance(x, y, dirX, dirY, mapWidth, mapHeight) {
    const candidates = [];
    if (dirX > 0) candidates.push((mapWidth - x) / dirX);
    if (dirX < 0) candidates.push((0 - x) / dirX);
    if (dirY > 0) candidates.push((mapHeight - y) / dirY);
    if (dirY < 0) candidates.push((0 - y) / dirY);

    const dist = Math.min(...candidates.filter(v => v > 0 && Number.isFinite(v)));
    return Number.isFinite(dist) ? dist : Infinity;
  }
};
