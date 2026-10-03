# Adding a weapon

> The creature rules in [`CREATURE_STANDARD.md`](./CREATURE_STANDARD.md) apply
> here too — same box models, same resource sharing, same rotation conventions.
> This page is what is specific to weapons.

A weapon is **one file**. The system owns firing, spread, ammunition, reloading,
aiming, recoil and the hitscan; a definition owns how it looks and how it moves.

```
src/weapons/catalogue/<name>.ts   <- the whole weapon
src/weapons/catalogue/index.ts    <- add it to CORE_WEAPONS
```

Copy [`serviceRifle.ts`](../src/weapons/catalogue/serviceRifle.ts).

---

## Viewmodel space

Model units are 1/16 block, as everywhere. **The origin is the holder's eye**,
`-Z` is forward, `+X` right, `+Y` up — so a weapon in the lower right sits at
positive X, negative Y, negative Z.

The whole viewmodel is then drawn at `VIEWMODEL_SCALE` (0.3). A weapon authored
at true world size would be three blocks long half a block from the eye and
would fill the screen; every first-person game draws the viewmodel smaller and
nearer than the real object. Author at natural proportions and let the scale
handle it.

It renders in **its own scene, camera and depth pass**. That is not an
optimisation — without it the weapon clips through any wall the player stands
near, and the world's fog greys it out.

---

## Stats

```ts
damage: 7,
fireRate: 9,          // rounds per second
semiAuto: false,      // true = one shot per click
magazineSize: 30,
reloadSeconds: 2.1,
range: 90,
spreadHip: 0.055,     // cone half-angle, radians
spreadAds: 0.004,     // must be SMALLER, or aiming is decoration
recoilPitch: 0.022,   // camera kick per shot, always up
recoilYaw: 0.009,     // sideways jitter, either direction
adsSeconds: 0.18,
adsFovScale: 0.72,    // below 1 zooms in
```

> **Fire rate is not quantised to the tick.** The cooldown carries its
> remainder, so 9 rounds/second really fires 9 — clamping it at zero made a
> 20 Hz tick round it down to 6.7. Rates above 20/second still cap at the tick
> rate; if you need one, the system has to fire more than once per tick.

---

## Aiming must actually align the sight

This is the one piece of maths worth doing properly rather than by eye. On ADS
the weapon offset has to **cancel the sight's own position** so the reticle
lands on the crosshair:

```ts
// Weapon root sits at (11, -12); the dot sits at (0, +6.6) inside it.
w.offsetX = -11 * a;
w.offsetY = (12 - 6.6) * a;
// Push the weapon AWAY, never toward the face: pulling it in puts the sight
// on the near plane and the hood swallows the screen.
w.offsetZ = -16 * a;
```

---

## The animator

Same shape as a creature's, with a weapon's own `ctx`: `age`, `speed`,
`distance`, `ads`, `fire`, `reload`, `empty`, `airborne`, `turnX`, `turnY`.

- **Bob from `ctx.distance`**, never from `age` — age-driven bob keeps swaying
  while the player stands still.
- **`ctx.turnX/turnY`** are the look delta, for the weapon lagging behind a fast
  turn. They are already clamped by the caller's own use; clamp again before
  applying so a huge mouse flick cannot throw the weapon off screen.
- **`ctx.reload` is 0..1 across the reload.** Drive the magazine drop, the gap,
  the fresh magazine and the bolt release off that single value.
- **Damp everything by `ctx.ads`.** A sighted weapon that still bobs and sways
  is unusable.

The system drives `parts.muzzleFlash` visibility *after* the animator runs, so a
weapon file cannot leave the flash stuck on.

---

## Effects

- **Muzzle flash** is an emissive box toggled for ~45 ms. Not a dynamic light:
  one light per shot is the expensive way to get the same look.
- **Casings** come from a fixed ring of 12 meshes, reused in order. Nothing is
  allocated per shot.

---

## Not built yet

| | |
|---|---|
| Audio | **Does not exist.** No shot, mechanism, reload or impact sound is possible yet. |
| Impact effects | No decals, sparks or dust — the hitscan reports where it landed, nothing draws it. |
| Weapon switching | One weapon is equipped at start. `equip(name)` works; no UI drives it. |
| Ammo reserves | A reload always refills. There is no carried ammunition to run out of. |
| PBR / realistic shading | The renderer is `MeshLambertMaterial` only. No metalness, roughness, normal maps, environment reflections or ambient occlusion. A "realistic" weapon is not reachable without a rendering overhaul. |

---

## Testing

```bash
npm test                 # tests/weapons.test.ts
npm run dev              # left click fires, right click aims, R reloads
```

In the browser console (dev only):

```js
const g = window.__voxelia;
g.weapons.state;                    // ammo, ads, recoil
g.weapons.equip('voxelia:service_rifle');
// Hold the aim at the input layer; ticking the weapon by hand gets overwritten
// by the game's own tick on the next frame.
const real = g.input.isDown.bind(g.input);
g.input.isDown = (a) => (a === 'use' ? true : real(a));
```
