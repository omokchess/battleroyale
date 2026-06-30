/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { firebaseAuth, firestore } from './client.js';
import { DEFAULT_COSTUMES, DEFAULT_ITEMS, defaultItemById } from './catalog.js';
import { ensureUserProfile } from './account.js';

function oneRow(data) {
  return data || null;
}

function normalizeProfile(id, data) {
  if (!data) return null;
  return {
    id,
    username: data.username || 'Player',
    coins: Number(data.coins || 0),
    total_kills: Number(data.total_kills || 0),
    total_deaths: Number(data.total_deaths || 0),
    games_played: Number(data.games_played || 0),
    equipped_costume: data.equipped_costume || 'default',
    equipped_weaponskins: data.equipped_weaponskins || {},
    equipped_killfx: data.equipped_killfx || 'none',
    equipped_dashtrail: data.equipped_dashtrail || 'none',
    equipped_respawnfx: data.equipped_respawnfx || 'none',
    equipped_title: data.equipped_title || 'none',
    last_match_at: data.last_match_at || null,
    last_daily_at: data.last_daily_at || null,
  };
}

function currentUser() {
  return firebaseAuth?.currentUser || null;
}

function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function withFallbackItems(items) {
  return items.length ? items : DEFAULT_ITEMS;
}

async function catalogItem(id) {
  if (!firestore) return defaultItemById(id);
  const snap = await getDoc(doc(firestore, 'items', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : defaultItemById(id);
}

export async function fetchLeaderboard(limit = 100) {
  if (!firestore) return [];
  try {
    const q = query(
      collection(firestore, 'profiles'),
      orderBy('total_kills', 'desc'),
      orderBy('games_played', 'asc'),
      limitQuery(limit)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => normalizeProfile(d.id, d.data()));
  } catch (error) {
    console.error('[firebase] fetchLeaderboard', error);
    return [];
  }
}

export async function recordMatch(stats) {
  const user = currentUser();
  if (!firestore || !user) return null;
  await ensureUserProfile(user);
  const s = (typeof stats === 'object' && stats !== null) ? stats : { kills: stats };
  const kills = Math.max(0, Math.min(30, Math.floor(Number(s.kills) || 0)));
  const deaths = Math.max(0, Math.floor(Number(s.deaths) || 0));
  const durationMs = Math.max(0, Math.floor(Number(s.durationMs) || 0));
  const weapon = typeof s.weapon === 'string' ? s.weapon : null;
  const profileRef = doc(firestore, 'profiles', user.uid);
  const logRef = doc(collection(firestore, 'profiles', user.uid, 'match_logs'));

  return oneRow(await runTransaction(firestore, async tx => {
    const snap = await tx.get(profileRef);
    if (!snap.exists()) throw new Error('프로필이 없습니다');
    const data = snap.data();
    const now = Date.now();
    const lastMs = timestampToMillis(data.last_match_at);
    if (lastMs && now - lastMs < 60_000) {
      throw new Error('기록 간격이 너무 짧습니다. 잠시 후 다시 시도하세요');
    }
    const today = kstDateKey();
    const daily = data.last_daily_at !== today ? 50 : 0;
    const next = {
      ...data,
      coins: Number(data.coins || 0) + kills * 10 + 20 + daily,
      total_kills: Number(data.total_kills || 0) + kills,
      total_deaths: Number(data.total_deaths || 0) + deaths,
      games_played: Number(data.games_played || 0) + 1,
      last_daily_at: today,
    };
    tx.update(profileRef, {
      coins: next.coins,
      total_kills: next.total_kills,
      total_deaths: next.total_deaths,
      games_played: next.games_played,
      last_match_at: serverTimestamp(),
      last_daily_at: today,
      updated_at: serverTimestamp(),
    });
    tx.set(logRef, {
      weapon,
      kills,
      deaths,
      duration_ms: durationMs,
      created_at: serverTimestamp(),
    });
    return normalizeProfile(user.uid, next);
  }));
}

export async function fetchCostumes() {
  if (!firestore) return [];
  try {
    const q = query(collection(firestore, 'costumes'), orderBy('sort_order', 'asc'));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return rows.length ? rows : DEFAULT_COSTUMES;
  } catch (error) {
    console.error('[firebase] fetchCostumes', error);
    return DEFAULT_COSTUMES;
  }
}

export async function fetchMyCostumeIds() {
  const user = currentUser();
  if (!firestore || !user) return new Set();
  const snap = await getDocs(collection(firestore, 'profiles', user.uid, 'user_costumes'));
  const ids = snap.docs.map(d => d.id);
  if (!ids.includes('default')) ids.push('default');
  return new Set(ids);
}

export async function purchaseCostume(costumeId) {
  return purchaseItem(`costume:${costumeId}`);
}

export async function equipCostume(costumeId) {
  return equipItem(`costume:${costumeId}`);
}

export async function fetchItems() {
  if (!firestore) return [];
  try {
    const q = query(collection(firestore, 'items'), orderBy('category', 'asc'), orderBy('sort_order', 'asc'));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return withFallbackItems(rows);
  } catch (error) {
    console.error('[firebase] fetchItems', error);
    return DEFAULT_ITEMS;
  }
}

export async function fetchMyItemIds() {
  const user = currentUser();
  if (!firestore || !user) return new Set();
  const snap = await getDocs(collection(firestore, 'profiles', user.uid, 'user_items'));
  const ids = snap.docs.map(d => d.id);
  if (!ids.includes('costume:default')) ids.push('costume:default');
  return new Set(ids);
}

function normEquip(cat, value) {
  if (!value || value === 'none') return `${cat}:none`;
  return String(value).includes(':') ? value : `${cat}:${value}`;
}

export function equippedFromProfile(p) {
  if (!p) {
    return {
      costume: 'costume:default',
      weaponskins: {},
      killfx: 'killfx:none',
      dashtrail: 'dashtrail:none',
      respawnfx: 'respawnfx:none',
      title: 'title:none',
    };
  }
  return {
    costume: `costume:${p.equipped_costume || 'default'}`,
    weaponskins: p.equipped_weaponskins || {},
    killfx: normEquip('killfx', p.equipped_killfx),
    dashtrail: normEquip('dashtrail', p.equipped_dashtrail),
    respawnfx: normEquip('respawnfx', p.equipped_respawnfx),
    title: normEquip('title', p.equipped_title),
  };
}

export async function fetchMyEquipped() {
  const user = currentUser();
  if (!firestore || !user) return equippedFromProfile(null);
  const snap = await getDoc(doc(firestore, 'profiles', user.uid));
  return equippedFromProfile(snap.exists() ? snap.data() : null);
}

export async function purchaseItem(itemId) {
  const user = currentUser();
  if (!firestore || !user) return null;
  await ensureUserProfile(user);
  const item = await catalogItem(itemId);
  if (!item) throw new Error('존재하지 않는 아이템입니다');
  if (item.unlock_type && item.unlock_type !== 'coin') throw new Error('구매할 수 없는 아이템입니다');

  const profileRef = doc(firestore, 'profiles', user.uid);
  const itemRef = doc(firestore, 'profiles', user.uid, 'user_items', itemId);
  const costumeId = item.category === 'costume' ? itemId.replace(/^costume:/, '') : null;
  const costumeRef = costumeId ? doc(firestore, 'profiles', user.uid, 'user_costumes', costumeId) : null;

  return oneRow(await runTransaction(firestore, async tx => {
    const [profileSnap, ownedSnap] = await Promise.all([tx.get(profileRef), tx.get(itemRef)]);
    if (!profileSnap.exists()) throw new Error('프로필이 없습니다');
    if (ownedSnap.exists()) throw new Error('이미 보유한 아이템입니다');
    const profile = profileSnap.data();
    const price = Number(item.price || 0);
    if (Number(profile.coins || 0) < price) throw new Error('코인이 부족합니다');
    const next = { ...profile, coins: Number(profile.coins || 0) - price };
    tx.update(profileRef, { coins: next.coins, updated_at: serverTimestamp() });
    tx.set(itemRef, { item_id: itemId, acquired_at: serverTimestamp() });
    if (costumeRef) tx.set(costumeRef, { costume_id: costumeId, acquired_at: serverTimestamp() });
    return normalizeProfile(user.uid, next);
  }));
}

export async function equipItem(itemId) {
  const user = currentUser();
  if (!firestore || !user) return null;
  await ensureUserProfile(user);
  const category = itemId.endsWith(':none') ? itemId.split(':')[0] : null;
  const item = category ? { id: itemId, category, unlock_type: 'coin', price: 0 } : await catalogItem(itemId);
  if (!item) throw new Error('존재하지 않는 아이템입니다');

  const profileRef = doc(firestore, 'profiles', user.uid);
  const itemRef = doc(firestore, 'profiles', user.uid, 'user_items', itemId);

  return oneRow(await runTransaction(firestore, async tx => {
    const profileSnap = await tx.get(profileRef);
    if (!profileSnap.exists()) throw new Error('프로필이 없습니다');
    const profile = profileSnap.data();
    if (!itemId.endsWith(':none')) {
      if (item.unlock_type === 'achievement') {
        if (Number(profile.total_kills || 0) < Number(item.unlock_threshold || 0)) {
          throw new Error('아직 해금하지 않은 아이템입니다');
        }
      } else {
        const ownedSnap = await tx.get(itemRef);
        if (!ownedSnap.exists() && Number(item.price || 0) > 0) throw new Error('보유하지 않은 아이템입니다');
      }
    }

    const update = { updated_at: serverTimestamp() };
    const nextProfile = { ...profile };
    if (item.category === 'costume') {
      update.equipped_costume = itemId.replace(/^costume:/, '');
      nextProfile.equipped_costume = update.equipped_costume;
    } else if (item.category === 'weaponskin') {
      // id = 'weaponskin:{weapon}:{skin}' or 'weaponskin:{weapon}:none'
      const parts = itemId.split(':');
      const weapon = parts[1];
      const skin = parts[2];
      const nextSkins = { ...(profile.equipped_weaponskins || {}) };
      if (!skin || skin === 'none') delete nextSkins[weapon];
      else nextSkins[weapon] = skin;
      update.equipped_weaponskins = nextSkins;
      nextProfile.equipped_weaponskins = nextSkins;
    } else if (item.category === 'killfx') {
      update.equipped_killfx = itemId;
      nextProfile.equipped_killfx = itemId;
    } else if (item.category === 'dashtrail') {
      update.equipped_dashtrail = itemId;
      nextProfile.equipped_dashtrail = itemId;
    } else if (item.category === 'respawnfx') {
      update.equipped_respawnfx = itemId;
      nextProfile.equipped_respawnfx = itemId;
    } else if (item.category === 'title') {
      update.equipped_title = itemId;
      nextProfile.equipped_title = itemId;
    }
    tx.update(profileRef, update);
    return normalizeProfile(user.uid, nextProfile);
  }));
}

// ── 어드민 확인 ─────────────────────────────────────────────
export async function checkIsAdmin() {
  const user = currentUser();
  if (!firestore || !user) return false;
  try {
    const snap = await getDoc(doc(firestore, 'admin', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

// ── 무기 정본 모션 (weapon_motions) — 어드민 write / 전체 read ──────
/** Fetch all canonical weapon motion definitions → { weapon: data }. */
export async function fetchWeaponMotions() {
  if (!firestore) return {};
  try {
    const snap = await getDocs(collection(firestore, 'weapon_motions'));
    const out = {};
    snap.docs.forEach(d => { const data = d.data()?.data; if (data) out[d.id] = data; });
    return out;
  } catch (error) {
    console.error('[firebase] fetchWeaponMotions', error);
    return {};   // fail-soft: callers fall back to localStorage cache / bundle
  }
}

/** Admin upsert of one weapon's canonical motion set (Firestore rules gate write). */
export async function saveWeaponMotion(weaponKey, data) {
  const user = currentUser();
  if (!firestore || !user) throw new Error('로그인 필요');
  if (!weaponKey || typeof weaponKey !== 'string') throw new Error('weaponKey 필요');
  const ref = doc(firestore, 'weapon_motions', weaponKey);
  return runTransaction(firestore, async tx => {
    const snap = await tx.get(ref);
    const version = (snap.exists() ? Number(snap.data().version || 0) : 0) + 1;
    tx.set(ref, { weapon_key: weaponKey, data, version, updated_at: serverTimestamp(), updated_by: user.uid });
    return version;
  });
}

// ── 어드민 도구 ─────────────────────────────────────────────
export async function adminAddCoins(amount) {
  const user = currentUser();
  if (!firestore || !user) throw new Error('로그인 필요');
  const ref = doc(firestore, 'profiles', user.uid);
  return runTransaction(firestore, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('프로필 없음');
    const next = Number(snap.data().coins || 0) + amount;
    tx.update(ref, { coins: next, updated_at: serverTimestamp() });
    return next;
  });
}

export async function adminGrantAllItems() {
  const user = currentUser();
  if (!firestore || !user) throw new Error('로그인 필요');
  const owned = await fetchMyItemIds();
  const toGrant = DEFAULT_ITEMS.filter(it => !owned.has(it.id));
  await Promise.all(toGrant.map(async it => {
    const ref = doc(firestore, 'profiles', user.uid, 'user_items', it.id);
    await setDoc(ref, { item_id: it.id, acquired_at: serverTimestamp() });
    if (it.id.startsWith('costume:')) {
      const cId = it.id.replace(/^costume:/, '');
      const cRef = doc(firestore, 'profiles', user.uid, 'user_costumes', cId);
      await setDoc(cRef, { costume_id: cId, acquired_at: serverTimestamp() });
    }
  }));
  return toGrant.length;
}
