// The law, in 3D: the 2D game's wanted system at city scale. Crimes are priced in
// stars and only count when somebody sees them — a pedestrian or a driver inside
// the witness radius, a patrol car from much further off. Interceptors join the
// hunt from the junction ring around the player, steer at where Danny is heading
// (or at his nearest junction when a tower blocks the line), and ram and pin. A
// bust meter fills while a cop sits on a slow player; out of every cop's sight
// for long enough, the heat cools one star at a time and the force stands down.

import { STREET_I, streetAt } from './city.js';
import { makeCar, rollWheels, updatePoliceLights } from './cars.js';
import { collideCircle, segmentBlocked, wrapAngle } from './util.js';

export const POLICE_CFG = {
  maxStars: 5,
  copsByStars: [2, 2, 3, 4, 5], // interceptors kept on the player per star level
  spawnCooldown: 2.2,
  spawnMin: 50,
  spawnMax: 85,
  sightRange: 55,
  decaySeconds: 8,
  bustFill: 0.5,
  bustDrain: 0.4,
  bustRange: 9.5,
  bustSpeed: 2.4, // slower than this beside a cop, a driver is being pinned
  copWitness: 58,
  crimes: {
    theft: { stars: 1, witness: 28, cooldown: 3 },
    crash: { stars: 1, witness: 30, cooldown: 6 },
    pedHit: { stars: 1, witness: 32, cooldown: 4 },
    shots: { stars: 1, witness: 36, cooldown: 5 },
    copHit: { stars: 1, witness: 0, cooldown: 6 },
  },
};

export function createPolice(scene, rng, colliders) {
  const cops = [];
  let stars = 0;
  let bust = 0;
  let hiddenTime = 0;
  let spawnTimer = 0;
  let nearestCopDistance = Infinity;
  const cooldowns = {};

  function setStars(n, ctx) {
    const next = Math.max(0, Math.min(POLICE_CFG.maxStars, n | 0));
    if (next === stars) return;
    const rose = next > stars;
    stars = next;
    hiddenTime = 0;
    if (stars === 0) bust = 0;
    if (ctx && ctx.onStarsChanged) ctx.onStarsChanged(stars, rose);
  }

  /** Set the wanted level directly (mission scripts); zero stands the force down. */
  function setWanted(n, ctx) {
    setStars(n, ctx);
    if (stars === 0) {
      for (const cop of cops) cop.state = 'leave';
    }
  }

  /** Scripted heat that needs no witness (a mission gone loud). */
  function addStars(n, ctx) {
    setStars(stars + n, ctx);
  }

  /**
   * Price a crime in stars — but only if it was seen. `witnesses` carries the
   * street's eyes at the moment of the act: { peds: [{x, z}], cars: [{x, z}] }.
   * A struck patrol car radios it in itself. Returns whether the crime landed.
   */
  function reportCrime(kind, x, z, witnesses, ctx, now) {
    const rule = POLICE_CFG.crimes[kind];
    if (!rule) return false;
    if (cooldowns[kind] && now < cooldowns[kind]) return false;
    let witnessed = false;
    if (kind === 'copHit') {
      for (const cop of cops) {
        if (Math.hypot(cop.group.position.x - x, cop.group.position.z - z) < 52) { witnessed = true; break; }
      }
      // The two ambient patrol cars count too: main passes them in as cars with
      // a cop flag when it builds the witness list.
      if (!witnessed && witnesses) {
        for (const car of witnesses.cars) {
          if (car.cop && Math.hypot(car.x - x, car.z - z) < 52) { witnessed = true; break; }
        }
      }
    } else {
      if (witnesses) {
        for (const ped of witnesses.peds) {
          if (Math.hypot(ped.x - x, ped.z - z) < rule.witness) { witnessed = true; break; }
        }
        if (!witnessed) {
          for (const car of witnesses.cars) {
            if (Math.hypot(car.x - x, car.z - z) < rule.witness) { witnessed = true; break; }
          }
        }
      }
      if (!witnessed) {
        for (const cop of cops) {
          if (Math.hypot(cop.group.position.x - x, cop.group.position.z - z) < POLICE_CFG.copWitness) { witnessed = true; break; }
        }
      }
    }
    if (!witnessed) return false;
    cooldowns[kind] = now + rule.cooldown;
    setStars(stars + rule.stars, ctx);
    return true;
  }

  /** Join the hunt from a junction near the player: near enough to matter, unseen. */
  function spawnCop(ctx) {
    const focus = ctx.playerPos;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const x = streetAt(rng.pick(STREET_I));
      const z = streetAt(rng.pick(STREET_I));
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < POLICE_CFG.spawnMin || d > POLICE_CFG.spawnMax) continue;
      let blocked = false;
      for (const s of ctx.solids) {
        if (Math.hypot(s.x - x, s.z - z) < 6) { blocked = true; break; }
      }
      if (blocked) continue;
      const group = makeCar({ police: true });
      group.position.set(x, 0, z);
      const heading = Math.atan2(focus.x - x, focus.z - z);
      const snapped = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);
      group.rotation.y = snapped;
      scene.add(group);
      cops.push({
        group, heading: snapped, speed: 6, state: 'pursuit',
        reverseTimer: 0, stuckTimer: 0, leaveX: x, leaveZ: z,
      });
      return;
    }
  }

  /** Drive one interceptor for one step: hunt, or drive away once stood down. */
  function driveCop(cop, dt, ctx) {
    const p = cop.group.position;
    const focus = ctx.playerPos;
    let targetX;
    let targetZ;
    let cruise;
    if (cop.state === 'leave') {
      targetX = cop.leaveX;
      targetZ = cop.leaveZ;
      cruise = 12;
    } else {
      const focusDist = Math.hypot(focus.x - p.x, focus.z - p.z);
      if (focusDist <= 30 || !segmentBlocked(colliders, p.x, p.z, focus.x, focus.z)) {
        // Close, or a clear line: straight at where Danny is heading.
        targetX = focus.x + ctx.playerVel.x * 0.32;
        targetZ = focus.z + ctx.playerVel.z * 0.32;
      } else {
        // No line through the towers: route along the grid, as the 2D
        // interceptors do — along the cop's own street to the player's
        // avenue, then down it to the junction nearest the player.
        let pjx = streetAt(STREET_I[0]);
        let pjz = streetAt(STREET_I[0]);
        let bestD = Infinity;
        for (const i of STREET_I) {
          for (const j of STREET_I) {
            const d = (streetAt(i) - focus.x) ** 2 + (streetAt(j) - focus.z) ** 2;
            if (d < bestD) { bestD = d; pjx = streetAt(i); pjz = streetAt(j); }
          }
        }
        if (Math.abs(p.x - pjx) < 7) {
          targetX = pjx;
          targetZ = pjz;
        } else {
          let nz = streetAt(STREET_I[0]);
          let nd = Infinity;
          for (const j of STREET_I) {
            const d = Math.abs(streetAt(j) - p.z);
            if (d < nd) { nd = d; nz = streetAt(j); }
          }
          targetX = pjx;
          targetZ = nz;
        }
      }
      cruise = focusDist > 45 ? 30 : Math.max(9, Math.min(29.5, ctx.playerSpeedAbs + 3));
    }

    if (cop.reverseTimer > 0) {
      cop.reverseTimer -= dt;
      const diff = wrapAngle(Math.atan2(targetX - p.x, targetZ - p.z) - cop.heading);
      cop.heading -= Math.max(-1.8 * dt, Math.min(1.8 * dt, diff * 3 * dt));
      cop.speed = Math.max(-7, cop.speed - 10 * dt);
    } else {
      const diff = wrapAngle(Math.atan2(targetX - p.x, targetZ - p.z) - cop.heading);
      const turn = Math.max(-2.0 * dt, Math.min(2.0 * dt, diff * 2.2));
      cop.heading += turn;
      const want = cruise * (Math.abs(diff) > 0.5 ? 0.55 : 1);
      cop.speed += Math.max(-20 * dt, Math.min(11 * dt, want - cop.speed));
      if (cop.state === 'pursuit' && Math.abs(cop.speed) < 0.6 && want > 3) {
        cop.stuckTimer += dt;
        if (cop.stuckTimer > 1.1) {
          cop.stuckTimer = 0;
          cop.reverseTimer = 0.7;
        }
      } else {
        cop.stuckTimer = Math.max(0, cop.stuckTimer - dt * 2);
      }
    }

    const step = cop.speed * dt;
    p.x += Math.sin(cop.heading) * step;
    p.z += Math.cos(cop.heading) * step;
    p.x = Math.max(-212, Math.min(212, p.x));
    p.z = Math.max(-212, Math.min(212, p.z));
    if (collideCircle(colliders, p, 1.7)) cop.speed *= 0.7;
    // Shoulder other cars aside instead of driving through them.
    for (const s of ctx.solids) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 3.4 * 3.4 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        p.x = s.x + (dx / d) * 3.4;
        p.z = s.z + (dz / d) * 3.4;
      }
    }
    cop.group.rotation.y = cop.heading;
    rollWheels(cop.group, step, 0);
    updatePoliceLights(cop.group, ctx.time + cop.group.id);
  }

  /**
   * One step of the law. ctx: { time, playerPos, playerVel, playerSpeedAbs,
   * solids, playing, over, onBusted, onStarsChanged }.
   */
  function update(dt, ctx) {
    nearestCopDistance = Infinity;

    if (ctx.over) {
      for (const cop of cops) {
        cop.speed *= Math.max(0, 1 - 4 * dt);
        const p = cop.group.position;
        p.x += Math.sin(cop.heading) * cop.speed * dt;
        p.z += Math.cos(cop.heading) * cop.speed * dt;
        cop.group.rotation.y = cop.heading;
        updatePoliceLights(cop.group, ctx.time + cop.group.id);
      }
      return;
    }

    const focus = ctx.playerPos;
    const pursuit = cops.filter((c) => c.state === 'pursuit');

    // Keep the hunt at strength for the wanted level.
    if (stars > 0 && ctx.playing) {
      const desired = POLICE_CFG.copsByStars[stars - 1];
      spawnTimer -= dt;
      if (pursuit.length < desired && spawnTimer <= 0) {
        spawnTimer = POLICE_CFG.spawnCooldown;
        spawnCop(ctx);
      }
      if (pursuit.length > desired) {
        let farthest = null;
        let farthestD = -1;
        for (const cop of pursuit) {
          const d = Math.hypot(cop.group.position.x - focus.x, cop.group.position.z - focus.z);
          if (d > farthestD) { farthestD = d; farthest = cop; }
        }
        if (farthest) {
          farthest.state = 'leave';
          farthest.leaveX = farthest.group.position.x + Math.sin(farthest.heading) * 160;
          farthest.leaveZ = farthest.group.position.z + Math.cos(farthest.heading) * 160;
        }
      }
    }

    let seen = false;
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      driveCop(cop, dt, ctx);
      const d = Math.hypot(cop.group.position.x - focus.x, cop.group.position.z - focus.z);
      if (cop.state === 'leave') {
        if (d > 135) {
          scene.remove(cop.group);
          cops.splice(i, 1);
        }
        continue;
      }
      if (d < nearestCopDistance) nearestCopDistance = d;
      if (d < POLICE_CFG.sightRange
        && !segmentBlocked(colliders, cop.group.position.x, cop.group.position.z, focus.x, focus.z)) {
        seen = true;
      }
    }

    // The heat cools only while nobody in uniform can see the player.
    if (stars > 0) {
      if (seen) {
        hiddenTime = 0;
      } else {
        hiddenTime += dt;
        if (hiddenTime >= POLICE_CFG.decaySeconds) {
          hiddenTime = 0;
          setStars(stars - 1, ctx);
          if (stars === 0) {
            for (const cop of cops) {
              cop.state = 'leave';
              cop.leaveX = cop.group.position.x + Math.sin(cop.heading) * 160;
              cop.leaveZ = cop.group.position.z + Math.cos(cop.heading) * 160;
            }
          }
        }
      }
    }

    // The bust meter: a cop alongside a player who cannot get away.
    if (stars > 0 && ctx.playing) {
      const pinned = nearestCopDistance < POLICE_CFG.bustRange && ctx.playerSpeedAbs < POLICE_CFG.bustSpeed;
      if (pinned) bust = Math.min(1, bust + POLICE_CFG.bustFill * dt);
      else bust = Math.max(0, bust - POLICE_CFG.bustDrain * dt);
      if (bust >= 1 && ctx.onBusted) ctx.onBusted();
    } else {
      bust = Math.max(0, bust - POLICE_CFG.bustDrain * dt);
    }
  }

  return {
    cops,
    get stars() { return stars; },
    get bust() { return bust; },
    get nearestCopDistance() { return nearestCopDistance; },
    reportCrime,
    setWanted,
    addStars,
    update,
  };
}
