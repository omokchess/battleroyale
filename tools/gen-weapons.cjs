/* eslint-disable */
// Pixel-art weapon sprite generator (zero deps — built-in zlib + hand-rolled PNG).
// Output: 128x128 RGBA PNGs into public/assets/weapons/.
// Orientation contract (must match WEAPON_SPRITES anchors in Renderer.js):
//   weapons point RIGHT, grip ~20% from the left edge, vertically centered;
//   the bow is the exception and is drawn VERTICALLY.
const fs = require('fs');
const zlib = require('zlib');

const W = 128, H = 128;
const mk = () => ({ buf: new Uint8Array(W * H * 4) });

function px(c, x, y, col) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  c.buf[i] = col[0]; c.buf[i + 1] = col[1]; c.buf[i + 2] = col[2];
  c.buf[i + 3] = col[3] === undefined ? 255 : col[3];
}
function rect(c, x0, y0, x1, y1, col) {
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, col);
}
function disc(c, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) px(c, cx + x, cy + y, col);
}
function ring(c, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = x * x + y * y;
    if (d <= r * r && d >= (r - 1.6) * (r - 1.6)) px(c, cx + x, cy + y, col);
  }
}
function poly(c, pts, col) {
  let mnY = 1e9, mxY = -1e9;
  for (const p of pts) { mnY = Math.min(mnY, p[1]); mxY = Math.max(mxY, p[1]); }
  mnY = Math.max(0, Math.floor(mnY)); mxY = Math.min(H - 1, Math.ceil(mxY));
  for (let y = mnY; y <= mxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const y0 = a[1], y1 = b[1], x0 = a[0], x1 = b[0];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0); xs.push(x0 + t * (x1 - x0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      for (let x = xa; x <= xb; x++) px(c, x, y, col);
    }
  }
}
function line(c, x0, y0, x1, y1, col, th) {
  th = th || 1;
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0; const r = Math.max(0, Math.floor((th - 1) / 2));
  for (;;) {
    if (th <= 1) px(c, x, y, col); else disc(c, x, y, r, col);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function curve(c, p0, p1, p2, col, th) {
  let prev = p0;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    line(c, prev[0] | 0, prev[1] | 0, x | 0, y | 0, col, th);
    prev = [x, y];
  }
}
// Dark border around the whole silhouette (fills transparent pixels touching opaque).
function outline(c, col, passes) {
  passes = passes || 2;
  for (let p = 0; p < passes; p++) {
    const a = c.buf.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (a[i + 3] !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (a[(ny * W + nx) * 4 + 3] !== 0) { near = true; break; }
      }
      if (near) { c.buf[i] = col[0]; c.buf[i + 1] = col[1]; c.buf[i + 2] = col[2]; c.buf[i + 3] = 255; }
    }
  }
}
function encode(c) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W * 4; x++) raw[y * (W * 4 + 1) + 1 + x] = c.buf[y * W * 4 + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cr]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- palette ----------------------------------------------------------------
const C = {
  out: [24, 20, 30, 255],
  steel: [201, 206, 219, 255], steelHi: [240, 243, 250, 255], steelSh: [134, 140, 161, 255],
  wood: [138, 90, 50, 255], woodHi: [171, 119, 75, 255], woodSh: [92, 58, 31, 255],
  gold: [212, 175, 55, 255], goldHi: [244, 220, 122, 255], goldSh: [152, 120, 30, 255],
  iron: [86, 88, 100, 255], ironHi: [120, 123, 138, 255], ironSh: [52, 53, 64, 255],
  gun: [60, 65, 75, 255], gunHi: [94, 101, 114, 255], gunSh: [34, 37, 44, 255],
  leather: [60, 43, 28, 255], leatherHi: [92, 66, 40, 255],
  gem: [96, 156, 255, 255], gemHi: [206, 228, 255, 255], gemCore: [240, 250, 255, 255],
  brass: [183, 138, 58, 255],
  bronze: [150, 116, 64, 255], bronzeHi: [196, 158, 92, 255], bronzeSh: [92, 68, 34, 255],
  blue: [58, 86, 156, 255], blueHi: [98, 132, 206, 255], blueSh: [34, 50, 102, 255],
  olive: [92, 100, 58, 255], oliveHi: [124, 132, 84, 255], oliveSh: [56, 62, 34, 255],
};

// ---- weapons (point right; grip ~x26, centerline y64) ------------------------
const weapons = {
  sword(c) {
    rect(c, 23, 61, 40, 67, C.leather); rect(c, 23, 61, 40, 62, C.leatherHi);
    disc(c, 18, 64, 5, C.gold); disc(c, 17, 63, 2, C.goldHi);
    rect(c, 40, 49, 45, 79, C.gold); rect(c, 40, 49, 42, 79, C.goldHi); rect(c, 45, 49, 45, 79, C.goldSh);
    poly(c, [[45, 57], [107, 57], [121, 64], [107, 71], [45, 71]], C.steel);
    line(c, 47, 58, 106, 58, C.steelHi, 1);
    line(c, 47, 70, 106, 70, C.steelSh, 1);
    line(c, 49, 64, 110, 64, C.steelSh, 1);
  },
  greatsword(c) {
    // blue-wrapped two-handed grip
    rect(c, 14, 60, 39, 68, C.blue); rect(c, 14, 60, 39, 61, C.blueHi); rect(c, 14, 67, 39, 68, C.blueSh);
    for (let x = 16; x < 39; x += 4) px(c, x, 64, C.blueSh);
    // ornate pommel
    disc(c, 10, 64, 6, C.gold); disc(c, 9, 63, 3, C.goldHi); disc(c, 11, 66, 2, C.goldSh);
    // wide ornate gold guard with flared tips + central boss
    rect(c, 39, 44, 48, 84, C.gold); rect(c, 39, 44, 41, 84, C.goldHi); rect(c, 47, 44, 48, 84, C.goldSh);
    poly(c, [[37, 40], [48, 44], [48, 48], [37, 52]], C.gold);
    poly(c, [[37, 76], [48, 80], [48, 84], [37, 88]], C.gold);
    disc(c, 43, 64, 3, C.goldHi);
    // wide ornate blade
    poly(c, [[48, 50], [110, 50], [126, 64], [110, 78], [48, 78]], C.steel);
    rect(c, 50, 52, 109, 55, C.steelHi);
    rect(c, 50, 73, 109, 76, C.steelSh);
    line(c, 52, 64, 118, 64, C.steelSh, 2); // fuller
  },
  katana(c) {
    // black grip with gold diamond (ito) wrap
    rect(c, 18, 61, 44, 67, C.leather);
    for (let x = 21; x < 44; x += 4) {
      px(c, x, 62, C.gold); px(c, x + 1, 63, C.goldHi); px(c, x + 2, 64, C.gold);
      px(c, x + 1, 65, C.goldHi); px(c, x, 66, C.gold);
    }
    // round tsuba
    disc(c, 46, 64, 7, C.iron); disc(c, 46, 64, 4, C.ironSh); ring(c, 46, 64, 7, C.ironHi);
    // long, gently curved single-edged blade
    poly(c, [[48, 61], [90, 55], [114, 51], [125, 53], [121, 58], [100, 61], [48, 66]], C.steel);
    curve(c, [49, 60], [94, 54], [123, 54], C.steelHi, 1); // bright cutting edge
    curve(c, [49, 65], [94, 60], [118, 58], C.steelSh, 1); // spine
  },
  dagger(c) {
    rect(c, 24, 61, 38, 67, C.leather); rect(c, 24, 61, 38, 62, C.leatherHi);
    disc(c, 20, 64, 4, C.steel); disc(c, 19, 63, 1, C.steelHi); // pommel
    // ornate guard
    rect(c, 37, 55, 43, 73, C.steel); rect(c, 37, 55, 39, 73, C.steelHi); rect(c, 42, 55, 43, 73, C.steelSh);
    disc(c, 40, 64, 2, C.steelHi);
    // broad leaf-shaped blade
    poly(c, [[43, 58], [62, 55], [80, 60], [94, 64], [80, 68], [62, 73], [43, 70]], C.steel);
    rect(c, 46, 59, 78, 61, C.steelHi);
    line(c, 47, 64, 84, 64, C.steelSh, 1); // fuller
    rect(c, 46, 68, 78, 70, C.steelSh);
  },
  rapier(c) {
    rect(c, 23, 61, 40, 67, C.leather);
    disc(c, 19, 64, 5, C.gold); disc(c, 18, 63, 2, C.goldHi);
    // swept cup hilt
    disc(c, 45, 64, 9, C.gold); disc(c, 45, 64, 6, C.goldSh); ring(c, 45, 64, 9, C.goldHi);
    rect(c, 41, 53, 45, 75, C.gold);
    // needle blade
    poly(c, [[50, 62], [118, 63], [126, 64], [118, 65], [50, 66]], C.steel);
    line(c, 52, 62, 116, 63, C.steelHi, 1);
  },
  spear(c) {
    rect(c, 12, 62, 104, 66, C.wood); rect(c, 12, 62, 104, 62, C.woodHi); rect(c, 12, 66, 104, 66, C.woodSh);
    rect(c, 100, 60, 106, 68, C.gold); rect(c, 100, 60, 106, 61, C.goldHi);
    poly(c, [[104, 57], [116, 60], [125, 64], [116, 68], [104, 71], [110, 64]], C.steel);
    line(c, 107, 61, 122, 64, C.steelHi, 1);
    line(c, 107, 67, 122, 64, C.steelSh, 1);
  },
  axe(c) {
    // shorter haft so the big crescent head dominates
    rect(c, 8, 60, 82, 68, C.wood); rect(c, 8, 60, 82, 61, C.woodHi); rect(c, 8, 67, 82, 68, C.woodSh);
    disc(c, 10, 64, 4, C.bronze); disc(c, 9, 63, 1, C.bronzeHi); // pommel cap
    // big crescent half-moon blade, convex cutting edge facing right
    poly(c, [[96, 20], [112, 34], [122, 52], [125, 64], [122, 76], [112, 94], [96, 108],
             [92, 86], [85, 64], [92, 42]], C.bronze);
    rect(c, 80, 57, 94, 71, C.bronzeSh); // socket over the haft
    curve(c, [96, 24], [122, 64], [96, 104], C.bronzeHi, 2); // engraved face sheen
    curve(c, [96, 21], [125, 64], [96, 107], C.steelHi, 2);  // bright forged cutting edge
    curve(c, [96, 30], [88, 64], [96, 98], C.bronzeSh, 1);   // concave inner shadow
  },
  hammer(c) {
    rect(c, 12, 60, 100, 68, C.wood); rect(c, 12, 60, 100, 61, C.woodHi); rect(c, 12, 67, 100, 68, C.woodSh);
    rect(c, 94, 45, 122, 83, C.iron);
    rect(c, 94, 45, 122, 48, C.ironHi); rect(c, 94, 80, 122, 83, C.ironSh);
    rect(c, 97, 45, 100, 83, C.ironSh); rect(c, 116, 45, 119, 83, C.ironSh); // banding
    disc(c, 108, 56, 3, C.ironHi);
  },
  gauntlet(c) {
    // wrist cuff
    rect(c, 16, 50, 40, 78, C.iron); rect(c, 16, 50, 40, 53, C.ironHi); rect(c, 16, 75, 40, 78, C.ironSh);
    rect(c, 22, 50, 25, 78, C.ironSh);
    // fist block (rounded)
    poly(c, [[40, 50], [86, 48], [94, 56], [94, 72], [86, 80], [40, 78]], C.steel);
    rect(c, 42, 51, 90, 54, C.steelHi); rect(c, 42, 74, 90, 77, C.steelSh);
    // knuckle plates on the punching face
    for (let i = 0; i < 4; i++) { const y = 52 + i * 7; rect(c, 86, y, 96, y + 4, C.ironHi); }
    // thumb nub
    poly(c, [[60, 78], [74, 78], [70, 88], [60, 86]], C.iron);
  },
  matchlock(c) {
    // short wooden stock angling down at the butt (tanegashima)
    poly(c, [[6, 58], [8, 78], [22, 74], [38, 68], [40, 60], [24, 57]], C.wood);
    rect(c, 12, 61, 38, 63, C.woodHi); rect(c, 12, 70, 24, 72, C.woodSh);
    // long thin barrel
    rect(c, 36, 60, 126, 64, C.gun); rect(c, 36, 60, 126, 60, C.gunHi); rect(c, 36, 64, 126, 64, C.gunSh);
    ring(c, 124, 62, 2, C.gunHi); // muzzle
    // brass lockwork: pan, serpentine, trigger, band
    rect(c, 36, 58, 54, 59, C.gold); // barrel band
    rect(c, 42, 55, 50, 60, C.gold); disc(c, 46, 53, 2, C.goldHi); // serpentine cock
    curve(c, [44, 64], [45, 73], [53, 71], C.gold, 2); // trigger guard
  },
  sniper(c) {
    // olive-green stock (L96/AWP style): butt + cheek riser + body + fore-end
    poly(c, [[6, 56], [8, 74], [30, 72], [44, 68], [44, 58], [30, 54]], C.olive);
    rect(c, 30, 50, 56, 56, C.olive); // raised cheek piece
    rect(c, 44, 58, 100, 70, C.olive);
    rect(c, 6, 56, 100, 58, C.oliveHi); rect(c, 44, 68, 100, 70, C.oliveSh);
    poly(c, [[46, 70], [62, 70], [58, 84], [48, 82]], C.olive); // pistol grip
    // barrel
    rect(c, 96, 61, 127, 65, C.gun); rect(c, 96, 61, 127, 61, C.gunHi); rect(c, 96, 65, 127, 65, C.gunSh);
    ring(c, 125, 63, 2, C.gunHi);
    // scope
    rect(c, 58, 44, 92, 52, C.gun); rect(c, 58, 44, 92, 45, C.gunHi); rect(c, 58, 51, 92, 52, C.gunSh);
    disc(c, 59, 48, 3, C.gem); disc(c, 91, 48, 3, C.gemHi); // lenses
    rect(c, 64, 52, 67, 58, C.gunSh); rect(c, 84, 52, 87, 58, C.gunSh); // scope rings
    rect(c, 100, 66, 114, 72, C.olive); rect(c, 100, 66, 114, 67, C.oliveHi); // magazine
  },
  magicstaff(c) {
    rect(c, 18, 60, 96, 68, C.wood); rect(c, 18, 60, 96, 61, C.woodHi); rect(c, 18, 67, 96, 68, C.woodSh);
    disc(c, 40, 64, 2, C.woodSh); disc(c, 66, 64, 2, C.woodSh); // knots
    rect(c, 92, 58, 98, 70, C.gold); rect(c, 92, 58, 98, 59, C.goldHi);
    // claw prongs cradling the orb
    curve(c, [96, 54], [104, 56], [110, 62], C.gold, 2);
    curve(c, [96, 74], [104, 72], [110, 66], C.gold, 2);
    // orb
    disc(c, 107, 64, 12, C.gem); disc(c, 107, 64, 9, C.gemHi); disc(c, 104, 61, 4, C.gemCore);
    ring(c, 107, 64, 12, C.gold);
  },
  scythe(c) {
    // Grip sits LOW (anchorY 0.72); a long, thin reaper blade sweeps up-left.
    rect(c, 16, 86, 100, 92, C.wood); rect(c, 16, 86, 100, 87, C.woodHi); rect(c, 16, 91, 100, 92, C.woodSh);
    rect(c, 24, 83, 31, 95, C.leather); rect(c, 24, 83, 25, 95, C.leatherHi); // grip wrap
    disc(c, 99, 89, 4, C.iron); disc(c, 98, 88, 1, C.ironHi);                  // snath collar
    // long, thin, strongly-curved blade tapering to a fine point
    poly(c, [[100, 88], [86, 60], [64, 38], [40, 26], [22, 22],
             [30, 31], [52, 43], [74, 60], [92, 80]], C.steel);
    curve(c, [22, 22], [70, 32], [100, 87], C.steelHi, 1); // bright back
    curve(c, [30, 31], [64, 46], [92, 78], C.steelSh, 1);  // cutting-edge shadow
  },
  bow(c) {
    // VERTICAL: wooden limbs bulging right, string straight on the left.
    curve(c, [58, 12], [98, 64], [58, 116], C.wood, 6);
    curve(c, [58, 12], [94, 64], [58, 116], C.woodHi, 1);
    // riser grip (leather wrap) at the belly
    rect(c, 88, 54, 95, 74, C.leather); rect(c, 88, 54, 89, 74, C.leatherHi);
    disc(c, 58, 12, 3, C.wood); disc(c, 58, 116, 3, C.wood); // limb tips
    // string
    line(c, 57, 13, 57, 115, C.steelHi, 1);
  },
};

const outDir = 'public/assets/weapons';
let count = 0;
const made = [];
for (const [name, fn] of Object.entries(weapons)) {
  const c = mk();
  fn(c);
  outline(c, C.out, 2);
  fs.writeFileSync(`${outDir}/${name}.png`, encode(c));
  made.push({ name, buf: c.buf.slice() });
  count++;
}
console.log(`generated ${count} weapon sprites -> ${outDir}/`);

// Contact sheet for review (not shipped): all sprites on a gray grid.
if (process.argv.includes('--sheet')) {
  const cols = 5, cell = 132, rows = Math.ceil(made.length / cols);
  const SW = cols * cell, SH = rows * cell;
  const sheet = new Uint8Array(SW * SH * 4);
  const sput = (x, y, col) => { if (x < 0 || y < 0 || x >= SW || y >= SH) return; const i = (y * SW + x) * 4; sheet[i] = col[0]; sheet[i + 1] = col[1]; sheet[i + 2] = col[2]; sheet[i + 3] = 255; };
  for (let i = 0; i < SW * SH; i++) { sheet[i * 4] = 40; sheet[i * 4 + 1] = 40; sheet[i * 4 + 2] = 48; sheet[i * 4 + 3] = 255; }
  made.forEach((w, idx) => {
    const cx = (idx % cols) * cell, cy = Math.floor(idx / cols) * cell;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { const chk = ((x >> 4) + (y >> 4)) & 1; sput(cx + x, cy + y, chk ? [70, 70, 80] : [88, 88, 100]); }
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const j = (y * 128 + x) * 4;
      if (w.buf[j + 3] === 0) continue;
      sput(cx + 2 + x, cy + 2 + y, [w.buf[j], w.buf[j + 1], w.buf[j + 2]]);
    }
  });
  // encode arbitrary-size sheet
  const raw = Buffer.alloc((SW * 4 + 1) * SH);
  for (let y = 0; y < SH; y++) { raw[y * (SW * 4 + 1)] = 0; for (let x = 0; x < SW * 4; x++) raw[y * (SW * 4 + 1) + 1 + x] = sheet[y * SW * 4 + x]; }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync('tools/_sheet.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote tools/_sheet.png', SW + 'x' + SH);
}
