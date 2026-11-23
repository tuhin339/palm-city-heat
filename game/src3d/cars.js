// Procedural cars built from boxes and cylinders — no models, no textures. One
// factory turns out the hero car, the traffic fleet and the police variant (white
// paint, black doors, a light bar whose lamps the render loop flashes). Traffic
// drives itself around the street grid: it holds a right-hand lane, steers between
// intersections, turns at junctions, and brakes when something is ahead of it.

import { PITCH, ROAD_W, STREET_I, streetAt } from './city.js';

export const CAR_LENGTH = 4.2;
export const CAR_WIDTH = 1.8;
const LANE = 3.4; // lane offset from the street centreline (right-hand traffic)

const PAINTS = [0xff7a33, 0x2ec4b6, 0xe63946, 0xf4d35e, 0x7b6fd0, 0x4cc9f0, 0xf2f0ea, 0x33415c];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17171a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2a3a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Build one car facing +Z. userData carries what the loop needs: the four wheel
 * spin meshes, the front steer groups, and for police the two light-bar lamps.
 */
export function makeCar({ color = 0xff7a33, police = false } = {}) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f4 : color });

  const body = box(CAR_WIDTH, 0.52, CAR_LENGTH, paint, 0, 0.56, 0);
  car.add(body);
  const nose = box(CAR_WIDTH * 0.96, 0.3, 0.7, paint, 0, 0.42, CAR_LENGTH / 2 - 0.3);
  car.add(nose);
  const cabin = box(CAR_WIDTH * 0.88, 0.5, 2.0, glassMat, 0, 1.05, -0.25);
  car.add(cabin);
  const roof = box(CAR_WIDTH * 0.9, 0.07, 1.9, paint, 0, 1.33, -0.25);
  car.add(roof);

  car.add(box(0.36, 0.15, 0.08, headMat, -0.55, 0.6, CAR_LENGTH / 2 + 0.01));
  car.add(box(0.36, 0.15, 0.08, headMat, 0.55, 0.6, CAR_LENGTH / 2 + 0.01));
  car.add(box(0.36, 0.13, 0.08, tailMat, -0.55, 0.62, -CAR_LENGTH / 2 - 0.01));
  car.add(box(0.36, 0.13, 0.08, tailMat, 0.55, 0.62, -CAR_LENGTH / 2 - 0.01));
  car.add(box(CAR_WIDTH * 0.9, 0.16, 0.1, chromeMat, 0, 0.3, CAR_LENGTH / 2));
  car.add(box(CAR_WIDTH * 0.9, 0.16, 0.1, chromeMat, 0, 0.3, -CAR_LENGTH / 2));

  const wheels = [];
  const steers = [];
  for (const [sx, sz, front] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const steer = new THREE.Group();
    steer.position.set(sx * (CAR_WIDTH / 2 - 0.05), 0.36, sz * (CAR_LENGTH / 2 - 0.85));
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    steer.add(wheel);
    car.add(steer);
    wheels.push(wheel);
    if (front) steers.push(steer);
  }

  let lamps = null;
  if (police) {
    const black = new THREE.MeshLambertMaterial({ color: 0x14151a });
    car.add(box(0.04, 0.36, 1.7, black, -CAR_WIDTH / 2 - 0.01, 0.58, -0.2));
    car.add(box(0.04, 0.36, 1.7, black, CAR_WIDTH / 2 + 0.01, 0.58, -0.2));
    car.add(box(1.34, 0.13, 0.52, black, 0, 1.44, -0.25));
    const red = box(0.52, 0.17, 0.44, new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.34, 1.45, -0.25);
    const blue = box(0.52, 0.17, 0.44, new THREE.MeshBasicMaterial({ color: 0x2255ff }), 0.34, 1.45, -0.25);
    car.add(red);
    car.add(blue);
    lamps = { red, blue };
  }

  car.userData.wheels = wheels;
  car.userData.steers = steers;
  car.userData.lamps = lamps;
  car.userData.radius = 2.0;
  return car;
}

/** Alternate the light-bar lamps; called once per frame for every police car. */
export function updatePoliceLights(car, t) {
  const lamps = car.userData.lamps;
  if (!lamps) return;
  const phase = Math.floor(t * 2.6) % 2 === 0;
  lamps.red.visible = phase;
  lamps.blue.visible = !phase;
}

/** Spin a car's wheels and swing its front pair, from distance travelled. */
export function rollWheels(car, distance, steerAngle) {
  for (const w of car.userData.wheels) w.rotation.x += distance / 0.36;
  for (const s of car.userData.steers) s.rotation.y = steerAngle;
}

// ------------------------------------------------------------------- traffic

/**
 * One self-driving car. It drives leg by leg: each leg runs along one street's
 * right-hand lane to the next junction, where it rolls straight on or turns onto
 * the crossing street. `update` steers for the far end of the current leg, which
 * arcs it around corners on its own. `avoid` is a list of {x, z} obstacles (the
 * player, other cars) it brakes for.
 */
export class TrafficCar {
  constructor(scene, rng, { police = false } = {}) {
    this.group = makeCar({ color: rng.pick(PAINTS), police });
    this.rng = rng;
    this.speed = 0;
    this.cruise = rng.range(8.5, 11.5);
    // Start on a random street, a random way along it, never dead centre.
    this.axis = rng.chance(0.5) ? 'z' : 'x';
    this.street = rng.pick(STREET_I);
    this.dir = rng.chance(0.5) ? 1 : -1;
    let along = rng.range(-190, 190);
    if (Math.abs(along) < 26) along += 40;
    this.group.position.set(
      this.axis === 'z' ? streetAt(this.street) - this.dir * LANE : along,
      0,
      this.axis === 'x' ? streetAt(this.street) + this.dir * LANE : along,
    );
    this.heading = this.axis === 'z' ? (this.dir > 0 ? 0 : Math.PI) : (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    // The junction this leg ends at: the first street index ahead of the spawn.
    const alongNow = this.axis === 'z' ? this.group.position.z : this.group.position.x;
    this.legJunction = STREET_I[0];
    for (const j of STREET_I) {
      if ((streetAt(j) - alongNow) * this.dir > 2) { this.legJunction = j; break; }
      this.legJunction = j;
    }
    this.target = this.legPoint();
    scene.add(this.group);
  }

  /** The far end of the current leg: the leg's junction, on this leg's lane. */
  legPoint() {
    return {
      x: this.axis === 'z' ? streetAt(this.street) - this.dir * LANE : streetAt(this.legJunction),
      z: this.axis === 'x' ? streetAt(this.street) + this.dir * LANE : streetAt(this.legJunction),
    };
  }

  /** Arrive at a junction: choose the next leg (straight, or a turn) and aim. */
  arrive() {
    const nextStraight = this.legJunction + this.dir;
    const canStraight = STREET_I.includes(nextStraight);
    if (canStraight && this.rng.chance(0.55)) {
      this.legJunction = nextStraight;
    } else {
      // Turn onto the street we just crossed: its index becomes our street, and
      // the street we were on becomes the junction we are leaving behind.
      const oldStreet = this.street;
      let newDir = this.rng.chance(0.5) ? 1 : -1;
      if (!STREET_I.includes(oldStreet + newDir)) newDir = -newDir;
      this.axis = this.axis === 'z' ? 'x' : 'z';
      this.street = this.legJunction;
      this.dir = newDir;
      this.legJunction = oldStreet + newDir;
    }
    this.target = this.legPoint();
  }

  update(dt, avoid) {
    const p = this.group.position;
    const dx = this.target.x - p.x;
    const dz = this.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4.5) this.arrive();

    const desired = Math.atan2(dx, dz);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = 1.7;
    const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
    this.heading += turn;

    // Brake for anything close ahead; cruise otherwise, slower mid-turn.
    let want = this.cruise * (Math.abs(diff) > 0.45 ? 0.55 : 1);
    for (const o of avoid) {
      const ox = o.x - p.x;
      const oz = o.z - p.z;
      const od = Math.hypot(ox, oz);
      if (od < 8.5) {
        const ahead = ox * Math.sin(this.heading) + oz * Math.cos(this.heading);
        if (ahead > 0.5) want = Math.min(want, Math.max(0, (od - 4.5) * 1.6));
      }
    }
    this.speed += Math.max(-14 * dt, Math.min(6 * dt, want - this.speed));

    const step = this.speed * dt;
    p.x += Math.sin(this.heading) * step;
    p.z += Math.cos(this.heading) * step;
    p.x = Math.max(-208, Math.min(208, p.x));
    p.z = Math.max(-208, Math.min(208, p.z));
    this.group.rotation.y = this.heading;
    rollWheels(this.group, step, Math.max(-0.4, Math.min(0.4, diff)));
  }
}
