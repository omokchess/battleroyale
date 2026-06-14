/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Water (Task 4-E) — natural lakes that block walking but let projectiles fly
 * over. Unlike Cover, water is *fully deterministic* from the map size: the
 * host sim and every client compute the identical layout with no network sync,
 * exactly like the procedural grass field. So this file is pure — no
 * Math.random — and `generateWater(w, h)` is the single source of truth shared
 * by collision (Game) and rendering (Renderer).
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

/**
 * Build the water layout for a map. Two irregular blobs are carved in the LEFT
 * half and mirrored across the vertical center line, so 1v1s stay symmetric.
 */
export function generateWater(mapWidth, mapHeight) {
  const cell = CELL;
  const cols = Math.floor(mapWidth / cell);
  const rows = Math.floor(mapHeight / cell);
  const cx = mapWidth / 2, cy = mapHeight / 2;
  const span = Math.min(mapWidth, mapHeight);
  const cells = new Set();
  if (cols < 6 || rows < 6) return { tiles: [], cells, cols, rows, cell };

  // Irregular lakes (deterministic trig shores — no RNG). Each blob's radius
  // wobbles with the angle so the shoreline reads organic, not circular.
  const blobs = [
    { x: mapWidth * 0.27, y: mapHeight * 0.40, r: span * 0.165, p: 0.7, k3: 0.34, k5: 0.18 },
    { x: mapWidth * 0.15, y: mapHeight * 0.75, r: span * 0.10,  p: 2.1, k3: 0.30, k5: 0.22 },
  ];
  const inWater = (px, py) => {
    for (const b of blobs) {
      const dx = px - b.x, dy = py - b.y;
      const th = Math.atan2(dy, dx);
      const rr = b.r * (1 + b.k3 * Math.sin(3 * th + b.p) + b.k5 * Math.sin(5 * th - b.p));
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  };

  const half = Math.floor(cols / 2);
  for (let r = 0; r < rows; r++) {
    const py = r * cell + cell / 2;
    if (py < EDGE_MARGIN || py > mapHeight - EDGE_MARGIN) continue;
    for (let c = 0; c < half; c++) {
      const px = c * cell + cell / 2;
      if (px < EDGE_MARGIN) continue;
      if (Math.abs(px - cx) < CENTER_CLEAR && Math.abs(py - cy) < CENTER_CLEAR) continue;
      if (!inWater(px, py)) continue;
      cells.add(`${c},${r}`);
      cells.add(`${cols - 1 - c},${r}`);   // mirror to the right half
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
