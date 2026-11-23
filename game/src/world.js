// Palm City itself: the static model every other module reads. createCity lays out the road
// grid, the named districts, the blocks and their buildings, the palms and street props, the
// beach and the water, and the parked cars, all from the seeded random source, so a seed always
// builds the same city. Nothing here moves; entities.js and traffic.js bring it to life.
import { CITY, TRAFFIC } from './config.js';

const AVENUE_NAMES = ['Cactus Avenue', 'Flamingo Avenue', 'Marina Avenue', 'Palmera Avenue', 'Solana Avenue', 'Verano Avenue', 'Harbor Avenue'];
const STREET_NAMES = ['North Palms Boulevard', 'Tangelo Street', 'Central Avenue', 'Coral Street', 'Sunset Terrace'];
const COAST_ROAD_NAME = 'Seabreeze Drive';

/** Sun-bleached building bodies and the terracotta-and-pastel roofs they wear. */
const BUILDING_COLORS = ['#f2d5a0', '#e8a87c', '#d97b6c', '#f4ead5', '#c9d6a3', '#a8c3cf', '#e6b8a2', '#f7f0dc', '#e5c07b', '#b5c99a'];
const ROOF_COLORS = ['#b5563c', '#c97b4a', '#8f6f4f', '#a85b4a', '#7d8c74', '#96604a'];

function rectContains(rect, x, y) {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** The centre line of the lane a driver on `road` heading `dir` belongs in (right-hand traffic). */
export function laneCenter(city, axis, index, dir) {
  if (axis === 'v') return city.vRoads[index].x - dir * CITY.laneOffset;
  return city.hRoads[index].y + dir * CITY.laneOffset;
}

/** Which named district a point falls in; the city is quartered by its middle avenue and street. */
export function districtAt(city, x, y) {
  for (const district of city.districts) {
    if (rectContains(district, x, y)) return district;
  }
  return city.districts[0];
}

/**
 * What is under a point: 'water', 'sand', 'road', 'sidewalk' (a built block's ring and plaza),
 * or 'ground' (parkland and the margins). Cars slow and kick dust off road; feet stop at water.
 */
export function surfaceAt(city, x, y) {
  if (y >= CITY.waterY) return 'water';
  if (y >= CITY.sandY) return 'sand';
  for (const road of city.vRoads) if (Math.abs(x - road.x) <= CITY.roadWidth / 2) return 'road';
  for (const road of city.hRoads) if (Math.abs(y - road.y) <= CITY.roadWidth / 2) return 'road';
  for (const block of city.blocks) {
    if (rectContains(block, x, y)) return block.park ? 'ground' : 'sidewalk';
  }
  return 'ground';
}

export function createCity(random) {
  const vRoads = [];
  for (let i = 0; i < CITY.avenueCount; i += 1) {
    vRoads.push({ x: CITY.firstAvenueX + i * CITY.avenueSpacing, name: AVENUE_NAMES[i] });
  }
  const hRoads = [];
  for (let j = 0; j < CITY.streetCount; j += 1) {
    hRoads.push({ y: CITY.firstStreetY + j * CITY.streetSpacing, name: STREET_NAMES[j] });
  }
  hRoads.push({ y: CITY.coastRoadY, name: COAST_ROAD_NAME });

  const halfRoad = CITY.roadWidth / 2;
  const blocks = [];
  // The built blocks between consecutive avenues and streets.
  for (let i = 0; i < CITY.avenueCount - 1; i += 1) {
    for (let j = 0; j < CITY.streetCount - 1; j += 1) {
      blocks.push({
        x: vRoads[i].x + halfRoad,
        y: hRoads[j].y + halfRoad,
        w: CITY.avenueSpacing - CITY.roadWidth,
        h: CITY.streetSpacing - CITY.roadWidth,
        park: false,
      });
    }
  }
  // Parkland: the strips at the city's edges and the beachfront lawn south of Sunset Terrace.
  const lastStreetSouth = hRoads[CITY.streetCount - 1].y + halfRoad;
  blocks.push({ x: 0, y: lastStreetSouth, w: CITY.width, h: CITY.coastRoadY - halfRoad - lastStreetSouth, park: true });
  blocks.push({ x: 0, y: 0, w: CITY.width, h: hRoads[0].y - halfRoad, park: true });
  blocks.push({ x: 0, y: 0, w: vRoads[0].x - halfRoad, h: CITY.height, park: true });
  blocks.push({ x: vRoads[CITY.avenueCount - 1].x + halfRoad, y: 0, w: CITY.width - (vRoads[CITY.avenueCount - 1].x + halfRoad), h: CITY.height, park: true });

  // Buildings: each built block is split into one, two or four lots, inset behind the sidewalk.
  const buildings = [];
  for (const block of blocks) {
    if (block.park) continue;
    const inset = CITY.sidewalk + 8;
    const inner = { x: block.x + inset, y: block.y + inset, w: block.w - inset * 2, h: block.h - inset * 2 };
    const layout = random();
    const lots = [];
    if (layout < 0.34) {
      lots.push(inner);
    } else if (layout < 0.67) {
      const gap = 18;
      const w = (inner.w - gap) / 2;
      lots.push({ x: inner.x, y: inner.y, w, h: inner.h });
      lots.push({ x: inner.x + w + gap, y: inner.y, w, h: inner.h });
    } else {
      const gap = 18;
      const w = (inner.w - gap) / 2;
      const h = (inner.h - gap) / 2;
      lots.push({ x: inner.x, y: inner.y, w, h });
      lots.push({ x: inner.x + w + gap, y: inner.y, w, h });
      lots.push({ x: inner.x, y: inner.y + h + gap, w, h });
      lots.push({ x: inner.x + w + gap, y: inner.y + h + gap, w, h });
    }
    for (const lot of lots) {
      // Shrink most lots a little so neighbouring buildings breathe.
      const shrink = 6 + random() * 22;
      buildings.push({
        x: lot.x + shrink / 2,
        y: lot.y + shrink / 2,
        w: lot.w - shrink,
        h: lot.h - shrink,
        storeys: 2 + Math.floor(random() * 6),
        color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)],
        roof: ROOF_COLORS[Math.floor(random() * ROOF_COLORS.length)],
      });
    }
  }

  // Props: palms along the block edges and the beach, lamps on the road corners, and small
  // street furniture scattered on the sidewalks. Palms carry a sway phase for the renderer.
  const props = [];
  for (const block of blocks) {
    const palms = block.park ? 7 : 4;
    for (let k = 0; k < palms; k += 1) {
      const side = Math.floor(random() * 4);
      const t = random();
      const x = side === 0 || side === 1 ? block.x + 14 + t * (block.w - 28) : block.x + (side === 2 ? 14 : block.w - 14);
      const y = side === 2 || side === 3 ? block.y + 14 + t * (block.h - 28) : block.y + (side === 0 ? 14 : block.h - 14);
      props.push({ x, y, kind: 'palm', size: 15 + random() * 8, sway: random() * Math.PI * 2 });
    }
    if (!block.park && random() < 0.7) {
      props.push({ x: block.x + 16 + random() * (block.w - 32), y: block.y + block.h - 13, kind: 'hydrant', size: 5, sway: 0 });
    }
  }
  for (const vx of vRoads) {
    for (const hy of hRoads) {
      props.push({ x: vx.x - halfRoad - 8, y: hy.y - halfRoad - 8, kind: 'lamp', size: 4, sway: 0 });
      props.push({ x: vx.x + halfRoad + 8, y: hy.y + halfRoad + 8, kind: 'lamp', size: 4, sway: 0 });
    }
  }
  for (let k = 0; k < 26; k += 1) {
    props.push({ x: 120 + random() * (CITY.width - 240), y: CITY.sandY + 24 + random() * 130, kind: 'umbrella', size: 13 + random() * 5, sway: random() * Math.PI * 2 });
  }
  for (let k = 0; k < 14; k += 1) {
    props.push({ x: 80 + random() * (CITY.width - 160), y: CITY.sandY + 30 + random() * (CITY.waterY - CITY.sandY - 70), kind: 'palm', size: 14 + random() * 7, sway: random() * Math.PI * 2 });
  }

  const midX = CITY.width / 2;
  const midY = (hRoads[1].y + hRoads[2].y) / 2 + halfRoad;
  const districts = [
    { name: 'Cactus Heights', x: 0, y: 0, w: midX, h: midY },
    { name: 'Downtown Palms', x: midX, y: 0, w: CITY.width - midX, h: midY },
    { name: 'Marina Mile', x: 0, y: midY, w: midX, h: CITY.height - midY },
    { name: 'Old Port', x: midX, y: midY, w: CITY.width - midX, h: CITY.height - midY },
  ];

  // Parked cars at the kerbs, parallel to their road and clear of the junctions, plus one
  // waiting on Seabreeze Drive by the player's spawn: the first ride of the game.
  const parked = [];
  const kerb = halfRoad - 13;
  for (let n = 0; n < TRAFFIC.parkedCount; n += 1) {
    if (random() < 0.55) {
      const road = vRoads[Math.floor(random() * vRoads.length)];
      const a = Math.floor(random() * (hRoads.length - 1));
      const y = hRoads[a].y + 130 + random() * (hRoads[a + 1].y - hRoads[a].y - 260);
      const side = random() < 0.5 ? -1 : 1;
      parked.push({ x: road.x + side * kerb, y, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2, model: -1, color: -1 });
    } else {
      const road = hRoads[Math.floor(random() * hRoads.length)];
      const a = Math.floor(random() * (vRoads.length - 1));
      const x = vRoads[a].x + 130 + random() * (vRoads[a + 1].x - vRoads[a].x - 260);
      const side = random() < 0.5 ? -1 : 1;
      parked.push({ x, y: road.y + side * kerb, angle: side < 0 ? Math.PI : 0, model: -1, color: -1 });
    }
  }
  const playerSpawn = { x: vRoads[2].x + 154, y: CITY.coastRoadY - 78 };
  parked.push({ x: playerSpawn.x, y: CITY.coastRoadY - kerb, angle: 0, model: 1, color: 2 });

  return {
    width: CITY.width,
    height: CITY.height,
    vRoads,
    hRoads,
    blocks,
    buildings,
    props,
    districts,
    parked,
    playerSpawn,
    sandY: CITY.sandY,
    waterY: CITY.waterY,
  };
}
