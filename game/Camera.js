/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    
    // Lerping inertia (0.1 means 10% movement per frame leading to very smooth chase)
    this.lerpSpeed = 0.12;
  }

  /**
   * Smoothly move camera towards local player
   */
  update(targetX, targetY, viewportWidth, viewportHeight, mapWidth, mapHeight) {
    // Ideal focus coordinate
    let focusX = targetX;
    let focusY = targetY;

    // Boundary constraints: clamping so coordinate frame doesn't render beyond map bounds
    const halfWidth = viewportWidth / 2;
    const halfHeight = viewportHeight / 2;

    if (mapWidth > viewportWidth) {
      if (focusX < halfWidth) focusX = halfWidth;
      else if (focusX > mapWidth - halfWidth) focusX = mapWidth - halfWidth;
    } else {
      focusX = mapWidth / 2;
    }

    if (mapHeight > viewportHeight) {
      if (focusY < halfHeight) focusY = halfHeight;
      else if (focusY > mapHeight - halfHeight) focusY = mapHeight - halfHeight;
    } else {
      focusY = mapHeight / 2;
    }

    // Apply linear interpolation
    this.x += (focusX - this.x) * this.lerpSpeed;
    this.y += (focusY - this.y) * this.lerpSpeed;
  }

  /**
   * Map absolute coords to relative viewport coords
   */
  toScreen(worldX, worldY, viewportWidth, viewportHeight) {
    return {
      x: worldX - this.x + viewportWidth / 2,
      y: worldY - this.y + viewportHeight / 2
    };
  }

  /**
   * Map screen coordinates back to absolute coordinates (useful for mouse target checks)
   */
  toWorld(screenX, screenY, viewportWidth, viewportHeight) {
    return {
      x: screenX + this.x - viewportWidth / 2,
      y: screenY + this.y - viewportHeight / 2
    };
  }
}
