// Marisol Vega's jobs: a four-mission story arc delivered by phone. Steal a marked Solana GT
// and deliver it, run packages against the clock, wear three stars and shake them off, then
// clear the Solana Kings out of the Old Port and run for the coast. Each job marks its target
// in the world and on the minimap, pays in cash, and is remembered between visits; a job that
// ends in handcuffs, a hospital bed or an empty timer is offered again on the same phone.
import { MISSIONS, PALETTE } from './config.js';
import { createCar } from './entities.js';
import { createGangMember, gangRemaining } from './combat.js';
import { setWantedStars } from './police.js';

export const MISSION_DEFS = [
  { id: 'first-wheels', title: 'First Wheels' },
  { id: 'package-run', title: 'Package Run' },
  { id: 'heat', title: 'Heat' },
  { id: 'port-authority', title: 'Port Authority' },
];

const OFFER_TEXTS = [
  "Danny. Marisol. There's a job going and it pays $450. Answer if you're in.",
  "You drive like you mean it. Four packages need moving — $600. Interested?",
  "A different kind of job. Pays $750, and the PD will know your name after. Still in?",
  "Last one, and it's the big one: $1,200. The port. Answer carefully.",
];

const BRIEF_TEXTS = [
  "There's a red Solana GT parked in Cactus Heights with my name on it. Take it, and bring it to my garage in Marina Mile. Quietly.",
  'Four packages, four corners of Palm City, one clock. Pick them up in order — the yellow marker walks you through.',
  'Get three stars on your name — consider it done, I made a call — then disappear. No stars, no job. Shake them off.',
  'The Solana Kings are sitting on my port in the Old Port. Clear them out, then run for Seabreeze Drive. Do not stop.',
];

const DONE_TEXTS = [
  "She purrs. $450, wired. You're better than your reputation, Danny.",
  "All four, in time. $600. Don't spend it on parking tickets.",
  'Gone like smoke. $750. The radio chatter about you was almost flattering.',
];

const OUTRO_TEXT = "That's everything. The port's mine, the city's yours, and your phone stays quiet — until it doesn't. — M";

function showPhone(game, text, action, seconds) {
  game.missionState.phone = {
    from: 'MARISOL VEGA',
    text,
    action: action ?? null,
    expiresAt: action ? Infinity : game.time + (seconds ?? 8),
  };
  game.sound.play('phone');
}

function offerNext(game) {
  const index = game.missionState.nextIndex;
  if (index < MISSION_DEFS.length) showPhone(game, OFFER_TEXTS[index], 'accept');
}

export function createMissions(game) {
  game.missionState = {
    nextIndex: 0,
    active: null,
    phone: null,
    objectiveText: null,
  };
  game.objective = null;
  game.pickups = [];
  game.acceptMission = () => acceptMission(game);
  offerNext(game);
}

/** Marisol's garage in Marina Mile: a block corner south-east of Flamingo and Coral. */
function garageSpot(city) {
  return { x: city.vRoads[1].x + 92, y: city.hRoads[3].y + 92 };
}

/** The Old Port plaza where the Kings are sitting on Marisol's cargo. */
function fightSpot(city) {
  return { x: city.vRoads[5].x + 300, y: city.hRoads[3].y + 230 };
}

/** The Seabreeze Drive kerb the finale runs to, down in Marina Mile. */
function escapeSpot(city) {
  return { x: city.vRoads[1].x + 53, y: city.hRoads[city.hRoads.length - 1].y };
}

/** Four street corners, one in each district, for the package run. */
function packageSpots(city) {
  const v = city.vRoads;
  const h = city.hRoads;
  return [
    { x: v[0].x + 96, y: h[0].y + 96 },
    { x: v[5].x - 96, y: h[0].y + 96 },
    { x: v[2].x + 96, y: h[4].y - 96 },
    { x: v[6].x - 96, y: h[3].y + 96 },
  ];
}

/** Begin (or restart) mission `index`: stage its props, send the briefing, set it running. */
export function startMission(game, index) {
  const ms = game.missionState;
  const city = game.city;
  const previous = ms.active;
  if (previous && previous.targetCar && game.cars.includes(previous.targetCar)
    && game.player.car !== previous.targetCar) {
    game.cars.splice(game.cars.indexOf(previous.targetCar), 1);
  }
  if (index === 3) game.gang.length = 0;

  const active = { index, id: MISSION_DEFS[index].id, stage: 'start', failed: false, timer: 0, collected: 0, targetCar: null };
  if (index === 0) {
    const car = createCar(2, 0, city.vRoads[0].x + 53, city.hRoads[1].y + 210, -Math.PI / 2);
    car.missionTarget = true;
    game.cars.push(car);
    active.targetCar = car;
    active.stage = 'steal';
  } else if (index === 1) {
    active.stage = 'collect';
    active.timer = MISSIONS.packageSeconds;
    active.packages = packageSpots(city);
  } else if (index === 2) {
    active.stage = 'escape';
    setWantedStars(game, 3);
  } else if (index === 3) {
    active.stage = 'fight';
    const spot = fightSpot(city);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 + game.random() * 0.6;
      const radius = 84 + game.random() * 62;
      game.gang.push(createGangMember(game.random, spot.x + Math.cos(angle) * radius, spot.y + Math.sin(angle) * radius));
    }
  }
  ms.active = active;
  showPhone(game, BRIEF_TEXTS[index], null, 9);
}

/** The T key: take the offered job, or run a failed one again. */
export function acceptMission(game) {
  const ms = game.missionState;
  if (ms.active && ms.active.failed) {
    startMission(game, ms.active.index);
    return;
  }
  if (!ms.active && ms.phone && ms.phone.action === 'accept' && ms.nextIndex < MISSION_DEFS.length) {
    startMission(game, ms.nextIndex);
  }
}

function completeMission(game) {
  const ms = game.missionState;
  const index = ms.active.index;
  game.player.cash += MISSIONS.rewards[index];
  game.sound.play('complete');
  ms.active = null;
  ms.nextIndex = index + 1;
  game.objective = null;
  game.pickups = [];
  if (index === MISSION_DEFS.length - 1) {
    showPhone(game, OUTRO_TEXT, null, 12);
  } else {
    showPhone(game, `${DONE_TEXTS[index]} Next job's waiting when you are.`, 'accept');
  }
}

function failMission(game, reason) {
  const ms = game.missionState;
  ms.active.failed = true;
  game.objective = null;
  game.pickups = [];
  showPhone(game, `${reason} The job's still open — press T to run it again.`, 'retry');
}

/**
 * One step of the story: expire old messages, hear how the last arrest or hospital visit
 * ended the running job, and walk the active job's stages — markers, objectives, timers,
 * payoffs — through the world.
 */
export function stepMissions(game, dt) {
  const ms = game.missionState;
  const city = game.city;
  game.pickups = [];
  ms.objectiveText = null;

  if (ms.phone && ms.phone.action === null && game.time > ms.phone.expiresAt) ms.phone = null;

  if (game.lastOutcome) {
    const outcome = game.lastOutcome;
    game.lastOutcome = null;
    if (ms.active && !ms.active.failed) {
      failMission(game, outcome === 'busted' ? 'Busted.' : 'You woke up in Palm City General.');
    }
  }

  const active = ms.active;
  if (!active || active.failed) {
    game.objective = null;
    return;
  }
  const player = game.player;
  const focus = player.car ?? player;
  const mark = (point) => {
    game.objective = point;
    game.markers.push({ x: point.x, y: point.y, color: PALETTE.markerMission, pulse: true });
  };

  if (active.index === 0) {
    if (active.stage === 'steal') {
      ms.objectiveText = 'Steal the marked Solana GT — Cactus Heights';
      if (active.targetCar && game.cars.includes(active.targetCar)) mark(active.targetCar);
      if (player.car && player.car === active.targetCar) {
        active.stage = 'deliver';
        showPhone(game, "That's the one. My garage, Marina Mile — follow the yellow marker.", null, 6);
      }
    } else {
      const garage = garageSpot(city);
      ms.objectiveText = "Deliver the GT to Marisol's garage — Marina Mile";
      mark(garage);
      if (player.car && player.car === active.targetCar
        && Math.hypot(player.car.x - garage.x, player.car.y - garage.y) < MISSIONS.deliverRadius) {
        completeMission(game);
      }
    }
    return;
  }

  if (active.index === 1) {
    active.timer -= dt;
    if (active.timer <= 0) {
      failMission(game, 'Out of time.');
      return;
    }
    const target = active.packages[active.collected];
    ms.objectiveText = `Package run — ${active.collected}/${MISSIONS.packageCount} collected · ${Math.ceil(active.timer)}s left`;
    mark(target);
    for (let i = active.collected; i < active.packages.length; i += 1) game.pickups.push(active.packages[i]);
    if (Math.hypot(focus.x - target.x, focus.y - target.y) < MISSIONS.packageRadius) {
      active.collected += 1;
      game.sound.play('pickup');
      if (active.collected >= MISSIONS.packageCount) completeMission(game);
    }
    return;
  }

  if (active.index === 2) {
    ms.objectiveText = 'Lose the heat — break line of sight until the stars are gone';
    if (game.wanted.stars === 0) completeMission(game);
    return;
  }

  if (active.index === 3) {
    if (active.stage === 'fight') {
      const remaining = gangRemaining(game);
      ms.objectiveText = `Clear the Solana Kings out of the Old Port — ${remaining} still standing`;
      mark(fightSpot(city));
      if (remaining === 0) {
        active.stage = 'escape';
        showPhone(game, "Port's clear. Now run — Seabreeze Drive, the yellow marker. Go.", null, 7);
      }
    } else {
      const spot = escapeSpot(city);
      ms.objectiveText = 'Reach the escape marker on Seabreeze Drive';
      mark(spot);
      if (Math.hypot(focus.x - spot.x, focus.y - spot.y) < 74) completeMission(game);
    }
  }
}

/** The story's place in the save: jobs done, and the running job's outline if there is one. */
export function snapshotMissions(game) {
  const ms = game.missionState;
  return {
    nextIndex: ms.nextIndex,
    active: ms.active
      ? { index: ms.active.index, stage: ms.active.stage, collected: ms.active.collected || 0 }
      : null,
  };
}

/** Put the story back where a save left it: finished jobs stay finished, a running job restarts clean. */
export function restoreMissions(game, data) {
  const ms = game.missionState;
  if (!data || typeof data.nextIndex !== 'number') return;
  ms.nextIndex = Math.max(0, Math.min(MISSION_DEFS.length, data.nextIndex | 0));
  ms.active = null;
  ms.phone = null;
  if (data.active && typeof data.active.index === 'number' && data.active.index < MISSION_DEFS.length) {
    startMission(game, data.active.index);
    if (data.active.index === 1 && ms.active) {
      ms.active.collected = Math.max(0, Math.min(MISSIONS.packageCount - 1, data.active.collected | 0));
    }
  } else if (ms.nextIndex < MISSION_DEFS.length) {
    offerNext(game);
  }
}
