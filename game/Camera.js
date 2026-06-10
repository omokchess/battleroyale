/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Reference arena edge (the "tiny" preset). The tracking zoom is the zoom that
// fits a REF-sized arena on screen, so larger maps are viewed through a
// tiny-arena-sized window around the player. Keeping this equal to the tiny
// preset makes the tiny arena render identically to the legacy full-map view.
const REF_ARENA = 700;
const VIEW_PADDING = 60;

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
    this.screenOffsetY = 0;

    // True when the map is too large to fit, so we follow the local player.
    // Minimap / off-screen indicators only render in this mode.
    this.tracking = false;

    // Lerping inertia (0.1 means 10% movement per frame leading to very smooth chase)
    this.lerpSpeed = 0.12;
  }

  /**
   * Move the camera toward its focus with smooth inertia.
   *
   * Auto mode:
   *  - If the whole map fits at >= the tracking zoom, keep the legacy centered
   *    full-map view (focus = map center). The tiny arena lands here exactly,
   *    so it renders identically to before.
   *  - Otherwise track the local player (targetX/targetY), clamped so the
   *    viewport never reveals past the map edges.
   *
   * During death the caller keeps passing the (frozen) death position, so the
   * camera naturally holds there and lerps back on respawn.
   */
  update(targetX, targetY, viewportWidth, viewportHeight, mapWidth, mapHeight) {
    const isMobilePortrait = (() => {
      if (typeof window === 'undefined') return false;
      const cssWidth = window.visualViewport?.width || window.innerWidth || viewportWidth;
      return cssWidth <= 640 && viewportHeight > viewportWidth * 1.1;
    })();
    const topReserve = isMobilePortrait ? Math.min(viewportHeight * 0.12, viewportWidth * 0.3) : 0;
    const bottomReserve = isMobilePortrait ? Math.min(viewportHeight * 0.24, viewportWidth * 0.46) : 0;
    const usableHeight = Math.max(1, viewportHeight - topReserve - bottomReserve);
    this.screenOffsetY = isMobilePortrait ? (topReserve - bottomReserve) / 2 : 0;

    const clampZoom = (z) => Math.max(0.1, Math.min(2.5, z));
    // Zoom that fits the entire map into the usable play area (legacy view).
    const fitZoom = clampZoom(Math.min(
      viewportWidth / (mapWidth + VIEW_PADDING),
      usableHeight / (mapHeight + VIEW_PADDING)
    ));
    // Zoom that fits a reference (tiny) arena — the tracking window size.
    const trackZoom = clampZoom(
      Math.min(viewportWidth, usableHeight) / (REF_ARENA + VIEW_PADDING)
    );

    this.tracking = fitZoom < trackZoom - 1e-3;
    this.zoom = this.tracking ? trackZoom : fitZoom;

    let focusX = mapWidth / 2;
    let focusY = mapHeight / 2;
    if (this.tracking) {
      // Half-extents of the viewport in world units (Y accounts for the mobile
      // reserve offset so reserved bands never expose out-of-map area).
      const halfW = viewportWidth / (2 * this.zoom);
      const halfTop = (viewportHeight / 2 + this.screenOffsetY) / this.zoom;
      const halfBot = (viewportHeight / 2 - this.screenOffsetY) / this.zoom;
      focusX = clampRange(targetX, halfW, mapWidth - halfW, mapWidth / 2);
      focusY = clampRange(targetY, halfTop, mapHeight - halfBot, mapHeight / 2);
    }

    // Apply linear interpolation (preserves the existing chase inertia).
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
      y: (worldY - this.y) * this.zoom + viewportHeight / 2 + this.screenOffsetY
    };
  }

  /**
   * Map screen coordinates back to absolute coordinates taking Zoom factor into consideration
   */
  toWorld(screenX, screenY, viewportWidth, viewportHeight) {
    return {
      x: (screenX - viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - viewportHeight / 2 - this.screenOffsetY) / this.zoom + this.y
    };
  }
}

// Clamp v into [lo, hi]; if the range is inverted (map smaller than the
// viewport on that axis) fall back to the centered value instead.
function clampRange(v, lo, hi, mid) {
  if (lo > hi) return mid;
  return Math.max(lo, Math.min(hi, v));
}
