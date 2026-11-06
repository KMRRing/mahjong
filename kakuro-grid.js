// Tally's grid, pure (no DOM): which cells are black, the runs of white cells (each headed by its clue cell, the
// black cell just left of an across run or just above a down run), each white cell's two runs and its peers, digits
// held as bits, the combinations a run can be (the sets of different digits that add up, or multiply out, to its
// clue), and the seeded random numbers every grid is made from. Everything else (kakuro-solve.js, kakuro-logic.js,
// kakuro-engine.js) is written against what shapeOf returns.

/** Digits as bits: digit d is 1 << d, so a cell's candidates 1..9 fit in ten bits. */
export const bit = d => 1 << d;
/** Every digit, 1 to 9. */
export const ALL = 0b1111111110;
/** The digit of a mask with one bit set. */
export const digitOf = m => 31 - Math.clz32(m);
/** How many bits are set, for every mask of ten bits. */
export const POP = Uint8Array.from({ length: 1024 }, (_, m) => { let c = 0; for (let x = m; x; x &= x - 1) c++; return c; });
/** The digits of a mask, lowest first. */
export function digitsOf(m) { const out = []; for (let x = m; x; x &= x - 1) out.push(digitOf(x & -x)); return out; }
const SUM = Uint8Array.from({ length: 1024 }, (_, m) => digitsOf(m & ALL).reduce((s, d) => s + d, 0));
const PRODUCT = Uint32Array.from({ length: 1024 }, (_, m) => digitsOf(m & ALL).reduce((s, d) => s * d, 1));
/** What a set of digits comes to under a run's rule: their sum, or their product. */
export const total = (op, m) => (op === "product" ? PRODUCT[m] : SUM[m]);

/**
 * The grid's structure: { rows, cols, cells, black, white, runs, across, down, peers }. runs: every run of white
 * cells, in reading order of their clue cells (an across run before a down one from the same clue cell), each
 * { dir: "across" | "down", head (its clue cell), cells }; across, down: each white cell's run of each direction
 * (-1 for a black cell); peers: the cells each white cell must differ from (the rest of its two runs).
 */
export function shapeOf(rows, cols, black) {
  const cells = rows * cols, runs = [], across = new Int16Array(cells).fill(-1), down = new Int16Array(cells).fill(-1);
  for (let i = 0; i < cells; i++) {
    if (!black[i]) continue;
    const r = Math.floor(i / cols), c = i % cols;
    if (c + 1 < cols && !black[i + 1]) {
      const run = [];
      for (let j = i + 1; j < (r + 1) * cols && !black[j]; j++) run.push(j);
      runs.push({ dir: "across", head: i, cells: Int16Array.from(run) });
    }
    if (r + 1 < rows && !black[i + cols]) {
      const run = [];
      for (let j = i + cols; j < cells && !black[j]; j += cols) run.push(j);
      runs.push({ dir: "down", head: i, cells: Int16Array.from(run) });
    }
  }
  runs.forEach((run, k) => { for (const c of run.cells) (run.dir === "across" ? across : down)[c] = k; });
  const white = [];
  for (let i = 0; i < cells; i++) if (!black[i]) white.push(i);
  const peers = Array.from({ length: cells }, () => null);
  for (const i of white) peers[i] = Int16Array.from([...runs[across[i]].cells, ...runs[down[i]].cells].filter(j => j !== i));
  return { rows, cols, cells, black: Uint8Array.from(black), white: Int16Array.from(white), runs, across, down, peers };
}

/** Whether a pattern is a Tally's: every white cell in an across run and a down run of two cells or more, none longer
 *  than nine (there are only nine digits), and the white cells all joined, edge to edge. */
export function patternOk(rows, cols, black) {
  const cells = rows * cols;
  for (let i = 0; i < cells; i++) {
    if (black[i]) continue;
    const r = Math.floor(i / cols), c = i % cols;
    if (r === 0 || c === 0) return false;                      // the first row and column hold clues
    const lone = (black[i - 1]) && (c + 1 >= cols || black[i + 1]);
    const loneDown = (black[i - cols]) && (r + 1 >= rows || black[i + cols]);
    if (lone || loneDown) return false;
  }
  const sh = shapeOf(rows, cols, black);
  if (!sh.white.length || sh.runs.some(run => run.cells.length > 9)) return false;
  return joined(sh);
}
/** Whether the white cells are one piece. */
export function joined(sh) {
  const { cols, cells, black, white } = sh;
  if (!white.length) return false;
  const seen = new Uint8Array(cells), stack = [white[0]];
  seen[white[0]] = 1;
  let n = 1;
  while (stack.length) {
    const i = stack.pop(), c = i % cols;
    for (const j of [i - cols, i + cols, c ? i - 1 : -1, c + 1 < cols ? i + 1 : -1]) {
      if (j < 0 || j >= cells || black[j] || seen[j]) continue;
      seen[j] = 1; n++; stack.push(j);
    }
  }
  return n === white.length;
}

// ---------- combinations ----------
// kept as they're asked for, by a number made of the rule, the length and the value (a product is under 400000), and
// again with the digits left out (the solvers ask for the same few thousands of times a grid)
const COMBOS = new Map(), WITHOUT = new Map();
/**
 * The combinations of `len` different digits whose total under `op` ("sum" or "product") is `value`, as masks
 * (value null: every set of `len` different digits, a run whose clue isn't known). `without`: digits that may not be
 * in them (those already placed elsewhere in the run). Read-only: the lists are shared.
 */
export function combosOf(op, len, value, without = 0) {
  const key = ((op === "product" ? 10 : 0) + len) * 4e5 + (value == null ? 0 : value + 1);
  let list = COMBOS.get(key);
  if (!list) {
    const out = [];
    for (let m = 2; m <= ALL; m += 2) if (POP[m] === len && (value == null || total(op, m) === value)) out.push(m);
    list = Uint16Array.from(out);
    COMBOS.set(key, list);
  }
  if (!without || !list.length) return list;
  const k2 = key * 1024 + without;
  let some = WITHOUT.get(k2);
  if (!some) {
    if (WITHOUT.size > 60000) WITHOUT.clear();
    some = list.filter(m => !(m & without));
    WITHOUT.set(k2, some);
  }
  return some;
}
/** The combinations a run can still be: its clue less the digits already in it, over its empty cells. */
export function combosLeft(op, value, empty, placed) {
  if (!empty && value == null) return Uint16Array.of(0);           // a full run whose clue isn't known: nothing to check
  if (value == null) return combosOf(op, empty, null, placed);
  const have = total(op, placed), left = op === "product" ? value / have : value - have;
  if (!Number.isInteger(left) || left < (op === "product" ? 1 : 0)) return new Uint16Array(0);
  if (!empty) return left === (op === "product" ? 1 : 0) ? Uint16Array.of(0) : new Uint16Array(0);
  return combosOf(op, empty, left, placed);
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
