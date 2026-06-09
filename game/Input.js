/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const RELEASE_CAST_SKILLS = new Set([
  'sword',
  'bow',
  'spear',
  'greatsword',
  'scythe',
  'matchlock',
  'katana',
  'magicstaff',
  'sniper'
]);

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
    // True while the skill button is held and being dragged as an aim stick.
    this.isSkillAimActive = false;
    this.localWeapon = 'sword';
    this.pointerTargetMode = null;
    // True once any real mouse movement is seen → treat as a desktop/mouse user
    // even if the device also reports touch support (touchscreen laptops etc.).
    this.hasMouseInput = false;

    // Edge-triggered one-shot actions consumed once per frame by the game loop.
    this.dashRequested = false;
    this.dashVector = null;
    this.teleportRequested = false;
    this.teleportUpRequested = false;
    this.skillRequested = false;
    this.skillDownRequested = false;
    this.skillUpRequested = false;
    this.skillHeld = false;
    this.targetCastRequested = false;
    this.targetCastPointer = null;
    this.targetCursorVisibleUntil = 0;
    this.targetCursorVisibleMs = 350;
    this.lastTouchAt = 0;
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
    this._mouseDownHandler = null;
    this._pointerDownHandler = null;
    this._touchStartHandler = null;
    this._touchMoveHandler = null;
    this._touchEndHandler = null;
    this._toggleBtnHandler = null;
    this._dashBtnHandler = null;
    this._skillBtnDownHandler = null;
    this._skillBtnUpHandler = null;
    this._skillBtnCancelHandler = null;
    this._skillBtnClickHandler = null;
    this._skillBtnMoveHandler = null;
    this._altSkillDownHandler = null;
    this._altSkillUpHandler = null;
    this._altSkillCancelHandler = null;
    this._lmbHandler = null;

    // Mobile Virtual Joystick bound entries
    this._leftTouchStart = null;
    this._rightTouchStart = null;
    this._windowTouchMove = null;
    this._windowTouchEnd = null;
    this._windowTouchCancel = null;
    this._leftPointerStart = null;
    this._rightPointerStart = null;
    this._windowPointerMove = null;
    this._windowPointerUp = null;
    this._windowPointerCancel = null;
  }

  setLocalWeapon(weapon) {
    this.localWeapon = weapon || 'sword';
    const overlay = document.getElementById('mobileJoystickOverlay');
    if (overlay) {
      overlay.classList.toggle('sniper-controls', this.localWeapon === 'sniper');
      overlay.classList.toggle('targeting-cast', Boolean(this.pointerTargetMode));
    }
  }

  _skillCastsOnRelease() {
    return RELEASE_CAST_SKILLS.has(this.localWeapon);
  }

  _requestDash(dx = null, dy = null) {
    this.dashRequested = true;
    this.dashVector = Number.isFinite(dx) && Number.isFinite(dy) ? { dx, dy } : null;
  }

  _beginPointerTarget(mode = 'targetCast') {
    this.pointerTargetMode = mode;
    this.setLocalWeapon(this.localWeapon);
  }

  _clearPointerTarget() {
    this.pointerTargetMode = null;
    this.setLocalWeapon(this.localWeapon);
  }

  _queueTargetCastFromClientPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    this.mouse.x = x;
    this.mouse.y = y;
    this.targetCastPointer = { x, y };
    this.targetCastRequested = true;
    this.targetCursorVisibleUntil = Date.now() + this.targetCursorVisibleMs;
    this._clearPointerTarget();
  }

  _markTouchInput() {
    this.lastTouchAt = Date.now();
  }

  _markTouchLikeInput(event = null) {
    if (!event || event.pointerType !== 'mouse') this._markTouchInput();
  }

  _isSyntheticTouchMouseEvent(event = null) {
    return this.joystickEnabled && (
      Boolean(event?.sourceCapabilities?.firesTouchEvents) ||
      Date.now() - this.lastTouchAt < 700
    );
  }

  _isMobileControlTarget(target) {
    return Boolean(target?.closest?.(
      '#mobileJoystickOverlay, #leftJoystickContainer, #rightJoystickContainer, #mobileActionCluster, .mobile-action-btn'
    ));
  }

  _isMobileControlPoint(clientX, clientY) {
    if (!this.joystickEnabled || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const ids = ['leftJoystickContainer', 'rightJoystickContainer', 'skillBtn', 'altSkillBtn', 'lmbBtn', 'dashBtn'];
    return ids.some(id => {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) return false;
      const rect = el.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
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
      if (key === ' ' && !e.repeat) this._requestDash();
      if (key === 'f' && !e.repeat) this._requestSkillDown();
      if (key === 'r' && !e.repeat) this.teleportRequested = true;

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
      if (key === 'r') this.teleportUpRequested = true;
    };

    this._mouseMoveHandler = (e) => {
      if (this._isSyntheticTouchMouseEvent(e)) return;
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

    this._mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      if (this._isSyntheticTouchMouseEvent(e)) return;
      this._queueTargetCastFromClientPoint(canvas, e.clientX, e.clientY);
      this.hasMouseInput = true;
    };

    this._pointerDownHandler = (e) => {
      if (e.pointerType === 'mouse' || !this.pointerTargetMode) return;
      this._markTouchLikeInput(e);
      if (this._isMobileControlTarget(e.target) || this._isMobileControlPoint(e.clientX, e.clientY)) return;
      if (e.cancelable) e.preventDefault();
      this._queueTargetCastFromClientPoint(canvas, e.clientX, e.clientY);
    };

    // Mobile / Tablet General Screen Touch Event Fallbacks
    const handleTargetTouch = (e) => {
      if (!this.pointerTargetMode || !e.touches || e.touches.length === 0) return false;
      this._markTouchInput();
      const touch = e.touches[0];
      if (this._isMobileControlTarget(e.target) || this._isMobileControlPoint(touch.clientX, touch.clientY)) return false;
      if (e.cancelable) e.preventDefault();
      this._queueTargetCastFromClientPoint(canvas, touch.clientX, touch.clientY);
      return true;
    };

    const handleTouch = (e) => {
      this._markTouchInput();
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

    this._touchStartHandler = (e) => {
      if (handleTargetTouch(e)) return;
      handleTouch(e);
    };
    this._touchMoveHandler = (e) => handleTouch(e);
    this._touchEndHandler = (e) => {
      this._markTouchInput();
      if (this.joystickEnabled) return;
      this.keys.w = false;
      this.keys.s = false;
      this.keys.a = false;
      this.keys.d = false;
    };

    document.addEventListener('keydown', this._keyDownHandler);
    document.addEventListener('keyup', this._keyUpHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('mousedown', this._mouseDownHandler);
    canvas.addEventListener('pointerdown', this._pointerDownHandler);

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
        if (e.type === 'touchstart') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation?.();
        this._requestDash();
      };
      dashBtn.addEventListener('touchstart', this._dashBtnHandler, { passive: false });
      dashBtn.addEventListener('click', this._dashBtnHandler);
    }

    const skillBtn = document.getElementById('skillBtn');
    if (skillBtn) {
      // Mobile skill buttons do not own aiming. They fire using the current
      // attack joystick direction so a thumb sliding across the button cannot
      // unexpectedly redirect the shot.
      this._skillBtnDownHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.lastSkillPointerAt = Date.now();
        // Keep receiving move/up even when the finger slides off the small button.
        try { skillBtn.setPointerCapture(e.pointerId); } catch (_) {}
        if (!this._skillCastsOnRelease()) {
          this._requestSkillDown();
        }
      };
      this._skillBtnUpHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.lastSkillPointerAt = Date.now();
        if (this._skillCastsOnRelease()) {
          this._requestSkillTap();
        } else {
          this._requestSkillUp();
        }
      };
      this._skillBtnCancelHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.lastSkillPointerAt = Date.now();
        if (!this._skillCastsOnRelease()) {
          this._requestSkillUp();
        }
      };
      this._skillBtnClickHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (Date.now() - this.lastSkillPointerAt < 450) return;
        if (this._skillCastsOnRelease()) return;
        if (!this.skillHeld) this._requestSkillDown();
      };
      skillBtn.addEventListener('pointerdown', this._skillBtnDownHandler);
      skillBtn.addEventListener('pointerup', this._skillBtnUpHandler);
      skillBtn.addEventListener('pointercancel', this._skillBtnCancelHandler);
      skillBtn.addEventListener('click', this._skillBtnClickHandler);
    }

    // Mobile alt-skill (R) button: down/up for charge-and-release abilities.
    const altSkillBtn = document.getElementById('altSkillBtn');
    if (altSkillBtn) {
      this._altSkillDownHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (this.localWeapon === 'katana') {
          this.teleportRequested = true;
        }
      };
      this._altSkillUpHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (this.localWeapon === 'katana') {
          this.teleportUpRequested = true;
        } else {
          this.teleportRequested = true;
          if (this.localWeapon === 'sniper') this._beginPointerTarget('sniperTeleport');
        }
      };
      this._altSkillCancelHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (this.localWeapon === 'katana') this.teleportUpRequested = true;
      };
      altSkillBtn.addEventListener('pointerdown', this._altSkillDownHandler);
      altSkillBtn.addEventListener('pointerup', this._altSkillUpHandler);
      altSkillBtn.addEventListener('pointercancel', this._altSkillCancelHandler);
    }

    // Mobile cast (LMB) button: arm a target-cast, then let the next arena tap
    // choose the exact world-space point.
    const lmbBtn = document.getElementById('lmbBtn');
    if (lmbBtn) {
      this._lmbHandler = (e) => {
        if (e.pointerType === 'touch') this._markTouchInput();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this._beginPointerTarget('targetCast');
      };
      lmbBtn.addEventListener('pointerdown', this._lmbHandler);
    }

    if (leftContainer && leftKnob && rightContainer && rightKnob) {
      let leftTouchId = null;
      let leftCenter = null;
      let leftDashVector = null;
      let rightTouchId = null;
      let rightCenter = null;

      const beginLeftJoystick = (point, id) => {
        leftTouchId = id;
        const rect = leftContainer.getBoundingClientRect();
        leftCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2
        };
        handleLeftMove(point);
      };

      const beginRightJoystick = (point, id) => {
        rightTouchId = id;
        const rect = rightContainer.getBoundingClientRect();
        rightCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width / 2
        };
        this.isRightJoystickActive = true;
        handleRightMove(point);
      };

      // Left joystick start
      this._leftTouchStart = (e) => {
        if (!this.joystickEnabled) return;
        this._markTouchInput();
        e.preventDefault();
        e.stopPropagation();

        const touch = e.changedTouches[0];
        beginLeftJoystick(touch, touch.identifier);
      };

      this._leftPointerStart = (e) => {
        if (!this.joystickEnabled) return;
        this._markTouchLikeInput(e);
        e.preventDefault();
        e.stopPropagation();
        try { leftContainer.setPointerCapture(e.pointerId); } catch (_) {}
        beginLeftJoystick(e, e.pointerId);
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
        leftDashVector = Math.hypot(nx, ny) > 0.25 ? { dx: nx, dy: ny } : null;

        // Map movement zones with diagonal leeway values
        this.keys.w = ny < -0.3;
        this.keys.s = ny > 0.3;
        this.keys.a = nx < -0.3;
        this.keys.d = nx > 0.3;
      };

      // Right joystick start
      this._rightTouchStart = (e) => {
        if (!this.joystickEnabled) return;
        this._markTouchInput();
        e.preventDefault();
        e.stopPropagation();

        const touch = e.changedTouches[0];
        beginRightJoystick(touch, touch.identifier);
      };

      this._rightPointerStart = (e) => {
        if (!this.joystickEnabled) return;
        this._markTouchLikeInput(e);
        e.preventDefault();
        e.stopPropagation();
        try { rightContainer.setPointerCapture(e.pointerId); } catch (_) {}
        beginRightJoystick(e, e.pointerId);
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
        this._markTouchInput();
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

      this._windowPointerMove = (e) => {
        this._markTouchLikeInput(e);
        if (!this.joystickEnabled) return;
        if (e.pointerId === leftTouchId) {
          handleLeftMove(e);
        } else if (e.pointerId === rightTouchId) {
          handleRightMove(e);
        }
      };

      // Ends and cancellations
      const handleLeftEnd = (releaseDash = true) => {
        if (releaseDash && this.localWeapon === 'sniper' && leftDashVector) {
          this._requestDash(leftDashVector.dx, leftDashVector.dy);
        }
        leftTouchId = null;
        leftDashVector = null;
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
        this._markTouchInput();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === leftTouchId) {
            handleLeftEnd(true);
          } else if (touch.identifier === rightTouchId) {
            handleRightEnd();
          }
        }
      };

      this._windowPointerUp = (e) => {
        this._markTouchLikeInput(e);
        if (e.pointerId === leftTouchId) {
          handleLeftEnd(true);
        } else if (e.pointerId === rightTouchId) {
          handleRightEnd();
        }
      };

      this._windowTouchCancel = (e) => {
        this._markTouchInput();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === leftTouchId) {
            handleLeftEnd(false);
          } else if (touch.identifier === rightTouchId) {
            handleRightEnd();
          }
        }
      };

      this._windowPointerCancel = (e) => {
        this._markTouchLikeInput(e);
        if (e.pointerId === leftTouchId) {
          handleLeftEnd(false);
        } else if (e.pointerId === rightTouchId) {
          handleRightEnd();
        }
      };

      if (window.PointerEvent) {
        leftContainer.addEventListener('pointerdown', this._leftPointerStart);
        rightContainer.addEventListener('pointerdown', this._rightPointerStart);
        window.addEventListener('pointermove', this._windowPointerMove);
        window.addEventListener('pointerup', this._windowPointerUp);
        window.addEventListener('pointercancel', this._windowPointerCancel);
      } else {
        leftContainer.addEventListener('touchstart', this._leftTouchStart, { passive: false });
        rightContainer.addEventListener('touchstart', this._rightTouchStart, { passive: false });
        window.addEventListener('touchmove', this._windowTouchMove, { passive: true });
        window.addEventListener('touchend', this._windowTouchEnd, { passive: true });
        window.addEventListener('touchcancel', this._windowTouchCancel, { passive: true });
      }
    }
  }

  /**
   * Read-and-clear the queued dash request (edge-triggered).
   */
  consumeDash() {
    if (!this.dashRequested) return false;
    const vector = this.dashVector ? { ...this.dashVector } : true;
    this.dashRequested = false;
    this.dashVector = null;
    return vector;
  }

  /**
   * Read-and-clear the queued teleport (R) request (edge-triggered).
   */
  consumeTeleport() {
    if (!this.teleportRequested) return false;
    this.teleportRequested = false;
    return true;
  }

  consumeTeleportUp() {
    if (!this.teleportUpRequested) return false;
    this.teleportUpRequested = false;
    return true;
  }

  consumeTargetCast() {
    if (!this.targetCastRequested) return null;
    this.targetCastRequested = false;
    return this.targetCastPointer ? { ...this.targetCastPointer } : null;
  }

  getCursorPos(now = Date.now()) {
    if (this.joystickEnabled && !this.hasMouseInput) {
      if (now > this.targetCursorVisibleUntil) return null;
    }
    return { x: this.mouse.x, y: this.mouse.y };
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

  _requestSkillTap() {
    this.skillRequested = true;
    this.skillDownRequested = true;
    this.skillHeld = false;
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
    // Likewise while the skill button is being used as an aim stick.
    if (this.isSkillAimActive) return;
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
    if (canvas && this._mouseDownHandler) canvas.removeEventListener('mousedown', this._mouseDownHandler);
    if (canvas && this._pointerDownHandler) canvas.removeEventListener('pointerdown', this._pointerDownHandler);
    
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
      if (this._skillBtnMoveHandler) skillBtn.removeEventListener('pointermove', this._skillBtnMoveHandler);
      if (this._skillBtnUpHandler) {
        skillBtn.removeEventListener('pointerup', this._skillBtnUpHandler);
      }
      if (this._skillBtnCancelHandler) skillBtn.removeEventListener('pointercancel', this._skillBtnCancelHandler);
      if (this._skillBtnClickHandler) skillBtn.removeEventListener('click', this._skillBtnClickHandler);
    }

    const altSkillBtn = document.getElementById('altSkillBtn');
    if (altSkillBtn) {
      if (this._altSkillDownHandler) altSkillBtn.removeEventListener('pointerdown', this._altSkillDownHandler);
      if (this._altSkillUpHandler) {
        altSkillBtn.removeEventListener('pointerup', this._altSkillUpHandler);
      }
      if (this._altSkillCancelHandler) altSkillBtn.removeEventListener('pointercancel', this._altSkillCancelHandler);
    }
    const lmbBtn = document.getElementById('lmbBtn');
    if (lmbBtn && this._lmbHandler) lmbBtn.removeEventListener('pointerdown', this._lmbHandler);

    this.dashRequested = false;
    this.dashVector = null;
    this.teleportRequested = false;
    this.teleportUpRequested = false;
    this.skillRequested = false;
    this.skillDownRequested = false;
    this.skillUpRequested = false;
    this.skillHeld = false;
    this.isSkillAimActive = false;
    this.targetCastRequested = false;
    this.targetCastPointer = null;
    this.targetCursorVisibleUntil = 0;
    this.lastTouchAt = 0;
    this.pointerTargetMode = null;

    const leftContainer = document.getElementById('leftJoystickContainer');
    const rightContainer = document.getElementById('rightJoystickContainer');

    if (leftContainer && this._leftTouchStart) {
      leftContainer.removeEventListener('touchstart', this._leftTouchStart);
    }
    if (rightContainer && this._rightTouchStart) {
      rightContainer.removeEventListener('touchstart', this._rightTouchStart);
    }
    if (leftContainer && this._leftPointerStart) {
      leftContainer.removeEventListener('pointerdown', this._leftPointerStart);
    }
    if (rightContainer && this._rightPointerStart) {
      rightContainer.removeEventListener('pointerdown', this._rightPointerStart);
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
    if (this._windowPointerMove) {
      window.removeEventListener('pointermove', this._windowPointerMove);
    }
    if (this._windowPointerUp) {
      window.removeEventListener('pointerup', this._windowPointerUp);
    }
    if (this._windowPointerCancel) {
      window.removeEventListener('pointercancel', this._windowPointerCancel);
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
