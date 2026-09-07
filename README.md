# Voxelia

An **original** 3D voxel sandbox for the browser — procedural world, mining,
building, crafting, survival, and an extensible modding architecture.

Voxelia is inspired by the voxel-sandbox genre. It is **not** affiliated with,
endorsed by, or derived from Minecraft, and contains no Minecraft code, textures,
audio, models, or other assets.

> **Status:** Phase 1 (playable core) in progress. See
> [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Repository:** https://github.com/ISAIASNIAUPARI/MINECRAFT_
**Play (after first deploy):** https://isaiasniaupari.github.io/MINECRAFT_/

---

## Quick start

```bash
git clone https://github.com/ISAIASNIAUPARI/MINECRAFT_.git
cd MINECRAFT_
npm install
npm run dev      # http://localhost:5173
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck + production build to `dist/` |
| `npm run preview` | serve the production build locally |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | tests + coverage report |
| `npm run typecheck` | `tsc --noEmit` for app + node configs |
| `npm run lint` | ESLint |
| `npm run gen:textures` | regenerate the placeholder texture manifest |

## Controls (default, all remappable)

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
| Mouse | Look (click canvas to lock the pointer) |
| Left click | Break block |
| Right click | Place block |
| `Space` | Jump (double-tap airborne = toggle fly in Creative) |
| `Shift` | Sneak · `Ctrl` | Sprint |
| `1`–`9` / wheel | Hotbar |
| `E` | Inventory · `Esc` | Pause · `F3` | Debug info |

## Tech

TypeScript · Vite · React (UI only) · Three.js · Web Workers · IndexedDB (Phase 2)
· GitHub Actions · GitHub Pages.

## Architecture

The engine runs its own fixed-timestep loop; React only renders UI. Every
subsystem is behind a frozen `types.ts` contract. Full detail in
[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).

```
src/
  core/       math, seeded RNG, event bus, constants
  engine/     chunks, chunk manager, World facade
  world/      procedural generation, biomes, noise
  rendering/  Three.js renderer, chunk meshing, texture atlas
  player/     controller · physics/  collision + raycast · input/  remappable bindings
  blocks/ items/ inventory/ crafting/ content/   data-driven registries
  storage/    save/load
  game/       orchestrator + GameBridge (the UI seam)
  ui/         React menus + HUD
```

## Contributing / modding

Phase 4 ships a full modding API. Design notes:
[`docs/modding/`](docs/modding/). Until then, content lives in the `src/blocks`,
`src/items`, `src/crafting`, and `src/world` registries.

## License

[MIT](LICENSE). Original project — no third-party game IP.
