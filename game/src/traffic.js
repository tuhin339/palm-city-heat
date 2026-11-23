// The city's life: traffic that drives itself and pedestrians who stroll the sidewalks. A
// driver "brain" is a small route state (which road, which way, which junction is next) that
// turns into throttle and steering each step; the same brain drives the AI cars and, through
// game.js, the screenshot autopilot. The traffic manager keeps a bubble of cars and walkers
// alive around the player and quietly retires the ones left far behind.
import { PALETTE, TRAFFIC } from './config.js';
import { laneCenter } from './world.js';
import { CAR_MODELS, carForwardSpeed, createCar, pointInCar, stepCar, wrapAngle } from './entities.js';

/**
 * A route through the grid: on `axis` ('v' avenue or 'h' street) number `road`, heading `dir`,
 * aiming for the junction with cross-road number `cross`. The target point sits in the correct
 * lane for the heading, so a car lines itself up for the junction as it approaches.
 */
export function createDriverBrain(city, random, axis, road, cross, dir) {
  return {
    axis,
    road,
    cross,
    dir,
    cruise: TRAFFIC.cruiseMin + random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin),
    stuckTimer: 0,
    blockedTimer: 0,
    reverseTimer: 0,
  };
}

function brainTarget(city, brain) {
  if (brain.axis === 'v') {
    return { x: laneCenter(city, 'v', brain.road, brain.dir), y: city.hRoads[brain.cross].y };
  }
  return { x: city.vRoads[brain.cross].x, y: laneCenter(city, 'h', brain.road, brain.dir) };
}

/** Choose the heading after this junction: straight on, a turn, or (at the grid's edge) back. */
function chooseNextLeg(city, random, brain) {
  const crossCount = brain.axis === 'v' ? city.hRoads.length : city.vRoads.length;
  const ahead = brain.cross + brain.dir;
  const options = [];
  if (ahead >= 0 && ahead < crossCount) options.push('straight', 'straight');
  options.push('left', 'right');
  const pick = options[Math.floor(random() * options.length)];
  if (pick === 'straight') {
    brain.cross = ahead;
    return;
  }
  // A turn swaps the axes: the road we were crossing becomes the road we drive, and the road
  // we were on becomes the next junction to aim for. Left and right are the driver's own:
  // north turns left to west, east turns left to north, and so on round the compass.
  const turnSign = pick === 'left' ? -1 : 1;
  const newDir = brain.axis === 'v' ? -brain.dir * turnSign : brain.dir * turnSign;
  const oldRoad = brain.road;
  brain.road = brain.cross;
  brain.cross = oldRoad;
  brain.axis = brain.axis === 'v' ? 'h' : 'v';
  brain.dir = newDir;
  // cross names the junction we are AT until it is stepped to the next one along the new
  // road: without this the target stays on the junction behind and the car dithers on it.
  const count = brain.axis === 'v' ? city.hRoads.length : city.vRoads.length;
  let next = brain.cross + brain.dir;
  if (next < 0 || next >= count) {
    // The turn points off the grid (a corner junction): go back the way we came instead.
    brain.dir = -brain.dir;
    next = brain.cross + brain.dir;
  }
  brain.cross = next;
}

/** Anything solid in the braking zone ahead: another car, or the player on foot. */
function obstacleAhead(game, car, brakeDistance) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 4 && ahead < brakeDistance + other.radius && Math.abs(side) < 26) return true;
  }
  const player = game.player;
  if (!player.car) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 4 && ahead < brakeDistance && Math.abs(side) < 26) return true;
  }
  for (const ped of game.peds) {
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (ahead > 4 && ahead < brakeDistance * 0.8 && Math.abs(side) < 24) return true;
  }
  return false;
}

/**
 * Drive one car by its brain for one step: steer for the junction ahead, manage speed for the
 * corner and for traffic in the way, and pick the next leg on arrival. Returns the controls
 * used, so the autopilot and AI share exactly one driver.
 */
export function driveBrain(city, random, brain, car, game, dt) {
  const target = brainTarget(city, brain);
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = wrapAngle(desired - car.angle);
  const forwardSpeed = carForwardSpeed(car);
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  // Wedged against something the brake will not clear: back out, swing the nose round, and
  // take the junction again from a better angle, as a driver does.
  if (brain.reverseTimer > 0) {
    brain.reverseTimer -= dt;
    const controls = { throttle: -0.85, steer: -steer, handbrake: false };
    stepCar(car, dt, controls, city, game.cars, game.fx);
    return controls;
  }
  let targetSpeed = brain.cruise * (1 - Math.min(1, Math.abs(diff) / 1.5) * 0.55);
  const brakeDistance = 52 + Math.max(0, forwardSpeed) * 0.5;
  const blocked = obstacleAhead(game, car, brakeDistance);
  if (blocked && Math.abs(forwardSpeed) < 12) {
    brain.blockedTimer += dt;
    if (brain.blockedTimer > 0.9) {
      brain.blockedTimer = 0;
      brain.reverseTimer = 0.75;
    }
  } else {
    brain.blockedTimer = Math.max(0, brain.blockedTimer - dt * 2);
  }
  let throttle;
  if (blocked) {
    targetSpeed = 0;
    throttle = forwardSpeed > 24 ? -1 : forwardSpeed < -2 ? 0.4 : 0;
    if (forwardSpeed <= 24 && forwardSpeed >= -2) throttle = 0;
  } else {
    throttle = Math.max(-1, Math.min(1, (targetSpeed - forwardSpeed) / 55));
    if (forwardSpeed > targetSpeed + 30) throttle = -0.7;
  }
  const controls = { throttle, steer, handbrake: false };
  stepCar(car, dt, controls, city, game.cars, game.fx);

  const distance = Math.hypot(target.x - car.x, target.y - car.y);
  if (distance < 58) chooseNextLeg(city, random, brain);
  if (Math.abs(forwardSpeed) < 9 && throttle >= 0) brain.stuckTimer += dt;
  else brain.stuckTimer = 0;
  if (brain.stuckTimer > 2.6) {
    // Boxed in by traffic or a wall: turn around and take the leg back.
    brain.stuckTimer = 0;
    brain.dir = -brain.dir;
    brain.cross += brain.dir;
    const count = brain.axis === 'v' ? city.hRoads.length : city.vRoads.length;
    if (brain.cross < 0 || brain.cross >= count) brain.cross -= brain.dir * 2;
  }
  return controls;
}

/** A pedestrian: a point on a block's sidewalk ring with somewhere to wander to. */
export function createPedestrian(city, random, x, y) {
  const ped = {
    x, y, vx: 0, vy: 0,
    angle: random() * Math.PI * 2,
    speed: 46 + random() * 26,
    state: 'walk', // 'walk' | 'flee' | 'down'
    timer: 0,
    downBy: null, // 'player' | 'other' once a car has put this walker down
    crimeCounted: false,
    block: null,
    targetX: x,
    targetY: y,
    shirt: PALETTE.pedShirts[Math.floor(random() * PALETTE.pedShirts.length)],
    skin: ['#e8b08a', '#c68863', '#8d5a3b', '#f1c27d'][Math.floor(random() * 4)],
  };
  pickPedestrianTarget(city, random, ped);
  return ped;
}

/** Send a pedestrian to another point on a block's sidewalk ring, sometimes across the street. */
export function pickPedestrianTarget(city, random, ped) {
  let block = ped.block;
  if (block === null || random() < 0.3) {
    const near = [];
    for (const candidate of city.blocks) {
      const cx = candidate.x + candidate.w / 2;
      const cy = candidate.y + candidate.h / 2;
      if (Math.hypot(cx - ped.x, cy - ped.y) < 720) near.push(candidate);
    }
    if (near.length > 0) block = near[Math.floor(random() * near.length)];
  }
  if (block === null) return;
  ped.block = block;
  const inset = 13;
  const side = Math.floor(random() * 4);
  const t = random();
  if (side === 0) { ped.targetX = block.x + inset + t * (block.w - inset * 2); ped.targetY = block.y + inset; }
  else if (side === 1) { ped.targetX = block.x + inset + t * (block.w - inset * 2); ped.targetY = block.y + block.h - inset; }
  else if (side === 2) { ped.targetX = block.x + inset; ped.targetY = block.y + inset + t * (block.h - inset * 2); }
  else { ped.targetX = block.x + block.w - inset; ped.targetY = block.y + inset + t * (block.h - inset * 2); }
}

function stepPedestrian(game, random, ped, dt) {
  ped.timer -= dt;
  // Danger sense: a fast or very close car sends a walker running from it.
  let threat = null;
  let threatDistance = Infinity;
  for (const car of game.cars) {
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.hypot(car.vx, car.vy);
    if ((distance < 52 && speed > 55) || (distance < 105 && speed > 215)) {
      if (distance < threatDistance) {
        threatDistance = distance;
        threat = car;
      }
    }
  }
  if (ped.state !== 'down') {
    if (threat !== null) {
      ped.state = 'flee';
      ped.timer = 1.6;
      ped.fleeX = ped.x - threat.x;
      ped.fleeY = ped.y - threat.y;
    } else if (ped.state === 'flee' && ped.timer <= 0) {
      ped.state = 'walk';
      pickPedestrianTarget(game.city, random, ped);
    }
  }

  let wantedX = 0;
  let wantedY = 0;
  let wantedSpeed = ped.speed;
  if (ped.state === 'flee') {
    const length = Math.hypot(ped.fleeX, ped.fleeY) || 1;
    wantedX = ped.fleeX / length;
    wantedY = ped.fleeY / length;
    wantedSpeed = 138;
  } else if (ped.state === 'walk') {
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 9) {
      pickPedestrianTarget(game.city, random, ped);
    } else {
      wantedX = dx / distance;
      wantedY = dy / distance;
    }
  }
  if (ped.state !== 'down') {
    ped.vx += (wantedX * wantedSpeed - ped.vx) * Math.min(1, 10 * dt);
    ped.vy += (wantedY * wantedSpeed - ped.vy) * Math.min(1, 10 * dt);
    if (wantedX !== 0 || wantedY !== 0) ped.angle = Math.atan2(ped.vy, ped.vx);
  } else {
    ped.vx = 0;
    ped.vy = 0;
    if (ped.timer <= 0) ped.state = 'flee';
  }
  ped.x += ped.vx * dt;
  ped.y += ped.vy * dt;
  ped.x = Math.max(10, Math.min(game.city.width - 10, ped.x));
  ped.y = Math.max(10, Math.min(game.city.waterY - 6, ped.y));

  // Stepped into the road at the wrong moment: down, then up and running.
  if (ped.state !== 'down') {
    for (const car of game.cars) {
      if (Math.hypot(car.vx, car.vy) > 60 && pointInCar(car, ped.x, ped.y, 2)) {
        ped.state = 'down';
        ped.timer = 1.3;
        // Who did it: the police price a fall the player caused, once per fall.
        ped.downBy = car.driver === 'player' ? 'player' : 'other';
        ped.crimeCounted = false;
        if (game.fx) game.fx.addDust(ped.x, ped.y, 5, 60);
        break;
      }
    }
  }
}

/** Spawn one traffic car on a junction ring around the player, already rolling in its lane. */
function spawnTrafficCar(game, random) {
  const city = game.city;
  const player = game.player;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const axis = random() < 0.5 ? 'v' : 'h';
    const roadCount = axis === 'v' ? city.vRoads.length : city.hRoads.length;
    const crossCount = axis === 'v' ? city.hRoads.length : city.vRoads.length;
    const road = Math.floor(random() * roadCount);
    const junction = Math.floor(random() * crossCount);
    const jx = axis === 'v' ? city.vRoads[road].x : city.vRoads[junction].x;
    const jy = axis === 'v' ? city.hRoads[junction].y : city.hRoads[road].y;
    const distance = Math.hypot(jx - player.x, jy - player.y);
    if (distance < TRAFFIC.spawnMin || distance > TRAFFIC.spawnMax) continue;
    let dir = random() < 0.5 ? -1 : 1;
    let cross = junction + dir;
    if (cross < 0 || cross >= crossCount) {
      dir = -dir;
      cross = junction + dir;
    }
    const brain = createDriverBrain(city, random, axis, road, cross, dir);
    const x = axis === 'v' ? laneCenter(city, 'v', road, brain.dir) : jx;
    const y = axis === 'v' ? jy : laneCenter(city, 'h', road, brain.dir);
    let blocked = false;
    for (const other of game.cars) {
      if (Math.hypot(other.x - x, other.y - y) < 74) { blocked = true; break; }
    }
    if (blocked) continue;
    const model = Math.floor(random() * CAR_MODELS.length);
    const color = Math.floor(random() * CAR_MODELS[model].colors.length);
    const angle = axis === 'v' ? (brain.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (brain.dir < 0 ? Math.PI : 0);
    const car = createCar(model, color, x, y, angle);
    car.driver = 'ai';
    car.parked = false;
    car.ai = brain;
    car.vx = Math.cos(angle) * 120;
    car.vy = Math.sin(angle) * 120;
    game.cars.push(car);
    return;
  }
}

function spawnPedestrian(game, random) {
  const city = game.city;
  const player = game.player;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const block = city.blocks[Math.floor(random() * city.blocks.length)];
    const inset = 13;
    const x = block.x + inset + random() * (block.w - inset * 2);
    const y = block.y + inset + random() * (block.h - inset * 2);
    const distance = Math.hypot(x - player.x, y - player.y);
    if (distance < TRAFFIC.pedSpawnMin || distance > TRAFFIC.pedSpawnMax) continue;
    const ped = createPedestrian(city, random, x, y);
    ped.block = block;
    pickPedestrianTarget(city, random, ped);
    game.peds.push(ped);
    return;
  }
}

/**
 * Keep the bubble alive for one step: drive the AI cars, walk the pedestrians, retire whatever
 * drifted too far from the player and top the counts back up.
 */
export function stepTraffic(game, random, dt) {
  const player = game.player;
  const focusX = player.car ? player.car.x : player.x;
  const focusY = player.car ? player.car.y : player.y;

  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.driver !== 'ai') continue;
    if (Math.hypot(car.x - focusX, car.y - focusY) > TRAFFIC.despawn) {
      game.cars.splice(i, 1);
      continue;
    }
    driveBrain(game.city, random, car.ai, car, game, dt);
  }
  let aiCount = 0;
  for (const car of game.cars) if (car.driver === 'ai') aiCount += 1;
  if (aiCount < TRAFFIC.targetCars) {
    spawnTrafficCar(game, random);
    if (aiCount + 1 < TRAFFIC.targetCars) spawnTrafficCar(game, random);
  }

  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    if (Math.hypot(ped.x - focusX, ped.y - focusY) > TRAFFIC.pedDespawn) {
      game.peds.splice(i, 1);
      continue;
    }
    stepPedestrian(game, random, ped, dt);
  }
  if (game.peds.length < TRAFFIC.targetPeds) {
    spawnPedestrian(game, random);
    if (game.peds.length + 1 < TRAFFIC.targetPeds) spawnPedestrian(game, random);
  }
}
