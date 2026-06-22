/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Water (Task 4-E) — natural lakes that block walking but let projectiles fly
 * over. Generation mirrors the COVER approach: a per-match seed drives a
 * deterministic RNG (same Math.imul style), so the host and every client build
 * the identical layout from one shared seed (the cover seed is reused — no extra
 * network sync). Lakes are scattered freely (no left↔right mirror) and vary each
 * match. `generateWater(w, h, seed)` is the single source shared by collision
 * (Game) and rendering (Renderer).
 *
 * Returns { tiles, cells, cols, rows, cell }:
 *  - tiles: merged horizontal strips { x, y, w, h } in world units — cheap
 *    rectangles for the existing circle/segment helpers in Cover.js.
 *  - cells: Set of "col,row" keys — used by the renderer for per-cell shoreline
 *    foam (a cell draws foam on each side whose neighbour is land).
 */

const CELL = 32;          // water cell edge in world px
const EDGE_MARGIN = 64;   // keep lakes off the arena border
const CENTER_CLEAR = 120; // keep the dead-center open (spawns / fair start)

// Deterministic seeded RNG — same integer-hash style as Cover.js, so host and
// clients derive the identical scatter from one shared seed.
function makeRng(seed) {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822519);
    s = Math.imul(s ^ (s >>> 13), 3266489917);
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/**
 * Build the water layout for a map. Irregular lakes are scattered freely from
 * the seed (no mirror), so each match differs — just like the cover obstacles.
 */
export function generateWater(mapWidth, mapHeight, seed = 0) {
  const cell = CELL;
  const cols = Math.floor(mapWidth / cell);
  const rows = Math.floor(mapHeight / cell);
  const cx = mapWidth / 2, cy = mapHeight / 2;
  const span = Math.min(mapWidth, mapHeight);
  const cells = new Set();
  if (cols < 6 || rows < 6) return { tiles: [], cells, cols, rows, cell };

  const rng = makeRng(seed);
  const rand = (lo, hi) => lo + rng() * (hi - lo);

  // Scatter a few organic lakes anywhere in the playable area. Each blob's
  // radius wobbles with the angle so the shoreline reads organic, not circular.
  // Count scales mildly with arena area; positions/sizes/phases all come from
  // the seed, so the layout is deterministic yet varies every match.
  const blobCount = 2 + Math.round(rand(0, 1) + (mapWidth * mapHeight) / (1400 * 1400));
  const pad = span * 0.12;
  const blobs = [];
  for (let i = 0; i < blobCount; i++) {
    blobs.push({
      x: rand(EDGE_MARGIN + pad, mapWidth - EDGE_MARGIN - pad),
      y: rand(EDGE_MARGIN + pad, mapHeight - EDGE_MARGIN - pad),
      r: span * rand(0.085, 0.16),
      p: rand(0, Math.PI * 2),
      k3: rand(0.22, 0.36),
      k5: rand(0.14, 0.24),
    });
  }
  const inWater = (px, py) => {
    for (const b of blobs) {
      const dx = px - b.x, dy = py - b.y;
      const th = Math.atan2(dy, dx);
      const rr = b.r * (1 + b.k3 * Math.sin(3 * th + b.p) + b.k5 * Math.sin(5 * th - b.p));
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  };

  for (let r = 0; r < rows; r++) {
    const py = r * cell + cell / 2;
    if (py < EDGE_MARGIN || py > mapHeight - EDGE_MARGIN) continue;
    for (let c = 0; c < cols; c++) {
      const px = c * cell + cell / 2;
      if (px < EDGE_MARGIN || px > mapWidth - EDGE_MARGIN) continue;
      if (Math.abs(px - cx) < CENTER_CLEAR && Math.abs(py - cy) < CENTER_CLEAR) continue;
      if (!inWater(px, py)) continue;
      cells.add(`${c},${r}`);
    }
  }

  // Merge each row's consecutive water cells into one strip for cheap collision.
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const isW = cells.has(`${c},${r}`);
      if (isW && start < 0) start = c;
      else if (!isW && start >= 0) {
        tiles.push({ x: start * cell, y: r * cell, w: (c - start) * cell, h: cell });
        start = -1;
      }
    }
  }
  return { tiles, cells, cols, rows, cell };
}

export const WATER_CELL_SIZE = CELL;

/** An empty layout (default before a map exists). */
export function emptyWater() {
  return { tiles: [], cells: new Set(), cols: 0, rows: 0, cell: CELL };
}
