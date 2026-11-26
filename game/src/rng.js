// Seeded randomness: a small mulberry32 generator plus smooth 2D value noise, so the
// valley, the rings and every screenshot scene are identical for the same seed.
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + next() * (max - min);
  }
  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }
  return { next, range, pick };
}

// A deterministic 2D value-noise field: hash the integer lattice, smooth-interpolate.
export function createNoise(seed) {
  function hash(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function at(x, z, scale) {
    const fx = x / scale;
    const fz = z / scale;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = smooth(fx - ix);
    const tz = smooth(fz - iz);
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return top + (bottom - top) * tz;
  }
  // Fractal sum over three octaves, kept in roughly [-1, 1].
  function fbm(x, z) {
    return at(x, z, 620) * 0.55 + at(x, z, 260) * 0.3 + at(x, z, 110) * 0.15;
  }
  return { at, fbm };
}
