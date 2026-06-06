/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, isSupabaseConfigured } from './client.js';

/**
 * 인증 + 프로필 헬퍼.
 * 모든 함수는 Supabase 미설정 시 안전하게 no-op / null 을 반환합니다.
 */

/** Google OAuth 로그인 (현재 페이지로 리디렉션 복귀) */
export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

/** 로그아웃 */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** 현재 세션(없으면 null) */
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * 로그인/로그아웃/리디렉션 복귀 등 인증 상태 변화 구독.
 * @param {(session: import('@supabase/supabase-js').Session | null) => void} cb
 * @returns {() => void} 구독 해제 함수
 */
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session ?? null);
  });
  return () => data.subscription.unsubscribe();
}

/** 내 프로필 행 조회(없으면 null). 트리거가 가입 시 자동 생성합니다. */
export async function fetchMyProfile() {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, coins, total_kills, games_played, equipped_costume')
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    console.error('[supabase] fetchMyProfile', error);
    return null;
  }
  return data;
}

/** 닉네임 변경 (RPC). 갱신된 프로필 반환. */
export async function updateUsername(name) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('update_username', { p_name: name });
  if (error) throw error;
  // RPC 가 단일 row(profiles) 를 반환
  return Array.isArray(data) ? data[0] : data;
}

export { isSupabaseConfigured };
