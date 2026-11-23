// The law: a wanted level priced in stars, crimes that only count when somebody sees them,
// and the Palm City PD's answer — interceptor cars that path across the road grid, ram and
// pin, and a bust meter that fills while a cop sits on a slow or foot-bound player. Getting
// caught costs a cut of the cash and a trip to the station; getting flattened costs a hospital
// fee instead. Both clear the stars. While no cop has line of sight the heat cools, one star
// at a time, until the force calls the hunt off.
import { PALETTE, POLICE } from './config.js';
import { segmentBlocked } from './world.js';
import { carForwardSpeed, createCar, stepCar, wrapAngle } from './entities.js';
import { createDriverBrain } from './traffic.js';

/** The building nearest a point: how the station and the hospital are picked out of the city. */
function buildingNear(city, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const building of city.buildings) {
    const cx = building.x + building.w / 2;
    const cy = building.y + building.h / 2;
    const distance = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = building;
    }
  }
  return best;
}

/** The spot on the sidewalk in front of a building, where a respawned player is set down. */
function frontOf(building) {
  return { x: building.x + building.w / 2, y: building.y + building.h + 30 };
}

/** The Palm City PD station: a Downtown Palms building, picked the same way for every seed. */
export function policeStationSpot(city) {
  return frontOf(buildingNear(city, city.width * 0.6, city.height * 0.3));
}

/** Palm City General: the hospital in Marina Mile where the wasted wake up. */
export function hospitalSpot(city) {
  return frontOf(buildingNear(city, city.width * 0.3, city.height * 0.72));
}

export function createPolice(game) {
  game.wanted = { stars: 0, bust: 0, hiddenTime: 0, cooldowns: {} };
  game.cops = [];
  game.policeState = {
    spawnTimer: 0,
    station: policeStationSpot(game.city),
    hospital: hospitalSpot(game.city),
  };
}

/**
 * Price a crime in stars — but only if it was seen. A pedestrian or a driver inside the
 * crime's witness radius counts, and so does a cop from much further off (radios, dashcams).
 * Returns whether the crime landed on the player's record.
 */
export function reportCrime(game, kind, x, y) {
  const wanted = game.wanted;
  if (!wanted || game.over) return false;
  const rule = POLICE.crimes[kind];
  if (!rule) return false;
  if (wanted.cooldowns[kind] && game.time < wanted.cooldowns[kind]) return false;
  let witnessed = false;
  if (kind === 'copHit') {
    // The victim is the witness: a struck patrol car radios it in itself.
    for (const cop of game.cops) {
      if (Math.hypot(cop.x - x, cop.y - y) < 520) { witnessed = true; break; }
    }
  } else {
    for (const ped of game.peds) {
      if (Math.hypot(ped.x - x, ped.y - y) < rule.witness) { witnessed = true; break; }
    }
    if (!witnessed) {
      for (const car of game.cars) {
        if (car.driver === 'ai' && Math.hypot(car.x - x, car.y - y) < rule.witness) { witnessed = true; break; }
        if (car.cop && Math.hypot(car.x - x, car.y - y) < POLICE.copWitness) { witnessed = true; break; }
      }
    }
  }
  if (!witnessed) return false;
  wanted.cooldowns[kind] = game.time + rule.cooldown;
  wanted.stars = Math.min(POLICE.maxStars, wanted.stars + rule.stars);
  wanted.hiddenTime = 0;
  return true;
}

/** Set the wanted level directly (mission scripts, restores); zero stands the force down. */
export function setWantedStars(game, stars) {
  const wanted = game.wanted;
  wanted.stars = Math.max(0, Math.min(POLICE.maxStars, stars | 0));
  wanted.hiddenTime = 0;
  if (wanted.stars === 0) {
    wanted.bust = 0;
    for (let i = game.cops.length - 1; i >= 0; i -= 1) releaseCop(game, game.cops[i]);
  }
}

/** A traffic brain for a car wherever it currently sits, so a stood-down cop can drive off. */
function brainFromPosition(city, random, car) {
  const horizontal = Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle));
  if (horizontal) {
    let road = 0;
    for (let i = 0; i < city.hRoads.length; i += 1) {
      if (Math.abs(city.hRoads[i].y - car.y) < Math.abs(city.hRoads[road].y - car.y)) road = i;
    }
    const dir = Math.cos(car.angle) >= 0 ? 1 : -1;
    let cross = 0;
    for (let i = 0; i < city.vRoads.length; i += 1) {
      if (Math.abs(city.vRoads[i].x - car.x) < Math.abs(city.vRoads[cross].x - car.x)) cross = i;
    }
    cross = Math.max(0, Math.min(city.vRoads.length - 1, cross + dir));
    return createDriverBrain(city, random, 'h', road, cross, dir);
  }
  let road = 0;
  for (let i = 0; i < city.vRoads.length; i += 1) {
    if (Math.abs(city.vRoads[i].x - car.x) < Math.abs(city.vRoads[road].x - car.x)) road = i;
  }
  const dir = Math.sin(car.angle) >= 0 ? 1 : -1;
  let cross = 0;
  for (let i = 0; i < city.hRoads.length; i += 1) {
    if (Math.abs(city.hRoads[i].y - car.y) < Math.abs(city.hRoads[cross].y - car.y)) cross = i;
  }
  cross = Math.max(0, Math.min(city.hRoads.length - 1, cross + dir));
  return createDriverBrain(city, random, 'v', road, cross, dir);
}

/** Stand one patrol car down: it becomes ordinary traffic and drives away into the city. */
function releaseCop(game, car) {
  const index = game.cops.indexOf(car);
  if (index >= 0) game.cops.splice(index, 1);
  if (car.driver === 'cop') {
    car.cop = false;
    car.driver = 'ai';
    car.parked = false;
    car.ai = brainFromPosition(game.city, game.random, car);
  }
}

/** Put a fresh interceptor on the street at a chosen spot, already rolling. */
export function spawnPoliceCar(game, x, y, angle) {
  const car = createCar(2, 0, x, y, angle);
  car.color = PALETTE.copBody;
  car.cop = true;
  car.driver = 'cop';
  car.parked = false;
  car.lightPhase = game.random() * 2;
  car.pursuit = { reverseTimer: 0, stuckTimer: 0 };
  car.vx = Math.cos(angle) * 150;
  car.vy = Math.sin(angle) * 150;
  game.cars.push(car);
  game.cops.push(car);
  return car;
}

/** Join the hunt from a junction ring around the player: near enough to matter, off camera. */
function spawnPursuitCop(game) {
  const city = game.city;
  const focus = game.player.car ?? game.player;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const v = Math.floor(game.random() * city.vRoads.length);
    const h = Math.floor(game.random() * city.hRoads.length);
    const x = city.vRoads[v].x;
    const y = city.hRoads[h].y;
    const distance = Math.hypot(x - focus.x, y - focus.y);
    if (distance < POLICE.spawnMin || distance > POLICE.spawnMax) continue;
    let blocked = false;
    for (const other of game.cars) {
      if (Math.hypot(other.x - x, other.y - y) < 80) { blocked = true; break; }
    }
    if (blocked) continue;
    // Roll out along whichever road heads most toward the player.
    const toward = Math.atan2(focus.y - y, focus.x - x);
    const snap = Math.round(toward / (Math.PI / 2)) * (Math.PI / 2);
    spawnPoliceCar(game, x, y, snap);
    return;
  }
}

/**
 * Drive one interceptor for one step: aim at where the player is heading, and when a building
 * blocks the line, aim at the junction nearest the player instead — the grid does the
 * pathfinding. Close in, the orders are ram and pin; wedged, reverse out and come again.
 */
function driveCop(game, cop, dt) {
  const city = game.city;
  const focus = game.player.car ?? game.player;
  const pursuit = cop.pursuit;
  if (pursuit.reverseTimer > 0) {
    pursuit.reverseTimer -= dt;
    const diff = wrapAngle(Math.atan2(focus.y - cop.y, focus.x - cop.x) - cop.angle);
    stepCar(cop, dt, { throttle: -0.85, steer: Math.max(-1, Math.min(1, -diff * 2.4)), handbrake: false }, city, game.cars, game.fx);
    return;
  }
  let targetX = focus.x + focus.vx * 0.32;
  let targetY = focus.y + focus.vy * 0.32;
  if (segmentBlocked(city, cop.x, cop.y, targetX, targetY)) {
    let bestX = city.vRoads[0].x;
    let bestY = city.hRoads[0].y;
    let bestDistance = Infinity;
    for (const road of city.vRoads) {
      for (const street of city.hRoads) {
        const distance = (road.x - focus.x) * (road.x - focus.x) + (street.y - focus.y) * (street.y - focus.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = road.x;
          bestY = street.y;
        }
      }
    }
    targetX = bestX;
    targetY = bestY;
  }
  const diff = wrapAngle(Math.atan2(targetY - cop.y, targetX - cop.x) - cop.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  const forwardSpeed = carForwardSpeed(cop);
  const distance = Math.hypot(focus.x - cop.x, focus.y - cop.y);
  const focusSpeed = Math.hypot(focus.vx, focus.vy);
  const targetSpeed = distance > 230 ? 999 : focusSpeed + 60;
  let throttle = Math.max(-1, Math.min(1, (targetSpeed - forwardSpeed) / 55));
  if (forwardSpeed > targetSpeed + 40) throttle = -0.8;
  stepCar(cop, dt, { throttle, steer, handbrake: false }, city, game.cars, game.fx);
  if (Math.abs(forwardSpeed) < 14 && throttle > 0.25) {
    pursuit.stuckTimer += dt;
    if (pursuit.stuckTimer > 1.1) {
      pursuit.stuckTimer = 0;
      pursuit.reverseTimer = 0.7;
    }
  } else {
    pursuit.stuckTimer = Math.max(0, pursuit.stuckTimer - dt * 2);
  }
}

/** Caught or flattened: put the card up; the respawn happens when its timer runs out. */
function startOver(game, kind) {
  game.over = { kind, timer: POLICE.overSeconds };
  game.sound.play(kind);
  if (game.player.car) {
    game.player.car.vx *= 0.3;
    game.player.car.vy *= 0.3;
  }
}

/** Serve the sentence: fee taken, stars cleared, player set down at the station or hospital. */
function respawn(game, kind) {
  const player = game.player;
  const spot = kind === 'busted' ? game.policeState.station : game.policeState.hospital;
  if (player.car) {
    player.car.driver = null;
    player.car.parked = true;
    player.car.ai = null;
    player.car = null;
  }
  const rate = kind === 'busted' ? POLICE.bustFeeRate : POLICE.wastedFeeRate;
  const floor = kind === 'busted' ? POLICE.bustFeeMin : POLICE.wastedFeeMin;
  const fee = Math.min(player.cash, Math.max(floor, Math.round(player.cash * rate)));
  player.cash -= fee;
  player.x = spot.x;
  player.y = spot.y;
  player.vx = 0;
  player.vy = 0;
  player.angle = Math.PI / 2;
  player.health = 100;
  player.knockTimer = 0;
  game.hurtFlash = 0;
  setWantedStars(game, 0);
  game.over = null;
  game.lastOutcome = kind;
  game.camera.x = spot.x;
  game.camera.y = spot.y;
}

/**
 * One step of the law: count the crimes the street reported, keep the hunt at strength, drive
 * the interceptors, watch the bust meter, cool the heat when nobody is watching, and run the
 * busted/wasted cards through to their respawns.
 */
export function stepPolice(game, dt) {
  const wanted = game.wanted;
  const player = game.player;

  if (game.over) {
    game.over.timer -= dt;
    for (const cop of game.cops) {
      cop.vx *= Math.max(0, 1 - 5 * dt);
      cop.vy *= Math.max(0, 1 - 5 * dt);
    }
    if (game.over.timer <= 0) respawn(game, game.over.kind);
    return;
  }

  // Flattened, by traffic, bullets or a wall: the hospital decides what happens next.
  if (player.health <= 0 && !game.cinematic) {
    startOver(game, 'wasted');
    return;
  }

  // A pedestrian the player's car put down is a crime, once per fall.
  for (const ped of game.peds) {
    if (ped.state === 'down' && ped.downBy === 'player' && !ped.crimeCounted) {
      ped.crimeCounted = true;
      reportCrime(game, 'pedHit', ped.x, ped.y);
    }
  }

  // Drop patrol cars the player has taken over or that have left the world.
  for (let i = game.cops.length - 1; i >= 0; i -= 1) {
    const cop = game.cops[i];
    if (cop.driver !== 'cop' || !game.cars.includes(cop)) game.cops.splice(i, 1);
  }

  const focus = player.car ?? player;
  if (wanted.stars > 0) {
    const desired = POLICE.copsByStars[wanted.stars - 1];
    game.policeState.spawnTimer -= dt;
    if (game.cops.length < desired && game.policeState.spawnTimer <= 0) {
      game.policeState.spawnTimer = POLICE.spawnCooldown;
      spawnPursuitCop(game);
    }
    while (game.cops.length > desired) {
      let farthest = null;
      let farthestDistance = -1;
      for (const cop of game.cops) {
        const distance = Math.hypot(cop.x - focus.x, cop.y - focus.y);
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthest = cop;
        }
      }
      releaseCop(game, farthest);
    }
  }

  let nearestCop = Infinity;
  let seen = false;
  for (const cop of game.cops) {
    driveCop(game, cop, dt);
    const distance = Math.hypot(cop.x - focus.x, cop.y - focus.y);
    if (distance < nearestCop) nearestCop = distance;
    if (distance < POLICE.sightRange && !segmentBlocked(game.city, cop.x, cop.y, focus.x, focus.y)) seen = true;
    game.markers.push({
      x: cop.x,
      y: cop.y,
      color: Math.floor(game.time * 2.4 + (cop.lightPhase || 0)) % 2 === 0 ? PALETTE.markerCopRed : PALETTE.markerCopBlue,
      pulse: false,
    });
  }

  // The heat cools only while nobody in uniform can see the player.
  if (wanted.stars > 0) {
    if (seen) {
      wanted.hiddenTime = 0;
    } else {
      wanted.hiddenTime += dt;
      if (wanted.hiddenTime >= POLICE.decaySeconds) {
        wanted.hiddenTime = 0;
        setWantedStars(game, wanted.stars - 1);
      }
    }
  }

  // The bust meter: a cop alongside a player who cannot get away is an arrest in progress.
  if (wanted.stars > 0 && game.cops.length > 0) {
    const focusSpeed = Math.hypot(focus.vx, focus.vy);
    let fill = 0;
    if (!player.car && nearestCop < POLICE.bustRangeFoot) fill = POLICE.bustFillFoot;
    else if (player.car && focusSpeed < POLICE.bustSpeed && nearestCop < POLICE.bustRangeCar) fill = POLICE.bustFillSlowCar;
    if (fill > 0) wanted.bust = Math.min(1, wanted.bust + fill * dt);
    else wanted.bust = Math.max(0, wanted.bust - POLICE.bustDrain * dt);
    if (wanted.bust >= 1 && !game.cinematic) {
      startOver(game, 'busted');
    }
  } else {
    wanted.bust = Math.max(0, wanted.bust - POLICE.bustDrain * dt);
  }
}
