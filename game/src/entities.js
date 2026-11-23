// The moving things: the player on foot and every car, parked, driven or stolen. Factories make
// them, step functions move them one fixed step at a time. Cars are proper little physics bodies
// (velocity split into forward and lateral parts, the lateral part gripped away or, under the
// handbrake, kept as a drift); collisions are circles against building rectangles and circle
// pairs against other cars, resolved by pushing out and shedding the speed that hit.
import { CAR, CITY, PLAYER } from './config.js';
import { surfaceAt } from './world.js';

/** Palm City's showroom: name, size, pace and paint for every car model on the road. */
export const CAR_MODELS = [
  { name: 'Runabout', length: 50, width: 26, topSpeed: 305, reverseMax: 95, accel: 265, brake: 430, colors: ['#d96f4e', '#e9c46a', '#7fb069', '#6d8ea0', '#f4f1de'] },
  { name: 'Palmera Sedan', length: 56, width: 28, topSpeed: 345, reverseMax: 100, accel: 285, brake: 460, colors: ['#33526b', '#7a4a56', '#2e6f6a', '#c0c6cc', '#403d4f'] },
  { name: 'Solana GT', length: 54, width: 28, topSpeed: 435, reverseMax: 110, accel: 385, brake: 520, colors: ['#e63946', '#ffb703', '#118ab2', '#22223b', '#faedcd'] },
  { name: 'Bruto Pickup', length: 60, width: 31, topSpeed: 290, reverseMax: 90, accel: 245, brake: 420, colors: ['#606c38', '#8a5a44', '#495057', '#bc6c25', '#6b705c'] },
  { name: 'Vagabond Van', length: 62, width: 31, topSpeed: 262, reverseMax: 85, accel: 215, brake: 400, colors: ['#f4f1de', '#81b29a', '#e07a5f', '#3d405b', '#98c1d9'] },
];

export function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    cash: PLAYER.startCash,
    car: null,
    knockTimer: 0,
  };
}

export function createCar(modelIndex, colorIndex, x, y, angle) {
  const model = CAR_MODELS[modelIndex];
  const color = model.colors[colorIndex % model.colors.length];
  return {
    x, y, vx: 0, vy: 0, angle,
    model: modelIndex,
    color,
    radius: model.length * 0.34,
    driver: null, // null: nobody | 'player' | 'ai'
    parked: true,
    ai: null,
    everPlayer: false,
    steerVisual: 0,
  };
}

export function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

export function carForwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

/** True when the point (padded by `pad`) falls inside the car's rotated body. */
export function pointInCar(car, x, y, pad) {
  const model = CAR_MODELS[car.model];
  const cos = Math.cos(-car.angle);
  const sin = Math.sin(-car.angle);
  const dx = x - car.x;
  const dy = y - car.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= model.length / 2 + pad && Math.abs(localY) <= model.width / 2 + pad;
}

export function findNearestCar(cars, x, y, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const car of cars) {
    const distance = Math.hypot(car.x - x, car.y - y) - car.radius;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = car;
    }
  }
  return best;
}

/** Push a circle out of every building rectangle it touches; returns the impact speed shed. */
export function resolveCircleAgainstBuildings(city, body, radius) {
  let impact = 0;
  for (const building of city.buildings) {
    if (body.x + radius < building.x || body.x - radius > building.x + building.w
      || body.y + radius < building.y || body.y - radius > building.y + building.h) continue;
    const closestX = Math.max(building.x, Math.min(body.x, building.x + building.w));
    const closestY = Math.max(building.y, Math.min(body.y, building.y + building.h));
    let dx = body.x - closestX;
    let dy = body.y - closestY;
    let distance = Math.hypot(dx, dy);
    if (distance >= radius) continue;
    if (distance < 0.001) {
      // Centre inside the rectangle: leave by the nearest face.
      const left = body.x - building.x;
      const right = building.x + building.w - body.x;
      const top = body.y - building.y;
      const bottom = building.y + building.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) { dx = -1; dy = 0; body.x = building.x - radius; }
      else if (min === right) { dx = 1; dy = 0; body.x = building.x + building.w + radius; }
      else if (min === top) { dx = 0; dy = -1; body.y = building.y - radius; }
      else { dx = 0; dy = 1; body.y = building.y + building.h + radius; }
      distance = 1;
    } else {
      body.x = closestX + (dx / distance) * radius;
      body.y = closestY + (dy / distance) * radius;
      dx /= distance;
      dy /= distance;
    }
    const into = body.vx * dx + body.vy * dy;
    if (into < 0) {
      impact = Math.max(impact, -into);
      body.vx -= into * dx;
      body.vy -= into * dy;
    }
  }
  return impact;
}

/** The two body circles of a car, ahead of and behind its centre. */
function carCircles(car) {
  const model = CAR_MODELS[car.model];
  const spread = model.length * CAR.circleSpread;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return [
    { x: car.x + cos * spread, y: car.y + sin * spread },
    { x: car.x - cos * spread, y: car.y - sin * spread },
  ];
}

/**
 * Car against car, tested body circle against body circle (two per car, as in the building
 * test), so two cars passing in opposite lanes — centres closer than a car is long — do not
 * snag, while a nose into a flank still shoves both apart and trades their speed.
 */
function collideCars(cars, fx) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(b.x - a.x) > 90 || Math.abs(b.y - a.y) > 90) continue;
      const circlesA = carCircles(a);
      const circlesB = carCircles(b);
      const radiusA = CAR_MODELS[a.model].width * 0.56;
      const radiusB = CAR_MODELS[b.model].width * 0.56;
      const reach = radiusA + radiusB;
      for (const ca of circlesA) {
        for (const cb of circlesB) {
          const dx = cb.x - ca.x;
          const dy = cb.y - ca.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= reach || distance < 0.001) continue;
          const nx = dx / distance;
          const ny = dy / distance;
          const push = (reach - distance) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          ca.x -= nx * push;
          ca.y -= ny * push;
          cb.x += nx * push;
          cb.y += ny * push;
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative < 0) {
            const impulse = -relative * 0.62;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            if (relative < -130 && fx) {
              fx.addDust((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 7, 90);
              fx.addShake(Math.min(7, -relative / 45));
            }
          }
        }
      }
    }
  }
}

/**
 * Move the player on foot one step. `move` is the wanted direction (-1..1 per axis), `sprint`
 * swaps walk for sprint speed. Buildings and cars push back; a fast car knocks the player down
 * and costs health.
 */
export function stepPlayerOnFoot(player, dt, move, sprint, city, cars, fx) {
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const length = Math.hypot(move.x, move.y);
  const targetX = length > 0 ? (move.x / length) * speed : 0;
  const targetY = length > 0 ? (move.y / length) * speed : 0;
  const blend = Math.min(1, PLAYER.responsiveness * dt);
  if (player.knockTimer > 0) {
    player.knockTimer -= dt;
    player.vx *= 1 - Math.min(1, 4 * dt);
    player.vy *= 1 - Math.min(1, 4 * dt);
  } else {
    player.vx += (targetX - player.vx) * blend;
    player.vy += (targetY - player.vy) * blend;
  }
  if (length > 0 && player.knockTimer <= 0) player.angle = Math.atan2(move.y, move.x);
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  resolveCircleAgainstBuildings(city, player, player.radius);
  for (const car of cars) {
    if (!pointInCar(car, player.x, player.y, player.radius * 0.4)) continue;
    // Leave by the car's nearest side, keeping the position along its length, and take the
    // hit if it was moving fast.
    const cos = Math.cos(-car.angle);
    const sin = Math.sin(-car.angle);
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const side = localY >= 0 ? 1 : -1;
    const outX = -Math.sin(car.angle) * side;
    const outY = Math.cos(car.angle) * side;
    const model = CAR_MODELS[car.model];
    const outDistance = model.width / 2 + player.radius + 1;
    player.x = car.x + Math.cos(car.angle) * localX + outX * outDistance;
    player.y = car.y + Math.sin(car.angle) * localX + outY * outDistance;
    const speed = carSpeed(car);
    if (speed > 170 && player.knockTimer <= 0) {
      player.health = Math.max(0, player.health - 12);
      player.knockTimer = 0.9;
      player.vx = (car.vx / Math.max(1, speed)) * 260 + outX * 90;
      player.vy = (car.vy / Math.max(1, speed)) * 260 + outY * 90;
      if (fx) {
        fx.addDust(player.x, player.y, 8, 80);
        fx.addShake(5);
      }
    }
  }

  player.x = Math.max(player.radius, Math.min(city.width - player.radius, player.x));
  const wadeLimit = city.waterY + PLAYER.wadeDepth;
  player.y = Math.max(player.radius, Math.min(wadeLimit - player.radius, player.y));
}

/**
 * Move one car one step under `controls` ({throttle: -1..1, steer: -1..1, handbrake: bool}).
 * The same physics serves the player and every AI driver.
 */
export function stepCar(car, dt, controls, city, cars, fx) {
  const model = CAR_MODELS[car.model];
  const surface = surfaceAt(city, car.x, car.y);
  const surfaceFactor = surface === 'road' ? 1 : surface === 'sand' ? CAR.sandFactor : CAR.offroadFactor;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let forwardSpeed = car.vx * cos + car.vy * sin;
  let lateralX = car.vx - cos * forwardSpeed;
  let lateralY = car.vy - sin * forwardSpeed;

  // Steering bites in proportion to speed and flips in reverse, as a real wheel does.
  const steerAngle = controls.steer * CAR.maxSteerAngle * (controls.handbrake ? 1.2 : 1);
  car.angle += (forwardSpeed / (model.length * 0.82)) * Math.tan(steerAngle) * dt;
  car.steerVisual = controls.steer;

  const newCos = Math.cos(car.angle);
  const newSin = Math.sin(car.angle);
  // Re-express the kept velocity in the new heading before adding this step's forces.
  const keptForward = car.vx * newCos + car.vy * newSin;
  lateralX = car.vx - newCos * keptForward;
  lateralY = car.vy - newSin * keptForward;
  forwardSpeed = keptForward;

  if (controls.throttle > 0) {
    forwardSpeed += controls.throttle * model.accel * surfaceFactor * dt;
  } else if (controls.throttle < 0) {
    if (forwardSpeed > 6) forwardSpeed += controls.throttle * model.brake * dt;
    else forwardSpeed = Math.max(-model.reverseMax, forwardSpeed + controls.throttle * model.accel * 0.6 * dt);
  }
  if (controls.handbrake) {
    const decel = CAR.handbrakeDecel * dt;
    forwardSpeed = Math.abs(forwardSpeed) <= decel ? 0 : forwardSpeed - Math.sign(forwardSpeed) * decel;
  }
  forwardSpeed -= forwardSpeed * CAR.drag * dt;
  if (controls.throttle === 0 && !controls.handbrake) forwardSpeed -= forwardSpeed * 0.9 * dt;
  const topSpeed = model.topSpeed * surfaceFactor;
  forwardSpeed = Math.max(-model.reverseMax, Math.min(topSpeed, forwardSpeed));

  const keep = Math.pow(controls.handbrake ? CAR.handbrakeGripKeep : CAR.gripKeep, dt * 60);
  lateralX *= keep;
  lateralY *= keep;
  car.vx = newCos * forwardSpeed + lateralX;
  car.vy = newSin * forwardSpeed + lateralY;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Collisions: two body circles against the buildings and the water, then car against car.
  const circles = carCircles(car);
  let impact = 0;
  for (let k = 0; k < circles.length; k += 1) {
    const probe = { x: circles[k].x, y: circles[k].y, vx: car.vx, vy: car.vy };
    const hit = resolveCircleAgainstBuildings(city, probe, model.width * 0.56);
    if (hit > 0) {
      car.x += probe.x - circles[k].x;
      car.y += probe.y - circles[k].y;
      car.vx = probe.vx;
      car.vy = probe.vy;
      impact = Math.max(impact, hit);
      circles[k].x = probe.x;
      circles[k].y = probe.y;
    }
    if (probe.y > city.waterY + 4) {
      car.y -= probe.y - (city.waterY + 4);
      if (car.vy > 0) car.vy = 0;
      impact = Math.max(impact, 40);
    }
  }
  car.x = Math.max(24, Math.min(city.width - 24, car.x));
  car.y = Math.max(24, Math.min(city.waterY + 4, car.y));
  if (impact > 150 && fx) {
    fx.addDust(car.x, car.y, 9, 110);
    fx.addShake(Math.min(8, impact / 42));
    car.vx *= 0.55;
    car.vy *= 0.55;
  }

  // Tyres complain: sliding sideways or handbraking at speed leaves marks and dust.
  const lateralSpeed = Math.hypot(lateralX, lateralY);
  const rearX = car.x - newCos * model.length * 0.32;
  const rearY = car.y - newSin * model.length * 0.32;
  if (fx && (lateralSpeed > 85 || (controls.handbrake && Math.abs(forwardSpeed) > 120))) {
    fx.addSkid(rearX - newSin * 10, rearY + newCos * 10, car.angle);
    fx.addSkid(rearX + newSin * 10, rearY - newCos * 10, car.angle);
  }
  if (fx && surface !== 'road' && Math.abs(forwardSpeed) > 85) {
    fx.addDust(rearX, rearY, 1, 46);
  }
  return impact;
}

/** Settle every car's collisions with the others; called once per step after all cars move. */
export function settleCarCollisions(cars, fx) {
  collideCars(cars, fx);
}
