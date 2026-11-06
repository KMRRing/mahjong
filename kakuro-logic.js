// Tally's human-style solver, pure: the steps a person takes, each found by a technique that says why, always the
// easiest step there is. It grades a grid (the hardest technique it needs), gives a hint (the next step, named, with
// its cells), and paces the computer player (kakuro-bot.js). A grid it can't finish is never dealt.
//
// Like a person's pencil marks, a cell's candidates come from its two runs: the digits some combination of each run
// still allows (its clue less the digits already in it, over its empty cells), less the digits already in either run.
// That much is taken as written (stateOf, and again after every digit placed); the steps are what follows from it:
//   rank 1  the last cell of a run (the rest of its clue); a cell whose two runs leave it one digit; a digit every
//           combination of a run holds, with one cell that can take it
//   rank 2  the ways that fit: a run's combinations narrowed to those its cells can hold, each digit placed where it
//           can go, a different digit each (pairs and triples in a run follow from it)
//   rank 3  a block's sums: inside a rectangle of the grid, the across clues of the runs it holds whole against its
//           down clues, which leaves the one or two cells only one of them covers (the rule of 45's cousin)
import { POP, ALL, bit, digitOf, digitsOf, combosLeft, total } from "./kakuro-grid.js";
import { fitRun } from "./kakuro-solve.js";

export const TECHNIQUES = {
  last: { rank: 1, name: "The last cell" },
  single: { rank: 1, name: "Where two runs cross" },
  hidden: { rank: 1, name: "A digit with one place" },
  fit: { rank: 2, name: "The ways that fit" },
  area: { rank: 3, name: "A block's sums" },
};
/** The rank of a grid the techniques can't finish: never dealt. */
export const BEYOND = 9;

/**
 * A grid as the solver sees it: { shape, clues, op }. clues: one a run (null where it isn't known: a partner's, at a
 * table). The state: { val (the digit in each cell, 0 if none), cand (each cell's candidates) }.
 */
export function stateOf(view, values) {
  const { shape } = view, st = { val: Uint8Array.from(values), cand: new Uint16Array(shape.cells) };
  for (const c of shape.white) st.cand[c] = st.val[c] ? bit(st.val[c]) : ALL;
  for (let k = 0; k < shape.runs.length; k++) settle(view, st, k);
  return st;
}
/** A run's digits placed (a mask), and its empty cells. */
function partsOf(st, run) {
  let placed = 0;
  const empty = [];
  for (const c of run.cells) if (st.val[c]) placed |= bit(st.val[c]); else empty.push(c);
  return { placed, empty };
}
/** The combinations a run can still be, from its clue and the digits in it (every set of different digits, if its
 *  clue isn't known). */
export function waysOf(view, st, k) {
  const run = view.shape.runs[k], { placed, empty } = partsOf(st, run);
  return { ways: combosLeft(view.op, view.clues[k], empty.length, placed), placed, empty };
}
/** A run's pencil marks, as a person writes them: its empty cells kept to the digits its combinations allow. */
function settle(view, st, k) {
  const { ways, placed, empty } = waysOf(view, st, k);
  let allow = 0;
  for (const m of ways) allow |= m;
  for (const c of empty) st.cand[c] &= allow & ~placed;
}
/** Puts a step into the state: its digit placed (and the runs through it settled again), or its candidates struck. */
export function apply(view, st, step) {
  if (step.place) {
    const [c, d] = step.place;
    st.val[c] = d;
    st.cand[c] = bit(d);
    settle(view, st, view.shape.across[c]);
    settle(view, st, view.shape.down[c]);
  }
  for (const [c, m] of step.elim || []) st.cand[c] &= ~m;
}
export const solved = (view, st) => view.shape.white.every(c => st.val[c]);

// ---------- the techniques ----------
// (the first-rank ones look at every run for every step, so they count without making lists)
/** The last empty cell of a run: what its clue leaves. */
function lastCell(view, st) {
  const { runs } = view.shape;
  for (let k = 0; k < runs.length; k++) {
    if (view.clues[k] == null) continue;
    const cs = runs[k].cells;
    let placed = 0, open = -1, n = 0;
    for (let j = 0; j < cs.length; j++) { const v = st.val[cs[j]]; if (v) placed |= bit(v); else { open = cs[j]; n++; } }
    if (n !== 1) continue;
    const ways = combosLeft(view.op, view.clues[k], 1, placed);
    if (ways.length !== 1) continue;
    const d = digitOf(ways[0]);
    if (st.cand[open] & bit(d)) return { tech: "last", rank: 1, place: [open, d], runs: [k], cells: [...cs] };
  }
  return null;
}
/** A cell left one candidate by its two runs. */
function single(view, st) {
  const { white, across, down } = view.shape;
  for (const c of white) {
    if (st.val[c] || POP[st.cand[c]] !== 1) continue;
    return { tech: "single", rank: 1, place: [c, digitOf(st.cand[c])], runs: [across[c], down[c]], cells: [c] };
  }
  return null;
}
/** A digit every combination of a run holds, which only one of its cells can take. */
function hidden(view, st) {
  const { runs } = view.shape;
  for (let k = 0; k < runs.length; k++) {
    if (view.clues[k] == null) continue;
    const cs = runs[k].cells;
    let placed = 0, n = 0;
    for (let j = 0; j < cs.length; j++) { const v = st.val[cs[j]]; if (v) placed |= bit(v); else n++; }
    if (n < 2) continue;
    const ways = combosLeft(view.op, view.clues[k], n, placed);
    if (!ways.length) continue;
    let must = ALL;
    for (const m of ways) must &= m;
    for (let x = must; x; x &= x - 1) {
      const b = x & -x;
      let at = -1, seen = 0;
      for (let j = 0; j < cs.length && seen < 2; j++) if (!st.val[cs[j]] && st.cand[cs[j]] & b) { at = cs[j]; seen++; }
      if (seen === 1) return { tech: "hidden", rank: 1, place: [at, digitOf(b)], runs: [k], cells: [...cs], digit: digitOf(b) };
    }
  }
  return null;
}
/** The runs, shortest first, as a person looks at them for the ways that fit (kept on the shape). */
const shortFirst = shape => (shape.shortFirst ||= [...shape.runs.keys()].sort((a, b) => shape.runs[a].cells.length - shape.runs[b].cells.length || a - b));
/** A run's combinations narrowed to those its cells can hold: digits no way of filling it puts in a cell are struck. */
function fit(view, st) {
  const { runs } = view.shape;
  for (const k of shortFirst(view.shape)) {
    const { ways, empty } = waysOf(view, st, k);
    if (empty.length < 2) continue;
    const cands = Uint16Array.from(empty, c => st.cand[c]), f = fitRun(cands, ways);
    const elim = [];
    empty.forEach((c, j) => { const gone = cands[j] & ~f.allowed[j]; if (gone) elim.push([c, gone]); });
    if (elim.length) return { tech: "fit", rank: 2, elim, runs: [k], cells: [...runs[k].cells], fits: f.fits, ways: [...ways] };
  }
  return null;
}

/** Rectangles inside the grid, the smallest first, with the runs each holds whole (kept on the shape: one list a grid). */
function boxesOf(shape) {
  if (shape.boxes) return shape.boxes;
  const { rows, cols, runs, black } = shape;
  // each run's rows and columns, from its first cell to its last
  const top = runs.map(run => Math.floor(run.cells[0] / cols)), left = runs.map(run => run.cells[0] % cols);
  const bottom = runs.map(run => Math.floor(run.cells.at(-1) / cols)), right = runs.map(run => run.cells.at(-1) % cols);
  const out = [];
  for (let r1 = 1; r1 < rows; r1++) for (let r2 = r1; r2 < rows; r2++) for (let c1 = 1; c1 < cols; c1++) for (let c2 = c1; c2 < cols; c2++) {
    const cells = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!black[r * cols + c]) cells.push(r * cols + c);
    if (cells.length < 3) continue;
    const inside = [];
    for (let k = 0; k < runs.length; k++) if (top[k] >= r1 && bottom[k] <= r2 && left[k] >= c1 && right[k] <= c2) inside.push(k);
    if (inside.length > 1) out.push({ cells, inside });
  }
  out.sort((a, b) => a.cells.length - b.cells.length);
  shape.boxes = out;
  return out;
}
/**
 * A block's sums: inside a rectangle, the across runs it holds whole cover all its cells but those whose across run
 * leaves it, the down runs it holds whole all but those whose down run does. So the cells only the down runs cover (P)
 * come to the down clues less the across clues more than the cells only the across runs cover (N) do (a cell neither
 * covers is on both sides, and cancels). With one of those cells unknown, it's placed; with two, they're a pair of a
 * known sum or difference, and their candidates are kept to it. Products divide where sums subtract, so a product's
 * block is kept as a fraction, num over den.
 */
/** The blocks worth looking at for a grid as a player sees it: rectangles whose whole runs all have known clues and
 *  leave one to four cells only one side covers, each with those cells and its clues' totals (kept on the view: they
 *  don't change as the grid fills). */
const BLOCKS = new WeakMap();
function blocksOf(view) {
  let out = BLOCKS.get(view);
  if (out) return out;
  const { shape, clues, op } = view, { runs } = shape, prod = op === "product";
  out = [];
  for (const box of boxesOf(shape)) {
    if (box.inside.some(k => clues[k] == null)) continue;
    const inA = new Set(), inD = new Set();
    let sa = prod ? 1 : 0, sd = prod ? 1 : 0;
    for (const k of box.inside) {
      const across = runs[k].dir === "across";
      for (const c of runs[k].cells) (across ? inA : inD).add(c);
      if (across) sa = prod ? sa * clues[k] : sa + clues[k]; else sd = prod ? sd * clues[k] : sd + clues[k];
    }
    if (!inA.size || !inD.size) continue;
    const P = box.cells.filter(c => !inA.has(c) && inD.has(c)), N = box.cells.filter(c => inA.has(c) && !inD.has(c));
    if (P.length + N.length && P.length + N.length <= 4) out.push({ cells: box.cells, inside: box.inside, P, N, sa, sd });
  }
  BLOCKS.set(view, out);
  return out;
}
function area(view, st) {
  const { shape, op } = view, prod = op === "product";
  for (const { cells, inside, P, N, sa, sd } of blocksOf(view)) {
    const box = { cells, inside };
    // P over N: sums, P less N is delta; products, P over N is num / den
    let delta = sd - sa, num = sd, den = sa;
    const open = [];
    for (const c of P) { if (st.val[c]) { delta -= st.val[c]; den *= st.val[c]; } else open.push([c, 1]); }
    for (const c of N) { if (st.val[c]) { delta += st.val[c]; num *= st.val[c]; } else open.push([c, -1]); }
    if (!open.length || open.length > 2) continue;
    const step = { tech: "area", rank: 3, runs: box.inside, cells: box.cells, box: { P, N, sa, sd } };
    if (open.length === 1) {
      const [c, sign] = open[0];
      const d = prod ? (sign > 0 ? num / den : den / num) : sign * delta;
      if (Number.isInteger(d) && d >= 1 && d <= 9 && st.cand[c] & bit(d) && POP[st.cand[c]] > 1) return { ...step, place: [c, d], focus: [c] };
      continue;
    }
    // two cells: what each can be, given what the other can
    const [[a, sa1], [b, sb1]] = open, sees = shape.peers[a].includes(b);
    const ok2 = (x, y) => (!sees || x !== y) && (prod
      ? (sa1 > 0 ? x : 1) * (sb1 > 0 ? y : 1) * den === num * (sa1 < 0 ? x : 1) * (sb1 < 0 ? y : 1)
      : sa1 * x + sb1 * y === delta);
    let ka = 0, kb = 0;
    for (const x of digitsOf(st.cand[a])) for (const y of digitsOf(st.cand[b])) if (ok2(x, y)) { ka |= bit(x); kb |= bit(y); }
    const elim = [];
    if (st.cand[a] & ~ka) elim.push([a, st.cand[a] & ~ka]);
    if (st.cand[b] & ~kb) elim.push([b, st.cand[b] & ~kb]);
    if (elim.length && ka && kb) return { ...step, elim, focus: [a, b] };
  }
  return null;
}

/** Whether a state has come apart around a cell just placed: a cell of its two runs, or of a run crossing them, with
 *  no candidate left, or one of those runs that its clue can no longer be made in. */
function broken(view, st, at) {
  const { runs, across, down } = view.shape, near = new Set();
  for (const k of [across[at], down[at]]) {
    near.add(k);
    for (const c of runs[k].cells) { near.add(across[c]); near.add(down[c]); }
  }
  for (const k of near) {
    const { ways, empty } = waysOf(view, st, k);
    if (!ways.length) return true;
    if (!empty.length) continue;
    const cands = Uint16Array.from(empty, c => st.cand[c]);
    if (cands.some(m => !m) || !fitRun(cands, ways).fits.length) return true;
  }
  return false;
}
/**
 * A chain: a cell of two candidates where one of them, followed through the first-rank steps it forces (each run's
 * last cell, crossings, a digit with one place), leaves a run that can't be made: so it's the other. The cells in the
 * shortest runs are tried first, and a chain of more than CHAIN steps isn't one a person follows.
 */
const CHAIN = 12;
function chain(view, st) {
  const { white, across, down, runs } = view.shape;
  const twos = [...white].filter(c => !st.val[c] && POP[st.cand[c]] === 2)
    .sort((a, b) => runs[across[a]].cells.length + runs[down[a]].cells.length - runs[across[b]].cells.length - runs[down[b]].cells.length || a - b);
  for (const c of twos) for (const d of digitsOf(st.cand[c])) {
    const trial = { val: st.val.slice(), cand: st.cand.slice() }, path = [c];
    apply(view, trial, { place: [c, d] });
    let bad = broken(view, trial, c);
    for (let k = 0; k < CHAIN && !bad; k++) {
      const step = nextStep(view, trial, { upTo: 1 });
      if (!step) break;
      apply(view, trial, step);
      path.push(step.place[0]);
      bad = broken(view, trial, step.place[0]);
    }
    if (bad) return { tech: "chain", rank: 4, elim: [[c, bit(d)]], cells: path, focus: [c], digit: d, length: path.length };
  }
  return null;
}

/** The techniques in the order a person tries them, with their ranks. */
const ORDER = [[lastCell, 1], [single, 1], [hidden, 1], [fit, 2], [area, 3], [chain, 4]];
/** The easiest step there is, of rank upTo at most, or null. */
export function nextStep(view, st, { upTo = 4 } = {}) {
  for (const [find, rank] of ORDER) {
    if (rank > upTo) break;
    const step = find(view, st);
    if (step) return step;
  }
  return null;
}

/**
 * How hard a grid is: { rank (of the hardest technique it needed; BEYOND if it got stuck), solved, steps (each step
 * taken), uses ({ technique: times }), work (the steps beyond rank 1: each a place a person stops to think), state }.
 */
export function grade(view, values, { upTo = 4 } = {}) {
  const st = stateOf(view, values), steps = [], uses = {};
  let rank = 0, work = 0;
  for (let k = 0; k < 2000 && !solved(view, st); k++) {
    const step = nextStep(view, st, { upTo });
    if (!step) break;
    steps.push(step);
    uses[step.tech] = (uses[step.tech] || 0) + 1;
    rank = Math.max(rank, step.rank);
    if (step.rank > 1) work++;
    apply(view, st, step);
  }
  const done = solved(view, st);
  return { rank: done ? Math.max(1, rank) : BEYOND, solved: done, steps, uses, work, state: st };
}

// ---------- in words, as a hint says them ----------
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** A run in words: "across 16 in two" (a product: "across 24× in two"); a run whose clue isn't known: "this across run". */
export function runName(view, k) {
  const run = view.shape.runs[k], clue = view.clues[k];
  return clue == null ? `this ${run.dir} run` : `${run.dir} ${clue}${view.op === "product" ? "×" : ""} in ${COUNT[run.cells.length]}`;
}
/** A combination in words: its digits, "6 8 9". */
export const comboText = m => digitsOf(m).join(" ");
const listOf = xs => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
const cap = s => s[0].toUpperCase() + s.slice(1);

/** What a step says, for a hint: why it holds, in a sentence or two. st: the state it was found in. */
export function say(view, st, step) {
  const { shape } = view;
  if (step.tech === "last") {
    const k = step.runs[0], have = [...shape.runs[k].cells].filter(c => st.val[c]).map(c => st.val[c]);
    return `${cap(runName(view, k))} has ${listOf(have.map(String))} in it: the last cell is ${step.place[1]}.`;
  }
  if (step.tech === "single") {
    const [, d] = step.place, [a, b] = step.runs;
    const allows = k => { const { ways, placed } = waysOf(view, st, k); let m = 0; for (const w of ways) m |= w; return m & ~placed; };
    const ma = allows(a), mb = allows(b);
    if (view.clues[a] != null && view.clues[b] != null && POP[ma & mb] === 1) return `${cap(runName(view, a))} allows ${comboText(ma)}; ${runName(view, b)} allows ${comboText(mb)}. Only ${d} is in both, so it goes where they cross.`;
    return `Only ${d} is left for this cell: ${runName(view, a)} and ${runName(view, b)} rule out the rest, with what's been worked out around them.`;
  }
  if (step.tech === "hidden") {
    const k = step.runs[0], { ways } = waysOf(view, st, k);
    const how = ways.length === 1 ? `can only be ${comboText(ways[0])}` : `has a ${step.digit} whichever way it ${view.op === "product" ? "multiplies out" : "adds up"}${ways.length <= 4 ? ` (${[...ways].map(comboText).join(", ")})` : ""}`;
    return `${cap(runName(view, k))} ${how}, and only one of its cells can take the ${step.digit}.`;
  }
  if (step.tech === "fit") {
    const k = step.runs[0], all = step.ways.length, fits = step.fits.map(comboText);
    const struck = step.elim.length === 1 ? `the lit cell can't be ${digitsOf(step.elim[0][1]).join(" or ")}` : "the lit cells lose some candidates";
    if (view.clues[k] == null) return `${cap(runName(view, k))} holds different digits (its clue is someone else's), and what its cells can hold leaves only so many ways to fill it: ${struck}.`;
    const which = fits.length > 5 ? `can still be made ${fits.length} ways, but none of them fits every cell as it stands`
      : all > fits.length ? `can only be ${listOf(fits)} now: the other ${all - fits.length === 1 ? "way needs" : "ways need"} a digit its cells can't hold`
        : `can be ${listOf(fits)}, but not every digit fits every cell`;
    return `${cap(runName(view, k))} ${which}. So ${struck}.`;
  }
  if (step.tech === "chain") {
    return `If this cell were ${step.digit}, follow it: the cells it settles in turn (lit) leave a run that can't ${view.op === "product" ? "multiply out" : "add up"} to its clue. So it isn't ${step.digit}.`;
  }
  if (step.tech === "area") {
    const { P, N, sa, sd } = step.box, prod = view.op === "product";
    const outs = P.length + N.length;
    const base = prod
      ? `In the lit block, the across runs it holds whole multiply to ${sa} and the down runs to ${sd}`
      : `In the lit block, the across runs it holds whole add up to ${sa} and the down runs to ${sd}`;
    if (step.place) return `${base}; the difference is the ${outs === 1 ? "one cell" : "cells"} only one of them covers: ${step.place[1]}.`;
    return `${base}; the two cells only one of them covers make up the difference, which rules out some of their candidates.`;
  }
  return "";
}
