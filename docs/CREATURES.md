# Adding a creature

> The binding rules for every creature live in
> [`CREATURE_STANDARD.md`](./CREATURE_STANDARD.md). This page is the how-to.


A creature is **one file**. The engine already handles spawning, gravity,
collision, stepping, knockback, damage, death, drops, animation and rendering —
a creature definition never touches any of it.

```
src/entities/creatures/<name>.ts   <- the whole creature
src/entities/creatures/index.ts    <- add it to CORE_CREATURES
```

Copy [`hollow.ts`](../src/entities/creatures/hollow.ts) and change the numbers.

---

## The shape of a definition

```ts
export const MY_CREATURE: CreatureDefinition = {
  name: 'voxelia:my_creature',   // namespaced, unique
  displayName: 'My Creature',

  width: 0.6,       // collision box, in BLOCKS
  height: 1.9,
  eyeHeight: 1.72,  // where its sight rays start

  maxHealth: 20,
  moveSpeed: 3.4,   // blocks/second at full throttle
  jumpSpeed: 8.2,
  stepHeight: 0.6,  // ledge it walks up without jumping

  attackDamage: 3,
  attackCooldown: 1.1,  // seconds between hits
  attackRange: 1.1,     // measured between box edges

  model: [ /* see below */ ],
  animate: (pose, ctx) => { /* see below */ },
  brain: (rng) => createStalkerBrain(rng, { /* see below */ }),
  spawn: { /* where it may appear */ },
  drops: [{ item: 'voxelia:flint', min: 0, max: 2, chance: 0.5 }],
};
```

---

## 1. The model

Boxes in a tree. **Units are 1/16 of a block**, the same scale as a texture
pixel, so a 16-unit cube is exactly one block. The origin is between its feet,
Y is up, and `-Z` is the direction it faces.

```ts
{
  name: 'body',              // unique; animations address parts by this name
  size: [8, 14, 4],          // width, height, depth in model units
  pivot: [0, 10, 0],         // rotation origin, relative to the PARENT's pivot
  origin: [-4, 0, -2],       // box corner relative to THIS pivot
  color: [58, 56, 62],       // flat RGB 0..255
  children: [ /* nested parts inherit the parent's motion */ ],
}
```

**`pivot` vs `origin` is the thing to get right.** `pivot` is what the part
rotates around; `origin` is where the box sits relative to it. A head swivels
around the neck, so its pivot goes at the neck and its box is offset up from
there. Omit `origin` and the box hangs *below* the pivot, centred on X/Z —
which is exactly what a limb wants, so limbs usually skip it.

Optional per part:

| Field | Effect |
|---|---|
| `emissive: true` | glows, ignores scene lighting — use for eyes |
| `opacity: 0.5` | semi-transparent — wisps, ghosts |
| `rotation: [x,y,z]` | resting rotation in radians, before animation |
| `texture: 'key'` | atlas texture instead of a flat colour |

---

## 2. The animation

A function that writes rotations onto parts, once per frame.

```ts
animate: (pose, ctx) => {
  // Drive the gait from DISTANCE WALKED, not from age — then the step stays
  // in sync whether it is creeping or sprinting.
  const swing = Math.sin(ctx.distance * 2.1) * Math.min(ctx.speed / 3.4, 1);
  pose('legL').rotX = swing * 0.9;
  pose('legR').rotX = -swing * 0.9;

  // ctx.phase is a per-instance constant, so a group does not move in lockstep.
  const t = ctx.age + ctx.phase * 10;
  pose('body').rotZ = Math.sin(t * 0.9) * 0.02;

  // ctx.attack ramps 0 -> 1 through a swing.
  pose('armL').rotX = -ctx.attack * 1.5;
},
```

`ctx` carries: `age`, `speed`, `distance`, `headYaw`, `headPitch`, `airborne`,
`attack`, `hurt`, `dead`, `deathProgress`, `phase`.

> **Rotation signs — check a pose in-game before trusting it.** -Z is forward.
> On a limb hanging *below* its pivot, **`+rotX` reaches forward**. On a part
> rising *above* its pivot (torso, head), **`-rotX` leans forward**. Both
> creatures shipped with this inverted at first and clawed at the sky; it looks
> entirely plausible in code. `tests/entities.test.ts` now pins it. Every pose is reset to rest before each call, so only write
what you want to change. Addressing a part that does not exist is safe.

Writable per part: `rotX/Y/Z` (radians), `offsetX/Y/Z` (model units), `visible`.

---

## 3. The brain

`createStalkerBrain` covers the horror archetype: wander → notice → close in →
attack → keep hunting the last known position after losing sight.

```ts
brain: (rng) => createStalkerBrain(rng, {
  sightRange: 22,        // notices the player at this range
  loseRange: 30,         // keeps chasing until this far
  standoffRange: 0,      // >0 = keeps its distance instead of closing
  chaseThrottle: 1,      // 0..1 of moveSpeed while hunting
  wanderThrottle: 0.3,
  memorySeconds: 7,      // hunts the last known spot for this long
  freezeWhenWatched: false,  // only moves while unobserved
  huntsInLightUpTo: 15,      // only hunts at or below this sky light (0..15)
}),
```

Two knobs carry most of the horror:

- **`freezeWhenWatched: true`** — it holds perfectly still while you look near
  it and only advances when you look away.
- **`huntsInLightUpTo: 7`** — it will not come after you in daylight or near a
  torch, so light becomes a real defence.

For behaviour the stalker cannot express, write a `Brain` by hand: an object
with a `state` string and a `think(self, senses, dt)` returning an `Intent`.
Compose it from `steerTowards`, `steerAway`, `hasLineOfSight`,
`shouldHopObstacle` and `distanceXZ` in [`ai.ts`](../src/entities/ai.ts) rather
than reimplementing steering.

`senses` gives a brain: `voxels`, `playerPosition` (with `yaw`), `lightAt`,
`canSee`, `elapsed`, `timeOfDay`. That is deliberately all it gets — a brain
cannot reach into the world and change it.

---

## 4. Spawn rules

```ts
spawn: {
  biomes: ['voxelia:forest'],   // omit = any biome
  maxLight: 7,                  // dark places only
  minY: 0, maxY: 64,
  minPlayerDistance: 18,        // never materialise in your face
  maxPlayerDistance: 44,
  weight: 10,                   // relative odds against other creatures
  maxNearby: 6,
  groupMin: 1, groupMax: 2,
},
```

> **Current limitation, stated plainly:** natural spawning is not wired up yet —
> `SpawnRule` is read and respected by nothing so far. Creatures appear via
> `EntityManager.spawn()` and the **F6** debug key. Sky light is also an
> approximation: there is no voxel light propagation yet, so `lightAt` answers
> "is this spot open to the sky?" (anything with blocks overhead reads as 0).
> Both get replaced without any creature file changing.

---

## 5. Register it

```ts
// src/entities/creatures/index.ts
import { MY_CREATURE } from './my_creature';
export const CORE_CREATURES = [HOLLOW, MY_CREATURE];
```

---

## Testing it

```bash
npm test            # entity tests live in tests/entities.test.ts
npm run dev         # then press F6 in-game to spawn the test creature
```

In the browser console (dev build only), `__voxelia` is the live game:

```js
const g = window.__voxelia;
g.entities.spawn('voxelia:my_creature', { x: 0, y: 70, z: -6 });
g.entities.all.map(e => [e.definition.name, e.brain.state, e.health]);
g.player.state.stats.health = 20;   // stop dying while you iterate
```

`F3` shows the live entity count.

---

## What the engine does for you

So you know what *not* to write:

| | |
|---|---|
| Gravity, terminal velocity | ✅ |
| Swept-AABB collision against voxels | ✅ |
| Walking up ledges (`stepHeight`) | ✅ |
| Hopping one-block obstacles | ✅ `shouldHopObstacle` |
| Turning smoothly toward a target | ✅ |
| Acceleration and ground friction | ✅ |
| Knockback on damage | ✅ |
| Damage flash | ✅ |
| Attack cooldown gating | ✅ |
| Player invulnerability frames | ✅ |
| Corpse lingering, then reaping | ✅ |
| Rolling drops into the inventory | ✅ |
| Building and posing the model | ✅ |
| Per-instance animation phase | ✅ |
| Deterministic per-entity RNG | ✅ |
