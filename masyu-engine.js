// Pearl's rules, puzzles and reasoning. One loop is drawn through the middles of the cells of a grid, from cell to
// neighbouring cell; it never crosses, branches or touches itself. A white circle is passed straight through, and the
// loop turns in the cell before or the cell after it (or both). A black circle is a turn, and the loop goes straight on
// for at least one more cell both ways. Every circle is on the loop; the loop needn't visit every cell. Every puzzle made
// here has exactly one answer and is graded by the hardest step a person needs to reach it. No page in it:
// masyu-worker.js makes puzzles off the page, masyu.js plays them, tests/masyu.mjs checks it all in Node.
//
// The loop is Circuit's, one size down: the cells of an N×N board are the corners of a Circuit board of
// (N-1)×(N-1) cells, so the board, its edges, the corner rule and the loop rule are loop-engine.js's, and this file brings
// the circles. A state is one number an edge (0 unknown, 1 line, 2 crossed), the marks a player keeps are the same as
// characters, one string a board; the first N·(N-1) edges are the horizontal ones, row by row, then the vertical ones.

import { NONE, LINE, CROSS, TRIAL_ROUNDS, geometry, vertexRule, note, loopSolver, rngOf, shuffle, outlineMarks } from "./loop-engine.js";
export { NONE, LINE, CROSS };

export const SIZES = [6, 8, 10];
export const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const ORDER = ["easy", "medium", "hard"];
export const DAILY = { size: 8, level: "medium" };
const TRIES = 10;                  // puzzles made towards a level before the nearest is dealt

export const WHITE = 1, BLACK = 2;
const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3, OPP = [DOWN, UP, RIGHT, LEFT];
const AXES = [[UP, DOWN], [LEFT, RIGHT]];

// ---------- the board ----------
const BOARDS = new Map();
/** The board of N×N cells: the loop's graph (corners are cells), and for each cell its neighbour and its edge in each
 *  direction (up, down, left, right), -1 where the board ends. */
export function board(N) {
  if (BOARDS.has(N)) return BOARDS.get(N);
  const g = geometry(N - 1, N - 1), nb = new Int16Array(N * N * 4).fill(-1), eg = new Int16Array(N * N * 4).fill(-1);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = r * N + c;
    if (r > 0) { nb[x * 4 + UP] = x - N; eg[x * 4 + UP] = g.H + (r - 1) * N + c; }
    if (r < N - 1) { nb[x * 4 + DOWN] = x + N; eg[x * 4 + DOWN] = g.H + r * N + c; }
    if (c > 0) { nb[x * 4 + LEFT] = x - 1; eg[x * 4 + LEFT] = r * (N - 1) + c - 1; }
    if (c < N - 1) { nb[x * 4 + RIGHT] = x + 1; eg[x * 4 + RIGHT] = r * (N - 1) + c; }
  }
  const b = { N, g, nb, eg };
  BOARDS.set(N, b);
  return b;
}
/** A puzzle from its circles (one character a cell: "w" white, "b" black, "-" none) and, if known, its answer (marks). */
export function puzzleOf(size, grid, sol = null) {
  const { g, nb, eg } = board(size), circ = Int8Array.from(grid, ch => (ch === "w" ? WHITE : ch === "b" ? BLACK : 0));
  const circles = Int16Array.from(Array.from(circ, (c, x) => (c ? x : -1)).filter(x => x >= 0));
  return { size, N: size, g, nb, eg, grid, circ, circles, sol: sol && Uint8Array.from(sol, ch => (ch === LINE ? 1 : 0)), solMarks: sol };
}

// ---------- the rules, as a solver follows them ----------
/** The state of the edge a cell has in a direction: crossed where the board ends. */
const side = (P, st, x, d) => { const e = P.eg[x * 4 + d]; return e < 0 ? 2 : st[e]; };
/** The state of the edge beyond the neighbour in a direction (the next step of a straight run), crossed where it ends. */
const beyond = (P, st, x, d) => { const n = P.nb[x * 4 + d]; return n < 0 ? 2 : side(P, st, n, d); };

/** The axes a white circle may still lie along: both its edges on it not crossed, none on the other axis a line, and
 *  not both neighbours going straight on (one of them has to turn). */
function whiteAxes(P, st, x) {
  const out = [];
  AXES.forEach(([a, b], i) => {
    const [c, d] = AXES[1 - i];
    if (side(P, st, x, a) === 2 || side(P, st, x, b) === 2 || side(P, st, x, c) === 1 || side(P, st, x, d) === 1) return;
    if (beyond(P, st, x, a) === 1 && beyond(P, st, x, b) === 1) return;
    out.push(i);
  });
  return out;
}
/** Whether a black circle may still turn off in direction d: its edge and the next one on, in line, not crossed, the next
 *  cell not a circle that can't be passed straight (a black one), and the way back not already a line. */
function blackSide(P, st, x, d) {
  const e1 = P.eg[x * 4 + d], n1 = P.nb[x * 4 + d];
  if (e1 < 0 || st[e1] === 2 || P.circ[n1] === BLACK) return false;
  const e2 = P.eg[n1 * 4 + d];
  if (e2 < 0 || st[e2] === 2) return false;
  const back = P.eg[x * 4 + OPP[d]];
  return back < 0 || st[back] !== 1;
}

/** One sweep of the circle rules and the corner rule. Returns -1 on a contradiction, 1 if it settled something, else 0.
 *  With `rec`, it stops at the first thing it settles and says what it was (rec.set, rec.tech, rec.cell or rec.vertex). */
function sweep(g, P, st, rec) {
  let changed = 0, broke = false;
  /** Sets an edge (a crossed edge at the board's end is already so); a settled edge that disagrees is a contradiction. */
  const put = (e, v) => {
    if (e < 0) { if (v === 1) broke = true; return; }
    if (st[e] === v) return;
    if (st[e]) { broke = true; return; }
    st[e] = v; changed = 1;
    if (rec) note(rec, e, v);
  };
  const done = (x, tech) => { if (rec && rec.set?.length) { rec.tech = tech; rec.cell = x; return true; } return false; };
  for (const x of P.circles) {
    const at = d => P.eg[x * 4 + d];
    if (P.circ[x] === WHITE) {
      const axes = whiteAxes(P, st, x);
      if (!axes.length) return -1;
      if (axes.length === 1) {
        const [a, b] = AXES[axes[0]], [c, d] = AXES[1 - axes[0]];
        put(at(a), 1); put(at(b), 1); put(at(c), 2); put(at(d), 2);
        if (broke) return -1;
        if (done(x, "white")) return 1;
        // on its axis, with a neighbour already going straight on, the other must turn
        const ba = beyond(P, st, x, a), bb = beyond(P, st, x, b);
        if (ba === 1) put(P.eg[P.nb[x * 4 + b] * 4 + b], 2);
        if (bb === 1) put(P.eg[P.nb[x * 4 + a] * 4 + a], 2);   // (both neighbours exist: the axis is feasible)
        if (broke) return -1;
        if (done(x, "turn")) return 1;
      }
    } else {
      for (const [a, b] of AXES) {
        const fa = blackSide(P, st, x, a), fb = blackSide(P, st, x, b);
        if (!fa && !fb) return -1;
        if (fa === fb) continue;
        const d = fa ? a : b, o = OPP[d], n1 = P.nb[x * 4 + d];
        put(at(d), 1); put(P.eg[n1 * 4 + d], 1); put(at(o), 2);
        if (broke) return -1;
        if (done(x, "black")) return 1;
      }
    }
  }
  const v = vertexRule(g, st, rec);
  if (v < 0) return -1;
  return changed || v ? 1 : 0;
}

/** Whether circle x is met by the lines drawn (and edge `e`, if given): two lines through it, white straight with a
 *  neighbour turning, black turning with a straight run each way. */
function met(P, st, x, e = -1) {
  const L = ed => ed >= 0 && (st[ed] === 1 || ed === e), has = d => L(P.eg[x * 4 + d]);
  const far = d => { const n = P.nb[x * 4 + d]; return n >= 0 && L(P.eg[n * 4 + d]); };
  if (P.circ[x] === WHITE) {
    for (let i = 0; i < 2; i++) {
      const [a, b] = AXES[i], [c, d] = AXES[1 - i];
      if (has(a) && has(b)) return !has(c) && !has(d) && !(far(a) && far(b));
    }
    return false;
  }
  const v = has(UP) ? UP : has(DOWN) ? DOWN : -1, h = has(LEFT) ? LEFT : has(RIGHT) ? RIGHT : -1;
  if (v < 0 || h < 0 || (has(UP) && has(DOWN)) || (has(LEFT) && has(RIGHT))) return false;
  return far(v) && far(h);
}
/** Whether the lines drawn so far, with edge `e` added, meet every circle. */
function closes(g, P, st, e) {
  for (const x of P.circles) if (!met(P, st, x, e)) return false;
  return true;
}
const { loopRule, propagate, trialStep, solveAs, gradeOf, count, firstAnswer } = loopSolver({ sweep, closes });
export { solveAs, gradeOf, count };

// ---------- the answer of a puzzle ----------
/** The answer of a puzzle that has one, as marks. */
export function answerOf(size, grid) {
  const P = puzzleOf(size, grid), st = firstAnswer(P.g, P);
  return st ? Array.from(st, x => String(x)).join("") : null;
}

// ---------- making a puzzle ----------
/**
 * A closed loop for the N×N board (N even), as the cells inside it on the (N-1)×(N-1) board the loop outlines: a random
 * tree of 2×2 blocks, each block a cell of the inside and each branch a cell joining two, so the outline is a single
 * loop that never meets itself and, unless leaves were cut off, passes through every cell of the Pearl board. A blob of
 * cells grown at random (Circuit's loops) has outlines of short steps, which leave a Pearl puzzle almost no circles to
 * put; this one has long runs and corners with arms. `keep` is the share of blocks left after cutting leaves.
 */
function treeLoop(N, rng, keep) {
  const m = N / 2, R = N - 1, W = R + 2, at = (r, c) => (r + 1) * W + c + 1, ins = new Uint8Array((R + 2) * W);
  const edges = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { if (j + 1 < m) edges.push([i, j, i, j + 1]); if (i + 1 < m) edges.push([i, j, i + 1, j]); }
  const par = Array.from({ length: m * m }, (_, k) => k), find = k => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
  const deg = new Int8Array(m * m), tree = [];
  for (const [i, j, p, q] of shuffle(edges, rng)) {
    const a = find(i * m + j), b = find(p * m + q);
    if (a === b) continue;
    par[a] = b; tree.push([i, j, p, q]); deg[i * m + j]++; deg[p * m + q]++;
  }
  const gone = new Uint8Array(m * m);
  let left = m * m;
  for (const k of shuffle(Array.from({ length: m * m }, (_, k) => k), rng)) {     // leaves cut off, one by one
    if (left <= Math.max(2, Math.round(m * m * keep))) break;
    if (deg[k] !== 1 || gone[k]) continue;
    gone[k] = 1; left--;
    for (const [i, j, p, q] of tree) {
      if (i * m + j === k || p * m + q === k) { deg[i * m + j]--; deg[p * m + q]--; }
    }
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (!gone[i * m + j]) ins[at(2 * i, 2 * j)] = 1;
  for (const [i, j, p, q] of tree) if (!gone[i * m + j] && !gone[p * m + q]) ins[at(i + p, j + q)] = 1;   // the cell between the two blocks
  return { ins, at };
}
/** Which circles the loop in `marks` can have (the ones its path meets): { white: cells, black: cells }. */
export function circlesOf(P, marks) {
  const line = (x, d) => { const e = P.eg[x * 4 + d]; return e >= 0 && marks[e] === LINE; };
  const dirs = x => [UP, DOWN, LEFT, RIGHT].filter(d => line(x, d));
  const straight = x => { const ds = dirs(x); return ds.length === 2 && ds[0] + 1 === ds[1] && ds[0] % 2 === 0; };   // up and down, or left and right
  const turns = x => dirs(x).length === 2 && !straight(x);
  const white = [], black = [];
  for (let x = 0; x < P.N * P.N; x++) {
    const ds = dirs(x);
    if (ds.length !== 2) continue;
    if (straight(x)) { if (ds.some(d => turns(P.nb[x * 4 + d]))) white.push(x); }
    else if (ds.every(d => straight(P.nb[x * 4 + d]))) black.push(x);
  }
  return { white, black };
}
/** Takes circles away, in random order, for as long as a solver of the level can still finish the puzzle. */
function pare(P, level, rng) {
  // white pearls are tried first, so the black ones (each says more) stay and the puzzle isn't all white
  for (const x of shuffle([...P.circles], rng).sort((u, v) => P.circ[u] - P.circ[v])) {
    const was = P.circ[x];
    P.circ[x] = 0;
    P.circles = P.circles.filter(y => y !== x);
    if (!solveAs(P.g, P, level).ok) { P.circ[x] = was; P.circles = Int16Array.from([...P.circles, x].sort((u, v) => u - v)); }
  }
}
const gridOf = P => Array.from(P.circ, c => (c === WHITE ? "w" : c === BLACK ? "b" : "-")).join("");
/**
 * A puzzle of a size and level, the same for the same seed: { size, grid, sol, level } with level what it came to (the
 * nearest when the asked-for one wouldn't come in the tries allowed).
 */
export function generate(seed, size, level) {
  const want = Math.max(0, ORDER.indexOf(level)), rng = rngOf(seed), g = board(size).g;
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const marks = outlineMarks(g, treeLoop(size, rng, 0.55 + rng() * 0.45)), sol = marks.join("");
    const P = puzzleOf(size, "-".repeat(size * size), sol), { white, black } = circlesOf(P, marks);
    for (const x of white) P.circ[x] = WHITE;
    for (const x of black) P.circ[x] = BLACK;
    P.circles = Int16Array.from([...white, ...black].sort((u, v) => u - v));
    const from = gradeOf(P.g, P);
    if (from < 0) continue;                                     // even every circle doesn't settle it by reasoning
    pare(P, Math.max(want, from), rng);
    const got = gradeOf(P.g, P);
    if (got < 0) continue;
    const found = { size, grid: gridOf(P), sol, level: ORDER[got] };
    if (got === want) return found;
    if (!best || Math.abs(got - want) < Math.abs(ORDER.indexOf(best.level) - want)) best = found;
  }
  return best;
}
/** The level a size can be had at that is nearest the one asked for (every level is offered for every size here). */
export const levelOn = (size, level) => (LEVELS[level] ? level : "medium");

// ---------- marks ----------
export const nextMark = m => (m === NONE ? LINE : m === LINE ? CROSS : NONE);
export const withMark = (marks, i, m) => marks.slice(0, i) + m + marks.slice(i + 1);
const stateOf = marks => Int8Array.from(marks, ch => +ch);

/** Whether the lines drawn are the answer (crossed edges are the player's notes and don't count). */
export function solvedBy(P, marks) {
  for (let e = 0; e < P.g.E; e++) if ((marks[e] === LINE) !== (P.sol[e] === 1)) return false;
  return true;
}
/**
 * What the marks break, from the rules alone (never the answer): the cells with three lines or a dead end (one line,
 * every other side crossed), the circles no way is left to meet (given the lines and crossings), a closed loop that isn't
 * the answer, and the circles already met.
 */
export function breaks(P, marks) {
  const { g } = P, st = stateOf(marks), wrong = [], done = [], bad = [], loop = [];
  for (const x of P.circles) {
    const broken = P.circ[x] === WHITE ? !whiteAxes(P, st, x).length : AXES.some(([a, b]) => !blackSide(P, st, x, a) && !blackSide(P, st, x, b));
    if (broken) wrong.push(x); else if (met(P, st, x)) done.push(x);
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
  return { wrong, done, bad, loop };
}

// ---------- hints ----------
/**
 * The next thing to tell a player: a mark that is wrong, put right ({ wrong, should }); else the next step a person
 * would take, simplest first ({ step: { set, tech, … } }); else one edge of the answer ({ reveal, should }).
 */
export function hintFor(P, marks) {
  const { g } = P;
  for (let e = 0; e < g.E; e++) {
    const should = P.sol[e] ? LINE : CROSS;
    if (marks[e] !== NONE && marks[e] !== should) return { wrong: e, should };
  }
  const st = stateOf(marks), rec = {};
  if (propagate(g, P, st.slice()) >= 0) {
    if (sweep(g, P, st.slice(), rec) > 0 || loopRule(g, P, st.slice(), rec) > 0) return { step: rec };
    const r2 = {};
    if (trialStep(g, P, st, TRIAL_ROUNDS, r2) || trialStep(g, P, st, Infinity, r2)) return { step: r2 };
  }
  const e = st.indexOf(0);
  return e < 0 ? null : { reveal: e, should: P.sol[e] ? LINE : CROSS };
}
