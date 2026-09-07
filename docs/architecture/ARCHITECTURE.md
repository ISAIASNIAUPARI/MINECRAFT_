# Voxelia — Architecture

> Status: **Phase 1 (in progress)**. This document is the source of truth for how
> the systems fit together. Update it in the same PR as any structural change.

Voxelia is an **original** browser voxel sandbox. It is not a Minecraft clone at
the code/asset level — it borrows only the genre. No Minecraft code, textures,
audio, models, or strings appear anywhere in this repo.

---

## 1. Layering

```
        ┌──────────────────────────── UI (React) ─────────────────────────────┐
        │  src/ui — menus, HUD, inventory screens. Talks ONLY to GameBridge.  │
        └───────────────────────────────┬────────────────────────────────────┘
                                        │ immutable snapshots + commands
        ┌───────────────────────────────▼────────────────────────────────────┐
        │  src/game — orchestrator: fixed-timestep loop, wiring, GameBridge   │
        └───┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┘
            │          │          │          │          │          │
      ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐
      │ engine  │ │ world   │ │render  │ │player  │ │content │ │ storage │
      │ chunks  │ │ procgen │ │ meshing│ │physics │ │blocks  │ │ saves   │
      │ World   │ │ biomes  │ │ three  │ │input   │ │items   │ │         │
      └─────┬───┘ └────┬────┘ └───┬────┘ └───┬────┘ │inv/craft│ └─────────┘
            │          │          │          │      └────────┘
            └──────────┴──────────┴──────────┴─── src/core (math, rng, events, constants) ───
```

Rules:

- **React is UI only.** The simulation has its own loop (`GameLoop`), not
  `requestAnimationFrame` inside a component.
- Every module exposes a **frozen `types.ts` contract**. Modules depend on each
  other's *interfaces*, never their concrete classes (except `src/game`, which is
  the composition root).
- `src/core` has no dependencies on any other module.

## 2. The game loop

`src/game/GameLoop.ts` — fixed-timestep with render interpolation
([Gaffer on Games](https://gafferongames.com/post/fix_your_timestep/)).

- `update(dt)` runs at **20 Hz** (`TICKS_PER_SECOND`), always with the same `dt`.
  All gameplay logic lives here → deterministic, frame-rate independent.
- `render(alpha)` runs once per frame; `alpha ∈ [0,1)` interpolates visuals
  between ticks.
- Backlog is capped (`MAX_TICKS_PER_FRAME`) to avoid the spiral of death.

Ordering inside `update`: input → player → world sim → chunk streaming → remesh
budget → autosave.

## 3. Coordinate systems

| Space | Type | Meaning |
|-------|------|---------|
| World | `x, y, z` integers | absolute block position |
| Chunk | `cx, cy, cz` | `world >> 4` (arithmetic shift, floors) |
| Local | `lx, ly, lz` ∈ 0..15 | `world & 15` |
| Index | `0..4095` | `(ly << 8) \| (lz << 4) \| lx` — X fastest, then Z, then Y |

Chunks are **16×16×16** cubic. World Y is `[0, 256)` for Phase 1 (`SEA_LEVEL = 62`).
Helpers: `src/core/math.ts`.

## 4. Chunk system (`src/engine`)

- `ChunkData` — dense `Uint16Array(4096)` of block ids. Swappable for a
  palette-backed store later (Phase 4) behind `IChunkData`.
- `Chunk` — `ChunkData` + position + `stage` + `revision` + `meshDirty`/`needsSave`.
- `ChunkManager` — resident `Map<key, Chunk>`; radius-based load/unload around a
  center. **Phase 1 target:** move generation to a worker queue; add save/restore.
- `World` — coordinate facade. `getBlock`/`setBlock` at world coords; marks border
  neighbours dirty on edits.

## 5. World generation (`src/world`)

Pure function of `(seed, chunkPos)`. Determinism is enforced by
`tests/worldgen.determinism.test.ts` and is non-negotiable.

- `noise.ts` — seeded gradient noise + fBm helpers (`NoiseSampler2D/3D`).
- `WorldGenerator` — two passes:
  1. `generateTerrain` — heightmap (continent + hills noise), biome surface
     column, water to sea level, 3D cave carve, ore scatter.
  2. `decorate` — trees/features, via a bounded `DecorationEditor` that may reach
     into neighbours.
- `BiomeRegistry` — climate-based (`temperature`, `humidity`, `weirdness`) biome
  selection.
- **Phase 1 target:** worker-based; real cave/ravine/river systems; 8+ biomes;
  ore distribution curves; cross-chunk decoration.

## 6. Rendering (`src/rendering`)

- `TextureAtlas` — procedurally paints an **original** placeholder tile per
  texture key onto one canvas. Replaced by `scripts/gen-textures.mjs` output.
- `IChunkMesher.build(view, blocks, atlas) → { opaque, transparent }` — pure,
  worker-safe. `MeshGeometry` = interleaved `Float32Array`s + `Uint32Array`
  indices + baked vertex colour (tint × AO).
- `NaiveMesher` — culled per-face. **Phase 1 target:** greedy meshing + AO in a
  Web Worker.
- `Renderer` (Three.js) — one mesh per chunk, hemisphere + directional light,
  distance fog, block highlight. **Phase 1 target:** sky/sun/moon/stars, water
  animation, day/night rig.

## 7. Player, physics, input

- `physics/collision.ts` — axis-separated swept AABB vs solid voxels, sub-stepped.
- `physics/raycast.ts` — Amanatides & Woo DDA voxel traversal → hit block, face,
  normal, placement cell.
- `player/PlayerController` — walk/sprint/sneak/jump/gravity, creative fly,
  mouse-look, break/place via raycast. **Phase 1 target:** fall damage, mining
  time by hardness, view-bob, fluid physics, step-up.
- `input/InputManager` — keyboard + mouse + pointer lock; **remappable** bindings
  persisted to `localStorage`. Game code reads *intents* (`isDown`,
  `consumePressed`), never DOM events.

## 8. Content (`src/blocks`, `src/items`, `src/inventory`, `src/crafting`, `src/content`)

Data-driven registries with numeric ids + namespaced names (`voxelia:stone`).
`createGameContent()` assembles and finalizes them. Phase 4 lets mods contribute
before `finalize()`.

- `IBlockRegistry` — flat typed-array lookup tables for the mesher hot path.
- `RecipeRegistry` + `CraftingResolver` — shaped / shapeless / smelting; matching
  is data-driven and mod-registerable.

## 9. Storage (`src/storage`)

`IWorldStorage` contract. Phase 1: `MemoryStorage` (session-scoped). Phase 2:
`IndexedDbStorage` behind the same interface + `WorldManager` (new/load/delete/
duplicate).

## 10. UI boundary (`GameBridge`)

`src/game/types.ts`. React subscribes to one immutable `GameSnapshot` via
`useSyncExternalStore` and issues commands (`startNewWorld`, `pause`, …). This is
the single seam between engine and UI.

## 11. Modding (Phase 4 — designed for now)

Every registry is an interface; the event bus (`src/core/EventBus`) is the
primitive for the full event catalogue. Mods will run in Web Workers behind a
capability-gated API. Nothing in Phases 1–3 may assume a closed content set.

## 12. Deployment

`push → CI (typecheck, lint, test, build) → deploy-pages`. Vite `base` is
`/MINECRAFT_/` for `build`. A red build never deploys. See
[`docs/deployment/`](../deployment/).

## 13. Roadmap

See [`docs/ROADMAP.md`](../ROADMAP.md) for the 4-phase plan and the mapping from
the 40-step design roadmap.
