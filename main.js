/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkManager } from './multiplayer/NetworkManager.js';
import { Game } from './game/Game.js';
import { Weapons } from './game/Weapons.js';
import { Protocol } from './multiplayer/Protocol.js';

// Dom Elements
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

let netManager = null;
let activeGame = null;

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
  } else if (cfg.type === 'projectile') {
    extraDetails = `• 화살 속도: ${cfg.speed}px/s`;
  }

  weaponStats.innerHTML = `
    <div class="flex justify-between text-[#45f3ff] font-bold mb-1">
      <span>${cfg.name.toUpperCase()}</span>
      <span>재사용 대기시간: ${(cfg.cooldown / 1000).toFixed(2)}초</span>
    </div>
    <p class="text-[10px] text-gray-400 mb-1 leading-snug">${cfg.description}</p>
    <div class="grid grid-cols-3 gap-1 font-mono text-[10px] text-gray-300">
      <span>⚔️ 공격력: <strong class="text-white">${cfg.damage}</strong></span>
      <span>📏 사거리: <strong class="text-white">${cfg.range}px</strong></span>
      <span class="truncate">${extraDetails}</span>
    </div>
  `;
}

/**
 * 2. Room codes validation (letters, numbers only)
 */
[hostRoomInput, joinRoomInput].forEach(inp => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    hideError();
  });
});

nicknameInput.addEventListener('input', () => {
  nicknameInput.value = nicknameInput.value.replace(/[^a-zA-Z0-9가-힣 ]/g, ''); // Alpha, numbers, Korean and spacing
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

    // Transition overlay styles
    lobbyMenu.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    hostServerIndicator.classList.remove('hidden');

    // Run Game
    activeGame = new Game(gameCanvas, netManager);
    activeGame.start(() => {
      // Disconnected callback (return to lobby view)
      showLobbyScreen();
    });
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
 * 4. Match Joining workflow
 */
joinBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomCode = joinRoomInput.value.trim();
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

  // Create registration registration payload frame
  const joinPayload = Protocol.joinRoom(nickname, chosenWeapon);

  netManager.on('onConnected', () => {
    joinBtn.disabled = false;
    joinBtn.textContent = '방 참가하기';

    lobbyMenu.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    hostServerIndicator.classList.add('hidden'); // Guest - hide isHost badge

    activeGame = new Game(gameCanvas, netManager);
    activeGame.start(() => {
      showLobbyScreen();
    });
  });

  netManager.on('onError', (err) => {
    joinBtn.disabled = false;
    joinBtn.textContent = '방 참가하기';
    showError(err);
    netManager.stop();
  });

  // Query and join room code
  netManager.joinRoom(roomCode, joinPayload);
});

/**
 * 5. Leave or game result quit actions
 */
function showLobbyScreen() {
  lobbyMenu.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  hostServerIndicator.classList.add('hidden');
  
  if (activeGame) {
    activeGame = null;
  }
  if (netManager) {
    netManager = null;
  }
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

// Run Setup on page launch
window.addEventListener('DOMContentLoaded', () => {
  setupWeaponSelector();
});
