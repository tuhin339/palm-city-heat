// The screenshot scenes behind ?shot=start|chase|play|end. Each one plays the real rules
// forward from a fresh game for a fixed number of steps, so the frame is what a short session
// really looks like and the same seed always gives the same frame. The kit's shots.json asks
// for start, play and end: play and end stage the two halves of the chase scene (rolling, then
// further down the road), and ?shot=chase is the same scene under its own name.
import { STEP } from './config.js';
import { IDLE_CONTROLS } from './game.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 7;
const CHASE_SECONDS = 15;
const CHASE_LONG_SECONDS = 24;

/**
 * Set `game` to the named scene and return the screen to draw over it plus the title-menu
 * state the renderer needs.
 */
export function stageShot(name, game) {
  if (name === 'chase' || name === 'play' || name === 'end') {
    // In the car waiting at spawn, autopilot on, and let traffic fill the streets.
    game.tryEnterExitCar();
    game.autopilot = true;
    const seconds = name === 'end' ? CHASE_LONG_SECONDS : CHASE_SECONDS;
    for (let i = 0; i < seconds / STEP; i += 1) game.step(STEP, IDLE_CONTROLS);
    return { screen: SCREEN_PLAY, ui: { menuIndex: 0, hasSave: false, muted: false } };
  }
  // The title scene: the city alive behind the panel while the camera drifts over it.
  game.cameraPan = true;
  for (let i = 0; i < START_SECONDS / STEP; i += 1) game.step(STEP, IDLE_CONTROLS);
  return { screen: SCREEN_TITLE, ui: { menuIndex: 0, hasSave: false, muted: false } };
}
