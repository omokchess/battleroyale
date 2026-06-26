/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Host-owned 2D battle-royale pressure for the platformer pivot.
 *
 * Instead of a top-down shrinking circle, the danger rises from the bottom and,
 * on later cycles, squeezes the playable box from both sides. Contact is lethal;
 * the existing death/respawn loop handles the rest.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class PlatformerZone {
  constructor(mapWidth, mapHeight, arenaSize = 'tiny') {
    this.kind = 'platformer_rise';
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.arenaSize = arenaSize;

    const spanK = Math.max(1, Math.sqrt(Math.max(mapWidth, mapHeight) / 980));
    this.durSafe = 9000;
    this.durWarning = 4500;
    this.durShrink = Math.round(9000 * spanK);
    this.durHold = 7000;

    this.startFloorY = mapHeight + 96;
    this.minFloorY = Math.max(140, mapHeight * 0.18);
    this.maxSideInset = mapWidth * 0.16;

    this.phase = 'safe';
    this.phaseUntil = 0;
    this.cycle = 0;

    this.floorY = this.startFloorY;
    this.nextFloorY = this.startFloorY;
    this.leftX = 0;
    this.rightX = mapWidth;
    this.nextLeftX = 0;
    this.nextRightX = mapWidth;

    this._fromFloorY = this.floorY;
    this._fromLeftX = this.leftX;
    this._fromRightX = this.rightX;
    this._shrinkStart = 0;
  }

  update(now) {
    if (!this.phaseUntil) this._enterSafe(now);

    if (now < this.phaseUntil) {
      if (this.phase === 'shrinking') {
        const t = easeInOut(clamp01((now - this._shrinkStart) / this.durShrink));
        this.floorY = lerp(this._fromFloorY, this.nextFloorY, t);
        this.leftX = lerp(this._fromLeftX, this.nextLeftX, t);
        this.rightX = lerp(this._fromRightX, this.nextRightX, t);
      }
      return null;
    }

    switch (this.phase) {
      case 'safe': this._enterWarning(now); return 'warning';
      case 'warning': this._enterShrinking(now); return 'shrinking';
      case 'shrinking': this._enterHold(now); return 'hold';
      default: this._enterSafe(now); return 'safe';
    }
  }

  _enterSafe(now) {
    if (this.floorY <= this.minFloorY + 2 && this.phase === 'hold') {
      this.cycle = 0;
      this.floorY = this.startFloorY;
      this.leftX = 0;
      this.rightX = this.mapWidth;
    }
    this.phase = 'safe';
    this.nextFloorY = this.floorY;
    this.nextLeftX = this.leftX;
    this.nextRightX = this.rightX;
    this.phaseUntil = now + this.durSafe;
  }

  _enterWarning(now) {
    this.phase = 'warning';
    const climb = this.mapHeight * 0.17;
    this.nextFloorY = Math.max(this.minFloorY, this.floorY - climb);

    const sideStep = this.cycle >= 1 ? this.mapWidth * 0.035 : 0;
    this.nextLeftX = Math.min(this.maxSideInset, this.leftX + sideStep);
    this.nextRightX = Math.max(this.mapWidth - this.maxSideInset, this.rightX - sideStep);
    this.phaseUntil = now + this.durWarning;
  }

  _enterShrinking(now) {
    this.phase = 'shrinking';
    this._fromFloorY = this.floorY;
    this._fromLeftX = this.leftX;
    this._fromRightX = this.rightX;
    this._shrinkStart = now;
    this.phaseUntil = now + this.durShrink;
  }

  _enterHold(now) {
    this.phase = 'hold';
    this.floorY = this.nextFloorY;
    this.leftX = this.nextLeftX;
    this.rightX = this.nextRightX;
    this.cycle += 1;
    this.phaseUntil = now + this.durHold;
  }

  isDamaging() {
    return this.phase === 'shrinking' || this.phase === 'hold';
  }

  isOutside(x, y) {
    return y >= this.floorY || x <= this.leftX || x >= this.rightX;
  }

  serialize() {
    return {
      kind: this.kind,
      phase: this.phase,
      floorY: this.floorY,
      nextFloorY: this.nextFloorY,
      leftX: this.leftX,
      rightX: this.rightX,
      nextLeftX: this.nextLeftX,
      nextRightX: this.nextRightX,
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight
    };
  }
}
