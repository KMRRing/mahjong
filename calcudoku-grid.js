// Calcudoku's grid, pure (no DOM): an n×n Latin square's cells and lines (its rows and columns), each cell's peers,
// digits held as bits, and the seeded random numbers every grid is made from. A cage is just a list of cells, so the
// solvers (calcudoku-solve.js, calcudoku-logic.js) are written against what shapeOf returns and the cages beside it.

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

/**
 * The grid's structure, the same for every grid of a size (so kept): { n, cells, all, units, rows, cols, unitsOf,
 * peers, sees, rowOf, colOf }. units: the rows (0..n-1), then the columns (n..2n-1); unitsOf: each cell's row and
 * column; peers: the cells each cell must differ from; sees: the same as a cells×cells table, for a quick look-up.
 */
const SHAPES = new Map();
export function shapeOf(n) {
  if (SHAPES.has(n)) return SHAPES.get(n);
  const cells = n * n, units = [];
  for (let r = 0; r < n; r++) units.push(Int16Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Int16Array.from({ length: n }, (_, r) => r * n + c));
  const rowOf = Int8Array.from({ length: cells }, (_, i) => Math.floor(i / n)), colOf = Int8Array.from({ length: cells }, (_, i) => i % n);
  const unitsOf = Array.from({ length: cells }, (_, i) => [rowOf[i], n + colOf[i]]);
  const sees = new Uint8Array(cells * cells);
  for (let a = 0; a < cells; a++) for (let b = 0; b < cells; b++) if (a !== b && (rowOf[a] === rowOf[b] || colOf[a] === colOf[b])) sees[a * cells + b] = 1;
  const peers = Array.from({ length: cells }, (_, a) => Int16Array.from([...Array(cells).keys()].filter(b => sees[a * cells + b])));
  const shape = { n, cells, all: allOf(n), units, rows: units.slice(0, n), cols: units.slice(n), unitsOf, peers, sees, rowOf, colOf };
  SHAPES.set(n, shape);
  return shape;
}
/** Whether two cells share a row or a column (so may not hold the same digit). */
export const seesOf = (shape, a, b) => shape.sees[a * shape.cells + b] === 1;
/** The cells next to a cell, edge to edge (what a cage grows by). */
export function nearOf(n, i) {
  const out = [];
  if (i >= n) out.push(i - n);
  if (i + n < n * n) out.push(i + n);
  if (i % n) out.push(i - 1);
  if ((i + 1) % n) out.push(i + 1);
  return out;
}
/** Whether these cells are one piece, joined edge to edge. */
export function connected(n, cs) {
  if (!cs.length) return false;
  const set = new Set(cs), seen = new Set([cs[0]]), stack = [cs[0]];
  while (stack.length) for (const j of nearOf(n, stack.pop())) if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
  return seen.size === cs.length;
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
/** One of several choices, by their weights. */
export function weighted(r, pairs) {
  let x = r() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) { x -= w; if (x < 0) return v; }
  return pairs.at(-1)[0];
}

// ---------- names, as a hint says them ----------
/** A line in words: "row 3", "column 5". */
export const unitName = (shape, u) => (u < shape.n ? `row ${u + 1}` : `column ${u - shape.n + 1}`);
/** A cell in words: "row 3, column 5". */
export const cellName = (n, i) => `row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
