// Nonet's grid, pure (no DOM): an n×n grid's cells and units (its rows, columns and regions, and its two diagonals
// where they count), each cell's peers, digits held as bits, and the seeded random numbers every grid is made from.
// Everything else (sudoku-solve.js, sudoku-logic.js, sudoku-engine.js) is written against what shapeOf returns, so a
// region of any shape, a diagonal or a killer cage is just another list of cells.

/** Digits as bits: digit d is 1 << d, so a cell's candidates 1..9 fit in ten bits. */
export const bit = d => 1 << d;
/** The digit of a mask with one bit set. */
export const digitOf = m => 31 - Math.clz32(m);
/** How many bits are set, for every mask of ten bits. */
export const POP = Uint8Array.from({ length: 1024 }, (_, m) => { let c = 0; for (let x = m; x; x &= x - 1) c++; return c; });
/** The digits of a mask, lowest first. */
export function digitsOf(m) { const out = []; for (let x = m; x; x &= x - 1) out.push(digitOf(x & -x)); return out; }
/** Every digit of an n-sided grid, 1..n, as a mask. */
export const allOf = n => (1 << (n + 1)) - 2;

/** A box's rows and columns, by the grid's side: 9 has 3×3 boxes, 6 has boxes two rows tall and three wide. */
export const BOX = { 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3] };

/** The boxes as regions: each cell's box number, in reading order. */
export function boxRegions(n) {
  const [bh, bw] = BOX[n], out = new Int8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r * n + c] = Math.floor(r / bh) * (n / bw) + Math.floor(c / bw);
  return out;
}

/**
 * The grid's structure: { n, cells, all, regions, units, kinds, unitsOf, peers, sees, rows, cols, cages, cageOf }.
 * units: every unit's cells (rows, then columns, then regions, then the diagonals when `diagonals`); kinds: "row",
 * "col", "box" (a regular box), "region" (a jigsaw piece) or "diag", by unit; unitsOf: each cell's units; peers: the
 * cells each cell must differ from (its units', and its cage's in Killer); sees: the same as a cells×cells table, for a
 * quick look-up; cages: Killer's [{ cells, sum }] (null otherwise), cageOf: each cell's cage.
 */
export function shapeOf(n, regions = boxRegions(n), { diagonals = false, cages = null } = {}) {
  const base = baseOf(n, regions, diagonals), cells = n * n;
  let { sees, peers } = base;
  const cageOf = new Int16Array(cells).fill(-1);
  if (cages) {
    sees = sees.slice();
    const touched = new Set();
    cages.forEach((cage, k) => { for (const a of cage.cells) { cageOf[a] = k; touched.add(a); for (const b of cage.cells) if (a !== b) sees[a * cells + b] = 1; } });
    peers = peers.slice();
    for (const a of touched) peers[a] = peersFrom(sees, cells, a);
  }
  return { ...base, sees, peers, cages: cages ? cages.map(c => ({ cells: [...c.cells], sum: c.sum })) : null, cageOf };
}
const peersFrom = (sees, cells, a) => { const out = []; for (let b = 0; b < cells; b++) if (sees[a * cells + b]) out.push(b); return Int16Array.from(out); };
/** A grid's units, peers and the rest, without cages: the same for every grid of a size, regions and diagonals, so
 *  kept (the generator and the relay make thousands of shapes, nearly all alike). Treated as read-only. */
const BASES = new Map();
function baseOf(n, regions, diagonals) {
  const key = `${n}|${regions.join("")}|${diagonals ? 1 : 0}`;
  const kept = BASES.get(key);
  if (kept) return kept;
  const cells = n * n, units = [], kinds = [];
  const add = (list, kind) => { units.push(Int16Array.from(list)); kinds.push(kind); };
  for (let r = 0; r < n; r++) add(Array.from({ length: n }, (_, c) => r * n + c), "row");
  for (let c = 0; c < n; c++) add(Array.from({ length: n }, (_, r) => r * n + c), "col");
  const boxes = BOX[n] ? boxRegions(n) : null, regular = !!boxes && regions.every((g, i) => g === boxes[i]);
  for (let g = 0; g < n; g++) add([...regions.keys()].filter(i => regions[i] === g), regular ? "box" : "region");
  if (diagonals) {
    add(Array.from({ length: n }, (_, k) => k * n + k), "diag");
    add(Array.from({ length: n }, (_, k) => k * n + (n - 1 - k)), "diag");
  }
  const unitsOf = Array.from({ length: cells }, () => []);
  units.forEach((u, k) => u.forEach(c => unitsOf[c].push(k)));
  const sees = new Uint8Array(cells * cells);
  for (const u of units) for (const a of u) for (const b of u) if (a !== b) sees[a * cells + b] = 1;
  const peers = Array.from({ length: cells }, (_, a) => peersFrom(sees, cells, a));
  const base = { key, n, cells, all: allOf(n), regions: Int8Array.from(regions), units, kinds, unitsOf, peers, sees, rows: units.slice(0, n), cols: units.slice(n, 2 * n), diagonals };
  if (BASES.size > 64) BASES.delete(BASES.keys().next().value);
  BASES.set(key, base);
  return base;
}

// ---------- seeded random numbers ----------
// Integer arithmetic only, so a seed gives the same grid on every phone (today's grid is made on each device from the
// date). mulberry32: small, fast, and good enough to shuffle a grid.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seed stirred with further numbers (a try's count, the rules), so each gets a stream of its own. */
export function mix(...xs) {
  let h = 0x811C9DC5;
  for (const x of xs) for (const ch of String(x)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
export const below = (r, n) => Math.floor(r() * n);
export function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// ---------- names, as a hint says them ----------
/** A unit in words: "row 3", "column 5", "box 7", "the lit region", "the main diagonal". */
export function unitName(shape, u) {
  const kind = shape.kinds[u], n = shape.n;
  if (kind === "row") return `row ${u + 1}`;
  if (kind === "col") return `column ${u - n + 1}`;
  if (kind === "box") return `box ${u - 2 * n + 1}`;
  if (kind === "region") return "the lit region";
  return u === 3 * n ? "the diagonal from the top left" : "the diagonal from the top right";
}
/** A cell in words: "row 3, column 5". */
export const cellName = (n, i) => `row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
