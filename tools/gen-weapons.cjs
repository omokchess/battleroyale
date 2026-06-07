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
    rect(c, 15, 60, 40, 68, C.leather); rect(c, 15, 60, 40, 61, C.leatherHi);
    disc(c, 11, 64, 6, C.gold); disc(c, 10, 63, 3, C.goldHi);
    rect(c, 39, 42, 47, 86, C.gold); rect(c, 39, 42, 41, 86, C.goldHi); rect(c, 46, 42, 47, 86, C.goldSh);
    disc(c, 43, 46, 2, C.goldHi); disc(c, 43, 82, 2, C.goldSh);
    poly(c, [[47, 51], [110, 51], [125, 64], [110, 77], [47, 77]], C.steel);
    line(c, 49, 53, 109, 53, C.steelHi, 1);
    line(c, 49, 75, 109, 75, C.steelSh, 1);
    line(c, 51, 64, 112, 64, C.steelSh, 2);
  },
  katana(c) {
    rect(c, 21, 61, 43, 67, C.leather);
    for (let x = 24; x < 42; x += 4) { px(c, x, 62, C.gold); px(c, x + 1, 66, C.gold); }
    disc(c, 45, 64, 6, C.iron); disc(c, 45, 64, 3, C.ironHi);
    // single-edged, gently up-curved blade
    poly(c, [[47, 61], [96, 56], [116, 55], [124, 58], [114, 62], [96, 63], [47, 66]], C.steel);
    curve(c, [48, 60], [96, 55], [122, 57], C.steelHi, 1); // bright cutting edge
    curve(c, [48, 65], [96, 62], [114, 61], C.steelSh, 1); // spine shadow
  },
  dagger(c) {
    rect(c, 25, 61, 39, 67, C.leather); rect(c, 25, 61, 39, 62, C.leatherHi);
    disc(c, 21, 64, 4, C.gold); disc(c, 20, 63, 1, C.goldHi);
    rect(c, 38, 55, 43, 73, C.gold); rect(c, 38, 55, 39, 73, C.goldHi);
    poly(c, [[43, 59], [74, 59], [88, 64], [74, 69], [43, 69]], C.steel);
    line(c, 45, 60, 73, 60, C.steelHi, 1);
    line(c, 45, 68, 73, 68, C.steelSh, 1);
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
    rect(c, 10, 61, 104, 67, C.wood); rect(c, 10, 61, 104, 62, C.woodHi); rect(c, 10, 66, 104, 67, C.woodSh);
    rect(c, 116, 58, 120, 70, C.wood); // haft horn poking past the head
    // bold single-bit head: sharp upper horn, deep bearded lower edge, wide cutting arc
    poly(c, [[94, 38], [110, 42], [122, 56], [124, 64], [121, 74], [110, 88], [92, 92], [97, 74], [101, 64], [97, 54]], C.iron);
    rect(c, 96, 56, 106, 72, C.ironSh); // socket cheek over the haft
    rect(c, 99, 44, 114, 48, C.ironHi); // top bevel sheen
    curve(c, [108, 43], [124, 64], [108, 89], C.steelHi, 3); // bright forged cutting edge
    curve(c, [106, 50], [118, 64], [106, 80], C.steel, 1);
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
    // wooden stock / butt
    poly(c, [[8, 56], [10, 74], [30, 71], [48, 67], [48, 60], [30, 57]], C.wood);
    rect(c, 14, 60, 46, 62, C.woodHi); rect(c, 14, 69, 44, 71, C.woodSh);
    // barrel
    rect(c, 44, 58, 122, 64, C.gun); rect(c, 44, 58, 122, 59, C.gunHi); rect(c, 44, 64, 122, 64, C.gunSh);
    ring(c, 121, 61, 3, C.gunHi); // muzzle
    // serpentine lock + pan
    rect(c, 52, 54, 58, 58, C.iron); disc(c, 55, 53, 2, C.ironHi);
    // trigger guard
    curve(c, [54, 65], [55, 73], [62, 71], C.iron, 2);
  },
  sniper(c) {
    poly(c, [[8, 58], [10, 74], [30, 71], [46, 67], [46, 61], [30, 58]], C.wood);
    rect(c, 14, 61, 44, 63, C.woodHi);
    rect(c, 40, 60, 124, 65, C.gun); rect(c, 40, 60, 124, 61, C.gunHi); rect(c, 40, 65, 124, 65, C.gunSh);
    ring(c, 123, 62, 3, C.gunHi);
    // scope
    rect(c, 62, 48, 92, 56, C.iron); rect(c, 62, 48, 92, 49, C.ironHi);
    disc(c, 63, 52, 3, C.gem); disc(c, 91, 52, 3, C.gemHi);
    rect(c, 66, 56, 69, 60, C.ironSh); rect(c, 84, 56, 87, 60, C.ironSh); // mounts
    curve(c, [52, 66], [53, 74], [60, 72], C.iron, 2); // trigger guard
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
    // Grip sits LOW (anchorY 0.72); a long thin crescent blade sweeps up-left.
    rect(c, 16, 86, 104, 92, C.wood); rect(c, 16, 86, 104, 87, C.woodHi); rect(c, 16, 91, 104, 92, C.woodSh);
    rect(c, 24, 83, 31, 95, C.leather); rect(c, 24, 83, 25, 95, C.leatherHi); // grip wrap
    disc(c, 102, 89, 5, C.gold); disc(c, 101, 88, 2, C.goldHi);                // collar / snath ring
    // long, thin, dramatic blade
    poly(c, [[104, 88], [90, 62], [70, 42], [46, 30], [32, 27],
             [39, 36], [58, 47], [78, 63], [95, 82]], C.steel);
    curve(c, [32, 27], [76, 38], [104, 87], C.steelHi, 2); // bright back edge
    curve(c, [39, 36], [70, 52], [95, 80], C.steelSh, 1);  // inner cutting shadow
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
