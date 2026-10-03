#!/usr/bin/env node
/**
 * Voxelia — original texture pipeline.
 *
 * Generates, from nothing but code, a 16x16-tile block ATLAS PNG plus a UV map
 * (`atlas.json`), and one icon PNG per block and item texture key used by
 * `src/blocks` / `src/items`. Every pixel is produced by a deterministic
 * procedural generator seeded by the texture key, so:
 *
 *   - the output is byte-for-byte reproducible (`npm run gen:textures`);
 *   - nothing is traced from, sampled from, or derived from any existing game's
 *     art — the palette and the per-key "recipes" below are original;
 *   - the repo needs no binary art checked in by hand.
 *
 * PNG ENCODER CHOICE: hand-rolled, on top of Node's built-in `node:zlib`. A
 * 24-bit RGBA PNG is four chunks (sig, IHDR, IDAT, IEND) with CRC32s; writing it
 * directly is ~60 lines and keeps the dependency tree at zero for this script.
 * `pngjs`/`sharp` would both work but neither earns its install here.
 *
 * KEEP IN SYNC: the key lists below mirror `src/blocks/blocks.ts` and
 * `src/items/items.ts`. If a block/item texture key is added there, add it here.
 */
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEX_DIR = resolve(ROOT, 'public/textures');
const ICON_DIR = resolve(ROOT, 'public/icons');
const TILE = 16;
const ICON = 48; // UI icon canvas, px

// ---------------------------------------------------------------------------
// deterministic PRNG — standard mulberry32 + xmur3 string hash (public-domain
// algorithms, not repo art)
// ---------------------------------------------------------------------------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rngFor = (key) => mulberry32(xmur3(`voxelia:tex:${key}`)());

// ---------------------------------------------------------------------------
// tiny RGBA canvas
// ---------------------------------------------------------------------------

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4); // transparent
  }
  set(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    // straight alpha composite over existing
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    this.data[i] = (r * sa + this.data[i] * da * (1 - sa)) / oa;
    this.data[i + 1] = (g * sa + this.data[i + 1] * da * (1 - sa)) / oa;
    this.data[i + 2] = (b * sa + this.data[i + 2] * da * (1 - sa)) / oa;
    this.data[i + 3] = oa * 255;
  }
  fill(color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, color);
  }
  rect(x0, y0, rw, rh, color) {
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) this.set(x, y, color);
  }
  /** Blit `src` at (dx,dy), optional per-pixel tint multiply and alpha scale. */
  blit(src, dx, dy, { tint = [255, 255, 255], alpha = 1, scale = 1 } = {}) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        const px = [
          (src.data[i] * tint[0]) / 255,
          (src.data[i + 1] * tint[1]) / 255,
          (src.data[i + 2] * tint[2]) / 255,
          a * alpha,
        ];
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) this.set(dx + x * scale + sx, dy + y * scale + sy, px);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PNG encode (RGBA, 8-bit, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(canvas) {
  const { w, h, data } = canvas;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const shade = ([r, g, b], k) => [clamp8(r * k), clamp8(g * k), clamp8(b * k)];
const mix = ([r1, g1, b1], [r2, g2, b2], t) => [
  clamp8(r1 + (r2 - r1) * t),
  clamp8(g1 + (g2 - g1) * t),
  clamp8(b1 + (b2 - b1) * t),
];

// ---------------------------------------------------------------------------
// ORIGINAL palette — Voxelia's own colour identity ("Loam & Lichen")
// ---------------------------------------------------------------------------

const PALETTE = {
  stone: [125, 128, 138],
  cobblestone: [116, 118, 126],
  dirt: [122, 88, 60],
  grass_top: [104, 158, 84],
  grass_side: [116, 132, 84],
  sand: [222, 206, 156],
  gravel: [128, 122, 120],
  log_top: [176, 142, 96],
  log_side: [108, 82, 52],
  planks: [182, 144, 94],
  leaves: [66, 132, 60],
  sapling: [92, 150, 72],
  glass: [206, 230, 236],
  water: [58, 112, 190],
  bedrock: [64, 64, 70],
  coal_ore: [112, 114, 122],
  iron_ore: [166, 152, 138],
  crafting_top: [154, 112, 70],
  crafting_side: [140, 100, 62],
  furnace_side: [100, 100, 106],
  furnace_top: [92, 92, 98],
  furnace_front: [86, 86, 92],
  torch: [232, 190, 92],
};

/** Biome tints the mesher multiplies onto tinted faces (`tintIndex`). */
const TINTS = {
  0: [124, 176, 92], // grass
  1: [96, 150, 72], // foliage
  2: [74, 130, 196], // water
};

// ---------------------------------------------------------------------------
// per-key tile painters (16x16). Each is deterministic given its key.
// ---------------------------------------------------------------------------

/** grainy base fill + subtle vignette so tiles tile seamlessly but read as solid. */
function baseFill(c, key, base, { grain = 0.14, vignette = 0.06 } = {}) {
  const rnd = rngFor(key + ':base');
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (rnd() - 0.5) * 2 * grain;
      const edge = Math.min(x, y, TILE - 1 - x, TILE - 1 - y) / (TILE / 2);
      const v = 1 + n - (1 - edge) * vignette;
      c.set(x, y, shade(base, v));
    }
  }
}

function speckle(c, key, count, colorFn, size = 1) {
  const rnd = rngFor(key + ':speck');
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * TILE);
    c.rect(x, y, size, size, colorFn(rnd));
  }
}

const PAINTERS = {
  stone: (c, k) => {
    baseFill(c, k, PALETTE.stone);
    speckle(c, k, 20, () => shade(PALETTE.stone, 0.82));
    speckle(c, k, 14, () => shade(PALETTE.stone, 1.14));
  },
  cobblestone: (c, k) => {
    baseFill(c, k, shade(PALETTE.cobblestone, 0.7), { grain: 0.05 }); // mortar
    const rnd = rngFor(k + ':cobbles');
    const cells = [
      [0, 0, 7, 7],
      [8, 0, 7, 5],
      [0, 8, 5, 7],
      [6, 9, 9, 6],
      [9, 6, 6, 4],
    ];
    for (const [x, y, w, h] of cells) {
      const stone = shade(PALETTE.cobblestone, 0.9 + rnd() * 0.3);
      c.rect(x + 1, y + 1, w - 1, h - 1, stone);
      for (let i = 0; i < 10; i++)
        c.rect(x + 1 + Math.floor(rnd() * (w - 1)), y + 1 + Math.floor(rnd() * (h - 1)), 1, 1, shade(stone, 0.85));
    }
  },
  dirt: (c, k) => {
    baseFill(c, k, PALETTE.dirt, { grain: 0.2 });
    speckle(c, k, 26, (r) => shade(PALETTE.dirt, 0.75 + r * 0.5));
  },
  grass_top: (c, k) => {
    baseFill(c, k, PALETTE.grass_top, { grain: 0.18 });
    speckle(c, k, 30, (r) => mix(PALETTE.grass_top, [40, 90, 40], r * 0.6));
    speckle(c, k, 12, () => mix(PALETTE.grass_top, [200, 230, 150], 0.4));
  },
  grass_side: (c, k) => {
    baseFill(c, k, PALETTE.dirt, { grain: 0.2 });
    // top ~5px is grass with a ragged fringe
    const rnd = rngFor(k + ':fringe');
    for (let x = 0; x < TILE; x++) {
      const depth = 4 + Math.floor(rnd() * 3);
      for (let y = 0; y < depth; y++) c.set(x, y, shade(PALETTE.grass_top, 0.9 + rnd() * 0.25));
    }
  },
  sand: (c, k) => {
    baseFill(c, k, PALETTE.sand, { grain: 0.1 });
    speckle(c, k, 22, (r) => shade(PALETTE.sand, 0.9 + r * 0.15));
  },
  gravel: (c, k) => {
    baseFill(c, k, PALETTE.gravel, { grain: 0.22 });
    speckle(c, k, 18, (r) => shade(PALETTE.gravel, 0.7 + r * 0.6), 2);
  },
  log_top: (c, k) => {
    baseFill(c, k, PALETTE.log_top, { grain: 0.08 });
    const cx = 8;
    const cy = 8;
    for (let ring = 1; ring < 8; ring += 2) {
      for (let a = 0; a < 360; a += 6) {
        const rad = (a * Math.PI) / 180;
        c.set(cx + Math.round(Math.cos(rad) * ring), cy + Math.round(Math.sin(rad) * ring), shade(PALETTE.log_side, 1.1));
      }
    }
    c.rect(7, 7, 2, 2, shade(PALETTE.log_side, 0.9));
  },
  log_side: (c, k) => {
    baseFill(c, k, PALETTE.log_side, { grain: 0.12 });
    const rnd = rngFor(k + ':bark');
    for (let x = 0; x < TILE; x += 3 + Math.floor(rnd() * 2)) {
      for (let y = 0; y < TILE; y++) c.set(x, y, shade(PALETTE.log_side, 0.72 + rnd() * 0.15));
    }
  },
  planks: (c, k) => {
    baseFill(c, k, PALETTE.planks, { grain: 0.08 });
    for (let y = 0; y < TILE; y += 5) c.rect(0, y, TILE, 1, shade(PALETTE.planks, 0.68));
    const rnd = rngFor(k + ':grain');
    for (let i = 0; i < 40; i++) c.rect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 2, 1, shade(PALETTE.planks, 0.88));
    c.rect(7, 0, 1, TILE, shade(PALETTE.planks, 0.6));
  },
  leaves: (c, k) => {
    // cutout: leave gaps transparent
    const rnd = rngFor(k + ':leaf');
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (rnd() < 0.14) continue; // hole
        c.set(x, y, mix(PALETTE.leaves, [30, 70, 25], rnd() * 0.7));
      }
    }
  },
  sapling: (c, k) => paintCross(c, k, PALETTE.sapling, [90, 60, 40]),
  glass: (c) => {
    // transparent centre, solid frame + a highlight streak
    c.rect(0, 0, TILE, 1, PALETTE.glass);
    c.rect(0, TILE - 1, TILE, 1, PALETTE.glass);
    c.rect(0, 0, 1, TILE, PALETTE.glass);
    c.rect(TILE - 1, 0, 1, TILE, PALETTE.glass);
    for (let i = 0; i < 10; i++) c.set(2 + i, 3 + i, [255, 255, 255, 150]);
    for (let i = 0; i < 5; i++) c.set(10 + i, 3 + i, [255, 255, 255, 90]);
  },
  water: (c, k) => {
    const rnd = rngFor(k + ':wave');
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const w = Math.sin((x + y) * 0.7 + rnd() * 0.3) * 0.08;
        c.set(x, y, [...shade(PALETTE.water, 1 + w), 205]);
      }
    }
  },
  bedrock: (c, k) => {
    baseFill(c, k, PALETTE.bedrock, { grain: 0.28 });
    speckle(c, k, 22, (r) => shade(PALETTE.bedrock, 0.5 + r), 2);
  },
  coal_ore: (c, k) => {
    PAINTERS.stone(c, k);
    const rnd = rngFor(k + ':coal');
    for (let i = 0; i < 4; i++) {
      const x = 2 + Math.floor(rnd() * 10);
      const y = 2 + Math.floor(rnd() * 10);
      c.rect(x, y, 3, 3, [26, 26, 28]);
      c.set(x, y, [70, 70, 74]);
    }
  },
  iron_ore: (c, k) => {
    PAINTERS.stone(c, k);
    const rnd = rngFor(k + ':iron');
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(rnd() * 11);
      const y = 2 + Math.floor(rnd() * 11);
      c.rect(x, y, 2, 2, mix([214, 190, 168], [170, 130, 96], rnd()));
    }
  },
  crafting_top: (c, k) => {
    PAINTERS.planks(c, k);
    c.rect(1, 1, TILE - 2, TILE - 2, [0, 0, 0, 0]); // clear
    baseFill(c, k, shade(PALETTE.crafting_top, 1.05));
    // 3x3 grid engraving
    for (let i = 0; i <= 3; i++) {
      c.rect(2 + i * 4, 2, 1, 12, shade(PALETTE.crafting_top, 0.6));
      c.rect(2, 2 + i * 4, 12, 1, shade(PALETTE.crafting_top, 0.6));
    }
  },
  crafting_side: (c, k) => {
    PAINTERS.planks(c, k);
    c.rect(2, 2, 5, 5, shade(PALETTE.crafting_side, 0.7));
    c.rect(9, 4, 5, 4, shade(PALETTE.crafting_side, 0.8));
    c.rect(3, 10, 8, 3, shade(PALETTE.crafting_side, 0.75));
  },
  furnace_side: (c, k) => {
    baseFill(c, k, PALETTE.furnace_side, { grain: 0.1 });
    c.rect(0, 0, TILE, 1, shade(PALETTE.furnace_side, 1.2));
    speckle(c, k, 16, () => shade(PALETTE.furnace_side, 0.8));
  },
  furnace_top: (c, k) => {
    baseFill(c, k, PALETTE.furnace_top, { grain: 0.1 });
    c.rect(3, 3, 10, 10, shade(PALETTE.furnace_top, 0.7));
    c.rect(5, 5, 6, 6, shade(PALETTE.furnace_top, 0.9));
  },
  furnace_front: (c, k) => {
    baseFill(c, k, PALETTE.furnace_front, { grain: 0.1 });
    // dark mouth + ember glow
    c.rect(4, 8, 8, 5, [24, 22, 24]);
    c.rect(5, 10, 6, 2, [200, 96, 40]);
    c.rect(6, 11, 4, 1, [240, 170, 70]);
    c.rect(4, 3, 8, 3, shade(PALETTE.furnace_front, 0.7)); // vent
  },
  torch: (c) => {
    for (let y = 4; y < TILE; y++) c.rect(7, y, 2, 1, shade([120, 82, 48], 0.8 + (y % 2) * 0.2));
    c.rect(6, 2, 4, 3, [255, 210, 120]);
    c.rect(7, 1, 2, 2, [255, 244, 200]);
    c.set(7, 4, [255, 150, 60]);
  },
};

function paintCross(c, key, leaf, stem) {
  const rnd = rngFor(key + ':cross');
  c.rect(7, 6, 2, 10, stem);
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 2 + Math.floor(rnd() * 9);
    c.rect(x, y, 2, 2, shade(leaf, 0.8 + rnd() * 0.5));
  }
}

function paintTile(key) {
  const c = new Canvas(TILE, TILE);
  const painter = PAINTERS[key];
  if (painter) painter(c, key);
  else baseFill(c, key, PALETTE[key] ?? hashedColor(key));
  return c;
}

function hashedColor(key) {
  const h = xmur3(key)();
  return [96 + (h & 0x5f), 96 + ((h >> 8) & 0x5f), 96 + ((h >> 16) & 0x5f)];
}

// ---------------------------------------------------------------------------
// block-face model + item recipes (mirror of the content registries)
// ---------------------------------------------------------------------------

/** block name -> { top, side, bottom, tint? } face texture keys. */
const BLOCK_FACES = {
  bedrock: { all: 'bedrock' },
  stone: { all: 'stone' },
  cobblestone: { all: 'cobblestone' },
  dirt: { all: 'dirt' },
  grass_block: { top: 'grass_top', side: 'grass_side', bottom: 'dirt', tint: 0 },
  sand: { all: 'sand' },
  gravel: { all: 'gravel' },
  // One icon set per timber species; all three share the material tiles for now.
  ...Object.fromEntries(
    ['amberwood', 'pinewood', 'silverbark'].flatMap((w) => [
      [`${w}_log`, { top: 'log_top', side: 'log_side', bottom: 'log_top' }],
      [`${w}_planks`, { all: 'planks' }],
      [`${w}_leaves`, { all: 'leaves', tint: 1 }],
      [`${w}_sapling`, { all: 'sapling', flat: true }],
    ]),
  ),
  glass: { all: 'glass' },
  water: { all: 'water', tint: 2 },
  coal_ore: { all: 'coal_ore' },
  iron_ore: { all: 'iron_ore' },
  crafting_table: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' },
  furnace: { top: 'furnace_top', side: 'furnace_side', bottom: 'furnace_top', front: 'furnace_front' },
  torch: { all: 'torch', flat: true },
};

const MATERIAL_ITEMS = ['coal', 'raw_iron', 'iron_ingot', 'stick', 'flint', 'bread'];
const TOOL_TIERS = ['wood', 'stone'];
const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword'];

// ---------------------------------------------------------------------------
// icon compositing
// ---------------------------------------------------------------------------

/** pseudo-isometric cube from top/left/right face tiles, ~scale px per texel. */
function cubeIcon(faces) {
  const c = new Canvas(ICON, ICON);
  const S = 3; // texel size
  const top = tintedTile(faces.top ?? faces.all, faces.tint);
  const left = tintedTile(faces.side ?? faces.all, faces.tint === 2 ? 2 : undefined);
  const right = tintedTile(faces.front ?? faces.side ?? faces.all, undefined);

  const ox = ICON / 2;
  const oy = 6;
  // top rhombus
  for (let ty = 0; ty < TILE; ty++) {
    for (let tx = 0; tx < TILE; tx++) {
      const px = ox + (tx - ty) * S * 0.5 - S * 0.5;
      const py = oy + (tx + ty) * S * 0.25;
      putDiamond(c, px, py, S, sampleShade(top, tx, ty, 1.12));
    }
  }
  // left face
  for (let ty = 0; ty < TILE; ty++) {
    for (let tx = 0; tx < TILE; tx++) {
      const px = ox - TILE * S * 0.5 + tx * S * 0.5;
      const py = oy + TILE * S * 0.25 + tx * S * 0.25 + ty * S * 0.5;
      c.rect(Math.round(px), Math.round(py), S, Math.ceil(S * 0.5) + 1, sampleShade(left, tx, ty, 0.72));
    }
  }
  // right face
  for (let ty = 0; ty < TILE; ty++) {
    for (let tx = 0; tx < TILE; tx++) {
      const px = ox + tx * S * 0.5;
      const py = oy + TILE * S * 0.25 + (TILE - 1 - tx) * S * 0.25 + ty * S * 0.5;
      c.rect(Math.round(px), Math.round(py), S, Math.ceil(S * 0.5) + 1, sampleShade(right, tx, ty, 0.92));
    }
  }
  return c;
}

function putDiamond(c, px, py, s, color) {
  for (let i = 0; i < s; i++) c.rect(Math.round(px - i * 0.5), Math.round(py + i * 0.25), Math.max(1, s - i), 1, color);
}

function sampleShade(tile, x, y, k) {
  const i = (y * tile.w + x) * 4;
  if (tile.data[i + 3] === 0) return [0, 0, 0, 0];
  return [tile.data[i] * k, tile.data[i + 1] * k, tile.data[i + 2] * k, tile.data[i + 3]];
}

function tintedTile(key, tintIndex) {
  const tile = paintTile(key);
  if (tintIndex == null) return tile;
  const t = TINTS[tintIndex];
  const out = new Canvas(TILE, TILE);
  out.blit(tile, 0, 0, { tint: t });
  return out;
}

/** flat item / cross icon: scaled tile with a 1px dark outline + drop shadow. */
function flatIcon(key, { tint } = {}) {
  const c = new Canvas(ICON, ICON);
  const tile = tint != null ? tintedTile(key, tint) : paintTile(key);
  const scale = 2;
  const off = Math.round((ICON - TILE * scale) / 2);
  // shadow
  c.blit(tile, off + 2, off + 3, { tint: [0, 0, 0], alpha: 0.28, scale });
  // outline
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
    c.blit(tile, off + dx, off + dy, { tint: [18, 16, 22], alpha: 1, scale });
  c.blit(tile, off, off, { scale });
  return c;
}

/** tool icon: a diagonal handle running lower-left -> upper-right, with a head. */
function toolIcon(tier, kind) {
  const c = new Canvas(ICON, ICON);
  const handle = [122, 86, 50];
  const head = tier === 'stone' ? [118, 120, 128] : [178, 140, 94];
  const hi = shade(head, 1.16);
  const lo = shade(head, 0.78);
  const rnd = rngFor(`tool:${tier}:${kind}`);

  // handle: 3px stick from (11,37) to (33,15)
  for (let i = 0; i <= 26; i++) {
    const x = 11 + i * 0.85;
    const y = 37 - i * 0.85;
    c.rect(Math.round(x), Math.round(y), 3, 3, shade(handle, 0.82 + (i % 3) * 0.09));
  }

  if (kind === 'pickaxe') {
    // curved bar across the top: wide, tapering to points
    for (let t = -13; t <= 13; t++) {
      const x = 30 + t;
      const y = 12 + Math.round((t * t) / 26);
      const w = t === 0 ? 3 : Math.abs(t) > 10 ? 2 : 3;
      c.rect(x, y, w, 3, t < 0 ? lo : hi);
    }
    c.rect(29, 14, 4, 4, head); // socket
  } else if (kind === 'axe') {
    // blade sitting on the right of the handle top
    for (let y = 0; y < 14; y++) {
      const w = 10 - Math.abs(y - 7);
      c.rect(28, 8 + y, w, 1, mix(hi, lo, y / 14));
    }
    c.rect(26, 12, 5, 5, head); // eye/socket
  } else if (kind === 'shovel') {
    // rounded spade blade at the top
    for (let y = 0; y < 12; y++) {
      const r = 1 - Math.abs(y - 4) / 9;
      const w = Math.max(1, Math.round(9 * r));
      c.rect(30 - Math.floor(w / 2) + 2, 8 + y, w, 1, mix(hi, lo, y / 12));
    }
    c.rect(28, 8, 6, 3, head); // shoulder
  } else {
    // sword: blade continues the diagonal past a crossguard + pommel
    for (let i = 0; i <= 22; i++) {
      const x = 20 + i * 0.85;
      const y = 28 - i * 0.85;
      c.rect(Math.round(x), Math.round(y), 3, 3, mix([214, 218, 228], [150, 156, 170], i / 22));
    }
    c.set(43, 6, [245, 248, 255]); // tip glint
    c.rect(14, 30, 13, 3, shade([92, 68, 42], 1)); // guard
    c.rect(10, 33, 6, 6, handle); // grip
    c.rect(9, 38, 8, 3, shade(handle, 0.8)); // pommel
  }
  void rnd;

  const outlined = new Canvas(ICON, ICON);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1]])
    outlined.blit(c, dx, dy, { tint: [16, 14, 20] });
  outlined.blit(c, 0, 0);
  return outlined;
}

// ---------------------------------------------------------------------------
// atlas assembly
// ---------------------------------------------------------------------------

async function writePng(path, canvas) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodePng(canvas));
}

async function main() {
  const t0 = Date.now();
  await mkdir(TEX_DIR, { recursive: true });
  // clean previously generated output (keep .gitkeep)
  for (const dir of [TEX_DIR, ICON_DIR]) {
    if (!existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '.gitkeep') continue;
      await rm(join(dir, entry.name), { recursive: true, force: true });
    }
  }

  // --- 1. block-face atlas ------------------------------------------------
  const faceKeys = [...new Set(Object.values(BLOCK_FACES).flatMap((f) => Object.values(f).filter((v) => typeof v === 'string')))]
    .filter((k) => PALETTE[k] || PAINTERS[k])
    .sort();
  const cols = Math.ceil(Math.sqrt(faceKeys.length));
  const rows = Math.ceil(faceKeys.length / cols);
  const atlasW = cols * TILE;
  const atlasH = rows * TILE;
  const atlas = new Canvas(atlasW, atlasH);
  const uv = {};
  faceKeys.forEach((key, i) => {
    const cx = (i % cols) * TILE;
    const cy = Math.floor(i / cols) * TILE;
    atlas.blit(paintTile(key), cx, cy);
    uv[key] = {
      x: cx,
      y: cy,
      w: TILE,
      h: TILE,
      u0: cx / atlasW,
      v0: cy / atlasH,
      u1: (cx + TILE) / atlasW,
      v1: (cy + TILE) / atlasH,
    };
  });
  await writePng(join(TEX_DIR, 'atlas.png'), atlas);
  await writeFile(
    join(TEX_DIR, 'atlas.json'),
    JSON.stringify(
      {
        generator: 'scripts/gen-textures.mjs',
        generatedAt: new Date().toISOString(),
        note: 'Original procedurally-generated art. Regenerate with `npm run gen:textures`.',
        image: 'atlas.png',
        tileSize: TILE,
        imageWidth: atlasW,
        imageHeight: atlasH,
        columns: cols,
        rows,
        tints: TINTS,
        textures: uv,
      },
      null,
      2,
    ),
  );

  // --- 2. block icons ---------------------------------------------------
  let icons = 0;
  for (const [name, faces] of Object.entries(BLOCK_FACES)) {
    const c = faces.flat ? flatIcon(faces.all, { tint: faces.tint }) : cubeIcon(faces);
    await writePng(join(ICON_DIR, 'block', `${name}.png`), c);
    icons++;
  }

  // --- 3. item icons --------------------------------------------------
  const itemPalette = {
    coal: [40, 40, 44],
    raw_iron: [190, 150, 120],
    iron_ingot: [214, 214, 224],
    stick: [140, 100, 58],
    flint: [60, 58, 64],
    bread: [196, 146, 78],
  };
  for (const name of MATERIAL_ITEMS) {
    const c = new Canvas(ICON, ICON);
    const base = itemPalette[name] ?? hashedColor(name);
    const rnd = rngFor('item:' + name);
    if (name === 'stick') {
      for (let i = 0; i < 30; i++) c.rect(22 + Math.floor(i / 3) - i * 0.1, 12 + i, 4, 2, shade(base, 0.8 + (i % 3) * 0.1));
    } else if (name === 'bread') {
      for (let y = 0; y < 14; y++)
        for (let x = 0; x < 22; x++) {
          const r = Math.hypot(x - 11, y - 7) / 12;
          if (r > 1) continue;
          c.set(13 + x, 17 + y, shade(base, 1 - r * 0.3 + (rnd() - 0.5) * 0.2));
        }
      for (let i = 0; i < 6; i++) c.rect(16 + i * 3, 20 + (i % 2), 2, 1, shade(base, 0.7));
    } else if (name === 'iron_ingot') {
      // trapezoidal bar with a bevelled top
      for (let y = 0; y < 12; y++) {
        const inset = Math.round((11 - y) * 0.5);
        c.rect(12 + inset, 20 + y, 24 - inset * 2, 1, mix(shade(base, 1.15), shade(base, 0.8), y / 12));
      }
      c.rect(13, 19, 22, 2, shade(base, 1.25)); // top face
      c.rect(15, 24, 3, 2, shade(base, 1.35)); // sheen
    } else {
      // nugget / shard cluster (coal, raw_iron, flint)
      for (let i = 0; i < 5; i++) {
        const x = 14 + Math.floor(rnd() * 16);
        const y = 14 + Math.floor(rnd() * 16);
        const s = 5 + Math.floor(rnd() * 5);
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++) {
            if (Math.hypot(dx - s / 2, dy - s / 2) > s / 2) continue;
            c.set(x + dx, y + dy, shade(base, 0.7 + rnd() * 0.6));
          }
      }
    }
    const outlined = new Canvas(ICON, ICON);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) outlined.blit(c, dx, dy, { tint: [16, 14, 18] });
    outlined.blit(c, 0, 0);
    await writePng(join(ICON_DIR, 'item', `${name}.png`), outlined);
    icons++;
  }
  for (const tier of TOOL_TIERS) {
    for (const kind of TOOL_KINDS) {
      await writePng(join(ICON_DIR, 'item', `${tier}_${kind}.png`), toolIcon(tier, kind));
      icons++;
    }
  }

  // --- 4. tiny brand mark used by the UI (favicon-ish) -----------------
  const mark = new Canvas(64, 64);
  const brandFaces = { top: 'grass_top', side: 'grass_side', bottom: 'dirt', tint: 0 };
  mark.blit(cubeIcon(brandFaces), 8, 8, { scale: 1 });
  await writePng(join(ICON_DIR, 'ui', 'mark.png'), mark);

  // legacy manifest (nothing reads it at runtime, but keep the shape stable)
  await writeFile(
    join(TEX_DIR, 'atlas.manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), tileSize: TILE, textures: PALETTE }, null, 2),
  );

  console.info(
    `gen:textures — atlas ${atlasW}x${atlasH} (${faceKeys.length} tiles), ${icons} icons, done in ${Date.now() - t0}ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
