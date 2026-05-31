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
import { Weapons } from './Weapons.js';
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

    // Trigger frame animations
    this._resizeCanvas();
    this.animationFrameId = requestAnimationFrame((t) => this._gameLoop(t));
    
    window.addEventListener('resize', this._resizeBound);
  }

  // Bind resize context
  _resizeBound = () => this._resizeCanvas();

  _resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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
          this.input.updateAimAngle(hp, this.camera, this.canvas.width, this.canvas.height);
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
        this.input.updateAimAngle(localPlayer, this.camera, this.canvas.width, this.canvas.height);

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

    // 3. Process Automatic attack queues
    Object.keys(this.players).forEach(id => {
      const p = this.players[id];
      if (p.isDead) return;

      const weaponConfig = Weapons[p.weapon];
      
      // Automatic Attack on cooldown trigger
      if (p.canAttack(now)) {
        const swingDirection = p.triggerAttack(now);

        // Melee trigger
        if (weaponConfig.type !== 'projectile') {
          // Record slash animations directly
          const localFx = {
            attackerId: p.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            weapon: p.weapon,
            type: weaponConfig.type,
            swingDirection,
            progress: 0,
            timestamp: now,
            lifetime: weaponConfig.cooldown * 0.75 // Effect decays before next weapon ready
          };
          this.effects.push(localFx);

          // Calculate Damage
          Object.keys(this.players).forEach(tid => {
            const target = this.players[tid];
            if (Collision.checkMeleeHit(p, target, weaponConfig)) {
              const died = target.takeDamage(weaponConfig.damage, p.nickname);
              if (died) {
                p.kills++;
                this._announce(`${p.nickname}님이 ${target.nickname}님을 처치했습니다!`);
              }
            }
          });
        } 
        
        // Ranged trigger (bow Projectile)
        else {
          const spawnDist = p.radius + 3;
          const arrowId = `${p.id}-arrow-${now}`;
          this.effects.push({
            attackerId: p.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            weapon: p.weapon,
            type: 'projectile_shot',
            progress: 0,
            timestamp: now,
            lifetime: Math.min(weaponConfig.cooldown * 0.45, 260)
          });

          // Spawn arrow
          const proj = new Projectile(
            arrowId,
            p.id,
            p.x + Math.cos(p.angle) * spawnDist,
            p.y + Math.sin(p.angle) * spawnDist,
            p.angle,
            weaponConfig.speed,
            weaponConfig.range,
            weaponConfig.damage
          );
          this.projectiles.push(proj);
        }
      }
    });

    // 4. Update and check projectile hits
    this.projectiles.forEach(proj => {
      if (proj.isDead) return;

      proj.update(deltaTime);
      if (proj.checkWallCollision(this.mapWidth, this.mapHeight)) {
        this.effects.push({
          attackerId: proj.ownerId,
          x: proj.x,
          y: proj.y,
          angle: Math.atan2(proj.vy, proj.vx),
          weapon: 'bow',
          type: 'projectile_burst',
          progress: 0,
          timestamp: now,
          lifetime: 320
        });
        return;
      }

      // Check hit detections
      Object.keys(this.players).forEach(tid => {
        const target = this.players[tid];
        if (proj.isDead) return;

        if (Collision.checkProjectileHit(proj, target)) {
          proj.isDead = true;
          const died = target.takeDamage(proj.damage, 'arrow');
          if (died) {
            const killer = this.players[proj.ownerId];
            if (killer) {
              killer.kills++;
              this._announce(`${killer.nickname}님이 활로 ${target.nickname}님을 처치했습니다!`);
            } else {
              this._announce(`${target.nickname}님이 전사했습니다.`);
            }
          }
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
      effects: this.effects
    };

    this.renderer.render(
      state, 
      this.localPlayerId, 
      this.camera, 
      this.mapWidth, 
      this.mapHeight
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
    
    // Clear background tab active preservation loops
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
    }
    if (this.backgroundIntervalId) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }

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

            p.hp = snap.hp;
            p.kills = snap.kills;
            p.isDead = snap.isDead;
            p.nickname = snap.nickname || p.nickname;
            p.weapon = Weapons[snap.weapon] ? snap.weapon : p.weapon;
            p.respawnRemainingMs = snap.respawnRemainingMs || 0;
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
            // Calculate arrow rotation angle based on velocities
            const angle = Math.atan2(snap.vy, snap.vx);
            const proj = new Projectile(
              snap.id,
              snap.ownerId,
              snap.x,
              snap.y,
              angle,
              snap.speed || Weapons.bow.speed,
              snap.maxRange === null ? Infinity : (snap.maxRange ?? Weapons.bow.range),
              snap.damage || Weapons.bow.damage
            );
            proj.isDead = snap.isDead;
            return proj;
          });

          // 3. Reconcile active effects against this client's own clock.
          this.effects = (data.effects || [])
            .map(effectSnap => rebaseEffectSnapshot(effectSnap, now))
            .filter(effect => effect.progress < 1);

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

  return {
    x: effectSnap?.x,
    y: effectSnap?.y,
    angle: effectSnap?.angle,
    weapon: effectSnap?.weapon,
    type: effectSnap?.type,
    attackerId: effectSnap?.attackerId,
    swingDirection: effectSnap?.swingDirection,
    progress,
    timestamp: now - progress * lifetime,
    lifetime
  };
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

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
