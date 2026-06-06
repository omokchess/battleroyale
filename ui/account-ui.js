/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  signInWithGoogle,
  signOut,
  onAuthChange,
  fetchMyProfile,
  isSupabaseConfigured,
} from '../supabase/account.js';
import {
  fetchLeaderboard,
  fetchCostumes,
  fetchMyCostumeIds,
  purchaseCostume,
  equipCostume,
  recordMatch,
} from '../supabase/game-api.js';

/**
 * 계정(로그인/상단바) + 랭킹 + 상점 UI 를 담당.
 * main.js 는 init() 한 번만 호출하고, 콜백으로 로비 전환을 처리합니다.
 */

// ── 내부 상태 ───────────────────────────────────────────────
let profile = null;            // { id, username, coins, total_kills, equipped_costume }
let costumeCatalog = [];       // [{ id, name, price, color, accent_color }]
let ownedIds = new Set();      // 보유 코스튬 id
let callbacks = {};            // { onEnterLobby, onRequireLogin }

// ── DOM 헬퍼 ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// ── 공개 API ────────────────────────────────────────────────

/** 현재 로그인 프로필(없으면 null) */
export function getProfile() {
  return profile;
}

/** 게임에 넘길 착용 코스튬 색. 미로그인/기본이면 null → 기존 해시색 사용. */
export function getEquippedCostume() {
  if (!profile) return null;
  const c = costumeCatalog.find((x) => x.id === profile.equipped_costume);
  if (!c || c.id === 'default') return null;
  return { color: c.color, accentColor: c.accent_color };
}

/** 로비 닉네임 입력 기본값 */
export function getUsername() {
  return profile?.username || '';
}

/**
 * 초기화: 버튼 배선 + 인증 상태 구독.
 * @param {{ onEnterLobby: (profile|null)=>void, onRequireLogin: ()=>void }} cbs
 */
export function init(cbs) {
  callbacks = cbs || {};
  wireStaticButtons();

  // Supabase 미설정 → 게스트 모드(로그인 없이 바로 플레이, 계정기능 숨김)
  if (!isSupabaseConfigured) {
    setGuestMode();
    callbacks.onEnterLobby?.(null);
    return;
  }

  // 인증 상태 변화 구독 (초기 INITIAL_SESSION 포함). 리디렉션 복귀도 여기서 처리.
  onAuthChange((session) => {
    // supabase 콜백 안에서 직접 await 하면 데드락 위험 → 다음 틱으로 미룸
    setTimeout(() => handleSession(session), 0);
  });
}

/** 매치 종료 후 코인/킬 갱신용: 프로필 재조회 & 상단바 갱신 */
export async function refreshProfile() {
  if (!isSupabaseConfigured) return null;
  profile = await fetchMyProfile();
  renderAccountBar();
  return profile;
}

/** 한 판 결과(킬)를 서버에 기록하고 코인/상단바 갱신 */
export async function reportMatch(kills) {
  if (!isSupabaseConfigured || !profile) return;
  const k = Math.max(0, Math.floor(Number(kills) || 0));
  if (k <= 0) return;
  const updated = await recordMatch(k);
  if (updated) {
    profile = updated;
    renderAccountBar();
  }
}

// ── 내부 로직 ───────────────────────────────────────────────

async function handleSession(session) {
  if (session) {
    profile = await fetchMyProfile();
    // 코스튬 카탈로그/보유목록은 한 번만 받아두면 됨(상점 열 때 갱신)
    if (!costumeCatalog.length) costumeCatalog = await fetchCostumes();
    ownedIds = await fetchMyCostumeIds();
    renderAccountBar();
    callbacks.onEnterLobby?.(profile);
  } else {
    profile = null;
    callbacks.onRequireLogin?.();
  }
}

function setGuestMode() {
  const bar = $('accountBar');
  if (bar) bar.classList.add('hidden');
  const note = $('authNote');
  if (note) {
    note.textContent = 'Supabase 미설정 — 로그인 없이 게스트로 플레이합니다.';
    note.classList.remove('hidden');
  }
}

function wireStaticButtons() {
  $('googleLoginBtn')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      const note = $('authNote');
      if (note) {
        note.textContent = '로그인에 실패했습니다: ' + (e?.message || e);
        note.classList.remove('hidden');
      }
    }
  });

  $('logoutBtn')?.addEventListener('click', async () => {
    await signOut();
    // onAuthChange 가 onRequireLogin 을 호출 → main.js 가 게이트 표시
  });

  $('rankBtn')?.addEventListener('click', openLeaderboard);
  $('shopBtn')?.addEventListener('click', openShop);

  // 모달 닫기 (배경/버튼 공용)
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = el.getAttribute('data-close-modal');
      if (e.target === el || el.tagName === 'BUTTON') $(id)?.classList.add('hidden');
    });
  });
}

function renderAccountBar() {
  const bar = $('accountBar');
  if (!bar) return;
  bar.classList.remove('hidden');
  if (profile) {
    const nameEl = $('accountName');
    const coinEl = $('accountCoins');
    if (nameEl) nameEl.textContent = profile.username;
    if (coinEl) coinEl.textContent = profile.coins;
  }
}

// ── 랭킹 모달 ───────────────────────────────────────────────
async function openLeaderboard() {
  const modal = $('leaderboardModal');
  const body = $('leaderboardBody');
  if (!modal || !body) return;
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="text-gray-500 text-center py-6 font-mono text-xs">불러오는 중...</div>';

  const rows = await fetchLeaderboard(100);
  if (!rows.length) {
    body.innerHTML = '<div class="text-gray-500 text-center py-6 font-mono text-xs">아직 기록이 없습니다.</div>';
    return;
  }

  const myName = profile?.username;
  body.innerHTML = `
    <table class="w-full font-mono text-xs">
      <thead>
        <tr class="text-[#66fcf1] border-b border-gray-600">
          <th class="text-left py-1 w-10">#</th>
          <th class="text-left py-1">닉네임</th>
          <th class="text-right py-1 w-16">킬</th>
          <th class="text-right py-1 w-16">판수</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => {
          const mine = myName && r.username === myName;
          const rankColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500';
          return `<tr class="${mine ? 'bg-[#0b3038]' : ''} border-b border-gray-800">
            <td class="py-1 font-bold ${rankColor}">${i + 1}</td>
            <td class="py-1 text-white truncate max-w-[140px]">${escapeHtml(r.username)}${mine ? ' <span class="text-[#45f3ff]">(나)</span>' : ''}</td>
            <td class="py-1 text-right text-[#66fcf1] font-bold">${r.total_kills}</td>
            <td class="py-1 text-right text-gray-400">${r.games_played ?? 0}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── 상점 모달 ───────────────────────────────────────────────
async function openShop() {
  const modal = $('shopModal');
  const body = $('shopBody');
  if (!modal || !body) return;
  modal.classList.remove('hidden');

  // 최신 데이터로 갱신
  if (!costumeCatalog.length) costumeCatalog = await fetchCostumes();
  ownedIds = await fetchMyCostumeIds();
  renderShop();
}

function renderShop() {
  const body = $('shopBody');
  const coinEl = $('shopCoins');
  if (!body) return;
  if (coinEl) coinEl.textContent = profile?.coins ?? 0;

  body.innerHTML = costumeCatalog.map((c) => {
    const owned = ownedIds.has(c.id);
    const equipped = profile?.equipped_costume === c.id;
    let btn;
    if (equipped) {
      btn = `<button disabled class="w-full mt-2 py-1.5 text-[10px] font-bold uppercase border border-[#45f3ff] text-[#45f3ff] bg-[#0b3038] cursor-default">착용 중</button>`;
    } else if (owned) {
      btn = `<button data-equip="${c.id}" class="w-full mt-2 py-1.5 text-[10px] font-bold uppercase border border-teal-400 text-teal-300 hover:bg-teal-900/40 cursor-pointer active:scale-95 transition-all">착용하기</button>`;
    } else {
      btn = `<button data-buy="${c.id}" class="w-full mt-2 py-1.5 text-[10px] font-bold uppercase border border-yellow-500 text-yellow-300 hover:bg-yellow-900/30 cursor-pointer active:scale-95 transition-all">${c.price} 코인 구매</button>`;
    }
    return `
      <div class="bg-[#0b0c10] border-2 border-gray-700 p-3 flex flex-col items-center">
        <div class="w-12 h-12 rounded-full mb-2 border-2" style="background:${c.color}; border-color:${c.accent_color}"></div>
        <div class="font-mono text-xs text-white font-bold">${escapeHtml(c.name)}</div>
        <div class="font-mono text-[10px] text-gray-400">${c.price === 0 ? '무료' : c.price + ' 코인'}</div>
        ${btn}
      </div>`;
  }).join('');

  // 구매/착용 배선
  body.querySelectorAll('[data-buy]').forEach((el) => {
    el.addEventListener('click', () => handleBuy(el.getAttribute('data-buy')));
  });
  body.querySelectorAll('[data-equip]').forEach((el) => {
    el.addEventListener('click', () => handleEquip(el.getAttribute('data-equip')));
  });
}

async function handleBuy(id) {
  try {
    const updated = await purchaseCostume(id);
    if (updated) profile = updated;
    ownedIds.add(id);
    renderShop();
    renderAccountBar();
  } catch (e) {
    alert(e?.message || '구매에 실패했습니다.');
  }
}

async function handleEquip(id) {
  try {
    const updated = await equipCostume(id);
    if (updated) profile = updated;
    renderShop();
    renderAccountBar();
  } catch (e) {
    alert(e?.message || '착용에 실패했습니다.');
  }
}
