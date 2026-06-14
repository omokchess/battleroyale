/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared status-effect tuning (Task 10-1). Host simulates; values are synced via
 * the player snapshot. Cosmetic icons/colors live in the renderer.
 *
 *  - Bleed 🩸  4/s for 3s (12 total). Non-stacking: re-applying refreshes the
 *    duration only. Kill credit goes to the applier.
 *  - Burn 🔥   6/s for 3s (18 total). Non-stacking refresh. Coexists with bleed.
 *  - Slow ❄   −30% move speed. Duration varies by source; a LONGER remaining
 *    duration wins (never shortened). Dash still usable.
 *  - Stun 💫  movement + attacks locked; after it ends the target is stun-immune
 *    for a window so it can't be chain-stunned.
 *
 * DoT ticks fire once per second (first tick 1s after application).
 */
export const STATUS = {
  bleed: { durationMs: 3000, dps: 4, deathName: '출혈', viaLabel: '출혈로' },
  burn:  { durationMs: 3000, dps: 6, deathName: '화상', viaLabel: '화상으로' },
  slow:  { moveFactor: 0.7 },        // −30% movement
  stun:  { immuneMs: 2000 },         // stun-immunity window after a stun ends
};
