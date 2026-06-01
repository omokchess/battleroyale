/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Player } from './Player.js';
import { Projectile } from './Projectile.js';
import { Collision } from './Collision.js';
import { Camera } from './Camera.js';
import { Input } from './Input.js';
import { Renderer } from './Renderer.js';
import { Weapons, getEffectiveWeapon, SkillConfig, DashConfig, ComboConfig } from './Weapons.js';
import { MsgType, Protocol } from '../multiplayer/Protocol.js';

export class Game {
  constructor(canvas, networkManager) {
    this.canvas = canvas;
    this.networkManager = networkManager;
    
    // Arena Boundaries
    this.mapWidth = 700;
    this.mapHeight = 700;

    this.renderer = new Renderer(canvas);
    this.camera = new Camera();
    this.input = new Input();

    // Game state entities
    this.players = {};
    this.projectiles = [];
    this.pendingSwordWaves = [];
    this.pendingRailguns = [];
    this.pendingSpearThrows = [];
    this.pendingMeleeHits = [];
    this.pendingRapierStrikes = [];
    this.pendingHammerSlams = [];
    this.vibratedRailbeamIds = new Set();
    this.shakenSpearThrowIds = new Set();
    this.effects = []; // Visual overlays: { attackerId, x, y, angle, weapon, type, progress, timestamp }

    // Flags
    this.isRunning = false;
    this.localPlayerId = null;
    this.remainingPlayersCount = 0;
    this.gameOver = false;
    this.winnerNickname = '';

    this.lastFrameTime = 0;
    this.animationFrameId = null;
    this.backgroundIntervalId = null;
    this._visibilityChangeHandler = null;
    this._hasQuit = false;
    this.lastInputSentAt = 0;
    this.lastInputSignature = '';
    this.visualSettings = this._loadVisualSettings();
    this._visualSettingsCleanup = null;

    // Server-Auth Tick parameters
    this.serverTickTimer = 0;
    this.serverTickInterval = 1000 / 22; // ~22 ticks per second

    // Callback when game ends or disconnects
    this.onQuitCallback = null;

    this._setupNetworkCallbacks();
  }

  /**
   * Enter Host Mode or Guest client mode
   */
  start(onQuit) {
    this.onQuitCallback = onQuit;
    this.isRunning = true;
    this._hasQuit = false;
    this.gameOver = false;
    this.players = {};
    this.projectiles = [];
    this.pendingSwordWaves = [];
    this.pendingRailguns = [];
    this.pendingSpearThrows = [];
    this.pendingMeleeHits = [];
    this.pendingRapierStrikes = [];
    this.pendingHammerSlams = [];
    this.vibratedRailbeamIds = new Set();
    this.shakenSpearThrowIds = new Set();
    this.effects = [];
    this.lastInputSentAt = 0;
    this.lastInputSignature = '';
    
    this.localPlayerId = this.networkManager.localId;
    this.lastFrameTime = performance.now();

    // Prepare Controls
    this.input.setupListeners(this.canvas);

    // Initial spawner coordinates
    const localNick = document.getElementById('nicknameInput').value.trim() || 'GLADIATOR';
    const localWeapon = document.querySelector('.weapon-card.selected')?.dataset.weapon || 'sword';

    if (this.networkManager.isHost) {
      // Host adds themselves directly
      const spawnP = this._getRandomSpawnPoint();
      const hostPlayer = new Player(this.localPlayerId, localNick, localWeapon, spawnP.x, spawnP.y);
      this.players[this.localPlayerId] = hostPlayer;
      
      this._announce('MATCH STARTED');

      // Preserve active ticking when Host's tab is backgrounded
      this._visibilityChangeHandler = () => {
        if (document.hidden) {
          if (!this.backgroundIntervalId) {
            this.backgroundIntervalId = setInterval(() => {
              const nowTime = Date.now();
              const dt = 0.035; // Fixed ~30 FPS step
              this._updateHostPhysics(dt, nowTime);
            }, 35);
          }
        } else {
          if (this.backgroundIntervalId) {
            clearInterval(this.backgroundIntervalId);
            this.backgroundIntervalId = null;
          }
          this.lastFrameTime = performance.now();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    } else {
      // Guest client: Wait for HOST to reply with ROOM_JOINED
      this._announce('CONNECTING...');
    }

    // Hide the OS cursor — the game crosshair replaces it.
    this.canvas.style.cursor = 'none';

    // Trigger frame animations
    this._resizeCanvas();
    this._setupVisualSettingsPanel();
    this.animationFrameId = requestAnimationFrame((t) => this._gameLoop(t));
    
    window.addEventListener('resize', this._resizeBound);
  }

  // Bind resize context
  _resizeBound = () => this._resizeCanvas();

  _resizeCanvas() {
    // Render at the device's true pixel density so phones/retina screens look
    // crisp. The drawing buffer is dpr× the CSS size; Input scales pointer
    // coordinates by the same ratio so aim stays accurate everywhere.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  _setupVisualSettingsPanel() {
    this._cleanupVisualSettingsPanel();
    this.visualSettings = this._loadVisualSettings();

    const bindings = [
      ['settingHideEnemyPreview', 'hideEnemyAttackPreviews'],
      ['settingMinEnemyEffects', 'minimizeEnemyAttackEffects']
    ];

    const cleanups = [];
    bindings.forEach(([id, key]) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.checked = Boolean(this.visualSettings[key]);
      const onChange = () => {
        this.visualSettings[key] = Boolean(input.checked);
        this._saveVisualSettings();
      };
      input.addEventListener('change', onChange);
      cleanups.push(() => input.removeEventListener('change', onChange));
    });

    this._visualSettingsCleanup = () => cleanups.forEach(cleanup => cleanup());
  }

  _cleanupVisualSettingsPanel() {
    if (this._visualSettingsCleanup) {
      this._visualSettingsCleanup();
      this._visualSettingsCleanup = null;
    }
  }

  _loadVisualSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem('battle_visual_settings_v1') || '{}') || {};
      return {
        hideEnemyAttackPreviews: Boolean(parsed.hideEnemyAttackPreviews),
        minimizeEnemyAttackEffects: Boolean(parsed.minimizeEnemyAttackEffects)
      };
    } catch {
      return {
        hideEnemyAttackPreviews: false,
        minimizeEnemyAttackEffects: false
      };
    }
  }

  _saveVisualSettings() {
    try {
      localStorage.setItem('battle_visual_settings_v1', JSON.stringify(this.visualSettings));
    } catch {
      // Visual preferences are optional; ignore blocked storage.
    }
  }

  /**
   * Local physics loop executing at client frame speeds
   */
  _gameLoop(timestamp) {
    if (!this.isRunning) return;

    const deltaTime = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1); // Cap deltaTime to prevent quantum tunneling on lags
    this.lastFrameTime = timestamp;

    const now = Date.now();

    if (this.networkManager.isHost) {
      // --- HOST (AUTHORITATIVE) ROUTE ---
      // Update camera over host coordinates
      const hp = this.players[this.localPlayerId];
      if (hp) {
        this.camera.update(hp.x, hp.y, this.canvas.width, this.canvas.height, this.mapWidth, this.mapHeight);
        if (!hp.isDead) {
          this.input.updateAimAngle(hp, this.camera, this.canvas.width, this.canvas.height, this.mapWidth, this.mapHeight);
          hp.angle = this.input.aimAngle;
          // Host applies its own dash/skill directly (it is authoritative).
          if (this.input.consumeDash()) {
            const { dx, dy } = this.input.getMoveVector();
            this._tryDash(hp, dx, dy);
          }
          if (this.input.consumeSkillDown()) {
            this._handleSkillPressed(hp, now);
          }
          if (this.input.consumeSkillUp()) {
            this._handleSkillReleased(hp, now);
          }
        }
      }

      this._updateHostPhysics(deltaTime, now);
      
      // Render frame
      this._renderFrame();

    } else {
      // --- CLIENT ROUTE ---
      this._updateClientInterpolations(deltaTime);

      // Transmit inputs to host
      const localPlayer = this.players[this.localPlayerId];
      if (localPlayer && !localPlayer.isDead) {
        // Update camera position to follow local player
        this.camera.update(localPlayer.x, localPlayer.y, this.canvas.width, this.canvas.height, this.mapWidth, this.mapHeight);

        // Calibrate accurate aiming angle taking camera boundaries into account
        this.input.updateAimAngle(localPlayer, this.camera, this.canvas.width, this.canvas.height, this.mapWidth, this.mapHeight);
        localPlayer.angle = this.input.aimAngle;

        // Dash is applied optimistically for snappy feel, then reconciled by
        // the host. Skills are host-authoritative (they spawn shared entities).
        if (this.input.consumeDash()) {
          const { dx, dy } = this.input.getMoveVector();
          localPlayer.startDash(dx, dy);
          this.networkManager.sendToHost(Protocol.clientAction('dash', dx, dy));
        }
        if (this.input.consumeSkillDown()) {
          this.networkManager.sendToHost(Protocol.clientAction('skillDown'));
        }
        if (this.input.consumeSkillUp()) {
          this.networkManager.sendToHost(Protocol.clientAction('skillUp'));
        }

        // Optimistic local update for zero input latency feel
        localPlayer.updatePosition(deltaTime, this.input.keys, this.mapWidth, this.mapHeight);
        localPlayer.angle = this.input.aimAngle;
        Collision.clampToMap(localPlayer, this.mapWidth, this.mapHeight);

        this._sendLocalInput(now);
      }

      this._renderFrame();
    }

    // Capture next frame
    this.animationFrameId = requestAnimationFrame((t) => this._gameLoop(t));
  }

  /**
   * Host specific update routine
   */
  _updateHostPhysics(deltaTime, now) {
    // 1. Process all active players inputs (including guests)
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead) return;

      if (id === this.localPlayerId) {
        // Local host input updates
        p.updatePosition(deltaTime, this.input.keys, this.mapWidth, this.mapHeight);
        p.angle = this.input.aimAngle;
      } else {
        // Remote guest input updates
        p.updatePosition(deltaTime, p.keys || {}, this.mapWidth, this.mapHeight);
      }
      Collision.clampToMap(p, this.mapWidth, this.mapHeight);
    });

    // 2. Resolve Player collisions to avoid clipping
    Collision.resolvePlayerCollisions(this.players);

    // 2.5 Advance skill buffs & cooldowns authoritatively.
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead) return;
      if (p.buffTimeLeft > 0) {
        p.buffTimeLeft -= deltaTime;
        if (p.buffTimeLeft <= 0) {
          // Buff expired → the post-buff cooldown begins now.
          p.buffTimeLeft = 0;
          p.buffType = null;
          const sk = SkillConfig[p.weapon];
          p.skillCdLeft = sk ? sk.cooldownMs / 1000 : 0;
        }
      } else if (p.skillCdLeft > 0) {
        p.skillCdLeft = Math.max(0, p.skillCdLeft - deltaTime);
      }
    });

    this._releaseDueSwordWaves(now);
    this._releaseDueBowRailguns(now);
    this._processSpearThrowQueue(now);
    this._processPendingMeleeHits(now);
    this._processGreatswordCharges(now);
    this._processDaggerQtes(now);
    this._processRapierStrikes(now);
    this._processHammerSlams(now);

    // 3. Process Automatic attack queues
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead) return;

      const weaponConfig = getEffectiveWeapon(p.weapon, p.buffType);

      // Automatic Attack on cooldown trigger
      if (p.canAttack(now)) {
        this._performAutomaticAttack(p, weaponConfig, now);
      }
    });

    // 4. Update and check projectile hits
    this.projectiles.forEach(proj => {
      if (proj.isDead) return;

      // Boomerang javelin has its own out/return flight handling.
      if (proj.kind === 'thrownspear') {
        this._updateThrownSpear(proj, deltaTime, now);
        return;
      }

      proj.update(deltaTime);

      if (proj.checkWallCollision(this.mapWidth, this.mapHeight)) {
        if (proj.kind === 'swordwave') {
          this._explodeSwordWave(proj, now);
        } else {
          this.effects.push({
            attackerId: proj.ownerId,
            x: proj.x,
            y: proj.y,
            angle: Math.atan2(proj.vy, proj.vx),
            weapon: proj.weapon || (proj.kind === 'greatswordwave' ? 'greatsword' : 'bow'),
            type: 'projectile_burst',
            progress: 0,
            timestamp: now,
            lifetime: 320
          });
        }
        return;
      }

      // Check hit detections (i-frames let a dashing player phase through).
      Object.keys(this.players).forEach(tid => {
        const target = this.players[tid];
        if (proj.isDead || target.isInvincible()) return;

        if (Collision.checkProjectileHit(proj, target)) {
          if (proj.kind === 'swordwave') {
            // Direct contact damage, then the explosion AoE.
            const died = target.takeDamage(proj.damage, 'swordwave');
            if (died) this._creditKill(proj.ownerId, target, '검기로');
            this._explodeSwordWave(proj, now);
            return;
          }

          proj.isDead = true;
          if (proj.kind === 'arrow') {
            this._awardBowArrowStack(this.players[proj.ownerId]);
          }
          const died = target.takeDamage(proj.damage, proj.kind === 'greatswordwave' ? 'greatswordwave' : 'arrow');
          if (died) this._creditKill(proj.ownerId, target, '활로');
        }
      });
    });

    // Clean up dead projectiles
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    // Update effect decay cycles
    this.effects.forEach(e => {
      const elapsed = now - e.timestamp;
      e.progress = Math.min(elapsed / e.lifetime, 1);
    });
    this.effects = this.effects.filter(e => e.progress < 1);

    // 5. Update game standing counts & Host P2P Respawn Loop
    const alivePlayers = Object.values(this.players).filter(p => !p.isDead);
    this.remainingPlayersCount = alivePlayers.length;

    // Process resurrection/respawn times for dead competitors
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead) {
        if (!p.respawnTime) {
          p.respawnTime = now + 2500; // 2.5 seconds spawn time
          p.clearCombatTimers(); // drop buffs/dash/skill state on death
          this._clearPendingSwordWavesFor(p.id);
          this._clearPendingRailgunsFor(p.id);
          this._clearPendingMeleeHitsFor(p.id);
          this._clearPendingRapierStrikesFor(p.id);
          this._clearPendingHammerSlamsFor(p.id);
        }
        p.respawnRemainingMs = Math.max(0, p.respawnTime - now);
        if (now >= p.respawnTime) {
          const spawnP = this._getRandomSpawnPoint();
          p.isDead = false;
          p.hp = p.maxHp;
          p.x = spawnP.x;
          p.y = spawnP.y;
          p.respawnTime = 0;
          p.respawnRemainingMs = 0;
          p.clearCombatTimers();
          this._announce(`${p.nickname}님이 다시 부활했습니다!`);
        }
      } else {
        p.respawnTime = 0;
        p.respawnRemainingMs = 0;
      }
    });

    // 6. Broadcast state ticks to guests
    this.serverTickTimer += deltaTime * 1000;
    if (this.serverTickTimer >= this.serverTickInterval) {
      this.serverTickTimer = 0;
      this._broadcastState();
    }

    // Update stats UI counters
    this._updateHUD();
  }

  _performAutomaticAttack(player, weaponConfig, now) {
    const combo = this._resolveComboAttack(player, weaponConfig, now);
    const attackConfig = combo.weaponConfig;
    const swingDirection = Number.isFinite(attackConfig.fixedSwingDirection)
      ? attackConfig.fixedSwingDirection
      : player.triggerAttack(now);
    if (Number.isFinite(attackConfig.fixedSwingDirection)) {
      player.lastAttackTime = now;
    }
    this._applyComboRecovery(player, combo, now);

    if (attackConfig.type !== 'projectile') {
      if (attackConfig.lungeDistance) {
        this._lungePlayer(player, attackConfig.lungeDistance);
      }

      const localFx = {
        attackerId: player.id,
        x: player.x,
        y: player.y,
        angle: player.angle,
        weapon: player.weapon,
        buffType: player.buffType,
        type: attackConfig.type,
        range: attackConfig.range,
        width: attackConfig.width,
        innerRange: attackConfig.innerRange,
        angleDeg: attackConfig.angle,
        comboStep: combo.step,
        comboCycle: combo.cycle,
        comboFinisher: combo.isFinisher,
        swingDirection,
        progress: 0,
        timestamp: now,
        lifetime: Math.min(
          Math.max((attackConfig.cooldown || weaponConfig.cooldown) * 0.78 + (attackConfig.delayDamageMs || 0) * 0.5, 150),
          combo.isFinisher ? 900 : 620
        )
      };
      this.effects.push(localFx);

      const hitCount = this._queueOrApplyMeleeHit(player, attackConfig, now);
      if (hitCount !== null) {
        this._applyAttackTempoResult(player, attackConfig, hitCount, now);
      }
      return;
    }

    const spawnDist = player.radius + 3;
    const projectileKind = attackConfig.projectileKind || 'arrow';
    const projectileWeapon = attackConfig.projectileWeapon || player.weapon;
    const arrowId = `${player.id}-${projectileKind}-${now}`;
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: player.weapon,
      type: 'projectile_shot',
      projectileKind,
      progress: 0,
      timestamp: now,
      lifetime: Math.min(attackConfig.cooldown * 0.45, 260)
    });

    const proj = new Projectile(
      arrowId,
      player.id,
      player.x + Math.cos(player.angle) * spawnDist,
      player.y + Math.sin(player.angle) * spawnDist,
      player.angle,
      attackConfig.speed,
      attackConfig.range,
      attackConfig.damage,
      projectileKind
    );
    proj.weapon = projectileWeapon;
    if (attackConfig.radius) proj.radius = attackConfig.radius;
    this.projectiles.push(proj);
  }

  _queueOrApplyMeleeHit(player, attackConfig, now) {
    const delayMs = Math.max(0, Math.round(attackConfig.delayDamageMs || 0));
    const snapshot = this._snapshotMeleeAttacker(player);

    if (delayMs > 0) {
      if (!this.pendingMeleeHits) this.pendingMeleeHits = [];
      this.pendingMeleeHits.push({
        playerId: player.id,
        attacker: snapshot,
        attackConfig: { ...attackConfig },
        releaseAt: now + delayMs
      });
      return null;
    }

    return this._applyMeleeHits(snapshot, attackConfig, now);
  }

  _snapshotMeleeAttacker(player) {
    return {
      id: player.id,
      nickname: player.nickname,
      x: player.x,
      y: player.y,
      angle: player.angle,
      radius: player.radius || 14
    };
  }

  _processPendingMeleeHits(now) {
    if (!this.pendingMeleeHits?.length) return;

    const waiting = [];
    for (const pending of this.pendingMeleeHits) {
      if (now < pending.releaseAt) {
        waiting.push(pending);
        continue;
      }

      const liveAttacker = this.players[pending.playerId];
      if (!liveAttacker || liveAttacker.isDead) continue;

      this._applyMeleeHits({
        ...pending.attacker,
        nickname: liveAttacker.nickname
      }, pending.attackConfig, now);
    }

    this.pendingMeleeHits = waiting;
  }

  _clearPendingMeleeHitsFor(playerId) {
    if (!this.pendingMeleeHits?.length) return;
    this.pendingMeleeHits = this.pendingMeleeHits.filter(hit => hit.playerId !== playerId);
  }

  _applyMeleeHits(attacker, attackConfig, now) {
    let hitCount = 0;

    Object.keys(this.players).forEach(tid => {
      const target = this.players[tid];
      const hit = this._resolveMeleeHitResult(attacker, target, attackConfig);
      if (!hit) return;

      hitCount++;
      this._applyMeleeHitMovement(attacker, target, hit);
      const died = target.takeDamage(hit.damage, attacker.nickname);
      if (!died && hit.stunMs) {
        target.stunTimeLeft = Math.max(target.stunTimeLeft || 0, hit.stunMs / 1000);
      }
      if (died) this._creditKill(attacker.id, target);
    });

    return hitCount;
  }

  _resolveMeleeHitResult(attacker, target, weapon) {
    if (!target || target.isInvincible?.()) return null;
    if (!Collision.checkMeleeHit(attacker, target, weapon)) return null;

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy);
    let damage = weapon.damage || 0;
    let pull = 0;
    let knockback = weapon.knockback || 0;

    if (weapon.type === 'melee_sweet_arc') {
      const sweetDistance = weapon.innerRange || weapon.range * 0.58;
      if (dist >= sweetDistance) {
        damage = weapon.sweetDamage || damage;
        pull = weapon.pull || 0;
      }
    } else if (weapon.type === 'melee_backstab') {
      const fromTargetToAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
      const behindAngle = (target.angle || 0) + Math.PI;
      const backstabWindow = ((weapon.backstabAngle || 95) * Math.PI) / 360;
      if (angleDistance(fromTargetToAttacker, behindAngle) <= backstabWindow) {
        damage = weapon.backstabDamage || damage;
      }
    } else if (weapon.type === 'melee_precise_line') {
      const uX = Math.cos(attacker.angle);
      const uY = Math.sin(attacker.angle);
      const perpDiff = Math.abs(dx * uY - dy * uX);
      const critWidth = Math.max(5, (weapon.width || 0) * 0.55) + (target.radius || 14) * 0.25;
      if (perpDiff <= critWidth) {
        damage = weapon.critDamage || damage;
      }
    } else if (weapon.type === 'melee_slam') {
      const inner = weapon.innerRange || weapon.range * 0.45;
      if (dist > inner + (target.radius || 14)) {
        damage = weapon.shockwaveDamage || Math.round(damage * 0.72);
      }
    }

    return { damage, pull, knockback, stunMs: weapon.stunMs || 0 };
  }

  _applyMeleeHitMovement(attacker, target, hit) {
    if (!target || target.isDead) return;

    let dx = target.x - attacker.x;
    let dy = target.y - attacker.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-4) {
      dx = Math.cos(attacker.angle || 0);
      dy = Math.sin(attacker.angle || 0);
      len = 1;
    }
    const ux = dx / len;
    const uy = dy / len;

    if (hit.pull) {
      target.x -= ux * hit.pull;
      target.y -= uy * hit.pull;
    }
    if (hit.knockback) {
      target.x += ux * hit.knockback;
      target.y += uy * hit.knockback;
    }

    Collision.clampToMap(target, this.mapWidth, this.mapHeight);
  }

  _applyAttackTempoResult(player, attackConfig, hitCount, now) {
    if (hitCount > 0 && attackConfig.hitCooldownRefundMs) {
      const refund = Math.max(0, attackConfig.hitCooldownRefundMs);
      player.lastAttackTime -= refund;
      player.comboDelayUntil = Math.max(now, (player.comboDelayUntil || now) - refund);
    } else if (hitCount === 0 && attackConfig.missPenaltyMs) {
      player.comboDelayUntil = Math.max(player.comboDelayUntil || 0, now + (attackConfig.cooldown || 0) + attackConfig.missPenaltyMs);
    }
  }

  _lungePlayer(player, distance) {
    const amount = Number.isFinite(distance) ? distance : 0;
    if (!amount) return;
    player.x += Math.cos(player.angle) * amount;
    player.y += Math.sin(player.angle) * amount;
    Collision.clampToMap(player, this.mapWidth, this.mapHeight);
  }

  _resolveComboAttack(player, weaponConfig, now) {
    const comboConfig = ComboConfig[player.weapon];
    const comboLockedBySkill = player.weapon === 'axe' && player.buffType === 'axe_rage';
    if (!comboConfig || weaponConfig.type === 'projectile' || comboLockedBySkill) {
      player.comboStep = 0;
      return {
        weaponConfig,
        step: 0,
        cycle: 0,
        isFinisher: false,
        delayAfterMs: 0,
        recoveryMs: weaponConfig.cooldown || 0
      };
    }

    if (comboConfig.comboResetMs && now - (player.lastAttackTime || 0) > comboConfig.comboResetMs) {
      player.comboStep = 0;
    }

    const cycle = Math.max(1, comboConfig.cycle || 1);
    const step = ((player.comboStep || 0) % cycle) + 1;
    const isFinisher = step === cycle;
    const attackConfig = isFinisher
      ? { ...weaponConfig, ...(comboConfig.finisher || {}) }
      : { ...weaponConfig };

    return {
      weaponConfig: attackConfig,
      step,
      cycle,
      isFinisher,
      delayAfterMs: step === comboConfig.delayAfterStep ? comboConfig.delayBeforeFinisherMs || 0 : 0,
      recoveryMs: attackConfig.cooldown || weaponConfig.cooldown || 0
    };
  }

  _applyComboRecovery(player, combo, now) {
    if (!combo || !combo.cycle) {
      player.comboStep = 0;
      player.comboDelayUntil = now + (combo?.recoveryMs || 0);
      return;
    }

    player.comboStep = combo.isFinisher ? 0 : combo.step;
    const recoveryUntil = now + Math.max(combo.recoveryMs || 0, combo.delayAfterMs || 0);
    player.comboDelayUntil = Math.max(player.comboDelayUntil || 0, recoveryUntil);

    // Push a visual "charging" effect during the pause before the finisher.
    // Renderer uses this to hold the weapon in pull-back position AND to preview
    // the upcoming finisher's hit range.
    if (combo.delayAfterMs > 0 && !combo.isFinisher && this.effects) {
      const comboConfig = ComboConfig[player.weapon];
      const baseWeapon = getEffectiveWeapon(player.weapon, player.buffType);
      const finisherShape = { ...baseWeapon, ...((comboConfig && comboConfig.finisher) || {}) };
      this.effects.push({
        attackerId: player.id,
        x: player.x,
        y: player.y,
        angle: player.angle,
        weapon: player.weapon,
        type: 'finisher_ready',
        // Shape of the upcoming finisher, used by the renderer to draw a range preview.
        previewType: finisherShape.type,
        previewRange: finisherShape.range,
        previewWidth: finisherShape.width,
        previewAngleDeg: finisherShape.angle,
        progress: 0,
        timestamp: now,
        lifetime: combo.delayAfterMs
      });
    }
  }

  /**
   * Credit a kill + broadcast a feed line.
   */
  _creditKill(killerId, target, viaLabel = '') {
    const killer = this.players[killerId];
    if (killer) {
      killer.kills++;
      const via = viaLabel ? `${viaLabel} ` : '';
      this._announce(`${killer.nickname}님이 ${via}${target.nickname}님을 처치했습니다!`);
    } else {
      this._announce(`${target.nickname}님이 전사했습니다.`);
    }
  }

  /**
   * Route a one-shot action (dash/skill) from any player (host-local or guest).
   */
  _handlePlayerAction(player, data, now) {
    if (!player || player.isDead) return;
    if (data.action === 'dash') {
      const hasDir = Number.isFinite(data.dx) || Number.isFinite(data.dy);
      const v = hasDir ? { dx: data.dx || 0, dy: data.dy || 0 } : dirFromKeys(player.keys || {});
      this._tryDash(player, v.dx, v.dy);
    } else if (data.action === 'skill' || data.action === 'skillDown') {
      this._handleSkillPressed(player, now);
    } else if (data.action === 'skillUp') {
      this._handleSkillReleased(player, now);
    }
  }

  _tryDash(player, dirX, dirY) {
    if (!player || player.isDead) return;
    if (player.daggerQte) return;
    player.startDash(dirX, dirY);
  }

  _handleSkillPressed(player, now) {
    if (!player || player.isDead || player.stunTimeLeft > 0) return;
    if (player.weapon === 'dagger' && player.daggerQte) {
      this._tryDaggerQteInput(player, now);
      return;
    }
    if (player.weapon === 'greatsword') {
      this._startGreatswordCharge(player, now);
      return;
    }
    this._activateSkill(player, now);
  }

  _handleSkillReleased(player, now) {
    if (!player || player.isDead) return;
    if (player.weapon === 'greatsword') {
      this._releaseGreatswordCharge(player, now);
    }
  }

  _canUseSkill(player) {
    if (!player || player.isDead || player.stunTimeLeft > 0 ||
        player.buffTimeLeft > 0 || player.skillCdLeft > 0 || player.spearThrown) {
      return false;
    }
    if (player.greatswordChargeStart > 0 || player.daggerQte) return false;
    if (!SkillConfig[player.weapon]) return false;
    if (player.weapon === 'bow') {
      return (player.arrowStacks || 0) > 0;
    }
    return true;
  }

  /**
   * Activate the weapon's F skill (host-authoritative).
   */
  _activateSkill(player, now) {
    if (!this._canUseSkill(player)) return;

    switch (player.weapon) {
      case 'sword': this._castSwordSkill(player, now); break;
      case 'axe': this._startBuff(player, 'axe_rage', SkillConfig.axe.buffMs, now); break;
      case 'bow': this._castRailgun(player, now); break;
      case 'spear': this._throwSpear(player, now); break;
      case 'gauntlet': this._startBuff(player, 'gauntlet_lance', SkillConfig.gauntlet.buffMs, now); break;
      case 'greatsword': this._startGreatswordCharge(player, now); break;
      case 'scythe': this._castMeleeSkill(player, now); break;
      case 'dagger': this._startDaggerQte(player, now); break;
      case 'rapier': this._castRapierFlurry(player, now); break;
      case 'hammer': this._castHammerSkill(player, now); break;
      default: break;
    }
  }

  _startBuff(player, buffType, buffMs, now) {
    player.buffType = buffType;
    player.buffTimeLeft = buffMs / 1000;
    if (buffType === 'axe_rage') {
      player.comboStep = 0;
      player.comboDelayUntil = 0;
    }
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: player.weapon,
      buffType,
      type: 'buff_activate',
      progress: 0,
      timestamp: now,
      lifetime: 520
    });
  }

  _castMeleeSkill(player, now) {
    const sk = SkillConfig[player.weapon];
    if (!sk) return;

    const base = getEffectiveWeapon(player.weapon, player.buffType);
    const attackConfig = {
      ...base,
      ...sk,
      cooldown: base.cooldown
    };

    if (attackConfig.lungeDistance) {
      this._lungePlayer(player, attackConfig.lungeDistance);
    }

    player.swingDirection *= -1;
    const effect = {
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: player.weapon,
      buffType: player.buffType,
      type: attackConfig.type,
      range: attackConfig.range,
      width: attackConfig.width,
      innerRange: attackConfig.innerRange,
      angleDeg: attackConfig.angle,
      comboStep: 0,
      comboCycle: 0,
      comboFinisher: true,
      isSkill: true,
      swingDirection: player.swingDirection,
      progress: 0,
      timestamp: now,
      lifetime: Math.min(Math.max(520 + (attackConfig.delayDamageMs || 0), 360), 980)
    };
    this.effects.push(effect);

    const hitCount = this._queueOrApplyMeleeHit(player, attackConfig, now);
    if (hitCount !== null) {
      this._applyAttackTempoResult(player, attackConfig, hitCount, now);
    }

    player.skillCdLeft = sk.cooldownMs / 1000;
  }

  _startGreatswordCharge(player, now) {
    if (!this._canUseSkill(player)) return;
    const sk = SkillConfig.greatsword;
    player.greatswordChargeStart = now;
    player.greatswordChargeAngle = player.angle;
    player.comboStep = 0;
    player.comboDelayUntil = 0;
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'greatsword',
      type: 'greatsword_charge',
      range: sk.range,
      width: sk.width,
      angleDeg: sk.angle,
      progress: 0,
      timestamp: now,
      lifetime: sk.chargeMaxMs
    });
  }

  _releaseGreatswordCharge(player, now) {
    if (!player || player.greatswordChargeStart <= 0) return;
    const sk = SkillConfig.greatsword;
    const heldMs = Math.max(0, now - player.greatswordChargeStart);
    const chargeRatio = clamp01(heldMs / (sk.chargeMaxMs || 3000));
    const damage = Math.round((sk.minDamage || sk.damage) + ((sk.damage || 85) - (sk.minDamage || sk.damage)) * chargeRatio);
    player.greatswordChargeStart = 0;
    player.greatswordChargeAngle = 0;
    player.skillCdLeft = sk.cooldownMs / 1000;
    player.comboDelayUntil = Math.max(player.comboDelayUntil || 0, now + (sk.attackLockMs || 0));

    const attackConfig = {
      ...Weapons.greatsword,
      ...sk,
      damage,
      cooldown: Weapons.greatsword.cooldown,
      chargeRatio
    };

    const effect = {
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'greatsword',
      type: attackConfig.type,
      range: attackConfig.range,
      width: attackConfig.width,
      angleDeg: attackConfig.angle,
      comboFinisher: true,
      isSkill: true,
      chargeRatio,
      swingDirection: 1,
      progress: 0,
      timestamp: now,
      lifetime: 720
    };
    this.effects.push(effect);
    const hitCount = this._queueOrApplyMeleeHit(player, attackConfig, now);
    if (hitCount !== null) this._applyAttackTempoResult(player, attackConfig, hitCount, now);
  }

  _processGreatswordCharges(now) {
    const maxMs = SkillConfig.greatsword?.chargeMaxMs || 3000;
    Object.values(this.players).forEach(player => {
      if (!player || player.isDead || player.weapon !== 'greatsword') return;
      if (player.greatswordChargeStart > 0 && now - player.greatswordChargeStart >= maxMs) {
        this._releaseGreatswordCharge(player, now);
      }
    });
  }

  _startDaggerQte(player, now) {
    if (!this._canUseSkill(player)) return;
    const target = this._findNearestEnemy(player);
    const sk = SkillConfig.dagger;
    if (!target) {
      player.skillCdLeft = Math.min(1.5, sk.cooldownMs / 1000);
      return;
    }

    player.daggerQte = {
      targetId: target.id,
      phase: 'lock',
      actionAt: now + sk.lockMs,
      perfectAt: 0,
      expiresAt: now + sk.lockMs + sk.windowMs,
      iframeUntil: now + sk.lockMs + sk.windowMs
    };
    player.iframeTimeLeft = Math.max(player.iframeTimeLeft || 0, (sk.lockMs + sk.windowMs) / 1000);
    player.skillCdLeft = sk.cooldownMs / 1000;
    this.effects.push({
      attackerId: player.id,
      targetId: target.id,
      x: player.x,
      y: player.y,
      weapon: 'dagger',
      type: 'dagger_qte_lock',
      progress: 0,
      timestamp: now,
      lifetime: sk.lockMs
    });
  }

  _processDaggerQtes(now) {
    Object.values(this.players).forEach(player => {
      const qte = player?.daggerQte;
      if (!qte) return;

      const target = this.players[qte.targetId];
      if (!target || target.isDead || player.isDead) {
        this._clearDaggerQte(player, qte, now);
        return;
      }

      if (qte.phase === 'lock' && now >= qte.actionAt) {
        const sk = SkillConfig.dagger;
        this._placeBehindTarget(player, target, 34);
        player.angle = Math.atan2(target.y - player.y, target.x - player.x);
        qte.phase = 'window';
        qte.perfectAt = now + sk.perfectMs;
        qte.expiresAt = now + sk.windowMs;
        qte.iframeUntil = now + sk.windowMs;
        this.effects.push({
          attackerId: player.id,
          targetId: target.id,
          x: player.x,
          y: player.y,
          weapon: 'dagger',
          type: 'dagger_qte_window',
          progress: 0,
          timestamp: now,
          lifetime: sk.windowMs,
          perfectMs: sk.perfectMs
        });
      }

      if (qte.phase === 'window') {
        player.angle = Math.atan2(target.y - player.y, target.x - player.x);
      }

      if (qte.phase === 'window' && now > qte.expiresAt) {
        this._failDaggerQte(player, qte, now);
      }
    });
  }

  _tryDaggerQteInput(player, now) {
    const qte = player?.daggerQte;
    if (!qte || qte.phase !== 'window') return false;

    const target = this.players[qte.targetId];
    if (!target || target.isDead || target.isInvincible()) {
      this._clearDaggerQte(player, qte, now);
      return true;
    }

    const sk = SkillConfig.dagger;
    const diff = Math.abs(now - qte.perfectAt);
    const success = diff <= (sk.toleranceMs || 150);
    if (!success) {
      this._failDaggerQte(player, qte, now);
      return true;
    }

    this._clearDaggerQte(player, qte, now);
    player.angle = Math.atan2(target.y - player.y, target.x - player.x);
    this._lungePlayer(player, sk.dashDistance || 64);
    const died = target.takeDamage(sk.damage || 70, player.nickname);
    if (died) this._creditKill(player.id, target, '암습으로');
    this.effects.push({
      attackerId: player.id,
      targetId: target.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'dagger',
      type: 'dagger_qte_hit',
      progress: 0,
      timestamp: now,
      lifetime: 420
    });
    return true;
  }

  _clearDaggerQte(player, qte, now) {
    if (!player) return;
    player.daggerQte = null;
    if (qte?.iframeUntil) {
      player.iframeTimeLeft = 0;
    }
  }

  _failDaggerQte(player, qte, now) {
    const sk = SkillConfig.dagger;
    this._clearDaggerQte(player, qte, now);
    const failDamage = sk.failDamage || 10;
    player.hp = Math.max(0, player.hp - failDamage);
    if (player.hp <= 0) {
      player.isDead = true;
    } else {
      player.stunTimeLeft = Math.max(player.stunTimeLeft || 0, (sk.failStunMs || 300) / 1000);
    }
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      weapon: 'dagger',
      type: 'dagger_qte_fail',
      progress: 0,
      timestamp: now,
      lifetime: 320
    });
  }

  _findNearestEnemy(player) {
    let best = null;
    let bestDist = Infinity;
    Object.values(this.players).forEach(target => {
      if (!target || target.id === player.id || target.isDead) return;
      const dist = Math.hypot(target.x - player.x, target.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = target;
      }
    });
    return best;
  }

  _placeBehindTarget(player, target, distance = 34) {
    const angle = (target.angle || 0) + Math.PI;
    player.x = target.x + Math.cos(angle) * distance;
    player.y = target.y + Math.sin(angle) * distance;
    Collision.clampToMap(player, this.mapWidth, this.mapHeight);
  }

  _castRapierFlurry(player, now) {
    if (!this._canUseSkill(player)) return;
    const sk = SkillConfig.rapier;
    const count = Math.max(1, Math.floor(sk.strikeCount || 7));
    const interval = Math.max(0, sk.strikeIntervalMs || 120);
    if (!this.pendingRapierStrikes) this.pendingRapierStrikes = [];
    for (let i = 0; i < count; i++) {
      this.pendingRapierStrikes.push({
        playerId: player.id,
        releaseAt: now + i * interval,
        sequence: i
      });
    }
    player.skillCdLeft = sk.cooldownMs / 1000;
  }

  _processRapierStrikes(now) {
    if (!this.pendingRapierStrikes?.length) return;
    const waiting = [];
    for (const strike of this.pendingRapierStrikes) {
      if (now < strike.releaseAt) {
        waiting.push(strike);
        continue;
      }
      const player = this.players[strike.playerId];
      if (!player || player.isDead || player.weapon !== 'rapier') continue;
      this._executeRapierStrike(player, now, strike.sequence);
    }
    this.pendingRapierStrikes = waiting;
  }

  _executeRapierStrike(player, now, sequence = 0) {
    const sk = SkillConfig.rapier;
    const attackConfig = {
      ...Weapons.rapier,
      ...sk,
      cooldown: Weapons.rapier.cooldown
    };
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'rapier',
      type: attackConfig.type,
      range: attackConfig.range,
      width: attackConfig.width,
      comboFinisher: false,
      isSkill: true,
      sequence,
      progress: 0,
      timestamp: now,
      lifetime: 210
    });
    const hitCount = this._applyMeleeHits(this._snapshotMeleeAttacker(player), attackConfig, now);
    this._applyAttackTempoResult(player, attackConfig, hitCount, now);
  }

  _clearPendingRapierStrikesFor(playerId) {
    if (!this.pendingRapierStrikes?.length) return;
    this.pendingRapierStrikes = this.pendingRapierStrikes.filter(strike => strike.playerId !== playerId);
  }

  _castHammerSkill(player, now) {
    if (!this._canUseSkill(player)) return;
    const sk = SkillConfig.hammer;
    if (!this.pendingHammerSlams) this.pendingHammerSlams = [];
    this.pendingHammerSlams.push({
      playerId: player.id,
      releaseAt: now + (sk.delayMs || 1000)
    });
    player.skillCdLeft = sk.cooldownMs / 1000;
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      weapon: 'hammer',
      type: 'hammer_windup',
      range: sk.range,
      progress: 0,
      timestamp: now,
      lifetime: sk.delayMs || 1000
    });
  }

  _processHammerSlams(now) {
    if (!this.pendingHammerSlams?.length) return;
    const waiting = [];
    for (const slam of this.pendingHammerSlams) {
      if (now < slam.releaseAt) {
        waiting.push(slam);
        continue;
      }
      const player = this.players[slam.playerId];
      if (!player || player.isDead || player.weapon !== 'hammer') continue;
      this._executeHammerSkillSlam(player, now);
    }
    this.pendingHammerSlams = waiting;
  }

  _executeHammerSkillSlam(player, now) {
    const sk = SkillConfig.hammer;
    const attackConfig = {
      ...Weapons.hammer,
      ...sk,
      shockwaveDamage: sk.damage,
      cooldown: Weapons.hammer.cooldown,
      type: 'melee_slam'
    };
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'hammer',
      type: 'melee_slam',
      range: attackConfig.range,
      innerRange: attackConfig.innerRange,
      comboFinisher: true,
      isSkill: true,
      progress: 0,
      timestamp: now,
      lifetime: 680
    });
    this._applyMeleeHits(this._snapshotMeleeAttacker(player), attackConfig, now);
  }

  _clearPendingHammerSlamsFor(playerId) {
    if (!this.pendingHammerSlams?.length) return;
    this.pendingHammerSlams = this.pendingHammerSlams.filter(slam => slam.playerId !== playerId);
  }

  /**
   * Sword skill: release three sword-energy projectiles on a short cadence.
   */
  _castSwordSkill(player, now) {
    const sk = SkillConfig.sword;
    const waveCount = Math.max(1, Math.floor(sk.waveCount || 1));
    const waveIntervalMs = Math.max(0, sk.waveIntervalMs || 0);

    for (let i = 0; i < waveCount; i++) {
      this.pendingSwordWaves.push({
        playerId: player.id,
        castAt: now,
        releaseAt: now + waveIntervalMs * i,
        sequence: i
      });
    }

    player.skillCdLeft = sk.cooldownMs / 1000;
  }

  _releaseDueSwordWaves(now) {
    if (!this.pendingSwordWaves?.length) return;

    const waiting = [];
    for (const wave of this.pendingSwordWaves) {
      if (wave.releaseAt > now) {
        waiting.push(wave);
        continue;
      }

      const player = this.players[wave.playerId];
      if (!player || player.isDead || player.weapon !== 'sword') continue;
      this._spawnSwordWave(player, wave.castAt, wave.sequence);
    }
    this.pendingSwordWaves = waiting;
  }

  _spawnSwordWave(player, castAt, sequence) {
    const sk = SkillConfig.sword;
    const spawnDist = player.radius + 4;
    const angle = player.angle;
    const proj = new Projectile(
      `${player.id}-wave-${castAt}-${sequence}`,
      player.id,
      player.x + Math.cos(angle) * spawnDist,
      player.y + Math.sin(angle) * spawnDist,
      angle,
      sk.waveSpeed,
      Infinity,
      sk.directDamage,
      'swordwave'
    );
    proj.explosionRadius = sk.explosionRadius;
    proj.explosionDamage = sk.explosionDamage;
    proj.weapon = 'sword';
    this.projectiles.push(proj);
  }

  _clearPendingSwordWavesFor(playerId) {
    if (!this.pendingSwordWaves?.length) return;
    this.pendingSwordWaves = this.pendingSwordWaves.filter(wave => wave.playerId !== playerId);
  }

  _clearPendingRailgunsFor(playerId) {
    if (!this.pendingRailguns?.length) return;
    this.pendingRailguns = this.pendingRailguns.filter(shot => shot.playerId !== playerId);
  }

  _awardBowArrowStack(player) {
    if (!player || player.isDead || player.weapon !== 'bow') return;
    const maxStacks = SkillConfig.bow.maxStacks || 5;
    player.arrowStacks = Math.min(maxStacks, (player.arrowStacks || 0) + 1);
  }

  _explodeSwordWave(proj, now) {
    proj.isDead = true;
    this.effects.push({
      attackerId: proj.ownerId,
      x: proj.x,
      y: proj.y,
      angle: proj.angle,
      weapon: 'sword',
      type: 'explosion',
      radius: proj.explosionRadius,
      progress: 0,
      timestamp: now,
      lifetime: 380
    });

    Object.keys(this.players).forEach(tid => {
      const target = this.players[tid];
      if (target.id === proj.ownerId || target.isDead || target.isInvincible()) return;
      const dist = Math.hypot(target.x - proj.x, target.y - proj.y);
      if (dist <= proj.explosionRadius + target.radius) {
        const died = target.takeDamage(proj.explosionDamage, 'swordwave');
        if (died) this._creditKill(proj.ownerId, target, '검기 폭발로');
      }
    });
  }

  /**
   * Bow skill: spend arrow stacks, then fire one railgun per stack.
   */
  _castRailgun(player, now) {
    const sk = SkillConfig.bow;
    const stackCount = Math.min(sk.maxStacks || 5, Math.max(0, Math.floor(player.arrowStacks || 0)));
    if (stackCount <= 0) return;

    player.arrowStacks = 0;
    const interval = Math.max(0, sk.burstIntervalMs || 0);
    for (let i = 0; i < stackCount; i++) {
      this.pendingRailguns.push({
        playerId: player.id,
        castAt: now,
        releaseAt: now + interval * i,
        sequence: i
      });
    }

    player.skillCdLeft = sk.cooldownMs / 1000;
  }

  _releaseDueBowRailguns(now) {
    if (!this.pendingRailguns?.length) return;

    const waiting = [];
    for (const shot of this.pendingRailguns) {
      if (shot.releaseAt > now) {
        waiting.push(shot);
        continue;
      }

      const player = this.players[shot.playerId];
      if (!player || player.isDead || player.weapon !== 'bow') continue;
      this._fireRailgun(player, now, shot.castAt, shot.sequence);
    }
    this.pendingRailguns = waiting;
  }

  _fireRailgun(player, now, castAt = now, sequence = 0) {
    const sk = SkillConfig.bow;
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const wallDist = Collision.rayToBoundsDistance(player.x, player.y, dirX, dirY, this.mapWidth, this.mapHeight);

    let hitDist = Number.isFinite(wallDist) ? wallDist : Math.max(this.mapWidth, this.mapHeight);
    let hitTarget = null;
    Object.keys(this.players).forEach(tid => {
      const target = this.players[tid];
      if (target.id === player.id || target.isDead || target.isInvincible()) return;
      const d = Collision.rayCircleHitDistance(player.x, player.y, dirX, dirY, target.x, target.y, target.radius);
      if (d !== null && d <= hitDist) {
        hitDist = d;
        hitTarget = target;
      }
    });

    if (hitTarget) {
      const died = hitTarget.takeDamage(sk.damage, 'railgun');
      if (died) this._creditKill(player.id, hitTarget, '레일건으로');
    }

    const effect = {
      id: `${player.id}-railbeam-${castAt}-${sequence}`,
      attackerId: player.id,
      x: player.x,
      y: player.y,
      x2: player.x + dirX * hitDist,
      y2: player.y + dirY * hitDist,
      angle: player.angle,
      weapon: 'bow',
      type: 'railbeam',
      progress: 0,
      timestamp: now,
      lifetime: 420
    };
    this.effects.push(effect);
    this._triggerLocalBowSkillVibration(effect);
  }

  _triggerLocalBowSkillVibrations(effects) {
    effects.forEach(effect => this._triggerLocalBowSkillVibration(effect));
  }

  _triggerLocalBowSkillVibration(effect) {
    if (!effect || effect.type !== 'railbeam' || effect.weapon !== 'bow' || effect.attackerId !== this.localPlayerId) return;

    if (!this.vibratedRailbeamIds) this.vibratedRailbeamIds = new Set();
    const effectId = effect.id || `${effect.attackerId}-${effect.timestamp}`;
    if (this.vibratedRailbeamIds.has(effectId)) return;

    this.vibratedRailbeamIds.add(effectId);
    if (this.vibratedRailbeamIds.size > 64) {
      const oldest = this.vibratedRailbeamIds.values().next().value;
      this.vibratedRailbeamIds.delete(oldest);
    }
    this._vibrateDevice([35, 20, 55]);
  }

  _triggerLocalSpearThrowFeedbacks(effects) {
    effects.forEach(effect => this._triggerLocalSpearThrowFeedback(effect));
  }

  _triggerLocalSpearThrowFeedback(effect) {
    if (!effect || effect.type !== 'railbeam' || effect.weapon !== 'spear' || effect.attackerId !== this.localPlayerId) return;

    if (!this.shakenSpearThrowIds) this.shakenSpearThrowIds = new Set();
    const effectId = effect.id || `${effect.attackerId}-${effect.timestamp}`;
    if (this.shakenSpearThrowIds.has(effectId)) return;

    this.shakenSpearThrowIds.add(effectId);
    if (this.shakenSpearThrowIds.size > 64) {
      const oldest = this.shakenSpearThrowIds.values().next().value;
      this.shakenSpearThrowIds.delete(oldest);
    }

    if (this.camera && typeof this.camera.startShake === 'function') {
      this.camera.startShake(9, 260);
    }
    this._vibrateDevice([45, 25, 35]);
  }

  _vibrateDevice(pattern) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers expose the API but block vibration by policy.
      }
    }
  }

  /**
   * Spear skill: instantly throw to the wall, then return to the owner.
   * Cooldown only starts once it is retrieved.
   */
  _throwSpear(player, now) {
    // Mark the skill as in-use immediately to prevent re-activation.
    player.spearThrown = true;

    // Play the windup (pull-back) animation. Actual throw executes after it completes.
    const WINDUP_MS = 240;
    this.effects.push({
      attackerId: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      weapon: 'spear',
      type: 'spear_windup',
      progress: 0,
      timestamp: now,
      lifetime: WINDUP_MS
    });

    // Lock the throw direction at the moment F is pressed; player may move freely
    // during the windup but the spear flies in the aimed direction.
    if (!this.pendingSpearThrows) this.pendingSpearThrows = [];
    this.pendingSpearThrows.push({
      playerId: player.id,
      angle: player.angle,
      releaseAt: now + WINDUP_MS
    });
  }

  _processSpearThrowQueue(now) {
    if (!this.pendingSpearThrows?.length) return;

    this.pendingSpearThrows = this.pendingSpearThrows.filter(pending => {
      if (now < pending.releaseAt) return true; // still winding up

      const player = this.players[pending.playerId];
      if (!player || player.isDead) {
        // Player left or died during windup — free the skill state.
        if (player) {
          player.spearThrown = false;
          player.skillCdLeft = 0;
        }
        return false;
      }

      this._executeSpearThrow(player, pending, now);
      return false;
    });
  }

  _executeSpearThrow(player, pending, now) {
    const sk = SkillConfig.spear;
    const angle = pending.angle;  // locked aim direction from when F was pressed
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Hitscan from player's CURRENT position in the locked direction.
    const wallDist = Collision.rayToBoundsDistance(player.x, player.y, dirX, dirY, this.mapWidth, this.mapHeight);
    const travelDist = Number.isFinite(wallDist) ? wallDist : Math.max(this.mapWidth, this.mapHeight);
    const endX = Math.max(5, Math.min(this.mapWidth - 5, player.x + dirX * travelDist));
    const endY = Math.max(5, Math.min(this.mapHeight - 5, player.y + dirY * travelDist));

    // Spawn the returning javelin at the wall endpoint.
    const returnSpeed = sk.returnSpeed || 760;
    const proj = new Projectile(
      `${player.id}-javelin-${now}`,
      player.id,
      endX, endY,
      angle + Math.PI,
      returnSpeed,
      Infinity,
      sk.returnDamage || sk.damage,
      'thrownspear'
    );
    proj.bornAt = now;
    proj.returnStartedAt = now;
    proj.phase = 'return';
    proj.stuck = false;
    proj.hitSet = new Set();
    proj.vx = -dirX * returnSpeed;
    proj.vy = -dirY * returnSpeed;
    proj.angle = angle + Math.PI;
    proj.weapon = 'spear';
    this.projectiles.push(proj);

    // Railbeam and vibration feedback.
    const throwEffect = {
      id: `${player.id}-spear-rail-${now}`,
      attackerId: player.id,
      x: player.x, y: player.y,
      x2: endX, y2: endY,
      angle,
      weapon: 'spear',
      type: 'railbeam',
      progress: 0,
      timestamp: now,
      lifetime: 260
    };
    this.effects.push(throwEffect);
    this._triggerLocalSpearThrowFeedback(throwEffect);

    this._damageSpearThrowPath(player, dirX, dirY, travelDist);
  }

  _damageSpearThrowPath(player, dirX, dirY, maxDist) {
    const sk = SkillConfig.spear;
    Object.keys(this.players).forEach(tid => {
      const target = this.players[tid];
      if (target.id === player.id || target.isDead || target.isInvincible()) return;
      const hitDist = Collision.rayCircleHitDistance(
        player.x,
        player.y,
        dirX,
        dirY,
        target.x,
        target.y,
        (target.radius || 14) + 5
      );
      if (hitDist === null || hitDist > maxDist) return;

      const died = target.takeDamage(sk.damage, 'javelin');
      if (died) this._creditKill(player.id, target, '투창으로');
    });
  }

  _updateThrownSpear(proj, deltaTime, now) {
    const owner = this.players[proj.ownerId];
    const sk = SkillConfig.spear;
    const elapsed = now - (proj.returnStartedAt || proj.bornAt || now);

    // Owner left or died → drop the spear and free the skill.
    if (!owner || owner.isDead) {
      proj.isDead = true;
      if (owner) {
        owner.spearThrown = false;
        owner.skillCdLeft = sk.cooldownMs / 1000;
      }
      return;
    }

    if (proj.phase !== 'return') proj.phase = 'return';
    if (!proj.hitSet) proj.hitSet = new Set();

    const dx = owner.x - proj.x;
    const dy = owner.y - proj.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 20 || elapsed >= (sk.returnMs || 1800)) {
      proj.isDead = true;
      owner.spearThrown = false;
      owner.skillCdLeft = sk.cooldownMs / 1000;
      return;
    }

    const timeLeft = Math.max(0.001, ((sk.returnMs || 1800) - elapsed) / 1000);
    const speed = Math.max(sk.returnSpeed || 760, dist / timeLeft);
    const ux = dx / dist;
    const uy = dy / dist;
    proj.vx = ux * speed;
    proj.vy = uy * speed;
    proj.angle = Math.atan2(uy, ux);
    proj.x += proj.vx * deltaTime;
    proj.y += proj.vy * deltaTime;

    // Damage each enemy at most once while the javelin returns.
    Object.keys(this.players).forEach(tid => {
      const target = this.players[tid];
      if (target.id === proj.ownerId || target.isDead || target.isInvincible() || proj.hitSet.has(target.id)) return;
      if (Collision.checkProjectileHit(proj, target)) {
        proj.hitSet.add(target.id);
        const died = target.takeDamage(sk.returnDamage || sk.damage, 'javelin');
        if (died) this._creditKill(proj.ownerId, target, '투창으로');
      }
    });
  }

  _sendLocalInput(now) {
    const keys = sanitizeInputKeys(this.input.keys);
    const aimAngle = Number.isFinite(this.input.aimAngle) ? this.input.aimAngle : 0;
    const signature = [
      keys.w ? 1 : 0,
      keys.a ? 1 : 0,
      keys.s ? 1 : 0,
      keys.d ? 1 : 0,
      keys.ArrowUp ? 1 : 0,
      keys.ArrowDown ? 1 : 0,
      keys.ArrowLeft ? 1 : 0,
      keys.ArrowRight ? 1 : 0,
      aimAngle.toFixed(3)
    ].join('');

    if (signature === this.lastInputSignature && now - this.lastInputSentAt < 100) {
      return;
    }

    this.lastInputSignature = signature;
    this.lastInputSentAt = now;
    this.networkManager.sendToHost(Protocol.clientInput(keys));
    this.networkManager.sendToHost(Protocol.clientAim(aimAngle));
  }

  /**
   * Client-side Coordinate linear interpolations for buffer frames
   */
  _updateClientInterpolations(deltaTime) {
    const now = Date.now();

    // Locally drain i-frame / buff timers so the white dash flash and buff aura
    // fade smoothly at 60fps between the ~22Hz host snapshots.
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.iframeTimeLeft > 0) p.iframeTimeLeft = Math.max(0, p.iframeTimeLeft - deltaTime);
      if (p.buffTimeLeft > 0) p.buffTimeLeft = Math.max(0, p.buffTimeLeft - deltaTime);
      if (p.stunTimeLeft > 0) p.stunTimeLeft = Math.max(0, p.stunTimeLeft - deltaTime);
    });

    // Smoothly drag and interpolate positions
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead || id === this.localPlayerId) return; // Wait, allow server correction directly, except local player has prediction

      // Linear correction step (interpolate ~30% of the distance each frame)
      // This bridges the 20Hz network update to 60Hz screen rates beautifully!
      if (p.targetX !== undefined) {
        p.x += (p.targetX - p.x) * 0.3;
        p.y += (p.targetY - p.y) * 0.3;
        p.angle = lerpAngle(p.angle, p.targetAngle, 0.35);
      }
    });

    // Client ticks local projectile moves
    this.projectiles.forEach(p => {
      p.update(deltaTime);
      p.checkWallCollision(this.mapWidth, this.mapHeight);
    });
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    // Client decays melee overlay effects locally for perfect visuals
    this.effects.forEach(e => {
      const elapsed = now - e.timestamp;
      e.progress = Math.min(elapsed / e.lifetime, 1);
    });
    this.effects = this.effects.filter(e => e.progress < 1);

    this._updateHUD();
  }

  /**
   * Render composite scene
   */
  _renderFrame() {
    // Generate simple state packet to supply to standard renderer
    const state = {
      players: this.players,
      projectiles: this.projectiles,
      effects: this.effects,
      // Pass mouse in canvas-buffer-space so the renderer can draw the cursor crosshair.
      cursorPos: this.input ? { x: this.input.mouse.x, y: this.input.mouse.y } : null
    };

    this.renderer.render(
      state,
      this.localPlayerId,
      this.camera,
      this.mapWidth,
      this.mapHeight,
      this.visualSettings
    );
  }

  /**
   * Host: Serialize entire scene state to send out
   */
  _broadcastState() {
    const playerSnapshots = {};
    Object.keys(this.players).forEach(id => {
      playerSnapshots[id] = this.players[id].serialize();
    });

    const projectileSnapshots = this.projectiles.map(p => p.serialize());

    // Host effects are compiled dynamically as well
    const payload = Protocol.gameState(
      playerSnapshots,
      projectileSnapshots,
      this.effects,
      this.remainingPlayersCount
    );

    this.networkManager.broadcast(payload);
  }

  /**
   * Sync stats to overlay HUD displays
   */
  _updateHUD() {
    const local = this.players[this.localPlayerId];
    if (!local) return;

    // HP Bar
    const hpBar = document.getElementById('hudHpBar');
    const hpText = document.getElementById('hudHpText');
    const hpPct = Math.max(0, local.hp / local.maxHp) * 100;
    
    if (hpBar) hpBar.style.width = `${hpPct}%`;
    if (hpText) hpText.textContent = `${Math.ceil(local.hp)} / ${local.maxHp}`;

    // Stats counts
    const killsEl = document.getElementById('hudKills');
    if (killsEl) killsEl.textContent = local.kills;

    const aliveEl = document.getElementById('hudAlive');
    if (aliveEl) {
      if (this.networkManager.isHost) {
        aliveEl.textContent = this.remainingPlayersCount;
      } else {
        aliveEl.textContent = this.remainingPlayersCount || Object.keys(this.players).filter(id => !this.players[id].isDead).length;
      }
    }

    const nameEl = document.getElementById('hudName');
    if (nameEl) nameEl.textContent = local.nickname.toUpperCase();

    const weaponEl = document.getElementById('hudWeapon');
    if (weaponEl) weaponEl.textContent = Weapons[local.weapon]?.name || 'UNKNOWN';

    const roomEl = document.getElementById('hudRoomCode');
    if (roomEl) roomEl.textContent = this.networkManager.roomCode || 'NONE';

    // Latency
    const pingEl = document.getElementById('hudPing');
    const indicatorEl = document.getElementById('latencyIndicator');
    if (pingEl) {
      if (this.networkManager.isHost) {
        pingEl.textContent = '지연 시간: 0 ms';
        if (indicatorEl) indicatorEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-teal-400';
      } else {
        const pingVal = this.networkManager.latency;
        pingEl.textContent = `지연 시간: ${pingVal} ms`;

        if (indicatorEl) {
          if (pingVal < 80) indicatorEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-green-500';
          else if (pingVal < 185) indicatorEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-yellow-500';
          else indicatorEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-red-600';
        }
      }
    }

    // Skill (F) + Dash (Space) cooldown indicators
    this._updateAbilityHud(local);

    // Respawn Countdown Overlay
    const respawnOverlay = document.getElementById('respawnOverlay');
    const respawnProgressBar = document.getElementById('respawnProgressBar');
    const respawnTimerText = document.getElementById('respawnTimerText');
    
    if (respawnOverlay) {
      if (local.isDead) {
        respawnOverlay.classList.remove('hidden');
        if (respawnTimerText) {
          const remainingSec = ((local.respawnRemainingMs || 0) / 1000).toFixed(1);
          respawnTimerText.textContent = `${remainingSec}s`;
        }
        if (respawnProgressBar) {
          const pct = Math.min(100, Math.max(0, ((local.respawnRemainingMs || 0) / 2500) * 100));
          respawnProgressBar.style.width = `${pct}%`;
        }
      } else {
        respawnOverlay.classList.add('hidden');
      }
    }
  }

  /**
   * Update the F-skill and Space-dash readiness widgets.
   */
  _updateAbilityHud(local) {
    const weaponColor = Weapons[local.weapon]?.color || '#45f3ff';

    const skillState = document.getElementById('hudSkillState');
    const skillBar = document.getElementById('hudSkillBar');
    if (skillState && skillBar) {
      const sk = SkillConfig[local.weapon];
      if (local.buffTimeLeft > 0) {
        const total = (sk?.buffMs || 1) / 1000;
        skillState.textContent = `버프 ${local.buffTimeLeft.toFixed(1)}s`;
        skillBar.style.width = `${clamp01(local.buffTimeLeft / total) * 100}%`;
        skillBar.style.background = weaponColor;
      } else if (local.greatswordChargeStart > 0) {
        const totalMs = sk?.chargeMaxMs || 3000;
        const chargedMs = Date.now() - local.greatswordChargeStart;
        skillState.textContent = `차지 ${(Math.min(totalMs, chargedMs) / 1000).toFixed(1)}s`;
        skillBar.style.width = `${clamp01(chargedMs / totalMs) * 100}%`;
        skillBar.style.background = weaponColor;
      } else if (local.daggerQte) {
        skillState.textContent = local.daggerQte.phase === 'window' ? 'QTE!' : '표식';
        skillBar.style.width = '100%';
        skillBar.style.background = weaponColor;
      } else if (local.stunTimeLeft > 0) {
        skillState.textContent = `스턴 ${local.stunTimeLeft.toFixed(1)}s`;
        skillBar.style.width = '100%';
        skillBar.style.background = '#f97316';
      } else if (local.spearThrown) {
        skillState.textContent = '비행 중';
        skillBar.style.width = '100%';
        skillBar.style.background = weaponColor;
      } else if (local.skillCdLeft > 0) {
        const total = (sk?.cooldownMs || 1) / 1000;
        skillState.textContent = `${local.skillCdLeft.toFixed(1)}s`;
        skillBar.style.width = `${clamp01(1 - local.skillCdLeft / total) * 100}%`;
        skillBar.style.background = '#4b5563';
      } else if (local.weapon === 'bow') {
        const stacks = Math.min(sk?.maxStacks || 5, local.arrowStacks || 0);
        skillState.textContent = `${stacks}/${sk?.maxStacks || 5} 스택`;
        skillBar.style.width = `${clamp01(stacks / (sk?.maxStacks || 5)) * 100}%`;
        skillBar.style.background = stacks > 0 ? weaponColor : '#4b5563';
      } else {
        skillState.textContent = '준비!';
        skillBar.style.width = '100%';
        skillBar.style.background = weaponColor;
      }
    }

    const dashState = document.getElementById('hudDashState');
    const dashBar = document.getElementById('hudDashBar');
    if (dashState && dashBar) {
      if (local.dashCdLeft > 0) {
        const total = DashConfig.cooldownMs / 1000;
        dashState.textContent = `${local.dashCdLeft.toFixed(1)}s`;
        dashBar.style.width = `${clamp01(1 - local.dashCdLeft / total) * 100}%`;
        dashBar.style.background = '#4b5563';
      } else {
        dashState.textContent = '준비!';
        dashBar.style.width = '100%';
        dashBar.style.background = '#22d3ee';
      }
    }
  }

  /**
   * Display floating text notifications
   */
  _announce(text) {
    const textEl = document.getElementById('announcementText');
    if (!textEl) return;

    // Reset Animation class triggers
    textEl.classList.remove('animate-announcement');
    // Force DOM flow repaint
    void textEl.offsetWidth;

    textEl.textContent = text;
    textEl.classList.add('animate-announcement');
  }

  /**
   * Spawner positions math
   */
  _getRandomSpawnPoint() {
    const radius = 14;
    const margin = 100;
    
    // Prevent spawning on borders
    const xMin = margin;
    const xMax = this.mapWidth - margin;
    const yMin = margin;
    const yMax = this.mapHeight - margin;

    // Try finding far coordinate
    let chosenX = Math.random() * (xMax - xMin) + xMin;
    let chosenY = Math.random() * (yMax - yMin) + yMin;

    // If other players exist, try up to 8 times to get a point at least 250px away
    for (let attempts = 0; attempts < 8; attempts++) {
      let isTooClose = false;
      
      for (const id in this.players) {
        const other = this.players[id];
        if (other.isDead) continue;
        
        const dx = other.x - chosenX;
        const dy = other.y - chosenY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 250) {
          isTooClose = true;
          break;
        }
      }

      if (!isTooClose) break;

      chosenX = Math.random() * (xMax - xMin) + xMin;
      chosenY = Math.random() * (yMax - yMin) + yMin;
    }

    return { x: chosenX, y: chosenY };
  }

  /**
   * Tear down loops and close windows
   */
  _endGame(showLeaderboard, winnerName) {
    // Show End Modal
    const overlay = document.getElementById('resultOverlay');
    const title = document.getElementById('resultTitle');
    const desc = document.getElementById('resultDesc');
    
    if (overlay && title && desc) {
      overlay.classList.remove('hidden');

      if (winnerName === this.players[this.localPlayerId]?.nickname) {
        title.style.color = '#eab308'; // Gold yellow
        title.textContent = '최후의 승리';
        desc.textContent = `축하합니다! 전장의 모든 결투자를 물리치고 생존에 성공하셨습니다!`;
      } else {
        title.style.color = '#ef4444'; // Red
        title.textContent = '아쉬운 생존 실패';
        desc.textContent = `최종 생존자는 "${winnerName}" 입니다. 더 나은 전술을 다듬어 한 번 더 도전해 보세요!`;
      }
    }
  }

  /**
   * Leave Game Cleanup
   */
  quit() {
    if (this._hasQuit) return;

    this._hasQuit = true;
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this._resizeBound);
    this._cleanupVisualSettingsPanel();
    
    // Clear background tab active preservation loops
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
    }
    if (this.backgroundIntervalId) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }

    this.pendingSwordWaves = [];
    this.pendingRailguns = [];
    this.pendingSpearThrows = [];
    this.pendingMeleeHits = [];
    this.pendingRapierStrikes = [];
    this.pendingHammerSlams = [];
    this.vibratedRailbeamIds = new Set();
    this.shakenSpearThrowIds = new Set();
    this.canvas.style.cursor = '';
    this.input.cleanUp(this.canvas);
    if (this.networkManager) {
      this.networkManager.stop();
    }

    // Hide result overlay
    const overlay = document.getElementById('resultOverlay');
    if (overlay) overlay.classList.add('hidden');

    if (this.onQuitCallback) {
      this.onQuitCallback();
    }
  }

  /**
   * Wire network listeners to coordinate mutations
   */
  _setupNetworkCallbacks() {
    // HOST RECEIVES PLAYER DATA EXCHANGES
    this.networkManager.on('onPlayerJoined', (remoteId, joinPayload) => {
      if (!this.networkManager.isHost || !this.isRunning) return;

      // 1. Double check capacity or duplicate IDs
      if (this.players[remoteId]) return;

      // 2. Select elegant far coordinate to spawn newcomer
      const spawnP = this._getRandomSpawnPoint();
      const nickname = sanitizeNickname(joinPayload.nickname);
      const weapon = Weapons[joinPayload.weapon] ? joinPayload.weapon : 'sword';
      const guestPlayer = new Player(remoteId, nickname, weapon, spawnP.x, spawnP.y);
      this.players[remoteId] = guestPlayer;

      this._announce(`${guestPlayer.nickname}님이 전장에 입장했습니다!`);

      // 3. Serialise existing player lists to supply to joining guest as initial context
      const existingPlayers = {};
      Object.keys(this.players).forEach(id => {
        existingPlayers[id] = this.players[id].serialize();
      });

      // 4. Send hand-shake ROOM_JOINED acceptance packed specifically to the guest
      this.networkManager.sendTo(remoteId, Protocol.roomJoined(
        remoteId, 
        existingPlayers, 
        this.mapWidth, 
        this.mapHeight
      ));

      // 5. Broadcast to everyone else that a new player entered
      this.networkManager.broadcast({
        type: MsgType.PLAYER_JOINED,
        player: guestPlayer.serialize()
      });
    });

    // GUEST JOINS SUCCESSFULLY
    this.networkManager.on('onConnected', () => {
      this._announce('서버 연결 성공! 동기화 중...');
    });

    // NETWORK EXCHANGES (CLIENT + HOST ROUTING SEPARATIONS)
    this.networkManager.on('onData', (fromId, data) => {
      const now = Date.now();

      if (this.networkManager.isHost) {
        // --- HOST HANDLERS ---
        const player = this.players[fromId];
        if (!player || player.isDead) return;

        if (data.type === MsgType.PLAYER_INPUT) {
          player.keys = sanitizeInputKeys(data.keys);
        } else if (data.type === MsgType.PLAYER_AIM) {
          if (Number.isFinite(data.angle)) {
            player.angle = data.angle;
          }
        } else if (data.type === MsgType.PLAYER_ACTION) {
          this._handlePlayerAction(player, data, now);
        }
      }
      
      else {
        // --- CLIENT HANDLERS ---
        if (data.type === MsgType.ROOM_JOINED) {
          this.localPlayerId = data.id;
          this.mapWidth = data.mapWidth;
          this.mapHeight = data.mapHeight;
          
          // Reconstitute players list
          this.players = {};
          Object.keys(data.initialPlayers).forEach(id => {
            const snap = data.initialPlayers[id];
            const p = new Player(snap.id, snap.nickname, snap.weapon, snap.x, snap.y);
            p.deserialize(snap);
            this.players[id] = p;
          });

          this._announce('전투가 시작되었습니다!');
        } 
        
        else if (data.type === MsgType.PLAYER_JOINED) {
          const snap = data.player;
          if (!this.players[snap.id]) {
            const newcomer = new Player(snap.id, snap.nickname, snap.weapon, snap.x, snap.y);
            newcomer.deserialize(snap);
            this.players[snap.id] = newcomer;
            this._announce(`${newcomer.nickname}님이 전장에 입장했습니다!`);
          }
        } 
        
        else if (data.type === MsgType.GAME_STATE) {
          // Reconcile and snap correct positions
          this.remainingPlayersCount = data.remainingPlayersCount;

          // 1. Synchronize other players
          Object.keys(data.players).forEach(id => {
            const snap = data.players[id];
            let p = this.players[id];
            
            if (!p) {
              p = new Player(id, snap.nickname, snap.weapon, snap.x, snap.y);
              this.players[id] = p;
            }

            p.kills = snap.kills;
            p.isDead = snap.isDead;
            p.nickname = snap.nickname || p.nickname;
            p.weapon = Weapons[snap.weapon] ? snap.weapon : p.weapon;
            p.maxHp = positiveFinite(snap.maxHp) ? snap.maxHp : (Weapons[p.weapon]?.maxHp || p.maxHp || 100);
            p.hp = Number.isFinite(snap.hp) ? Math.min(snap.hp, p.maxHp) : p.maxHp;
            p.respawnRemainingMs = snap.respawnRemainingMs || 0;
            p.iframeTimeLeft = (snap.iframeMs || 0) / 1000;
            p.buffType = snap.buffType || null;
            p.buffTimeLeft = (snap.buffMs || 0) / 1000;
            p.skillCdLeft = (snap.skillCdMs || 0) / 1000;
            p.dashCdLeft = (snap.dashCdMs || 0) / 1000;
            p.stunTimeLeft = (snap.stunMs || 0) / 1000;
            p.spearThrown = Boolean(snap.spearThrown);
            p.arrowStacks = Math.max(0, Math.floor(snap.arrowStacks || 0));
            p.greatswordChargeStart = snap.greatswordChargeMs > 0 ? Date.now() - snap.greatswordChargeMs : 0;
            p.daggerQte = snap.daggerQte ? {
              targetId: snap.daggerQte.targetId,
              phase: snap.daggerQte.phase || 'lock',
              actionAt: Date.now() + Math.max(0, Math.round(snap.daggerQte.actionMs || 0)),
              perfectAt: Date.now() + Math.max(0, Math.round(snap.daggerQte.perfectMs || 0)),
              expiresAt: Date.now() + Math.max(0, Math.round(snap.daggerQte.expiresMs || 0))
            } : null;
            p.comboStep = Math.max(0, Math.floor(snap.comboStep || 0));
            p.comboDelayUntil = Date.now() + Math.max(0, Math.round(snap.comboDelayMs || 0));
            p.color = snap.color;
            p.accentColor = snap.accentColor;

            if (id !== this.localPlayerId) {
              // Soft buffer coordinates for smooth client interpolation
              p.targetX = snap.x;
              p.targetY = snap.y;
              p.targetAngle = snap.angle;
            } else {
              // Absolute correction on local coordinates if too far from host state to solve client desyncs
              const correctionDistance = localCorrectDist(p.x, p.y, snap.x, snap.y);
              if (p.isDead || correctionDistance > 45) {
                p.x = snap.x;
                p.y = snap.y;
              }
              if (p.isDead && Number.isFinite(snap.angle)) {
                p.angle = snap.angle;
              }
            }
          });

          // Delete clients that left server state
          Object.keys(this.players).forEach(id => {
            if (!data.players[id]) {
              delete this.players[id];
            }
          });

          // 2. Synchronize projectiles: recreate Projectile instances
          this.projectiles = data.projectiles.map(snap => {
            // Prefer the host's explicit heading (a stuck spear has zero velocity).
            const angle = Number.isFinite(snap.angle) ? snap.angle : Math.atan2(snap.vy, snap.vx);
            const proj = new Projectile(
              snap.id,
              snap.ownerId,
              snap.x,
              snap.y,
              angle,
              snap.speed || Weapons.bow.speed,
              snap.maxRange === null ? Infinity : (snap.maxRange ?? Weapons.bow.range),
              snap.damage || Weapons.bow.damage,
              snap.kind || 'arrow'
            );
            // Keep the host's exact velocity so client extrapolation matches.
            if (Number.isFinite(snap.vx)) proj.vx = snap.vx;
            if (Number.isFinite(snap.vy)) proj.vy = snap.vy;
            proj.weapon = snap.weapon || (snap.kind === 'greatswordwave' ? 'greatsword' : proj.weapon);
            proj.isDead = snap.isDead;
            return proj;
          });

          // 3. Reconcile active effects against this client's own clock.
          this.effects = (data.effects || [])
            .map(effectSnap => rebaseEffectSnapshot(effectSnap, now))
            .filter(effect => effect.progress < 1);
          this._triggerLocalBowSkillVibrations(this.effects);
          this._triggerLocalSpearThrowFeedbacks(this.effects);

          // 4. Removed Legacy Battle Royale Victory/Elimination triggers
          // (Now operating in dynamic infinite deathmatch respawn loop)
        } 
        
        else if (data.type === MsgType.ERROR) {
          const statusEl = document.getElementById('statusMsg');
          if (statusEl) {
            statusEl.textContent = data.message;
            statusEl.classList.remove('hidden');
          }
          this.quit();
        }
      }
    });

    // GUEST LEVEL VANISHED
    this.networkManager.on('onPlayerLeft', (remoteId) => {
      const p = this.players[remoteId];
      if (p) {
        this._announce(`${p.nickname}님이 전장에서 후퇴했습니다.`);
        // If Host, kill player object
        if (this.networkManager.isHost) {
          p.isDead = true;
          // Trigger broadcast change so other guests see death state / remove player
          delete this.players[remoteId];
          this._broadcastState();
        } else {
          delete this.players[remoteId];
        }
      }
    });

    // GUEST COLD DROP
    this.networkManager.on('onDisconnected', (reason) => {
      const errMsg = reason || '매치메이킹 서버와의 연결이 끊어졌습니다.';
      const statusEl = document.getElementById('statusMsg');
      if (statusEl) {
        statusEl.textContent = errMsg;
        statusEl.classList.remove('hidden');
      }
      this.quit();
    });

    // PEER CONFIG OR ACCESS REGISTRATION ERROR
    this.networkManager.on('onError', (errMsg) => {
      const statusEl = document.getElementById('statusMsg');
      if (statusEl) {
        statusEl.textContent = errMsg;
        statusEl.classList.remove('hidden');
      }
    });
  }
}

export function rebaseEffectSnapshot(effectSnap, now = Date.now()) {
  const lifetime = positiveFinite(effectSnap?.lifetime) ? effectSnap.lifetime : 300;
  let progress = Number.isFinite(effectSnap?.progress) ? effectSnap.progress : 0;

  if (!Number.isFinite(effectSnap?.progress) && Number.isFinite(effectSnap?.timestamp)) {
    progress = (now - effectSnap.timestamp) / lifetime;
  }

  progress = clamp01(progress);

  // Spread the snapshot so newer effect fields (x2/y2, radius, buffType)
  // survive the rebase, then override only the timing fields.
  return {
    ...(effectSnap || {}),
    progress,
    timestamp: now - progress * lifetime,
    lifetime
  };
}

function dirFromKeys(keys = {}) {
  let dx = 0;
  let dy = 0;
  if (keys.w || keys.ArrowUp) dy -= 1;
  if (keys.s || keys.ArrowDown) dy += 1;
  if (keys.a || keys.ArrowLeft) dx -= 1;
  if (keys.d || keys.ArrowRight) dx += 1;
  return { dx, dy };
}

function sanitizeNickname(value) {
  const nickname = String(value || '').trim().replace(/[^\p{L}\p{N}_ -]/gu, '').slice(0, 12);
  return nickname || 'Gladiator';
}

function sanitizeInputKeys(keys = {}) {
  return {
    w: Boolean(keys.w),
    a: Boolean(keys.a),
    s: Boolean(keys.s),
    d: Boolean(keys.d),
    ArrowUp: Boolean(keys.ArrowUp),
    ArrowDown: Boolean(keys.ArrowDown),
    ArrowLeft: Boolean(keys.ArrowLeft),
    ArrowRight: Boolean(keys.ArrowRight)
  };
}

function lerpAngle(current, target, amount) {
  if (!Number.isFinite(target)) return current;

  let delta = target - current;
  while (delta < -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return current + delta * amount;
}

function localCorrectDist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleDistance(a, b) {
  let delta = a - b;
  while (delta < -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return Math.abs(delta);
}

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
