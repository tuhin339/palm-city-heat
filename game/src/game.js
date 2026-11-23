// The whole game as one state: the city, the player, every car and pedestrian, the camera, the
// clock and the effects. createGame builds it from a seed; step() advances it one fixed step
// under a controls object ({moveX, moveY, sprint, throttle, steer, handbrake}) that main.js
// fills from the keyboard and shots.js fills from the autopilot, so the live game and the
// screenshot scenes run the very same rules. Session 2 hangs police, combat and missions off
// this state: `markers` is already drawn by the minimap, `wanted` and `heat` are theirs to use.
import { CLOCK, TRAFFIC, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createCity, districtAt } from './world.js';
import {
  CAR_MODELS, createCar, createPlayer, findNearestCar, settleCarCollisions, stepCar, stepPlayerOnFoot,
} from './entities.js';
import { createDriverBrain, createPedestrian, driveBrain, pickPedestrianTarget, stepTraffic } from './traffic.js';

const SKID_LIMIT = 520;
const DUST_LIMIT = 260;
const SKID_LIFE = 26;

export const IDLE_CONTROLS = { moveX: 0, moveY: 0, sprint: false, throttle: 0, steer: 0, handbrake: false };

export function createGame(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const player = createPlayer(city.playerSpawn.x, city.playerSpawn.y);

  const cars = [];
  for (const spot of city.parked) {
    const model = spot.model >= 0 ? spot.model : Math.floor(random() * CAR_MODELS.length);
    const color = spot.color >= 0 ? spot.color : Math.floor(random() * CAR_MODELS[model].colors.length);
    cars.push(createCar(model, color, spot.x, spot.y, spot.angle));
  }

  const game = {
    seed,
    random,
    city,
    player,
    cars,
    peds: [],
    markers: [], // extra minimap markers ({x, y, color, pulse}) for missions and police
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    camera: { x: player.x, y: player.y },
    cameraPan: false,
    shake: 0,
    autopilot: false,
    autopilotBrain: null,
    stats: { carsStolen: 0, distanceDriven: 0, timePlayed: 0, topSpeed: 0 },
    fx: null,
    step,
    tryEnterExitCar,
    currentDistrict,
    serialize,
    restore,
  };

  const skids = [];
  const dust = [];
  game.fx = {
    skids,
    dust,
    addSkid(x, y, angle) {
      skids.push({ x, y, angle, life: SKID_LIFE });
      if (skids.length > SKID_LIMIT) skids.splice(0, skids.length - SKID_LIMIT);
    },
    addDust(x, y, count, power) {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const speed = power * (0.35 + random() * 0.75);
        dust.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.55 + random() * 0.6,
          size: 3 + random() * 6,
        });
      }
      if (dust.length > DUST_LIMIT) dust.splice(0, dust.length - DUST_LIMIT);
    },
    addShake(amount) {
      game.shake = Math.min(9, Math.max(game.shake, amount));
    },
  };

  function currentDistrict() {
    const focus = player.car ?? player;
    return districtAt(city, focus.x, focus.y);
  }

  function stepFx(dt) {
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    for (let i = dust.length - 1; i >= 0; i -= 1) {
      const puff = dust[i];
      puff.life -= dt;
      if (puff.life <= 0) {
        dust.splice(i, 1);
        continue;
      }
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.vx *= 1 - Math.min(1, 2.4 * dt);
      puff.vy *= 1 - Math.min(1, 2.4 * dt);
    }
  }

  function stepCamera(dt) {
    if (game.cameraPan) {
      const t = game.time;
      game.camera.x = city.width / 2 + Math.sin(t * 0.045) * 1050;
      game.camera.y = city.height / 2 + Math.sin(t * 0.031 + 1.2) * 780;
    } else {
      const focus = player.car ?? player;
      const blend = Math.min(1, dt * 4.5);
      game.camera.x += (focus.x - game.camera.x) * blend;
      game.camera.y += (focus.y - game.camera.y) * blend;
    }
    game.camera.x = Math.max(VIEW.width / 2, Math.min(city.width - VIEW.width / 2, game.camera.x));
    game.camera.y = Math.max(VIEW.height / 2, Math.min(city.height - VIEW.height / 2, game.camera.y));
    game.shake = Math.max(0, game.shake - dt * 16);
  }

  function step(dt, controls) {
    game.time += dt;
    game.stats.timePlayed += dt;
    game.clockMinutes = (game.clockMinutes + CLOCK.minutesPerSecond * dt) % (24 * 60);

    if (player.car) {
      if (game.autopilot) {
        // The screenshot scenes drive the player's car with a traffic brain, through the
        // normal simulation: same physics, same traffic, same collisions.
        if (game.autopilotBrain === null) {
          game.autopilotBrain = createDriverBrain(city, random, 'h', city.hRoads.length - 1, 3, 1);
        }
        driveBrain(city, random, game.autopilotBrain, player.car, game, dt);
      } else {
        stepCar(player.car, dt, controls, city, cars, game.fx);
      }
      const speed = Math.hypot(player.car.vx, player.car.vy);
      game.stats.distanceDriven += speed * dt;
      if (speed > game.stats.topSpeed) game.stats.topSpeed = speed;
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
    } else {
      stepPlayerOnFoot(player, dt, { x: controls.moveX, y: controls.moveY }, controls.sprint, city, cars, game.fx);
    }

    stepTraffic(game, random, dt);
    // Driverless cars sit on their parking brake: a shove slides them a little, then they stop.
    for (const car of cars) {
      if (car.driver !== null) continue;
      const damp = Math.max(0, 1 - 7 * dt);
      car.vx *= damp;
      car.vy *= damp;
      if (Math.hypot(car.vx, car.vy) < 3) {
        car.vx = 0;
        car.vy = 0;
      }
    }
    settleCarCollisions(cars, game.fx);
    stepFx(dt);
    stepCamera(dt);
  }

  /**
   * E, in or out. Out: step to the car's side, somewhere not inside a building or the sea.
   * In: the nearest car is yours; an AI driver becomes a pedestrian who runs, and a car taken
   * from the street or a kerb counts as stolen.
   */
  function tryEnterExitCar() {
    if (player.car) {
      const car = player.car;
      const model = CAR_MODELS[car.model];
      const spots = [
        { x: car.x - Math.sin(car.angle) * (model.width / 2 + 20), y: car.y + Math.cos(car.angle) * (model.width / 2 + 20) },
        { x: car.x + Math.sin(car.angle) * (model.width / 2 + 20), y: car.y - Math.cos(car.angle) * (model.width / 2 + 20) },
        { x: car.x - Math.cos(car.angle) * (model.length / 2 + 20), y: car.y - Math.sin(car.angle) * (model.length / 2 + 20) },
      ];
      for (const spot of spots) {
        if (spot.y > city.waterY - 8) continue;
        let inside = false;
        for (const building of city.buildings) {
          if (spot.x > building.x - 12 && spot.x < building.x + building.w + 12
            && spot.y > building.y - 12 && spot.y < building.y + building.h + 12) {
            inside = true;
            break;
          }
        }
        if (inside) continue;
        player.x = Math.max(16, Math.min(city.width - 16, spot.x));
        player.y = Math.max(16, spot.y);
        break;
      }
      car.driver = null;
      car.parked = true;
      car.ai = null;
      player.car = null;
      return 'exited';
    }
    const car = findNearestCar(cars, player.x, player.y, 58);
    if (car === null) return null;
    if (car.driver === 'ai') {
      const ped = createPedestrian(city, random, car.x, car.y);
      ped.state = 'flee';
      ped.timer = 2.2;
      ped.fleeX = ped.x - player.x;
      ped.fleeY = ped.y - player.y;
      pickPedestrianTarget(city, random, ped);
      game.peds.push(ped);
      if (game.peds.length > TRAFFIC.targetPeds + 6) game.peds.shift();
      game.stats.carsStolen += 1;
    } else if (!car.everPlayer) {
      game.stats.carsStolen += 1;
    }
    car.driver = 'player';
    car.parked = false;
    car.ai = null;
    car.everPlayer = true;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.vx = 0;
    player.vy = 0;
    return 'entered';
  }

  function serialize() {
    const focus = player.car ?? player;
    return {
      version: 1,
      x: focus.x,
      y: focus.y,
      angle: focus.angle,
      inCar: player.car !== null,
      carModel: player.car ? player.car.model : -1,
      carColor: player.car ? CAR_MODELS[player.car.model].colors.indexOf(player.car.color) : -1,
      cash: player.cash,
      health: player.health,
      clockMinutes: game.clockMinutes,
      stats: { ...game.stats },
    };
  }

  function restore(data) {
    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return false;
    player.cash = typeof data.cash === 'number' ? data.cash : player.cash;
    player.health = typeof data.health === 'number' ? Math.max(10, data.health) : player.health;
    if (typeof data.clockMinutes === 'number') game.clockMinutes = data.clockMinutes;
    if (data.stats) game.stats = { ...game.stats, ...data.stats };
    if (data.inCar && data.carModel >= 0 && data.carModel < CAR_MODELS.length) {
      const color = Math.max(0, Math.min(CAR_MODELS[data.carModel].colors.length - 1, data.carColor | 0));
      const car = createCar(data.carModel, color, data.x, data.y, data.angle || 0);
      car.driver = 'player';
      car.parked = false;
      car.everPlayer = true;
      cars.push(car);
      player.car = car;
    }
    player.x = data.x;
    player.y = data.y;
    game.camera.x = data.x;
    game.camera.y = data.y;
    return true;
  }

  return game;
}
