/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Vite 가 빌드 시 import.meta.env.VITE_* 를 인라인합니다.
// 로컬: .env.local / 배포: Vercel 환경변수 (SUPABASE_SETUP.md 참고)
const RAW_URL = import.meta.env.VITE_SUPABASE_URL;
const RAW_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 흔한 입력 실수(앞뒤 공백/따옴표)를 자동으로 정리
const SUPABASE_URL = String(RAW_URL || '').trim().replace(/^["']|["']$/g, '');
const SUPABASE_ANON_KEY = String(RAW_KEY || '').trim().replace(/^["']|["']$/g, '');

function isValidHttpUrl(u) {
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

let client = null;
let configured = false;

if (SUPABASE_URL && SUPABASE_ANON_KEY && isValidHttpUrl(SUPABASE_URL)) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth 리디렉션 복귀 시 URL 의 세션 자동 감지
      },
    });
    configured = true;
  } catch (e) {
    // 잘못된 값이어도 앱 전체가 멈추지 않도록 방어
    console.error('[supabase] 클라이언트 생성 실패 — 게스트 모드로 진행합니다:', e);
  }
} else if (SUPABASE_URL || SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] 환경변수 값이 올바르지 않습니다.\n' +
    '  - VITE_SUPABASE_URL 은 https:// 로 시작하는 전체 주소여야 합니다 (예: https://xxxx.supabase.co)\n' +
    '  - VITE_SUPABASE_ANON_KEY 는 eyJ... 로 시작하는 키여야 합니다\n' +
    '  - 두 값이 서로 바뀌지 않았는지 확인하세요\n' +
    '  현재 인식된 URL: "' + SUPABASE_URL + '"'
  );
} else {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 미설정 — ' +
    '로그인·랭킹·코인 기능이 비활성화(게스트 모드)됩니다. SUPABASE_SETUP.md 참고.'
  );
}

/** 설정이 올바를 때만 true. */
export const isSupabaseConfigured = configured;

/** 설정된 경우에만 실제 클라이언트. 아니면 null. */
export const supabase = client;
