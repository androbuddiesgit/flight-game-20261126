// Sky Courier tuning: one place for every number the flight model, the world and the
// missions share, so a balance change never means hunting through the game.
export const STEP = 1 / 60;
export const BEST_KEY = 'skycourier.best';
export const WORLD_SEED = 20261126;

// View: a 1280x720 stage the renderer scales to the window; focal length from a 68-degree
// vertical field of view.
export const VIEW = { width: 1280, height: 720, fov: 68 };
export const CAMERA = { behind: 15, above: 5.5, pitchFollow: 0.55, rollFollow: 0.55 };

// The plane: a light single-engine courier (fictional "Kite MK-II") in arcade physics.
export const PLANE = {
  maxSpeed: 92, // m/s at full throttle (~179 kt)
  cruiseSpeed: 62,
  stallSpeed: 26, // below this the wing stops flying and the nose drops
  accel: 22, // m/s^2 toward the throttle's target speed
  drag: 0.12,
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 1.9,
  maxRoll: 1.15, // rad of bank
  maxPitch: 0.62,
  turnRate: 0.42, // heading change per second per radian of bank, scaled by speed
  climbFactor: 1.0,
  sinkRate: 7, // m/s the plane sinks when stalled
  fuelCapacity: 100,
  fuelBurn: 0.55, // units/s at full throttle
  fuelBurnIdle: 0.12,
  groundClearance: 2.2, // metres above the terrain at which the wheels touch
};

// Terrain: a 4.8 km square island valley, 60 m grid cells.
export const TERRAIN = {
  size: 4800,
  cell: 60,
  maxHeight: 95,
  hillAmplitude: 58,
  ridgeAmplitude: 34,
};

// Rings, drop zones and runways are placed by terrain.js from the same seed.
export const RINGS = { count: 8, radius: 26, score: 100, timeBonus: 6 };
export const MAIL = { zones: 3, dropCeiling: 130, dropMaxSpeed: 48, score: 150 };
export const LANDING = { maxSink: 6, maxBank: 0.25, maxSpeed: 55, score: 400 };

// Missions: three sorties over the same valley, each with a different goal.
export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'Ring Run',
    blurb: 'Thread all 8 sky rings in order. Each ring adds time and fuel.',
    par: 150,
  },
  {
    id: 'mail',
    key: '2',
    name: 'Airmail Delivery',
    blurb: 'Drop a parcel on each of the 3 farms, low and slow, then land back home.',
    par: 240,
  },
  {
    id: 'hop',
    key: '3',
    name: 'Island Hop',
    blurb: 'Land at both outlying strips, then bring her home. Gentle touchdowns only.',
    par: 300,
  },
];
