// The screenshot scenes behind ?shot=start|chase|play|end|mission|combat. Each one plays the
// real rules forward from a fresh game for a fixed number of steps, so the frame is what a
// short session really looks like and the same seed always gives the same frame. The kit's
// shots.json asks for start, play and end: play and end stage the two halves of the chase
// scene (rolling, then further down the road), and ?shot=chase is the same scene under its
// own name. Mission stands Danny beside Marisol's marked car with the job on the banner;
// combat stages the Old Port shootout with the autopilot trading fire with the Solana Kings.
// The staged scenes run as cinematics: the law pursues and the Kings shoot, but nobody is
// arrested or killed mid-photograph.
import { STEP } from './config.js';
import { IDLE_CONTROLS } from './game.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { setWantedStars, spawnPoliceCar } from './police.js';
import { startMission } from './missions.js';

const START_SECONDS = 7;
const CHASE_SECONDS = 15;
const CHASE_LONG_SECONDS = 24;
const MISSION_SECONDS = 2.5;
const COMBAT_SECONDS = 7;

function stepFor(game, seconds, controls = IDLE_CONTROLS) {
  for (let i = 0; i < seconds / STEP; i += 1) game.step(STEP, controls);
}

/**
 * The chase: Danny's car under autopilot through live traffic, three stars on his name and
 * two interceptors already rolling up Seabreeze Drive behind him, with the rest of the
 * shift joining from the junctions as the hunt develops.
 */
function stageChase(game, seconds) {
  game.tryEnterExitCar();
  game.autopilot = true;
  game.cinematic = true;
  setWantedStars(game, 3);
  const player = game.player;
  spawnPoliceCar(game, player.x - 460, player.y + 78, 0);
  spawnPoliceCar(game, player.x - 590, player.y + 78, 0);
  stepFor(game, seconds);
  return { screen: SCREEN_PLAY, ui: { menuIndex: 0, hasSave: false, muted: false } };
}

/** The first job, accepted: Danny on foot beside the marked GT, the banner carrying his orders. */
function stageMission(game) {
  game.cinematic = true;
  game.acceptMission();
  const target = game.missionState.active.targetCar;
  const player = game.player;
  player.x = target.x + 46;
  player.y = target.y + 14;
  player.angle = Math.atan2(target.y - player.y, target.x - player.x);
  game.camera.x = player.x;
  game.camera.y = player.y;
  stepFor(game, MISSION_SECONDS);
  return { screen: SCREEN_PLAY, ui: { menuIndex: 0, hasSave: false, muted: false } };
}

/**
 * The finale, staged: the Port Authority job started, Danny walked into the plaza, and the
 * autopilot trading shots with whichever King is still standing — aimed fresh every step,
 * through the same combat rules a player gets.
 */
function stageCombat(game) {
  game.cinematic = true;
  startMission(game, 3);
  const player = game.player;
  // Walk Danny in from the plaza's west edge, inside the Kings' waking range.
  const first = game.gang[0];
  player.x = first.x - 175;
  player.y = first.y + 30;
  player.angle = 0;
  game.camera.x = player.x;
  game.camera.y = player.y;
  const steps = Math.floor(COMBAT_SECONDS / STEP);
  for (let i = 0; i < steps; i += 1) {
    let target = null;
    for (const member of game.gang) {
      if (member.state !== 'down') {
        target = member;
        break;
      }
    }
    const controls = target
      ? { ...IDLE_CONTROLS, fire: true, aimX: target.x, aimY: target.y }
      : IDLE_CONTROLS;
    game.step(STEP, controls);
  }
  return { screen: SCREEN_PLAY, ui: { menuIndex: 0, hasSave: false, muted: false } };
}

/**
 * Set `game` to the named scene and return the screen to draw over it plus the title-menu
 * state the renderer needs.
 */
export function stageShot(name, game) {
  if (name === 'chase' || name === 'play') return stageChase(game, CHASE_SECONDS);
  if (name === 'end') return stageChase(game, CHASE_LONG_SECONDS);
  if (name === 'mission') return stageMission(game);
  if (name === 'combat') return stageCombat(game);
  // The title scene: the city alive behind the panel while the camera drifts over it.
  game.cameraPan = true;
  stepFor(game, START_SECONDS);
  return { screen: SCREEN_TITLE, ui: { menuIndex: 0, hasSave: false, muted: false } };
}
