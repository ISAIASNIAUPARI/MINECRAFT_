# Creature standard

The permanent rules for every creature, enemy and NPC in Voxelia. A creature
file defines **appearance, proportions, behaviour, attacks, animation and
sounds** — nothing else. Everything structural is already built and must be
reused.

For the step-by-step of writing one, see [`CREATURES.md`](./CREATURES.md).

---

## 1. Identity

Every creature belongs to one visual universe:

- Blocky voxel geometry: cubes and prisms, articulated segments, nothing organic
  or smooth.
- Readable silhouette first. A creature must be identifiable as a black shape at
  distance, before any detail reads.
- Horror comes from **silhouette, proportions, lighting and behaviour** — not
  from gore or detail density.
- Nothing may look like a realistic 3D model dropped into a voxel world.

Priority order when these conflict:

> **identity → gameplay → performance → extra detail**

Detail the player will not perceive is not worth a single extra box.

---

## 2. Geometry

Build from boxes in a pivot/origin tree. Model units are 1/16 block.

- Use the fewest boxes that produce the silhouette.
- Prefer a texture or a colour over geometry for any flat detail.
- Never model something the player cannot see.
- Box count priority: **head → silhouette → limbs → distinctive feature →
  secondary detail**.

**Reference budget:** the Hollow is 8 boxes. Treat ~10 as normal and ~20 as the
point where you justify yourself in a comment.

Boxes of the same size share one geometry automatically across every instance
and every creature. Reusing a size is free; inventing a new one is not.

---

## 3. Modularity

Split into logically named parts: `body`, `head`, `eyeL/eyeR`, `armL/armR`,
`legL/legR`, plus whatever is distinctive. Any part that animates must be its own
part. Children inherit the parent's motion, so a head on a body only needs its
own rotation.

Never write one monolithic part that then cannot be animated.

---

## 4. Materials

Materials are shared by appearance — same colour, opacity and emissive flag
means one material, across every instance and every creature.

- Reuse colours across creatures wherever the art allows; a shared palette is
  cheaper **and** reads as one bestiary.
- Never mutate a material at runtime: it is shared, so you would change every
  creature using it. The damage flash swaps between two cached materials for
  exactly this reason.
- No per-instance shaders.

**Measured:** 25 Hollows cost 5 geometries and 5 materials, not 200 and 200.
`tests/entities.test.ts` guards this — if a change breaks sharing, it fails.

---

## 5. Lighting

- Use the existing scene lighting. Do not add a light per creature.
- Glowing eyes and markings use `emissive: true` on the part, which costs
  nothing. A real dynamic light must be justified against a measurement.

---

## 6. Moving through the world

Two numbers decide whether a creature can actually get anywhere, and both are
easy to set wrong because nothing complains:

- **`stepHeight` under 1.0 means it cannot climb a single block.** It then falls
  back on hopping, and a wide creature hops in place against ordinary terrain
  forever. Anything with long legs or a body wider than about a block wants
  `stepHeight` above 1.0. The Lurker shipped at 0.8 and was stuck on flat
  forest floor; at 1.15 it crossed 18 blocks and reached the player.
- **`width` is a real constraint.** A 2.6-wide creature needs a 3-block gap. If
  it is meant to live in tunnels, it will plug them — that is the design — but
  check it can still reach the player somewhere.

The tell for a wedged creature is `onGround: false` with a constant positive
`velocity.y` and an unchanging position: it is re-jumping every time it lands.

> **Measuring behaviour in a hidden browser:** `requestAnimationFrame` is
> throttled or stopped entirely when the page is not drawing, so the simulation
> crawls or freezes and a creature looks broken when it is fine. Drive the loop
> directly instead — `__voxelia.loop.advance(1/20)` in a JS loop steps the fixed
> timestep deterministically — and measure elapsed *simulated* time
> (`__voxelia.elapsed`), never wall-clock seconds.

## 7. Giants and fliers

Three switches turn a normal creature into something the ground rules do not
cover. All three are on `CreatureDefinition`:

- **`gravity: false`** makes it fly. A flier steers vertically with
  `Intent.moveY` exactly as it steers horizontally; the ground brain in `ai.ts`
  never sets it, so a flier needs its own brain (see `leviathan.ts`).
- **`collides: false`** lets it pass through terrain. Needed by anything that
  burrows — it cannot be stopped by the ground it is carving.
- **`modelScale`** draws the model larger without inflating every number in its
  file. Authoring a 50-block creature in 1/16-block units puts every dimension
  in the hundreds. It does **not** change the hitbox: `width` and `height` stay
  authoritative, and for a giant the hitbox should cover the part that matters
  (the Worm's is its head) rather than the whole silhouette.

A creature with many visual segments stays **one entity**. The segments are a
nested chain in the model, posed with a phase offset per link so the bend
travels down the body. One collider per segment would be a swarm, not a
creature.

Terrain destruction goes through `Excavator`, which is bounded by radius, a
block budget and a protected-id list, and never searches outside the volume it
is handed.

## 8. Hitboxes

One box per creature: `width` × `height`, centred on its feet. That is the whole
collision model and it is deliberate.

Visual parts never generate colliders. Horns, fingers, teeth and accessories are
decoration. Gameplay and performance beat geometric fidelity.

---

## 9. Animation

Animations are rotations, offsets and visibility on named parts — no skinning,
no deformation, no blend trees.

Required channels where they apply, all driven from one `animate` function via
`ctx`:

| State | Source |
|---|---|
| Idle | `ctx.age`, offset by `ctx.phase` |
| Walk / Run | `ctx.distance` and `ctx.speed` |
| Attack | `ctx.attack` |
| Hurt | `ctx.hurt` |
| Death | `ctx.dead` (set `animatesDeath: true`, or the renderer tips the corpse) |
| Airborne | `ctx.airborne` |

Two rules that are not obvious:

- **Drive gait from `ctx.distance`, never from `ctx.age`.** Age-driven legs keep
  walking while the creature stands still and fall out of step when it speeds up.
- **Offset idle motion by `ctx.phase`.** It is a per-instance constant; without
  it a group breathes in perfect unison, which looks mechanical.

State logic lives in the brain. An animator reads `ctx` and poses — it never
decides anything.

---

## 10. Behaviour

Compose from `ai.ts`. Do not reimplement steering, sight or obstacle handling.

`createStalkerBrain` covers the archetype: wander → notice → close in → attack →
keep hunting the last known position. Two options carry most of the horror:

- `freezeWhenWatched` — advances only while unobserved.
- `huntsInLightUpTo` — makes light an actual defence.

For something the stalker cannot express, write a `Brain`: an object with a
`state` string and `think(self, senses, dt)` returning an `Intent`. Build it from
`steerTowards`, `steerAway`, `hasLineOfSight`, `shouldHopObstacle`,
`distanceXZ`.

A brain receives `senses` and returns an intent. It **cannot** reach into the
world and change anything — that asymmetry is deliberate and must stay.

---

## 11. Performance

The engine owns the cost model. A creature file does not optimise; it stays
within the shapes above and the cost follows.

**Measured** (100 ticks, scattered-pillar world, 50 ms tick budget at 20 TPS):

| Creatures | ms/tick | Raycasts/tick | Budget used |
|---|---|---|---|
| 10 | 0.32 | 8.5 | 0.6 % |
| 50 | 0.74 | 43.5 | 1.5 % |
| 200 | 2.35 | 167 | 4.7 % |

**Therefore: no staggered AI, no LOD, no object pooling, no instancing.** Those
are real techniques, and at this measured cost they would add machinery and bugs
to reclaim under 5 % of the tick budget at a creature count this game will not
reach. The trigger to revisit is a **measurement**, not a feeling: re-run the
benchmark, and if entity ticking passes ~10 % of budget at a realistic count,
stagger brain updates first (movement and animation stay per-tick), then LOD.

What a creature file must still avoid, because it would defeat the above:

- Allocating in `animate` or `think` — both run every tick.
- Creating geometry, materials or objects at runtime.
- Unbounded loops over the world.

Sight raycasts are already gated behind a cheap distance check. Keep any
expensive test behind a cheap one.

---

## 12. Spawn and death

Death stops the brain, runs the death pose, lingers briefly so the kill reads,
then reaps and rolls drops. All of that is the manager's job; a creature declares
`drops` and nothing more.

Despawning drops the object graph but keeps the shared caches, so spawning and
despawning repeatedly does not churn memory.

---

## 13. Not built yet

Stated plainly so nobody designs against something that does not exist:

| System | Status |
|---|---|
| Audio | **Does not exist.** No code, no files. Creature sounds cannot be declared yet. |
| Particles | **Does not exist.** |
| Natural spawning | `SpawnRule` is declared and read by nothing. Use `spawn()` or the **G** key. |
| Pathfinding | **Does not exist.** Brains steer straight at the target and hop one-block ledges. A creature that falls into a cave or meets a wall it cannot steer around will stand there wanting to move. Test behaviour on flat ground to tell a creature bug from this. |
| Ranged attacks | **Does not exist.** No projectiles, so a creature cannot throw or fire anything. |
| Particles | **Does not exist.** Impact dust, debris and smoke cannot be drawn. Fixed model parts on duty cycles are the workaround (see the Devourer's shards and the Worm's seams). |
| Voxel light propagation | **Does not exist.** `lightAt` answers "open to the sky?" — a torch creates no safe bubble. |

If a creature's design depends on one of these, say so and we build the system
first. **Light propagation matters most**: a horror design where light protects
you does not work until it exists.

---

## 14. Before adding any creature

1. Read [`CREATURES.md`](./CREATURES.md) and `hollow.ts`.
2. Reuse the existing entity, animation, material, collision and AI systems.
3. Build new infrastructure only when the current architecture genuinely cannot
   express the creature — and then build the smallest reusable thing, not a
   bespoke system for one monster.
4. Never duplicate behaviour between creatures. Shared behaviour goes in `ai.ts`.

A creature is finished when all five hold: **visually coherent · clear and
playable behaviour · uses the existing systems · adds no measured cost · can be
changed without breaking another creature.**
