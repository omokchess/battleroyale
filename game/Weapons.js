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
  },
  greatsword: {
    name: '대검',
    damage: 38,
    maxHp: 140,
    cooldown: 640,
    moveSpeed: 0.82,
    range: 88,
    angle: 210,
    fixedSwingDirection: 1,
    type: 'melee_arc',
    description: '전방 100도를 같은 방향으로 두 번 베고, 3타에 짧은 검기를 발사하는 중량 무기입니다.',
    skill: 'F 홀드: 최대 3초 예열 후 대미지 85 강공격을 발동합니다.',
    color: '#8bd3ff'
  },
  scythe: {
    name: '대낫',
    damage: 18,
    sweetDamage: 34,
    maxHp: 115,
    cooldown: 680,
    moveSpeed: 1.05,
    range: 92,
    innerRange: 52,
    angle: 150,
    pull: 24,
    fixedSwingDirection: 1,
    type: 'melee_sweet_arc',
    description: '안쪽보다 바깥날이 강한 초승달 공격입니다. 바깥쪽에 맞은 적은 끌려옵니다.',
    skill: 'F 스킬: 더 넓은 수확 베기로 바깥날 피해와 끌어당김을 강화합니다.',
    color: '#d946ef'
  },
  dagger: {
    name: '단검',
    damage: 14,
    maxHp: 90,
    cooldown: 300,
    moveSpeed: 1.35,
    range: 58,
    width: 1,
    critDamage: 20,
    hitCooldownRefundMs: 40,
    type: 'melee_precise_line',
    description: '빠른 초근접 무기입니다. 3타마다 짧게 대시하고, 적의 등 뒤를 찌르면 큰 피해를 줍니다.',
    skill: 'F 스킬: 가장 가까운 적을 찍고 2초 뒤 배후 QTE를 시작합니다. 원이 맞을 때 Space를 누르면 70 피해.',
    color: '#f8fafc'
  },
  rapier: {
    name: '레이피어',
    damage: 16,
    critDamage: 24,
    maxHp: 100,
    cooldown: 430,
    moveSpeed: 1.15,
    range: 87,
    width: 1,
    hitCooldownRefundMs: 180,
    missPenaltyMs: 150,
    type: 'melee_precise_line',
    description: '1px짜리 바늘 같은 찌르기 무기입니다. 짧고 날카롭지만 명중 시 템포가 빨라집니다.',
    skill: 'F 스킬: 0.12초 간격으로 7번 연속 찌릅니다.',
    color: '#facc15'
  },
  hammer: {
    name: '망치',
    damage: 36,
    maxHp: 145,
    cooldown: 1150,
    moveSpeed: 0.75,
    range: 78,
    innerRange: 36,
    angle: 360,
    knockback: 68,
    type: 'melee_slam',
    description: '묵직한 원형 내려찍기 무기입니다. 맞은 적을 크게 밀어냅니다.',
    skill: 'F 스킬: 1초 뒤 150px 이내 모든 적에게 40 피해와 0.5초 스턴.',
    color: '#fb923c'
  }
};

Object.assign(Weapons.greatsword, {
  description: '전방 100도를 같은 방향으로 두 번 베고, 3타에 넓은 검기를 발사하는 중량 무기입니다.',
  skill: 'F 홀드: 최대 1초 예열 후 창처럼 뻗는 상단베기로 최대 85 피해를 줍니다.'
});

Object.assign(Weapons.greatsword, {
  description: '전방 210도를 같은 방향으로 두 번 베고, 3타에 넓은 검기를 발사하는 중량 무기입니다.',
  skill: 'F 홀드: 최대 1초 예열 후 넓은 강베기로 최대 85 피해를 줍니다.'
});

Object.assign(Weapons.dagger, {
  description: '레이피어처럼 얇은 직선 판정으로 빠르게 찌르는 암살 무기입니다.',
  skill: 'F 스킬: 가장 가까운 적과 0.7초간 사슬을 잇고, 원 타이밍에 F를 누르면 배후 공격으로 70 피해를 줍니다.'
});

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
  },
  greatsword: {
    cooldownMs: 7000,
    chargeMaxMs: 1000,
    minDamage: 45,
    damage: 85,
    type: 'melee_heavy_arc',
    range: 128,
    angle: 210,
    delayDamageMs: 70,
    attackLockMs: 800,
    knockback: 82
  },
  scythe: {
    cooldownMs: 6500,
    type: 'melee_sweet_arc',
    damage: 24,
    sweetDamage: 46,
    range: 130,
    innerRange: 62,
    angle: 210,
    pull: 48
  },
  dagger: {
    cooldownMs: 5000,
    lockMs: 700,
    windowMs: 900,
    perfectMs: 560,
    toleranceMs: 150,
    dashDistance: 64,
    damage: 70,
    failDamage: 10,
    failStunMs: 300
  },
  rapier: {
    cooldownMs: 5500,
    type: 'melee_precise_line',
    damage: 16,
    critDamage: 24,
    range: 87,
    width: 1,
    strikeCount: 7,
    strikeIntervalMs: 120,
    angleJitterDeg: 15,
    hitCooldownRefundMs: 120
  },
  hammer: {
    cooldownMs: 8500,
    type: 'melee_slam',
    damage: 40,
    range: 150,
    delayMs: 1000,
    stunMs: 500,
    knockback: 90
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
      type: 'melee_arc',
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
  },
  greatsword: {
    cycle: 3,
    delayAfterStep: 2,
    delayBeforeFinisherMs: 620,
    comboResetMs: 2400,
    finisher: {
      type: 'projectile',
      damage: 25,
      range: 185,
      speed: 760,
      radius: 28,
      projectileKind: 'greatswordwave',
      projectileWeapon: 'greatsword',
      cooldown: 760
    }
  },
  scythe: {
    cycle: 3,
    comboResetMs: 2100,
    finisher: {
      type: 'melee_sweet_arc',
      damage: 24,
      sweetDamage: 44,
      range: 118,
      innerRange: 56,
      angle: 210,
      pull: 42,
      cooldown: 780
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
