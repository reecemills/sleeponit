# Sleep On It — playtest build

A kid's real day shapes his dreams. What he finds and experiences by day becomes the gear, enemies and places he fights through at night.

This is the web playtest build. It runs in a browser with no install and no server.

## Play it

1. Download or clone this repository.
2. Open `index.html` in Chrome, Edge or Firefox. Double-clicking the file works.

Or serve the folder with any static server, for example:

```
python -m http.server 8080
```

and open http://localhost:8080.

## Controls

| Key | Does |
|---|---|
| W A S D / arrows | Walk |
| Mouse (hold right button or click the scene) | Turn the camera |
| E | Interact: pick up, look, go to bed |
| Left click / J | Attack (dream only) |
| Shift / Space | Dodge step (dream only) |
| B / I | Backpack |
| M | Map |
| F | Add or erase a map mark (while the map is open) |
| N | Notebook (recipes you have discovered) |
| Esc | Pause / close |

## What is in this build

Playtest 1: the core action on one screen. One block of the neighborhood: the kid's house and yard with the tree house, the street, the mailbox, the bus stop and the walk to the school gate.

- **Day.** Explore, find things, put them in the backpack. The clock runs from 3:30 pm. Dinner at 6 pm unlocks bed. Midnight forces it.
- **Bedroom.** Put finds in the chest and combine any two. You don't learn what you made.
- **Night.** Wake in the dream version of the same block. The combination is revealed. Fight the shoelace demons, walk to the school gate at the edge of what you've discovered, step into the memory fog. Get called awake. Save where you woke.
- **Next day.** The calendar advances. The map shows what you drew.

## Layout

```
index.html        the whole UI shell and the script load order
css/ui.css        paper and crayon by day, chalk at night
js/data.js        the data contract: items, recipes, places, voices, tunables
js/world.js       the block, in day and dream states
js/discovery.js   the discovery grid, mask, distance field and save format
js/fog.js         memory fog ground shader and the deep-fog fade
js/player.js      third-person control and camera
js/combat.js      chain weapon, chalk heart, shoelace demons
js/ui.js          HUD, minimap, panels
js/game.js        the state machine: title, day, bedroom, dream, wake
vendor/three.min.js  Three.js r159 (classic build so file:// works)
```

Design documents, concept art and mockups live in the parent project folder, not in this repository.
