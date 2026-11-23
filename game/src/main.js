// Boot and the one loop: input is read every frame, the game advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between three screens: title (with New Game and, when a save exists, Continue),
// play, and paused. Progress is written to localStorage as you play, so Continue picks up
// where the last visit left off: same corner of Palm City, same cash, same record.
//
// ?seed=N builds a different city. ?shot=start|chase|play|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { DEFAULT_SEED, SAVE_KEY, STEP } from './config.js';
import { createGame, IDLE_CONTROLS } from './game.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_NEW, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSave(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const game = createGame(seed);
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let game = createGame(seed);
  let save = readSave();
  let screen = SCREEN_TITLE;
  let menuIndex = save !== null ? 1 : 0;
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = AUTOSAVE_SECONDS;

  game.cameraPan = true;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function beginPlay(restored) {
    game.cameraPan = false;
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce(restored ? 'Back in Palm City. Your save, your streets.' : 'Palm City Heat. Find a car, make some money.');
  }

  function startNewGame() {
    game = createGame(seed);
    save = null;
    beginPlay(false);
  }

  function startContinue() {
    game = createGame(seed);
    if (save !== null) game.restore(save);
    beginPlay(true);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE) {
      const axis = input.axis();
      if (save !== null && axis.y > 0) menuIndex = 1;
      if (save !== null && axis.y < 0) menuIndex = 0;
      if (actions & ACTION_NEW) startNewGame();
      else if (actions & ACTION_CONFIRM) {
        if (menuIndex === 1 && save !== null) startContinue();
        else startNewGame();
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        writeSave(game);
        announce('Paused. Progress saved.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_INTERACT)) {
      const result = game.tryEnterExitCar();
      if (result === 'entered') announce('In the car. Drive.');
      else if (result === 'exited') announce('On foot.');
    }
  }

  function controlsFromInput() {
    const axis = input.axis();
    if (game.player.car) {
      return {
        moveX: 0, moveY: 0, sprint: false,
        throttle: -axis.y, steer: axis.x, handbrake: input.shift(),
      };
    }
    return {
      moveX: axis.x, moveY: axis.y, sprint: input.shift(),
      throttle: 0, steer: 0, handbrake: false,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      const controls = screen === SCREEN_PLAY ? controlsFromInput() : IDLE_CONTROLS;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        game.step(STEP, controls);
        accumulator -= STEP;
        if (screen === SCREEN_PLAY) {
          autosaveTimer -= STEP;
          if (autosaveTimer <= 0) {
            autosaveTimer = AUTOSAVE_SECONDS;
            writeSave(game);
          }
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game, screen, { menuIndex, hasSave: save !== null, muted: input.muted() });
  }

  // Leaving the tab pauses a running game and banks the progress.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      writeSave(game);
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    }
  });

  announce('Palm City Heat. New Game, or Continue where you left off.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
