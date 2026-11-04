# Module contracts — Sleep On It web build

Decided before implementation so modules can be written in parallel. Classic scripts, no bundler, no ES modules (the game must open from `file://`). Everything hangs off the global `SOI`. Three.js r159 is loaded first as the global `THREE` from `vendor/three.min.js`.

Script load order in `index.html`:

```
vendor/three.min.js
js/data.js        SOI.data, SOI.craft, SOI.time      (done)
js/world.js       SOI.world                          (world agent)
js/discovery.js   SOI.discovery                      (core)
js/fog.js         SOI.fog                            (core)
js/player.js      SOI.player                         (core)
js/combat.js      SOI.combat                         (core)
js/ui.js          SOI.ui                             (ui agent)
js/game.js        SOI.game, boots on DOMContentLoaded (core)
```

Units: meters. Y up. The street runs east (+X) to west (-X). North is -Z. World bounds and the 2 m discovery grid are in `SOI.data.world` (`minX -70, maxX 90, minZ -50, maxZ 50`). Cell index: `ix = floor((x - minX) / cell)`, `iz = floor((z - minZ) / cell)`, `cellIndex = iz * cols + ix`, `cols = (maxX - minX) / cell = 80`, `rows = 50`.

The kid is a capsule of radius 0.5 m. All collision is XZ axis-aligned boxes.

---

## `SOI.world` (js/world.js)

```js
SOI.world.build(scene, mode) -> handle   // mode: 'day' | 'dream'
```

Builds the whole block as low-poly greybox-plus geometry (boxes, cones, cylinders, flat-shaded Lambert materials, no textures, no external assets) and adds it to `scene`. Called once per phase; the caller disposes the previous handle's `group` by removing it from the scene.

`handle`:

```js
{
  group,          // THREE.Group, already added to scene
  ground,         // THREE.Mesh: PlaneGeometry covering the world bounds, 1 segment per 2 m cell (80 x 50 segments),
                  //   rotated flat at y = 0, with a per-vertex `color` attribute painted for grass / dirt lane / paved road /
                  //   center line / creek. Material: MeshLambertMaterial({ vertexColors: true }). fog.js swaps the material
                  //   in the dream, so the roads MUST be in the vertex colors, not separate meshes.
  colliders,      // [{ x, z, w, d }]  centers and full sizes in XZ. Houses, bus, pillars, fences, trees, world edge walls.
  interactables,  // [{ id, type, x, z, radius, label, itemId?, eventId?, text? }]
                  //   type 'item'  : a pickup. itemId from SOI.data.items. label like 'Pick up rope'.
                  //   type 'door'  : the kid's front door. label 'Go inside'. Exactly one, id 'frontdoor'.
                  //   type 'event' : a day event zone. eventId from SOI.data.events. Fires on entry, label unused.
                  //   type 'look'  : a thing to look at. text is what the kid thinks. label like 'Look through the gate'.
                  //   In 'dream' mode: no 'item' interactables (the things came with the kid), no 'event'; keep 'look's.
  spawn,          // { x, z, rotY }  day start: on the path in front of the porch, facing the street
  dreamSpawn,     // { x, z, rotY }  first dream start: same spot as `spawn` (the dream begins outside the house)
  enemySpawns,    // [{ x, z, placeId }]  dream only; empty array by day
  places,         // [{ id, name, x, z, radius }]  from SOI.data.places: home, yard, street, busstop, gate (not 'fog')
  mapFeatures,    // see below; identical in both modes
  props,          // [{ mesh, x, z }]  every placed object (not ground). x, z = footprint center. fog.js hides undiscovered ones.
  lights,         // [THREE.Light]  the lights this mode added (sun + hemisphere by day; moon + hemisphere + a few warm window
                  //   point lights in the dream). The caller tears them down with the group.
  skyColor,       // THREE hex: day 0x9fc6e8 warm afternoon; dream 0x0d0b17
}
```

`mapFeatures` is what the minimap draws, in world XZ:

```js
[
  { kind: 'road',  width: 7, points: [[x,z], [x,z], ...] },   // paved main street, with a center line
  { kind: 'lane',  width: 3.5, points: [...] },               // dirt side lane
  { kind: 'creek', width: 4, points: [...] },
  { kind: 'house', x, z, w, d, label: 'Home' },               // label optional; only Home, School get one
  { kind: 'treehouse', x, z },
  { kind: 'bus', x, z, w, d, rot },                           // rot in radians about Y
  { kind: 'busstop', x, z },
  { kind: 'mailbox', x, z },
  { kind: 'gate', x, z, w },
  { kind: 'school', x, z, w, d, label: 'School' },
  { kind: 'tree', x, z },
  { kind: 'bridge', x, z, rot },
]
```

### Layout to build (from the approved concept art and the implementation plan)

One block of the neighborhood, roughly 160 x 100 m:

- **Maple Street**: paved main road along `z = 0` from `x = -70` to `x = 60`, 7 m wide, dashed yellow center line. Sidewalk strip on both sides (slightly lighter). By day the road is clean grey; in the dream it is cracked and broken (darker, with irregular near-black vertex patches and a few potholes as dark cells; weeds as small dark-green cones on the road).
- **The kid's house**: at `(-35, -14)`, about 12 x 10 m, two storeys, pitched roof, chimney, porch on the south side facing the street, front door centered on the porch at `(-35, -8.5)`. A path from the door to the sidewalk. Warm cream walls, red-brown roof by day; in the dream the same shape with lit amber windows and a darker, taller-looking roof (scale the roof 1.3 in Y).
- **The yard**: behind the house (north), fenced, about `x -46..-24, z -38..-19`. Big tree at `(-40, -31)` with a **tree house** in it (box on the trunk at ~4 m with a ladder of thin boxes). Sandbox at `(-32, -27)`. Toy truck (small red box) at `(-41, -29)`. Scattered sibling toys (small bright boxes/spheres). Side gate in the fence at `(-24, -21)`.
- **Mailbox** at the curb `(-35, -4.5)`, a small box on a post.
- **Neighbor houses**: north side at `(-5, -16)` and `(25, -16)`; south side at `(-50, 16)`, `(-20, 16)`, `(10, 16)`, `(40, 16)`. Varied colors by day; in the dream dark with one or two lit windows each. Fences between some.
- **Dirt lane** heading north from the street at `x = 5`, from `z = -3.5` to `z = -45`, 3.5 m wide, packed dirt (tan). It crosses a **creek** that runs east-west around `z = -40` (blue-grey strip in the vertex colors, 4 m wide, from `x -70` to `x 90`) on a small wooden **footbridge** at `(5, -40)`.
- **Bus stop** at `(20, -5)`: a sign post and a bench. The **school bus** parked at the north curb at `(30, -4)`, 11 x 2.6 m, yellow by day with black stripe and windows; in the dream dark ochre, rust streaks, headlights as two emissive discs (yellow) facing west down the street.
- **School gate** at `(60, 0)`: two brick pillars 1 m square, 4 m tall, 7 m apart, with dark iron bars between them (closed), a low wall running north and south from the pillars to `z = ±14`. In the dream the pillars are 6 m tall and the bars taller.
- **The school** beyond the gate at `(78, -4)`, about 24 x 14 m, two storeys with a bell tower, visible over the gate. By day it is cream brick; in the dream it is darker, tower 1.4 taller. It is behind the gate wall so the kid can see it but not reach it.
- **Trees**: 10 to 14 round-canopy trees (cone or sphere on a cylinder) along the street verges and around the houses, autumn colors by day (orange, yellow-green, red). In the dream the same trunks with no canopy (dead) or sparse dark canopies.
- **World edge**: invisible colliders just inside the bounds so the kid cannot leave.

Lighting by day: a warm directional sun from the southwest, low (about 25° elevation, it is late afternoon), with soft shadows off (performance), plus a hemisphere light (sky 0xbfd8ff, ground 0x8a6a3a). Dream: a cold blue-violet directional moon (0x7a7fd1, intensity 0.35) from the east, hemisphere (0x1a1630, 0x05040a, 0.6), and point lights at lit windows (0xffb347, intensity 0.8, distance 10).

Day palette (approved art `world-var-a-real-ironGiant-morning.jpg`): warm cream, soft red-brown roofs, autumn trees, clean grey road, green grass with a dusty verge. Dream palette (`r2-d2b-low-angle-school-gate.jpg`): everything desaturated and dark violet-grey, lit windows the only warm color, moonlit purple ground.

Interactables to place:

| id | type | at | label / text |
|---|---|---|---|
| rope | item rope | by the toy truck (-41, -29) | Pick up rope |
| padlock | item padlock | side gate (-24, -21) | Take the padlock |
| ball | item ball | yard grass (-30, -33) | Pick up ball |
| marbles | item marbles | sandbox (-32, -27) | Pick up marbles |
| tape | item tape | porch (-32, -9.5) | Pick up tape |
| torch | item torch | porch step (-38, -9.5) | Pick up flashlight |
| smallkey | item smallkey | mailbox (-35, -4.5) | Look inside the mailbox |
| frontdoor | door | (-35, -8.5) | Go inside |
| treehouse | look | ladder (-39, -33) | Climb up? — text: 'The fort. Your best friend left a comic up there. Later.' |
| busstop | event tripped | (20, -4), radius 3 | (fires on entry) |
| gate | look | (60, 0), radius 3 | Look through the gate — text: 'Locked for the night. Past the bars, the school. You can see the front doors from here.' |

Enemy spawns (dream): street `(-10, 1)`, `(0, -1)`, `(12, 2)`, `(45, 0)`; busstop `(18, -3)`, `(22, -1)`, `(26, -5)`, `(30, 2)`, `(24, 4)`, `(34, -2)`.

Places: home `(-35, -12) r 12`, yard `(-35, -29) r 12`, street `(0, 0) r 60` (checked last, it is the fallback), busstop `(24, -3) r 9`, gate `(60, 0) r 10`.

---

## `SOI.ui` (js/ui.js, css/ui.css, index.html)

The UI agent owns `index.html` (the DOM shell, the inline SVG `<symbol>` sheet, and the script tags in the order above), `css/ui.css`, and `js/ui.js`. The game canvas is `<canvas id="gl">`, fixed, full viewport, behind every HUD element. The HUD is DOM over the canvas with `pointer-events: none` except on buttons.

Style: the UI kit in `../art/ui/ui-mockups.html` and the clickable prototype `../art/ui/main-screen.html`. Paper (#f3e9d0), graphite (#35333d), crayon red (#d9503f), blue (#3f6fb5), green (#6c9a4a), gold (#e6a93c) by day. Night (#0d0b17), chalk (#ece9f5), moon (#bfc8ff), lamp (#ffb347) in the dream. Fonts via Google Fonts link: Schoolbell (headings), Patrick Hand (UI), DM Mono (data), with cursive and monospace fallbacks so it still reads offline. The `.night` class on `<body>` switches the palette.

```js
SOI.ui.init(handlers)
```

`handlers` (all optional, called by the UI):

```js
{
  onStart(),                 // title: 'Step outside' / 'Continue'
  onNewGame(),               // title: confirmed 'Start a new day' (the UI shows the confirm panel itself)
  onRequestPanel(type),      // UI keys: 'backpack' (B/I), 'map' (M), 'notebook' (N), 'pause' (Esc with no panel open).
                             //   game.js answers with openPanel(type, data). The UI never opens a data panel on its own.
  onResume(),                // pause: keep exploring / keep dreaming. Also Esc closes any panel (UI does that itself, then calls onResume)
  onSleep(),                 // bedroom: 'Go to sleep'
  onLeaveHouse(),            // bedroom: 'Step outside'
  onTake(itemId),            // bedroom: take an item found in the room
  onMove(itemId, to),        // bedroom: to 'chest' | 'backpack'
  onCombine(aId, bId),       // bedroom: tie two items together (both from chest or backpack)
  onUncombine(),             // bedroom: undo tonight's combination
  onWake(),                  // dream: confirmed wake up
  onToggleMark(),            // map panel: F or button; marks at the kid's position
  onSetting(key, value),     // 'subtitles' | 'reducedMotion'
  onMainMenu(),
}
```

Screens and HUD:

```js
SOI.ui.showScreen(name, data)
//  'title'      { hasSave, caption }           caption like 'Week 6 · Dreaming · Saved on this device'
//  'game'       {}                             HUD visible
//  'transition' { toNight, title, text, ms }   full-screen card; resolves itself after ms (UI calls nothing)
//  'summary'    { week, date, found: [names], made: name|null, demons, discoveredPct, onContinue }  end-of-night card with a 'Next day' button
SOI.ui.setMode(mode)        // 'day' | 'dream'  toggles body.night and swaps HUD variants
SOI.ui.setHud(h)
//  h = { clock: '4:30 pm', dateLabel: 'Week 6 · Tue', date: 'Oct 14', phase: 'After school', location: 'Outside home',
//        world: 'The real world', packCount: 3,
//        prompt: { key: 'E', label: 'Pick up rope' } | null,
//        heart: 1.0,                        // 0..1 fill of the single chalk heart (dream)
//        weapon: { name, icon } | null,     // equipped dream item (dream)
//        subtitle: { speaker: '[Muffled from the house]', text: "Dinner's at six!", loud: 0 } | null,  // loud 0..1 scales the text
//        lost: false }                      // deep fog: dims the HUD except the minimap
SOI.ui.drawMinimap(m)
//  m = { mode, features, grid: SOI.data.world, mask: Uint8Array (1 = discovered), player: { x, z, rotY },
//        marks: [{x,z}], trail: [{x,z}], lost }
//  Day: a pinned paper rectangle, crayon strokes, only discovered cells drawn (soft crayon edge), an arrow for the kid.
//  Dream: round chalk map, discovered in chalk, undiscovered pure black, a clean edge, the footprint trail as dots.
//  lost: all black except the trail dots and the kid's arrow.
//  Called every frame at ~10 Hz by game.js; draw into a <canvas> inside the HUD.
SOI.ui.openPanel(type, data)
//  'pause'     { mode, canSleep, inHouse }
//  'backpack'  { mode, items: [{ id, name, icon, desc }], loaned: [{ name, who }], tonight: { name, icon } | null }
//  'map'       { mode, features, grid, mask, player, marks, places: [{ id, name, x, z, discovered }], caption }
//              Full-screen paper map (day) or chalk map (dream); same drawing as the minimap at larger size, with place labels
//              on discovered places, an '?' on seen-but-unreached, 'Add a mark · F' button, 'Fold away · M'.
//  'bedroom'   { chest: [items], backpack: [items], roomFinds: [items], combined: { a: item, b: item } | null,
//                canSleep, clock, note }   the whole bedroom screen: chest grid, backpack grid, 'On your desk' finds with Take,
//                two combine slots with 'Tie them together', the hidden-result card 'You made something. You'll find out tonight.',
//                buttons 'Go to sleep' (disabled with a hint until canSleep) and 'Step outside'.
//  'notebook'  { recipes: [{ a: item, b: item, result: { name, icon }, reveal }] }   recipe page in the kid's handwriting
//  'settings'  { subtitles, reducedMotion }
//  'help'      {}
//  'wake'      { place }   confirm: 'Wake up' / 'Keep dreaming'
//  'newgame'   {}          confirm: 'Start again' / 'Keep my progress'
SOI.ui.closePanel()
SOI.ui.isPanelOpen() -> bool
SOI.ui.toast(text)                 // bottom center, 3 s
SOI.ui.pickup(name)                // the pickup chip beside the backpack, 2 s
SOI.ui.reveal({ name, icon, reveal })   // dream: a short center card when the combination is revealed, 4 s
```

Icons: inline SVG symbols with ids `i-<name>` for every `icon` used in `SOI.data.items` and `SOI.data.dreamItems`: heart, pack, rope, lock, ruler, tape, ball, torch, marbles, key, sword, string, caps, chain, bow, flail, spear, mace, sling, lump, fist, bed, eye, door, sun, moon, star, voice, map, mark, notebook. Hand-drawn line style like the prototype: stroke 2.6, round caps, no fill.

Keyboard owned by the UI: Esc, B, I, M, N, F (F only while the map panel is open). Everything else (WASD, E, mouse, J, Shift, Space) is the game's. While a panel is open the game pauses its simulation; the UI must not swallow keys it does not own.

---

## `SOI.discovery` (js/discovery.js) — core

```js
SOI.discovery.create(grid) -> d
d.mask              // Uint8Array(cols*rows), 1 = discovered
d.cols, d.rows
d.cellOf(x, z) -> index | -1
d.isDiscovered(x, z)
d.reveal(camPos, forward, opts)   // marks cells within sightRadius in the facing cone, plus the close ring; returns count newly revealed
d.distanceField()  -> Float32Array // distance in meters from each cell to the nearest discovered cell (0 inside). Recomputed on demand.
d.percent() -> 0..100
d.serialize() -> base64 string; SOI.discovery.deserialize(str, grid) -> d
```

## `SOI.fog` (js/fog.js) — core

```js
SOI.fog.apply(handle, discovery, tunables) -> f     // dream only: swaps handle.ground material for the fog shader using a
                                                    //   DataTexture of the distance field; hides handle.props on undiscovered cells
f.update(playerPos) -> { depth, lost }              // depth = distance from nearest discovered cell at the kid; lost = depth > fogDeep
f.setBonus(mult)                                    // lantern widens the bands
f.dispose()
```

## `SOI.player` (js/player.js) — core

```js
SOI.player.create(scene, camera, opts) -> p        // builds the kid mesh (day or dream palette), third-person camera
p.setMode('day'|'dream'); p.setPosition(x, z, rotY); p.update(dt, input, colliders); p.position (THREE.Vector3); p.forward()
```

## `SOI.combat` (js/combat.js) — core

```js
SOI.combat.create(scene, player, weaponDef, opts) -> c
c.spawnDemons([{x,z}]); c.update(dt, input) -> { heart: 0..1, hitThisFrame, killed }; c.dispose()
```

## Save format (`localStorage['sleeponit-save-v1']`)

```js
{ version: 1, calendarIndex, phase: 'day' | 'dream', clockMinutes, dreamPos: { x, z, rotY } | null,
  discovery: base64, ownership: { itemId: 'backpack' | 'chest' | 'world' | 'bedroom' | characterId },
  tonight: { a, b, result } | null, knownRecipes: [{ a, b, result }], places: { placeId: { mood, events: [] } },
  marks: [{x,z}], settings: { subtitles, reducedMotion }, stats: { demons, nights } }
```
