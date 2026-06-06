/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Vite 가 빌드 시 import.meta.env.VITE_* 를 인라인합니다.
// 로컬: .env.local / 배포: Vercel 환경변수 (SUPABASE_SETUP.md 참고)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * 키가 설정돼 있을 때만 true. 미설정 시 앱은 죽지 않고
 * "로그인 비활성화" 안내만 보여주도록 graceful 하게 동작합니다.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. ' +
    '로그인·랭킹·코인 기능이 비활성화됩니다. SUPABASE_SETUP.md 를 참고하세요.'
  );
}

/** 설정된 경우에만 실제 클라이언트. 아니면 null. */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth 리디렉션 복귀 시 URL 의 세션 자동 감지
      },
    })
  : null;
