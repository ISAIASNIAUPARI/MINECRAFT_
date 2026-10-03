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

## 6. Hitboxes

One box per creature: `width` × `height`, centred on its feet. That is the whole
collision model and it is deliberate.

Visual parts never generate colliders. Horns, fingers, teeth and accessories are
decoration. Gameplay and performance beat geometric fidelity.

---

## 7. Animation

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

## 8. Behaviour

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

## 9. Performance

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

## 10. Spawn and death

Death stops the brain, runs the death pose, lingers briefly so the kill reads,
then reaps and rolls drops. All of that is the manager's job; a creature declares
`drops` and nothing more.

Despawning drops the object graph but keeps the shared caches, so spawning and
despawning repeatedly does not churn memory.

---

## 11. Not built yet

Stated plainly so nobody designs against something that does not exist:

| System | Status |
|---|---|
| Audio | **Does not exist.** No code, no files. Creature sounds cannot be declared yet. |
| Particles | **Does not exist.** |
| Natural spawning | `SpawnRule` is declared and read by nothing. Use `spawn()` or F6. |
| Voxel light propagation | **Does not exist.** `lightAt` answers "open to the sky?" — a torch creates no safe bubble. |

If a creature's design depends on one of these, say so and we build the system
first. **Light propagation matters most**: a horror design where light protects
you does not work until it exists.

---

## 12. Before adding any creature

1. Read [`CREATURES.md`](./CREATURES.md) and `hollow.ts`.
2. Reuse the existing entity, animation, material, collision and AI systems.
3. Build new infrastructure only when the current architecture genuinely cannot
   express the creature — and then build the smallest reusable thing, not a
   bespoke system for one monster.
4. Never duplicate behaviour between creatures. Shared behaviour goes in `ai.ts`.

A creature is finished when all five hold: **visually coherent · clear and
playable behaviour · uses the existing systems · adds no measured cost · can be
changed without breaking another creature.**
