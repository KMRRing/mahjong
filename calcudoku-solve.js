// Calcudoku's exact solver, pure: it settles what the grid forces (a cell with one candidate left, a digit with one
// place left in a row or column, the digits a cage's ways still allow its cells), then tries each candidate of the cell
// with the fewest, counting solutions up to a limit. With a limit of two it proves a grid has exactly one solution, the
// test every grid passes before it's dealt; with a random order and no cages it fills an empty grid at random, which
// is how every grid's Latin square starts. Candidates are bit masks (calcudoku-grid.js), so a state is two small typed
// arrays, copied at each guess.
import { POP, digitOf, digitsOf, shuffle } from "./calcudoku-grid.js";
import { narrowCage } from "./calcudoku-cage.js";

/**
 * A solver for a grid's shape and its cages (cagesFor in calcudoku-cage.js; a cage without ways constrains nothing).
 * solve(values, { limit, rng, maxNodes }) → { count, solution, solutions, nodes, aborted }: values are digits already
 * in (0 for empty); count is how many solutions it found, up to limit; rng, if given, tries candidates in a random
 * order; maxNodes gives up past that many guesses (aborted), for the rare cut that would take too long.
 */
export function solver(shape, cages = []) {
  const { cells, units, peers, all } = shape;
  const live = cages.filter(c => c.ways);
  const cageOf = new Int16Array(cells).fill(-1);
  live.forEach((c, k) => { for (const i of c.cells) cageOf[i] = k; });

  /** Settles what the grid forces, from the cells just placed (stack); false if it can't be solved from here. dirty:
   *  the cages whose cells have changed since they were last read. */
  function settle(cand, val, stack, dirty) {
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
          if (cageOf[p] >= 0) dirty[cageOf[p]] = 1;
          if (!(r & (r - 1))) { val[p] = digitOf(r); stack.push(p); }
        }
      }
      let more = false;
      for (let u = 0; u < units.length; u++) {
        const cs = units[u];
        let at1 = 0, at2 = 0, have = 0;
        for (let k = 0; k < cs.length; k++) { const c = cs[k], m = cand[c]; if (val[c]) have |= m; else { at2 |= at1 & m; at1 |= m; } }
        if ((at1 | have) !== all) return false;            // a digit with nowhere left to go in this line
        let once = at1 & ~at2 & ~have;
        while (once) {
          const b = once & -once;
          once ^= b;
          for (let k = 0; k < cs.length; k++) {
            const c = cs[k];
            if (!val[c] && (cand[c] & b)) { cand[c] = b; val[c] = digitOf(b); stack.push(c); if (cageOf[c] >= 0) dirty[cageOf[c]] = 1; more = true; break; }
          }
        }
      }
      if (!stack.length) for (let k = 0; k < live.length; k++) {
        if (!dirty[k]) continue;
        dirty[k] = 0;
        const cage = live[k], can = narrowCage(cage, cand);
        if (!can) return false;
        for (let j = 0; j < cage.cells.length; j++) {
          const c = cage.cells[j], m = cand[c], r = m & can[j];
          if (r === m) continue;
          cand[c] = r;
          more = true;
          if (!(r & (r - 1)) && !val[c]) { val[c] = digitOf(r); stack.push(c); }
        }
      }
      if (!more && !stack.length) return true;
    }
  }

  function solve(values, { limit = 2, rng = null, maxNodes = 0 } = {}) {
    const cand = new Uint16Array(cells).fill(all), val = new Uint8Array(cells), stack = [], dirty = new Uint8Array(live.length).fill(1);
    for (let i = 0; i < cells; i++) {
      const d = values[i];
      if (!d) continue;
      if (!(cand[i] & (1 << d))) return { count: 0, solution: null, solutions: [], nodes: 0, aborted: false };
      cand[i] = 1 << d; val[i] = d; stack.push(i);
    }
    let count = 0, nodes = 0, aborted = false;
    const solutions = [];
    const go = (cand, val, stack, dirty) => {
      if (!settle(cand, val, stack, dirty)) return false;
      if (++nodes > maxNodes && maxNodes) { aborted = true; return true; }
      let best = -1, fewest = 99;
      for (let i = 0; i < cells; i++) {
        if (val[i]) continue;
        const p = POP[cand[i]];
        if (p < fewest) { fewest = p; best = i; if (p === 2) break; }
      }
      if (best < 0) { count++; solutions.push(Uint8Array.from(val)); return count >= limit; }
      const ds = digitsOf(cand[best]);
      if (rng) shuffle(rng, ds);
      for (const d of ds) {
        const c2 = cand.slice(), v2 = val.slice(), d2 = dirty.slice();
        c2[best] = 1 << d; v2[best] = d;
        if (cageOf[best] >= 0) d2[cageOf[best]] = 1;
        if (go(c2, v2, [best], d2)) return true;
      }
      return false;
    };
    go(cand, val, stack, dirty);
    return { count, solution: solutions[0] || null, solutions, nodes, aborted };
  }

  return { solve };
}

/** A random Latin square of side n: each digit once in every row and column. */
export function latinSquare(shape, r) {
  return solver(shape).solve(new Uint8Array(shape.cells), { limit: 1, rng: r }).solution;
}
