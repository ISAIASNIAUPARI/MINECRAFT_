# Voxelia — Roadmap

The design brief lists 40 sequential steps. For delivery they are consolidated
into **4 phases**, each built by parallel workstreams and checkpointed before the
next begins.

---

## Phase 1 — Playable core + pipeline · _in progress_

Design steps 0–10, 37–38.

| Area | Deliverable |
|------|-------------|
| Engine | 16³ chunks, `Uint16Array` storage, coordinate math, chunk streaming, save hooks |
| Rendering | Three.js renderer, greedy meshing + AO in a Web Worker, texture atlas, sky/fog |
| World gen | Seed-deterministic multi-noise terrain, ≥6 biomes, caves, ores, trees, worker |
| Player | Walk/sprint/sneak/jump, gravity, swept-AABB collision, DDA raycast, fall damage |
| Input | Remappable keyboard + mouse, pointer lock, persisted bindings |
| Content | ≥25 blocks, tools/armor tiers, inventory, crafting (2×2 / 3×3 / furnace) |
| UI | Main menu, world create (seed), HUD, hotbar, inventory + crafting screens, debug HUD |
| Pipeline | GitHub Actions (typecheck/lint/test/build) + GitHub Pages deploy |
| Tests | coords, seed determinism, registries, inventory, crafting, raycast, collision |

**Exit criteria:** open the Pages URL → menu → create world with a seed →
generate terrain → move/look/jump → break & place blocks → pick up items → open
inventory → craft a tool → take damage → save → quit → resume the same world.

### Phase 1 workstreams (6 parallel agents)

1. **Engine** — `src/engine` + async generation queue + streaming + save/restore
2. **Rendering** — `src/rendering` + greedy meshing + Web Worker + sky/AO/water
3. **World gen** — `src/world` + noise + biomes + caves + ores + decorators + worker
4. **Player/Physics/Input** — `src/player` + `src/physics` + `src/input` + mining mechanics
5. **Content** — `src/blocks` + `src/items` + `src/inventory` + `src/crafting` + `src/content`
6. **UI** — `src/ui` (all React screens) + texture generation script + `docs/`

Project lead owns `src/core`, `src/game`, the interface contracts, CI/CD, and
integration.

---

## Phase 2 — Survival & life

Design steps 11–21: health/hunger/food, combat, entity system, original animals +
hostiles, AI (FSM / pathfinding / A*), agriculture, NPCs, villages, trading,
structures, day/night cycle, weather, fluids (water/lava), IndexedDB persistence,
World Manager.

## Phase 3 — Depth systems

Design steps 22–29: automation/signals, machines API, enchantments, potions,
XP/levels, achievements, dimensions + portal API, commands + permissions,
creative mode, spectator mode, full debug HUD.

## Phase 4 — Modding, multiplayer-prep, optimization, release

Design steps 30–40: full Mod API + registries, Event Bus catalogue, mod
format/loader/manager/sandbox, an example mod, client/server split + networking
abstractions + anti-cheat hooks, audio, particles, performance pass, full test
suite, security hardening, complete docs + "make your first mod" tutorial,
Release 1.0.

---

## Honesty rules (from the brief)

- No `TODO`-as-implementation, no empty functions in shipped code, no fake
  buttons, no "coming soon".
- Never claim something "works", "passes", or is "deployed" without having run it
  and seen the result.
- Each phase ends with a real report: implemented / files / tests / build /
  commit / deploy / problems / next.
