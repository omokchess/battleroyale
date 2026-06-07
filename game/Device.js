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
