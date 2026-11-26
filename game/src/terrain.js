// The valley: one heightfield, three grass strips, a river, a lake, patchwork fields and
// forest, all from the seed. The renderer asks for heights and colours; the flight model
// asks for the ground under the wheels; missions ask where the rings and drop zones are.
import { TERRAIN, WORLD_SEED } from './config.js';
import { createNoise, createRandom } from './rng.js';

const HALF = TERRAIN.size / 2;
const NOISE = createNoise(WORLD_SEED);

// Three strips: home base in the middle, two outlying fields. Each is a flat rectangle
// with a heading (radians, 0 = north) and a name the HUD and the debrief show.
export const AIRFIELDS = [
  { id: 'home', name: 'Kite Field', x: 0, z: 320, heading: 0, length: 420, width: 34 },
  { id: 'north', name: 'Pine Ridge', x: -1350, z: -1250, heading: 0.5, length: 360, width: 30 },
  { id: 'east', name: 'River Bend', x: 1450, z: -950, heading: -0.4, length: 360, width: 30 },
];

// The river winds north-south on the east side; the lake sits in the north-west hills.
export function riverX(z) {
  return 950 + Math.sin(z * 0.0011) * 260 + Math.sin(z * 0.00037 + 1.7) * 120;
}
const LAKE = { x: -1150, z: -1350, rx: 320, rz: 240 };
const ROAD_X = -780; // the old coast road, straight north-south on the west side

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// How flat the ground is forced near a strip: 1 on the runway, fading to 0 at 260 m.
function flattenAt(x, z) {
  let flat = 0;
  for (const field of AIRFIELDS) {
    const dx = x - field.x;
    const dz = z - field.z;
    const along = dx * Math.sin(field.heading) + dz * Math.cos(field.heading);
    const across = dx * Math.cos(field.heading) - dz * Math.sin(field.heading);
    // The flat rectangle runs 120 m past each runway end, so the approach
    // corridors are clear ground instead of a rising slope to hit on final.
    const d = Math.max(Math.abs(along) - field.length / 2 - 120, Math.abs(across) - field.width / 2);
    const f = clamp01(1 - d / 260);
    flat = Math.max(flat, f * f * (3 - 2 * f));
  }
  return flat;
}

function rawHeight(x, z) {
  // Bowl the edges up into hills so the valley reads as a place, not a plane.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  const rim = Math.pow(Math.max(0, edge - 0.55) / 0.45, 2) * TERRAIN.ridgeAmplitude;
  let h = NOISE.fbm(x, z) * TERRAIN.hillAmplitude + rim + 8;
  // Carve the river valley and the lake basin.
  const riverD = Math.abs(x - riverX(z));
  if (riverD < 130) h -= (1 - riverD / 130) * 14;
  const lakeDx = (x - LAKE.x) / LAKE.rx;
  const lakeDz = (z - LAKE.z) / LAKE.rz;
  const lakeD = lakeDx * lakeDx + lakeDz * lakeDz;
  if (lakeD < 1) h -= (1 - lakeD) * 22;
  return h;
}

export function heightAt(x, z) {
  const flat = flattenAt(x, z);
  const h = rawHeight(x, z);
  return h * (1 - flat) + 6 * flat;
}

function isWater(x, z, h) {
  const riverD = Math.abs(x - riverX(z));
  if (riverD < 26 && h < 12) return true;
  const lakeDx = (x - LAKE.x) / LAKE.rx;
  const lakeDz = (z - LAKE.z) / LAKE.rz;
  return lakeDx * lakeDx + lakeDz * lakeDz < 0.85;
}

function onRunway(x, z) {
  for (const field of AIRFIELDS) {
    const dx = x - field.x;
    const dz = z - field.z;
    const along = dx * Math.sin(field.heading) + dz * Math.cos(field.heading);
    const across = dx * Math.cos(field.heading) - dz * Math.sin(field.heading);
    if (Math.abs(along) <= field.length / 2 && Math.abs(across) <= field.width / 2) {
      return { field, along, across };
    }
  }
  return null;
}

// One colour per ground point, as [r, g, b]. Fields are patchwork, forest is dark where
// the tree noise runs high, the runway is asphalt with a dashed centreline.
export function groundColor(x, z, h) {
  const runway = onRunway(x, z);
  if (runway) {
    const dash = Math.abs(runway.along % 40) < 22;
    if (Math.abs(runway.across) < 1.6 && dash) return [232, 232, 220];
    if (Math.abs(runway.across) > runway.field.width / 2 - 3) return [238, 238, 225];
    return [74, 74, 78];
  }
  if (isWater(x, z, h)) return [58, 122, 168];
  if (Math.abs(x - ROAD_X) < 7 && Math.abs(z) < HALF - 100) return [96, 90, 82];
  const flat = flattenAt(x, z);
  if (flat > 0.55) return [150, 168, 92]; // mown grass around the strips
  const patch = NOISE.at(x + 900, z - 400, 340);
  const trees = NOISE.at(x - 300, z + 700, 180);
  if (trees > 0.42 && h > 18) {
    const shade = 26 + trees * 22;
    return [28 + shade * 0.4, 74 + shade, 34 + shade * 0.4];
  }
  if (patch > 0.45) return [196, 178, 96]; // wheat
  if (patch > 0.12) return [118, 158, 74]; // pasture
  if (patch < -0.4) return [88, 128, 62]; // meadow
  return [104, 146, 70]; // farmland green
}

export function fieldById(id) {
  return AIRFIELDS.find((f) => f.id === id);
}

// Ring course: a gentle loop out from home field, over the river and back, at mixed
// heights so the pilot climbs, dives and banks.
export function buildRings() {
  const rng = createRandom(WORLD_SEED + 7);
  const centres = [
    [0, 120, -250],
    [-320, 150, -750],
    [-750, 190, -1050],
    [-1150, 170, -700],
    [-900, 140, -150],
    [250, 160, -450],
    [700, 180, -750],
    [1050, 150, -250],
  ];
  return centres.map(([x, alt, z], i) => ({
    index: i,
    x,
    y: alt,
    z,
    radius: 26,
    wobble: rng.range(0, Math.PI * 2),
  }));
}

// Farm drop zones: three red-barn clearings, each a flat circle the pilot must cross
// low and slow.
export function buildDropZones() {
  return [
    { id: 'barn-a', name: 'Red Barn Farm', x: -620, z: 620, radius: 55 },
    { id: 'barn-b', name: 'Mill Farm', x: 780, z: 900, radius: 55 },
    { id: 'barn-c', name: 'Hill Farm', x: -1050, z: 1050, radius: 55 },
  ];
}

// Clouds drift slowly; fixed positions from the seed so screenshots repeat.
export function buildClouds() {
  const rng = createRandom(WORLD_SEED + 21);
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: rng.range(-HALF, HALF),
      y: rng.range(280, 520),
      z: rng.range(-HALF, HALF),
      size: rng.range(90, 260),
      puffs: Math.floor(rng.range(3, 6)),
      seed: rng.range(0, 100),
    });
  }
  return clouds;
}

export function createTerrain() {
  const cell = TERRAIN.cell;
  const count = Math.floor(TERRAIN.size / cell) + 1;
  const heights = new Float32Array(count * count);
  const colors = new Uint8Array(count * count * 3);
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const x = -HALF + ix * cell;
      const z = -HALF + iz * cell;
      const h = heightAt(x, z);
      heights[iz * count + ix] = h;
      const [r, g, b] = groundColor(x, z, h);
      const o = (iz * count + ix) * 3;
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
    }
  }
  return {
    cell,
    count,
    half: HALF,
    heights,
    colors,
    rings: buildRings(),
    dropZones: buildDropZones(),
    clouds: buildClouds(),
    heightAt,
    groundColor,
  };
}
