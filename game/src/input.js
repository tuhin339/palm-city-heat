// Keyboard and pointer input. Held keys give the movement axes (the same WASD/arrows walk the
// player and drive the car; the game decides which), Shift is sprint on foot and the handbrake
// in a car, and one-shot presses (confirm, pause, interact, mute, new game) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;
export const ACTION_NEW = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);
const NEW_GAME = new Set(['KeyN']);
const SHIFT = new Set(['ShiftLeft', 'ShiftRight']);

const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...CONFIRM, ...PAUSE, ...INTERACT, ...MUTE, ...NEW_GAME, ...SHIFT]);

export function createInput(target) {
  const held = { left: false, right: false, up: false, down: false, shift: false };
  let actions = 0;
  let muted = false;

  function flagFor(code) {
    if (CONFIRM.has(code)) return ACTION_CONFIRM;
    if (PAUSE.has(code)) return ACTION_PAUSE;
    if (INTERACT.has(code)) return ACTION_INTERACT;
    if (MUTE.has(code)) return ACTION_MUTE;
    if (NEW_GAME.has(code)) return ACTION_NEW;
    return 0;
  }

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (SHIFT.has(event.code)) held.shift = true;
    else if (!event.repeat) {
      const flag = flagFor(event.code);
      if (flag === ACTION_MUTE) muted = !muted;
      actions |= flag;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (SHIFT.has(event.code)) held.shift = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
    held.up = false;
    held.down = false;
    held.shift = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** The held movement axes, each -1..1: x is left/right, y is up/down. */
    axis() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** Shift: sprint on foot, handbrake in a car. */
    shift() {
      return held.shift;
    },
    /** The sound flag M toggles; session 2's audio reads it, the HUD shows it. */
    muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
