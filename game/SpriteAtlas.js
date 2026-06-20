/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprite atlas loader for the Ninja Adventure pack (Task 4).
 *
 * Design rules (from the theme spec):
 *  - Load fails SOFT. A missing/slow image never throws; `get()` returns null
 *    and every caller falls back to the legacy shape renderer, so the game
 *    keeps running with zero assets.
 *  - Frames are sliced from sheets on demand (16×16 base grid).
 *  - No smoothing — callers blit with imageSmoothingEnabled = false for crisp
 *    pixels.
 *
 * This module is environment-safe: in Node/SSR (no `Image`) it stays empty and
 * `ready` never blocks anything.
 */
export class SpriteAtlas {
  constructor(base = '/assets/ninja') {
    this.base = base;
    this.images = {};          // key -> { img, ready }
    this._total = 0;
    this._loaded = 0;
    this.ready = false;
  }

  /** Begin loading a manifest of { key: 'relative/path.png' }. Returns a promise. */
  load(manifest) {
    const entries = Object.entries(manifest || {});
    this._total = entries.length;
    if (typeof Image === 'undefined' || this._total === 0) {
      this.ready = true;
      return Promise.resolve();
    }
    return Promise.all(entries.map(([key, path]) => this._loadOne(key, path)))
      .then(() => { this.ready = true; });
  }

  _loadOne(key, path) {
    return new Promise(resolve => {
      const img = new Image();
      const done = (ok) => {
        this._loaded++;
        if (ok) this.images[key] = { img, ready: true, w: img.naturalWidth, h: img.naturalHeight };
        resolve();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);     // fail soft — caller falls back
      img.src = `${this.base}/${path}?v=${ASSET_VERSION}`;
    });
  }

  /** The loaded HTMLImageElement for a key, or null if not (yet) available. */
  get(key) {
    const e = this.images[key];
    return e && e.ready ? e.img : null;
  }

  has(key) {
    const e = this.images[key];
    return Boolean(e && e.ready);
  }

  /** 0..1 load progress (1 when idle/done). */
  get progress() {
    return this._total ? this._loaded / this._total : 1;
  }
}

/**
 * Manifest of the vendored sprites. Keys are stable names the renderer uses;
 * paths are relative to /assets/ninja. Anything not listed (or that fails to
 * load) simply falls back to procedural drawing.
 */
// Bump when vendored sprite FILES change (same path, new pixels) so browsers /
// the service worker fetch fresh instead of serving a cached image.
export const ASSET_VERSION = '20260620a';

export const SPRITE_MANIFEST = {
  // --- character body sheets (64×112 = 16×16, 4 cols × 7 rows) ---
  // Side-view run sheet shared by every character: 6 frames in one strip,
  // 204×303 per cell. The renderer flips it horizontally for right-facing.
  'char/run': 'character/RunBoy.png',
  'char/Boy': 'character/Boy.png',
  'char/Knight': 'character/Knight.png',
  'char/KnightGold': 'character/KnightGold.png',
  'char/FighterRed': 'character/FighterRed.png',
  'char/GladiatorBlue': 'character/GladiatorBlue.png',
  'char/Cavegirl': 'character/Cavegirl.png',
  'char/DemonRed': 'character/DemonRed.png',
  'char/Hunter': 'character/Hunter.png',

  // --- weapon in-hand sprites ---------------------------------------------
  // Convention: drop a PNG named EXACTLY after the weapon key into
  // public/assets/ninja/weapon/<key>.png. The current 16px item icons point
  // up-right by default; WEAPON_SPRITE_TUNE pins each grip/center to the hand.
  // Any missing file falls back to the legacy weapon drawing.
  'wpn/sword': 'weapon/sword.png',
  'wpn/axe': 'weapon/axe.png',
  'wpn/bow': 'weapon/bow.png',
  'wpn/spear': 'weapon/spear.png',
  'wpn/gauntlet': 'weapon/gauntlet.png',
  'wpn/greatsword': 'weapon/greatsword.png',
  'wpn/scythe': 'weapon/scythe.png',
  'wpn/dagger': 'weapon/dagger.png',
  'wpn/rapier': 'weapon/rapier.png',
  'wpn/hammer': 'weapon/hammer.png',
  'wpn/katana': 'weapon/katana.png',
  'wpn/magicstaff': 'weapon/magicstaff.png',
  'wpn/sniper': 'weapon/sniper.png',
  'wpn/chakram': 'weapon/chakram.png',
  'wpn/pistols': 'weapon/pistols.png',
  'wpn/crossbow': 'weapon/pistols.png',
  'wpn/harpoon': 'weapon/harpoon.png',
  'wpn/guardian': 'weapon/guardian.png',
  'wpn/minebag': 'weapon/minebag.png',
  'wpn/flamethrower': 'weapon/flamethrower.png',

  // --- fx sheets ---
  'fx/slash': 'fx/SpriteSheetSlash01.png',       // 130×32  4 frames 32×32
  'fx/slash2': 'fx/SpriteSheetSlash02.png',      // 396×50  9 frames 44×50
  'fx/slash3': 'fx/SpriteSheetSlash03.png',      // 228×42  6 frames 38×42
  'fx/slashArc': 'fx/SpriteSheetArc.png',        // 228×34  6 frames 38×34
  'fx/slashCircular': 'fx/SpriteSheetCircular.png', // 378×55 7 frames 54×55
  'fx/slashMulti': 'fx/SpriteSheetMulti.png',    // 270×30  9 frames 30×30
  'fx/explosion': 'fx/ExplosionSheet.png',        // 360×40  9 frames 40×40
  'fx/elemental/flam': 'fx/Elemental/Flam/SpriteSheet.png',       // 200×30 5 frames 40×30
  'fx/elemental/ice': 'fx/Elemental/Ice/SpriteSheet.png',         // 320×32 10 frames 32×32
  'fx/elemental/thunder': 'fx/Elemental/Thunder/SpriteSheet.png', // 160×28 5 frames 32×28
  'fx/magic/spark': 'fx/Magic/Spark/SpriteSheet.png',             // 270×35 9 frames 30×35
  'fx/magic/spiritBlue': 'fx/Magic/Spirit/SpriteSheetBlue.png',   // 160×32 5 frames 32×32
  'fx/magic/circleSpark': 'fx/Magic/Circle/SpriteSheetSpark.png', // 192×32 6 frames 32×32
  'fx/magic/circleOrange': 'fx/Magic/Circle/SpriteSheetOrange.png', // 128×32 4 frames 32×32
  'fx/smoke': 'fx/Smoke/Smoke/SpriteSheet.png',                   // 192×32 6 frames 32×32

  // --- status-effect icons (24×24 each, Task 4-F) ---
  'status/bleed': 'ui/status/bleed.png',
  'status/burn':  'ui/status/burn.png',
  'status/slow':  'ui/status/slow.png',
  'status/stun':  'ui/status/stun.png',

  // --- tilesets ---
  'tile/field': 'map/TilesetField.png',
  'tile/tufts': 'map/grass_tufts.png',   // 176×16 = 11 grass tufts of 16×16
  'tile/floor': 'map/TilesetFloor.png',
  'tile/nature': 'map/TilesetNature.png',
};

// Weapon-skin variants (Task: 무기 스킨). A skin swaps the in-hand sprite to an
// alternate at weapon/skins/<skin>/<weapon>.png. Entries are keyed
// 'wpn/<weapon>@<skin>'. Load fails soft: any missing skin sprite simply falls
// back to the base weapon sprite in the renderer. Drop a PNG in the folder to
// add/override a skin for a weapon.
export const WEAPON_SKINS = ['ember', 'frost', 'void'];
// Generate skin entries for every skinnable weapon key.
// 'pistols' is excluded — its skins are stored under 'crossbow' (the shop key).
const _SKIN_SKIP = new Set(['pistols', 'gauntlet', 'minebag']);
const _weaponKeys = Object.keys(SPRITE_MANIFEST)
  .filter(k => k.startsWith('wpn/'))
  .map(k => k.slice(4))
  .filter(k => !_SKIN_SKIP.has(k));
for (const skin of WEAPON_SKINS) {
  for (const w of _weaponKeys) {
    SPRITE_MANIFEST[`wpn/${w}@${skin}`] = `weapon/skins/${skin}/${w}.png`;
  }
}

/**
 * Per-weapon orientation tuning for the in-hand sprite (Task 4-D).
 * The renderer assumes the icon art points up-right and rotates it to the aim
 * direction. If a particular sprite looks rotated wrong, nudge `rot` (radians,
 * +clockwise). `anchorX/Y` pins the weapon's grip or center to the hand, and
 * `handDistance` controls how far from the body the hand sits.
 */
export const WEAPON_SPRITE_TUNE = {
  // New 16px model sprites point up-right; their grip sits near lower-left.
  sword:   { anchorX: 0.18, anchorY: 0.78, scale: 0.95, handDistance: 15, handReachScale: 0.06 },
  axe:     { anchorX: 0.24, anchorY: 0.78, scale: 1.00, handDistance: 15, handReachScale: 0.05, asymmetric: true, swingDirection: 1 },
  katana:  { anchorX: 0.18, anchorY: 0.78, scale: 0.95, handDistance: 15, handReachScale: 0.06, asymmetric: true, swingDirection: 1 },
  scythe:  { anchorX: 0.20, anchorY: 0.78, scale: 1.00, handDistance: 15, handReachScale: 0.05, asymmetric: true, swingDirection: 1 },
  dagger:  { anchorX: 0.16, anchorY: 0.72, scale: 0.82, handDistance: 14, handReachScale: 0.05 },
  gauntlet:{ anchorX: 0.42, anchorY: 0.58, scale: 0.88, handDistance: 15, handReachScale: 0.03, drawOverBody: true },
  guardian:{ anchorX: 0.20, anchorY: 0.82, scale: 0.90, handDistance: 14, handReachScale: 0.03 },
  harpoon: { anchorX: 0.18, anchorY: 0.78, scale: 1.00, handDistance: 15, handReachScale: 0.05 },
  magicstaff: { anchorX: 0.20, anchorY: 0.80, scale: 1.00, handDistance: 15, handReachScale: 0.05 },
  flamethrower: { anchorX: 0.23, anchorY: 0.78, scale: 1.00, handDistance: 14, handReachScale: 0.03 },
  // 쇠뇌 uses a wide bow/crossbow silhouette; hold its center near the hand.
  pistols: { anchorX: 0.50, anchorY: 0.50, scale: 1.08, rot: -Math.PI / 2, handDistance: 18, handReachScale: 0, drawOverBody: true },
  // Long polearm: grip sits at the very lower-left corner of the icon.
  spear:   { anchorX: 0.14, anchorY: 0.9, scale: 1.05 },
  // Bow is held centered on the hand and normalized to the aim direction.
  bow:     { anchorX: 0.5, anchorY: 0.5, scale: 0.95, rot: -Math.PI / 2, handDistance: 16, handReachScale: 0, drawOverBody: true },
  // 강궁 (sniper): a heavy bow — same hold treatment as the bow.
  sniper:  { anchorX: 0.5, anchorY: 0.5, scale: 1.05, rot: -Math.PI / 2, handDistance: 16, handReachScale: 0, drawOverBody: true },
};
export const WEAPON_TUNE_DEFAULT = { rot: 0, scale: 1.0, anchorX: 0.20, anchorY: 0.82, handDistance: 14, handReachScale: 0.06 };

// Frame geometry constants for the sheets above.
export const CHAR_FRAME = 16;     // 16×16 character frames
export const CHAR_COLS = 4;       // walk-cycle frames per row
// SpriteSheet row order (NinjaAdventure): 0 down, 1 up, 2 left, 3 right.
export const CHAR_ROW = { down: 0, up: 1, left: 2, right: 3 };
