[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tuhin339/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tuhin339/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Palm City Heat

An original top-down open-world crime game that runs entirely in the browser — no build step, no assets, no network requests. Open `game/index.html` in desktop Chrome and play.

Danny Marlow is back in Palm City with empty pockets and one phone number: Marisol Vega, who always has work for a driver who keeps his mouth shut. Work her four jobs — steal a marked Solana GT, run packages across the districts, burn off a three-star heat level, and clear the Solana Kings out of the Old Port — while Palm City's traffic, pedestrians and police carry on around you.

## What's in the city

- A living city of four districts (Cactus Heights, Downtown Palms, Marina Mile, Old Port): road grid with lane-following traffic, wandering pedestrians who flee reckless driving, ~70 buildings, palms, a beach and the sea.
- Five car models to steal and drive, each with its own handling: Runabout, Palmera Sedan, Solana GT, Bruto Pickup, Vagabond Van. Arcade physics with handbrake drift, skid marks and off-road dust.
- A wanted system from 0 to 5 stars: witnessed crimes raise your heat, interceptor patrols hunt you down, and a bust meter decides whether you make it home. Get busted and you wake up outside Palm City PD, lighter in the pocket; get wasted and it's the Marina Mile hospital.
- A pistol, mouse-aimed, and the Solana Kings who shoot back.
- Phone-driven story missions with cash rewards, a minimap with police and mission markers, and progress that saves itself in your browser.

## Controls

- **W A S D / arrows** — walk and drive
- **Shift** — sprint on foot, handbrake in a car
- **E** — get into the nearest car, or get out
- **Mouse** — aim · **click or F** — fire the pistol
- **T** — answer Marisol's phone, take the job
- **P** — pause · **M** — mute

## Running it

Just open `game/index.html`. For a local server, `node serve.ts` serves the game at http://localhost:8080. The `?shot=start|chase|mission|combat&seed=1` URLs stage deterministic screenshot scenes that play the real rules forward — the images in `screenshots/` were captured from them.

## Layout

- `game/src/world.js` — the deterministic city: districts, roads, buildings, beach
- `game/src/entities.js` — the driver and the five cars, and how they move and collide
- `game/src/traffic.js` — traffic drivers and pedestrians
- `game/src/police.js` — wanted stars, pursuit, busted and wasted
- `game/src/combat.js` — the pistol, bullets and the Solana Kings
- `game/src/missions.js` — Marisol Vega's four jobs
- `game/src/render.js` / `game/src/hud.js` — the city on screen, and the HUD with its minimap
- `game/src/audio.js` — a small WebAudio synth: engine, sirens, shots, jingles
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes the dossier

An entry to the make.fun "Make GTA 6" bounty (gta6-01). Everything here — city, names, story, code — is an original work written for this bounty.

## How this entry was built

Palm City Heat was written by an AI agent working in recorded sessions for this bounty, not typed up beforehand and pasted in. It began from the make.fun kit's starter, which contributed the plumbing only — the `main.ts` hand-in program, the vendored dossier library and the local server — and the placeholder game that came with the kit was thrown away. The city, the driving, the traffic, the police, the missions and the sound were then built in two passes: first the living city and the cars, then the wanted system, the gunplay, Marisol's four jobs and the audio synth laid over the top, each pass checked with headless simulations before the next began.

The pieces fit together the way the Layout list suggests: `world.js` deals the same city from the same seed every time, the simulation modules step it forward at a fixed rate, and `render.js` and `hud.js` only ever draw what the simulation says is true. That determinism is also how the screenshots were made honestly: the `?shot=` scenes in `game/src/shots.js` stage a moment — a police pin, a job briefing, a shootout — and play the real rules forward with an autopilot, so each image in `screenshots/` is a frame the game itself produced, captured in a browser at 1280×800. `main.ts` closes the loop: it copies `game/` and `screenshots/` into the output, writes the dossier the judge reads, and re-checks the hand-in against the entry caps before calling it done.

## The 3D version

`game/index.html` is now a full 3D edition of the same city, built on a vendored copy of Three.js (r160) with no build step and no network calls: the same seven-by-seven street grid under a permanent sunset, the same four districts — Cactus Heights, Downtown Palms, Marina Mile, the Old Port — rebuilt as lit towers, palms and streetlamps, with Danny's car under a chase camera. The original top-down game is untouched and still playable from the 2D link on the title screen (`game/2d.html`).

Everything the 2D game does, the 3D edition now does in the third dimension, in `game/src3d/`:

- **Police & wanted** (`police.js`) — collisions, pedestrian scares, gunfire and mission crimes raise the same 0–5 stars; interceptors spawn at junctions, route along the streets and try to pin Danny, a bust meter fills while one is alongside and he is slow, and breaking line of sight lets the heat decay, exactly as in 2D.
- **Pedestrians** (`peds.js`) — low-poly walkers stroll the sidewalks, flee fast cars and gunfire, and dive clear (never under the wheels) if Danny gets it wrong, at the usual price of a star and a fine.
- **Drive-by combat** (`combat.js`) — aim with the mouse and click, or hold F: the Solana Kings cruise the Old Port in dark-purple cars, smoke as they take hits, bail out when disabled, and shoot back at Danny's car, whose health bar sits under the speedometer. Wreck it and he wakes at the Marina with a repair bill; get pinned and he pays the bust fine at the station instead.
- **Missions** (`missions.js`) — Marisol's chain under the gold waypoint pillar: lift the Old Port package to Cactus Heights, collect her red Solana GT and deliver it to the Marina garage, then outrun a three-star heat run against the clock — each job pays into the same cash total, and clearing the chain leaves the city in free roam.
- **Minimap, audio, save** (`minimap.js`, `audio.js`) — a live canvas minimap (streets, police in blue, Kings in purple, the waypoint in gold), a WebAudio synth for shots, sirens, cash and jingles with **M** to mute, and a localStorage save of cash and mission progress.

Controls are the 2D set plus the new keys: **W A S D** drive, **Space** handbrake, **mouse / F** fire, **T** take Marisol's job, **E** swap into the marked car, **M** mute. The four `?shot=` scenes still stage the same deterministic frames for screenshots — the live systems stand down while a scene is posed.
