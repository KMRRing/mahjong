// Tally's exact solver, pure: candidates as bit masks, every run kept to the ways it can still be filled, and a
// search on the cell with the fewest candidates, counting solutions up to a limit (two, to prove there is exactly one).
// The generator fills its grids with it too, and kakuro-logic.js's human-style solver uses fitRun for its own step.
import { POP, ALL, bit, digitOf, digitsOf, combosOf } from "./kakuro-grid.js";

// scratch for fitRun's layers, kept between calls (it runs thousands of times a grid, and fresh arrays each time cost
// more in collecting them than in using them): layer i holds the masks of digits the cells before cell i (forward) or
// from it on (backward) can use between them, at [i * 512, i * 512 + its length); a mask is in layer i where its stamp
// there is the call's epoch
const FWD = new Int32Array(10 * 1024), BACK = new Int32Array(10 * 1024);
const FL = new Uint16Array(10 * 512), BL = new Uint16Array(10 * 512), FN = new Int32Array(10), BN = new Int32Array(10);
let epoch = 0;

/**
 * What one run allows each of its cells: { allowed (a mask a cell: the digits some way of filling the run puts
 * there), fits (the combinations some way uses) }. A way of filling it gives each cell a digit it can hold, a
 * different digit each, together one of `combos`. cands: the run's cells' candidates, in order.
 */
export function fitRun(cands, combos) {
  const k = cands.length, allowed = new Uint16Array(k), fits = [];
  let any = 0;
  for (let i = 0; i < k; i++) any |= cands[i];
  for (const C of combos) {
    if ((C & any) !== C) continue;                              // a digit of it fits no cell
    let ok = true;
    for (let i = 0; i < k && ok; i++) if (!(cands[i] & C)) ok = false;
    if (!ok) continue;
    if (fitCombo(cands, C, allowed)) fits.push(C);
  }
  return { allowed, fits };
}
/** One combination's ways, by layers: forward, the digits the first i cells can use between them; backward, the last
 *  ones'. A digit d fits cell i where the first i cells leave it free and the rest of C is the last cells' to use. */
function fitCombo(cands, C, allowed) {
  if (epoch > 2e9) { FWD.fill(0); BACK.fill(0); epoch = 0; }
  const k = cands.length, e = ++epoch;
  FL[0] = 0; FN[0] = 1; FWD[0] = e;
  for (let i = 0; i < k; i++) {
    const can = cands[i] & C, from = i * 512, to = (i + 1) * 512, stamp = (i + 1) * 1024;
    let n = 0;
    for (let j = 0; j < FN[i]; j++) {
      const m = FL[from + j];
      for (let x = can & ~m; x; x &= x - 1) {
        const y = m | (x & -x);
        if (FWD[stamp + y] !== e) { FWD[stamp + y] = e; FL[to + n++] = y; }
      }
    }
    if (!n) return false;
    FN[i + 1] = n;
  }
  if (FWD[k * 1024 + C] !== e) return false;
  // backward from the last cell
  BL[k * 512] = 0; BN[k] = 1; BACK[k * 1024] = e;
  for (let i = k - 1; i >= 0; i--) {
    const can = cands[i] & C, from = (i + 1) * 512, to = i * 512, stamp = i * 1024;
    let n = 0;
    for (let j = 0; j < BN[i + 1]; j++) {
      const m = BL[from + j];
      for (let x = can & ~m; x; x &= x - 1) {
        const y = m | (x & -x);
        if (BACK[stamp + y] !== e) { BACK[stamp + y] = e; BL[to + n++] = y; }
      }
    }
    BN[i] = n;
  }
  for (let i = 0; i < k; i++) {
    const can = cands[i] & C, after = (i + 1) * 1024, from = i * 512;
    for (let j = 0; j < FN[i]; j++) {
      const m = FL[from + j];
      for (let x = can & ~m; x; x &= x - 1) {
        const d = x & -x;
        if (BACK[after + (C & ~m & ~d)] === e) allowed[i] |= d;
      }
    }
  }
  return true;
}
/** A run without a known clue: only different digits, so a digit settled in one cell leaves the others. */
function fitAny(cands) {
  const out = Uint16Array.from(cands);
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      if (POP[out[i]] !== 1) continue;
      for (let j = 0; j < out.length; j++) if (j !== i && (out[j] & out[i])) { out[j] &= ~out[i]; changed = true; }
    }
  }
  return out;
}

/**
 * A solver for a grid: shape (kakuro-grid.js), clues (one a run, in the shape's order; null for a run whose clue
 * isn't known) and op ("sum" or "product"). solve() returns { count, solutions, solution, aborted, nodes }.
 */
export function solver(shape, clues, op = "sum") {
  const { runs, white, across, down, cells } = shape;
  const combos = runs.map((run, k) => (clues[k] == null ? null : combosOf(op, run.cells.length, clues[k])));
  const queued = new Uint8Array(runs.length);
  const queue = [];
  const push = k => { if (!queued[k]) { queued[k] = 1; queue.push(k); } };
  const scratch = new Uint16Array(9);

  /** Every queued run kept to its ways, each change queuing the runs it crosses; false on a contradiction. */
  function propagate(cand) {
    while (queue.length) {
      const k = queue.pop();
      queued[k] = 0;
      const cs = runs[k].cells, n = cs.length, local = scratch.subarray(0, n);
      for (let j = 0; j < n; j++) local[j] = cand[cs[j]];
      let allowed;
      if (combos[k]) {
        const f = fitRun(local, combos[k]);
        if (!f.fits.length) return clear();
        allowed = f.allowed;
      } else allowed = fitAny(local);
      for (let j = 0; j < n; j++) {
        const c = cs[j];
        if (allowed[j] === cand[c]) continue;
        if (!allowed[j]) return clear();
        cand[c] = allowed[j];
        push(runs[k].dir === "across" ? down[c] : across[c]);
      }
    }
    return true;
  }
  function clear() { for (const k of queue) queued[k] = 0; queue.length = 0; return false; }

  /**
   * Solutions up to `limit`. fixed: digits already known (0 for none), by cell; rng: the order digits are tried in, at
   * random (to fill a grid); maxNodes: a search longer than this gives up (aborted).
   */
  function solve({ fixed = null, limit = 2, rng = null, maxNodes = 200000 } = {}) {
    const cand = new Uint16Array(cells);
    for (const c of white) cand[c] = fixed?.[c] ? bit(fixed[c]) : ALL;
    for (let k = 0; k < runs.length; k++) push(k);
    const out = { count: 0, solutions: [], solution: null, aborted: false, nodes: 0 };
    if (!propagate(cand)) return out;
    const search = cand => {
      if (++out.nodes > maxNodes) { out.aborted = true; return; }
      let best = -1, fewest = 10;
      for (const c of white) { const p = POP[cand[c]]; if (p > 1 && p < fewest) { fewest = p; best = c; if (p === 2) break; } }
      if (best < 0) {
        const sol = new Uint8Array(cells);
        for (const c of white) sol[c] = digitOf(cand[c]);
        out.count++;
        out.solutions.push(sol);
        return;
      }
      const ds = digitsOf(cand[best]);
      if (rng) for (let i = ds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ds[i], ds[j]] = [ds[j], ds[i]]; }
      for (const d of ds) {
        const next = cand.slice();
        next[best] = bit(d);
        push(across[best]); push(down[best]);
        if (propagate(next)) search(next);
        if (out.count >= limit || out.aborted) return;
      }
    };
    search(cand);
    out.solution = out.solutions[0] || null;
    return out;
  }
  return { solve, propagate, combos };
}
