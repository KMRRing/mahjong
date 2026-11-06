// Nonet's exact solver, pure: it settles what the grid forces (a cell with one candidate left, a digit with one place
// left in a unit, a Killer cage's sums), then tries each candidate of the cell with the fewest, counting solutions up to
// a limit. With a limit of two it proves a grid has exactly one solution, the test every grid passes before it's dealt;
// with a random order it fills an empty grid at random, which is how every solution starts. Candidates are bit masks
// (sudoku-grid.js), so a whole grid's state is two small typed arrays, copied at each guess.
import { POP, digitOf, digitsOf, shuffle } from "./sudoku-grid.js";

const COMBOS = new Map();
/**
 * Every set of k different digits from 1..n that adds up to s, as masks: combosOf(n)[k][s]. Killer's cages are read
 * through it (a cage of two cells adding up to 3 can only be 1 and 2).
 */
export function combosOf(n) {
  if (COMBOS.has(n)) return COMBOS.get(n);
  const out = Array.from({ length: n + 1 }, () => []);
  for (let m = 2; m < 1 << (n + 1); m += 2) {
    const k = POP[m];
    let s = 0;
    for (const d of digitsOf(m)) s += d;
    (out[k][s] ||= []).push(m);
  }
  COMBOS.set(n, out);
  return out;
}

/**
 * A solver for one grid's shape (shapeOf). solve(givens, { limit, rng, maxNodes }) → { count, solution, solutions,
 * nodes, aborted }: givens are the grid's digits (0 for an empty cell); count is how many solutions it found, up to
 * limit; solution the first, solutions all it found; rng, if given, tries candidates in a random order (to fill a grid
 * at random); maxNodes gives up past that many steps of the search (aborted), for the rare grid that would take too long.
 */
export function solver(shape) {
  const { cells, units, peers, all, cages } = shape;
  const combos = cages ? combosOf(shape.n) : null;

  /** A cage's sum, read against its cells' candidates: each cell keeps only digits some combination still allows.
   *  Returns -1 when the cage can't add up, 1 when it narrowed a cell, else 0. */
  function cageSettle(cage, cand, val, stack) {
    let sum = cage.sum, free = 0, used = 0, union = 0;
    for (const c of cage.cells) { if (val[c]) { sum -= val[c]; used |= cand[c]; } else { free++; union |= cand[c]; } }
    if (!free) return sum === 0 ? 0 : -1;
    if (sum <= 0) return -1;
    const list = combos[free]?.[sum];
    if (!list) return -1;
    let ok = 0;
    for (const m of list) if (!(m & used) && (m & union) === m) ok |= m;
    if (!ok) return -1;
    let changed = 0;
    for (const c of cage.cells) {
      if (val[c]) continue;
      const m = cand[c], r = m & ok;
      if (r === m) continue;
      if (!r) return -1;
      cand[c] = r;
      changed = 1;
      if (!(r & (r - 1))) { val[c] = digitOf(r); stack.push(c); }
    }
    return changed;
  }

  /** Settles what the grid forces, from the cells just placed (stack); false if it can't be solved from here. */
  function settle(cand, val, stack) {
    for (;;) {
      while (stack.length) {
        const i = stack.pop(), b = cand[i], ps = peers[i];
        for (let k = 0; k < ps.length; k++) {
          const p = ps[k], m = cand[p];
          if (!(m & b)) continue;
          if (val[p]) return false;                       // a peer already holds this digit
          const r = m & ~b;
          if (!r) return false;
          cand[p] = r;
          if (!(r & (r - 1))) { val[p] = digitOf(r); stack.push(p); }
        }
      }
      let more = false;
      for (let u = 0; u < units.length; u++) {
        const cs = units[u];
        let at1 = 0, at2 = 0, have = 0;
        for (let k = 0; k < cs.length; k++) { const c = cs[k], m = cand[c]; if (val[c]) have |= m; else { at2 |= at1 & m; at1 |= m; } }
        if ((at1 | have) !== all) return false;            // a digit with nowhere left to go in this unit
        let once = at1 & ~at2 & ~have;
        while (once) {
          const b = once & -once;
          once ^= b;
          for (let k = 0; k < cs.length; k++) {
            const c = cs[k];
            if (!val[c] && (cand[c] & b)) { cand[c] = b; val[c] = digitOf(b); stack.push(c); more = true; break; }
          }
        }
      }
      if (cages && !stack.length) for (const cage of cages) {
        if (cage.sum == null) continue;                    // a cage whose sum this player can't see: its digits differ, that's all
        const r = cageSettle(cage, cand, val, stack);
        if (r < 0) return false;
        if (r) more = true;
      }
      if (!more && !stack.length) return true;
    }
  }

  function solve(givens, { limit = 2, rng = null, maxNodes = 0 } = {}) {
    const cand = new Uint16Array(cells).fill(all), val = new Uint8Array(cells), stack = [];
    for (let i = 0; i < cells; i++) {
      const d = givens[i];
      if (!d) continue;
      if (!(cand[i] & (1 << d))) return { count: 0, solution: null, nodes: 0, aborted: false };
      cand[i] = 1 << d; val[i] = d; stack.push(i);
    }
    let count = 0, solution = null, nodes = 0, aborted = false;
    const solutions = [];
    const go = (cand, val, stack) => {
      if (!settle(cand, val, stack)) return false;
      if (maxNodes && ++nodes > maxNodes) { aborted = true; return true; }
      let best = -1, fewest = 99;
      for (let i = 0; i < cells; i++) {
        if (val[i]) continue;
        const p = POP[cand[i]];
        if (p < fewest) { fewest = p; best = i; if (p === 2) break; }
      }
      if (best < 0) { count++; solutions.push(Uint8Array.from(val)); solution ||= solutions[0]; return count >= limit; }
      const ds = digitsOf(cand[best]);
      if (rng) shuffle(rng, ds);
      for (const d of ds) {
        const c2 = cand.slice(), v2 = val.slice();
        c2[best] = 1 << d; v2[best] = d;
        if (go(c2, v2, [best])) return true;
      }
      return false;
    };
    go(cand, val, stack);
    return { count, solution, solutions, nodes, aborted };
  }

  return { solve, settle };
}
