/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './client.js';

/** RPC 가 단일 profiles row 또는 배열로 올 수 있어 정규화 */
function oneRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

// 새 컬럼이 아직 없는 구 스키마면 true (PostgREST 42703 / "does not exist").
function isMissingColumnError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = `${error.message || ''} ${error.details || ''}`;
  return code === '42703' || /column .* does not exist|total_deaths/i.test(msg);
}

// record_match 새 시그니처(p_weapon/p_deaths/p_duration_ms)가 아직 없는 구 스키마면 true.
// PostgREST 는 함수 시그니처 미스 시 PGRST202 를 돌려줌.
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  return code === 'PGRST202' || /could not find the function|record_match/i.test(msg);
}

/** 랭킹: 누적 킬 내림차순 상위 N명 */
export async function fetchLeaderboard(limit = 100) {
  if (!supabase) return [];
  let { data, error } = await supabase
    .from('profiles')
    .select('username, total_kills, total_deaths, games_played, equipped_costume')
    .order('total_kills', { ascending: false })
    .order('games_played', { ascending: true })
    .limit(limit);

  // 마이그레이션 전(총사망 컬럼 없음) DB 호환: 레거시 컬럼으로 재조회.
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await supabase
      .from('profiles')
      .select('username, total_kills, games_played, equipped_costume')
      .order('total_kills', { ascending: false })
      .order('games_played', { ascending: true })
      .limit(limit));
    if (Array.isArray(data)) data.forEach(r => { if (r.total_deaths == null) r.total_deaths = 0; });
  }

  if (error) {
    console.error('[supabase] fetchLeaderboard', error);
    return [];
  }
  return data ?? [];
}

/**
 * 한 판 결과 기록 → 코인/누적킬/판수 갱신 + 텔레메트리 로그. 갱신된 프로필 반환.
 * @param {number|{kills:number, deaths?:number, weapon?:string, durationMs?:number}} stats
 *   숫자만 넘기던 구버전 호출도 지원.
 */
export async function recordMatch(stats) {
  if (!supabase) return null;
  const s = (typeof stats === 'object' && stats !== null) ? stats : { kills: stats };
  const k = Math.max(0, Math.floor(Number(s.kills) || 0));
  const d = Math.max(0, Math.floor(Number(s.deaths) || 0));
  const dur = Math.max(0, Math.floor(Number(s.durationMs) || 0));
  const weapon = typeof s.weapon === 'string' ? s.weapon : null;
  let { data, error } = await supabase.rpc('record_match', {
    p_kills: k,
    p_weapon: weapon,
    p_deaths: d,
    p_duration_ms: dur,
  });

  // 마이그레이션 전(구 1-인자 함수만 존재) DB 호환: 킬 수만 기록.
  if (error && isMissingFunctionError(error)) {
    ({ data, error } = await supabase.rpc('record_match', { p_kills: k }));
  }

  if (error) {
    console.error('[supabase] recordMatch', error);
    return null;
  }
  return oneRow(data);
}

/** 코스튬 카탈로그 전체 */
export async function fetchCostumes() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('costumes')
    .select('id, name, price, color, accent_color, sort_order')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[supabase] fetchCostumes', error);
    return [];
  }
  return data ?? [];
}

/** 내가 보유한 코스튬 id 목록 (Set) */
export async function fetchMyCostumeIds() {
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from('user_costumes')
    .select('costume_id');
  if (error) {
    console.error('[supabase] fetchMyCostumeIds', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.costume_id));
}

/** 코스튬 구매(RPC). 갱신된 프로필 반환. 실패 시 throw. */
export async function purchaseCostume(costumeId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('purchase_costume', { p_costume: costumeId });
  if (error) throw error;
  return oneRow(data);
}

/** 코스튬 착용(RPC). 갱신된 프로필 반환. 실패 시 throw. */
export async function equipCostume(costumeId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('equip_costume', { p_costume: costumeId });
  if (error) throw error;
  return oneRow(data);
}

// --- 범용 아이템 카탈로그 (상점 확장) -----------------------------------------
// items 테이블이 아직 없는 구 스키마면 모든 함수가 빈 값/no-op 으로 폴백한다.

function isMissingTableError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = `${error.message || ''} ${error.details || ''}`;
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg);
}

/** 전체 아이템 카탈로그 (모든 카테고리). 구 스키마면 []. */
export async function fetchItems() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('items')
    .select('id, category, name, price, data, unlock_type, unlock_threshold, sort_order')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) {
    if (!isMissingTableError(error)) console.error('[supabase] fetchItems', error);
    return [];
  }
  return data ?? [];
}

/** 내가 보유한 아이템 id Set. 구 스키마면 빈 Set. */
export async function fetchMyItemIds() {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from('user_items').select('item_id');
  if (error) {
    if (!isMissingTableError(error)) console.error('[supabase] fetchMyItemIds', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.item_id));
}

// Normalize a stored slot value to a full catalog id (e.g. 'ember' or
// 'weaponskin:ember' or 'none' → 'weaponskin:ember' / 'weaponskin:none').
function normEquip(cat, v) {
  if (!v || v === 'none') return cat + ':none';
  return String(v).includes(':') ? v : cat + ':' + v;
}

/** 내 카테고리별 착용 정보를 "전체 아이템 id" 로 정규화해 반환. */
export function equippedFromProfile(p) {
  if (!p) return { costume: 'costume:default', weaponskin: 'weaponskin:none', killfx: 'killfx:none', dashtrail: 'dashtrail:none', respawnfx: 'respawnfx:none', title: 'title:none' };
  return {
    costume: 'costume:' + (p.equipped_costume || 'default'),
    weaponskin: normEquip('weaponskin', p.equipped_weaponskin),
    killfx: normEquip('killfx', p.equipped_killfx),
    dashtrail: normEquip('dashtrail', p.equipped_dashtrail),
    respawnfx: normEquip('respawnfx', p.equipped_respawnfx),
    title: normEquip('title', p.equipped_title)
  };
}

/** 내 카테고리별 착용 정보 (전체 아이템 id). 구 스키마/미로그인이면 기본값. */
export async function fetchMyEquipped() {
  if (!supabase) return equippedFromProfile(null);
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return equippedFromProfile(null);
  const { data, error } = await supabase
    .from('profiles')
    .select('equipped_costume, equipped_weaponskin, equipped_killfx, equipped_dashtrail, equipped_respawnfx, equipped_title')
    .eq('id', uid)
    .maybeSingle();
  if (error || !data) return equippedFromProfile(null);
  return equippedFromProfile(data);
}

/** 아이템 구매(RPC). 갱신된 프로필 반환. 실패 시 throw. */
export async function purchaseItem(itemId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('purchase_item', { p_item: itemId });
  if (error) throw error;
  return oneRow(data);
}

/** 아이템 착용(RPC). 갱신된 프로필 반환. 실패 시 throw. */
export async function equipItem(itemId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('equip_item', { p_item: itemId });
  if (error) throw error;
  return oneRow(data);
}
