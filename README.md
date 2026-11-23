[![make.fun entry](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)

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
