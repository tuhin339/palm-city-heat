// Drive-by war with the Solana Kings, the 2D game's gunplay moved into cars: the
// Kings cruise the Old Port in dark purple cars and shoot back when Danny does,
// cars smoke as they come apart, and a King whose car dies bails out and runs.
// Danny's own car has the same health the 2D Danny had — it mends itself once the
// shooting has been over for a while, and at zero the hospital decides.

import { streetAt } from './city.js';
import { TrafficCar } from './cars.js';
import { segmentBlocked } from './util.js';

const KING_COLOR = 0x4a2a6e; // dark purple livery, the 2D gang's colours on a car
const KING_COUNT = 4;
const KING_HEALTH = 100;
const LANE = 3.4; // lane offset from the street centreline, as in cars.js
const BULLET_SPEED = 95;
const BULLET_LIFE = 0.55;
const BULLET_DAMAGE = 34;
const GANG_BULLET_DAMAGE = 7;
const FIRE_INTERVAL = 0.14;
const GANG_RANGE = 34;
const GANG_FIRE_MIN = 0.65;
const GANG_FIRE_MAX = 1.25;
const REGEN_DELAY = 5;
const REGEN_RATE = 7;
const RESPAWN_SECONDS = 20;

function glowTexture(inner) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(70,66,74,0.85)');
  grad.addColorStop(0.6, 'rgba(70,66,74,0.4)');
  grad.addColorStop(1, 'rgba(70,66,74,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createCombat(scene, rng) {
  const kings = [];
  const bullets = [];
  const flashes = [];
  let playerHealth = 100;
  let lastDamageAt = -100;
  let fireTimer = 0;

  const flashTex = glowTexture('rgba(255,200,110,1)');
  const smokeTex = smokeTexture();
  const playerSmoke = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTex, depthWrite: false, transparent: true, opacity: 0,
  }));
  scene.add(playerSmoke);
  let playerSmokeAge = 0;
  const bulletGeo = new THREE.SphereGeometry(0.1, 6, 5);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });

  function flashAt(x, y, z, scale, color = 0xffc46b) {
    let f = flashes.find((e) => e.life <= 0);
    if (!f) {
      if (flashes.length >= 14) return;
      const mat = new THREE.SpriteMaterial({
        map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
      f = { sprite: new THREE.Sprite(mat), life: 0 };
      scene.add(f.sprite);
      flashes.push(f);
    }
    f.sprite.position.set(x, y, z);
    f.sprite.scale.setScalar(scale);
    f.sprite.material.color.setHex(color);
    f.sprite.material.opacity = 0.95;
    f.life = 0.09;
  }

  /** Put a TrafficCar on an Old Port leg, coherent enough to cruise the quarter. */
  function placeKing(car) {
    car.axis = rng.chance(0.5) ? 'z' : 'x';
    car.street = rng.pick([1, 2, 3]);
    car.dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(26, 150);
    car.group.position.set(
      car.axis === 'z' ? streetAt(car.street) - car.dir * LANE : along,
      0,
      car.axis === 'x' ? streetAt(car.street) + car.dir * LANE : along,
    );
    car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.group.rotation.y = car.heading;
    car.speed = car.cruise * 0.7;
    let junction = car.street + car.dir;
    for (const j of [1, 2, 3]) {
      if ((streetAt(j) - along) * car.dir > 2) { junction = j; break; }
      junction = j;
    }
    car.legJunction = junction;
    car.target = car.legPoint();
  }

  /** The paint materials of a car (body, nose and roof share one) — for the livery. */
  function paintMaterials(group) {
    const mats = new Set();
    group.traverse((m) => {
      if (!m.isMesh || !m.material || !m.material.isMeshLambertMaterial) return;
      const hex = m.material.color.getHex();
      if (hex === 0x1d2a3a || hex === 0x9aa3ad || hex === 0x17171a) return; // glass, chrome, tyres
      mats.add(m.material);
    });
    return [...mats];
  }

  function makeHealthBar() {
    const bar = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x14100e, transparent: true, opacity: 0.85 }),
    );
    const fillGeo = new THREE.PlaneGeometry(2.44, 0.24);
    fillGeo.translate(1.22, 0, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xb06ee0 }));
    fill.position.set(-1.22, 0, 0.012);
    bar.add(back, fill);
    bar.userData.fill = fill;
    bar.visible = false;
    scene.add(bar);
    return bar;
  }

  /**
   * Build the Kings' fleet and add it to the traffic array main drives. Each
   * King is a TrafficCar wearing purple, with health, a smoke sprite and a
   * health bar of its own.
   */
  function createKings(traffic) {
    for (let i = 0; i < KING_COUNT; i += 1) {
      const car = new TrafficCar(scene, rng, {});
      const paintMats = paintMaterials(car.group);
      for (const mat of paintMats) mat.color.setHex(KING_COLOR);
      placeKing(car);
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, depthWrite: false, transparent: true, opacity: 0,
      }));
      scene.add(smoke);
      const king = {
        car, paintMats, health: KING_HEALTH, state: 'cruise',
        fireTimer: rng.range(0.4, 1.1), respawnTimer: 0,
        smoke, smokeAge: rng.range(0, 1.2), bar: makeHealthBar(),
      };
      car.king = king;
      kings.push(king);
      traffic.push(car);
    }
    return kings;
  }

  function fireBullet(from, x, z, angle, ctx) {
    let b = bullets.find((e) => e.life <= 0);
    if (!b) {
      if (bullets.length >= 40) return;
      b = { mesh: new THREE.Mesh(bulletGeo, bulletMat), life: 0, vx: 0, vz: 0, from: 'player' };
      scene.add(b.mesh);
      bullets.push(b);
    }
    b.mesh.position.set(x, 1.05, z);
    b.mesh.visible = true;
    b.vx = Math.sin(angle) * BULLET_SPEED;
    b.vz = Math.cos(angle) * BULLET_SPEED;
    b.life = BULLET_LIFE;
    b.from = from;
    if (ctx && ctx.audio) ctx.audio.play('shot');
  }

  function damageKing(king, amount, ctx) {
    if (king.state === 'disabled') return;
    king.health -= amount;
    king.state = 'fight';
    if (ctx && ctx.audio) ctx.audio.play('hit');
    if (king.health <= 0) {
      king.health = 0;
      king.state = 'disabled';
      king.car.disabled = true;
      king.respawnTimer = RESPAWN_SECONDS;
      for (const mat of king.paintMats) mat.color.setHex(0x241f2c);
      king.bar.visible = false;
      if (ctx && ctx.spawnRunner) {
        ctx.spawnRunner(
          king.car.group.position.x, king.car.group.position.z,
          king.car.heading + (rng.chance(0.5) ? 0.8 : -0.8),
        );
      }
    }
  }

  /** Hurt Danny's car from any source that routes through here: bullets, rams. */
  function damagePlayerCar(amount, ctx) {
    if (!ctx || ctx.over || playerHealth <= 0) return;
    playerHealth = Math.max(0, playerHealth - amount);
    lastDamageAt = ctx.time;
    if (playerHealth <= 0 && ctx.onWasted) ctx.onWasted();
  }

  function resetPlayerCar() {
    playerHealth = 100;
    lastDamageAt = -100;
  }

  function pointInBuilding(colliders, x, z) {
    for (const b of colliders) {
      if (x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  function stepBullets(dt, ctx) {
    for (const b of bullets) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      const bp = b.mesh.position;
      let dead = b.life <= 0;
      if (!dead && pointInBuilding(ctx.colliders, bp.x, bp.z)) {
        flashAt(bp.x, 1.05, bp.z, 0.9, 0xffe9a8);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const car of ctx.trafficCars) {
          const cp = car.group.position;
          if (Math.abs(cp.x - bp.x) > 3 || Math.abs(cp.z - bp.z) > 3) continue;
          if (Math.hypot(cp.x - bp.x, cp.z - bp.z) > 2.3) continue;
          flashAt(bp.x, 1.05, bp.z, 1.1, 0xffe9a8);
          if (car.king) damageKing(car.king, BULLET_DAMAGE, ctx);
          else if (car.group.userData.lamps) ctx.reportShotCop(bp.x, bp.z);
          dead = true;
          break;
        }
        if (!dead) {
          for (const g of ctx.extraCars) {
            if (g === ctx.drivenGroup) continue; // never shoot the car you're in
            const cp = g.position;
            if (Math.hypot(cp.x - bp.x, cp.z - bp.z) > 2.3) continue;
            flashAt(bp.x, 1.05, bp.z, 1.1, 0xffe9a8);
            if (g.userData.lamps) ctx.reportShotCop(bp.x, bp.z);
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.from === 'gang') {
        const pp = ctx.playerPos;
        if (Math.hypot(pp.x - bp.x, pp.z - bp.z) < 2.3) {
          flashAt(bp.x, 1.05, bp.z, 1.1, 0xff9a7a);
          damagePlayerCar(GANG_BULLET_DAMAGE, ctx);
          dead = true;
        }
      }
      if (dead) {
        b.life = 0;
        b.mesh.visible = false;
      }
    }
  }

  /**
   * One step of the fighting. ctx: { time, playing, over, camera, colliders,
   * trafficCars, extraCars, playerPos, playerVel, playerHeading, aim, firing,
   * audio, panicAt, spawnRunner, reportShot, reportShotCop, onWasted }.
   */
  function update(dt, ctx) {
    fireTimer -= dt;

    // Danny's own trigger: mouse aim, click or F held, from the driver's window.
    if (ctx.playing && !ctx.over && ctx.firing && fireTimer <= 0 && playerHealth > 0) {
      fireTimer = FIRE_INTERVAL;
      const pp = ctx.playerPos;
      const fx = Math.sin(ctx.playerHeading);
      const fz = Math.cos(ctx.playerHeading);
      const ox = pp.x + fx * 0.6 + fz * 0.8;
      const oz = pp.z + fz * 0.6 - fx * 0.8;
      let aimX = pp.x + fx * 25;
      let aimZ = pp.z + fz * 25;
      if (ctx.aim && ctx.aim.active) { aimX = ctx.aim.x; aimZ = ctx.aim.z; }
      const angle = Math.atan2(aimX - ox, aimZ - oz) + (rng.next() - 0.5) * 0.035;
      fireBullet('player', ox, oz, angle, ctx);
      flashAt(ox, 1.15, oz, 1.5);
      if (ctx.panicAt) ctx.panicAt(pp.x, pp.z, 16);
      if (ctx.reportShot) ctx.reportShot();
    }

    // The Kings: cruise the quarter, fight when Danny is close or shooting.
    for (const king of kings) {
      const kp = king.car.group.position;
      if (king.state === 'disabled') {
        king.respawnTimer -= dt;
        king.smoke.material.opacity = 0;
        if (king.respawnTimer <= 0) {
          king.health = KING_HEALTH;
          king.state = 'cruise';
          king.car.disabled = false;
          for (const mat of king.paintMats) mat.color.setHex(KING_COLOR);
          placeKing(king.car);
        }
        continue;
      }
      // The leash: a King who wanders out of the Old Port is aimed back in.
      if (kp.x < 6 || kp.z < 6) king.car.target = { x: streetAt(2), z: streetAt(2) };

      const d = Math.hypot(ctx.playerPos.x - kp.x, ctx.playerPos.z - kp.z);
      if (king.state === 'cruise' && d < 20) king.state = 'fight';
      if (king.state === 'fight' && d > 55) king.state = 'cruise';

      king.fireTimer -= dt;
      if (ctx.playing && !ctx.over && king.state === 'fight' && d < GANG_RANGE && king.fireTimer <= 0
        && !segmentBlocked(ctx.colliders, kp.x, kp.z, ctx.playerPos.x, ctx.playerPos.z)) {
        king.fireTimer = GANG_FIRE_MIN + rng.next() * (GANG_FIRE_MAX - GANG_FIRE_MIN);
        const spread = (rng.next() - 0.5) * (0.1 + (d / GANG_RANGE) * 0.16);
        const aimX = ctx.playerPos.x + ctx.playerVel.x * 0.12;
        const aimZ = ctx.playerPos.z + ctx.playerVel.z * 0.12;
        const angle = Math.atan2(aimX - kp.x, aimZ - kp.z) + spread;
        fireBullet('gang', kp.x + Math.sin(angle) * 2.2, kp.z + Math.cos(angle) * 2.2, angle, ctx);
        flashAt(kp.x + Math.sin(angle) * 2.4, 1.15, kp.z + Math.cos(angle) * 2.4, 1.4);
        if (ctx.panicAt) ctx.panicAt(kp.x, kp.z, 16);
      }

      // Smoke as she comes apart: thin grey at half health, thick and dark low.
      if (king.health < 55) {
        king.smokeAge += dt;
        if (king.smokeAge > 1.2) king.smokeAge = 0;
        const k = king.smokeAge / 1.2;
        king.smoke.position.set(kp.x, 1.6 + k * 2.2, kp.z);
        king.smoke.scale.setScalar(1 + k * 2.6);
        king.smoke.material.opacity = (king.health < 25 ? 0.55 : 0.35) * (1 - k);
        king.smoke.material.color.setHex(king.health < 25 ? 0x555055 : 0x8a8590);
      } else {
        king.smoke.material.opacity = 0;
      }

      // The floating health bar, for a King in the fight and worse for wear.
      const showBar = king.health < KING_HEALTH && ctx.playing;
      king.bar.visible = showBar;
      if (showBar) {
        king.bar.position.set(kp.x, 2.9, kp.z);
        king.bar.quaternion.copy(ctx.camera.quaternion);
        king.bar.userData.fill.scale.x = Math.max(0, king.health / KING_HEALTH);
      }
    }

    // Danny's car smokes as it comes apart, same as a King's.
    if (playerHealth < 55 && playerHealth > 0) {
      playerSmokeAge += dt;
      if (playerSmokeAge > 1.2) playerSmokeAge = 0;
      const k = playerSmokeAge / 1.2;
      playerSmoke.position.set(ctx.playerPos.x, 1.6 + k * 2.2, ctx.playerPos.z);
      playerSmoke.scale.setScalar(1 + k * 2.6);
      playerSmoke.material.opacity = (playerHealth < 25 ? 0.55 : 0.35) * (1 - k);
      playerSmoke.material.color.setHex(playerHealth < 25 ? 0x555055 : 0x8a8590);
    } else {
      playerSmoke.material.opacity = 0;
    }

    stepBullets(dt, ctx);

    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.sprite.material.opacity = Math.max(0, f.life / 0.09) * 0.95;
      if (f.life <= 0) f.sprite.material.opacity = 0;
    }

    // Danny's car mends once the shooting has been over for a while.
    if (!ctx.over && playerHealth > 0 && ctx.time - lastDamageAt > REGEN_DELAY) {
      playerHealth = Math.min(100, playerHealth + REGEN_RATE * dt);
    }
  }

  return {
    kings,
    createKings,
    update,
    damageKing,
    damagePlayerCar,
    resetPlayerCar,
    get playerHealth() { return playerHealth; },
  };
}
