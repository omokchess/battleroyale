/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cycle-based storm zone (Task 5). This is a respawn deathmatch, so the zone is
 * NOT a traditional shrink-to-end ring — it loops forever:
 *
 *   safe (full arena) → warning (next circle shown) → shrinking → hold → reset
 *
 * Players outside the safe circle during shrinking/hold take per-second tick
 * damage. The host owns a Zone instance and ticks it; clients receive the
 * serialized fields and only read them (render). Durations and the minimum
 * radius scale with the arena size.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Zone {
  constructor(mapWidth, mapHeight, arenaSize = 'tiny') {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    const span = Math.max(mapWidth, mapHeight);
    this.maxRadius = Math.hypot(mapWidth, mapHeight) / 2; // fully covers the arena
    this.minRadius = span * 0.22;                          // scales with arena size

    this.cx = mapWidth / 2;
    this.cy = mapHeight / 2;
    this.radius = this.maxRadius;
    this.nextCx = this.cx;
    this.nextCy = this.cy;
    this.nextRadius = this.maxRadius;

    this.phase = 'safe';
    this.phaseUntil = 0;
    this.dps = 7; // out-of-zone damage per second

    // Phase durations (ms). Shrink takes longer on bigger maps.
    const sizeK = Math.sqrt(span / 760);
    this.durSafe = 9000;
    this.durWarning = 5000;
    this.durShrink = Math.round(7000 * sizeK);
    this.durHold = 6000;

    this._shrinkFromR = this.maxRadius;
    this._shrinkFromX = this.cx;
    this._shrinkFromY = this.cy;
    this._shrinkStart = 0;
  }

  /** Host-side tick. Advances phases and interpolates the radius while shrinking. */
  update(now) {
    if (!this.phaseUntil) this._enterSafe(now);

    if (now < this.phaseUntil) {
      if (this.phase === 'shrinking') {
        const t = easeInOut(clamp01((now - this._shrinkStart) / this.durShrink));
        this.radius = lerp(this._shrinkFromR, this.nextRadius, t);
        this.cx = lerp(this._shrinkFromX, this.nextCx, t);
        this.cy = lerp(this._shrinkFromY, this.nextCy, t);
      }
      return null; // no phase change
    }

    switch (this.phase) {
      case 'safe': this._enterWarning(now); return 'warning';
      case 'warning': this._enterShrinking(now); return 'shrinking';
      case 'shrinking': this._enterHold(now); return 'hold';
      default: this._enterSafe(now); return 'safe';
    }
  }

  _enterSafe(now) {
    this.phase = 'safe';
    this.cx = this.mapWidth / 2;
    this.cy = this.mapHeight / 2;
    this.radius = this.maxRadius;
    this.nextCx = this.cx;
    this.nextCy = this.cy;
    this.nextRadius = this.maxRadius;
    this.phaseUntil = now + this.durSafe;
  }

  _enterWarning(now) {
    this.phase = 'warning';
    // Pick the next circle: smaller radius, center kept fully inside the arena.
    this.nextRadius = lerp(this.minRadius, this.maxRadius * 0.5, Math.random());
    const r = this.nextRadius;
    this.nextCx = lerp(r, this.mapWidth - r, Math.random());
    this.nextCy = lerp(r, this.mapHeight - r, Math.random());
    this.phaseUntil = now + this.durWarning;
  }

  _enterShrinking(now) {
    this.phase = 'shrinking';
    this._shrinkFromR = this.radius;
    this._shrinkFromX = this.cx;
    this._shrinkFromY = this.cy;
    this._shrinkStart = now;
    this.phaseUntil = now + this.durShrink;
  }

  _enterHold(now) {
    this.phase = 'hold';
    this.radius = this.nextRadius;
    this.cx = this.nextCx;
    this.cy = this.nextCy;
    this.phaseUntil = now + this.durHold;
  }

  /** True during phases where being outside the circle hurts. */
  isDamaging() {
    return this.phase === 'shrinking' || this.phase === 'hold';
  }

  isOutside(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return dx * dx + dy * dy > this.radius * this.radius;
  }

  /** Network payload (host → clients). */
  serialize() {
    return {
      phase: this.phase,
      cx: this.cx, cy: this.cy, radius: this.radius,
      nextCx: this.nextCx, nextCy: this.nextCy, nextRadius: this.nextRadius
    };
  }
}
