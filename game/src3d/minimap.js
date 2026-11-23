// The minimap: a top-down canvas of the whole city, drawn fresh each frame of
// play — the street grid, Danny as a white arrow, the law as flashing blue
// dots, the Solana Kings in purple, and Marisol's active waypoint in gold.

import { ROAD_W, STREET_I, WORLD_HALF, streetAt } from './city.js';

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / (WORLD_HALF * 2);
  const px = (w) => (w + WORLD_HALF) * scale;

  /**
   * state: { time, playerPos, playerHeading, cops: [{x, z}], kings: [{x, z}],
   * waypoint: {x, z} | null } — positions in world units.
   */
  function draw(state) {
    g.clearRect(0, 0, S, S);

    // The street grid: pale bands on the dark.
    g.strokeStyle = 'rgba(216, 190, 175, 0.55)';
    g.lineWidth = Math.max(2, ROAD_W * scale);
    g.beginPath();
    for (const i of STREET_I) {
      g.moveTo(px(streetAt(i)), 0);
      g.lineTo(px(streetAt(i)), S);
      g.moveTo(0, px(streetAt(i)));
      g.lineTo(S, px(streetAt(i)));
    }
    g.stroke();

    // The active waypoint: a gold dot with a breathing ring.
    if (state.waypoint) {
      const x = px(state.waypoint.x);
      const y = px(state.waypoint.z);
      const r = 5 + Math.sin(state.time * 3.2) * 1.6;
      g.strokeStyle = '#ffcf4d';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r + 3.5, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#ffcf4d';
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }

    // The Kings, in their purple.
    g.fillStyle = '#b06ee0';
    for (const k of state.kings) {
      g.beginPath();
      g.arc(px(k.x), px(k.z), 3, 0, Math.PI * 2);
      g.fill();
    }

    // The law, flashing red and blue like the light bars.
    g.fillStyle = Math.floor(state.time * 2.4) % 2 === 0 ? '#ff5a4e' : '#4e8cff';
    for (const c of state.cops) {
      g.beginPath();
      g.arc(px(c.x), px(c.z), 3.2, 0, Math.PI * 2);
      g.fill();
    }

    // Danny: a white arrow on his heading.
    const cx = px(state.playerPos.x);
    const cy = px(state.playerPos.z);
    const fx = Math.sin(state.playerHeading);
    const fz = Math.cos(state.playerHeading);
    const rx = fz;
    const ry = -fx;
    g.beginPath();
    g.moveTo(cx + fx * 7.5, cy + fz * 7.5);
    g.lineTo(cx - fx * 5 + rx * 4.4, cy - fz * 5 + ry * 4.4);
    g.lineTo(cx - fx * 5 - rx * 4.4, cy - fz * 5 - ry * 4.4);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = 'rgba(10, 4, 24, 0.9)';
    g.lineWidth = 1.2;
    g.stroke();
  }

  return { draw };
}
