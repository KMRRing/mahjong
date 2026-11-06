// The loop kernel: what Circuit and Pearl share. One loop is drawn along the edges of a grid of corners (a corner is
// a dot for Circuit, a cell's middle for Pearl); a corner has no line or two; the loop never crosses or touches
// itself. A puzzle kind brings its own clues: `sweep(g, X, st, rec)` (what its clues settle, -1 on a contradiction, 1 if
// it settled something, else 0) and `closes(g, X, st, e)` (whether the lines drawn with edge `e` added meet every clue);
// `loopSolver` makes the solver for it: the rules followed to a standstill, trials (suppose an edge one way and see
// the rules break), the grade of a puzzle, and a search that counts answers. No page in it.
//
// Edges are numbered row by row: the horizontal ones first (row 0 of corners, its C edges, then row 1…), then the vertical
// ones (cell row 0, its C+1 edges, …). A state is one number an edge: 0 unknown, 1 line, 2 crossed (known not to be
// part of the loop).

export const NONE = "0", LINE = "1", CROSS = "2";
export const TRIAL_ROUNDS = 2;     // Medium's trials break within this many rounds of the plain rules; Hard's follow them all the way

// ---------- the board ----------
const GEO = new Map();
/** The board of R rows and C columns of cells: its edges, corners and cells, and which touch which. */
export function geometry(R, C) {
  const key = `${R}x${C}`;
  if (GEO.has(key)) return GEO.get(key);
  const H = (R + 1) * C, E = H + R * (C + 1), V = (R + 1) * (C + 1), cells = R * C;
  const ea = new Int16Array(E), eb = new Int16Array(E), ce = new Int16Array(cells * 4);
  const vedges = Array.from({ length: V }, () => []), ecells = Array.from({ length: E }, () => []);
  for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) { const e = r * C + c; ea[e] = r * (C + 1) + c; eb[e] = ea[e] + 1; }
  for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) { const e = H + r * (C + 1) + c; ea[e] = r * (C + 1) + c; eb[e] = ea[e] + C + 1; }
  for (let e = 0; e < E; e++) { vedges[ea[e]].push(e); vedges[eb[e]].push(e); }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const k = r * C + c, es = [r * C + c, (r + 1) * C + c, H + r * (C + 1) + c, H + r * (C + 1) + c + 1];   // top, bottom, left, right
    es.forEach((e, j) => { ce[k * 4 + j] = e; ecells[e].push(k); });
  }
  const g = { R, C, H, E, V, cells, ea, eb, ce, vedges, ecells };
  GEO.set(key, g);
  return g;
}

/**
 * The corner rule: the loop passes through a corner (two lines) or not at all (none). Returns -1 on a contradiction, 1 if
 * it settled something, else 0; with `rec` it stops at the first thing it settles and says what it was (rec.tech and
 * rec.vertex, the edges in rec.set).
 */
export function vertexRule(g, st, rec) {
  const { vedges, V } = g;
  let changed = 0;
  for (let x = 0; x < V; x++) {
    const es = vedges[x];
    let l = 0, u = 0;
    for (const e of es) { const s = st[e]; if (s === 1) l++; else if (s === 0) u++; }
    if (l > 2) return -1;
    let v = 0, tech = "";
    if (l === 2) { if (u) { v = 2; tech = "two"; } }
    else if (l === 1) { if (!u) return -1; if (u === 1) { v = 1; tech = "through"; } }
    else if (u === 1) { v = 2; tech = "dead"; }
    if (!v) continue;
    for (const e of es) if (st[e] === 0) { st[e] = v; if (rec) note(rec, e, v); }
    if (rec) { rec.tech = tech; rec.vertex = x; return 1; }
    changed = 1;
  }
  return changed;
}
/** Records an edge a rule settled, for a hint. */
export const note = (rec, e, v) => { (rec.set ??= []).push([e, v]); };

/**
 * The solver of a kind of puzzle with these two rules (see above). Everything takes the board `g`, the puzzle's clues
 * `X` (whatever `sweep` and `closes` read) and the state `st`, one number an edge.
 */
export function loopSolver({ sweep, closes }) {
  /** The loop rule: a line may only join the two ends of one path when that closes the whole answer. Returns -1, 1 or 0. */
  function loopRule(g, X, st, rec) {
    const par = new Int16Array(g.V);
    for (let i = 0; i < g.V; i++) par[i] = i;
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    let cyc = -1, lines = 0, root0 = -1, single = true;
    for (let e = 0; e < g.E; e++) {
      if (st[e] !== 1) continue;
      lines++;
      const a = find(g.ea[e]), b = find(g.eb[e]);
      if (a === b) { if (cyc >= 0) return -1; cyc = e; } else par[a] = b;
    }
    if (!lines) return 0;
    for (let e = 0; e < g.E; e++) {
      if (st[e] !== 1) continue;
      const r = find(g.ea[e]);
      if (root0 < 0) root0 = r; else if (r !== root0) { single = false; break; }
    }
    let changed = 0;
    if (cyc >= 0) {
      // a closed loop: any other line is a second loop, and nothing more may be added to it
      if (!single) return -1;
      for (let e = 0; e < g.E; e++) if (st[e] === 0) { st[e] = 2; changed = 1; if (rec) note(rec, e, 2); }
      if (rec && changed) { rec.tech = "closed"; rec.edge = cyc; }
      return changed;
    }
    for (let e = 0; e < g.E; e++) {
      if (st[e] !== 0 || find(g.ea[e]) !== find(g.eb[e])) continue;
      if (single && closes(g, X, st, e)) continue;                 // the last edge of the answer
      st[e] = 2; changed = 1;
      if (rec) { note(rec, e, 2); rec.tech = "loop"; rec.edge = e; return 1; }
    }
    return changed;
  }
  /** The rules followed until nothing more is settled, or for `rounds` rounds. -1 if they break, else 0. */
  function propagate(g, X, st, rounds = Infinity) {
    for (let i = 0; i < rounds; i++) {
      const a = sweep(g, X, st, null);
      if (a < 0) return -1;
      const b = loopRule(g, X, st, null);
      if (b < 0) return -1;
      if (!a && !b) return 0;
    }
    return 0;
  }
  const complete = (g, st) => { let lines = 0; for (let e = 0; e < g.E; e++) { if (!st[e]) return false; if (st[e] === 1) lines++; } return lines > 0; };

  /**
   * A trial: suppose an edge is a line, or crossed, and follow the rules for `rounds` rounds; if they break, it is the
   * other. Settles every edge it can, and says whether it settled any (-1 when the puzzle has no answer).
   */
  function trial(g, X, st, rounds) {
    let any = 0;
    for (let e = 0; e < g.E; e++) {
      if (st[e]) continue;
      for (const v of [1, 2]) {
        const t = st.slice();
        t[e] = v;
        if (propagate(g, X, t, rounds) < 0) {
          st[e] = 3 - v;
          if (propagate(g, X, st) < 0) return -1;
          any = 1;
          break;
        }
      }
    }
    return any;
  }
  /** The first edge a trial settles, and how many rounds it took to break: for a hint. */
  function trialStep(g, X, st, rounds, rec) {
    for (let e = 0; e < g.E; e++) {
      if (st[e]) continue;
      for (const v of [1, 2]) {
        const t = st.slice();
        t[e] = v;
        if (propagate(g, X, t, rounds) < 0) {
          let depth = 1;
          while (propagate(g, X, Int8Array.from(st).fill(v, e, e + 1), depth) >= 0 && depth < 60) depth++;
          Object.assign(rec, { set: [[e, 3 - v]], tech: "trial", edge: e, supposed: v, depth });
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Solve with what a person at a level can do: 0, the rules alone; 1, a trial that breaks within a couple of rounds
   * too; 2, any trial of one supposed edge. { ok, st, need } with need the hardest kind of step used.
   */
  function solveAs(g, X, level, st = new Int8Array(g.E)) {
    let need = 0;
    for (;;) {
      if (propagate(g, X, st) < 0) return { ok: false, st, need, broken: true };
      if (complete(g, st)) return { ok: true, st, need };
      let got = 0;
      if (level >= 1) { got = trial(g, X, st, TRIAL_ROUNDS); if (got) need = Math.max(need, 1); }
      if (got < 0) return { ok: false, st, need, broken: true };
      if (!got && level >= 2) { got = trial(g, X, st, Infinity); if (got) need = 2; }
      if (got < 0) return { ok: false, st, need, broken: true };
      if (!got) return { ok: false, st, need };
    }
  }
  /** The lowest level (0 to 2) that solves the puzzle by reasoning, or -1 when none does. */
  function gradeOf(g, X) {
    for (let lv = 0; lv < 3; lv++) if (solveAs(g, X, lv).ok) return lv;
    return -1;
  }
  /** How many answers the clues have, counted up to `limit`: a search, the rules followed after every guess. */
  function count(g, X, limit = 2, st = new Int8Array(g.E)) {
    if (propagate(g, X, st) < 0) return 0;
    if (complete(g, st)) return 1;
    let pick = -1;
    for (let x = 0; x < g.V && pick < 0; x++) {                  // follow a path from where it ends, if there is one
      let l = 0, free = -1;
      for (const e of g.vedges[x]) { if (st[e] === 1) l++; else if (!st[e] && free < 0) free = e; }
      if (l === 1) pick = free;
    }
    if (pick < 0) pick = st.indexOf(0);
    if (pick < 0) return 0;
    let n = 0;
    for (const v of [1, 2]) {
      const t = st.slice();
      t[pick] = v;
      n += count(g, X, limit - n, t);
      if (n >= limit) break;
    }
    return n;
  }
  /** An answer of a puzzle that has one (the first the search finds), as a state, or null. */
  function firstAnswer(g, X) {
    const r = solveAs(g, X, 2);
    if (r.ok) return r.st;
    const find = (st = new Int8Array(g.E)) => {
      if (propagate(g, X, st) < 0) return null;
      if (complete(g, st)) return st;
      const e = st.indexOf(0);
      for (const v of [1, 2]) { const t = st.slice(); t[e] = v; const s = find(t); if (s) return s; }
      return null;
    };
    return find();
  }
  return { loopRule, propagate, complete, trial, trialStep, solveAs, gradeOf, count, firstAnswer };
}

// ---------- making a loop ----------
export const rngOf = seed => {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
export const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * A closed loop, as the cells inside it: a region grown cell by cell that stays in one piece, has no hole in it and
 * touches itself at no corner, so its outline is one loop that never meets itself.
 */
export function randomLoop(R, C, rng) {
  const W = C + 2, at = (r, c) => (r + 1) * W + c + 1, ins = new Uint8Array((R + 2) * W);
  const target = Math.round(R * C * (0.5 + rng() * 0.2));
  ins[at(Math.floor(rng() * R), Math.floor(rng() * C))] = 1;
  let size = 1;
  const outsideJoined = () => {                              // every outside cell, the ring round the board too, reached from its corner
    const seen = new Uint8Array(ins.length), todo = [0];
    seen[0] = 1;
    let reached = 0;
    while (todo.length) {
      const i = todo.pop();
      reached++;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= ins.length || seen[j] || ins[j]) continue;
        if ((j % W === 0 && i % W === W - 1) || (j % W === W - 1 && i % W === 0)) continue;   // no wrapping round the edge
        seen[j] = 1; todo.push(j);
      }
    }
    return reached === ins.length - size;
  };
  const pinched = i => {                                     // two diagonal cells in, the other two out, at any corner of cell i
    for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
      const a = i + dr * W + dc, b = a + 1, c = a + W, d = c + 1;
      if ((ins[a] && ins[d] && !ins[b] && !ins[c]) || (ins[b] && ins[c] && !ins[a] && !ins[d])) return true;
    }
    return false;
  };
  while (size < target) {
    const cand = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = at(r, c);
      if (!ins[i] && (ins[i - 1] || ins[i + 1] || ins[i - W] || ins[i + W])) cand.push(i);
    }
    shuffle(cand, rng);
    let added = false;
    for (const i of cand) {
      ins[i] = 1; size++;
      if (!pinched(i) && outsideJoined()) { added = true; break; }
      ins[i] = 0; size--;
    }
    if (!added) break;
  }
  return { ins, at };
}

/** The loop a region's outline makes, as marks for the edges of the board `g` (R rows by C columns of cells): "1" on the
 *  loop, "2" off it. */
export function outlineMarks(g, { ins, at }) {
  const { R, C, H } = g, marks = new Array(g.E).fill(CROSS);
  for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) if (ins[at(r - 1, c)] !== ins[at(r, c)]) marks[r * C + c] = LINE;
  for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) if (ins[at(r, c - 1)] !== ins[at(r, c)]) marks[H + r * (C + 1) + c] = LINE;
  return marks;
}
