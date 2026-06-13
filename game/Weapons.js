/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Weapon Configurations
export const Weapons = {
  sword: {
    name: '검',
    damage: 25,    // 밸런스의 영점 (DPS 48) — 모든 무기는 이 무기 대비 장단점이 명확
    maxHp: 120,
    cooldown: 520, // milliseconds
    moveSpeed: 1.1,
    range: 70,     // pixels
    angle: 110,    // degrees
    type: 'melee_arc',
    hitMode: 'melee_blade_sweep',  // hit along the swept blade, like the greatsword
    bladeHalfWidth: 12,
    description: '공수 밸런스가 뛰어난 기준점 무기입니다. 상태이상이나 조건부 보상은 없지만 모든 면이 안정적입니다.',
    skill: 'F 스킬: 0.25초 간격으로 검기 3회 발사 (벽·적 명중 시 폭발) · 쿨타임 4초',
    color: '#45f3ff'
  },
  axe: {
    name: '도끼',
    damage: 38,
    maxHp: 155,
    cooldown: 850,
    moveSpeed: 0.85,
    range: 58,
    angle: 360,    // Full circle
    type: 'melee_circle',
    onHitBleed: true,            // 명중 시 출혈 — 난전에서 다수에게 도트를 묻힌다
    description: '파괴적인 360도 회전 공격을 펼칩니다. 자신 주변의 모든 적에게 피해를 주고 출혈을 입힙니다.',
    skill: 'F 스킬: 4초간 제자리에서 100px·120도 부채꼴 베기로 전환(이동·대시 불가), 0.3초마다 공격 · 쿨타임 버프 종료 후 6초',
    color: '#f55555'
  },
  bow: {
    name: '활',
    damage: 30,
    maxHp: 85,
    cooldown: 800,
    moveSpeed: 1,
    range: Infinity,
    speed: 640,    // Projectile speed (px/s)
    type: 'projectile',
    closeRange: 120,            // 근접 감쇠 시작 거리
    closeDamage: 20,           // 120px 이내 명중 시 피해
    description: '벽에 닿을 때까지 날아가는 장거리 무기입니다. 멀수록 강하지만 120px 이내 근접에서는 피해가 20으로 약해집니다.',
    skill: 'F 스킬: 화살 적중마다 스택 +1(최대 5), 사용 시 스택 수만큼 0.25초 간격 레일건 발사 · 쿨타임 8초',
    color: '#a3ff45'
  },
  spear: {
    name: '창',
    damage: 20,
    maxHp: 105,
    cooldown: 500,
    moveSpeed: 1,
    range: 130,
    width: 16,     // Width of straight thrust box
    type: 'melee_line',
    tipRange: 30,              // 선단 명중 구간(사거리 끝 30px)
    tipDamage: 28,
    tipSlowMs: 500,
    description: '직선으로 가하는 찌르기 공격입니다. 사거리가 길고 좌우가 좁으며, 끝 30px(선단)에 맞히면 28 피해 + 둔화로 거리를 다시 벌립니다.',
    skill: 'F 스킬: 벽까지 즉시 투창 후 돌아오며 닿는 적 전체에게 35 피해 · 쿨타임 회수 후 2초',
    color: '#ffa345'
  },
  gauntlet: {
    name: '건틀릿',
    damage: 15,
    maxHp: 110,
    cooldown: 220,
    moveSpeed: 1.3,
    range: 58,
    width: 24,
    punchConvergeOffset: 8,
    type: 'melee_line',
    uppercutEvery: 4,         // 같은 적 4타째
    uppercutDamage: 25,
    uppercutKnockback: 30,
    description: '쉴 새 없는 연속 펀치 무기입니다. 사거리는 극도로 짧지만 공속이 무시무시하며, 같은 적 4타째 어퍼컷으로 25 피해 + 넉백을 줍니다.',
    skill: 'F 스킬: 4초간 공격이 창처럼 직선으로 뻗어 사거리 115px로 늘어납니다(피해 20) · 쿨타임 버프 종료 후 7초',
    color: '#ff45db'
  },
  greatsword: {
    name: '대검',
    damage: 38,
    maxHp: 140,
    cooldown: 900,
    automaticAttack: false,
    moveSpeed: 0.82,
    range: 88,
    angle: 210,
    fixedSwingDirection: 1,
    type: 'melee_arc',
    description: '평타 없이 F 차징으로만 공격하는 중량 무기입니다. 차징 시간에 따라 15~75 피해를 주고, 풀차징(1초) 명중 시 둔화까지 겁니다.',
    skill: 'F 홀드: 최대 1초 예열 후 넓은 강베기로 15~75 피해. 풀차징 명중 시 0.8초 둔화.',
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
    angle: 190,
    pull: 24,
    sweetBleed: true,          // 바깥날 명중 시 출혈
    fixedSwingDirection: 1,
    type: 'melee_sweet_arc',
    hitMode: 'melee_blade_sweep',  // hit along the swept blade, like the greatsword
    bladeHalfWidth: 16,
    description: '안쪽보다 바깥날이 강한 초승달 공격입니다. 바깥날에 맞은 적은 끌려오며 출혈을 입습니다.',
    skill: 'F 스킬: 더 넓은 수확 베기로 바깥날 피해와 끌어당김을 강화합니다.',
    color: '#d946ef'
  },
  dagger: {
    name: '단검',
    damage: 13,
    maxHp: 90,
    cooldown: 300,
    moveSpeed: 1.35,
    range: 58,
    width: 1,
    backstabDamage: 22,        // 등 뒤 90° 명중
    backstabAngle: 90,
    backstabBleed: true,
    hitCooldownRefundMs: 40,
    type: 'melee_precise_line',
    description: '얇은 직선 판정의 암살 무기입니다. 정면은 약하지만, 대상의 등 뒤 90°에서 찌르면 22 피해 + 출혈을 입힙니다. 포지셔닝이 전부입니다.',
    skill: 'F 스킬: 가장 가까운 적과 0.7초간 사슬을 잇고, 원 타이밍에 F를 누르면 배후 공격으로 70 피해를 줍니다.',
    color: '#f8fafc'
  },
  rapier: {
    name: '레이피어',
    damage: 20,
    maxHp: 100,
    cooldown: 430,
    moveSpeed: 1.15,
    range: 97,     // +10px so the hit reaches the visible blade tip
    width: 1,
    hitCooldownRefundMs: 120,
    missPenaltyMs: 150,
    type: 'melee_precise_line',
    description: '바늘 같은 찌르기 무기입니다. 5타째 피니셔로 30 피해 + 둔화를 넣고, 명중 시 템포가 빨라지는 리듬형입니다.',
    skill: 'F 스킬: 5초간 연격 태세 — 공속·사거리·명중 환급 강화, 빗나감 패널티 제거 · 쿨타임 버프 종료 후 6초',
    color: '#facc15'
  },
  hammer: {
    name: '망치',
    damage: 34,
    maxHp: 150,
    cooldown: 1100,
    moveSpeed: 0.78,
    range: 78,
    innerRange: 36,
    angle: 360,
    knockback: 68,
    onHitSlowMs: 1000,         // 평타 명중 시 1초 둔화 — 다음 타를 보장
    type: 'melee_slam',
    description: '묵직한 원형 내려찍기 무기입니다. 맞은 적을 크게 밀어내고 1초간 둔화시켜, 느린 만큼 적을 묶어 다음 타를 보장합니다.',
    skill: 'F 스킬: 1초 예열 후 점점 커지는 충격파 3연발 (피해 20·40·52, 스턴 동반). 시전~종료까지 평타 불가 · 쿨타임 8.5초',
    color: '#fb923c'
  },
  matchlock: {
    name: '화승총',
    damage: Infinity,       // 확정킬(즉사) — actual hit resolves via SkillConfig.matchlock
    maxHp: 80,
    cooldown: 10000,        // F-triggered only (automaticAttack false)
    automaticAttack: false,
    moveSpeed: 0.9,
    range: Infinity,
    speed: 50000,           // label only — fires as an instant hitscan
    type: 'projectile',     // draws an aim line to the wall as the preview
    description: 'F 키로 직선상의 첫 적을 즉사시키는 화기입니다. 조준선이 닿으면 즉시 처치하지만 쿨타임이 깁니다.',
    skill: 'F 키: 조준 직선상의 첫 적을 즉사(확정킬) · 쿨타임 10초',
    color: '#ef4444'
  },
  katana: {
    name: '카타나',
    damage: 18,
    maxHp: 100,             // 검(120)보다 낮은 체력으로 역할 분리
    cooldown: 400,          // 검(520)보다 빠른 평타
    moveSpeed: 1.2,
    range: 70,
    angle: 110,
    chainHits: 3,             // 같은 적 3타째부터
    chainDamage: 24,
    type: 'melee_arc',
    hitMode: 'melee_blade_sweep',
    bladeHalfWidth: 12,
    description: '빠르게 휘두르는 쾌속 도검입니다. 같은 적에게 연속 명중하면 3타째부터 피해가 24로 오르는 연참형 — 첫 교환은 검보다 약하고 들러붙으면 강합니다.',
    skill: 'F: 2회 베기 ·  R 홀드: 1초 발도술 차징 후 전방 직선 베기로 70 피해 + 출혈',
    color: '#f43f5e'
  },
  magicstaff: {
    name: '마법 지팡이',
    damage: 40,             // fireball direct (display)
    maxHp: 95,
    cooldown: 2000,
    automaticAttack: false,
    moveSpeed: 0.9,
    range: Infinity,
    speed: 540,             // shown as cast speed
    type: 'projectile',     // idle preview draws the aim line
    description: '세 가지 주문을 상황에 맞게 쓰는 마법 지팡이입니다. 파이어볼은 화상, 아이스 샤드는 둔화를 겁니다.',
    skill: 'F: 파이어볼(직격 32 + 화상) ·  좌클릭: 아이스 샤드(14 + 둔화) ·  R: 자가 회복 25 (쿨 6초)',
    color: '#a855f7'
  },
  sniper: {
    name: '스나이퍼',
    damage: Infinity,       // 즉사 (actual shot resolves as a 9999 hitscan)
    maxHp: 90,
    cooldown: 2000,
    automaticAttack: false, // F fires; 걷기 불가(이동속도 0)지만 대시는 가능
    moveSpeed: 0,           // cannot walk — moves only by dashing
    range: Infinity,
    speed: Infinity,        // instant hitscan
    type: 'projectile',     // idle preview draws the aim line
    description: '걷기는 불가능(이동속도 0)하지만 대시로 움직이는 저격총입니다. F로 0.5초간 조준선을 노출한 뒤 직선상 첫 적을 즉사시키고, R로 경기장 내 무작위 위치로 순간이동합니다.',
    skill: 'F: 0.5초 조준선 노출(텔레그래프) 후 직선상 첫 적 즉사 (쿨타임 2초) ·  R: 경기장 내 무작위 위치로 순간이동 (쿨타임 2초)',
    color: '#22c55e'
  },
  chakram: {
    name: '차크람',
    damage: 26,             // applied once per leg (outbound + return) per target
    maxHp: 100,
    cooldown: 750,          // measured from when the disk returns to hand
    moveSpeed: 1.1,
    range: 280,             // outbound distance before it boomerangs back
    speed: 640,             // outbound flight speed (px/s)
    wallReflect: 1,         // bounces off a wall once before returning (extra hit chance)
    type: 'projectile',
    projectileKind: 'chakram',
    description: '자동으로 날아갔다 돌아오는 원반(벽 1회 반사). 원반이 떠 있는 동안은 비무장.',
    skill: 'F: 삼지창 투척 — 부채꼴 3방향(각 22+출혈) · 좌클릭: 쳐내기(근접 18, 적 투사체 상쇄) · R: 맴돌이(1.5초 방어 원반 공전)',
    color: '#c2cad6'
  },
  pistols: {
    name: '쌍권총',
    damage: 9,
    maxHp: 90,
    cooldown: 200,          // rapid fire
    moveSpeed: 1.25,        // full speed while shooting (no move penalty)
    range: 260,             // bullets vanish past this distance
    speed: 520,             // projectile speed (px/s)
    spreadDeg: 4,           // slight per-shot spread → weak at max range
    type: 'projectile',
    projectileKind: 'pistol',
    description: '사거리가 제한된 빠른 탄을 연사하는 유일한 일반 총기입니다. 이동 패널티 없이 무빙샷이 가능하지만, 단발 화력이 낮고 탄퍼짐 탓에 최대 사거리에서는 명중률이 떨어집니다.',
    skill: 'F 스킬: 0.6초간 8발 부채꼴 난사 후 뒤로 짧게 점프(이탈) · 쿨타임 6초',
    color: '#fb7185'
  },
  guardian: {
    name: '수호 블레이드',
    damage: 16,             // orbit contact damage (per target, re-hit every 500ms)
    maxHp: 110,
    cooldown: 500,          // unused (no manual attack) but kept for the stats card
    automaticAttack: false, // damage comes from the orbiting blades, not a swing
    moveSpeed: 1.2,
    range: 55,              // orbit radius == effective reach
    type: 'orbit',
    orbitCount: 2,
    orbitRadius: 55,
    orbitPeriodMs: 1100,    // one full revolution
    rehitMs: 500,           // min gap between hits on the same target
    bladeRadius: 9,
    description: '칼날 두 개가 몸 주위를 공전하며 닿는 적을 자동으로 벱니다. 조준이 없어 무빙과 거리 조절이 전부이며, 사거리가 몸 둘레뿐이라 긴 사거리 무기에 접근하기 어렵습니다.',
    skill: 'F 스킬: 칼날 2개를 바깥으로 발사(각 24 피해)했다가 회수하며, 회수 전까지 비무장 · 쿨타임 5초',
    color: '#2dd4bf'
  },
  harpoon: {
    name: '작살',
    damage: 12,
    maxHp: 105,
    cooldown: 1100,
    moveSpeed: 1.0,
    range: 200,             // throw distance
    speed: 700,
    type: 'projectile',
    projectileKind: 'harpoon',
    description: '중거리로 작살을 던져 명중한 적을 자신 앞으로 끌어옵니다. 끌어온 직후 짧은 경직을 주지만 본인 평타가 약해, 마무리할 다음 수가 필요한 시동기입니다.',
    skill: 'F 스킬: 조준 방향의 적 또는 벽으로 자신이 끌려가는 이동기(피해 없음) · 쿨타임 5초',
    color: '#60a5fa'
  },
  minebag: {
    name: '지뢰 가방',
    damage: 12,
    maxHp: 115,
    cooldown: 500,
    moveSpeed: 1.15,
    range: 55,
    angle: 90,
    type: 'melee_arc',
    description: '평타는 약한 근접 베기지만, F로 지뢰를 깔아 길목을 장악하는 두뇌형 무기입니다. 정면 교전이 가장 약하니 설치할 틈을 만들며 싸워야 합니다.',
    skill: 'F 스킬: 발밑에 지뢰 설치(1초 후 활성화, 폭발 38·반경 60, 최대 3개) · 설치 쿨타임 2.5초',
    color: '#f59e0b'
  },
  flamethrower: {
    name: '화염방사기',
    damage: 6,              // per tick (5 ticks/s → DPS 30)
    maxHp: 130,
    cooldown: 200,          // tick reference (no manual swing)
    automaticAttack: false, // sprays continuously via its own updater
    moveSpeed: 0.95,        // while recharging / not spraying
    sprayMoveSpeed: 0.55,   // dragged down while spraying
    range: 90,
    angle: 60,              // cone width (degrees)
    type: 'cone',
    tickMs: 200,
    fuelMs: 3000,           // 3s of continuous spray
    rechargeMs: 2000,       // 2s to refill once fully spent
    description: '전방 부채꼴에 불을 지속 분사하는 근접 무기입니다. 조준이 후해 모바일에 강하지만 사거리가 짧고 분사 중에는 굼떠지며, 연료가 바닥나면 재충전 동안 무장 해제됩니다.',
    skill: 'F 스킬: 전방에 2초간 타오르는 화염 장판을 던집니다(초당 10 피해) · 쿨타임 7초',
    color: '#fb923c'
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
  chakram: {
    cooldownMs: 4500,
    fanCount: 3,           // simultaneous discs
    fanSpreadDeg: 34,      // total angular spread of the fan
    damage: 22,            // per disc, per leg
    bleed: true,           // direct hits bleed
    range: 280,
    speed: 640,
    returnSpeed: 720
  },
  pistols: {
    cooldownMs: 6000,
    burstCount: 8,
    burstMs: 600,          // 8 shots spread across 0.6s
    fanSpreadDeg: 70,      // total fan width of the barrage
    damage: 11,            // per barrage bullet
    speed: 560,
    range: 300,
    hopDistance: 90        // backward escape hop after the barrage
  },
  guardian: {
    cooldownMs: 5000,
    launchDamage: 24,      // per launched blade, per leg
    launchRange: 200,      // outward flight before the blade returns
    launchSpeed: 560
  },
  harpoon: {
    cooldownMs: 5000,
    pullRange: 360,        // max self-pull distance toward enemy/wall
    stopGap: 32,           // stop short of the contact point
    pullToFront: 50,       // basic-attack pulls the target this far in front
    slowMs: 300            // brief drag on a hooked target (not a stun)
  },
  minebag: {
    cooldownMs: 2500,      // place cooldown
    armMs: 1000,           // delay before a mine becomes live
    blastRadius: 60,
    triggerRadius: 46,     // enemy proximity that detonates an armed mine
    damage: 38,
    maxMines: 3            // per player; placing a 4th removes the oldest
  },
  flamethrower: {
    cooldownMs: 7000,
    patchRange: 76,        // how far in front the patch lands
    patchRadius: 55,
    patchMs: 2000,         // burn duration
    patchTickMs: 250,      // damage cadence
    patchDamage: 2.5       // per tick (≈10/s)
  },
  gauntlet: {
    cooldownMs: 7000,      // starts AFTER the buff ends
    buffMs: 4000,
    damage: 20,
    range: 115,            // matches spear
    width: 22,
    type: 'melee_line'
  },
  greatsword: {
    cooldownMs: 800,
    chargeMaxMs: 1000,
    chargeThreshold: 0.5,
    minDamage: 15,         // bumped from 1 so a short charge is still a real option
    thresholdDamage: 38,
    damage: 75,
    fullChargeSlowMs: 800, // full-charge hit also slows
    // Hit only along the swept blade (its arc band + blade thickness), not the
    // whole fan — the visual cleave arc and the hit test now match. The reach is
    // scaled by charge (see _releaseGreatswordCharge) so a half charge cuts only
    // as far as its preview shows.
    type: 'melee_blade_sweep',
    range: 128,
    angle: 210,
    bladeHalfWidth: 18,
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
    // F now grants a sustained "riposte" buff instead of a one-off flurry.
    cooldownMs: 6000,        // starts AFTER the buff ends
    buffMs: 5000,
    type: 'melee_precise_line',
    buffCooldown: 250,       // attack cooldown while buffed (was 430)
    buffRange: 105,          // reach while buffed (was 87)
    buffWidth: 6,            // wider crit/hit window while buffed
    buffHitRefundMs: 180     // bigger on-hit tempo refund while buffed
  },
  hammer: {
    cooldownMs: 8500,
    type: 'melee_slam',
    previewMs: 1000,        // telegraph all 3 ranges + windup before any hit
    // Each shockwave fires this long after the previous event (1st after the windup):
    // → at cast+1.8s, +2.6s, +3.8s.
    waveDelaysMs: [800, 800, 1200],
    knockback: 90,
    // Three expanding shockwaves centered on the cast spot.
    waves: [
      { range: 60,  damage: 20, stunMs: 700,  knockback: 40 },
      { range: 123, damage: 40, stunMs: 750,  knockback: 70 },
      { range: 156, damage: 52, stunMs: 1100, knockback: 100 }
    ]
  },
  matchlock: {
    cooldownMs: 10000,
    telegraphMs: 500,       // aim-line preview before the shot fires
    damage: 9999,           // instakill
    speed: 50000            // label only — instant hitscan
  },
  katana: {
    cooldownMs: 7000,
    dashDistance: 150,      // total forward lunge across the two slashes
    slashCount: 2,
    slashIntervalMs: 150,
    directDamage: 40,
    directRange: 82,
    directAngle: 130,
    waveDamage: 30,
    waveSpeed: 832,         // 화살(640)의 1.3배
    attackLockMs: 250,
    iaijutsuCooldownMs: 3000,
    iaijutsuChargeMs: 1000,
    iaijutsuDamage: 70,    // 80→70, now also applies bleed (see _releaseKatanaIaijutsu)
    iaijutsuRange: 150,
    iaijutsuWidth: 40
  },
  sniper: {
    cooldownMs: 2000,         // F: instakill shot cooldown
    telegraphMs: 500,         // F: aim-laser exposure before the shot lands (counterplay window)
    teleportCooldownMs: 1500, // R: targeted teleport cooldown
    teleportRadius: 1000,
    teleportTargetWindowMs: 3500
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
  },
  rapier: {
    // 5-hit combo: quick precise thrusts, then a stationary heavy finisher
    // (no dash). Finisher reaches farther, crits harder, and lightly knocks back.
    cycle: 5,
    comboResetMs: 1800,
    finisher: {
      type: 'melee_precise_line',
      range: 130,
      width: 6,
      damage: 30,          // 5타째 피니셔
      onHitSlowMs: 500,    // + 0.5초 둔화
      knockback: 30,
      cooldown: 430
    }
  },
  katana: {
    // Same shape as the sword combo — katana just swings faster (lower cooldown).
    cycle: 4,
    delayAfterStep: 3,
    delayBeforeFinisherMs: 760,
    comboResetMs: 2600,
    finisher: {
      type: 'melee_arc',
      damage: 28,
      range: 78,
      angle: 360,
      cooldown: 600
    }
  }
};

// --- Magic staff spell tuning ------------------------------------------------
export const MagicConfig = {
  cooldownMs: 2000,
  fireball:  { cooldownMs: 2000, damage: 32, speed: 540, radius: 9, burnDps: 6, burnDurationMs: 3000, slowMs: 0 },
  iceShard:  { cooldownMs: 2000, count: 4, damage: 14, speed: 740, radius: 6, intervalMs: 120, slowMs: 1500 },
  lifebound: { cooldownMs: 6000, heal: 25 }
};

// --- R / LMB auxiliary skill tuning ----------------------------------------
// Existing bespoke skills keep their own code paths:
//   R: sniper targeted blink, magicstaff lifebound, katana iaijutsu
//   LMB: magicstaff targeted ice shard
// Everything listed here uses the generic auxiliary skill executor in Game.js.
export const AuxSkillConfig = {
  sword: {
    alt: { label: 'SPIN', cooldownMs: 4500, type: 'melee_circle', damage: 22, range: 74, angle: 360, knockback: 22 },
    target: { cooldownMs: 4000, type: 'melee_line', damage: 30, range: 115, width: 28, lungeDistance: 28, knockback: 28 }
  },
  axe: {
    alt: { label: 'QUAKE', cooldownMs: 6500, type: 'melee_slam', damage: 44, shockwaveDamage: 36, range: 92, innerRange: 44, knockback: 78, stunMs: 500 },
    target: { cooldownMs: 5000, type: 'melee_arc', damage: 38, range: 88, angle: 90, lungeDistance: 36, knockback: 40 }
  },
  bow: {
    alt: { label: 'VOLLEY', cooldownMs: 5000, type: 'projectile', projectileKind: 'arrow', projectileWeapon: 'bow', damage: 26, speed: 860, range: 320, radius: 6, count: 3, spreadDeg: 10 },
    target: { cooldownMs: 4500, type: 'projectile', projectileKind: 'arrow', projectileWeapon: 'bow', damage: 45, speed: 780, range: Infinity, radius: 7 }
  },
  spear: {
    alt: { label: 'IMPALE', cooldownMs: 4500, type: 'melee_line', damage: 28, range: 170, width: 20, knockback: 52 },
    target: { cooldownMs: 4500, type: 'melee_line', damage: 32, range: 150, width: 26, lungeDistance: 30, knockback: 40 }
  },
  gauntlet: {
    alt: { label: 'SHOCK', cooldownMs: 4200, type: 'melee_circle', damage: 24, range: 68, angle: 360, knockback: 72, stunMs: 260 },
    target: { cooldownMs: 3600, type: 'melee_line', damage: 30, range: 94, width: 36, lungeDistance: 50, knockback: 36 }
  },
  greatsword: {
    alt: { label: 'SLAM', cooldownMs: 5000, type: 'melee_slam', damage: 42, shockwaveDamage: 34, range: 96, innerRange: 50, knockback: 92, stunMs: 450 },
    target: { cooldownMs: 6000, type: 'melee_heavy_line', damage: 58, range: 165, width: 34, delayDamageMs: 120, knockback: 70 }
  },
  scythe: {
    alt: { label: 'REAP', cooldownMs: 5200, type: 'melee_sweet_arc', damage: 20, sweetDamage: 42, range: 112, innerRange: 48, angle: 260, pull: 64 },
    target: { cooldownMs: 4400, type: 'melee_sweet_arc', damage: 22, sweetDamage: 40, range: 122, innerRange: 58, angle: 170, pull: 56, lungeDistance: 24 }
  },
  dagger: {
    alt: { label: 'EXECUTE', cooldownMs: 3600, type: 'melee_precise_line', damage: 18, critDamage: 44, range: 86, width: 8, lungeDistance: 80 },
    target: { cooldownMs: 3200, type: 'melee_precise_line', damage: 16, critDamage: 38, range: 90, width: 8, lungeDistance: 60 }
  },
  rapier: {
    alt: { label: 'RIPOSTE', cooldownMs: 3800, type: 'melee_precise_line', damage: 22, critDamage: 48, range: 140, width: 7, lungeDistance: 52, hitCooldownRefundMs: 120 },
    target: { cooldownMs: 3600, type: 'melee_precise_line', damage: 20, critDamage: 42, range: 132, width: 9, lungeDistance: 42 }
  },
  hammer: {
    alt: { label: 'CRUSH', cooldownMs: 6200, type: 'melee_slam', damage: 38, shockwaveDamage: 30, range: 118, innerRange: 52, knockback: 105, stunMs: 650 },
    target: { cooldownMs: 5200, type: 'melee_slam', damage: 32, shockwaveDamage: 24, range: 92, innerRange: 40, knockback: 70, stunMs: 420 }
  },
  matchlock: {
    alt: { label: 'BAYONET', cooldownMs: 8000, type: 'melee_line', damage: 36, range: 105, width: 24, knockback: 58 },
    target: { cooldownMs: 6500, type: 'hitscan', damage: 48, range: Infinity }
  },
  katana: {
    target: { cooldownMs: 3800, type: 'melee_heavy_line', damage: 44, range: 132, width: 26, lungeDistance: 42, knockback: 42 }
  },
  sniper: {
    target: { cooldownMs: 6000, type: 'hitscan', damage: 55, range: Infinity }
  },
  // --- New-weapon kits (Task 1 revised). 'alt' = LMB, 'target' = R. ----------
  chakram: {
    // 쳐내기: a quick forward swing that also deflects one incoming projectile.
    alt: { label: 'PARRY', cooldownMs: 700, type: 'melee_circle', damage: 18, range: 60, angle: 200, knockback: 18, deflectProjectile: true },
    // 맴돌이: a defensive disc orbits the player for a short time (bespoke).
    target: { label: 'ORBIT', cooldownMs: 6000, type: 'chakram_orbit', durationMs: 1500, orbitDamage: 14, orbitRadius: 46, hitCooldownMs: 400 }
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

  if (buffType === 'rapier_riposte' && weaponKey === 'rapier') {
    const sk = SkillConfig.rapier;
    return {
      ...base,
      cooldown: sk.buffCooldown,
      range: sk.buffRange,
      width: sk.buffWidth,
      hitCooldownRefundMs: sk.buffHitRefundMs,
      missPenaltyMs: 0
    };
  }

  return base;
}
