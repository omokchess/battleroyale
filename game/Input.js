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
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };

    this.aimAngle = 0;
    this.isRightJoystickActive = false;

    // Edge-triggered one-shot actions consumed once per frame by the game loop.
    this.dashRequested = false;
    this.skillRequested = false;

    // Detect if device is touch-capable or loaded from stored preference
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    let storedPref = null;
    try {
      storedPref = localStorage.getItem('joystick_enabled');
    } catch (e) {
      console.warn('localStorage is blocked or unavailable in this sandbox environment.', e);
    }
    this.joystickEnabled = storedPref !== null ? storedPref === 'true' : hasTouch;

    // Bound listeners for cleanup removal
    this._keyDownHandler = null;
    this._keyUpHandler = null;
    this._mouseMoveHandler = null;
    this._touchStartHandler = null;
    this._touchMoveHandler = null;
    this._touchEndHandler = null;
    this._toggleBtnHandler = null;
    this._dashBtnHandler = null;
    this._skillBtnHandler = null;

    // Mobile Virtual Joystick bound entries
    this._leftTouchStart = null;
    this._rightTouchStart = null;
    this._windowTouchMove = null;
    this._windowTouchEnd = null;
    this._windowTouchCancel = null;
  }

  /**
   * Bind event handles to document and viewport canvas
   */
  setupListeners(canvas) {
    // Seed the pointer at the center of the *drawing buffer* so the first
    // aim frame is sane before any pointer move arrives.
    this.mouse.x = canvas.width / 2;
    this.mouse.y = canvas.height / 2;

    this._keyDownHandler = (e) => {
      // Toggle movement keys
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') this.keys.w = true;
      if (key === 's' || e.key === 'ArrowDown') this.keys.s = true;
      if (key === 'a' || e.key === 'ArrowLeft') this.keys.a = true;
      if (key === 'd' || e.key === 'ArrowRight') this.keys.d = true;

      // Space = dash, F = weapon skill (edge-triggered, ignore auto-repeat)
      if (key === ' ' && !e.repeat) this.dashRequested = true;
      if (key === 'f' && !e.repeat) this.skillRequested = true;

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
      // Map CSS pixels onto the canvas drawing buffer. When the buffer and the
      // displayed size differ (high-DPI phones, scaled canvases) this scaling is
      // what keeps aim — and therefore firing — correct across resolutions.
      const scaleX = rect.width ? canvas.width / rect.width : 1;
      const scaleY = rect.height ? canvas.height / rect.height : 1;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;

      // Calculate directional radians from player center (canvas center) as fallback
      const centerY = canvas.height / 2;
      const centerX = canvas.width / 2;

      this.aimAngle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);
    };

    // Mobile / Tablet General Screen Touch Event Fallbacks
    const handleTouch = (e) => {
      if (this.joystickEnabled) return; // If dedicated joysticks overlay is armed, bypass general touchscreen drag movement
      if (!e.touches || e.touches.length === 0) return;
      
      // Prevent scrolling and double-tap zoom defaults on active canvas area
      e.cancelable && e.preventDefault();

      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width ? canvas.width / rect.width : 1;
      const scaleY = rect.height ? canvas.height / rect.height : 1;
      this.mouse.x = (touch.clientX - rect.left) * scaleX;
      this.mouse.y = (touch.clientY - rect.top) * scaleY;

      // Direct movement towards touch coordinate from center
      const centerY = canvas.height / 2;
      const centerX = canvas.width / 2;
      
      const dx = this.mouse.x - centerX;
      const dy = this.mouse.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      this.aimAngle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);

      // If touched sufficiently far from center, trigger movement
      if (dist > 18) {
        this.keys.w = dy < -12;
        this.keys.s = dy > 12;
        this.keys.a = dx < -12;
        this.keys.d = dx > 12;
      } else {
        this.keys.w = false;
        this.keys.s = false;
        this.keys.a = false;
        this.keys.d = false;
      }
    };

    this._touchStartHandler = (e) => handleTouch(e);
    this._touchMoveHandler = (e) => handleTouch(e);
    this._touchEndHandler = (e) => {
      if (this.joystickEnabled) return;
      this.keys.w = false;
      this.keys.s = false;
      this.keys.a = false;
      this.keys.d = false;
    };

    document.addEventListener('keydown', this._keyDownHandler);
    document.addEventListener('keyup', this._keyUpHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);

    // Passive parameters set for better scroll safety
    canvas.addEventListener('touchstart', this._touchStartHandler, { passive: false });
    canvas.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
    canvas.addEventListener('touchend', this._touchEndHandler, { passive: true });

    // --- MOBILE VIRTUAL JOYSTICKS INTEGRATION ---
    const leftContainer = document.getElementById('leftJoystickContainer');
    const leftKnob = document.getElementById('leftJoystickKnob');
    const rightContainer = document.getElementById('rightJoystickContainer');
    const rightKnob = document.getElementById('rightJoystickKnob');
    const joystickOverlay = document.getElementById('mobileJoystickOverlay');

    if (joystickOverlay) {
      if (this.joystickEnabled) {
        joystickOverlay.classList.remove('hidden');
      } else {
        joystickOverlay.classList.add('hidden');
      }
    }

    // Configure HUD controller toggle button
    const toggleBtn = document.getElementById('toggleControlsBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = `<span>🎮 조이스틱 ${this.joystickEnabled ? 'ON' : 'OFF'}</span>`;
      
      this._toggleBtnHandler = () => {
        this.joystickEnabled = !this.joystickEnabled;
        try {
          localStorage.setItem('joystick_enabled', this.joystickEnabled ? 'true' : 'false');
        } catch (e) {}
        
        const joyOverlay = document.getElementById('mobileJoystickOverlay');
        if (joyOverlay) {
          if (this.joystickEnabled) {
            joyOverlay.classList.remove('hidden');
          } else {
            joyOverlay.classList.add('hidden');
          }
        }
        toggleBtn.innerHTML = `<span>🎮 조이스틱 ${this.joystickEnabled ? 'ON' : 'OFF'}</span>`;
      };
      
      toggleBtn.addEventListener('click', this._toggleBtnHandler);
    }

    // On-screen action buttons (mobile): dash + weapon skill.
    const dashBtn = document.getElementById('dashBtn');
    if (dashBtn) {
      this._dashBtnHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        this.dashRequested = true;
      };
      dashBtn.addEventListener('touchstart', this._dashBtnHandler, { passive: false });
      dashBtn.addEventListener('click', this._dashBtnHandler);
    }

    const skillBtn = document.getElementById('skillBtn');
    if (skillBtn) {
      this._skillBtnHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        this.skillRequested = true;
      };
      skillBtn.addEventListener('touchstart', this._skillBtnHandler, { passive: false });
      skillBtn.addEventListener('click', this._skillBtnHandler);
    }

    if (leftContainer && leftKnob && rightContainer && rightKnob) {
      let leftTouchId = null;
      let leftCenter = null;
      let rightTouchId = null;
      let rightCenter = null;

      // Left joystick start
      this._leftTouchStart = (e) => {
        if (!this.joystickEnabled) return;
        e.preventDefault();
        
        const touch = e.changedTouches[0];
        leftTouchId = touch.identifier;
        
        const rect = leftContainer.getBoundingClientRect();
        leftCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2
        };

        handleLeftMove(touch);
      };

      const handleLeftMove = (touch) => {
        if (!leftCenter) return;
        const dx = touch.clientX - leftCenter.x;
        const dy = touch.clientY - leftCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cap = leftCenter.radius * 0.8;

        let targetX = dx;
        let targetY = dy;
        if (dist > cap) {
          targetX = (dx / dist) * cap;
          targetY = (dy / dist) * cap;
        }

        leftKnob.style.transform = `translate(${targetX}px, ${targetY}px)`;

        // Calculate normalized direction vector
        const nx = targetX / cap;
        const ny = targetY / cap;

        // Map movement zones with diagonal leeway values
        this.keys.w = ny < -0.3;
        this.keys.s = ny > 0.3;
        this.keys.a = nx < -0.3;
        this.keys.d = nx > 0.3;
      };

      // Right joystick start
      this._rightTouchStart = (e) => {
        if (!this.joystickEnabled) return;
        e.preventDefault();
        
        const touch = e.changedTouches[0];
        rightTouchId = touch.identifier;
        
        const rect = rightContainer.getBoundingClientRect();
        rightCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2
        };
        this.isRightJoystickActive = true;

        handleRightMove(touch);
      };

      const handleRightMove = (touch) => {
        if (!rightCenter) return;
        const dx = touch.clientX - rightCenter.x;
        const dy = touch.clientY - rightCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cap = rightCenter.radius * 0.8;

        let targetX = dx;
        let targetY = dy;
        if (dist > cap) {
          targetX = (dx / dist) * cap;
          targetY = (dy / dist) * cap;
        }

        rightKnob.style.transform = `translate(${targetX}px, ${targetY}px)`;

        // Map aim angle based on direction
        if (dist > 5) {
          this.aimAngle = Math.atan2(dy, dx);
        }
      };

      // Window move tracking across all active points to prevent drift drops
      this._windowTouchMove = (e) => {
        if (!this.joystickEnabled) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === leftTouchId) {
            handleLeftMove(touch);
          } else if (touch.identifier === rightTouchId) {
            handleRightMove(touch);
          }
        }
      };

      // Ends and cancellations
      const handleLeftEnd = () => {
        leftTouchId = null;
        leftKnob.style.transform = 'translate(0px, 0px)';
        this.keys.w = false;
        this.keys.s = false;
        this.keys.a = false;
        this.keys.d = false;
      };

      const handleRightEnd = () => {
        rightTouchId = null;
        this.isRightJoystickActive = false;
        rightKnob.style.transform = 'translate(0px, 0px)';
      };

      this._windowTouchEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === leftTouchId) {
            handleLeftEnd();
          } else if (touch.identifier === rightTouchId) {
            handleRightEnd();
          }
        }
      };

      this._windowTouchCancel = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === leftTouchId) {
            handleLeftEnd();
          } else if (touch.identifier === rightTouchId) {
            handleRightEnd();
          }
        }
      };

      leftContainer.addEventListener('touchstart', this._leftTouchStart, { passive: false });
      rightContainer.addEventListener('touchstart', this._rightTouchStart, { passive: false });
      window.addEventListener('touchmove', this._windowTouchMove, { passive: true });
      window.addEventListener('touchend', this._windowTouchEnd, { passive: true });
      window.addEventListener('touchcancel', this._windowTouchCancel, { passive: true });
    }
  }

  /**
   * Read-and-clear the queued dash request (edge-triggered).
   */
  consumeDash() {
    if (!this.dashRequested) return false;
    this.dashRequested = false;
    return true;
  }

  /**
   * Read-and-clear the queued skill request (edge-triggered).
   */
  consumeSkill() {
    if (!this.skillRequested) return false;
    this.skillRequested = false;
    return true;
  }

  /**
   * Movement direction vector implied by the currently held keys.
   */
  getMoveVector() {
    let dx = 0;
    let dy = 0;
    if (this.keys.w || this.keys.ArrowUp) dy -= 1;
    if (this.keys.s || this.keys.ArrowDown) dy += 1;
    if (this.keys.a || this.keys.ArrowLeft) dx -= 1;
    if (this.keys.d || this.keys.ArrowRight) dx += 1;
    return { dx, dy };
  }

  /**
   * Dynamically calibrate aim angle taking clamping boundaries & active camera offsets into consideration
   */
  updateAimAngle(player, camera, canvasWidth, canvasHeight) {
    if (this.isRightJoystickActive) {
      // Aim angle is authoritatively governed by the virtual right joystick slider
      return;
    }
    if (!player || !camera) return;
    const screenPos = camera.toScreen(player.x, player.y, canvasWidth, canvasHeight);
    
    // Calculate accurate direction from player's exact screen coordinate to current mouse cursor
    this.aimAngle = Math.atan2(this.mouse.y - screenPos.y, this.mouse.x - screenPos.x);
  }

  /**
   * Safe removal of handlers preventing memory leakage
   */
  cleanUp(canvas) {
    if (this._keyDownHandler) document.removeEventListener('keydown', this._keyDownHandler);
    if (this._keyUpHandler) document.removeEventListener('keyup', this._keyUpHandler);
    if (canvas && this._mouseMoveHandler) canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    
    if (canvas && this._touchStartHandler) canvas.removeEventListener('touchstart', this._touchStartHandler);
    if (canvas && this._touchMoveHandler) canvas.removeEventListener('touchmove', this._touchMoveHandler);
    if (canvas && this._touchEndHandler) canvas.removeEventListener('touchend', this._touchEndHandler);

    const toggleBtn = document.getElementById('toggleControlsBtn');
    if (toggleBtn && this._toggleBtnHandler) {
      toggleBtn.removeEventListener('click', this._toggleBtnHandler);
    }

    const dashBtn = document.getElementById('dashBtn');
    if (dashBtn && this._dashBtnHandler) {
      dashBtn.removeEventListener('touchstart', this._dashBtnHandler);
      dashBtn.removeEventListener('click', this._dashBtnHandler);
    }

    const skillBtn = document.getElementById('skillBtn');
    if (skillBtn && this._skillBtnHandler) {
      skillBtn.removeEventListener('touchstart', this._skillBtnHandler);
      skillBtn.removeEventListener('click', this._skillBtnHandler);
    }

    this.dashRequested = false;
    this.skillRequested = false;

    const leftContainer = document.getElementById('leftJoystickContainer');
    const rightContainer = document.getElementById('rightJoystickContainer');

    if (leftContainer && this._leftTouchStart) {
      leftContainer.removeEventListener('touchstart', this._leftTouchStart);
    }
    if (rightContainer && this._rightTouchStart) {
      rightContainer.removeEventListener('touchstart', this._rightTouchStart);
    }
    if (this._windowTouchMove) {
      window.removeEventListener('touchmove', this._windowTouchMove);
    }
    if (this._windowTouchEnd) {
      window.removeEventListener('touchend', this._windowTouchEnd);
    }
    if (this._windowTouchCancel) {
      window.removeEventListener('touchcancel', this._windowTouchCancel);
    }

    const joystickOverlay = document.getElementById('mobileJoystickOverlay');
    if (joystickOverlay) {
      joystickOverlay.classList.add('hidden');
    }

    this.keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  }
}
