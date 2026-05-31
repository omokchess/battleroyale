/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Weapon Configurations
export const Weapons = {
  sword: {
    name: '검',
    damage: 24,
    cooldown: 550, // milliseconds
    moveSpeed: 1.1,
    range: 70,     // pixels
    angle: 110,    // degrees
    type: 'melee_arc',
    description: '공수 밸런스가 뛰어난 무기입니다. 준수한 사거리와 공격 속도를 자랑합니다.',
    skill: 'F 스킬: 360° 3회전 후 마우스 방향으로 검기 발사 (벽·적 명중 시 폭발) · 쿨타임 4초',
    color: '#45f3ff'
  },
  axe: {
    name: '도끼',
    damage: 40,
    cooldown: 900,
    moveSpeed: 0.8,
    range: 58,
    angle: 360,    // Full circle
    type: 'melee_circle',
    description: '파괴적인 360도 회전 공격을 펼칩니다. 자신 주변의 모든 적에게 피해를 줍니다.',
    skill: 'F 스킬: 10초간 공격 속도 3배·공격 범위 73px 증가 · 쿨타임 버프 종료 후 6초',
    color: '#f55555'
  },
  bow: {
    name: '활',
    damage: 33,
    cooldown: 800,
    moveSpeed: 0.65,
    range: Infinity,
    speed: 640,    // Projectile speed (px/s)
    type: 'projectile',
    description: '벽에 닿을 때까지 날아가는 장거리 무기입니다. 강력한 피해를 주지만 조준이 까다롭습니다.',
    skill: 'F 스킬: 50000px/s 초고속 레일건 화살 (직선 즉시 명중) · 쿨타임 8초',
    color: '#a3ff45'
  },
  spear: {
    name: '창',
    damage: 17,
    cooldown: 500,
    moveSpeed: 1,
    range: 120,
    width: 16,     // Width of straight thrust box
    type: 'melee_line',
    description: '직선으로 가하는 찌르기 공격입니다. 사거리가 길고 좌우 범위가 좁습니다.',
    skill: 'F 스킬: 투창! 던진 창이 벽까지 날아갔다 2초 후 부메랑처럼 돌아와 회수 · 쿨타임 회수 후 2초',
    color: '#ffa345'
  },
  gauntlet: {
    name: '건틀릿',
    damage: 19,
    cooldown: 160,
    moveSpeed: 1.3,
    range: 58,
    angle: 110,
    type: 'melee_arc',
    description: '쉴 새 없는 연속 펀치 공격입니다. 사거리는 극도로 짧지만 공격 속도가 무시무시합니다.',
    skill: 'F 스킬: 7초간 공격이 창처럼 직선으로 변하고 공격력 30·사거리 115px · 쿨타임 버프 종료 후 7초',
    color: '#ff45db'
  }
};

// --- Dash (Spacebar) tuning --------------------------------------------------
// All values are easy to retune here without touching game logic.
export const DashConfig = {
  distance: 130,                  // px travelled during a dash
  durationMs: 160,                // dash movement window
  iframeFrames: 13,               // invincibility expressed in 60fps frames
  iframeMs: (13 / 60) * 1000,     // ≈ 216.7 ms of invulnerability
  cooldownMs: 900
};

// Derived once so both host and client share the exact same burst speed.
DashConfig.speed = DashConfig.distance / (DashConfig.durationMs / 1000); // px/s

// --- Per-weapon F skill tuning ----------------------------------------------
export const SkillConfig = {
  sword: {
    cooldownMs: 4000,
    waveSpeed: 800,        // sword-energy projectile speed (px/s)
    directDamage: 24,      // damage on direct contact
    explosionRadius: 70,   // explosion AoE radius (px)
    explosionDamage: 20,   // explosion AoE damage
    spins: 100               // visual full rotations while casting
  },
  axe: {
    cooldownMs: 6000,      // starts AFTER the buff ends
    buffMs: 10000,
    attackSpeedMult: 3,    // base cooldown divided by this
    range: 73
  },
  bow: {
    cooldownMs: 8000,
    speed: 50000,          // label only — resolved as an instant hitscan
    damage: 60
  },
  spear: {
    cooldownMs: 2000,      // starts AFTER retrieval
    damage: 50,
    throwSpeed: 700,       // px/s outward
    outMs: 1000,           // outward flight window before it boomerangs back
    totalMs: 2000          // total airborne time before forced retrieval
  },
  gauntlet: {
    cooldownMs: 7000,      // starts AFTER the buff ends
    buffMs: 7000,
    damage: 30,
    range: 115,            // matches spear
    width: 22,
    type: 'melee_line'
  }
};

/**
 * Resolve a weapon's *effective* combat stats given an active skill buff.
 * Always returns a fresh object so callers never mutate the base config.
 *
 * @param {string} weaponKey
 * @param {string|null} buffType  'axe_rage' | 'gauntlet_lance' | null
 */
export function getEffectiveWeapon(weaponKey, buffType = null) {
  const base = Weapons[weaponKey] || Weapons.sword;
  if (!buffType) return base;

  if (buffType === 'axe_rage' && weaponKey === 'axe') {
    return {
      ...base,
      cooldown: base.cooldown / SkillConfig.axe.attackSpeedMult,
      range: SkillConfig.axe.range
    };
  }

  if (buffType === 'gauntlet_lance' && weaponKey === 'gauntlet') {
    return {
      ...base,
      type: SkillConfig.gauntlet.type,
      damage: SkillConfig.gauntlet.damage,
      range: SkillConfig.gauntlet.range,
      width: SkillConfig.gauntlet.width
    };
  }

  return base;
}
