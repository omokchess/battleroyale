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

// Dom Elements
const authScreen = document.getElementById('authScreen');
const lobbyMenu = document.getElementById('lobbyMenu');
const gameScreen = document.getElementById('gameScreen');
const gameCanvas = document.getElementById('gameCanvas');

const nicknameInput = document.getElementById('nicknameInput');
const hostRoomInput = document.getElementById('hostRoomInput');
const joinRoomInput = document.getElementById('joinRoomInput');

const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const resultLobbyBtn = document.getElementById('resultLobbyBtn');

const weaponCards = document.querySelectorAll('.weapon-card');
const weaponStats = document.getElementById('weaponStats');
const statusMsg = document.getElementById('statusMsg');
const hostServerIndicator = document.getElementById('hostServerIndicator');

const roomListContainer = document.getElementById('roomListContainer');
const roomListStatus = document.getElementById('roomListStatus');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');

let netManager = null;
let activeGame = null;

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

  // Tint each weapon card's icon with that weapon's own color (matches the swap list).
  weaponCards.forEach(card => {
    const svg = card.querySelector('svg');
    const cfg = Weapons[card.dataset.weapon];
    if (svg && cfg) svg.style.stroke = cfg.color;
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
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[#45f3ff] font-bold mb-1">
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
 * 3. Match Hosting workflow
 */
hostBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomCode = hostRoomInput.value.trim();

  if (!nickname) {
    showError('방을 만들기 전에 닉네임을 입력해 주세요.');
    return;
  }
  if (!roomCode || roomCode.length < 3) {
    showError('방 코드는 최소 3글자 이상이어야 합니다.');
    return;
  }

  hideError();
  hostBtn.disabled = true;
  hostBtn.textContent = 'P2P 세션 할당 중...';

  // Instantiate network manager
  netManager = new NetworkManager();

  netManager.on('onInit', (allocatedCode) => {
    hostBtn.disabled = false;
    hostBtn.textContent = '방 만들기';

    enterGameScreen(true);

    // Run Game (apply the player's equipped costume colors, if any)
    activeGame = new Game(gameCanvas, netManager, accountUI.getEquippedCostume());
    activeGame.start((stats) => {
      // Match ended / disconnected — award coins then return to lobby.
      handleMatchEnd(stats);
    });

    // Advertise the room so other devices can find it in their list.
    const weapon = document.querySelector('.weapon-card.selected')?.dataset.weapon || 'sword';
    roomRegistry.startHosting(allocatedCode, () => ({
      host: nickname,
      weapon,
      players: activeGame ? Object.keys(activeGame.players).length : 1
    }));
  });

  netManager.on('onError', (err) => {
    hostBtn.disabled = false;
    hostBtn.textContent = '방 만들기';
    showError(err);
    netManager.stop();
  });

  // Host the server
  netManager.hostRoom(roomCode);
});

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

  // Create registration payload frame (carry costume so the host paints us correctly)
  const joinPayload = Protocol.joinRoom(nickname, chosenWeapon, accountUI.getEquippedCostume());

  netManager.on('onConnected', () => {
    joinBtn.disabled = false;
    joinBtn.textContent = '참가';

    enterGameScreen(false);

    activeGame = new Game(gameCanvas, netManager, accountUI.getEquippedCostume());
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
function enterGameScreen(isHost) {
  lobbyMenu.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  hostServerIndicator.classList.toggle('hidden', !isHost);
  stopLobbyBrowsing();
}

function showLobbyScreen() {
  lobbyMenu.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  hostServerIndicator.classList.add('hidden');

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

leaveBtn.addEventListener('click', () => {
  if (confirm('정말 전장에서 이탈하시겠습니까? 이번 판은 패배 처리됩니다!')) {
    if (activeGame) {
      activeGame.quit();
    }
  }
});

resultLobbyBtn.addEventListener('click', () => {
  if (activeGame) {
    activeGame.quit();
  }
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
  const sig = rooms.map(r => `${r.code}|${r.host}|${r.weapon}|${r.players}`).join(';');
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
    return `
      <button class="room-row w-full text-left bg-[#0b0c10] border-2 border-gray-700 hover:border-[#66fcf1] p-2.5 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2" data-code="${code}">
        <div class="min-w-0">
          <div class="font-mono text-sm text-white font-bold truncate">${code}</div>
          <div class="font-mono text-[10px] text-gray-400 truncate">${uiIcon('user')} ${host} · <span style="color:${cfg.color}">${cfg.name}</span></div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-mono text-[10px] text-[#66fcf1] font-bold">${uiIcon('play')}참가</div>
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
 * Match end: record this session's kills (→ coins) for the logged-in player,
 * then return to the lobby. `stats.kills` is passed by Game.quit().
 */
async function handleMatchEnd(stats) {
  showLobbyScreen();
  const kills = stats && stats.kills ? stats.kills : 0;
  if (kills > 0) {
    try {
      await accountUI.reportMatch(kills);
    } catch (e) {
      console.error('reportMatch failed', e);
    }
  }
}

// Run Setup on page launch
setupWeaponSelector();
buildWeaponSwitchPanel();

// Auth gate: account-ui resolves the session and tells us which screen to show.
accountUI.init({
  onEnterLobby: (profile) => {
    // If a match is already running (e.g. a token-refresh auth event fired),
    // don't yank the player out of the game.
    if (activeGame) return;

    authScreen?.classList.add('hidden');
    lobbyMenu.classList.remove('hidden');

    // Prefill the nickname from the account, unless the user already typed one.
    if (profile && nicknameInput && !nicknameInput.value.trim()) {
      nicknameInput.value = profile.username || '';
    }

    startLobbyBrowsing();
  },
  onRequireLogin: () => {
    authScreen?.classList.remove('hidden');
    lobbyMenu.classList.add('hidden');
    gameScreen.classList.add('hidden');
    stopLobbyBrowsing();
  },
});
