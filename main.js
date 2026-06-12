/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkManager } from './multiplayer/NetworkManager.js';
import { Game } from './game/Game.js';
import { Weapons } from './game/Weapons.js';
import { Protocol } from './multiplayer/Protocol.js';
import { RoomRegistry } from './multiplayer/RoomRegistry.js';
import * as accountUI from './ui/account-ui.js';
import { isMobileDevice, isPhoneDevice } from './game/Device.js';
import { normalizeRoomConfig, roomConfigBadges } from './game/RoomConfig.js';
import { Sound } from './game/Sound.js';

// Dom Elements
const authScreen = document.getElementById('authScreen');
const bootScreen = document.getElementById('bootScreen');
const lobbyMenu = document.getElementById('lobbyMenu');
const gameScreen = document.getElementById('gameScreen');
const gameCanvas = document.getElementById('gameCanvas');

const nicknameInput = document.getElementById('nicknameInput');
const hostRoomInput = document.getElementById('hostRoomInput');
const joinRoomInput = document.getElementById('joinRoomInput');

const hostBtn = document.getElementById('hostBtn');
const dummyBtn = document.getElementById('dummyBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');

const openRoomCustomBtn = document.getElementById('openRoomCustomBtn');
const roomCustomModal = document.getElementById('roomCustomModal');
const roomCustomClose = document.getElementById('roomCustomClose');
const healingRateRow = document.getElementById('healingRateRow');

const weaponCards = document.querySelectorAll('.weapon-card');
const weaponStats = document.getElementById('weaponStats');
const statusMsg = document.getElementById('statusMsg');
const hostServerIndicator = document.getElementById('hostServerIndicator');

const roomListContainer = document.getElementById('roomListContainer');
const roomListStatus = document.getElementById('roomListStatus');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');

let netManager = null;
let activeGame = null;

// --- Sound setup: unlock audio on first gesture, sync mute toggles, UI blips.
(function setupSound() {
  const unlockOnce = () => Sound.unlock();
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  const syncMuteButtons = (muted) => {
    document.querySelectorAll('.mute-toggle').forEach(btn => {
      btn.textContent = muted ? '🔇 음소거' : '🔊 소리';
      btn.classList.toggle('opacity-60', muted);
    });
  };
  syncMuteButtons(Sound.isMuted());
  Sound.onMuteChange(syncMuteButtons);

  // Delegated UI sounds for every button (lobby + HUD). Gameplay action buttons
  // and the mute toggles handle their own audio, so skip them here.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    Sound.unlock();
    if (btn.classList.contains('mute-toggle')) {
      Sound.toggleMute();
      if (!Sound.isMuted()) Sound.play('ui');
      return;
    }
    if (btn.classList.contains('mobile-action-btn')) return; // gameplay, not UI
    Sound.play(btn.id === 'hostBtn' || btn.id === 'dummyBtn' ? 'uiConfirm' : 'ui');
  }, true);
})();

function registerPwa() {
  if (!('serviceWorker' in navigator)) return;
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalhost) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(err => {
      console.warn('PWA service worker registration failed', err);
    });
  });
}

// Cross-device room presence (broker-backed, localStorage fallback).
const roomRegistry = new RoomRegistry();

const UI_ICONS = {
  attack: '<path d="M14.5 3.5l6 6"/><path d="M2.5 21.5l7-7"/><path d="M8.5 13.5l2 2"/><path d="M12.5 9.5l2 2"/><path d="M9.5 14.5l5-5"/>',
  hp: '<path d="M12 21s-7.5-4.8-9.4-9.2C1.1 8.3 3.2 5 6.8 5c2 0 3.4 1.1 4.2 2.3C11.8 6.1 13.2 5 15.2 5c3.6 0 5.7 3.3 4.2 6.8C19.5 16.2 12 21 12 21z" fill="currentColor" stroke="none"/>',
  range: '<path d="M4 18L18 4"/><path d="M8 20l12-12"/><path d="M5 14l5 5"/><path d="M9 10l5 5"/><path d="M13 6l5 5"/>',
  speed: '<path d="M4 13a8 8 0 0 1 15.4-3"/><path d="M12 13l5-5"/><path d="M4 17h5"/><path d="M3 21h8"/>',
  online: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  storage: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4.1 4.2-6 8-6s6.6 1.9 8 6"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21c1-3.5 3.2-5 6-5s5 1.5 6 5"/><path d="M16 11a3 3 0 1 0-1.4-5.7"/><path d="M18 21c-.4-1.7-1.2-3-2.4-3.9"/>'
};

const WEAPON_ICON_VERSION = '20260607c';

function uiIcon(name, className = 'inline-block w-3 h-3 align-[-2px] mr-1 shrink-0') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[name] || ''}</svg>`;
}

/**
 * 1. Weapon Selector UI setup
 */
function setupWeaponSelector() {
  weaponCards.forEach(card => {
    card.addEventListener('click', () => {
      // Toggle CSS selection
      weaponCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const chosenWeapon = card.dataset.weapon;
      displayWeaponStats(chosenWeapon);
    });
  });

  // Show the real PNG weapon art in each lobby card (replaces the placeholder SVGs).
  weaponCards.forEach(card => {
    const w = card.dataset.weapon;
    const iconBox = card.querySelector('div');
    if (iconBox && w) {
      // Fill the (wider, 4-column) card so the weapon art reads large on every
      // screen, capped so it never gets cartoonishly big on desktop.
      iconBox.style.width = '100%';
      iconBox.style.height = 'auto';
      iconBox.style.aspectRatio = '1 / 1';
      iconBox.style.maxWidth = '5.25rem';
      // Stand every weapon upright pointing downward in the picker — except the
      // bow, whose sprite is already drawn vertically. The greatsword sprite
      // points the opposite way, so flip it a further 180° to match the others.
      let rot = 'transform:rotate(90deg);';
      if (w === 'bow') rot = '';
      else if (w === 'greatsword') rot = 'transform:rotate(270deg);';
      iconBox.innerHTML =
        `<img src="/assets/weapons/${w}.png?v=${WEAPON_ICON_VERSION}" alt="${w}" draggable="false" ` +
        `class="w-full h-full object-contain" style="image-rendering:pixelated;${rot}" />`;
    }
  });

  // Pre-select default sword
  const defaultCard = document.querySelector('.weapon-card[data-weapon="sword"]');
  if (defaultCard) {
    defaultCard.click();
  }
}

function displayWeaponStats(weaponType) {
  const cfg = Weapons[weaponType];
  if (!cfg) return;

  let extraDetails = '';
  if (cfg.type === 'melee_arc') {
    extraDetails = `• 범위: 전방 부채꼴 (${cfg.angle}° 각도)`;
  } else if (cfg.type === 'melee_circle') {
    extraDetails = '• 범위: 주변 360° 회전';
  } else if (cfg.type === 'melee_line') {
    extraDetails = `• 범위: 정방향 직선 (${cfg.width}px 폭)`;
  } else if (cfg.type === 'melee_heavy_arc') {
    extraDetails = `범위: 예열 후 중량 베기 (${cfg.angle}도)`;
  } else if (cfg.type === 'melee_sweet_arc') {
    extraDetails = `범위: 바깥날 강화 (${cfg.innerRange}px 밖)`;
  } else if (cfg.type === 'melee_backstab') {
    extraDetails = `범위: 돌진 찌르기, 배후 피해 ${cfg.backstabDamage}`;
  } else if (cfg.type === 'melee_precise_line') {
    extraDetails = `범위: 정밀 직선 (${cfg.width}px), 중심 피해 ${cfg.critDamage}`;
  } else if (cfg.type === 'melee_slam') {
    extraDetails = `범위: 지연 원형 충격파 (${cfg.innerRange}px 안쪽 강화)`;
  } else if (cfg.type === 'projectile') {
    extraDetails = Number.isFinite(cfg.speed) ? `• 투사체 속도: ${cfg.speed}px/s` : '• 투사체 속도: ∞ (즉시 명중)';
  }
  const rangeLabel = Number.isFinite(cfg.range) ? `${cfg.range}px` : '벽까지';
  const moveSpeedLabel = formatSpeedRatio(cfg.moveSpeed);
  const autoAttackDisabled = cfg.automaticAttack === false;
  const cooldownLabel = autoAttackDisabled ? '평타 없음' : `재사용 대기시간: ${(cfg.cooldown / 1000).toFixed(2)}초`;
  const damageLabel = Number.isFinite(cfg.damage) ? cfg.damage : '∞ (즉사)';
  const attackLabel = autoAttackDisabled
    ? `${uiIcon('attack')}평타: <strong class="text-white">없음</strong>`
    : `${uiIcon('attack')}공격력: <strong class="text-white">${damageLabel}</strong>`;

  weaponStats.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[#e6c75a] font-bold mb-1">
      <span class="whitespace-nowrap">${cfg.name.toUpperCase()}</span>
      <span class="whitespace-nowrap">${cooldownLabel}</span>
    </div>
    <p class="text-[10px] text-gray-400 mb-1 leading-snug break-keep whitespace-normal">${cfg.description}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-gray-300 leading-snug">
      <span class="min-w-0 whitespace-nowrap">${attackLabel}</span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('hp')}체력: <strong class="text-white">${cfg.maxHp || 100}</strong></span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('range')}사거리: <strong class="text-white">${rangeLabel}</strong></span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('speed')}이동속도: <strong class="text-white">${moveSpeedLabel}</strong></span>
      <span class="min-w-0 break-keep whitespace-normal">${extraDetails}</span>
    </div>
    <p class="mt-2 pt-2 border-t border-gray-700 text-[10px] leading-snug break-keep whitespace-normal" style="color:${cfg.color}">${cfg.skill || ''}</p>
  `;
}

function formatSpeedRatio(value) {
  const ratio = Number.isFinite(value) ? value : 1;
  return `${Number.isInteger(ratio) ? ratio.toFixed(0) : ratio.toFixed(1)}x`;
}

/**
 * 2. Room codes validation (letters, numbers only)
 */
[hostRoomInput, joinRoomInput].forEach(inp => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
    hideError();
  });
});

nicknameInput.addEventListener('input', () => {
  nicknameInput.value = nicknameInput.value.replace(/[^\p{L}\p{N}_ -]/gu, '');
  hideError();
});

function showError(msg) {
  statusMsg.textContent = msg;
  statusMsg.classList.remove('hidden');
}

function hideError() {
  statusMsg.classList.add('hidden');
}

/**
 * 3. Room custom modal — arena size / storm / cover / healing.
 * Segmented option groups: clicking a button selects it within its group.
 */
function openRoomCustom() {
  if (!roomCustomModal) return;
  hideError();
  roomCustomModal.classList.remove('hidden');
  // Prefill the room code from whatever the user may have typed before.
  const codeInput = document.getElementById('hostRoomInput');
  if (codeInput && !codeInput.value) codeInput.focus();
}
function closeRoomCustom() {
  if (roomCustomModal) roomCustomModal.classList.add('hidden');
}

if (openRoomCustomBtn) openRoomCustomBtn.addEventListener('click', openRoomCustom);
if (roomCustomClose) roomCustomClose.addEventListener('click', closeRoomCustom);
if (roomCustomModal) roomCustomModal.addEventListener('click', (e) => {
  if (e.target === roomCustomModal) closeRoomCustom(); // tap backdrop = cancel
});

// Segmented-group selection: one active option per [data-config-group].
if (roomCustomModal) roomCustomModal.addEventListener('click', (e) => {
  const opt = e.target.closest('.cfg-opt');
  if (!opt) return;
  const group = opt.closest('[data-config-group]');
  if (!group) return;
  group.querySelectorAll('.cfg-opt').forEach(b => b.classList.toggle('selected', b === opt));
  // Healing rate row only matters when healing is ON.
  if (group.dataset.configGroup === 'healing' && healingRateRow) {
    healingRateRow.classList.toggle('hidden', opt.dataset.value !== 'on');
  }
});

/** Read the currently selected room settings out of the modal. */
function readRoomConfig() {
  const pick = (group, fallback) => {
    const el = roomCustomModal
      ? roomCustomModal.querySelector(`[data-config-group="${group}"] .cfg-opt.selected`)
      : null;
    return el ? el.dataset.value : fallback;
  };
  return normalizeRoomConfig({
    arenaSize: pick('arenaSize', 'tiny'),
    storm: pick('storm', 'off') === 'on',
    cover: pick('cover', 'none'),
    healing: pick('healing', 'off') === 'on',
    healingRate: pick('healingRate', 'normal'),
  });
}

// The local player's full appearance: equipped costume colors + the cosmetic
// loadout (weapon skin / kill fx / dash trail / respawn fx / title). Passed to
// Game and into JOIN_ROOM so everyone renders it.
function localAppearance() {
  return Object.assign({}, accountUI.getEquippedCostume() || {}, {
    cosmetics: accountUI.getEquippedCosmetics(),
  });
}

/**
 * 3. Match Hosting workflow
 */
function doHost(dummy = false) {
  const nickname = nicknameInput.value.trim();
  const roomCode = hostRoomInput.value.trim();
  const btn = dummy ? dummyBtn : hostBtn;
  const idleLabel = dummy ? '더미방 생성' : '방 생성';
  const roomConfig = readRoomConfig();

  if (!nickname) {
    showError('방을 만들기 전에 닉네임을 입력해 주세요.');
    return;
  }
  if (!roomCode || roomCode.length < 3) {
    showError('방 코드는 최소 3글자 이상이어야 합니다.');
    return;
  }

  hideError();
  closeRoomCustom();
  if (btn) { btn.disabled = true; btn.textContent = 'P2P 세션 할당 중...'; }

  // Instantiate network manager
  netManager = new NetworkManager();

  netManager.on('onInit', (allocatedCode) => {
    if (btn) { btn.disabled = false; btn.textContent = idleLabel; }

    enterGameScreen(true);

    // Run Game (apply the player's equipped costume colors + cosmetics + room settings)
    activeGame = new Game(gameCanvas, netManager, localAppearance(), { dummyRoom: dummy, roomConfig });
    activeGame.start((stats) => {
      // Match ended / disconnected — award coins then return to lobby.
      handleMatchEnd(stats);
    });

    // Advertise the room so other devices can find it in their list.
    const weapon = document.querySelector('.weapon-card.selected')?.dataset.weapon || 'sword';
    roomRegistry.startHosting(allocatedCode, () => ({
      host: nickname,
      weapon,
      players: activeGame ? Object.values(activeGame.players).filter(p => !p.isDummy).length : 1,
      dummy,
      config: activeGame ? activeGame.roomConfig : roomConfig
    }));
  });

  netManager.on('onError', (err) => {
    if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    showError(err);
    netManager.stop();
  });

  // Host the server
  netManager.hostRoom(roomCode);
}

hostBtn.addEventListener('click', () => doHost(false));
if (dummyBtn) dummyBtn.addEventListener('click', () => doHost(true));

/**
 * 4. Match Joining workflow (shared by the Join button and room-list clicks)
 */
function startJoin(rawCode) {
  const nickname = nicknameInput.value.trim();
  const roomCode = String(rawCode || '').trim();
  const chosenWeapon = document.querySelector('.weapon-card.selected')?.dataset.weapon || 'sword';

  if (!nickname) {
    showError('방에 참가하기 전에 닉네임을 입력해 주세요.');
    return;
  }
  if (!roomCode || roomCode.length < 3) {
    showError('방 코드는 최소 3글자 이상이어야 합니다.');
    return;
  }

  hideError();
  joinBtn.disabled = true;
  joinBtn.textContent = '연결 중...';

  netManager = new NetworkManager();

  // Create registration payload frame (carry costume so the host paints us
  // correctly, and isMobile so the host gives touch players instant-fire).
  const joinPayload = Protocol.joinRoom(nickname, chosenWeapon, localAppearance(), isMobileDevice());

  netManager.on('onConnected', () => {
    joinBtn.disabled = false;
    joinBtn.textContent = '참가';

    enterGameScreen(false);

    activeGame = new Game(gameCanvas, netManager, localAppearance());
    activeGame.start((stats) => {
      handleMatchEnd(stats);
    });
  });

  netManager.on('onError', (err) => {
    joinBtn.disabled = false;
    joinBtn.textContent = '참가';
    showError(err);
    netManager.stop();
  });

  // Query and join room code
  netManager.joinRoom(roomCode, joinPayload);
}

joinBtn.addEventListener('click', () => startJoin(joinRoomInput.value.trim()));

/**
 * 5. Lobby / game screen transitions
 */
/**
 * On mobile, force the arena into landscape so the wide battlefield fits. This
 * is best-effort: orientation lock needs fullscreen on most browsers and is
 * unsupported on iOS Safari, so every call is guarded and never throws.
 */
async function lockLandscapeForArena() {
  if (!isMobileDevice()) return;
  try {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) { /* unsupported — leave orientation as-is */ }
}

function releaseLandscapeLock() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch (_) {}
}

/**
 * Phones (NOT tablets) lock to portrait while in the lobby so the stacked menu
 * reads naturally. Best-effort: orientation lock needs an installed PWA /
 * fullscreen on most browsers and is unsupported on iOS Safari, so it never
 * throws and silently no-ops where the platform disallows it.
 */
async function lockPortraitForLobby() {
  if (!isPhoneDevice()) { releaseLandscapeLock(); return; }
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('portrait').catch(() => {});
    } else {
      releaseLandscapeLock();
    }
  } catch (_) {
    releaseLandscapeLock();
  }
}

function enterGameScreen(isHost) {
  lobbyMenu.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  hostServerIndicator.classList.toggle('hidden', !isHost);
  stopLobbyBrowsing();
  lockLandscapeForArena();
}

function showLobbyScreen() {
  lobbyMenu.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  hostServerIndicator.classList.add('hidden');
  lockPortraitForLobby();

  // Tear down any room advertisement and resume browsing the list.
  roomRegistry.stopHosting();

  if (activeGame) {
    activeGame = null;
  }
  if (netManager) {
    netManager = null;
  }

  startLobbyBrowsing();
}

const leaveConfirmModal = document.getElementById('leaveConfirmModal');
const leaveConfirmYes = document.getElementById('leaveConfirmYes');
const leaveConfirmNo = document.getElementById('leaveConfirmNo');

function openLeaveConfirm() {
  if (!leaveConfirmModal) {            // fallback if markup is missing
    if (activeGame) activeGame.quit();
    return;
  }
  leaveConfirmModal.classList.remove('hidden');
}
function closeLeaveConfirm() {
  if (leaveConfirmModal) leaveConfirmModal.classList.add('hidden');
}

leaveBtn.addEventListener('click', openLeaveConfirm);
if (leaveConfirmYes) leaveConfirmYes.addEventListener('click', () => {
  closeLeaveConfirm();
  if (activeGame) activeGame.quit();
});
if (leaveConfirmNo) leaveConfirmNo.addEventListener('click', closeLeaveConfirm);
if (leaveConfirmModal) leaveConfirmModal.addEventListener('click', (e) => {
  if (e.target === leaveConfirmModal) closeLeaveConfirm(); // tap backdrop = cancel
});

/**
 * 6. Room list browser
 */
function startLobbyBrowsing() {
  roomRegistry.startBrowsing(renderRoomList);
  updateRoomListStatus();
}

function stopLobbyBrowsing() {
  roomRegistry.stopBrowsing();
  lastRoomSig = null; // force a fresh render next time the lobby opens
}

function updateRoomListStatus() {
  if (!roomListStatus) return;
  roomListStatus.innerHTML = roomRegistry.online
    ? `${uiIcon('online')}온라인 - 다른 기기의 방도 표시됩니다`
    : `${uiIcon('storage')}로컬 모드 - 같은 브라우저 탭만 표시`;
}

let lastRoomSig = null;

function renderRoomList(rooms) {
  if (!roomListContainer) return;
  updateRoomListStatus();

  // Skip rebuilding identical DOM (the prune timer fires every 2.5s).
  const sig = rooms.map(r => `${r.code}|${r.host}|${r.weapon}|${r.players}|${r.dummy ? 1 : 0}|${roomConfigBadges(r.config).join(',')}`).join(';');
  if (sig === lastRoomSig) return;
  lastRoomSig = sig;

  if (!rooms.length) {
    roomListContainer.innerHTML =
      '<div class="text-gray-500 font-mono text-[11px] text-center py-8">열려 있는 방이 없습니다.<br>왼쪽에서 방을 만들어 보세요!</div>';
    return;
  }

  roomListContainer.innerHTML = rooms.map(room => {
    const cfg = Weapons[room.weapon] || Weapons.sword;
    const code = escapeHtml(room.code);
    const host = escapeHtml(room.host || room.code);
    const players = Number.isFinite(room.players) ? room.players : 1;
    const isDummy = !!room.dummy;
    // Dummy (practice) rooms get a bold red border + badge so they're obvious.
    const borderCls = isDummy
      ? 'border-red-500 hover:border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.35)]'
      : 'border-gray-700 hover:border-[#c9a227]';
    const dummyBadge = isDummy
      ? '<span class="font-mono text-[9px] text-red-300 border border-red-500 px-1 py-0.5 uppercase shrink-0">더미방</span>'
      : '';
    // Room-setting badges (arena size always shown; storm/cover/healing when on).
    const badges = roomConfigBadges(room.config)
      .map(b => `<span class="font-mono text-[9px] text-[#e6c75a] border border-[#7a5a28] bg-[#1a120a] px-1 py-0.5 uppercase">${escapeHtml(b)}</span>`)
      .join('');
    const badgeRow = badges
      ? `<div class="flex flex-wrap gap-1 mt-1">${badges}</div>`
      : '';
    return `
      <button class="room-row w-full text-left bg-[#1a120a] border-2 ${borderCls} p-2.5 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2" data-code="${code}">
        <div class="min-w-0">
          <div class="font-mono text-sm text-white font-bold truncate flex items-center gap-1.5">${dummyBadge}<span class="truncate">${code}</span></div>
          <div class="font-mono text-[10px] text-gray-400 truncate">${uiIcon('user')} ${host} · <span style="color:${cfg.color}">${cfg.name}</span></div>
          ${badgeRow}
        </div>
        <div class="text-right shrink-0">
          <div class="font-mono text-[10px] ${isDummy ? 'text-red-300' : 'text-[#e6c75a]'} font-bold">${uiIcon('play')}참가</div>
          <div class="font-mono text-[10px] text-green-400">${uiIcon('users')}${players}명</div>
        </div>
      </button>`;
  }).join('');
}

if (roomListContainer) {
  roomListContainer.addEventListener('click', (e) => {
    const row = e.target.closest('.room-row');
    if (!row) return;
    const code = row.dataset.code;
    if (joinRoomInput) joinRoomInput.value = code;
    startJoin(code);
  });
}

if (refreshRoomsBtn) {
  refreshRoomsBtn.addEventListener('click', () => {
    renderRoomList(roomRegistry.list());
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/**
 * In-game weapon switch panel (applied on next respawn).
 */
function setWeaponPanelOpen(open) {
  const panel = document.getElementById('weaponSwitchPanel');
  const backdrop = document.getElementById('weaponPanelBackdrop');
  if (panel) panel.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('open', open);
}

function buildWeaponSwitchPanel() {
  const list = document.getElementById('weaponSwitchList');
  if (!list) return;
  list.innerHTML = Object.keys(Weapons).map(key => {
    const cfg = Weapons[key];
    return `<button type="button" data-weapon="${key}" class="weapon-switch" style="color:${cfg.color}">`
      + `<span class="ws-accent" aria-hidden="true"></span>`
      + `<span class="ws-name">${cfg.name}</span>`
      + `</button>`;
  }).join('');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.weapon-switch');
    if (!btn || !activeGame) return;
    activeGame.requestWeaponChange(btn.dataset.weapon);
    setWeaponPanelOpen(false); // mobile: dismiss after picking (desktop bar stays open via CSS)
  });

  const toggle = document.getElementById('weaponPanelToggle');
  if (toggle) toggle.addEventListener('click', () => {
    const panel = document.getElementById('weaponSwitchPanel');
    setWeaponPanelOpen(!(panel && panel.classList.contains('open')));
  });
  const backdrop = document.getElementById('weaponPanelBackdrop');
  if (backdrop) backdrop.addEventListener('click', () => setWeaponPanelOpen(false));
}

/**
 * Mobile lobby tabs. The lobby stacks vertically and is painful to scroll on
 * phones, so on mobile we show one section at a time via a bottom tab bar.
 * Desktop is unaffected: `.lobby-tab-hidden` only does anything below `lg`
 * (see styles.css), so all sections stay visible side-by-side on desktop.
 *
 * IMPORTANT: this only toggles a presentation class on existing sections — no
 * account/login element is moved, renamed, or rewired, so the Supabase auth
 * flow (account-ui.js) is completely untouched.
 */
function setupLobbyTabs() {
  const tabs = document.querySelectorAll('.lobby-tab');
  if (!tabs.length) return;

  const setHidden = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('lobby-tab-hidden', on);
  };

  // Desktop shows all three columns at once; on mobile each tab reveals exactly
  // one. Weapon + create share the middle column, so they also toggle inside it.
  function setTab(tab) {
    setHidden('lobbyAccount', tab !== 'mypage');                         // col 1
    setHidden('lobbyLeft', tab !== 'weapon' && tab !== 'create');        // col 2
    setHidden('lobbyRight', tab !== 'join');                             // col 3
    setHidden('lobbyWeapon', tab !== 'weapon');                          // inside col 2
    setHidden('lobbyCreate', tab !== 'create');
    setHidden('lobbyGuide', tab !== 'create');
    tabs.forEach(b => b.classList.toggle('lobby-tab-active', b.dataset.lobbyTab === tab));
  }

  tabs.forEach(b => b.addEventListener('click', () => setTab(b.dataset.lobbyTab)));
  setTab('weapon'); // default landing tab on mobile
}

/**
 * Low Detail (performance mode) toggle surfaced in the lobby's 내 페이지 tab so
 * mobile players can enable it without entering a match first. Persists to the
 * same localStorage key the in-game Renderer reads on start.
 */
function setupLobbyPerfToggle() {
  const box = document.getElementById('lobbyPerfMode');
  if (!box) return;
  const KEY = 'battle_visual_settings_v1';
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
  };
  box.checked = read().performanceMode === undefined ? isMobileDevice() : Boolean(read().performanceMode);
  // If we're defaulting it ON for mobile, persist that once so the in-game panel
  // and Renderer agree on first entry (still fully togglable afterwards).
  if (read().performanceMode === undefined && box.checked) {
    const s = read();
    s.performanceMode = true;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  }
  box.addEventListener('change', () => {
    const s = read();
    s.performanceMode = box.checked;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
    // Keep the in-game settings checkbox in sync if it's already in the DOM.
    const inGame = document.getElementById('settingPerformanceMode');
    if (inGame) inGame.checked = box.checked;
  });
}

/**
 * Match end: record this session's stats (kills → coins, +completion/daily bonus)
 * for the logged-in player, then return to the lobby. `stats` is passed by
 * Game.quit(): { kills, deaths, weapon, durationMs, dummy }.
 * Practice (dummy) rooms are never reported — their kills are excluded server-side
 * anyway, and skipping the report avoids farming the completion/daily bonuses.
 */
async function handleMatchEnd(stats) {
  showLobbyScreen();
  if (stats && stats.dummy) return; // 연습방은 보고하지 않음
  try {
    await accountUI.reportMatch(stats || { kills: 0 });
  } catch (e) {
    console.error('reportMatch failed', e);
  }
}

// Run Setup on page launch
// Touch devices (phones AND large tablets like the Galaxy Tab) must use the
// mobile layout regardless of CSS width — pin it via a root class the stylesheet
// keys off, since the lg/md width breakpoints alone misclassify wide tablets.
if (isMobileDevice()) document.documentElement.classList.add('touch-ui');
registerPwa();
setupWeaponSelector();
buildWeaponSwitchPanel();
setupLobbyTabs();
setupLobbyPerfToggle();

// Auth gate: account-ui resolves the session and tells us which screen to show.
accountUI.init({
  onEnterLobby: (profile) => {
    // If a match is already running (e.g. a token-refresh auth event fired),
    // don't yank the player out of the game.
    if (activeGame) return;

    bootScreen?.classList.add('hidden');
    authScreen?.classList.add('hidden');
    lobbyMenu.classList.remove('hidden');

    // Prefill the nickname from the account, unless the user already typed one.
    if (profile && nicknameInput && !nicknameInput.value.trim()) {
      nicknameInput.value = profile.username || '';
    }

    startLobbyBrowsing();
  },
  onRequireLogin: () => {
    bootScreen?.classList.add('hidden');
    authScreen?.classList.remove('hidden');
    lobbyMenu.classList.add('hidden');
    gameScreen.classList.add('hidden');
    stopLobbyBrowsing();
  },
});
