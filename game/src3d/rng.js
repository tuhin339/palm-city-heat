// A small seeded random number generator for the 3D city: the same seed always grows
// the same Palm City, so the shot scenes and the skyline are reproducible. mulberry32
// is the core; the helpers hang the ranges and picks the builders need off it.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max], both ends included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element of the array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Read ?seed= from the page URL, falling back to 1 like the 2D game's scenes. */
export function seedFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Read ?shot= from the page URL, or null for free driving. */
export function shotFromUrl() {
  return new URLSearchParams(window.location.search).get('shot');
}
