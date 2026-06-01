/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Weapon Configurations
export const Weapons = {
  sword: {
    name: '검',
    damage: 24,
    maxHp: 120,
    cooldown: 550, // milliseconds
    moveSpeed: 1.1,
    range: 70,     // pixels
    angle: 110,    // degrees
    type: 'melee_arc',
    description: '공수 밸런스가 뛰어난 무기입니다. 준수한 사거리와 공격 속도를 자랑합니다.',
    skill: 'F 스킬: 0.25초 간격으로 검기 3회 발사 (벽·적 명중 시 폭발) · 쿨타임 4초',
    color: '#45f3ff'
  },
  axe: {
    name: '도끼',
    damage: 40,
    maxHp: 150,
    cooldown: 900,
    moveSpeed: 0.8,
    range: 58,
    angle: 360,    // Full circle
    type: 'melee_circle',
    description: '파괴적인 360도 회전 공격을 펼칩니다. 자신 주변의 모든 적에게 피해를 줍니다.',
    skill: 'F 스킬: 4초간 100px·120도 부채꼴 베기로 전환, 0.3초마다 공격 · 쿨타임 버프 종료 후 6초',
    color: '#f55555'
  },
  bow: {
    name: '활',
    damage: 33,
    maxHp: 80,
    cooldown: 800,
    moveSpeed: 1,
    range: Infinity,
    speed: 640,    // Projectile speed (px/s)
    type: 'projectile',
    description: '벽에 닿을 때까지 날아가는 장거리 무기입니다. 강력한 피해를 주지만 조준이 까다롭습니다.',
    skill: 'F 스킬: 화살 적중마다 스택 +1(최대 5), 사용 시 스택 수만큼 0.25초 간격 레일건 발사 · 쿨타임 8초',
    color: '#a3ff45'
  },
  spear: {
    name: '창',
    damage: 17,
    maxHp: 100,
    cooldown: 500,
    moveSpeed: 1,
    range: 120,
    width: 16,     // Width of straight thrust box
    type: 'melee_line',
    description: '직선으로 가하는 찌르기 공격입니다. 사거리가 길고 좌우 범위가 좁습니다.',
    skill: 'F 스킬: 벽까지 즉시 투창 후 돌아오며 닿는 적 전체에게 35 피해 · 쿨타임 회수 후 2초',
    color: '#ffa345'
  },
  gauntlet: {
    name: '건틀릿',
    damage: 19,
    maxHp: 110,
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
    waveCount: 3,
    waveIntervalMs: 250,
    directDamage: 24,      // damage on direct contact
    explosionRadius: 70,   // explosion AoE radius (px)
    explosionDamage: 20    // explosion AoE damage
  },
  axe: {
    cooldownMs: 6000,      // starts AFTER the buff ends
    buffMs: 4000,
    type: 'melee_arc',
    damage: 50,
    attackCooldownMs: 300,
    range: 100,
    angle: 120
  },
  bow: {
    cooldownMs: 8000,
    speed: 50000,          // label only — resolved as an instant hitscan
    damage: 60,
    maxStacks: 5,
    burstIntervalMs: 250
  },
  spear: {
    cooldownMs: 2000,      // starts AFTER retrieval
    damage: 35,
    returnDamage: 35,
    throwSpeed: 50000,     // label only — outbound throw resolves instantly
    returnSpeed: 760,
    returnMs: 1800
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

// --- Automatic attack combo tuning -----------------------------------------
export const ComboConfig = {
  sword: {
    cycle: 4,
    delayAfterStep: 3,
    delayBeforeFinisherMs: 880,
    comboResetMs: 2600,
    finisher: {
      type: 'melee_circle',
      damage: 28,
      range: 78,
      angle: 360,
      cooldown: 760
    }
  },
  axe: {
    cycle: 3,
    delayAfterStep: 2,
    delayBeforeFinisherMs: 1280,
    comboResetMs: 2800,
    finisher: {
      type: 'melee_circle',
      damage: 64,
      range: 92,
      angle: 360,
      cooldown: 1120
    }
  },
  spear: {
    cycle: 5,
    comboResetMs: 1800,
    finisher: {
      range: 155,
      width: 18,
      damage: 20,
      cooldown: 560
    }
  },
  gauntlet: {
    cycle: 7,
    comboResetMs: 950,
    finisher: {
      type: 'melee_line',
      range: 118,
      width: 24,
      damage: 28,
      cooldown: 240
    }
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
      type: SkillConfig.axe.type,
      damage: SkillConfig.axe.damage,
      cooldown: SkillConfig.axe.attackCooldownMs,
      range: SkillConfig.axe.range,
      angle: SkillConfig.axe.angle
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
