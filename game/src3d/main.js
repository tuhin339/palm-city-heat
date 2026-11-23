// Palm City Heat 3D: the boot and the game loop. It grows the seeded city, parks
// Danny's car on the avenue, and either waits on the title screen (camera drifting
// over the rooftops), hands over the keys, or poses one of the deterministic shot
// scenes (?shot=start|chase|mission|combat&seed=1) for the screenshots. Driving is
// an arcade model — throttle, brake, speed-sensitive steering, a handbrake — with
// circle-versus-AABB collision against the towers and the other cars.

import { makeRng, seedFromUrl, shotFromUrl } from './rng.js';
import { buildCity } from './city.js';
import { makeCar, TrafficCar, updatePoliceLights, rollWheels } from './cars.js';

const seed = seedFromUrl();
const shot = shotFromUrl();

// --------------------------------------------------------------------- boot

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.classList.add('webgl');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const rng = makeRng(seed);
const { colliders } = buildCity(scene, rng);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------- HUD

const hud = {
  stars: document.getElementById('stars'),
  cash: document.getElementById('cash'),
  banner: document.getElementById('banner'),
  speed: document.getElementById('speed'),
  overlay: document.getElementById('overlay'),
  status: document.getElementById('status'),
};

function setStars(n) {
  let html = '';
  for (let i = 0; i < 5; i += 1) html += i < n ? '★' : '<span class="off">★</span>';
  hud.stars.innerHTML = html;
}
function setCash(n) {
  hud.cash.textContent = n.toLocaleString('en-US');
}
function setBanner(html) {
  hud.banner.innerHTML = html || '';
  hud.banner.classList.toggle('show', Boolean(html));
}
function setSpeed(kmh) {
  hud.speed.innerHTML = `${Math.round(kmh)} <small>KM/H</small>`;
}
setStars(0);
setCash(1250);

// -------------------------------------------------------------------- input

const keys = { up: false, down: false, left: false, right: false, hand: false };
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'hand',
};
let mode = shot ? 'shot' : 'title';

function startDriving() {
  if (mode !== 'title') return;
  mode = 'play';
  hud.overlay.classList.add('hidden');
  hud.status.textContent = 'Driving. W A S D to drive, Space for the handbrake.';
}
document.getElementById('startBtn').addEventListener('click', startDriving);
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Enter') startDriving();
  const k = KEYMAP[ev.code];
  if (k) {
    keys[k] = true;
    if (k === 'hand' || k.startsWith('Arrow')) ev.preventDefault();
  }
});
window.addEventListener('keyup', (ev) => {
  const k = KEYMAP[ev.code];
  if (k) keys[k] = false;
});

// -------------------------------------------------------------- player car

const player = makeCar({ color: 0xff7a33 });
player.position.set(-4, 0, 3.4);
scene.add(player);
let heading = Math.PI / 2;
let speed = 0;

const headlight = new THREE.SpotLight(0xffe2b0, 300, 55, 0.48, 0.5, 1.8);
headlight.position.set(0, 0.85, 2.0);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0, 16);
player.add(headlightTarget);
headlight.target = headlightTarget;
player.add(headlight);

const MAX_SPEED = 27;
const MAX_REVERSE = 9;

function collideBuildings(pos, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 < 1e-6) {
      // Centre inside the box: leave by the nearest face.
      const pens = [
        pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z,
      ];
      const m = Math.min(...pens);
      if (m === pens[0]) pos.x = b.minX - radius;
      else if (m === pens[1]) pos.x = b.maxX + radius;
      else if (m === pens[2]) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    } else {
      const d = Math.sqrt(d2);
      dx /= d;
      dz /= d;
      pos.x = cx + dx * radius;
      pos.z = cz + dz * radius;
    }
  }
  return hit;
}

function drivePlayer(dt, traffic) {
  const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (keys.up) speed += 15 * dt;
  else if (keys.down) speed -= (speed > 0.5 ? 26 : 8) * dt;
  if (keys.hand) {
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), 30 * dt);
  }
  // Rolling drag and a soft top end.
  speed -= speed * 0.32 * dt;
  speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, speed));

  const steerMax = 0.55 / (1 + Math.abs(speed) * 0.05);
  const steer = steerIn * steerMax;
  if (Math.abs(speed) > 0.05) {
    const boost = keys.hand ? 1.55 : 1;
    heading += (speed / 2.9) * Math.tan(steer) * dt * boost;
  }

  const step = speed * dt;
  player.position.x += Math.sin(heading) * step;
  player.position.z += Math.cos(heading) * step;
  player.position.x = Math.max(-214, Math.min(214, player.position.x));
  player.position.z = Math.max(-214, Math.min(214, player.position.z));

  if (collideBuildings(player.position, 1.7)) speed *= 0.35;
  for (const t of traffic) {
    const dx = player.position.x - t.group.position.x;
    const dz = player.position.z - t.group.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 3.6 * 3.6 && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      player.position.x = t.group.position.x + (dx / d) * 3.6;
      player.position.z = t.group.position.z + (dz / d) * 3.6;
      speed *= 0.45;
    }
  }

  player.rotation.y = heading;
  rollWheels(player, step, steer * 1.4);
  setSpeed(Math.abs(speed) * 3.6);
}

// ------------------------------------------------------------------ traffic

const trafficRng = makeRng(seed * 7919 + 13);
const traffic = [];
const policeCars = [];
if (mode !== 'shot' || shot === 'start') {
  for (let i = 0; i < 10; i += 1) {
    const police = i >= 8;
    const car = new TrafficCar(scene, trafficRng, { police });
    traffic.push(car);
    if (police) policeCars.push(car.group);
  }
}

// ------------------------------------------------------------- shot scenes

const posables = []; // extra police cars whose lamps must flash in shot scenes
let pillar = null;
let muzzle = null;
let muzzleGlow = null;
let enemyBar = null;

function glowSprite(scale, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true,
  }));
  sp.scale.setScalar(scale);
  return sp;
}

function poseShot() {
  hud.overlay.classList.add('hidden');
  if (shot === 'start') {
    hud.overlay.classList.remove('hidden');
    player.position.set(14, 0, 3.6);
    heading = Math.PI / 2 + 0.5;
    player.rotation.y = heading;
    camera.position.set(30, 4.8, 3.0);
    camera.lookAt(-14, 2.2, 4.5);
    setSpeed(0);
    return;
  }
  if (shot === 'chase') {
    player.position.set(-6, 0, 3.4);
    heading = Math.PI / 2;
    player.rotation.y = heading;
    const p1 = makeCar({ police: true });
    p1.position.set(-19, 0, 3.2);
    p1.rotation.y = Math.PI / 2;
    const p2 = makeCar({ police: true });
    p2.position.set(-24, 0, 1.0);
    p2.rotation.y = Math.PI / 2 - 0.1;
    scene.add(p1, p2);
    posables.push(p1, p2);
    camera.position.set(-34, 4.8, 4.5);
    camera.lookAt(4, 1, 3.2);
    setStars(3);
    setBanner('<b>THE HEAT IS ON</b> — lose them, Danny!');
    setSpeed(86);
    return;
  }
  if (shot === 'mission') {
    player.position.set(43.5, 0, -3.5);
    heading = 0.95;
    player.rotation.y = heading;
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffcf4d, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 34, 20, 1, true), pillarMat);
    pillar.position.set(49, 17, -8.5);
    scene.add(pillar);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 34, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a8, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    core.position.copy(pillar.position);
    scene.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.14, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcf4d }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(49, 0.25, -8.5);
    scene.add(ring);
    camera.position.set(33, 4.6, 7.5);
    camera.lookAt(47, 3.5, -6);
    setBanner('<b>MARISOL VEGA</b> — pick up the package at the Old Port, Danny. No scratches, no stories.');
    setSpeed(0);
    return;
  }
  if (shot === 'combat') {
    player.position.set(0, 0, 3.6);
    heading = Math.PI / 2;
    player.rotation.y = heading;
    const rival = makeCar({ color: 0x7a1626 });
    rival.position.set(12.5, 0, 0.8);
    rival.rotation.y = -Math.PI / 2 + 0.35;
    scene.add(rival);

    // The muzzle flash: a glowing cone from Danny's window toward the Kings' car.
    const gun = new THREE.Vector3(1.6, 1.15, 3.1);
    const aim = new THREE.Vector3(12.5 - 1.6, 0, 0.8 - 3.1).normalize();
    const coneGeo = new THREE.ConeGeometry(0.55, 3.2, 12);
    muzzle = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xffc46b, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    muzzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);
    muzzle.position.copy(gun).addScaledVector(aim, 1.6);
    scene.add(muzzle);
    muzzleGlow = glowSprite(3.4, 'rgba(255,190,90,0.95)');
    muzzleGlow.position.copy(gun);
    scene.add(muzzleGlow);

    // The Kings driver's health bar, floating over the rival car.
    enemyBar = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x14100e, transparent: true, opacity: 0.85 }),
    );
    const fillGeo = new THREE.PlaneGeometry(2.44, 0.24);
    fillGeo.translate(1.22, 0, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xe2602a }));
    fill.position.set(-1.22, 0, 0.012);
    fill.scale.x = 0.45;
    enemyBar.add(back, fill);
    enemyBar.scale.setScalar(1.3);
    enemyBar.position.set(12.5, 2.85, 0.8);
    scene.add(enemyBar);

    camera.position.set(1.5, 3.8, -10.5);
    camera.lookAt(6.5, 1.2, 2.2);
    setStars(2);
    setBanner('<b>SOLANA KINGS</b> — ambush! Take cover and return fire!');
    setSpeed(0);
  }
}
if (mode === 'shot') poseShot();

// -------------------------------------------------------------------- loop

const clock = new THREE.Clock();
const camPos = new THREE.Vector3(40, 20, 40);
const camLook = new THREE.Vector3(0, 2, 0);
const desired = new THREE.Vector3();
const ahead = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  for (const p of policeCars) updatePoliceLights(p, t);
  for (const p of posables) updatePoliceLights(p, t);

  if (mode === 'title') {
    const a = t * 0.045;
    camera.position.set(Math.cos(a) * 58, 21, Math.sin(a) * 58);
    camera.lookAt(0, 3, 0);
    for (const car of traffic) {
      car.update(dt, [player.position, ...traffic.map((c) => c.group.position)]);
    }
  } else if (mode === 'play') {
    drivePlayer(dt, traffic);
    const obstacles = [player.position, ...traffic.map((c) => c.group.position)];
    for (const car of traffic) car.update(dt, obstacles);
    // Chase camera: tucked behind and above, looking down the road ahead.
    desired.set(
      player.position.x - Math.sin(heading) * (9.5 + Math.abs(speed) * 0.07),
      4.3 + Math.abs(speed) * 0.02,
      player.position.z - Math.cos(heading) * (9.5 + Math.abs(speed) * 0.07),
    );
    camPos.lerp(desired, 1 - Math.exp(-dt * 4.5));
    camera.position.copy(camPos);
    ahead.set(
      player.position.x + Math.sin(heading) * 7,
      1.4,
      player.position.z + Math.cos(heading) * 7,
    );
    camLook.lerp(ahead, 1 - Math.exp(-dt * 6));
    camera.lookAt(camLook);
  } else {
    // Shot scenes are posed stills; only the dressing stays alive.
    if (pillar) pillar.material.opacity = 0.28 + 0.1 * (0.5 + 0.5 * Math.sin(t * 2.4));
    if (muzzle) {
      muzzle.material.opacity = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(t * 43));
      const s = 0.92 + 0.14 * Math.sin(t * 31);
      muzzle.scale.set(s, 1, s);
    }
    if (enemyBar) enemyBar.quaternion.copy(camera.quaternion);
  }

  renderer.render(scene, camera);
}
animate();
