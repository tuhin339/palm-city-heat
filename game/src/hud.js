// The heads-up display, drawn in view space over the world: cash and health top-left, the clock
// and district name, a hint line that follows what the player is doing, and the minimap in the
// top-right corner. drawMinimap takes extra markers ({x, y, color, pulse}) beyond the traffic
// it always shows: police and mission markers arrive through game.markers. Under the minimap
// sit the wanted stars and the bust meter; the mission objective rides a banner under the
// clock, and Marisol's phone gets a panel of its own in the bottom-right corner.
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

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * The wanted level under the minimap: five stars, lit for the heat the player is carrying.
 * The star about to cool off blinks while the player stays unseen, and a red bust bar
 * creeps underneath whenever an arrest is in progress.
 */
function drawWanted(ctx, game) {
  const wanted = game.wanted;
  if (!wanted || wanted.stars <= 0) return;
  const size = 25;
  const spacing = 27;
  const right = VIEW.width - MINIMAP.margin;
  const y = MINIMAP.margin + MINIMAP.height + 10;
  setFont(ctx, size, '700');
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    const x = right - (5 - i) * spacing;
    const lit = i < wanted.stars;
    const cooling = lit && i === wanted.stars - 1 && wanted.hiddenTime > 1.2;
    ctx.globalAlpha = cooling && Math.sin(game.time * 6) > 0 ? 0.3 : 1;
    ctx.fillStyle = lit ? PALETTE.star : PALETTE.starEmpty;
    ctx.fillText('★', x, y);
  }
  ctx.globalAlpha = 1;
  if (wanted.bust > 0.02) {
    const width = 132;
    ctx.fillStyle = PALETTE.healthBack;
    ctx.fillRect(right - width, y + 32, width, 8);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(right - width + 1, y + 33, (width - 2) * wanted.bust, 6);
    shadowText(ctx, 'BUSTED?', right - width, y + 44, 12, PALETTE.danger, 'left', '700');
  }
}

/** The running job's orders, on a dark banner under the clock. */
function drawObjective(ctx, game) {
  const ms = game.missionState;
  if (!ms || !ms.objectiveText) return;
  setFont(ctx, 17, '600');
  const width = Math.min(VIEW.width - 480, ctx.measureText(ms.objectiveText).width + 36);
  const x = (VIEW.width - width) / 2;
  const y = 52;
  ctx.fillStyle = PALETTE.panel;
  roundRectPath(ctx, x, y, width, 34, 9);
  ctx.fill();
  ctx.strokeStyle = PALETTE.objective;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, width, 34, 9);
  ctx.stroke();
  text(ctx, ms.objectiveText, VIEW.width / 2, y + 8, 17, PALETTE.text, 'center', '600');
}

/** Wrap a phone message to the panel's measure, the way a text thread would break it. */
function wrapText(ctx, value, maxWidth, size) {
  setFont(ctx, size);
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Marisol's phone: a handset-shaped panel in the bottom-right with her latest message. */
function drawPhone(ctx, game) {
  const ms = game.missionState;
  if (!ms || !ms.phone) return;
  const phone = ms.phone;
  const width = 312;
  const lines = wrapText(ctx, phone.text, width - 28, 15);
  const height = 40 + lines.length * 20 + (phone.action ? 28 : 10);
  const x = VIEW.width - width - 16;
  const y = VIEW.height - height - 16;
  ctx.fillStyle = PALETTE.panel;
  roundRectPath(ctx, x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, width, height, 12);
  ctx.stroke();
  text(ctx, `PHONE — ${phone.from}`, x + 14, y + 10, 13, PALETTE.accent, 'left', '700');
  for (let i = 0; i < lines.length; i += 1) {
    text(ctx, lines[i], x + 14, y + 32 + i * 20, 15, PALETTE.text, 'left');
  }
  if (phone.action === 'accept') {
    text(ctx, 'Press T to take the job', x + 14, y + height - 24, 14, PALETTE.cash, 'left', '700');
  } else if (phone.action === 'retry') {
    text(ctx, 'Press T to run it again', x + 14, y + height - 24, 14, PALETTE.cash, 'left', '700');
  }
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
  let hint;
  if (game.missionState && game.missionState.phone && game.missionState.phone.action) {
    hint = 'T — answer Marisol';
  } else if (game.player.car) {
    hint = 'W A S D drive · Shift handbrake · E get out · P pause';
  } else {
    hint = 'W A S D move · Shift sprint · E take a car · mouse aim · click / F shoot · P pause';
  }
  shadowText(ctx, hint, 20, VIEW.height - 32, 16, PALETTE.text, 'left');

  drawMinimap(ctx, game, game.markers);
  drawWanted(ctx, game);
  drawObjective(ctx, game);
  drawPhone(ctx, game);
}
