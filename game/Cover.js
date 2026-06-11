/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cover tiles — solid square obstacles that block movement, projectiles,
 * hitscan and melee line-of-sight. They give positional counter-play against
 * the straight-line instakill weapons (sniper/matchlock) and the bow without
 * removing the instakill itself.
 *
 * The host generates them once at match start (symmetric left↔right for fair
 * 1v1s) and ships the exact tile list to every client via ROOM_JOINED, so this
 * file only needs Math.random on the host — geometry queries are deterministic.
 *
 * A tile is { x, y, w, h } with (x, y) the top-left corner, in world units.
 */

import { COVER_DENSITY } from './RoomConfig.js';

const TILE = 46;          // square edge in world px (pixel-themed block)
const EDGE_MARGIN = 80;   // keep tiles off the arena border
const CENTER_CLEAR = 70;  // keep the exact arena center open (spawn-ish)

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function tilesOverlap(a, b, pad = 26) {
  return !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x ||
           a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
}

/**
 * Build the cover layout for a room. Mirrors each tile across the vertical
 * center line so both halves are identical. Returns [] when cover is off.
 */
export function generateCover(config, mapWidth, mapHeight) {
  const density = COVER_DENSITY[config?.cover] || 0;
  if (!density) return [];
  // Scale the 700²-referenced density by actual arena area.
  const target = Math.round(density * (mapWidth * mapHeight) / (700 * 700));
  const pairs = Math.floor(target / 2);
  const tiles = [];
  const cx = mapWidth / 2;
  const cy = mapHeight / 2;

  let guard = 0;
  while (tiles.length < pairs * 2 && guard++ < pairs * 60) {
    // Place in the left band, then mirror to the right.
    const x = rand(EDGE_MARGIN, cx - TILE - 24);
    const y = rand(EDGE_MARGIN, mapHeight - EDGE_MARGIN - TILE);
    const t = { x, y, w: TILE, h: TILE };
    // Keep the dead-center clear and avoid overlaps.
    if (Math.abs((x + TILE / 2) - cx) < CENTER_CLEAR && Math.abs((y + TILE / 2) - cy) < CENTER_CLEAR) continue;
    if (tiles.some(o => tilesOverlap(o, t))) continue;
    const mirror = { x: mapWidth - x - TILE, y, w: TILE, h: TILE };
    if (tiles.some(o => tilesOverlap(o, mirror))) continue;
    tiles.push(t, mirror);
  }
  return tiles;
}

// --- geometry queries (deterministic, used on host + clients) ---------------

function circleRect(cx, cy, r, t) {
  const nx = Math.max(t.x, Math.min(cx, t.x + t.w));
  const ny = Math.max(t.y, Math.min(cy, t.y + t.h));
  const dx = cx - nx, dy = cy - ny;
  return { d2: dx * dx + dy * dy, nx, ny, dx, dy };
}

/** Does a circle (cx,cy,r) overlap any tile? */
export function coverBlocksCircle(cover, cx, cy, r) {
  if (!cover || !cover.length) return false;
  for (const t of cover) {
    if (circleRect(cx, cy, r, t).d2 < r * r) return true;
  }
  return false;
}

/** Is a point clear of every tile (with padding)? Used for spawn placement. */
export function coverClearOfPoint(cover, x, y, pad = 24) {
  return !coverBlocksCircle(cover, x, y, pad);
}

/**
 * Push a moving circle (player/{x,y}) out of any tile it overlaps. Mutates the
 * object's x/y. Returns true if it was moved. Iterates a few times for corners.
 */
export function resolveCover(cover, obj, r) {
  if (!cover || !cover.length) return false;
  let moved = false;
  for (let pass = 0; pass < 3; pass++) {
    let hitThisPass = false;
    for (const t of cover) {
      const { d2, nx, ny, dx, dy } = circleRect(obj.x, obj.y, r, t);
      if (d2 >= r * r) continue;
      hitThisPass = true; moved = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        obj.x = nx + (dx / d) * r;
        obj.y = ny + (dy / d) * r;
      } else {
        // center inside the tile → eject through the nearest edge
        const left = obj.x - t.x, right = t.x + t.w - obj.x;
        const top = obj.y - t.y, bottom = t.y + t.h - obj.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) obj.x = t.x - r;
        else if (m === right) obj.x = t.x + t.w + r;
        else if (m === top) obj.y = t.y - r;
        else obj.y = t.y + t.h + r;
      }
    }
    if (!hitThisPass) break;
  }
  return moved;
}

function segRect(x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - t.x, t.x + t.w - x0, y0 - t.y, t.y + t.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

/** Does the segment (x0,y0)-(x1,y1) cross any tile? (melee/projectile LOS) */
export function coverBlocksSegment(cover, x0, y0, x1, y1) {
  if (!cover || !cover.length) return false;
  for (const t of cover) {
    if (segRect(x0, y0, x1, y1, t)) return true;
  }
  return false;
}

/**
 * Nearest forward distance from a ray origin (ox,oy) along unit dir (dx,dy) to
 * a tile, or Infinity if the ray misses all tiles. Used to block hitscan shots.
 */
export function coverRayDistance(cover, ox, oy, dx, dy) {
  if (!cover || !cover.length) return Infinity;
  let best = Infinity;
  for (const t of cover) {
    let tmin = 0, tmax = Infinity, miss = false;
    const axes = [[ox, dx, t.x, t.x + t.w], [oy, dy, t.y, t.y + t.h]];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { miss = true; break; } }
      else {
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        if (tmin > tmax) { miss = true; break; }
      }
    }
    if (!miss && tmax >= 0 && tmin < best) best = Math.max(0, tmin);
  }
  return best;
}

export const COVER_TILE_SIZE = TILE;
