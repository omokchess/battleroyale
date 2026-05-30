/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class Projectile {
  constructor(id, ownerId, x, y, angle, speed, maxRange, damage) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    
    // Deconstruct velocity using trig
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.speed = speed;
    this.maxRange = maxRange;
    this.damage = damage;
    this.isDead = false;
    this.radius = 5; // Hit detection radius
  }

  // Update projectile coordinates
  update(deltaTime) {
    if (this.isDead) return;

    // Movement
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Range checking
    const dx = this.x - this.startX;
    const dy = this.y - this.startY;
    const distanceTraveled = Math.sqrt(dx * dx + dy * dy);

    if (distanceTraveled >= this.maxRange) {
      this.isDead = true;
    }
  }

  /**
   * Serialize state representation
   */
  serialize() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      isDead: this.isDead
    };
  }
}
