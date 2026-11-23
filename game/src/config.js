// Every tuning number and colour for Palm City Heat in one place. The view is a fixed 1280x720
// logical area that the renderer scales to the window; the city itself is far bigger and the
// camera moves over it, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/**
 * The city's shape. Avenues run north-south, streets east-west, on a regular grid; south of the
 * last street a park strip and Seabreeze Drive front the beach, and the water closes the world.
 * All sizes in world pixels.
 */
export const CITY = {
  width: 4480,
  height: 3360,
  roadWidth: 132,
  /**
   * How far a driving lane sits from its road's centre line (right-hand traffic). The kerb
   * parking lane takes the outer 26 pixels of the road, so the driving lanes sit inside it:
   * a car in its lane clears a parked car by a whisker, as it should.
   */
  laneOffset: 19,
  firstAvenueX: 300,
  avenueSpacing: 640,
  avenueCount: 7,
  firstStreetY: 280,
  streetSpacing: 600,
  streetCount: 5,
  /** The coast road's centre line; its south edge is where the sand begins. */
  coastRoadY: 2900,
  sandY: 2960,
  waterY: 3180,
  /** Buildings and props keep this far inside their block; the ring outside it is the sidewalk. */
  sidewalk: 26,
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 175,
  sprintSpeed: 285,
  /** How quickly foot velocity catches up with the wanted direction (per second). */
  responsiveness: 12,
  maxHealth: 100,
  startCash: 240,
  /** Stepping this deep into the water is as far as wading goes. */
  wadeDepth: 30,
};

/** Car handling shared by every model; each model in entities.js brings its own numbers. */
export const CAR = {
  /** Lateral velocity kept per step at 60 steps a second: lower holds a slide (drift). */
  gripKeep: 0.82,
  handbrakeGripKeep: 0.965,
  handbrakeDecel: 260,
  /** Steering lock, radians of front-wheel angle at full input. */
  maxSteerAngle: 0.55,
  /** Rolling drag: the fraction of forward speed shed per second with no throttle. */
  drag: 0.55,
  /** Off the tarmac the top speed and acceleration shrink by these factors. */
  offroadFactor: 0.55,
  sandFactor: 0.38,
  /** Two body circles per car, this fraction of the length ahead of and behind the centre. */
  circleSpread: 0.27,
};

/** How many AI cars and pedestrians the traffic manager keeps alive around the player. */
export const TRAFFIC = {
  targetCars: 13,
  targetPeds: 16,
  spawnMin: 680,
  spawnMax: 1350,
  despawn: 1850,
  pedSpawnMin: 240,
  pedSpawnMax: 880,
  pedDespawn: 1150,
  cruiseMin: 150,
  cruiseMax: 235,
  /** Parked cars the city generator scatters along the kerbs. */
  parkedCount: 46,
};

/** The wanted system: how crimes are priced in stars and how the law answers. */
export const POLICE = {
  maxStars: 5,
  /** Cop cars the force keeps on the player at each star level (index: stars - 1). */
  copsByStars: [2, 2, 3, 4, 5],
  /** Where a fresh cop joins the hunt: on a junction this far from the player, off camera. */
  spawnMin: 800,
  spawnMax: 1250,
  spawnCooldown: 2.2,
  /** A cop "sees" the player inside this range with a clear line of sight. */
  sightRange: 660,
  /** Seconds unseen before one star cools off; hiding starts the clock again each time. */
  decaySeconds: 8,
  /** The bust meter: how fast it fills beside a cop, and how fast it drains when clear. */
  bustFillFoot: 0.6,
  bustFillSlowCar: 0.5,
  bustDrain: 0.4,
  bustRangeFoot: 118,
  bustRangeCar: 105,
  /** Slower than this beside a cop car, a driver is being pinned. */
  bustSpeed: 48,
  /** What getting caught costs: a share of the cash on hand, with a floor. */
  bustFeeRate: 0.12,
  bustFeeMin: 25,
  wastedFeeRate: 0.1,
  wastedFeeMin: 20,
  /** How long the BUSTED / WASTED card stays up before the respawn. */
  overSeconds: 2.8,
  /**
   * Crimes, priced in stars. A crime only counts when somebody sees it: a pedestrian or a
   * driver inside `witness` of the act, or a cop inside copWitness (the law hears more).
   * `cooldown` keeps one long scrape from charging the same crime every step.
   */
  crimes: {
    theft: { stars: 1, witness: 280, cooldown: 3 },
    crash: { stars: 1, witness: 310, cooldown: 6 },
    pedHit: { stars: 1, witness: 330, cooldown: 4 },
    shots: { stars: 1, witness: 370, cooldown: 5 },
    copHit: { stars: 1, witness: 0, cooldown: 6 },
  },
  copWitness: 580,
};

/** The pistol and the people who shoot back. */
export const COMBAT = {
  bulletSpeed: 980,
  bulletLife: 0.55,
  bulletDamage: 34,
  gangBulletDamage: 7,
  fireInterval: 0.14,
  gangFireMin: 0.65,
  gangFireMax: 1.25,
  gangRange: 340,
  gangKeepNear: 105,
  gangKeepFar: 205,
  gangSpeed: 128,
  /** Health regained per second once this long has passed without taking damage. */
  regenDelay: 5,
  regenRate: 7,
  /** A fighter who has fallen fades out over this long, then is gone. No gore, just gone. */
  fadeSeconds: 4,
};

/** Marisol Vega's jobs: the money on the table for each, in story order. */
export const MISSIONS = {
  rewards: [450, 600, 750, 1200],
  packageCount: 4,
  packageSeconds: 240,
  packageRadius: 42,
  deliverRadius: 78,
};

export const CLOCK = {
  /** The game opens in the late afternoon, 16:35, and the light never fully leaves. */
  startMinutes: 16 * 60 + 35,
  minutesPerSecond: 1,
};

/** Warm late-afternoon light: sun-bleached pastels, teal water, long shadows. */
export const PALETTE = {
  backdrop: '#241a20',
  ground: '#a3b184',
  park: '#9ab078',
  plaza: '#c9b696',
  sidewalk: '#d3bf9f',
  kerb: '#efe0bd',
  asphalt: '#5d5560',
  asphaltEdge: '#776b72',
  laneMark: '#f5d98b',
  sand: '#eed49c',
  sandDark: '#e2c384',
  water: '#2f93a6',
  waterDeep: '#22707f',
  waterFoam: '#d9f2ec',
  palmTrunk: '#8a6a48',
  palmLeaf: '#4d8f57',
  lampPost: '#6b5a4a',
  buildingShadow: 'rgba(74, 44, 40, 0.35)',
  playerShirt: '#0f7d8c',
  playerSkin: '#e8b08a',
  playerPants: '#33404f',
  pedShirts: ['#d96f4e', '#e9c46a', '#7fb069', '#5e8b7e', '#bc6c8a', '#f4f1de', '#6d8ea0', '#e07a5f'],
  panel: 'rgba(30, 20, 26, 0.88)',
  panelEdge: '#f5d98b',
  text: '#fdf6e3',
  muted: '#cbb9a0',
  accent: '#ffb347',
  danger: '#e5534b',
  cash: '#9fe870',
  health: '#e5534b',
  healthBack: 'rgba(20, 12, 16, 0.55)',
  minimapBack: 'rgba(24, 16, 22, 0.78)',
  minimapRoad: '#8d7f88',
  minimapCar: '#b9b0b8',
  minimapPlayer: '#ffffff',
  copBody: '#232a35',
  copStripe: '#e8e6df',
  copLightRed: '#ff4b3e',
  copLightBlue: '#3e8bff',
  star: '#ffd34d',
  starEmpty: 'rgba(253, 246, 227, 0.28)',
  gangShirt: '#43305e',
  gangAccent: '#c9a227',
  markerMission: '#ffd34d',
  markerCopRed: '#ff5a4e',
  markerCopBlue: '#4e8cff',
  markerPd: '#4e8cff',
  objective: '#ffd34d',
  package: '#ffcf4d',
  spark: '#ffe9a8',
  hurt: 'rgba(197, 43, 32, 0.55)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'palm-city-heat.save.v1';

/** The seed of the one city every player gets; ?seed=N in the URL builds a different one. */
export const DEFAULT_SEED = 20261123;
