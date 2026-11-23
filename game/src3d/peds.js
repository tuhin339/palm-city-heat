// Palm City's walkers: low-poly people who stroll the block sidewalks the way the
// 2D game's pedestrians walk their blocks — corner to corner around a block, now
// and then across the street to the next. They have the 2D walkers' danger sense:
// a fast car close by, or gunfire, sends them running. One the player's car
// actually reaches dives away and is gone (nobody is graphically killed); the
// dive is reported back so the law and the wallet can hear about it. The module
// also lends its walker mesh to the Kings' drivers when they bail and run.

import { PITCH, blockAt } from './city.js';
import { collideCircle, wrapAngle } from './util.js';

const BLOCK = PITCH - 16; // buildable land between roads, as in city.js
const INSET = BLOCK / 2 - 1.5; // the sidewalk ring a walker follows round a block
const SHIRTS = [0xd96f4e, 0xe9c46a, 0x7fb069, 0x5e8b7e, 0xbc6c8a, 0xf4f1de, 0x6d8ea0, 0xe07a5f];
const SKINS = [0xe8b08a, 0xc68863, 0x8d5a3b, 0xf1c27d];
const PANTS = [0x33404f, 0x4a3b2c, 0x24303c, 0x503a4a];
const TARGET_COUNT = 14;

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * One walker, facing +Z: swinging legs, a shirt-coloured torso, a head. The leg
 * pivots and the torso ride in userData so the walk cycle can move them.
 */
export function makeWalkerMesh(rng, shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor ?? rng.pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });

  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.11, 0.54, 0);
    const leg = box(0.17, 0.54, 0.2, pants, 0, -0.27, 0);
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  const torso = box(0.54, 0.62, 0.3, shirt, 0, 0.86, 0);
  g.add(torso);
  g.add(box(0.15, 0.5, 0.18, shirt, -0.36, 0.88, 0));
  g.add(box(0.15, 0.5, 0.18, shirt, 0.36, 0.88, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.set(0, 1.36, 0);
  g.add(head);

  g.userData.legs = legs;
  g.userData.torso = torso;
  return g;
}

/** The four corners of a block's sidewalk ring, in walking order. */
function blockCorners(bi, bj) {
  const cx = blockAt(bi);
  const cz = blockAt(bj);
  return [
    { x: cx - INSET, z: cz - INSET },
    { x: cx + INSET, z: cz - INSET },
    { x: cx + INSET, z: cz + INSET },
    { x: cx - INSET, z: cz + INSET },
  ];
}

export function createPeds(scene, rng, colliders) {
  const list = [];
  const runners = [];

  function sidewalkSpotNear(focus, minD, maxD) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const bi = rng.pick([-3, -2, -1, 0, 1, 2]);
      const bj = rng.pick([-3, -2, -1, 0, 1, 2]);
      const corners = blockCorners(bi, bj);
      const c = rng.pick(corners);
      const d = Math.hypot(c.x - focus.x, c.z - focus.z);
      if (d >= minD && d <= maxD) return { bi, bj, x: c.x, z: c.z, corner: corners.indexOf(c) };
    }
    return null;
  }

  function spawnPed(focus) {
    const spot = sidewalkSpotNear(focus, 30, 105) ?? { bi: 0, bj: 0, x: blockAt(0) - INSET, z: blockAt(0) - INSET, corner: 0 };
    const group = makeWalkerMesh(rng);
    group.position.set(spot.x, 0, spot.z);
    scene.add(group);
    const ped = {
      group,
      bi: spot.bi,
      bj: spot.bj,
      corner: spot.corner,
      dir: rng.chance(0.5) ? 1 : -1,
      state: 'walk',
      timer: 0,
      speed: rng.range(1.3, 1.8),
      phase: rng.range(0, 6),
      heading: 0,
      fleeX: 0,
      fleeZ: 0,
      diveX: 0,
      diveZ: 0,
      counted: false,
    };
    list.push(ped);
    return ped;
  }

  /** Gunfire nearby: every walker inside the radius runs from the noise. */
  function panicAt(x, z, radius) {
    for (const ped of list) {
      if (ped.state === 'down') continue;
      const dx = ped.group.position.x - x;
      const dz = ped.group.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        ped.state = 'flee';
        ped.timer = Math.max(ped.timer, 1.3);
        ped.fleeX = d > 0.01 ? dx / d : 1;
        ped.fleeZ = d > 0.01 ? dz / d : 0;
      }
    }
  }

  /** A driver bailing out of a wrecked car: a runner in the gang's purple. */
  function spawnRunner(x, z, heading, shirtColor = 0x43305e) {
    const group = makeWalkerMesh(rng, shirtColor);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    runners.push({ group, heading, timer: 7, phase: rng.range(0, 6) });
  }

  function animateWalker(ped, dt, moveSpeed) {
    ped.phase += dt * (2.2 + moveSpeed * 2.6);
    const swing = Math.sin(ped.phase) * (moveSpeed > 2.2 ? 0.75 : 0.5);
    ped.group.userData.legs[0].rotation.x = swing;
    ped.group.userData.legs[1].rotation.x = -swing;
    ped.group.userData.torso.position.y = 0.86 + Math.abs(Math.cos(ped.phase)) * 0.035;
  }

  /**
   * One step for the crowd. `ctx` carries the player's position and speed, every
   * car's {x, z, speed} for the danger sense, whether the player is actually
   * driving (only then can the player's car put a walker down), and the onPedHit
   * callback fired once per dive.
   */
  function update(dt, ctx) {
    const focus = ctx.playerPos;

    // Retire whoever drifted too far off, and keep the sidewalks populated.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i].group.position;
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > 130 && list[i].state !== 'down') {
        scene.remove(list[i].group);
        list.splice(i, 1);
      }
    }
    if (list.length < TARGET_COUNT) {
      spawnPed(focus);
      if (list.length + 1 < TARGET_COUNT) spawnPed(focus);
    }

    for (const ped of list) {
      const pos = ped.group.position;

      if (ped.state === 'down') {
        ped.timer -= dt;
        const k = Math.min(1, 1 - Math.max(0, ped.timer) / 1.15);
        ped.group.rotation.x = -Math.PI / 2 * Math.min(1, k * 2.2);
        if (ped.timer > 0.85) {
          pos.x += ped.diveX * dt * 4.5;
          pos.z += ped.diveZ * dt * 4.5;
        }
        pos.y = 0.12 * Math.min(1, k * 2.2);
        if (ped.timer <= 0) {
          // Gone — and back on the sidewalks somewhere else entirely.
          const spot = sidewalkSpotNear(focus, 45, 110);
          if (spot) {
            pos.set(spot.x, 0, spot.z);
            ped.bi = spot.bi;
            ped.bj = spot.bj;
            ped.corner = spot.corner;
          }
          ped.group.rotation.x = 0;
          pos.y = 0;
          ped.state = 'walk';
          ped.counted = false;
        }
        continue;
      }

      // Danger sense: a fast car close by sends a walker running from it.
      let threat = null;
      let threatD = Infinity;
      for (const car of ctx.cars) {
        const dx = pos.x - car.x;
        const dz = pos.z - car.z;
        const d = Math.hypot(dx, dz);
        if ((d < 5.5 && car.speed > 2.5) || (d < 11 && car.speed > 8)) {
          if (d < threatD) { threatD = d; threat = car; }
        }
      }
      if (threat && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.timer = 1.5;
        const d = threatD || 1;
        ped.fleeX = (pos.x - threat.x) / d;
        ped.fleeZ = (pos.z - threat.z) / d;
      }

      // The player's car reaching a walker: a dive, a despawn, a report.
      if (ctx.playing && ctx.playerSpeed > 2.5) {
        const dx = pos.x - focus.x;
        const dz = pos.z - focus.z;
        if (Math.hypot(dx, dz) < 1.7) {
          ped.state = 'down';
          ped.timer = 1.15;
          const side = rng.chance(0.5) ? 1 : -1;
          const fx = Math.sin(ctx.playerHeading);
          const fz = Math.cos(ctx.playerHeading);
          ped.diveX = fx * 0.6 + fz * side;
          ped.diveZ = fz * 0.6 - fx * side;
          const dl = Math.hypot(ped.diveX, ped.diveZ) || 1;
          ped.diveX /= dl;
          ped.diveZ /= dl;
          if (!ped.counted) {
            ped.counted = true;
            ctx.onPedHit(ped);
          }
          continue;
        }
      }

      let vx = 0;
      let vz = 0;
      let moveSpeed = ped.speed;
      if (ped.state === 'flee') {
        ped.timer -= dt;
        vx = ped.fleeX * 3.4;
        vz = ped.fleeZ * 3.4;
        moveSpeed = 3.4;
        if (ped.timer <= 0) ped.state = 'walk';
      } else {
        const corners = blockCorners(ped.bi, ped.bj);
        let target = corners[ped.corner];
        let dx = target.x - pos.x;
        let dz = target.z - pos.z;
        let d = Math.hypot(dx, dz);
        if (d < 0.5) {
          // Round the corner — or cross the street to the next block along.
          if (rng.chance(0.22)) {
            const nbi = Math.max(-3, Math.min(2, ped.bi + (target.x > blockAt(ped.bi) ? 1 : -1)));
            const nbj = Math.max(-3, Math.min(2, ped.bj + (target.z > blockAt(ped.bj) ? 1 : -1)));
            if (nbi !== ped.bi || nbj !== ped.bj) {
              if (rng.chance(0.5)) ped.bi = nbi; else ped.bj = nbj;
            }
          }
          ped.corner = (ped.corner + ped.dir + 4) % 4;
          target = blockCorners(ped.bi, ped.bj)[ped.corner];
          dx = target.x - pos.x;
          dz = target.z - pos.z;
          d = Math.hypot(dx, dz) || 1;
        }
        vx = (dx / d) * ped.speed;
        vz = (dz / d) * ped.speed;
      }

      pos.x += vx * dt;
      pos.z += vz * dt;
      collideCircle(colliders, pos, 0.4);
      pos.x = Math.max(-214, Math.min(214, pos.x));
      pos.z = Math.max(-214, Math.min(214, pos.z));

      const want = Math.atan2(vx, vz);
      ped.heading += wrapAngle(want - ped.heading) * Math.min(1, 10 * dt);
      ped.group.rotation.y = ped.heading;
      animateWalker(ped, dt, moveSpeed);
    }

    // Bailed-out drivers just run: straight, fast, and gone.
    for (let i = runners.length - 1; i >= 0; i -= 1) {
      const r = runners[i];
      r.timer -= dt;
      r.group.position.x += Math.sin(r.heading) * 4.2 * dt;
      r.group.position.z += Math.cos(r.heading) * 4.2 * dt;
      collideCircle(colliders, r.group.position, 0.4);
      r.phase += dt * 11;
      const swing = Math.sin(r.phase) * 0.75;
      r.group.userData.legs[0].rotation.x = swing;
      r.group.userData.legs[1].rotation.x = -swing;
      if (r.timer <= 0) {
        scene.remove(r.group);
        runners.splice(i, 1);
      }
    }
  }

  return { list, update, panicAt, spawnRunner };
}
