/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class Input {
  constructor() {
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false
    };

    this.mouse = {
      x: 0,
      y: 0
    };

    this.aimAngle = 0;

    // Bound listeners for cleanup removal
    this._keyDownHandler = null;
    this._keyUpHandler = null;
    this._mouseMoveHandler = null;
  }

  /**
   * Bind event handles to document and viewport canvas
   */
  setupListeners(canvas) {
    this._keyDownHandler = (e) => {
      // Toggle movement keys
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') this.keys.w = true;
      if (key === 's' || e.key === 'ArrowDown') this.keys.s = true;
      if (key === 'a' || e.key === 'ArrowLeft') this.keys.a = true;
      if (key === 'd' || e.key === 'ArrowRight') this.keys.d = true;

      // Prevent scrolling behaviors on gaming buttons
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    this._keyUpHandler = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') this.keys.w = false;
      if (key === 's' || e.key === 'ArrowDown') this.keys.s = false;
      if (key === 'a' || e.key === 'ArrowLeft') this.keys.a = false;
      if (key === 'd' || e.key === 'ArrowRight') this.keys.d = false;
    };

    this._mouseMoveHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;

      // Calculate directional radians from player center (canvas center)
      const centerY = canvas.height / 2;
      const centerX = canvas.width / 2;
      
      this.aimAngle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);
    };

    document.addEventListener('keydown', this._keyDownHandler);
    document.addEventListener('keyup', this._keyUpHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
  }

  /**
   * Safe removal of handlers preventing memory leakage
   */
  cleanUp(canvas) {
    if (this._keyDownHandler) document.removeEventListener('keydown', this._keyDownHandler);
    if (this._keyUpHandler) document.removeEventListener('keyup', this._keyUpHandler);
    if (canvas && this._mouseMoveHandler) canvas.removeEventListener('mousemove', this._mouseMoveHandler);

    this.keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  }
}
