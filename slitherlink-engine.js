// Portolan's rules, puzzles and reasoning. One loop is drawn along the edges of a grid of dots; each number says how
// many of its cell's four sides the loop uses; the loop never crosses or touches itself. Every puzzle made here has
// exactly one answer and is graded by the hardest step a person needs to reach it. No page in it: slitherlink-worker.js
// makes puzzles off the page, slitherlink.js plays them, tests/slitherlink.mjs checks it all in Node.
//
// Edges are numbered row by row: the horizontal ones first (row 0 of dots, its C edges, then row 1…), then the vertical
// ones (cell row 0, its C+1 edges, …). A state is one number an edge: 0 unknown, 1 line, 2 crossed (known not to be
// part of the loop). The marks a player keeps are the same as characters, "0" "1" "2", one string a board.
//
// Shaded puzzles (November 2026) add a second kind of clue beside the numbers: a cell marked as inside the loop (clue
// code 5, "i" in a puzzle's grid) or outside it (6, "o"). Every cell is on one side of a loop, and a line is exactly
// where the sides change, so the shading and the edges known so far settle other edges (sides(), below). It is a rule of
// the shaded puzzles only: a plain puzzle never runs it, so plain puzzles are the puzzles they always were.

import { NONE, LINE, CROSS, TRIAL_ROUNDS, geometry, vertexRule, note, loopSolver, rngOf, shuffle, randomLoop, outlineMarks } from "./loop-engine.js";
import * as T from "./slitherlink-twist.js";
export { NONE, LINE, CROSS, geometry };
// Ranges, tunnels and the hex board are slitherlink-twist.js's (5 November 2026); this file hands a puzzle that has any of them over
// to it, and keeps the plain square game (and the shaded one) exactly as it was, so an old seed makes the puzzle it always did.
export { HEX_SIZES, TWIST_NAMES, flagsOf, twistOn, labelOf, boardOf } from "./slitherlink-twist.js";
export const SHAPES = { square: "Square", hex: "Hex" };
const twistSpec = spec => spec?.shape === "hex" || !!spec?.tun;
const withRanges = grid => /[a-e]|[p-t]/.test(grid);

export const SIZES = [5, 7, 10];
export const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const ORDER = ["easy", "medium", "hard"];
export const DAILY = { size: 7, level: "medium" };
/** The clue codes after the numbers 0 to 4: a cell known to be inside the loop, and one known to be outside it. */
export const INSIDE = 5, OUTSIDE = 6;
const hasShade = clue => { for (let k = 0; k < clue.length; k++) if (clue[k] > 4) return true; return false; };
const TRIES = 8;                   // puzzles made towards a level before the nearest is dealt

// ---------- the board ----------
// (the board itself, its edges and corners, is loop-engine.js's)
/** A puzzle from its clues (one character a cell: a digit, "i" inside, "o" outside, or "-" for none) and, if known, its answer (marks). */
export function puzzleOf(size, grid, sol = null, spec = null) {
  if (twistSpec(spec) || withRanges(grid)) return T.puzzleOf(size, grid, sol, spec || {});
  const g = geometry(size, size);
  return { size, g, view: T.boardOf("square", size), shape: "square", locked: null, grid, shaded: /[io]/.test(grid), clue: Int8Array.from(grid, ch => (ch === "-" ? -1 : ch === "i" ? INSIDE : ch === "o" ? OUTSIDE : +ch)), sol: sol && Uint8Array.from(sol, ch => (ch === LINE ? 1 : 0)), solMarks: sol };
}

// ---------- which side of the loop a cell is on ----------
// A set of nodes (the cells and the outside of the board, the last), each with its parent and its side relative to it
// (0 the same, 1 the opposite), kept in module scratch: this runs inside every trial of every shaded puzzle, so it
// allocates nothing. Not re-entrant, and nothing here calls anything that is.
const SIDE = { par: new Int16Array(0), rel: new Uint8Array(0), size: new Int16Array(0), p: 0 };
/** The root of x's set; SIDE.p is left as x's side relative to that root. The path is shortened as it is walked. */
function rootOf(x) {
  const { par, rel } = SIDE;
  let r = x, p = 0;
  while (par[r] !== r) { p ^= rel[r]; r = par[r]; }
  let y = x, py = p;
  while (y !== r && par[y] !== r) { const next = par[y], was = rel[y]; par[y] = r; rel[y] = py; py ^= was; y = next; }
  SIDE.p = p;
  return r;
}
/** Says that a and b are on the same side of the loop (d = 0) or opposite sides (1). False when what is known says otherwise. */
function join(a, b, d) {
  const { par, rel, size } = SIDE;
  let ra = rootOf(a); const pa = SIDE.p;
  let rb = rootOf(b); const pb = SIDE.p;
  if (ra === rb) return (pa ^ pb) === d;
  if (size[ra] > size[rb]) { const t = ra; ra = rb; rb = t; }
  par[ra] = rb; rel[ra] = pa ^ pb ^ d; size[rb] += size[ra];
  return true;
}
/**
 * What the shading and the edges known so far say of the sides: the cells and the outside of the board as nodes, each
 * joined to another with "same side" (a crossed edge between them) or "opposite sides" (a line), the shaded cells to
 * the outside as opposite and the dotted as the same. Returns the cells where two of those say different things (an
 * empty list when they agree); then rootOf says which cells are known to be on the same side as which. Only shaded puzzles use it.
 */
function sidesOf(g, clue, st) {
  const { cells, E, ecells } = g;
  if (SIDE.par.length < cells + 1) { SIDE.par = new Int16Array(cells + 1); SIDE.rel = new Uint8Array(cells + 1); SIDE.size = new Int16Array(cells + 1); }
  for (let i = 0; i <= cells; i++) { SIDE.par[i] = i; SIDE.rel[i] = 0; SIDE.size[i] = 1; }
  const clash = [];
  for (let k = 0; k < cells; k++) if (clue[k] > 4 && !join(k, cells, clue[k] === INSIDE ? 1 : 0)) clash.push(k);
  for (let e = 0; e < E; e++) {
    if (!st[e]) continue;
    const [a, b = cells] = ecells[e];
    if (!join(a, b, st[e] === 1 ? 1 : 0)) { clash.push(a); if (b !== cells) clash.push(b); }
  }
  return clash;
}
/** The cells the loop leaves outside, when the lines (and `e`, one more) are one closed loop: those reached from beyond the board without crossing a line. */
function outsideCells(g, st, e) {
  const { cells, E, ecells } = g, par = new Int16Array(cells + 1);
  for (let i = 0; i <= cells; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let f = 0; f < E; f++) {
    if (st[f] === 1 || f === e) continue;
    const [a, b = cells] = ecells[f];
    par[find(a)] = find(b);
  }
  const out = find(cells);
  return Array.from({ length: cells }, (_, k) => find(k) === out);
}

// ---------- the rules, as a solver follows them ----------
// `rec`, when given, makes a rule stop at the first thing it settles and say what it was (for a hint): rec.set (the
// edges and what they become), rec.tech and where (rec.cell, rec.vertex or rec.edge).

/** One sweep of the two local rules. Returns -1 on a contradiction, 1 if it settled something, else 0. */
function sweep(g, clue, st, rec) {
  const { ce, cells } = g;
  let changed = 0;
  // a cell: its number is how many of its four sides are lines
  for (let k = 0; k < cells; k++) {
    const n = clue[k];
    if (n < 0 || n > 4) continue;
    let l = 0, u = 0;
    for (let j = 0; j < 4; j++) { const s = st[ce[k * 4 + j]]; if (s === 1) l++; else if (s === 0) u++; }
    if (l > n || l + u < n) return -1;
    if (u && (l === n || l + u === n)) {
      const v = l === n ? 2 : 1;
      for (let j = 0; j < 4; j++) { const e = ce[k * 4 + j]; if (st[e] === 0) { st[e] = v; if (rec) note(rec, e, v); } }
      if (rec) { rec.tech = v === 2 ? "full" : "short"; rec.cell = k; return 1; }
      changed = 1;
    }
  }
  // a corner: the loop passes through it (two lines) or not at all (none)
  const v = vertexRule(g, st, rec);
  if (v < 0) return -1;
  if (!hasShade(clue)) return changed || v ? 1 : 0;
  if (v && rec) return 1;
  // the sides: two cells the shading and the lines put on the same side of the loop have no line between them, on
  // opposite sides they have one
  if (sidesOf(g, clue, st).length) return -1;
  for (let e = 0; e < g.E; e++) {
    if (st[e]) continue;
    const [a, b = g.cells] = g.ecells[e];
    const ra = rootOf(a), pa = SIDE.p, rb = rootOf(b), pb = SIDE.p;
    if (ra !== rb) continue;
    const w = (pa ^ pb) ? 1 : 2;
    st[e] = w; changed = 1;
    if (rec) { note(rec, e, w); rec.tech = "sides"; rec.cell = a; rec.cell2 = b === g.cells ? null : b; rec.edge = e; return 1; }
  }
  return changed || v ? 1 : 0;
}

/** Whether the lines drawn so far, with edge `e` added, satisfy every number exactly. */
function satisfiedWith(g, clue, st, e) {
  for (let k = 0; k < g.cells; k++) {
    if (clue[k] < 0 || clue[k] > 4) continue;
    let l = 0;
    for (let j = 0; j < 4; j++) { const f = g.ce[k * 4 + j]; if (st[f] === 1 || f === e) l++; }
    if (l !== clue[k]) return false;
  }
  if (hasShade(clue)) {
    const out = outsideCells(g, st, e);
    for (let k = 0; k < g.cells; k++) if ((clue[k] === INSIDE && out[k]) || (clue[k] === OUTSIDE && !out[k])) return false;
  }
  return true;
}
const { loopRule, propagate, trialStep, solveAs, gradeOf, count, firstAnswer } = loopSolver({ sweep, closes: satisfiedWith });
export { solveAs, gradeOf, count };

// ---------- the answer of a puzzle ----------
/** The answer of a puzzle that has one, as marks. */
export function answerOf(size, grid, spec = null) {
  if (twistSpec(spec) || withRanges(grid)) return T.answerOf(size, grid, spec || {});
  const P = puzzleOf(size, grid), st = firstAnswer(P.g, P.clue);
  return st ? Array.from(st, x => String(x)).join("") : null;
}

// ---------- making a puzzle ----------
/** The loop's edges (marks, "1" on the loop and "2" off it) and the number in every cell. */
function loopMarks(g, loop) {
  const marks = outlineMarks(g, loop);
  const clue = new Int8Array(g.cells);
  for (let k = 0; k < g.cells; k++) for (let j = 0; j < 4; j++) if (marks[g.ce[k * 4 + j]] === LINE) clue[k]++;
  return { marks: marks.join(""), clue };
}
/**
 * Takes clues away, in random order, for as long as a solver of the level can still finish the puzzle. A shaded puzzle
 * keeps at least `floor` of its shaded and dotted cells, or the shading would pare away and leave a plain puzzle.
 */
function pare(g, clue, level, rng, floor = 0) {
  let shades = floor ? clue.filter(n => n > 4).length : 0;
  for (const k of shuffle(Array.from({ length: g.cells }, (_, i) => i), rng)) {
    const was = clue[k];
    if (was > 4 && shades <= floor) continue;
    clue[k] = -1;
    if (!solveAs(g, clue, level).ok) clue[k] = was;
    else if (was > 4) shades--;
  }
}
/** The share of cells whose number is first swapped for the side of the loop it is on, before the repair and the paring. */
const SHADED_SHARE = 0.4;
/**
 * Swaps the numbers of a random share of the cells for shading, inside the loop or outside it. A shading says less of
 * a cell than its number does, so the puzzle may no longer be one the level can solve; numbers are put back, on the
 * shaded cells in turn, until it is (the puzzle with every number always is).
 */
function shadeCells(g, clue, { ins, at }, want, rng) {
  const numbers = Int8Array.from(clue), chosen = shuffle(Array.from({ length: g.cells }, (_, i) => i), rng).slice(0, Math.round(g.cells * SHADED_SHARE));
  for (const k of chosen) clue[k] = ins[at(Math.floor(k / g.C), k % g.C)] ? INSIDE : OUTSIDE;
  for (const k of chosen) {
    if (solveAs(g, clue, want).ok) break;
    clue[k] = numbers[k];
  }
}
const gridOf = clue => Array.from(clue, n => (n < 0 ? "-" : n === INSIDE ? "i" : n === OUTSIDE ? "o" : String(n))).join("");
/**
 * A puzzle of a size and level, the same for the same seed: { size, grid, sol, level } with level what it came to (the
 * nearest when the asked-for one wouldn't come in the tries allowed). `shade` makes a shaded one (and says `shade: true`).
 */
export function generate(seed, size, level, shade = false, spec = null) {
  if (!shade && (spec?.shape === "hex" || T.twistOn(spec?.twist) !== "none")) return T.generate(seed, spec.shape === "hex" ? "hex" : "square", size, level, spec.twist);
  const want = Math.max(0, ORDER.indexOf(level)), g = geometry(size, size), rng = rngOf(seed);
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const loop = randomLoop(size, size, rng), { marks, clue } = loopMarks(g, loop);
    if (shade) shadeCells(g, clue, loop, want, rng);
    pare(g, clue, want, rng, shade ? Math.round(g.cells * 0.12) : 0);
    const got = gradeOf(g, clue);
    if (got < 0) continue;
    const found = { size, grid: gridOf(clue), sol: marks, level: ORDER[got], ...(shade ? { shade: true } : {}) };
    if (got === want) return found;
    if (!best || Math.abs(got - want) < Math.abs(ORDER.indexOf(best.level) - want)) best = found;
  }
  return best;
}
/** The level a size can be had at that is nearest the one asked for (every level is offered for every size here). */
export const levelOn = (size, level) => (LEVELS[level] ? level : "medium");

// ---------- marks ----------
/** The marks a puzzle starts with: nothing, except that a tunnel's four edges are lines from the start (they can't be changed). */
export const startMarks = P => (P.twisted ? T.startMarks(P) : NONE.repeat(P.g.E));
/** Whether a saved puzzle's size and grid fit a board this version knows. */
export const fitsBoard = s => (s.board === "hex" ? T.fits("hex", s.size, s.grid) : SIZES.includes(s.size) && typeof s.grid === "string" && s.grid.length === s.size * s.size);
export const nextMark = m => (m === NONE ? LINE : m === LINE ? CROSS : NONE);
export const withMark = (marks, i, m) => marks.slice(0, i) + m + marks.slice(i + 1);
const stateOf = marks => Int8Array.from(marks, ch => +ch);

/** Whether the lines drawn are the answer (crossed edges are the player's notes and don't count). */
export function solvedBy(P, marks) {
  for (let e = 0; e < P.g.E; e++) if ((marks[e] === LINE) !== (P.sol[e] === 1)) return false;
  return true;
}
/**
 * What the marks break, from the rules alone (never the answer): the numbers with too many lines, the corners with
 * three lines or a dead end (one line, every other side crossed), a closed loop that isn't the answer, the numbers
 * already met, and in a shaded puzzle the cells where the shading and the lines say two things of one cell's side.
 */
export function breaks(P, marks) {
  if (P.twisted) return T.breaks(P, marks);
  const { g, clue } = P, st = stateOf(marks), over = [], met = [], bad = [], loop = [];
  for (let k = 0; k < g.cells; k++) {
    if (clue[k] < 0 || clue[k] > 4) continue;
    let l = 0;
    for (let j = 0; j < 4; j++) if (st[g.ce[k * 4 + j]] === 1) l++;
    if (l > clue[k]) over.push(k); else if (l === clue[k]) met.push(k);
  }
  for (let x = 0; x < g.V; x++) {
    let l = 0, u = 0;
    for (const e of g.vedges[x]) { if (st[e] === 1) l++; else if (!st[e]) u++; }
    if (l > 2 || (l === 1 && !u)) bad.push(x);
  }
  const par = new Int16Array(g.V).map((_, i) => i);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  let closing = -1;
  for (let e = 0; e < g.E; e++) {
    if (st[e] !== 1) continue;
    const a = find(g.ea[e]), b = find(g.eb[e]);
    if (a === b) closing = e; else par[a] = b;
  }
  if (closing >= 0 && !solvedBy(P, marks)) {
    const root = find(g.ea[closing]);
    for (let e = 0; e < g.E; e++) if (st[e] === 1 && find(g.ea[e]) === root) loop.push(e);
  }
  const shade = P.shaded ? [...new Set(sidesOf(g, clue, st))] : [];
  return { over, met, bad, loop, shade };
}

// ---------- hints ----------
/**
 * The next thing to tell a player: a mark that is wrong, put right ({ wrong, should }); else the next step a person
 * would take, simplest first ({ step: { set, tech, … } }); else one edge of the answer ({ reveal, should }).
 */
export function hintFor(P, marks) {
  if (P.twisted) return T.hintFor(P, marks);
  const { g, clue } = P;
  for (let e = 0; e < g.E; e++) {
    const should = P.sol[e] ? LINE : CROSS;
    if (marks[e] !== NONE && marks[e] !== should) return { wrong: e, should };
  }
  const st = stateOf(marks), rec = {};
  if (propagate(g, clue, st.slice()) >= 0) {
    if (sweep(g, clue, st.slice(), rec) > 0 || loopRule(g, clue, st.slice(), rec) > 0) return { step: rec };
    const r2 = {};
    if (trialStep(g, clue, st, TRIAL_ROUNDS, r2) || trialStep(g, clue, st, Infinity, r2)) return { step: r2 };
  }
  const e = st.indexOf(0);
  return e < 0 ? null : { reveal: e, should: P.sol[e] ? LINE : CROSS };
}
