/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stick-figure appearance (Phase E): the cosmetic look — colour, line thickness,
 * head shape, accessory. Sanitized + persisted locally, equipped through the same
 * loadout path as motions, and synced as a tiny blob (`look`). Purely cosmetic;
 * it never affects collision (hitboxes use the fixed half-extents in Player).
 */

export const HEAD_SHAPES = ['circle', 'square', 'diamond'];
export const ACCESSORIES = ['none', 'horns', 'antenna', 'halo', 'crown'];

export const DEFAULT_LOOK = Object.freeze({
  color: null,        // null → use the player's costume/auto colour
  lineW: 3,           // 2..6
  head: 'circle',
  accessory: 'none',
});

const STORE = 'pixelroyale_stick_look_v1';
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/** Clamp/validate an arbitrary look blob (local UI or P2P) into a safe look. */
export function sanitizeLook(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return {
    color: isHex(r.color) ? r.color : null,
    lineW: Number.isFinite(r.lineW) ? clamp(Math.round(r.lineW), 2, 6) : DEFAULT_LOOK.lineW,
    head: HEAD_SHAPES.includes(r.head) ? r.head : DEFAULT_LOOK.head,
    accessory: ACCESSORIES.includes(r.accessory) ? r.accessory : DEFAULT_LOOK.accessory,
  };
}

export function equippedStickLook() {
  try { return sanitizeLook(JSON.parse(localStorage.getItem(STORE) || 'null')); }
  catch { return { ...DEFAULT_LOOK }; }
}

export function saveStickLook(look) {
  const safe = sanitizeLook(look);
  try { localStorage.setItem(STORE, JSON.stringify(safe)); } catch {}
  return safe;
}
