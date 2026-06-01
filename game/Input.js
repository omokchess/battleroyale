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
    // True once any real mouse movement is seen → treat as a desktop/mouse user
    // even if the device also reports touch support (touchscreen laptops etc.).
    this.hasMouseInput = false;

    // Edge-triggered one-shot actions consumed once per frame by the game loop.
    this.dashRequested = false;
    this.skillRequested = false;
    this.skillDownRequested = false;
    this.skillUpRequested = false;
    this.skillHeld = false;
    this.lastSkillPointerAt = 0;

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
    this._skillBtnDownHandler = null;
    this._skillBtnUpHandler = null;
    this._skillBtnClickHandler = null;

    // Mobile Virtual Joystick bound entries
    this._leftTouchStart = null;
    this._rightTouchStart = null;
    this._windowTouchMove = null;
    this._windowTouchEnd = null;
    this._windowTouchCancel = null;
  }

  _renderJoystickToggleLabel() {
    return `
      <span class="inline-flex items-center gap-1">
        <svg class="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 12h4" />
          <path d="M8 10v4" />
          <path d="M15 13h.01" />
          <path d="M18 11h.01" />
          <path d="M5.5 8h13a3 3 0 0 1 2.9 3.8l-1.1 4.2a3 3 0 0 1-5 1.3L14 16H10l-1.3 1.3a3 3 0 0 1-5-1.3l-1.1-4.2A3 3 0 0 1 5.5 8z" />
        </svg>
        <span>조이스틱 ${this.joystickEnabled ? 'ON' : 'OFF'}</span>
      </span>
    `;
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
      if (key === 'f' && !e.repeat) this._requestSkillDown();

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
      if (key === 'f') this._requestSkillUp();
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
      this.hasMouseInput = true;
      // Angle is computed in updateAimAngle() each frame — do NOT compute it
      // here. Computing from canvas center here would fight with the correct
      // player→mouse calculation and cause visible aim jitter.
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

      // Single-touch fallback movement: move toward touch from canvas center.
      // Angle is computed in updateAimAngle() each frame — not here.
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const dx = this.mouse.x - centerX;
      const dy = this.mouse.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

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
      toggleBtn.innerHTML = this._renderJoystickToggleLabel();

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
        toggleBtn.innerHTML = this._renderJoystickToggleLabel();
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
      this._skillBtnDownHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        this.lastSkillPointerAt = Date.now();
        this._requestSkillDown();
      };
      this._skillBtnUpHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        this.lastSkillPointerAt = Date.now();
        this._requestSkillUp();
      };
      this._skillBtnClickHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        if (Date.now() - this.lastSkillPointerAt < 450) return;
        if (!this.skillHeld) this._requestSkillDown();
      };
      skillBtn.addEventListener('pointerdown', this._skillBtnDownHandler);
      skillBtn.addEventListener('pointerup', this._skillBtnUpHandler);
      skillBtn.addEventListener('pointercancel', this._skillBtnUpHandler);
      skillBtn.addEventListener('pointerleave', this._skillBtnUpHandler);
      skillBtn.addEventListener('click', this._skillBtnClickHandler);
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

  consumeSkillDown() {
    if (!this.skillDownRequested) return false;
    this.skillDownRequested = false;
    return true;
  }

  consumeSkillUp() {
    if (!this.skillUpRequested) return false;
    this.skillUpRequested = false;
    return true;
  }

  _requestSkillDown() {
    this.skillRequested = true;
    this.skillDownRequested = true;
    this.skillHeld = true;
  }

  _requestSkillUp() {
    if (!this.skillHeld && !this.skillDownRequested) return;
    this.skillHeld = false;
    this.skillUpRequested = true;
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
  updateAimAngle(player, camera, canvasWidth, canvasHeight, mapWidth = 0, mapHeight = 0) {
    // While actively dragging the right joystick, it owns the aim.
    if (this.isRightJoystickActive) return;
    // Pure touch mode (joystick enabled AND no mouse ever used): hold the last
    // angle so releasing the joystick doesn't snap aim to a stale mouse pos.
    // As soon as a real mouse move is seen we always aim at the cursor, even on
    // touch-capable PCs where joystickEnabled may have been auto-set.
    if (this.joystickEnabled && !this.hasMouseInput) return;
    if (!player || !camera) return;

    const screenPos = camera.toScreen(player.x, player.y, canvasWidth, canvasHeight);
    const dx = this.mouse.x - screenPos.x;
    const dy = this.mouse.y - screenPos.y;

    // Direct player → cursor angle. No deadzone — the cursor crosshair is the
    // aim indicator, so it must always track the mouse exactly.
    if (dx === 0 && dy === 0) return; // cursor exactly on player: hold last angle
    this.aimAngle = Math.atan2(dy, dx);
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
    if (skillBtn) {
      if (this._skillBtnDownHandler) skillBtn.removeEventListener('pointerdown', this._skillBtnDownHandler);
      if (this._skillBtnUpHandler) {
        skillBtn.removeEventListener('pointerup', this._skillBtnUpHandler);
        skillBtn.removeEventListener('pointercancel', this._skillBtnUpHandler);
        skillBtn.removeEventListener('pointerleave', this._skillBtnUpHandler);
      }
      if (this._skillBtnClickHandler) skillBtn.removeEventListener('click', this._skillBtnClickHandler);
    }

    this.dashRequested = false;
    this.skillRequested = false;
    this.skillDownRequested = false;
    this.skillUpRequested = false;
    this.skillHeld = false;

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

export function resolvePointerAimAngle(
  player,
  camera,
  pointer,
  canvasWidth,
  canvasHeight,
  mapWidth = 0,
  mapHeight = 0,
  fallbackAngle = 0
) {
  if (!player || !camera || !pointer) return normalizeFallbackAngle(fallbackAngle);

  const screenPos = camera.toScreen(player.x, player.y, canvasWidth, canvasHeight);
  const fallback = Math.atan2(pointer.y - screenPos.y, pointer.x - screenPos.x);
  const safeFallback = Number.isFinite(fallback) ? fallback : normalizeFallbackAngle(fallbackAngle);

  if (!mapWidth || !mapHeight || typeof camera.toWorld !== 'function') {
    return safeFallback;
  }

  const pointerWorld = camera.toWorld(pointer.x, pointer.y, canvasWidth, canvasHeight);
  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;
  const dirXRaw = pointerWorld.x - centerX;
  const dirYRaw = pointerWorld.y - centerY;
  const dirLen = Math.hypot(dirXRaw, dirYRaw);

  // When the pointer is effectively at arena center there is no direction to
  // project. Keep the previous aim instead of snapping toward the map center.
  if (dirLen < 0.001) {
    return normalizeFallbackAngle(fallbackAngle);
  }

  const dirX = dirXRaw / dirLen;
  const dirY = dirYRaw / dirLen;
  const wallDist = rayToMapWallDistance(centerX, centerY, dirX, dirY, mapWidth, mapHeight);
  if (!Number.isFinite(wallDist)) return safeFallback;

  const targetX = Math.max(0, Math.min(mapWidth, centerX + dirX * wallDist));
  const targetY = Math.max(0, Math.min(mapHeight, centerY + dirY * wallDist));
  const angle = Math.atan2(targetY - player.y, targetX - player.x);
  return Number.isFinite(angle) ? angle : safeFallback;
}

function normalizeFallbackAngle(angle) {
  return Number.isFinite(angle) ? angle : 0;
}

function rayToMapWallDistance(x, y, dirX, dirY, mapWidth, mapHeight) {
  const candidates = [];
  if (dirX > 0) candidates.push((mapWidth - x) / dirX);
  if (dirX < 0) candidates.push((0 - x) / dirX);
  if (dirY > 0) candidates.push((mapHeight - y) / dirY);
  if (dirY < 0) candidates.push((0 - y) / dirY);
  return Math.min(...candidates.filter(v => Number.isFinite(v) && v >= 0));
}
