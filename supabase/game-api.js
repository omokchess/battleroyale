/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './client.js';

/** RPC 가 단일 profiles row 또는 배열로 올 수 있어 정규화 */
function oneRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

/** 랭킹: 누적 킬 내림차순 상위 N명 */
export async function fetchLeaderboard(limit = 100) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('username, total_kills, games_played, equipped_costume')
    .order('total_kills', { ascending: false })
    .order('games_played', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[supabase] fetchLeaderboard', error);
    return [];
  }
  return data ?? [];
}

/** 한 판 결과 기록(킬 → 코인/누적킬). 갱신된 내 프로필 반환. */
export async function recordMatch(kills) {
  if (!supabase) return null;
  const k = Math.max(0, Math.floor(Number(kills) || 0));
  const { data, error } = await supabase.rpc('record_match', { p_kills: k });
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
