// Palm City Heat 3D: the boot and the game loop. It grows the seeded city, parks
// Danny's car on the avenue, and either waits on the title screen (camera drifting
// over the rooftops), hands over the keys, or poses one of the deterministic shot
// scenes (?shot=start|chase|mission|combat&seed=1) for the screenshots. Driving is
// an arcade model — throttle, brake, speed-sensitive steering, a handbrake — with
// circle-versus-AABB collision against the towers and the other cars.

import { makeRng, seedFromUrl, shotFromUrl } from './rng.js';
import { buildCity, streetAt } from './city.js';
import { makeCar, TrafficCar, updatePoliceLights, rollWheels } from './cars.js';
import { createAudio } from './audio.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createMinimap } from './minimap.js';

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

// The live-play HUD pieces: objective line, bust meter, car health, the card.
const objectiveEl = document.getElementById('objective');
const bustBar = document.getElementById('bustbar');
const bustFill = document.getElementById('bustfill');
const healthFill = document.getElementById('healthfill');
const cardEl = document.getElementById('card');
const cardTitle = document.getElementById('cardTitle');
const cardSub = document.getElementById('cardSub');
function setObjective(text) {
  objectiveEl.textContent = text || '';
  objectiveEl.classList.toggle('on', Boolean(text));
}

// ------------------------------------------------- cash and the saved game

const SAVE_KEY = 'palm-city-heat-3d.save.v1';
let savedGame = {};
try {
  savedGame = JSON.parse(window.localStorage.getItem(SAVE_KEY)) || {};
} catch {
  savedGame = {};
}
let cash = Number.isFinite(savedGame.cash) ? Math.max(0, savedGame.cash | 0) : 1250;
const progress = {
  missionIndex: Number.isFinite(savedGame.missionIndex) ? savedGame.missionIndex : 0,
};
function persist() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash, missionIndex: progress.missionIndex }));
  } catch {
    // No storage (private mode, headless): the game plays on unsaved.
  }
}
function addCash(n) {
  cash = Math.max(0, cash + n);
  setCash(cash);
  persist();
}
setStars(0);
setCash(cash);

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
  document.body.classList.add('playing');
  hud.overlay.classList.add('hidden');
  hud.status.textContent = 'Driving. W A S D to drive, Space for the handbrake, mouse or F to fire, T for jobs, E to swap cars, M to mute.';
  if (audio) audio.unlock();
  if (missions) missions.begin(missionCtx());
}
document.getElementById('startBtn').addEventListener('click', startDriving);
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Enter') startDriving();
  if (ev.code === 'KeyM' && audio) {
    audio.unlock();
    audio.setMuted(!audio.muted);
    hud.status.textContent = audio.muted ? 'Sound muted.' : 'Sound on.';
  }
  if (ev.code === 'KeyT' && missions) missions.accept(missionCtx());
  if (ev.code === 'KeyE') trySwap();
  if (ev.code === 'KeyF') firing = true;
  const k = KEYMAP[ev.code];
  if (k) {
    keys[k] = true;
    if (k === 'hand' || k.startsWith('Arrow')) ev.preventDefault();
  }
});
window.addEventListener('keyup', (ev) => {
  if (ev.code === 'KeyF') firing = false;
  const k = KEYMAP[ev.code];
  if (k) keys[k] = false;
});

// ------------------------------------------------------- the driver's gun

const aim = { active: false, x: 0, z: 0 };
let firing = false;
const aimRay = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimHit = new THREE.Vector3();
window.addEventListener('pointermove', (ev) => {
  const ndc = new THREE.Vector2(
    (ev.clientX / window.innerWidth) * 2 - 1,
    -(ev.clientY / window.innerHeight) * 2 + 1,
  );
  aimRay.setFromCamera(ndc, camera);
  if (aimRay.ray.intersectPlane(aimPlane, aimHit)) {
    aim.active = true;
    aim.x = aimHit.x;
    aim.z = aimHit.z;
  }
});
window.addEventListener('pointerdown', (ev) => {
  if (ev.button === 0) {
    firing = true;
    if (audio) audio.unlock();
  }
});
window.addEventListener('pointerup', (ev) => {
  if (ev.button === 0) firing = false;
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
headlight.target = headlightTarget;
// The light rides in a rig so it can move to whichever car Danny is driving.
const rig = new THREE.Group();
rig.add(headlight, headlightTarget);
player.add(rig);

/** The car Danny is driving right now: his own, or the marked GT on a job. */
let driven = player;

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

const NO_KEYS = { up: false, down: false, left: false, right: false, hand: false };

/**
 * Drive the car Danny is in. `solids` are extra car groups (patrol cars, the
 * marked GT) that collide like traffic does. A hit at speed is a ram: the law,
 * the Kings and Danny's own paintwork all hear about it through onRam. With
 * `control` off the car just coasts — the busted and wasted cards play over it.
 */
function drivePlayer(dt, traffic, solids, control = true) {
  const k = control ? keys : NO_KEYS;
  const impact = Math.abs(speed);
  const steerIn = (k.left ? 1 : 0) - (k.right ? 1 : 0);
  if (k.up) speed += 15 * dt;
  else if (k.down) speed -= (speed > 0.5 ? 26 : 8) * dt;
  if (k.hand) {
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), 30 * dt);
  }
  // Rolling drag and a soft top end.
  speed -= speed * 0.32 * dt;
  speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, speed));

  const steerMax = 0.55 / (1 + Math.abs(speed) * 0.05);
  const steer = steerIn * steerMax;
  if (Math.abs(speed) > 0.05) {
    const boost = k.hand ? 1.55 : 1;
    heading += (speed / 2.9) * Math.tan(steer) * dt * boost;
  }

  const step = speed * dt;
  driven.position.x += Math.sin(heading) * step;
  driven.position.z += Math.cos(heading) * step;
  driven.position.x = Math.max(-214, Math.min(214, driven.position.x));
  driven.position.z = Math.max(-214, Math.min(214, driven.position.z));

  if (collideBuildings(driven.position, 1.7)) {
    if (impact > 10 && control) {
      if (audio) audio.play('crash');
      if (combat) combat.damagePlayerCar((impact - 10) * 0.25, combatCtx());
    }
    speed *= 0.35;
  }
  const hitCar = (group) => {
    const dx = driven.position.x - group.position.x;
    const dz = driven.position.z - group.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 3.6 * 3.6 && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      driven.position.x = group.position.x + (dx / d) * 3.6;
      driven.position.z = group.position.z + (dz / d) * 3.6;
      speed *= 0.45;
      if (impact > 7.5 && control) onRam(group, impact);
    }
  };
  for (const t of traffic) {
    if (t.group !== driven) hitCar(t.group);
  }
  for (const g of solids) {
    if (g !== driven) hitCar(g);
  }

  driven.rotation.y = heading;
  rollWheels(driven, step, steer * 1.4);
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

// ------------------------------------------------- the living systems (3D)
//
// Everything the core left out — the law, the crowd, the Kings, Marisol's jobs,
// the minimap and the sounds — lives in its own module and is wired together
// here. Shot scenes never build any of it: a staged frame stays exactly as
// posed, with no live system anywhere near it.

const gameRng = makeRng(seed * 31 + 7);
let audio = null;
let peds = null;
let police = null;
let combat = null;
let missions = null;
let minimap = null;
if (mode !== 'shot') {
  audio = createAudio();
  combat = createCombat(scene, gameRng);
  combat.createKings(traffic);
  peds = createPeds(scene, gameRng, colliders);
  police = createPolice(scene, gameRng, colliders);
  missions = createMissions(scene, progress.missionIndex);
  minimap = createMinimap(document.getElementById('minimap'));
}

let elapsed = 0; // the play clock: cooldowns, banners and timers read it
let over = null; // { kind: 'busted' | 'wasted', timer } while the card is up
let lastStars = 0;
let saveTimer = 0;

function playerVel() {
  return { x: Math.sin(heading) * speed, z: Math.cos(heading) * speed };
}

/** Extra car groups that collide and can be shot: patrol cars and the GT. */
function extraSolids() {
  const out = [];
  if (police) for (const c of police.cops) out.push(c.group);
  if (missions && missions.gtGroup) out.push(missions.gtGroup);
  return out;
}

/** Every car's position, for the cops' shouldering and the traffic's braking. */
function allCarPositions() {
  const out = traffic.map((c) => c.group.position);
  if (police) for (const c of police.cops) out.push(c.group.position);
  if (missions && missions.gtGroup && driven !== missions.gtGroup) out.push(missions.gtGroup.position);
  return out;
}

function witnessLists() {
  return {
    peds: peds ? peds.list.map((p) => ({ x: p.group.position.x, z: p.group.position.z })) : [],
    cars: traffic.map((c) => ({
      x: c.group.position.x, z: c.group.position.z, cop: Boolean(c.group.userData.lamps),
    })),
  };
}

function policeCtx() {
  return {
    time: elapsed,
    playerPos: driven.position,
    playerVel: playerVel(),
    playerSpeedAbs: Math.abs(speed),
    solids: [...allCarPositions(), driven.position],
    playing: mode === 'play',
    over: Boolean(over),
    onBusted: () => startOver('busted'),
    onStarsChanged: (n, rose) => { if (rose && audio) audio.play('siren'); },
  };
}

function combatCtx() {
  return {
    time: elapsed,
    playing: mode === 'play',
    over: Boolean(over),
    camera,
    colliders,
    trafficCars: traffic,
    extraCars: extraSolids(),
    drivenGroup: driven,
    playerPos: driven.position,
    playerVel: playerVel(),
    playerHeading: heading,
    aim,
    firing,
    audio,
    panicAt: (x, z, r) => { if (peds) peds.panicAt(x, z, r); },
    spawnRunner: (x, z, h) => { if (peds) peds.spawnRunner(x, z, h); },
    reportShot: () => reportCrime('shots', driven.position.x, driven.position.z),
    reportShotCop: (x, z) => reportCrime('copHit', x, z),
    onWasted: () => startOver('wasted'),
  };
}

function pedsCtx() {
  const cars = [];
  for (const c of traffic) cars.push({ x: c.group.position.x, z: c.group.position.z, speed: Math.abs(c.speed) });
  if (police) for (const c of police.cops) cars.push({ x: c.group.position.x, z: c.group.position.z, speed: Math.abs(c.speed) });
  cars.push({ x: driven.position.x, z: driven.position.z, speed: Math.abs(speed) });
  return {
    playerPos: driven.position,
    playerSpeed: Math.abs(speed),
    playerHeading: heading,
    cars,
    playing: mode === 'play' && !over,
    onPedHit: () => {
      addCash(-40);
      reportCrime('pedHit', driven.position.x, driven.position.z);
      if (audio) audio.play('crash');
    },
  };
}

function missionCtx() {
  return {
    time: elapsed,
    playing: mode === 'play',
    over: Boolean(over),
    playerPos: driven.position,
    banner: (html) => setBanner(html),
    objective: (text) => setObjective(text),
    addCash: (n) => addCash(n),
    audio,
    setWanted: (n) => { if (police) police.setWanted(n, policeCtx()); },
    reportTheft: (x, z) => reportCrime('theft', x, z),
    save: () => { progress.missionIndex = missions.nextIndex; persist(); },
    isDrivingGt: () => Boolean(missions.gtGroup) && driven === missions.gtGroup,
    gtPos: () => missions.gtPos(),
    swapBackToHero: () => swapToHero(),
    finishGtDelivery: () => swapToHero(),
  };
}

/** A crime, priced in stars if the street saw it — the systems' one doorway. */
function reportCrime(kind, x, z) {
  if (!police || mode !== 'play' || over) return false;
  return police.reportCrime(kind, x, z, witnessLists(), policeCtx(), elapsed);
}

/** Danny's car met something at speed: route the consequences. */
function onRam(group, impact) {
  if (mode !== 'play' || over) return;
  if (audio) audio.play('crash');
  const car = traffic.find((c) => c.group === group);
  if (car && car.king) {
    combat.damageKing(car.king, impact * 2.0, combatCtx());
    reportCrime('crash', group.position.x, group.position.z);
  } else if (group.userData.lamps) {
    reportCrime('copHit', group.position.x, group.position.z);
  } else {
    reportCrime('crash', group.position.x, group.position.z);
  }
  if (combat) combat.damagePlayerCar(Math.max(0, impact - 4) * 0.5, combatCtx());
}

// ------------------------------------------------------------ swapping cars

function swapTo(carGroup) {
  driven.userData.parkedHeading = heading;
  driven = carGroup;
  heading = carGroup.userData.parkedHeading ?? carGroup.rotation.y;
  speed = 0;
  rig.removeFromParent();
  carGroup.add(rig);
  camPos.set(
    driven.position.x - Math.sin(heading) * 10,
    4.3,
    driven.position.z - Math.cos(heading) * 10,
  );
  camLook.set(
    driven.position.x + Math.sin(heading) * 7,
    1.4,
    driven.position.z + Math.cos(heading) * 7,
  );
}

/** Back to Danny's own car: if he left it across the city, it gets dropped off. */
function swapToHero() {
  if (driven === player) return;
  if (player.position.distanceTo(driven.position) > 30) {
    player.position.set(driven.position.x + 4.5, 0, driven.position.z + 2);
    collideBuildings(player.position, 1.7);
    player.rotation.y = heading;
    player.userData.parkedHeading = heading;
  }
  swapTo(player);
}

/** The E key: into the marked GT beside Danny, or back out of it into his own. */
function trySwap() {
  if (mode !== 'play' || over) return;
  const gt = missions && missions.gtGroup;
  if (driven === player && gt && driven.position.distanceTo(gt.position) < 5) {
    swapTo(gt);
    return;
  }
  if (driven !== player && driven.position.distanceTo(player.position) < 5) swapTo(player);
}

// ------------------------------------------------- busted, wasted, respawn

/** Caught or flattened: put the card up; the respawn happens when it runs out. */
function startOver(kind) {
  if (over || mode !== 'play') return;
  over = { kind, timer: 2.8 };
  firing = false;
  if (audio) audio.play(kind);
  cardEl.className = `${kind} show`;
  cardTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  cardSub.textContent = kind === 'busted'
    ? 'The Palm City PD thanks you for stopping.'
    : 'Palm City General patches Danny up.';
  if (missions) missions.onPlayerDown(missionCtx(), kind);
}

/** Serve the sentence: fee taken, stars cleared, Danny set down and driving. */
function respawn(kind) {
  cardEl.classList.remove('show');
  const fee = kind === 'busted'
    ? Math.min(cash, Math.max(25, Math.round(cash * 0.12)))
    : Math.min(cash, Math.max(20, Math.round(cash * 0.1)));
  addCash(-fee);
  if (driven !== player) swapToHero();
  // Busted wakes at the Downtown Palms station; wasted at the Marina garage.
  const spot = kind === 'busted'
    ? { x: streetAt(1) - 3.4, z: streetAt(-1) }
    : { x: streetAt(-2) + 3.4, z: streetAt(2) };
  heading = kind === 'busted' ? 0 : Math.PI / 2;
  speed = 0;
  player.position.set(spot.x, 0, spot.z);
  player.rotation.y = heading;
  player.userData.parkedHeading = heading;
  if (police) police.setWanted(0, policeCtx());
  if (combat) combat.resetPlayerCar();
  camPos.set(spot.x - Math.sin(heading) * 10, 4.3, spot.z - Math.cos(heading) * 10);
  camLook.set(spot.x + Math.sin(heading) * 7, 1.4, spot.z + Math.cos(heading) * 7);
  over = null;
  setBanner(kind === 'busted'
    ? `<b>RELEASED</b> — $${fee} lighter. Any job that was running is still open.`
    : `<b>DISCHARGED</b> — $${fee} to Palm City General. Danny drives again.`);
}

/** The per-frame HUD the live systems feed: stars, health, bust, minimap. */
function refreshHud() {
  if (police && police.stars !== lastStars) {
    lastStars = police.stars;
    setStars(lastStars);
  }
  const health = combat ? combat.playerHealth : 100;
  healthFill.style.width = `${health}%`;
  healthFill.style.background = health > 50 ? '#8be28b' : health > 25 ? '#f4d35e' : '#e5534b';
  const bust = police ? police.bust : 0;
  bustBar.classList.toggle('on', bust > 0.02);
  bustFill.style.width = `${bust * 100}%`;
  if (minimap) {
    minimap.draw({
      time: elapsed,
      playerPos: driven.position,
      playerHeading: heading,
      cops: police ? police.cops.filter((c) => c.state === 'pursuit').map((c) => c.group.position) : [],
      kings: combat ? combat.kings.filter((k) => k.state !== 'disabled').map((k) => k.car.group.position) : [],
      waypoint: missions ? missions.waypoint : null,
    });
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
    const obstacles = [player.position, ...traffic.map((c) => c.group.position)];
    if (peds) for (const p of peds.list) obstacles.push(p.group.position);
    for (const car of traffic) {
      if (!car.disabled) car.update(dt, obstacles);
    }
    if (peds) peds.update(dt, pedsCtx());
  } else if (mode === 'play') {
    elapsed += dt;
    if (over) {
      over.timer -= dt;
      drivePlayer(dt, traffic, extraSolids(), false);
      if (over.timer <= 0) respawn(over.kind);
    } else {
      drivePlayer(dt, traffic, extraSolids(), true);
    }
    const obstacles = [driven.position, ...allCarPositions()];
    if (peds) for (const p of peds.list) obstacles.push(p.group.position);
    for (const car of traffic) {
      if (!car.disabled) car.update(dt, obstacles);
    }
    if (police) police.update(dt, policeCtx());
    if (peds) peds.update(dt, pedsCtx());
    if (combat) combat.update(dt, combatCtx());
    if (missions) missions.update(dt, missionCtx());
    if (audio) audio.update(police ? police.nearestCopDistance : Infinity, police ? police.stars : 0);
    refreshHud();
    saveTimer -= dt;
    if (saveTimer <= 0) {
      saveTimer = 5;
      persist();
    }
    // Chase camera: tucked behind and above, looking down the road ahead.
    desired.set(
      driven.position.x - Math.sin(heading) * (9.5 + Math.abs(speed) * 0.07),
      4.3 + Math.abs(speed) * 0.02,
      driven.position.z - Math.cos(heading) * (9.5 + Math.abs(speed) * 0.07),
    );
    camPos.lerp(desired, 1 - Math.exp(-dt * 4.5));
    camera.position.copy(camPos);
    ahead.set(
      driven.position.x + Math.sin(heading) * 7,
      1.4,
      driven.position.z + Math.cos(heading) * 7,
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

// A small handle for the headless drive tests: read the living game's state,
// and place Danny where a script needs him. Invisible in play.
if (mode !== 'shot') {
  window.__heat = {
    state: () => ({
      mode,
      cash,
      stars: police ? police.stars : 0,
      bust: police ? police.bust : 0,
      health: combat ? combat.playerHealth : 100,
      missionIndex: missions ? missions.nextIndex : 0,
      mission: missions && missions.active
        ? { index: missions.active.index, stage: missions.active.stage, failed: missions.active.failed }
        : null,
      waypoint: missions ? missions.waypoint : null,
      player: { x: driven.position.x, z: driven.position.z },
      heading,
      speedKmh: Math.abs(speed) * 3.6,
      traffic: traffic.map((c) => ({ x: c.group.position.x, z: c.group.position.z })),
      drivingGt: Boolean(missions && missions.gtGroup) && driven === missions.gtGroup,
      kings: combat ? combat.kings.map((k) => ({ health: k.health, state: k.state })) : [],
      peds: peds ? peds.list.length : 0,
      cops: police ? police.cops.length : 0,
      copsPos: police ? police.cops.map((c) => ({
        x: Math.round(c.group.position.x), z: Math.round(c.group.position.z), state: c.state,
      })) : [],
    }),
    teleport: (x, z) => {
      driven.position.set(x, 0, z);
      speed = 0;
    },
    setStars: (n) => { if (police) police.setWanted(n, policeCtx()); },
    acceptMission: () => { if (missions) missions.accept(missionCtx()); },
    swap: () => trySwap(),
  };
}
animate();
