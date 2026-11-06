// Calcudoku's cages, pure: the four operations, a cage's target, its label as printed, and every way of filling a
// cage that makes its target. A cage's digits may repeat (unlike Killer's) wherever two of its cells share no row or
// column, so an L of three cells adding up to 4 can be 1, 2, 1; the ways respect that. A cage whose operation is
// hidden ("?") is every way any operation could make its target; one whose clue a player can't see (at a table that
// splits the clues) has no ways at all, and constrains nothing.
import { seesOf, bit } from "./calcudoku-grid.js";

/** The printed signs: a cage of one cell shows its digit alone. */
export const SIGN = { "+": "+", "-": "−", x: "×", "/": "÷", "=": "" };
export const WORD = { "+": "adds up to", "-": "has a difference of", x: "multiplies to", "/": "divides to", "=": "is" };
/** The operations a cage of this many cells can have: − and ÷ only ever take two cells, as printed puzzles have them. */
export const opsFor = size => (size === 1 ? ["="] : size === 2 ? ["+", "-", "x", "/"] : ["+", "x"]);

/** What these digits make by an operation (÷ only when one divides the other: null otherwise). */
export function targetOf(op, ds) {
  switch (op) {
    case "=": return ds[0];
    case "+": { let s = 0; for (const d of ds) s += d; return s; }
    case "x": { let p = 1; for (const d of ds) p *= d; return p; }
    case "-": return Math.abs(ds[0] - ds[1]);
    case "/": { const hi = Math.max(ds[0], ds[1]), lo = Math.min(ds[0], ds[1]); return hi % lo ? null : hi / lo; }
    default: return null;
  }
}
/** Whether digits make a target: by the operation, or by any ("?", a hidden operation). */
export const holds = (op, target, ds) => (op === "?" ? opsFor(ds.length).some(o => targetOf(o, ds) === target) : targetOf(op, ds) === target);

/** A cage's label as the corner of its first cell shows it: "12×", "3−", or the digit of a cage of one; a hidden
 *  operation shows the target alone. */
export const labelOf = (cage, hidden = false) => `${cage.target}${hidden ? "" : SIGN[cage.op] || ""}`;

/**
 * Every way of filling the cells that makes the target by the operation, as one flat list of digits (cage.cells.length
 * a way, in the cells' order): digits 1..n, different wherever two cells share a row or column. "?" is every operation
 * the cage's size allows, each way once.
 */
export function waysOf(shape, cells, op, target) {
  const n = shape.n, k = cells.length;
  if (op === "?") {
    const seen = new Set(), out = [];
    for (const o of opsFor(k)) {
      const w = waysOf(shape, cells, o, target);
      for (let i = 0; i < w.length; i += k) {
        let key = 0;
        for (let j = 0; j < k; j++) key = key * 10 + w[i + j];
        if (seen.has(key)) continue;
        seen.add(key);
        for (let j = 0; j < k; j++) out.push(w[i + j]);
      }
    }
    return Uint8Array.from(out);
  }
  // which earlier cells each cell shares a row or column with, as bits: they may not repeat its digit
  const before = cells.map((c, j) => { let m = 0; for (let i = 0; i < j; i++) if (seesOf(shape, cells[i], c)) m |= 1 << i; return m; });
  const out = [], pick = new Array(k).fill(0);
  // the most the cells still to fill can multiply to, to cut a product short
  const most = Array.from({ length: k + 1 }, (_, rem) => n ** rem);
  const go = (j, acc) => {
    if (j === k) {
      const ok = op === "+" || op === "x" ? acc === target : targetOf(op, pick) === target;
      if (ok) out.push(...pick);
      return;
    }
    let banned = 0;
    for (let i = 0, b = before[j]; b; i++, b >>= 1) if (b & 1) banned |= bit(pick[i]);
    const rem = k - j - 1;
    for (let d = 1; d <= n; d++) {
      if (banned & bit(d)) continue;
      let next = acc;
      if (op === "+") { next = acc + d; if (next + rem > target || next + rem * n < target) continue; }
      else if (op === "x") { next = acc * d; if (target % next || next * most[rem] < target) continue; }
      else if (op === "=" && d !== target) continue;
      pick[j] = d;
      go(j + 1, next);
    }
  };
  go(0, op === "x" ? 1 : 0);
  return Uint8Array.from(out);
}

/**
 * A cage read against the cells' candidates (masks, by cell): how many of its ways are still possible, and each cell's
 * digits across them, in the cage's order. Reading is the step every solver here repeats, so it's kept tight.
 */
export function readCage(cage, cand) {
  const { cells, ways } = cage, k = cells.length, can = new Uint16Array(k);
  let alive = 0;
  outer: for (let w = 0; w < ways.length; w += k) {
    for (let j = 0; j < k; j++) if (!(cand[cells[j]] & (1 << ways[w + j]))) continue outer;
    alive++;
    for (let j = 0; j < k; j++) can[j] |= 1 << ways[w + j];
  }
  return { alive, can };
}
/**
 * What a cage's ways still allow each of its cells (masks, in the cage's order), or null when no way is possible. The
 * exact solver's reading: it stops as soon as every cell keeps all it has, since nothing more could be struck out.
 */
export function narrowCage(cage, cand) {
  const { cells, ways } = cage, k = cells.length, can = new Uint16Array(k);
  let any = false;
  outer: for (let w = 0; w < ways.length; w += k) {
    for (let j = 0; j < k; j++) if (!(cand[cells[j]] & (1 << ways[w + j]))) continue outer;
    any = true;
    let whole = true;
    for (let j = 0; j < k; j++) { can[j] |= 1 << ways[w + j]; if (can[j] !== cand[cells[j]]) whole = false; }
    if (whole) return can;
  }
  return any ? can : null;
}
/** Calls fn(ways, at) for each way still possible (its digits are ways[at..at+k)); fn returning false stops. */
export function eachAlive(cage, cand, fn) {
  const { cells, ways } = cage, k = cells.length;
  outer: for (let w = 0; w < ways.length; w += k) {
    for (let j = 0; j < k; j++) if (!(cand[cells[j]] & (1 << ways[w + j]))) continue outer;
    if (fn(ways, w) === false) return;
  }
}

/**
 * The cages of a grid ready to solve: each { cells, op, target, ways } where its clue is known; a hidden operation
 * reads as "?"; a cage whose clue is out of sight (seen[i] false) keeps its cells and nothing else. cache: a Map that
 * keeps each cage's ways by its cells and clue, for a generator that solves the same cut again and again.
 */
export function cagesFor(shape, cages, { hidden = false, seen = null, cache = null } = {}) {
  return cages.map((c, i) => {
    const cells = Int16Array.from(c.cells);
    if (seen && !seen[i]) return { cells, op: null, target: null, ways: null, index: i };
    const op = hidden && c.cells.length > 1 ? "?" : c.op, key = `${c.cells.join(",")}|${op}|${c.target}`;
    let ways = cache?.get(key);
    if (!ways) { ways = waysOf(shape, [...cells], op, c.target); cache?.set(key, ways); }
    return { cells, op, target: c.target, ways, index: i };
  });
}
