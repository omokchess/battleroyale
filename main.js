/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkManager } from './multiplayer/NetworkManager.js';
import { Game } from './game/Game.js';
import { Weapons, SkillConfig, AuxSkillConfig, MagicConfig, ComboConfig, getEffectiveWeapon } from './game/Weapons.js';
import { ASSET_VERSION } from './game/SpriteAtlas.js';
import { Renderer } from './game/Renderer.js';
import { Player } from './game/Player.js';
import { Projectile } from './game/Projectile.js';
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
const weaponPreview = document.getElementById('weaponPreview');
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
const NINJA_WEAPON_SPRITES = new Set(['sword','axe','bow','spear','greatsword','scythe','dagger','rapier','hammer','katana','magicstaff','chakram','harpoon','guardian','minebag','sniper','flamethrower','gauntlet','pistols']);

function uiIcon(name, className = 'inline-block w-3 h-3 align-[-2px] mr-1 shrink-0') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[name] || ''}</svg>`;
}

function weaponIconRotation(weaponType) {
  if (weaponType === 'bow') return '';
  if (weaponType === 'greatsword') return 'transform:rotate(270deg);';
  return 'transform:rotate(90deg);';
}

function weaponIconMarkup(weaponType, { preview = false } = {}) {
  const safeWeapon = encodeURIComponent(String(weaponType || 'sword'));
  const className = preview ? 'weapon-preview-art' : 'w-full h-full object-contain';
  if (NINJA_WEAPON_SPRITES.has(weaponType)) {
    const padding = preview ? 'padding:10%;' : 'padding:14%;';
    return `<img src="/assets/ninja/weapon/${safeWeapon}.png?v=${ASSET_VERSION}" alt="${safeWeapon}" draggable="false" class="${className}" style="image-rendering:pixelated;${padding}" />`;
  }
  return `<img src="/assets/weapons/${safeWeapon}.png?v=${WEAPON_ICON_VERSION}" alt="${safeWeapon}" draggable="false" class="${className}" style="image-rendering:pixelated;${weaponIconRotation(weaponType)}" />`;
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

  // Show the weapon art in each lobby card (replaces the placeholder SVGs).
  // Prefer the new Ninja/RPG-icon sprites (displayed upright like inventory
  // icons); weapons without one fall back to the legacy PNG (rotated upright).
  weaponCards.forEach(card => {
    const w = card.dataset.weapon;
    const iconBox = card.querySelector('div');
    if (!iconBox || !w) return;
    iconBox.style.width = '100%';
    iconBox.style.height = 'auto';
    iconBox.style.aspectRatio = '1 / 1';
    iconBox.style.maxWidth = '5.25rem';
    iconBox.innerHTML = weaponIconMarkup(w);
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
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-gray-300 leading-snug">
      <span class="min-w-0 whitespace-nowrap">${attackLabel}</span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('hp')}체력: <strong class="text-white">${cfg.maxHp || 100}</strong></span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('range')}사거리: <strong class="text-white">${rangeLabel}</strong></span>
      <span class="min-w-0 whitespace-nowrap">${uiIcon('speed')}이동속도: <strong class="text-white">${moveSpeedLabel}</strong></span>
      <span class="min-w-0 break-keep whitespace-normal">${extraDetails}</span>
    </div>
    <div class="skill-preview mt-2 pt-2 border-t border-gray-700 text-[10px] leading-snug break-keep">${renderSkillPreview(cfg.skill)}</div>
  `;

  if (weaponPreview) setWeaponPreview(weaponType, cfg);
}

// Live weapon preview — runs the REAL game renderer on a tiny gameState so the
// picker shows the exact in-game motion + effects for the selected weapon.
let _previewState = null;
function _ensurePreview() {
  if (_previewState) return _previewState;
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 400;
  cv.style.cssText = 'width:400px;height:400px;max-width:400px;max-height:400px;image-rendering:pixelated';
  const controls = document.createElement('div');
  controls.className = 'weapon-preview-controls';
  controls.innerHTML = [
    ['basic', '평'],
    ['strong', '강'],
    ['f', 'F'],
    ['r', 'R'],
    ['lmb', 'L']
  ].map(([action, label]) => `<button type="button" class="weapon-preview-action" data-preview-action="${action}">${label}</button>`).join('');
  const renderer = new Renderer(cv);
  const PX = 300, PY = 300, MAP = 600;
  const dummy = new Player('preview', '', 'sword', PX, PY);
  dummy.angle = 0;
  const camera = {
    zoom: 1.5, tracking: false,
    toScreen(x, y, cw, ch) { return { x: cw / 2 + (x - PX) * this.zoom, y: ch / 2 + (y - PY) * this.zoom }; },
    getShakeOffset() { return { x: 0, y: 0 }; },
  };
  _previewState = { cv, controls, renderer, dummy, camera, PX, PY, MAP, effects: [], projectiles: [], mines: [], firePatches: [], pendingSniperShots: [], pendingMagicShards: [], pendingPreviewActions: [], lastFire: 0, swing: 1, raf: 0, last: performance.now(), weaponType: 'sword', greatswordCharge: null };
  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preview-action]');
    if (!btn) return;
    if (btn.dataset.previewSkipClick === '1') {
      btn.dataset.previewSkipClick = '';
      return;
    }
    _previewTrigger(_previewState, btn.dataset.previewAction, Date.now());
  });
  controls.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-preview-action="f"]');
    if (!btn || _previewState?.weaponType !== 'greatsword') return;
    btn.dataset.previewSkipClick = '1';
    _previewGreatswordChargeStart(_previewState, Date.now());
  });
  controls.addEventListener('pointerup', (e) => {
    const btn = e.target.closest('[data-preview-action="f"]');
    if (!btn || _previewState?.weaponType !== 'greatsword') return;
    _previewGreatswordChargeRelease(_previewState, Date.now());
  });
  controls.addEventListener('pointercancel', () => {
    if (_previewState?.weaponType === 'greatsword') _previewGreatswordChargeRelease(_previewState, Date.now());
  });
  return _previewState;
}

function _updatePreviewControls(p, weaponType) {
  const weapon = Weapons[weaponType] || {};
  const combo = ComboConfig[weaponType];
  const canBasic = weapon.automaticAttack !== false;
  const canStrong = canBasic && Boolean(combo?.finisher);
  p.controls.querySelector('[data-preview-action="basic"]')?.toggleAttribute('hidden', !canBasic);
  p.controls.querySelector('[data-preview-action="strong"]')?.toggleAttribute('hidden', !canStrong);
}
function setWeaponPreview(weaponType, cfg) {
  if (!weaponPreview) return;
  const p = _ensurePreview();
  cancelAnimationFrame(p.raf);
  weaponPreview.innerHTML = '';
  p.weaponType = weaponType;
  const stage = document.createElement('div');
  stage.className = 'weapon-preview-stage';
  stage.appendChild(p.cv);
  stage.appendChild(p.controls);
  weaponPreview.appendChild(stage);
  const name = document.createElement('div');
  name.className = 'weapon-preview-name';
  name.textContent = cfg.name || weaponType;
  weaponPreview.appendChild(name);
  _updatePreviewControls(p, weaponType);

  const d = p.dummy;
  d.weapon = weaponType; d.angle = 0;
  d.color = cfg.color || '#9aa2ad';
  d.accentColor = cfg.color || '#c9a227';
  d.maxHp = cfg.maxHp || 100; d.hp = d.maxHp;
  d.isDead = false;
  d.flameSpraying = (weaponType === 'flamethrower');
  d.buffType = null;
  d.pendingIcicles = 0;
  d.chakramOrbitUntil = 0;
  d.heatShieldUntil = 0;
  d.guardianStanceUntil = 0;
  p.effects.length = 0; p.projectiles.length = 0; p.mines.length = 0; p.firePatches.length = 0; p.pendingSniperShots.length = 0; p.pendingMagicShards.length = 0; p.pendingPreviewActions.length = 0; p.greatswordCharge = null; p.lastFire = 0; p.last = performance.now();

  const loop = (t) => {
    const dt = Math.min((t - p.last) / 1000, 0.05); p.last = t; const now = Date.now();
    _previewAutoReleaseGreatsword(p, now);
    _previewReleasePending(p, now);
    p.effects = p.effects.filter(e => { e.progress = (now - e.timestamp) / (e.lifetime || 400); return e.progress < 1; });
    for (const pr of p.projectiles) { if (pr.update) pr.update(dt); }
    p.projectiles = p.projectiles.filter(pr => !pr.isDead && Math.hypot(pr.x - p.PX, pr.y - p.PY) < p.MAP * 0.7);
    p.mines = p.mines.filter(m => !m.expireAt || now < m.expireAt);
    p.firePatches = p.firePatches.filter(fp => !fp.expireAt || now < fp.expireAt);
    const gs = { players: { preview: d }, projectiles: p.projectiles, effects: p.effects,
      mines: p.mines, firePatches: p.firePatches, healingItems: [], cover: [], damagePopups: [], storm: null };
    try { p.renderer.render(gs, null, p.camera, p.MAP, p.MAP, {}); } catch (_) {}
    p.raf = requestAnimationFrame(loop);
  };
  p.raf = requestAnimationFrame(loop);
}
function _previewTrigger(p, action, now) {
  const weaponType = p.weaponType || p.dummy.weapon || 'sword';
  const base = getEffectiveWeapon(weaponType) || Weapons[weaponType] || {};
  if (action === 'basic') {
    _previewFire(p, weaponType, base, now);
  } else if (action === 'strong') {
    _previewStrongAttack(p, weaponType, base, now);
  } else if (action === 'f') {
    if (weaponType === 'greatsword') return _previewGreatswordChargeTap(p, now);
    if (weaponType === 'magicstaff') return _previewMagicFireball(p, now);
    _previewSkill(p, weaponType, SkillConfig[weaponType], now);
  } else if (action === 'r') {
    if (weaponType === 'katana') return _previewKatanaIaijutsu(p, now);
    if (weaponType === 'magicstaff') return _previewMagicLifebound(p, now);
    _previewSkill(p, weaponType, AuxSkillConfig[weaponType]?.alt, now);
  } else if (action === 'lmb') {
    if (weaponType === 'magicstaff') return _previewMagicIce(p, now);
    _previewSkill(p, weaponType, AuxSkillConfig[weaponType]?.target, now);
  }
}

function _previewSkill(p, weaponType, cfg, now) {
  if (!cfg) return _previewTrigger(p, 'strong', now);
  const base = getEffectiveWeapon(weaponType) || Weapons[weaponType] || {};
  if (weaponType === 'sword' && cfg === SkillConfig.sword) {
    _previewSwordSkill(p, now);
    return;
  }
  if (weaponType === 'sniper' && cfg === SkillConfig.sniper) {
    _previewSniperShot(p, now);
    return;
  }
  if (weaponType === 'magicstaff') {
    if (cfg === SkillConfig.magicstaff || cfg === MagicConfig.fireball) return _previewMagicFireball(p, now);
    if (cfg === AuxSkillConfig.magicstaff?.alt || cfg === MagicConfig.lifebound) return _previewMagicLifebound(p, now);
    if (cfg === AuxSkillConfig.magicstaff?.target || cfg === MagicConfig.iceShard) return _previewMagicIce(p, now);
  }
  if (weaponType === 'guardian' && cfg === SkillConfig.guardian) {
    p.dummy.guardianStanceUntil = now + 1200;
    return;
  }
  switch (cfg.type) {
    case 'hitscan':
      _previewSniperBeam(p, now, { weapon: weaponType, range: cfg.range });
      return;
    case 'aimed_shot':
      _previewAimedShot(p, cfg, now);
      return;
    case 'guardian_launch':
      _previewGuardianLaunch(p, cfg, now);
      return;
    case 'guardian_homing':
      _previewGuardianHoming(p, cfg, now);
      return;
    case 'chakram_throw':
      _previewProjectileFan(p, weaponType, cfg, base, now, 'chakram');
      return;
    case 'chakram_orbit':
      p.dummy.chakramOrbitUntil = now + (cfg.durationMs || 1500);
      p.dummy.chakramOrbitRadius = cfg.orbitRadius || 46;
      return;
    case 'fire_bomb':
      _previewExplosion(p, weaponType, cfg, now, cfg.range || 88);
      return;
    case 'heat_shield':
      p.dummy.heatShieldUntil = now + (cfg.durationMs || 1500);
      p.dummy.heatShieldRadius = cfg.contactRadius || 34;
      return;
    case 'place_mine':
      _previewPlaceMine(p, cfg, now);
      return;
    case 'tracer_mine':
      _previewTracerMine(p, cfg, now);
      return;
    case 'dodge_reload':
      _previewDodgeReload(p, cfg, now);
      return;
    default:
      break;
  }
  if (cfg.type === 'projectile' || Number.isFinite(cfg.speed) || Number.isFinite(cfg.waveSpeed) || cfg.projectileKind || cfg.waveCount || cfg.fanCount || cfg.burstCount) {
    _previewProjectileFan(p, weaponType, cfg, base, now);
    return;
  }
  if (weaponType === 'minebag' && cfg === SkillConfig.minebag) {
    _previewExplosion(p, weaponType, { radius: cfg.blastRadius || 60 }, now, 54);
    return;
  }
  if (weaponType === 'flamethrower' && cfg === SkillConfig.flamethrower) {
    const d = p.dummy;
    p.firePatches.push({
      id: `preview-patch-${now}`,
      ownerId: 'preview',
      x: d.x + Math.cos(d.angle) * (cfg.patchRange || 76),
      y: d.y + Math.sin(d.angle) * (cfg.patchRange || 76),
      expireAt: now + (cfg.patchMs || 2500),
      nextTickAt: now
    });
    return;
  }
  if (weaponType === 'axe' && cfg === SkillConfig.axe) {
    p.dummy.buffType = 'axe_rage';
    p.dummy.buffTimeLeft = (cfg.buffMs || 4000) / 1000;
    p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, weapon: weaponType, type: 'buff_activate', buffType: 'axe_rage', progress: 0, timestamp: now, lifetime: 520 });
    return;
  }
  if (weaponType === 'gauntlet' && cfg === SkillConfig.gauntlet) {
    p.dummy.buffType = 'gauntlet_lance';
    p.dummy.buffTimeLeft = (cfg.buffMs || 4000) / 1000;
    p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, weapon: weaponType, type: 'buff_activate', buffType: 'gauntlet_lance', progress: 0, timestamp: now, lifetime: 520 });
    return;
  }
  if (weaponType === 'rapier' && cfg === SkillConfig.rapier) {
    p.dummy.buffType = 'rapier_riposte';
    p.dummy.buffTimeLeft = (cfg.buffMs || 5000) / 1000;
    p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, weapon: weaponType, type: 'buff_activate', buffType: 'rapier_riposte', progress: 0, timestamp: now, lifetime: 520 });
    return;
  }
  if (weaponType === 'hammer' && cfg === SkillConfig.hammer) {
    p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, angle: p.dummy.angle, weapon: weaponType, type: 'hammer_windup', range: cfg.waves?.at(-1)?.range || 156, progress: 0, timestamp: now, lifetime: cfg.previewMs || 1000 });
    (cfg.waves || []).forEach((wave, i) => {
      p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, angle: p.dummy.angle, weapon: weaponType, type: 'melee_slam', range: wave.range, innerRange: i ? (cfg.waves[i - 1].range || 0) : 0, progress: 0, timestamp: now + (cfg.previewMs || 1000) + i * 180, lifetime: 620 });
    });
    return;
  }
  if (weaponType === 'katana' && cfg === SkillConfig.katana) {
    for (let i = 0; i < (cfg.slashCount || 2); i++) {
      _previewFire(p, weaponType, { ...base, type: 'melee_arc', range: cfg.directRange || 82, angle: cfg.directAngle || 130, damage: cfg.directDamage || 40 }, now + i * (cfg.slashIntervalMs || 150), { finisher: true, lifetime: 500 });
      _previewFire(p, weaponType, { type: 'projectile', projectileKind: 'swordwave', projectileWeapon: weaponType, speed: cfg.waveSpeed || 832, range: 260, damage: cfg.waveDamage || 30 }, now + 20 + i * (cfg.slashIntervalMs || 150));
    }
    return;
  }
  if (weaponType === 'dagger' && cfg === SkillConfig.dagger) {
    p.effects.push({ attackerId: 'preview', x: p.dummy.x, y: p.dummy.y, angle: p.dummy.angle, weapon: weaponType, type: 'dagger_qte_lock', progress: 0, timestamp: now, lifetime: cfg.windowMs || 900 });
    p.effects.push({ attackerId: 'preview', x: p.dummy.x + Math.cos(p.dummy.angle) * 54, y: p.dummy.y + Math.sin(p.dummy.angle) * 54, angle: p.dummy.angle, weapon: weaponType, type: 'dagger_qte_hit', progress: 0, timestamp: now + (cfg.perfectMs || 560), lifetime: 360 });
    return;
  }
  if (weaponType === 'spear' && cfg === SkillConfig.spear) {
    _previewSpearThrow(p, cfg, now);
    return;
  }
  if (weaponType === 'harpoon' && cfg === SkillConfig.harpoon) {
    _previewFire(p, weaponType, { type: 'projectile', projectileKind: 'harpoon', projectileWeapon: weaponType, speed: 760, range: cfg.pullRange || 360, damage: Weapons.harpoon?.damage || 16 }, now);
    return;
  }
  if (weaponType === 'pistols' && cfg === SkillConfig.pistols) {
    _previewProjectileFan(p, weaponType, { ...cfg, projectileKind: 'pistol', projectileWeapon: 'pistols' }, base, now);
    return;
  }
  _previewFire(p, weaponType, {
    ...base,
    type: cfg.type || base.type || 'melee_arc',
    range: cfg.range || base.range,
    width: cfg.width || base.width,
    innerRange: cfg.innerRange || base.innerRange,
    angle: cfg.angle || base.angle,
    damage: cfg.damage || base.damage
  }, now, { finisher: false, lifetime: 560 });
}

function _previewStrongAttack(p, weaponType, base, now) {
  const finisher = ComboConfig[weaponType]?.finisher;
  if (!finisher) return;
  _previewFire(p, weaponType, {
    ...base,
    ...finisher,
    cooldown: finisher.cooldown || base.cooldown
  }, now, { finisher: true, lifetime: weaponType === 'sword' ? 940 : 700 });
}

function _previewSwordSkill(p, now) {
  const sk = SkillConfig.sword;
  const base = Weapons.sword;
  _previewFire(p, 'sword', { ...base, type: 'melee_circle', angle: 360, range: 78, damage: base.damage }, now, { finisher: true, lifetime: 760 });
  const count = Math.max(1, sk.waveCount || 3);
  const interval = Math.max(0, sk.waveIntervalMs || 250);
  for (let i = 0; i < count; i++) {
    const fire = releaseNow => _previewFire(p, 'sword', {
      type: 'projectile',
      projectileKind: 'swordwave',
      projectileWeapon: 'sword',
      speed: sk.waveSpeed || 800,
      range: Infinity,
      damage: sk.directDamage || 24
    }, releaseNow);
    const delay = interval * i;
    if (delay > 0) _previewDelay(p, now + delay, fire);
    else fire(now);
  }
}

function _previewSpearThrow(p, cfg, now) {
  const d = p.dummy;
  const windup = 240;
  p.effects.push({
    attackerId: 'preview',
    x: d.x,
    y: d.y,
    angle: d.angle,
    weapon: 'spear',
    type: 'spear_windup',
    progress: 0,
    timestamp: now,
    lifetime: windup
  });
  _previewDelay(p, now + windup, releaseNow => {
    const dirX = Math.cos(d.angle);
    const dirY = Math.sin(d.angle);
    const dist = p.MAP * 0.46;
    const endX = d.x + dirX * dist;
    const endY = d.y + dirY * dist;
    p.effects.push({
      id: `preview-spear-rail-${releaseNow}`,
      attackerId: 'preview',
      x: d.x,
      y: d.y,
      x2: endX,
      y2: endY,
      angle: d.angle,
      weapon: 'spear',
      type: 'railbeam',
      progress: 0,
      timestamp: releaseNow,
      lifetime: 260
    });
    const proj = new Projectile(
      `preview-thrownspear-${releaseNow}`,
      'preview',
      endX,
      endY,
      d.angle + Math.PI,
      cfg.returnSpeed || 760,
      Infinity,
      cfg.returnDamage || cfg.damage || 35,
      'thrownspear'
    );
    proj.weapon = 'spear';
    p.projectiles.push(proj);
  });
}

function _previewGreatswordChargeStart(p, now) {
  if (p.greatswordCharge) return;
  const sk = SkillConfig.greatsword;
  const chargeId = `${now}-${Math.random()}`;
  p.greatswordCharge = { startedAt: now, id: chargeId, releaseAt: now + (sk.chargeMaxMs || 1000) };
  p.effects.push({
    attackerId: 'preview',
    x: p.dummy.x,
    y: p.dummy.y,
    angle: p.dummy.angle,
    weapon: 'greatsword',
    type: 'greatsword_charge',
    range: sk.range,
    angleDeg: sk.angle,
    progress: 0,
    timestamp: now,
    lifetime: (sk.chargeMaxMs || 1000) + 120
  });
  _previewDelay(p, now + (sk.chargeMaxMs || 1000), releaseNow => {
    if (p.greatswordCharge?.id !== chargeId) return;
    _previewGreatswordChargeRelease(p, releaseNow);
  });
}

function _previewAutoReleaseGreatsword(p, now) {
  const charge = p.greatswordCharge;
  if (!charge || p.weaponType !== 'greatsword') return;
  if (now >= charge.releaseAt) _previewGreatswordChargeRelease(p, now);
}

function _previewGreatswordChargeRelease(p, now) {
  if (!p.greatswordCharge) return;
  const sk = SkillConfig.greatsword;
  const held = Math.max(0, now - p.greatswordCharge.startedAt);
  p.greatswordCharge = null;
  const chargeT = Math.min(1, held / (sk.chargeMaxMs || 1000));
  _previewFire(p, 'greatsword', {
    ...Weapons.greatsword,
    type: sk.type || 'melee_blade_sweep',
    range: (sk.range || 128) * (0.38 + 0.62 * chargeT),
    angle: sk.angle || 210,
    bladeHalfWidth: sk.bladeHalfWidth,
    damage: chargeT >= 1 ? sk.damage : (chargeT >= (sk.chargeThreshold || 0.5) ? sk.thresholdDamage : sk.minDamage)
  }, now, { finisher: true, lifetime: 780 });
}

function _previewGreatswordChargeTap(p, now) {
  _previewGreatswordChargeStart(p, now);
}

function _previewKatanaIaijutsu(p, now) {
  const sk = SkillConfig.katana;
  const chargeMs = sk.iaijutsuChargeMs || 1000;
  p.effects.push({
    attackerId: 'preview',
    x: p.dummy.x,
    y: p.dummy.y,
    angle: p.dummy.angle,
    weapon: 'katana',
    type: 'katana_charge',
    range: sk.iaijutsuRange || 150,
    width: sk.iaijutsuWidth || 40,
    progress: 0,
    timestamp: now,
    lifetime: chargeMs
  });
  _previewDelay(p, now + chargeMs, releaseNow => {
    p.effects.push({
      attackerId: 'preview',
      x: p.dummy.x,
      y: p.dummy.y,
      angle: p.dummy.angle,
      weapon: 'katana',
      type: 'melee_heavy_line',
      range: sk.iaijutsuRange || 150,
      width: sk.iaijutsuWidth || 40,
      isSkill: true,
      progress: 0,
      timestamp: releaseNow,
      lifetime: 420
    });
  });
}

function _previewReleasePending(p, now) {
  if (p.pendingPreviewActions.length) {
    const waiting = [];
    for (const action of p.pendingPreviewActions) {
      if (action.releaseAt > now) { waiting.push(action); continue; }
      action.run(now);
    }
    p.pendingPreviewActions = waiting;
  }
  if (p.pendingSniperShots.length) {
    const waiting = [];
    for (const shot of p.pendingSniperShots) {
      if (shot.releaseAt > now) { waiting.push(shot); continue; }
      _previewSniperBeam(p, now, shot);
    }
    p.pendingSniperShots = waiting;
  }
  if (p.pendingMagicShards.length) {
    const waiting = [];
    for (const shard of p.pendingMagicShards) {
      if (shard.releaseAt > now) { waiting.push(shard); continue; }
      _previewMagicShard(p, now, shard.sequence);
    }
    p.pendingMagicShards = waiting;
  }
}

function _previewDelay(p, releaseAt, run) {
  p.pendingPreviewActions.push({ releaseAt, run });
}

function _previewSniperShot(p, now) {
  const d = p.dummy;
  const telegraphMs = Math.max(0, SkillConfig.sniper?.telegraphMs ?? 500);
  p.pendingSniperShots.push({ releaseAt: now + telegraphMs, weapon: 'sniper', range: Infinity });
  p.effects.push({
    id: `preview-snipertelegraph-${now}`,
    attackerId: 'preview',
    x: d.x, y: d.y,
    angle: d.angle,
    beamDist: p.MAP,
    weapon: 'sniper',
    type: 'sniper_telegraph',
    progress: 0,
    timestamp: now,
    lifetime: telegraphMs
  });
}

function _previewSniperBeam(p, now, shot = {}) {
  const d = p.dummy;
  const dist = Number.isFinite(shot.range) ? shot.range : p.MAP * 0.48;
  const weapon = shot.weapon || 'sniper';
  p.effects.push({
    id: `preview-railbeam-${weapon}-${now}`,
    attackerId: 'preview',
    x: d.x, y: d.y,
    x2: d.x + Math.cos(d.angle) * dist,
    y2: d.y + Math.sin(d.angle) * dist,
    angle: d.angle,
    weapon,
    type: 'railbeam',
    progress: 0,
    timestamp: now,
    lifetime: 320
  });
}

function _previewProjectileFan(p, weaponType, cfg, base, now, fallbackKind = null) {
  const count = Math.max(1, cfg.count || cfg.waveCount || cfg.fanCount || cfg.burstCount || 1);
  const spread = ((cfg.spreadDeg || cfg.fanSpreadDeg || 0) * Math.PI) / 180;
  for (let i = 0; i < Math.min(count, 10); i++) {
    const t = count <= 1 ? 0 : (i / (count - 1)) - 0.5;
    const delay = cfg.burstMs && count > 1 ? (cfg.burstMs / (count - 1)) * i : i;
    const fire = releaseNow => _previewFire(p, weaponType, {
      ...base,
      type: 'projectile',
      projectileKind: cfg.projectileKind || fallbackKind || (weaponType === 'sword' || weaponType === 'katana' ? 'swordwave' : 'arrow'),
      projectileWeapon: cfg.projectileWeapon || weaponType,
      speed: cfg.speed || cfg.waveSpeed || cfg.throwSpeed || 680,
      range: cfg.range || cfg.pullRange || base.range || 280,
      damage: cfg.damage || cfg.directDamage || base.damage || 1,
      radius: cfg.radius,
      previewAngleOffset: t * spread
    }, releaseNow);
    if (delay > 0) _previewDelay(p, now + delay, fire);
    else fire(now);
  }
}

function _previewAimedShot(p, cfg, now) {
  const windup = Math.max(0, cfg.windupMs || 400);
  p.pendingSniperShots.push({ releaseAt: now + windup, weapon: 'pistols', range: cfg.range || 520 });
  p.effects.push({
    id: `preview-aimed-${now}`,
    attackerId: 'preview',
    x: p.dummy.x,
    y: p.dummy.y,
    angle: p.dummy.angle,
    beamDist: cfg.range || 520,
    weapon: 'pistols',
    type: 'matchlock_telegraph',
    progress: 0,
    timestamp: now,
    lifetime: windup
  });
}

function _previewGuardianLaunch(p, cfg, now) {
  const sk = SkillConfig.guardian;
  for (let i = 0; i < 3; i++) {
    const angle = p.dummy.angle + (i - 1) * 0.22;
    _previewFire(p, 'guardian', {
      type: 'projectile',
      projectileKind: 'guardianblade',
      projectileWeapon: 'guardian',
      speed: sk.launchSpeed || 560,
      range: sk.launchRange || 200,
      damage: sk.launchDamage || 24,
      previewAngleOffset: angle - p.dummy.angle
    }, now + i);
  }
}

function _previewGuardianHoming(p, cfg, now) {
  const sk = SkillConfig.guardian;
  _previewFire(p, 'guardian', {
    type: 'projectile',
    projectileKind: 'guardianhoming',
    projectileWeapon: 'guardian',
    speed: sk.homingSpeed || 360,
    range: 260,
    damage: sk.homingDamage || 14
  }, now);
}

function _previewExplosion(p, weaponType, cfg, now, distance = 0) {
  const d = p.dummy;
  p.effects.push({
    attackerId: 'preview',
    x: d.x + Math.cos(d.angle) * distance,
    y: d.y + Math.sin(d.angle) * distance,
    weapon: weaponType,
    type: cfg.type === 'mine_blast' ? 'mine_blast' : 'explosion',
    radius: cfg.radius || cfg.blastRadius || cfg.range || 55,
    range: cfg.radius || cfg.blastRadius || cfg.range || 55,
    progress: 0,
    timestamp: now,
    lifetime: 420
  });
}

function _previewPlaceMine(p, cfg, now) {
  p.mines.push({
    id: `preview-mine-${now}`,
    ownerId: 'preview',
    x: p.dummy.x,
    y: p.dummy.y + 32,
    armAt: now + (SkillConfig.minebag.armMs || 1000),
    expireAt: now + 2600
  });
}

function _previewTracerMine(p, cfg, now) {
  const d = p.dummy;
  const x = d.x + Math.cos(d.angle) * 72;
  const y = d.y + Math.sin(d.angle) * 72;
  p.mines.push({
    id: `preview-tracer-${now}`,
    ownerId: 'preview',
    tracer: true,
    x,
    y,
    armAt: now,
    expireAt: now + (SkillConfig.minebag.tracerFuseMs || 2000)
  });
  p.effects.push({ attackerId: 'preview', x, y, weapon: 'minebag', type: 'mine_blast', range: SkillConfig.minebag.blastRadius || 60, progress: 0, timestamp: now + (SkillConfig.minebag.tracerFuseMs || 2000), lifetime: 460 });
}

function _previewDodgeReload(p, cfg, now) {
  const d = p.dummy;
  d.dashDirX = Math.cos(d.angle);
  d.dashDirY = Math.sin(d.angle);
  d.dashTimeLeft = 0.18;
  p.effects.push({ attackerId: 'preview', x: d.x, y: d.y, weapon: 'pistols', type: 'buff_activate', buffType: 'pistol_reload', progress: 0, timestamp: now, lifetime: 520 });
}

function _previewMagicFireball(p, now) {
  const cfg = MagicConfig.fireball;
  _previewFire(p, 'magicstaff', {
    type: 'projectile',
    projectileKind: 'fireball',
    projectileWeapon: 'magicstaff',
    speed: cfg.speed,
    range: Infinity,
    damage: cfg.damage,
    radius: cfg.radius
  }, now);
}

function _previewMagicLifebound(p, now) {
  const cfg = MagicConfig.lifebound;
  p.dummy.hp = Math.min(p.dummy.maxHp, p.dummy.hp + (cfg.heal || 25));
  p.effects.push({
    attackerId: 'preview',
    x: p.dummy.x,
    y: p.dummy.y,
    weapon: 'magicstaff',
    type: 'lifebound_heal',
    progress: 0,
    timestamp: now,
    lifetime: 620
  });
}

function _previewMagicIce(p, now) {
  const cfg = MagicConfig.iceShard;
  const count = Math.max(1, Math.floor(cfg.count || 4));
  const interval = Math.max(0, cfg.intervalMs || 0);
  p.dummy.pendingIcicles = count;
  p.effects.push({
    attackerId: 'preview',
    x: p.dummy.x + Math.cos(p.dummy.angle) * 120,
    y: p.dummy.y + Math.sin(p.dummy.angle) * 120,
    weapon: 'magicstaff',
    type: 'icicle_load',
    worldAnchored: true,
    progress: 0,
    timestamp: now,
    lifetime: Math.max(260, interval * count)
  });
  for (let i = 0; i < count; i++) {
    p.pendingMagicShards.push({ releaseAt: now + interval * i, sequence: i });
  }
}

function _previewMagicShard(p, now, sequence = 0) {
  const cfg = MagicConfig.iceShard;
  const d = p.dummy;
  const count = Math.max(1, Math.floor(cfg.count || 4));
  const off = (sequence - (count - 1) / 2) * 11;
  const a = d.angle;
  const ux = Math.cos(a), uy = Math.sin(a);
  const spawnDist = d.radius + 4;
  const proj = new Projectile(
    `preview-iceshard-${now}-${sequence}`,
    'preview',
    d.x + ux * spawnDist - uy * off,
    d.y + uy * spawnDist + ux * off,
    a,
    cfg.speed,
    Infinity,
    cfg.damage,
    'iceshard'
  );
  proj.weapon = 'magicstaff';
  proj.radius = cfg.radius;
  p.projectiles.push(proj);
  p.dummy.pendingIcicles = Math.max(0, (p.dummy.pendingIcicles || 0) - 1);
  p.effects.push({
    attackerId: 'preview',
    x: d.x,
    y: d.y,
    angle: a,
    weapon: 'magicstaff',
    type: 'projectile_shot',
    projectileKind: 'iceshard',
    progress: 0,
    timestamp: now,
    lifetime: 200
  });
}

function _previewFire(p, weaponType, wc, now, options = {}) {
  const d = p.dummy;
  if (wc.type === 'projectile') {
    const kind = wc.projectileKind || 'arrow';
    const angle = d.angle + (wc.previewAngleOffset || 0);
    if (kind !== 'chakram') {
      p.effects.push({ attackerId: 'preview', x: d.x, y: d.y, angle, weapon: weaponType,
        type: 'projectile_shot', projectileKind: kind, progress: 0, timestamp: now, lifetime: 220 });
    }
    const proj = new Projectile(`prev-${now}-${p.projectiles.length}`, 'preview', d.x + Math.cos(angle) * 18, d.y + Math.sin(angle) * 18,
      angle, wc.speed || 600, wc.range || 300, wc.damage || 1, kind);
    proj.weapon = wc.projectileWeapon || weaponType;
    if (Number.isFinite(wc.radius)) proj.radius = wc.radius;
    if (kind === 'chakram') {
      const ownerX = d.x, ownerY = d.y;
      let phase = 'out';
      proj.update = function(dt) {
        if (this.isDead) return;
        if (phase === 'out') {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (Math.hypot(this.x - this.startX, this.y - this.startY) >= this.maxRange) phase = 'return';
        } else {
          const dx = ownerX - this.x, dy = ownerY - this.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 18) { this.isDead = true; return; }
          const s = 720 / dist;
          this.x += dx * s * dt;
          this.y += dy * s * dt;
          this.angle = Math.atan2(dy, dx);
        }
      };
    }
    p.projectiles.push(proj);
  } else {
    p.swing = -p.swing;
    p.effects.push({ attackerId: 'preview', x: d.x, y: d.y, angle: d.angle, weapon: weaponType, buffType: null,
      type: wc.type || 'melee_arc', range: wc.range, width: wc.width, innerRange: wc.innerRange, angleDeg: wc.angle,
      comboStep: 0, comboCycle: 0, comboFinisher: Boolean(options.finisher), swingDirection: p.swing,
      progress: 0, timestamp: now, lifetime: options.lifetime || 420 });
  }
}

function renderSkillPreview(skillText = '') {
  return String(skillText || '').split('\n').filter(Boolean).map(line => {
    const match = line.match(/^(F|R|LMB):(.*)$/);
    if (!match) {
      return `<div class="skill-preview-line skill-preview-line-plain"><span class="skill-preview-body">${highlightSkillValues(line)}</span></div>`;
    }
    const key = match[1];
    return [
      '<div class="skill-preview-line">',
      `<span class="skill-preview-label skill-preview-label-${key.toLowerCase()}">${key}:</span>`,
      `<span class="skill-preview-body">${highlightSkillValues(match[2].trimStart())}</span>`,
      '</div>'
    ].join('');
  }).join('');
}

function highlightSkillValues(text) {
  return escapeHtml(text).replace(
    /([+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+(?:\.\d+)?)*(?:\/s)?(?:\s?(?:초|ms|px|도|%|배|개|발))?|∞|벽까지)/g,
    '<span class="skill-preview-value">$1</span>'
  );
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
 * account/login element is moved, renamed, or rewired, so the Firebase auth
 * flow (account-ui.js) is completely untouched.
 */
function setupLobbyTabs() {
  const tabs = document.querySelectorAll('.lobby-tab');
  if (!tabs.length) return;

  const setHidden = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('lobby-tab-hidden', on);
  };

  // Desktop shows all columns at once; on mobile the tab bar chooses the active
  // lobby workflow. Weapon details live in the right column, while create/join
  // share the middle column.
  function setTab(tab) {
    setHidden('lobbyAccount', tab !== 'mypage');                         // col 1
    setHidden('lobbyLeft', tab !== 'weapon' && tab !== 'create' && tab !== 'join');
    setHidden('lobbyRight', tab !== 'weapon');                           // weapon details / preview
    setHidden('lobbyWeapon', tab !== 'weapon');                          // inside col 2
    setHidden('lobbyCreate', tab !== 'create');
    setHidden('lobbyJoin', tab !== 'join');
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
