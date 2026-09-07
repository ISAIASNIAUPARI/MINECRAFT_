#!/usr/bin/env node
/**
 * SKELETON — emits the original texture palette manifest consumed by the runtime
 * atlas (`src/rendering/TextureAtlas.ts`). Phase 1 (Agent: UI/assets) turns this
 * into a real pipeline that renders hand-tuned 16×16 ORIGINAL tiles to
 * `public/textures/atlas.png` + `atlas.json` (a proper PNG encoder or a headless
 * canvas). Nothing here may be derived from any existing game's art.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/textures');

/** key -> base RGB. Kept in sync with PALETTE in src/rendering/TextureAtlas.ts. */
const PALETTE = {
  stone: [128, 128, 132],
  cobblestone: [122, 122, 126],
  dirt: [134, 96, 67],
  grass_top: [106, 170, 92],
  grass_side: [120, 140, 90],
  sand: [219, 205, 155],
  gravel: [130, 124, 122],
  log_top: [162, 130, 86],
  log_side: [110, 84, 52],
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

async function main() {
  await mkdir(outDir, { recursive: true });
  const manifest = {
    generated: new Date().toISOString(),
    tileSize: 16,
    note: 'Original placeholder palette. Runtime atlas paints tiles procedurally from these colours.',
    textures: PALETTE,
  };
  await writeFile(resolve(outDir, 'atlas.manifest.json'), JSON.stringify(manifest, null, 2));
  console.info(`wrote ${Object.keys(PALETTE).length} texture entries to public/textures/atlas.manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
