/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 방 커스텀 설정(roomConfig)의 단일 소스.
 *
 * 모든 기본값은 "현행과 동일"하게 맞춰져 있어, 설정을 건드리지 않으면 게임은
 * 지금과 똑같이 동작한다(초소형 맵 700, 자기장/엄폐물/회복 전부 OFF).
 *
 * 설계 원칙:
 *  - 호스트가 roomConfig 를 들고, ROOM_JOINED 으로 참가자에게 전달한다.
 *  - 네트워크로 들어온 값은 신뢰하지 않으므로 normalizeRoomConfig() 로 항상 정규화.
 *  - 이후 설정 항목 추가는 이 파일의 표 + DEFAULT_ROOM_CONFIG 한 곳만 늘리면 된다.
 */

// 경기장 크기 프리셋 → 한 변 픽셀. 맵은 정사각형.
export const ARENA_SIZES = {
  tiny:   700,   // 초소형 (현행)
  small:  1000,  // 소형
  medium: 1400,  // 중형
  large:  1800,  // 대형
  huge:   2200   // 초대형
};

export const ARENA_LABELS = {
  tiny: '초소형', small: '소형', medium: '중형', large: '대형', huge: '초대형'
};

// 엄폐물 밀도 프리셋. 실제 타일 개수는 작업 9에서 경기장 크기와 함께 계산.
// 여기 값은 "기준 면적(700²)당 타일 수" 가중치로만 사용한다.
export const COVER_DENSITY = {
  none: 0,
  few:  6,
  some: 12,
  many: 20
};

export const COVER_LABELS = {
  none: '없음', few: '적음', some: '보통', many: '많음'
};

// 회복 아이템 스폰 주기(ms). 작업 9에서 사용.
export const HEAL_RATES = {
  fast:   8000,
  normal: 15000,
  slow:   26000
};

export const HEAL_RATE_LABELS = {
  fast: '빠름', normal: '보통', slow: '느림'
};

// 기본값 = 현행 동작.
export const DEFAULT_ROOM_CONFIG = Object.freeze({
  arenaSize: 'tiny',
  storm: false,
  cover: 'none',
  healing: false,
  healingRate: 'normal'
});

const oneOf = (value, table, fallback) =>
  (Object.prototype.hasOwnProperty.call(table, value) ? value : fallback);

/**
 * 임의 입력(로컬 UI 또는 네트워크 수신)을 안전한 roomConfig 로 정규화.
 * 알 수 없는 값은 기본값으로 대체한다.
 */
export function normalizeRoomConfig(raw) {
  const c = (raw && typeof raw === 'object') ? raw : {};
  return {
    arenaSize:   oneOf(c.arenaSize, ARENA_SIZES, DEFAULT_ROOM_CONFIG.arenaSize),
    storm:       Boolean(c.storm),
    cover:       oneOf(c.cover, COVER_DENSITY, DEFAULT_ROOM_CONFIG.cover),
    healing:     Boolean(c.healing),
    healingRate: oneOf(c.healingRate, HEAL_RATES, DEFAULT_ROOM_CONFIG.healingRate)
  };
}

/** roomConfig → 맵 크기. 정사각형이라 width === height. */
export function arenaDimensions(config) {
  const cfg = normalizeRoomConfig(config);
  const side = ARENA_SIZES[cfg.arenaSize];
  return { mapWidth: side, mapHeight: side };
}

/**
 * 로비 방 목록에 띄울 짧은 배지 라벨 배열.
 * 기본값(현행)일 때도 최소한 경기장 크기 한 개는 보여 준다.
 * 예: ['대형', '자기장', '엄폐물 많음', '회복']
 */
export function roomConfigBadges(config) {
  const cfg = normalizeRoomConfig(config);
  const badges = [ARENA_LABELS[cfg.arenaSize]];
  if (cfg.storm) badges.push('자기장');
  if (cfg.cover !== 'none') badges.push(`엄폐물 ${COVER_LABELS[cfg.cover]}`);
  if (cfg.healing) badges.push('회복');
  return badges;
}
