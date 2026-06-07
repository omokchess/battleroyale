/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth for "is this a mobile/touch device?".
 *
 * Intentionally orientation-independent: a tablet held in landscape is still a
 * mobile device, so we never key off innerWidth/innerHeight or portrait checks.
 * We combine the user-agent, coarse-pointer media query and touch points so
 * phones AND tablets (including landscape iPads, which masquerade as macOS)
 * all resolve to `true`.
 */
export function isMobileDevice() {
  // Node / SSR safety: no window means definitely not a phone.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || navigator.vendor || '';
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle|PlayBook/i.test(ua);

  // iPadOS 13+ reports as "MacIntel" but exposes multi-touch — catch it.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;

  // A coarse pointer + real touch is the most reliable signal, and it does not
  // care which way the device is rotated (landscape pads still match).
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
    && hasTouch;

  return uaMobile || iPadOS || coarse;
}

/**
 * Narrower than isMobileDevice(): true only for phones, NOT tablets.
 *
 * Tablets are excluded so we can, e.g., portrait-lock the lobby on phones while
 * leaving pads free. Heuristics: explicit tablet UAs and iPadOS are out; an
 * Android UA without the "Mobile" token is a tablet; iPhone/Android-Mobile are
 * phones; otherwise fall back to the device's smaller physical edge.
 */
export function isPhoneDevice() {
  if (!isMobileDevice()) return false;

  const ua = navigator.userAgent || navigator.vendor || '';

  // Tablets → not a phone.
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9|SM-T/i.test(ua)) return false;
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return false; // iPadOS
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false; // Android tablets omit "Mobile"

  // Clear phone signals.
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (/Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;

  // Fallback: phones have a small shorter edge (~ < 540 CSS px).
  const w = (typeof screen !== 'undefined' && screen.width) || window.innerWidth || 9999;
  const h = (typeof screen !== 'undefined' && screen.height) || window.innerHeight || 9999;
  return Math.min(w, h) <= 540;
}
