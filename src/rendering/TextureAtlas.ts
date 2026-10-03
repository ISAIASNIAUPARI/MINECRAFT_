import { hashInts } from '../core/rng';
import type { ITextureAtlas } from './types';

/**
 * SKELETON — procedurally paints an original placeholder texture per key onto a
 * single canvas atlas. Every texture is generated here from a hash of its key,
 * so the repo carries no binary art yet and nothing is derived from any existing
 * game. Phase 1 (Agent: UI/assets) replaces this with `scripts/gen-textures.mjs`
 * output (a real hand-tuned original atlas PNG) loaded via {@link loadTextureAtlas}.
 */

const TILE = 16;

/** Base colours for known keys; anything else gets a hashed colour. `[r,g,b]`. */
const PALETTE: Record<string, [number, number, number]> = {
  air: [0, 0, 0],
  stone: [128, 128, 132],
  cobblestone: [122, 122, 126],
  dirt: [134, 96, 67],
  grass_top: [106, 170, 92],
  grass_side: [120, 140, 90],
  sand: [219, 205, 155],
  gravel: [130, 124, 122],
  log_top: [162, 130, 86],
  log_side: [110, 84, 52],
  log: [110, 84, 52],
  planks: [176, 140, 92],
  leaves: [74, 140, 66],
  sapling: [90, 150, 70],
  glass: [200, 226, 232],
  water: [58, 110, 200],
  bedrock: [70, 70, 74],
  coal_ore: [110, 110, 112],
  iron_ore: [166, 150, 138],
  crafting_top: [150, 110, 70],
  crafting_side: [140, 100, 62],
  furnace_side: [104, 104, 108],
  furnace_top: [96, 96, 100],
  torch: [230, 190, 90],
};

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = hashInts(h, key.charCodeAt(i));
  return h >>> 0;
}

/**
 * Resolve a texture key against {@link PALETTE}.
 *
 * Block textures are species-qualified (`amberwood_leaves`, `pinewood_log_top`),
 * while the palette is keyed by material (`leaves`, `log_top`). Fall back to the
 * longest palette key that the texture name ends with, so every timber species
 * paints as wood instead of a random hashed colour.
 */
function paletteFor(key: string): [number, number, number] {
  const exact = PALETTE[key];
  if (exact) return exact;
  let best: [number, number, number] | null = null;
  let bestLen = 0;
  for (const name of Object.keys(PALETTE)) {
    if (name.length > bestLen && (key === name || key.endsWith(`_${name}`))) {
      best = PALETTE[name];
      bestLen = name.length;
    }
  }
  return best ?? hashedColor(key);
}

function paintTile(ctx: CanvasRenderingContext2D, x0: number, y0: number, key: string): void {
  const [r, g, b] = paletteFor(key);
  const seed = hashKey(key);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(x0, y0, TILE, TILE);

  // Per-pixel speckle for a mineral / organic feel.
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const n = (hashInts(seed, px, py) & 0xff) / 255 - 0.5;
      const k = 1 + n * 0.22;
      ctx.fillStyle = `rgb(${clamp8(r * k)},${clamp8(g * k)},${clamp8(b * k)})`;
      ctx.fillRect(x0 + px, y0 + py, 1, 1);
    }
  }

  if (key === 'glass' || key === 'water') {
    ctx.strokeStyle = `rgba(255,255,255,0.35)`;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, TILE - 1, TILE - 1);
  }
  if (key.endsWith('_ore')) {
    ctx.fillStyle = key.startsWith('coal') ? '#20201f' : '#d8c6a6';
    for (let i = 0; i < 5; i++) {
      const bx = x0 + 2 + (hashInts(seed, i, 1) % (TILE - 5));
      const by = y0 + 2 + (hashInts(seed, i, 2) % (TILE - 5));
      ctx.fillRect(bx, by, 3, 3);
    }
  }
}

function hashedColor(key: string): [number, number, number] {
  const h = hashKey(key);
  return [80 + (h & 0x7f), 80 + ((h >> 8) & 0x7f), 80 + ((h >> 16) & 0x7f)];
}
const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export class TextureAtlas implements ITextureAtlas {
  readonly image: HTMLCanvasElement;
  readonly tileSize = TILE;
  readonly columns: number;

  private readonly uv = new Map<string, [number, number, number, number]>();

  constructor(keys: string[]) {
    const unique = ['__missing', ...new Set(keys.filter((k) => k && k !== 'air'))];
    this.columns = Math.max(1, Math.ceil(Math.sqrt(unique.length)));
    const size = this.columns * TILE;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('TextureAtlas: 2D context unavailable');
    ctx.imageSmoothingEnabled = false;

    unique.forEach((key, i) => {
      const cx = i % this.columns;
      const cy = Math.floor(i / this.columns);
      if (key === '__missing') {
        ctx.fillStyle = '#ff00dc';
        ctx.fillRect(cx * TILE, cy * TILE, TILE, TILE);
        ctx.fillStyle = '#000';
        ctx.fillRect(cx * TILE, cy * TILE, TILE / 2, TILE / 2);
        ctx.fillRect(cx * TILE + TILE / 2, cy * TILE + TILE / 2, TILE / 2, TILE / 2);
      } else {
        paintTile(ctx, cx * TILE, cy * TILE, key);
      }
      const u0 = (cx * TILE) / size;
      const v0 = (cy * TILE) / size;
      const u1 = u0 + TILE / size;
      const v1 = v0 + TILE / size;
      this.uv.set(key, [u0, v0, u1, v1]);
    });

    this.image = canvas;
  }

  getUV(textureKey: string): readonly [number, number, number, number] {
    return this.uv.get(textureKey) ?? this.uv.get('__missing')!;
  }

  has(textureKey: string): boolean {
    return this.uv.has(textureKey);
  }
}

/** Collect every texture key referenced by a block registry. */
export function collectTextureKeys(defs: { textures: Record<string, string | undefined> }[]): string[] {
  const keys = new Set<string>();
  for (const def of defs) {
    for (const value of Object.values(def.textures)) if (value) keys.add(value);
  }
  return [...keys];
}
