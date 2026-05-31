/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1.0;
    this.shakeStart = 0;
    this.shakeEnd = 0;
    this.shakeMagnitude = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;

    // Lerping inertia (0.1 means 10% movement per frame leading to very smooth chase)
    this.lerpSpeed = 0.12;
  }

  /**
   * Smoothly move camera towards map center with scaling zoom so the entire map is visible
   */
  update(targetX, targetY, viewportWidth, viewportHeight, mapWidth, mapHeight) {
    // Keep camera centered at the map's absolute midpoint
    const focusX = mapWidth / 2;
    const focusY = mapHeight / 2;

    // Calculate dynamic zoom to perfectly fit the entire map (with clean margins/padding) inside the window
    const padding = 60;
    this.zoom = Math.min(viewportWidth / (mapWidth + padding), viewportHeight / (mapHeight + padding));
    // Clamp zoom factor between sensible boundaries to prevent extreme rendering dimensions on tiny screens
    this.zoom = Math.max(0.1, Math.min(2.5, this.zoom));

    // Apply linear interpolation
    this.x += (focusX - this.x) * this.lerpSpeed;
    this.y += (focusY - this.y) * this.lerpSpeed;
  }

  startShake(magnitude = 8, durationMs = 220, now = performance.now()) {
    this.shakeStart = now;
    this.shakeEnd = Math.max(this.shakeEnd, now + durationMs);
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
  }

  getShakeOffset(now = performance.now()) {
    if (now >= this.shakeEnd || this.shakeMagnitude <= 0) {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeMagnitude = 0;
      return { x: 0, y: 0 };
    }

    const duration = Math.max(1, this.shakeEnd - this.shakeStart);
    const progress = Math.max(0, Math.min(1, (now - this.shakeStart) / duration));
    const strength = this.shakeMagnitude * (1 - progress);
    const wobble = now * 0.09;
    this.shakeOffsetX = Math.cos(wobble * 1.7) * strength + Math.sin(wobble * 0.7) * strength * 0.45;
    this.shakeOffsetY = Math.sin(wobble * 1.9) * strength + Math.cos(wobble * 0.8) * strength * 0.45;
    return { x: this.shakeOffsetX, y: this.shakeOffsetY };
  }

  /**
   * Map absolute coords to relative viewport coords taking Zoom factor into consideration
   */
  toScreen(worldX, worldY, viewportWidth, viewportHeight) {
    return {
      x: (worldX - this.x) * this.zoom + viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + viewportHeight / 2
    };
  }

  /**
   * Map screen coordinates back to absolute coordinates taking Zoom factor into consideration
   */
  toWorld(screenX, screenY, viewportWidth, viewportHeight) {
    return {
      x: (screenX - viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - viewportHeight / 2) / this.zoom + this.y
    };
  }
}
