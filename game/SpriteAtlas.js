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
      img.src = `${this.base}/${path}`;
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
export const SPRITE_MANIFEST = {
  // --- character body sheets (64×112 = 16×16, 4 cols × 7 rows) ---
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
  // public/assets/ninja/weapon/<key>.png. The art should point UP with the
  // grip at the bottom-center; the renderer rotates it to the aim direction.
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
  'wpn/matchlock': 'weapon/matchlock.png',
  'wpn/katana': 'weapon/katana.png',
  'wpn/magicstaff': 'weapon/magicstaff.png',
  'wpn/sniper': 'weapon/sniper.png',
  'wpn/chakram': 'weapon/chakram.png',
  'wpn/pistols': 'weapon/pistols.png',
  'wpn/harpoon': 'weapon/harpoon.png',
  'wpn/guardian': 'weapon/guardian.png',
  'wpn/minebag': 'weapon/minebag.png',
  'wpn/flamethrower': 'weapon/flamethrower.png',

  // --- fx sheets ---
  'fx/slash': 'fx/SpriteSheetSlash01.png',
  'fx/slashArc': 'fx/SpriteSheetArc.png',
  'fx/slashCircular': 'fx/SpriteSheetCircular.png',

  // --- tilesets ---
  'tile/field': 'map/TilesetField.png',
  'tile/floor': 'map/TilesetFloor.png',
  'tile/nature': 'map/TilesetNature.png',
};

/**
 * Per-weapon orientation tuning for the in-hand sprite (Task 4-D).
 * The renderer assumes the art points UP (grip at bottom-center) and rotates it
 * to the aim direction. If a particular sprite looks rotated wrong, nudge `rot`
 * (radians, +clockwise); `scale` resizes vs. the default; `anchorY` 1 = grip at
 * the very bottom, 0.5 = centered. Anything not listed uses the defaults.
 */
export const WEAPON_SPRITE_TUNE = {
  // Long polearms: grip sits at the very lower-left corner of the icon.
  spear:   { anchorX: 0.14, anchorY: 0.9, scale: 1.05 },
  harpoon: { anchorX: 0.14, anchorY: 0.9, scale: 1.05 },
  // Bow is held centered on the hand, not pointed like a blade. Small extra tilt.
  bow:     { anchorX: 0.5, anchorY: 0.5, scale: 0.95, rot: -Math.PI / 4 + 0.35 },
};
export const WEAPON_TUNE_DEFAULT = { rot: 0, scale: 1.0, anchorY: 1 };

// Frame geometry constants for the sheets above.
export const CHAR_FRAME = 16;     // 16×16 character frames
export const CHAR_COLS = 4;       // walk-cycle frames per row
// SpriteSheet row order (NinjaAdventure): 0 down, 1 up, 2 left, 3 right.
export const CHAR_ROW = { down: 0, up: 1, left: 2, right: 3 };
