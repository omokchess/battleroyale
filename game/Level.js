/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Side-scroller level + platformer physics constants (Phase 1 of the top-down →
 * platformer pivot). A level is a set of axis-aligned rectangles in world px:
 *   - solids:  full collision (ground, walls, ceilings, pillars)
 *   - oneWays: one-way platforms — block only when landing on them from above;
 *              you can jump up through them and drop down (down + jump)
 * plus ground spawn points. Geometry is DETERMINISTIC from the size preset, so
 * the host sim and every client build the identical level with no extra sync —
 * the same philosophy the grass/water already use.
 *
 * Coordinates: a body is an axis-aligned box centred at (x, y) with half-extents
 * (halfW, halfH). Collision lives in Collision.moveAndCollide.
 */

// Platformer physics tuning (world px, seconds). Tuned for a snappy, floaty-ish
// feel with clear air control; revisit after playtests (Phase 1 deliverable).
export const PHYS = {
  gravity: 2600,        // downward accel (px/s²)
  maxFall: 1500,        // terminal fall speed (px/s)
  runSpeed: 360,        // top horizontal run speed (px/s)
  groundAccel: 3600,    // ground acceleration toward target run speed
  groundDecel: 4800,    // ground deceleration when no input
  airAccel: 2200,       // weaker air control
  airDecel: 1400,
  jumpSpeed: 880,       // initial upward jump velocity
  jumpCutMul: 0.45,     // releasing jump early multiplies remaining up-velocity
  coyoteMs: 90,         // grace window to still jump just after leaving ground
  jumpBufferMs: 110,    // press jump slightly before landing and it still fires
  // Dash (re-used from the old DashConfig idea, now a ground/air burst).
  dashSpeed: 980,
  dashMs: 150,
  dashCdMs: 700,
  dashIframeMs: 150,
};

export const TILE = 32;          // authoring grid unit
const GROUND_H = 2 * TILE;       // ground slab thickness
const WALL_W = 0.75 * TILE;      // side wall thickness
const PLAT_H = 0.5 * TILE;       // one-way platform thickness

/**
 * Level pixel size for a square arena-side preset. Side-scroller levels read
 * better a bit wider than tall, so width = side·1.4, height = side.
 */
export function levelDimensions(side) {
  return { width: Math.round(side * 1.4), height: side };
}

/**
 * Build the (single, Phase-1) test level: a symmetric layered arena — solid
 * ground + side walls, three tiers of one-way platforms mirrored left↔right,
 * and two ground spawn points. Deterministic from `side`.
 */
export function buildLevel(side) {
  const { width: W, height: H } = levelDimensions(side);
  const solids = [];
  const oneWays = [];

  // Outer shell: ground slab + left/right walls (no ceiling — open top).
  solids.push({ x: 0, y: H - GROUND_H, w: W, h: GROUND_H });          // ground
  solids.push({ x: 0, y: 0, w: WALL_W, h: H });                        // left wall
  solids.push({ x: W - WALL_W, y: 0, w: WALL_W, h: H });               // right wall

  // A couple of solid pedge ledges off each wall for wall-relative play.
  const ledgeW = Math.round(W * 0.14);
  solids.push({ x: WALL_W, y: H - GROUND_H - 3 * TILE, w: ledgeW, h: TILE });
  solids.push({ x: W - WALL_W - ledgeW, y: H - GROUND_H - 3 * TILE, w: ledgeW, h: TILE });

  // Three tiers of one-way platforms, mirrored about the vertical centre line.
  const platW = Math.round(W * 0.22);
  const cx = W / 2;
  const tiers = [
    { y: H - GROUND_H - 5 * TILE, dx: W * 0.26 },   // low, out toward the sides
    { y: H - GROUND_H - 9 * TILE, dx: W * 0.14 },   // mid, nearer centre
    { y: H - GROUND_H - 13 * TILE, dx: 0 },         // high centre platform
  ];
  for (const t of tiers) {
    if (t.dx === 0) {
      oneWays.push({ x: Math.round(cx - platW / 2), y: Math.round(t.y), w: platW, h: PLAT_H });
    } else {
      oneWays.push({ x: Math.round(cx - t.dx - platW / 2), y: Math.round(t.y), w: platW, h: PLAT_H });
      oneWays.push({ x: Math.round(cx + t.dx - platW / 2), y: Math.round(t.y), w: platW, h: PLAT_H });
    }
  }

  // Ground spawns near the left/right thirds, on top of the ground slab.
  const spawnY = H - GROUND_H;
  const spawns = [
    { x: Math.round(W * 0.2), y: spawnY },
    { x: Math.round(W * 0.8), y: spawnY },
  ];

  return { width: W, height: H, solids, oneWays, spawns };
}
