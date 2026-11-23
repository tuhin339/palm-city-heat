// Marisol Vega's jobs in 3D: the same fixer, the same Danny, a chain of driving
// jobs marked by the gold pillar of light. Fetch a package out of the Old Port
// and drop it in Cactus Heights; collect a marked red Solana GT and bring it to
// Marisol's garage in Marina Mile; then a timed escape run that starts at three
// stars. Each job pays, each unlocks the next, and a job that ends in handcuffs,
// a hospital bed or an empty timer is offered again on the same phone.

import { streetAt } from './city.js';
import { makeCar } from './cars.js';

export const MISSION_DEFS = [
  { id: 'port-package', title: 'Port Package', reward: 600 },
  { id: 'first-wheels', title: 'First Wheels', reward: 450 },
  { id: 'heat-run', title: 'Heat Run', reward: 750 },
];

const ESCAPE_SECONDS = 80;
const REACH = 7.5;

const SPOTS = {
  package: { x: streetAt(2) + 3.4, z: streetAt(2) + 3.4 }, // the Old Port, south-east
  delivery: { x: streetAt(-2) - 3.4, z: streetAt(-2) - 3.4 }, // Cactus Heights, north-west
  gt: { x: streetAt(2) + 3.4, z: streetAt(1) + 18 }, // parked up in Downtown Palms
  garage: { x: streetAt(-2) + 3.4, z: streetAt(2) + 3.4 }, // Marisol's garage, Marina Mile
  escape: { x: streetAt(-3) + 3.4, z: streetAt(3) - 3.4 }, // the Marina coast, far south-west
};

const OFFER_TEXTS = [
  "Danny. Marisol. A package is sitting in the Old Port with my name on it — fetch it, drop it in Cactus Heights. $600. Press <b>T</b> if you're in.",
  "You drive like you mean it. A red Solana GT is parked up in Downtown Palms — collect it, bring it to my garage in Marina Mile. $450. Press <b>T</b>.",
  "Last one, and it's loud: the PD will know your name — three stars, one clock, the Marina coast. $750. Press <b>T</b> if you're sure.",
];

const BRIEF_TEXTS = [
  'The package is under the gold pillar in the Old Port. Drive through it, then run it to Cactus Heights.',
  "The GT is marked in Downtown Palms. Get in with <b>E</b>, then drive it to the garage in Marina Mile.",
  'Run. Reach the coast marker before the clock dies — and the heat is already on you.',
];

const DONE_TEXTS = [
  "Clean work. $600, wired. You're better than your reputation, Danny.",
  'She purrs. $450. Quietly done, just how I like it.',
];

const OUTRO_TEXT = "<b>CITY CLEARED</b> — that's everything, Danny. The port's mine, the city's yours, and your phone stays quiet — until it doesn't. — M";

export function createMissions(scene, savedIndex = 0) {
  let nextIndex = Math.max(0, Math.min(MISSION_DEFS.length, savedIndex | 0));
  let active = null;
  let offered = false;
  let bannerUntil = 0;
  let gt = null; // the marked Solana GT's group, while the job is staged

  // The gold pillar of light that marks every objective, as in the shot scene.
  const pillarGroup = new THREE.Group();
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0xffcf4d, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 34, 20, 1, true), pillarMat);
  pillar.position.y = 17;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 34, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  core.position.y = 17;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.14, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  pillarGroup.add(pillar, core, ring);
  pillarGroup.visible = false;
  scene.add(pillarGroup);

  let waypoint = null;
  function setWaypoint(x, z) {
    waypoint = { x, z };
    pillarGroup.position.set(x, 0, z);
    pillarGroup.visible = true;
  }
  function clearWaypoint() {
    waypoint = null;
    pillarGroup.visible = false;
  }

  function announce(ctx, html, seconds = 9) {
    ctx.banner(html);
    bannerUntil = seconds === Infinity ? Infinity : ctx.time + seconds;
  }

  function offer(ctx) {
    if (nextIndex >= MISSION_DEFS.length) return;
    offered = true;
    if (ctx.audio) ctx.audio.play('phone');
    announce(ctx, `<b>MARISOL VEGA</b> — ${OFFER_TEXTS[nextIndex]}`, Infinity);
  }

  /** Called when Danny first takes the wheel: the first job is on the phone. */
  function begin(ctx) {
    if (nextIndex < MISSION_DEFS.length && !active) offer(ctx);
    else if (nextIndex >= MISSION_DEFS.length) ctx.objective('');
  }

  function start(ctx, index) {
    offered = false;
    active = { index, stage: 'start', timer: 0, failed: false };
    if (index === 0) {
      active.stage = 'pickup';
      setWaypoint(SPOTS.package.x, SPOTS.package.z);
    } else if (index === 1) {
      if (!gt) {
        gt = makeCar({ color: 0xe63946 });
        scene.add(gt);
      }
      gt.position.set(SPOTS.gt.x, 0, SPOTS.gt.z);
      gt.rotation.y = Math.PI;
      gt.userData.parkedHeading = Math.PI;
      active.stage = 'collect';
      setWaypoint(gt.position.x, gt.position.z);
    } else if (index === 2) {
      active.stage = 'run';
      active.timer = ESCAPE_SECONDS;
      setWaypoint(SPOTS.escape.x, SPOTS.escape.z);
      ctx.setWanted(3);
    }
    if (ctx.audio) ctx.audio.play('phone');
    announce(ctx, `<b>${MISSION_DEFS[index].title.toUpperCase()}</b> — ${BRIEF_TEXTS[index]}`, 9);
  }

  /** The T key: take the offered job, or run a failed one again. */
  function accept(ctx) {
    if (!ctx.playing || ctx.over) return;
    if (active && active.failed) {
      if (ctx.isDrivingGt()) ctx.swapBackToHero();
      start(ctx, active.index);
      return;
    }
    if (!active && offered) start(ctx, nextIndex);
  }

  function complete(ctx) {
    const index = active.index;
    const reward = MISSION_DEFS[index].reward;
    active = null;
    clearWaypoint();
    ctx.objective('');
    ctx.addCash(reward);
    if (ctx.audio) {
      ctx.audio.play('cash');
      ctx.audio.play('complete');
    }
    nextIndex = index + 1;
    ctx.save();
    if (index === MISSION_DEFS.length - 1) {
      announce(ctx, OUTRO_TEXT, 12);
    } else {
      // The pay note and the next offer arrive as one phone message, as in 2D.
      offered = true;
      if (ctx.audio) ctx.audio.play('phone');
      announce(ctx, `<b>MARISOL VEGA</b> — ${DONE_TEXTS[index]} ${OFFER_TEXTS[nextIndex]}`, Infinity);
    }
  }

  function fail(ctx, reason) {
    if (!active) return;
    active.failed = true;
    clearWaypoint();
    ctx.objective('');
    announce(ctx, `<b>MARISOL VEGA</b> — ${reason} The job's still open — press <b>T</b> to run it again.`, 10);
  }

  /** Busted or wasted mid-job: the job dies with the run, as in the 2D game. */
  function onPlayerDown(ctx, kind) {
    if (active && !active.failed) {
      fail(ctx, kind === 'busted' ? 'Busted. Handcuffs end the conversation.' : 'You woke up in Palm City General.');
    }
  }

  /**
   * One step of the story. ctx: { time, playing, over, playerPos, isDrivingGt,
   * gtPos, banner, objective, addCash, audio, setWanted, reportTheft, save,
   * finishGtDelivery, isDrivingGt, swapBackToHero }.
   */
  function update(dt, ctx) {
    if (bannerUntil !== Infinity && ctx.time > bannerUntil && !offered) {
      ctx.banner('');
      bannerUntil = Infinity;
    }
    if (pillarGroup.visible) {
      pillarMat.opacity = 0.28 + 0.1 * (0.5 + 0.5 * Math.sin(ctx.time * 2.4));
      ring.rotation.z = ctx.time * 0.8;
    }
    if (!active || active.failed || !ctx.playing || ctx.over) return;

    const p = ctx.playerPos;
    if (active.index === 0) {
      if (active.stage === 'pickup') {
        ctx.objective('Pick up the package — Old Port');
        if (Math.hypot(p.x - SPOTS.package.x, p.z - SPOTS.package.z) < REACH) {
          active.stage = 'deliver';
          setWaypoint(SPOTS.delivery.x, SPOTS.delivery.z);
          if (ctx.audio) ctx.audio.play('pickup');
          if (ctx.reportTheft) ctx.reportTheft(SPOTS.package.x, SPOTS.package.z);
          announce(ctx, 'Package aboard. <b>Cactus Heights</b> — follow the gold pillar.', 6);
        }
      } else {
        ctx.objective('Deliver the package — Cactus Heights');
        if (Math.hypot(p.x - SPOTS.delivery.x, p.z - SPOTS.delivery.z) < REACH) complete(ctx);
      }
      return;
    }

    if (active.index === 1) {
      if (active.stage === 'collect') {
        setWaypoint(gt.position.x, gt.position.z);
        ctx.objective(ctx.isDrivingGt()
          ? 'Drive the GT to the garage — Marina Mile'
          : 'Collect the red Solana GT — Downtown Palms (E to get in)');
        if (ctx.isDrivingGt()) {
          active.stage = 'deliver';
          setWaypoint(SPOTS.garage.x, SPOTS.garage.z);
          announce(ctx, "That's the one. My garage, <b>Marina Mile</b> — follow the gold pillar.", 6);
        }
      } else {
        ctx.objective('Deliver the GT to the garage — Marina Mile');
        const g = ctx.gtPos();
        if (Math.hypot(g.x - SPOTS.garage.x, g.z - SPOTS.garage.z) < REACH) {
          if (ctx.isDrivingGt()) ctx.finishGtDelivery();
          complete(ctx);
        }
      }
      return;
    }

    if (active.index === 2) {
      active.timer -= dt;
      if (active.timer <= 0) {
        fail(ctx, 'Out of time.');
        return;
      }
      ctx.objective(`Reach the Marina coast — ${Math.ceil(active.timer)}s left, and lose the heat if you can`);
      if (Math.hypot(p.x - SPOTS.escape.x, p.z - SPOTS.escape.z) < REACH) complete(ctx);
    }
  }

  return {
    begin,
    accept,
    update,
    onPlayerDown,
    get nextIndex() { return nextIndex; },
    get active() { return active; },
    get waypoint() { return waypoint; },
    get gtGroup() { return gt; },
    /** Where the GT currently sits (for collision and the minimap), or null. */
    gtPos() { return gt ? gt.position : null; },
  };
}
