// Drawing only: the game state and the current screen in, pixels out. The world is painted
// through a camera transform (roads, beach and water, buildings with long late shadows, palms,
// skid marks, cars, people, dust), then the view is reset to the fixed 1280x720 logical space
// for the HUD, the minimap and the panels. Anything outside the camera's view is skipped, and
// the water's shimmer runs on the game's own clock, so a screenshot scene always paints the
// same frame.
import { CITY, FONT, PALETTE, VIEW } from './config.js';
import { CAR_MODELS } from './entities.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const STORY_HOOK = 'Danny Marlow is back in Palm City with empty pockets and one phone number:';
const STORY_HOOK_2 = 'Marisol Vega, who always has work for a driver who keeps his mouth shut.';
const CONTROL_LINES = [
  'W A S D / arrows — walk and drive',
  'Shift — sprint on foot, handbrake in a car',
  'E — get into the nearest car, or get out',
  'Mouse — aim · click or F — fire the pistol',
  "T — answer Marisol's phone, take the job",
  'P — pause · M — mute',
];

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

function roundRect(ctx, x, y, w, h, r) {
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

function overlapsView(rect, view) {
  return rect.x < view.x + view.w && rect.x + rect.w > view.x && rect.y < view.y + view.h && rect.y + rect.h > view.y;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function drawGround(city, cameraView) {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(cameraView.x, cameraView.y, cameraView.w, cameraView.h);
    for (const block of city.blocks) {
      if (!overlapsView(block, cameraView)) continue;
      ctx.fillStyle = block.park ? PALETTE.park : PALETTE.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      if (!block.park) {
        ctx.fillStyle = PALETTE.plaza;
        ctx.fillRect(
          block.x + CITY.sidewalk, block.y + CITY.sidewalk,
          block.w - CITY.sidewalk * 2, block.h - CITY.sidewalk * 2,
        );
      }
    }
    // Sand, then water with a foam edge and a slow shimmer that runs on the game clock.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(cameraView.x, city.sandY, cameraView.w, city.waterY - city.sandY);
    ctx.fillStyle = PALETTE.sandDark;
    for (let x = Math.floor(cameraView.x / 90) * 90; x < cameraView.x + cameraView.w; x += 90) {
      ctx.fillRect(x + 20, city.sandY + 60 + ((x * 37) % 120), 34, 7);
    }
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(cameraView.x, city.waterY, cameraView.w, city.height - city.waterY);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(cameraView.x, city.waterY + 90, cameraView.w, city.height - city.waterY - 90);
  }

  function drawWaterShimmer(city, cameraView, time) {
    ctx.fillStyle = PALETTE.waterFoam;
    ctx.globalAlpha = 0.75;
    const startX = Math.floor(cameraView.x / 46) * 46;
    for (let x = startX; x < cameraView.x + cameraView.w; x += 46) {
      const wobble = Math.sin(time * 1.7 + x * 0.05) * 3;
      ctx.fillRect(x, city.waterY + 3 + wobble, 26, 3);
    }
    ctx.globalAlpha = 0.3;
    for (let row = 0; row < 3; row += 1) {
      const y = city.waterY + 34 + row * 44;
      for (let x = startX; x < cameraView.x + cameraView.w; x += 120) {
        const drift = Math.sin(time * 0.9 + x * 0.03 + row * 2.1) * 9;
        ctx.fillRect(x + drift + row * 37, y, 44, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRoads(city, cameraView) {
    const half = CITY.roadWidth / 2;
    ctx.fillStyle = PALETTE.asphalt;
    for (const road of city.vRoads) {
      if (road.x + half < cameraView.x || road.x - half > cameraView.x + cameraView.w) continue;
      ctx.fillRect(road.x - half, cameraView.y, CITY.roadWidth, cameraView.h);
    }
    for (const road of city.hRoads) {
      if (road.y + half < cameraView.y || road.y - half > cameraView.y + cameraView.h) continue;
      ctx.fillRect(cameraView.x, road.y - half, cameraView.w, CITY.roadWidth);
    }
    // Kerb lines, then the dashed centre lines, only where the camera can see them.
    ctx.fillStyle = PALETTE.asphaltEdge;
    for (const road of city.vRoads) {
      if (road.x + half < cameraView.x || road.x - half > cameraView.x + cameraView.w) continue;
      ctx.fillRect(road.x - half, cameraView.y, 3, cameraView.h);
      ctx.fillRect(road.x + half - 3, cameraView.y, 3, cameraView.h);
    }
    for (const road of city.hRoads) {
      if (road.y + half < cameraView.y || road.y - half > cameraView.y + cameraView.h) continue;
      ctx.fillRect(cameraView.x, road.y - half, cameraView.w, 3);
      ctx.fillRect(cameraView.x, road.y + half - 3, cameraView.w, 3);
    }
    ctx.fillStyle = PALETTE.laneMark;
    const dash = 30;
    const gap = 26;
    for (const road of city.vRoads) {
      if (road.x + half < cameraView.x || road.x - half > cameraView.x + cameraView.w) continue;
      const first = Math.floor(cameraView.y / (dash + gap)) * (dash + gap);
      for (let y = first; y < cameraView.y + cameraView.h; y += dash + gap) {
        ctx.fillRect(road.x - 2, y, 4, dash);
      }
    }
    for (const road of city.hRoads) {
      if (road.y + half < cameraView.y || road.y - half > cameraView.y + cameraView.h) continue;
      const first = Math.floor(cameraView.x / (dash + gap)) * (dash + gap);
      for (let x = first; x < cameraView.x + cameraView.w; x += dash + gap) {
        ctx.fillRect(x, road.y - 2, dash, 4);
      }
    }
  }

  function drawSkids(fx, cameraView) {
    ctx.fillStyle = '#2e2622';
    for (const skid of fx.skids) {
      if (skid.x < cameraView.x - 20 || skid.x > cameraView.x + cameraView.w + 20
        || skid.y < cameraView.y - 20 || skid.y > cameraView.y + cameraView.h + 20) continue;
      ctx.globalAlpha = Math.min(0.55, skid.life * 0.05);
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.fillRect(-7, -3, 14, 6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBuildings(city, cameraView) {
    for (const building of city.buildings) {
      if (!overlapsView(building, cameraView)) continue;
      const lift = building.storeys * 3.2;
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(building.x + lift, building.y + lift, building.w, building.h);
      ctx.fillStyle = building.color;
      ctx.fillRect(building.x, building.y, building.w, building.h);
      ctx.fillStyle = building.roof;
      const inset = 7;
      ctx.fillRect(building.x + inset, building.y + inset, building.w - inset * 2, building.h - inset * 2);
      // Roof furniture: a stairwell box and a water tank, placed off the building's own numbers.
      ctx.fillStyle = 'rgba(60, 40, 34, 0.35)';
      const boxW = Math.min(30, building.w * 0.3);
      const boxH = Math.min(24, building.h * 0.3);
      ctx.fillRect(building.x + inset + 6, building.y + inset + 6, boxW, boxH);
      if (building.w > 90 && building.h > 90) {
        ctx.beginPath();
        ctx.arc(building.x + building.w - inset - 16, building.y + building.h - inset - 16, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawProps(city, cameraView, time) {
    for (const prop of city.props) {
      if (prop.x < cameraView.x - 30 || prop.x > cameraView.x + cameraView.w + 30
        || prop.y < cameraView.y - 30 || prop.y > cameraView.y + cameraView.h + 30) continue;
      if (prop.kind === 'palm') {
        const sway = Math.sin(time * 1.3 + prop.sway) * 2.2;
        ctx.strokeStyle = PALETTE.palmTrunk;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(prop.x, prop.y);
        ctx.lineTo(prop.x + sway * 0.4, prop.y - 7);
        ctx.stroke();
        ctx.strokeStyle = PALETTE.palmLeaf;
        ctx.lineWidth = 3;
        for (let frond = 0; frond < 6; frond += 1) {
          const angle = (frond / 6) * Math.PI * 2 + prop.sway;
          ctx.beginPath();
          ctx.moveTo(prop.x + sway * 0.4, prop.y - 7);
          ctx.lineTo(prop.x + sway + Math.cos(angle) * prop.size, prop.y - 7 + Math.sin(angle) * prop.size * 0.62 + 3);
          ctx.stroke();
        }
      } else if (prop.kind === 'lamp') {
        ctx.fillStyle = PALETTE.lampPost;
        ctx.fillRect(prop.x - 2, prop.y - 2, 4, 4);
        ctx.fillStyle = 'rgba(255, 190, 90, 0.5)';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (prop.kind === 'hydrant') {
        ctx.fillStyle = '#c33d31';
        ctx.fillRect(prop.x - 3, prop.y - 3, 6, 6);
      } else if (prop.kind === 'umbrella') {
        ctx.fillStyle = ['#e07a5f', '#3d8bfd', '#f2cc8f'][Math.floor(prop.sway) % 3];
        ctx.beginPath();
        ctx.moveTo(prop.x - prop.size, prop.y + 4);
        ctx.lineTo(prop.x, prop.y - prop.size * 0.7);
        ctx.lineTo(prop.x + prop.size, prop.y + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawCar(car, time) {
    const model = CAR_MODELS[car.model];
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(50, 30, 26, 0.3)';
    roundRect(ctx, -model.length / 2 + 4, -model.width / 2 + 5, model.length, model.width, 7);
    ctx.fill();
    // Wheels, the front pair turned with the steering.
    ctx.fillStyle = '#1d1a1e';
    const wheelW = 10;
    const wheelH = 5;
    const axleX = model.length * 0.31;
    ctx.fillRect(axleX - wheelW / 2, -model.width / 2 - 1, wheelW, wheelH);
    ctx.fillRect(axleX - wheelW / 2, model.width / 2 - wheelH + 1, wheelW, wheelH);
    ctx.fillRect(-axleX - wheelW / 2, -model.width / 2 - 1, wheelW, wheelH);
    ctx.fillRect(-axleX - wheelW / 2, model.width / 2 - wheelH + 1, wheelW, wheelH);
    // Body, glass, roof.
    ctx.fillStyle = car.color;
    roundRect(ctx, -model.length / 2, -model.width / 2, model.length, model.width, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 30, 40, 0.85)';
    roundRect(ctx, model.length * 0.08, -model.width / 2 + 4, model.length * 0.2, model.width - 8, 3);
    ctx.fill();
    roundRect(ctx, -model.length * 0.3, -model.width / 2 + 4, model.length * 0.13, model.width - 8, 3);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -model.length * 0.14, -model.width / 2 + 3, model.length * 0.2, model.width - 6, 3);
    ctx.fill();
    // The driver, seen through the roof as a head and shoulders.
    if (car.driver !== null) {
      ctx.fillStyle = car.driver === 'player' ? PALETTE.playerShirt : '#4a4a55';
      ctx.beginPath();
      ctx.arc(-model.length * 0.02, 0, 6.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.playerSkin;
      ctx.beginPath();
      ctx.arc(-model.length * 0.02, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lights: warm at the front, red at the back.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(model.length / 2 - 3, -model.width / 2 + 3, 3, 5);
    ctx.fillRect(model.length / 2 - 3, model.width / 2 - 8, 3, 5);
    ctx.fillStyle = '#d23b31';
    ctx.fillRect(-model.length / 2, -model.width / 2 + 3, 3, 5);
    ctx.fillRect(-model.length / 2, model.width / 2 - 8, 3, 5);
    // A patrol car wears its livery openly: pale flank stripes and a light bar that
    // strobes red and blue on the game's own clock, so every frame is reproducible.
    if (car.cop) {
      ctx.fillStyle = PALETTE.copStripe;
      ctx.fillRect(-model.length * 0.34, -model.width / 2 + 2, model.length * 0.68, 4);
      ctx.fillRect(-model.length * 0.34, model.width / 2 - 6, model.length * 0.68, 4);
      const phase = Math.floor(time * 3.5 + (car.lightPhase || 0)) % 2 === 0;
      ctx.fillStyle = phase ? PALETTE.copLightRed : 'rgba(255, 75, 62, 0.25)';
      ctx.fillRect(-model.length * 0.05, -model.width / 2 + 5, 9, model.width / 2 - 5);
      ctx.fillStyle = phase ? 'rgba(62, 139, 255, 0.25)' : PALETTE.copLightBlue;
      ctx.fillRect(-model.length * 0.05, 0, 9, model.width / 2 - 5);
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, skin, down) {
    ctx.fillStyle = 'rgba(50, 30, 26, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (down) {
      ctx.fillStyle = shirt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      roundRect(ctx, -13, -6, 26, 12, 6);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, 5.2, 0, Math.PI * 2);
    ctx.fill();
    // A nose-tick shows the way they face.
    ctx.fillStyle = shirt;
    ctx.fillRect(x + Math.cos(angle) * 8 - 1.6, y + Math.sin(angle) * 8 - 1.6, 3.2, 3.2);
  }

  /** The mission target: a pulsing ring on the ground and a pillar of light over it. */
  function drawObjectiveBeacon(game) {
    const point = game.objective;
    if (!point) return;
    const pulse = 1 + Math.sin(game.time * 4) * 0.16;
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, 27 * pulse, 19 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = PALETTE.objective;
    ctx.fillRect(point.x - 5, point.y - 190, 10, 190);
    ctx.globalAlpha = 1;
    const bob = Math.sin(game.time * 3) * 5;
    ctx.fillStyle = PALETTE.objective;
    ctx.save();
    ctx.translate(point.x, point.y - 202 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  /** The package run's parcels: small gold crates that breathe with the game clock. */
  function drawPickups(game) {
    for (const pack of game.pickups) {
      const pulse = 1 + Math.sin(game.time * 5 + pack.x * 0.05) * 0.12;
      ctx.strokeStyle = PALETTE.package;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(pack.x, pack.y, 17 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.package;
      ctx.fillRect(pack.x - 8, pack.y - 8, 16, 16);
      ctx.fillStyle = 'rgba(90, 60, 10, 0.65)';
      ctx.fillRect(pack.x - 8, pack.y - 2, 16, 4);
      ctx.fillRect(pack.x - 2, pack.y - 8, 4, 16);
    }
  }

  function drawWorld(game, cameraView) {
    const city = game.city;
    drawGround(city, cameraView);
    drawRoads(city, cameraView);
    drawSkids(game.fx, cameraView);
    drawBuildings(city, cameraView);
    drawProps(city, cameraView, game.time);
    drawWaterShimmer(city, cameraView, game.time);
    drawObjectiveBeacon(game);
    drawPickups(game);
    for (const car of game.cars) {
      if (car.x < cameraView.x - 60 || car.x > cameraView.x + cameraView.w + 60
        || car.y < cameraView.y - 60 || car.y > cameraView.y + cameraView.h + 60) continue;
      drawCar(car, game.time);
    }
    for (const ped of game.peds) {
      if (ped.x < cameraView.x - 24 || ped.x > cameraView.x + cameraView.w + 24
        || ped.y < cameraView.y - 24 || ped.y > cameraView.y + cameraView.h + 24) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.state === 'down');
    }
    // The Solana Kings: drawn like anyone else, ringed in their gold so Danny knows them.
    for (const member of game.gang) {
      if (member.x < cameraView.x - 24 || member.x > cameraView.x + cameraView.w + 24
        || member.y < cameraView.y - 24 || member.y > cameraView.y + cameraView.h + 24) continue;
      ctx.globalAlpha = member.state === 'down' ? Math.max(0, member.fade) : 1;
      drawPerson(member.x, member.y, member.angle, member.shirt, member.skin, member.state === 'down');
      if (member.state !== 'down') {
        ctx.strokeStyle = PALETTE.gangAccent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(member.x, member.y, 12.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (!game.player.car) {
      const player = game.player;
      drawPerson(player.x, player.y, player.angle, PALETTE.playerShirt, PALETTE.playerSkin, player.knockTimer > 0.45);
    }
    // Bullets are brief bright streaks along their own velocity.
    ctx.lineWidth = 2.5;
    for (const bullet of game.bullets) {
      ctx.strokeStyle = bullet.from === 'player' ? PALETTE.spark : '#ff9d7a';
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.014, bullet.y - bullet.vy * 0.014);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    // Sparks from muzzles and impacts: short, bright, gone.
    for (const spark of game.fx.sparks) {
      ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife);
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Dust hangs over everything for its short life.
    for (const puff of game.fx.dust) {
      ctx.fillStyle = 'rgba(216, 190, 150, 0.5)';
      ctx.globalAlpha = Math.min(0.55, puff.life);
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPanel(width, height) {
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 14);
    ctx.stroke();
    return { x, y };
  }

  function drawTitle(game, ui) {
    ctx.fillStyle = 'rgba(24, 12, 18, 0.34)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const { y } = drawPanel(760, 528);
    ctx.textBaseline = 'alphabetic';
    text(ctx, 'PALM CITY', VIEW.width / 2, y + 88, 64, PALETTE.text, 'center', '800');
    text(ctx, 'H E A T', VIEW.width / 2, y + 132, 34, PALETTE.accent, 'center', '800');
    text(ctx, STORY_HOOK, VIEW.width / 2, y + 174, 19, PALETTE.muted, 'center');
    text(ctx, STORY_HOOK_2, VIEW.width / 2, y + 200, 19, PALETTE.muted, 'center');
    for (let i = 0; i < CONTROL_LINES.length; i += 1) {
      text(ctx, CONTROL_LINES[i], VIEW.width / 2, y + 238 + i * 26, 17, PALETTE.text, 'center');
    }
    const menuY = y + 434;
    const newColor = ui.menuIndex === 0 ? PALETTE.accent : PALETTE.muted;
    text(ctx, ui.menuIndex === 0 ? '▸ NEW GAME' : 'NEW GAME', VIEW.width / 2 - 130, menuY, 24, newColor, 'center', '700');
    if (ui.hasSave) {
      const continueColor = ui.menuIndex === 1 ? PALETTE.accent : PALETTE.muted;
      text(ctx, ui.menuIndex === 1 ? '▸ CONTINUE' : 'CONTINUE', VIEW.width / 2 + 130, menuY, 24, continueColor, 'center', '700');
    }
    text(ctx, '↑ ↓ choose · Enter start', VIEW.width / 2, y + 476, 16, PALETTE.muted, 'center');
    void game;
  }

  function drawPaused(game) {
    ctx.fillStyle = 'rgba(24, 12, 18, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const { y } = drawPanel(520, 300);
    ctx.textBaseline = 'alphabetic';
    text(ctx, 'PAUSED', VIEW.width / 2, y + 84, 44, PALETTE.text, 'center', '800');
    const stats = game.stats;
    const lines = [
      `Cash on hand  $${game.player.cash.toLocaleString('en-US')}`,
      `Cars taken  ${stats.carsStolen}`,
      `Distance driven  ${(stats.distanceDriven / 52).toFixed(1)} km`,
      `Time in Palm City  ${Math.floor(stats.timePlayed / 60)}m ${Math.floor(stats.timePlayed % 60)}s`,
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(ctx, lines[i], VIEW.width / 2, y + 138 + i * 30, 19, PALETTE.muted, 'center');
    }
    text(ctx, 'P or Esc to keep driving · progress saved', VIEW.width / 2, y + 272, 16, PALETTE.accent, 'center');
  }

  /** Red at the edges of the world when Danny is hurt — and worse when he is nearly done. */
  function drawHurt(game) {
    let alpha = Math.min(0.5, game.hurtFlash * 0.55);
    if (game.player.health > 0 && game.player.health < 30) {
      alpha = Math.max(alpha, 0.14 + Math.sin(game.time * 5) * 0.06);
    }
    if (alpha <= 0.02) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PALETTE.hurt;
    const band = 52;
    ctx.fillRect(0, 0, VIEW.width, band);
    ctx.fillRect(0, VIEW.height - band, VIEW.width, band);
    ctx.fillRect(0, 0, band, VIEW.height);
    ctx.fillRect(VIEW.width - band, 0, band, VIEW.height);
    ctx.globalAlpha = 1;
  }

  /** The card that ends a run at the law or the pavement: what happened, and what it cost. */
  function drawOver(game) {
    const over = game.over;
    if (!over) return;
    ctx.fillStyle = 'rgba(24, 10, 14, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const { y } = drawPanel(620, 250);
    ctx.textBaseline = 'alphabetic';
    const busted = over.kind === 'busted';
    text(ctx, busted ? 'BUSTED' : 'WASTED', VIEW.width / 2, y + 96, 58, PALETTE.danger, 'center', '800');
    text(ctx, busted
      ? 'The Palm City PD takes its cut of your cash.'
      : 'You wake up in Palm City General, lighter in the pocket.',
    VIEW.width / 2, y + 142, 19, PALETTE.text, 'center');
    text(ctx, busted
      ? 'You are released outside the station. The stars are forgotten.'
      : 'Patched up and discharged. The city kept the change.',
    VIEW.width / 2, y + 172, 17, PALETTE.muted, 'center');
    text(ctx, '…', VIEW.width / 2, y + 214, 20, PALETTE.accent, 'center');
  }

  /**
   * Paint one frame. `ui` carries the screen furniture the renderer cannot know:
   * { menuIndex, hasSave, muted }.
   */
  function draw(game, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = game.shake > 0 ? Math.sin(game.time * 61) * game.shake : 0;
    const shakeY = game.shake > 0 ? Math.cos(game.time * 53) * game.shake : 0;
    const cameraView = {
      x: game.camera.x - VIEW.width / 2,
      y: game.camera.y - VIEW.height / 2,
      w: VIEW.width,
      h: VIEW.height,
    };
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - (cameraView.x + shakeX) * view.scale, view.y - (cameraView.y + shakeY) * view.scale);
    drawWorld(game, cameraView);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(game, ui);
      return;
    }
    drawHud(ctx, game, game.currentDistrict().name, ui.muted);
    drawHurt(game);
    if (screen === SCREEN_PAUSED) drawPaused(game);
    drawOver(game);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
