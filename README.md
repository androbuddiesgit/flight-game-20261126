# flight-game-20261126

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/androbuddiesgit/flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/androbuddiesgit/flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier** is a chase-view flight game over a procedural valley: fly the fictional Kite MK-II prop plane with keyboard or mouse, watch the altitude, speed and heading on the HUD, thread sky rings, drop airmail parcels low and slow over the farms, and put her down gently on three grass strips. Three sorties, fuel and stall discipline, synthesized engine and wind sound — all drawn and coded from scratch, no assets, no network.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Or serve `game/` with any static server and open `game/index.html`.

## How to play

- **1 / 2 / 3** — pick a sortie: Ring Run, Airmail Delivery, Island Hop. Enter starts Ring Run.
- **↑ ↓** pitch, **← →** bank (WASD works too). Bank turns the nose; pitch trades speed for altitude.
- **Shift / Ctrl** (or E / Q) — throttle up / down. Below stall speed the wing stops flying.
- **Space** — drop a parcel (Airmail only: low — under 130 m — and slow — under 48 m/s — over a farm).
- **Mouse** — hold and drag to steer.
- **P** pause, **M** mute, **R** restart the sortie.

Land gently on a strip (low sink, wings level, slow) to refuel. Fly into a hill, the river valley or the ground and the sortie ends. Rings add time and top up the tank.

## Layout

- `main.ts` — the hand-in program (Node 22): copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.
- `game/index.html` + `game/src/` — the game itself, plain static files: `config.js` (tuning), `rng.js` (seeded noise), `terrain.js` (valley, strips, rings, farms), `plane.js` (flight model), `missions.js` (objectives & scoring), `render.js` (3D projection, plane, HUD), `input.js` (keyboard + mouse), `audio.js` (synthesized sound), `shots.js` (deterministic screenshot scenes), `main.js` (loop).
- `screenshots/` — 4 real renders of the game in a browser (title, ring run, airmail drop, final approach).
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
