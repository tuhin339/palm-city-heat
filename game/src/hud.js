// The heads-up display, drawn in view space over the world: cash and health top-left, the clock
// and district name, a hint line that follows what the player is doing, and the minimap in the
// top-right corner. drawMinimap takes extra markers ({x, y, color, pulse}) beyond the traffic
// it always shows: session 2 passes police and mission markers through game.markers.
import { FONT, PALETTE, VIEW } from './config.js';

const MINIMAP = { width: 216, height: 162, margin: 16 };

function cachedLabel(format) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = format(next);
    }
    return text;
  };
}

const cashLabel = cachedLabel((cash) => `$${cash.toLocaleString('en-US')}`);
const clockLabel = cachedLabel((minutes) => {
  const whole = Math.floor(minutes);
  const hh = String(Math.floor(whole / 60) % 24).padStart(2, '0');
  const mm = String(whole % 60).padStart(2, '0');
  return `${hh}:${mm}`;
});

const fonts = new Map();
function setFont(ctx, size, weight) {
  const key = `${weight || ''} ${size}`;
  if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
  ctx.font = fonts.get(key);
}

function text(ctx, value, x, y, size, color, align, weight) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

function shadowText(ctx, value, x, y, size, color, align, weight) {
  text(ctx, value, x + 2, y + 2, size, 'rgba(20, 10, 14, 0.6)', align, weight);
  text(ctx, value, x, y, size, color, align, weight);
}

/**
 * The minimap: the whole city shrunk into the corner. Water and sand frame it, the roads are
 * light lines, traffic is grey, the player a white arrow, and every marker the caller passes
 * is a dot (pulsing when asked, on the game's own clock so screenshots stay deterministic).
 */
export function drawMinimap(ctx, game, markers) {
  const city = game.city;
  const w = MINIMAP.width;
  const h = MINIMAP.height;
  const x0 = VIEW.width - w - MINIMAP.margin;
  const y0 = MINIMAP.margin;
  const scale = w / city.width;

  ctx.fillStyle = PALETTE.minimapBack;
  ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(x0, y0, w, city.sandY * scale);
  ctx.fillStyle = PALETTE.sandDark;
  ctx.fillRect(x0, y0 + city.sandY * scale, w, (city.waterY - city.sandY) * scale);
  ctx.fillStyle = PALETTE.minimapRoad;
  for (const road of city.vRoads) ctx.fillRect(x0 + (road.x - 3) * scale, y0, 6 * scale + 1, city.sandY * scale);
  for (const road of city.hRoads) ctx.fillRect(x0, y0 + (road.y - 3) * scale, w, 6 * scale + 1);

  ctx.fillStyle = PALETTE.minimapCar;
  for (const car of game.cars) {
    if (car === game.player.car) continue;
    ctx.fillRect(x0 + car.x * scale - 1.5, y0 + car.y * scale - 1.5, 3, 3);
  }
  for (const marker of markers) {
    const pulse = marker.pulse ? 1 + Math.sin(game.time * 5) * 0.35 : 1;
    const r = 4.4 * pulse;
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow turned to face the way they (or their car) face.
  const focus = game.player.car ?? game.player;
  const px = x0 + focus.x * scale;
  const py = y0 + focus.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(focus.angle);
  ctx.fillStyle = PALETTE.minimapPlayer;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.4);
  ctx.lineTo(-5, 4.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Everything the player needs at a glance. `districtName` comes from the game so this file
 * never has to know how districts are looked up; `muted` shows the M state.
 */
export function drawHud(ctx, game, districtName, muted) {
  ctx.textBaseline = 'top';
  shadowText(ctx, cashLabel(game.player.cash), 20, 14, 30, PALETTE.cash, 'left', '700');
  // Health: a squat bar under the cash.
  const healthWidth = 168;
  ctx.fillStyle = PALETTE.healthBack;
  ctx.fillRect(20, 52, healthWidth, 13);
  ctx.fillStyle = PALETTE.health;
  ctx.fillRect(22, 54, (healthWidth - 4) * Math.max(0, game.player.health) / 100, 9);

  shadowText(ctx, clockLabel(game.clockMinutes), VIEW.width / 2, 14, 24, PALETTE.text, 'center', '600');
  if (muted) shadowText(ctx, 'MUTED (M)', VIEW.width / 2, 44, 15, PALETTE.muted, 'center');

  shadowText(ctx, districtName, 20, VIEW.height - 64, 24, PALETTE.accent, 'left', '700');
  const hint = game.player.car
    ? 'W A S D drive · Shift handbrake · E get out · P pause'
    : 'W A S D move · Shift sprint · E take a car · P pause';
  shadowText(ctx, hint, 20, VIEW.height - 32, 16, PALETTE.text, 'left');

  drawMinimap(ctx, game, game.markers);
}
