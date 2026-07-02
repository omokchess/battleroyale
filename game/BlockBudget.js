/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runtime output budgets for block-gimmick weapons (BlockVM 2.0 — the balance
 * heart). Instead of restricting WHAT blocks a weapon may use, the host meters
 * its OUTPUT per player per second: however clever the combo, the totals stay
 * fair. Enforced host-side (authoritative); the editor reads fill() for its live
 * warning gauges.
 *
 *  - Damage: rolling 1-second cap = base-weapon DPS × 1.2. Once the second's cap
 *    is spent, further damage is SOFT-capped (a small trickle) so total damage/s
 *    converges near the cap regardless of how hits are stacked.
 *  - CC: status-effect seconds granted per second are capped (stun immunity still
 *    applies elsewhere).
 *  - Entities: spawns/second AND concurrent live entities per owner are capped.
 *  - (Compute + movement caps live in BlockVM / the movement clamps.)
 */

export const BUDGET = {
  damageMul: 1.2,     // per-second damage cap = baseDPS × this
  minDpsCap: 24,      // floor so ultra-slow weapons still function
  softTrickle: 0.12,  // fraction of over-cap damage that still lands (feel, not power)
  overflow: 0.3,      // bounded overflow buffer above the cap (total ≤ cap×1.3)
  ccCapMs: 1600,      // status-effect ms granted per second
  spawnPerSec: 12,    // entity spawns per second
  concurrent: 16,     // concurrent live block entities per owner
};

export class BlockBudget {
  /** baseDps = the weapon's intended single-target DPS (damage ÷ cooldown-seconds). */
  constructor(baseDps = 20) {
    this.dpsCap = Math.max(BUDGET.minDpsCap, (Number.isFinite(baseDps) ? baseDps : 20) * BUDGET.damageMul);
    this._sec = -1; this.dmg = 0; this.cc = 0; this.spawns = 0;
  }
  reset() { this._sec = -1; this.dmg = 0; this.cc = 0; this.spawns = 0; }

  _roll(now) {
    const s = Math.floor(now / 1000);
    if (s !== this._sec) { this._sec = s; this.dmg = 0; this.cc = 0; this.spawns = 0; }
  }

  /** Meter a damage request → the amount actually allowed to land this second.
   *  Under the cap: full. Over the cap: the remainder plus a diminishing trickle
   *  drawn from a bounded overflow buffer (cap × overflow), so the second's TOTAL
   *  can never exceed cap × (1 + overflow) — it converges regardless of combo. */
  grantDamage(now, requested) {
    if (!(requested > 0)) return 0;
    this._roll(now);
    const rem = Math.max(0, this.dpsCap - this.dmg);
    if (requested <= rem) { this.dmg += requested; return requested; }
    const overflowUsed = Math.max(0, this.dmg - this.dpsCap);
    const overflowRoom = Math.max(0, this.dpsCap * BUDGET.overflow - overflowUsed);
    const trickle = Math.min((requested - rem) * BUDGET.softTrickle, overflowRoom);
    const grant = rem + trickle;
    this.dmg += grant;
    return grant;
  }

  /** Meter a status-effect duration (ms) → allowed ms this second (0 = blocked). */
  grantCC(now, ms) {
    if (!(ms > 0)) return 0;
    this._roll(now);
    const rem = Math.max(0, BUDGET.ccCapMs - this.cc);
    const grant = Math.min(ms, rem);
    this.cc += grant;
    return grant;
  }

  /** May a new entity spawn now? (spawn-rate AND concurrent-count capped). */
  allowSpawn(now, liveCount) {
    this._roll(now);
    if (liveCount >= BUDGET.concurrent) return false;
    if (this.spawns >= BUDGET.spawnPerSec) return false;
    this.spawns++;
    return true;
  }

  /** 0..1+ fill of each budget this second (for the editor gauge / warnings). */
  fill(now) {
    this._roll(now);
    return {
      damage: this.dpsCap ? this.dmg / this.dpsCap : 0,
      cc: this.cc / BUDGET.ccCapMs,
      spawn: this.spawns / BUDGET.spawnPerSec,
    };
  }
}

/** baseDPS from a weapon stat block (damage per cooldown-second). */
export function weaponBaseDps(stats) {
  const dmg = Number(stats?.damage) || 18;
  const cdSec = Math.max(0.2, (Number(stats?.cooldownMs) || 600) / 1000);
  return dmg / cdSec;
}

/**
 * Static, worst-case estimate of a program's OUTPUT per second vs. the budget —
 * drives the editor's live warning gauge so a user sees when a combo will be
 * throttled BEFORE they take it into a match. Pure (no sim); loops multiply
 * their body, conditionals take the heavier branch. Returns 0..1+ fills where
 * >1 means "the host will soft-cap this" (not broken — just no extra reward).
 */
export function estimateBudget(program, stats, tier = 'workshop') {
  const base = Number(stats?.damage) || 18;
  const cap = Math.max(BUDGET.minDpsCap, weaponBaseDps(stats) * BUDGET.damageMul);
  const cdMs = Math.max(200, Number(stats?.cooldownMs) || 600);
  const attacksPerSec = 1000 / cdMs;
  const loopCap = tier === 'admin' ? 100 : 50;

  const funcs = program?.funcs || {};
  // Sum one activation's worst-case output over a statement list. `depth` guards
  // against mutual/self function calls blowing up the static estimate.
  const walk = (stmts, mult, depth = 0) => {
    let dmg = 0, cc = 0, spawns = 0;
    for (const s of stmts || []) {
      if (!s || typeof s !== 'object') continue;
      if (s.op === 'callFunc') {
        const f = funcs[s.name];
        if (f && depth < 8) { const r = walk(f.do, mult, depth + 1); dmg += r.dmg; cc += r.cc; spawns += r.spawns; }
      } else if (s.op === 'repeat' || s.op === 'repeatVar') {
        const n = Math.min(loopCap, s.op === 'repeat' ? litOr(s.count, 3) : Math.abs(litOr(s.to, 3) - litOr(s.from, 0)) + 1);
        const r = walk(s.body, mult * n, depth); dmg += r.dmg; cc += r.cc; spawns += r.spawns;
      } else if (s.op === 'while') {
        const r = walk(s.body, mult * loopCap, depth); dmg += r.dmg; cc += r.cc; spawns += r.spawns; // worst case
      } else if (s.op === 'if') {
        const a = walk(s.then, mult, depth), b = walk(s.else, mult, depth);
        dmg += Math.max(a.dmg, b.dmg); cc += Math.max(a.cc, b.cc); spawns += Math.max(a.spawns, b.spawns);
      } else if (s.op === 'spawnMelee' || s.op === 'spawnArea' || s.op === 'spawnProjectile') {
        dmg += mult * base * clamp01to300(s.damagePct, 100) / 100; spawns += mult;
      } else if (s.op === 'split') {
        const c = Math.min(8, litOr(s.count, 2));
        dmg += mult * c * base * clamp01to300(s.damagePct, 60) / 100; spawns += mult * c;
      } else if (s.op === 'applyStatus') {
        cc += mult * litOr(s.durationMs, 1000);
      }
    }
    return { dmg, cc, spawns };
  };

  // Aggregate every attack-ish handler + entity bursts.
  let dmg = 0, cc = 0, spawns = 0;
  for (const ev of program?.events || []) { const r = walk(ev.do, 1); dmg += r.dmg; cc += r.cc; spawns += r.spawns; }
  for (const tag of Object.keys(program?.entities || {})) {
    for (const ev of program.entities[tag].events || []) { const r = walk(ev.do, 1); dmg += r.dmg; cc += r.cc; spawns += r.spawns; }
  }

  return {
    damage: (dmg * attacksPerSec) / cap,
    cc: (cc * attacksPerSec) / BUDGET.ccCapMs,
    spawn: (spawns * attacksPerSec) / BUDGET.spawnPerSec,
    throttled: (dmg * attacksPerSec) > cap * (1 + BUDGET.overflow) || (spawns * attacksPerSec) > BUDGET.spawnPerSec,
  };
}
// Literal value of an AST expr slot (a reporter block → assume its default N).
function litOr(v, def) { return typeof v === 'number' && Number.isFinite(v) ? v : def; }
function clamp01to300(v, def) { const n = typeof v === 'number' ? v : def; return Math.max(0, Math.min(300, n)); }
