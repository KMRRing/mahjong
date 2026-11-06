// Dujiang's rules, puzzles and reasoning. Some cells carry a number: each is an island of exactly that many cells,
// joined edge to edge, with that one number in it. Every other cell is sea. The sea is one piece (no cell of it cut off
// from the rest) and holds no 2×2 block, so the islands have to be spread over the board and the sea can't pool. Every
// puzzle made here has exactly one answer and is graded by the hardest step a person needs to reach it: the solver below
// only reasons (it never guesses and backs out), so a puzzle it finishes has no second answer. No page in it:
// nurikabe-worker.js makes puzzles off the page, nurikabe.js plays them, tests/nurikabe.mjs checks it all in Node.
//
// A state is one number a cell (0 unknown, 1 sea, 2 island); the marks a player keeps are the same as characters, one
// string a board, with an island's mark a dot. A numbered cell is an island from the start.

import { rngOf, shuffle } from "./loop-engine.js";

export const NONE = "0", SEA = "1", LAND = "2";
export const SIZES = [6, 8, 10];
export const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const ORDER = ["easy", "medium", "hard"];
export const DAILY = { size: 8, level: "medium" };
// island sizes allowed (by level) while a board is grown; the share of the board that is land to start with; how often a
// new island starts rather than one growing; how often a cell beside an island is the one given to it
const ROOMY = [4, 6, 8], SHARE = 0.32, FRESH = 0.4, BESIDE = 0.7;
const TRIES = [24, 12, 8];         // boards made towards each level before the nearest is dealt
const HARDEN = 60;                 // moves of a number tried to make a Medium or Hard board need more than the level below
const STEPS = 14;                  // changes tried on a board before it is given up, for each of its cells

// ---------- the board ----------
const BOARDS = new Map();
/** The board of N×N cells: each cell's neighbours, and its 2×2 blocks (four cells each). */
export function board(N) {
  if (BOARDS.has(N)) return BOARDS.get(N);
  const ns = Array.from({ length: N * N }, () => []), blocks = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = r * N + c;
    if (r > 0) ns[x].push(x - N);
    if (r < N - 1) ns[x].push(x + N);
    if (c > 0) ns[x].push(x - 1);
    if (c < N - 1) ns[x].push(x + 1);
    if (r < N - 1 && c < N - 1) blocks.push(Int16Array.of(x, x + 1, x + N, x + N + 1));
  }
  const b = { N, ns, blocks };
  BOARDS.set(N, b);
  return b;
}
/** The twists a puzzle can carry, by the name a level and a link give them. */
export const TWISTS = { ranges: "Bounds", unknown: "Unknown", bridges: "Arch bridges" };
export const TWIST_ORDER = ["ranges", "unknown", "bridges"];
/** The twists a name holds ("ranges+bridges"), as { ranges, unknown, bridges } booleans, or null for the plain game. */
export function twistsOf(name) {
  const t = {};
  for (const w of String(name || "").split("+")) if (TWISTS[w]) t[w] = true;
  return Object.keys(t).length ? t : null;
}
/** A twist name made canonical (in TWIST_ORDER's order, only the twists there are), "none" for the plain game. */
export const twistOn = name => { const t = twistsOf(name); return t ? TWIST_ORDER.filter(w => t[w]).join("+") : "none"; };

/**
 * A puzzle from its numbers (one character a cell: "-" none, else the island's size in base 36) and, if known, its answer
 * (1 sea, 2 island, a character a cell). The twists ride along in `tw` and are all optional: `bd` (a character a cell: "-" a
 * number is exact or absent, "+" at least that many cells, "<" at most that many, "?" a stone with no number, any size from
 * one cell), `br` (a character a cell: "-", "h" an arch bridge whose deck runs east-west, "v" one whose deck runs
 * north-south) and `land` (the number of island cells in all, which a puzzle of bounds or unknown islands gives).
 */
export function puzzleOf(size, grid, sol = null, tw = {}) {
  const { ns, blocks } = board(size), cells = size * size, clue = Int8Array.from(grid, ch => (ch === "-" ? 0 : parseInt(ch, 36)));
  const bound = Int8Array.from({ length: cells }, (_, x) => ({ "+": 1, "<": 2, "?": 3 })[tw.bd?.[x]] || 0);
  const bridge = Int8Array.from({ length: cells }, (_, x) => ({ h: 1, v: 2 })[tw.br?.[x]] || 0);
  const P = { size, N: size, cells, ns, blocks, grid, clue, bound, bridge, land: tw.land ?? null, sol: sol && Int8Array.from(sol, Number), solMarks: sol };
  P.total = P.land ?? (bound.some(Boolean) ? -1 : clue.reduce((s, n) => s + n, 0));      // (-1: not known)
  P.fancy = bound.some(Boolean) || bridge.some(Boolean);
  return seat(P);
}
/**
 * Works out from a puzzle's numbers, bounds and bridges what the solver reads: which cells are stones (a number or a "?"), the
 * fewest and most cells each island may have (`lo0`, `hi0`: what is printed; `lo`, `hi`: narrowed by the land count, since
 * the others need at least so many cells, so this one has at most what is left), and the bridge cells.
 */
export function seat(P) {
  const { cells, clue, bound } = P;
  P.stone = new Uint8Array(cells); P.lo0 = new Int16Array(cells); P.hi0 = new Int16Array(cells);
  const stones = [];
  for (let x = 0; x < cells; x++) {
    if (!clue[x] && bound[x] !== 3) continue;
    P.stone[x] = 1; stones.push(x);
    const n = clue[x], b = bound[x];
    P.lo0[x] = b === 3 || b === 2 ? 1 : n;
    P.hi0[x] = b === 1 || b === 3 ? cells : n;
  }
  P.clues = Int16Array.from(stones);
  P.lo = P.lo0; P.hi = P.hi0;
  if (P.fancy && P.total >= 0) {
    let sumLo = 0, sumHi = 0;
    for (const x of stones) { sumLo += P.lo0[x]; sumHi += P.hi0[x]; }
    P.lo = P.lo0.slice(); P.hi = P.hi0.slice();
    for (const x of stones) {
      P.hi[x] = Math.min(P.hi0[x], P.total - (sumLo - P.lo0[x]));
      P.lo[x] = Math.max(P.lo0[x], P.total - (sumHi - P.hi0[x]));
    }
  }
  return P;
}
/** The bridge's four neighbours: its two ends (island) and its two sides (sea, the water running under it), or null. */
export function bridgeArms(N, x, axis) {
  const r = Math.floor(x / N), c = x % N;
  if (r < 1 || c < 1 || r > N - 2 || c > N - 2) return null;
  return axis === 1 ? { ends: [x - 1, x + 1], sides: [x - N, x + N] } : { ends: [x - N, x + N], sides: [x - 1, x + 1] };
}
/** What a number cell reads: "5", "5+", "≤4" or "?" (a bound is in Bridges' notation). */
export const labelOf = (P, x) => (P.bound[x] === 3 ? "?" : P.bound[x] === 1 ? `${P.clue[x]}+` : P.bound[x] === 2 ? `≤${P.clue[x]}` : String(P.clue[x]));
/** A cell that is given and can't be marked: a stone or a bridge. */
export const fixedAt = (P, x) => P.stone[x] === 1 || P.bridge[x] > 0;
/** The state a puzzle starts from: its numbered cells and its bridges are island. */
export function startOf(P) {
  const st = new Int8Array(P.cells);
  for (const x of P.clues) st[x] = 2;
  if (P.fancy) for (let x = 0; x < P.cells; x++) if (P.bridge[x]) st[x] = 2;
  return st;
}

// ---------- the rules, as a solver follows them ----------
/** Records a cell a rule settled, for a hint. */
const note = (rec, x, v) => { (rec.set ??= []).push([x, v]); };

/** The islands as they stand: each piece of connected island cells, with its numbers, its size and the unknown cells
 *  beside it (its liberties); `cid` says which piece a cell is in. */
function analyse(P, st) {
  const { cells, ns, stone } = P, cid = new Int16Array(cells).fill(-1), lib = new Int16Array(cells), comps = [];
  for (let x = 0; x < cells; x++) {
    if (st[x] !== 2 || cid[x] >= 0) continue;
    const k = comps.length, c = { cells: [], clues: 0, lo: 0, hi: 0, lo0: 0, hi0: 0, libs: [] };
    cid[x] = k;
    const todo = [x];
    while (todo.length) {
      const y = todo.pop();
      c.cells.push(y);
      if (stone[y]) { c.clues++; c.lo = P.lo[y]; c.hi = P.hi[y]; c.lo0 = P.lo0[y]; c.hi0 = P.hi0[y]; }
      for (const z of ns[y]) {
        if (st[z] === 2 && cid[z] < 0) { cid[z] = k; todo.push(z); }
        else if (st[z] === 0 && lib[z] !== k + 1) { lib[z] = k + 1; c.libs.push(z); }
      }
    }
    comps.push(c);
  }
  return { cid, comps };
}

/** One sweep of the rules. Returns -1 on a contradiction, 1 if it settled something, else 0. `cutting` adds the rule that
 *  keeps the sea in one piece. With `rec`, it stops at the first thing it settles and says what it was (rec.set, rec.tech,
 *  rec.focus: the cells it was reading). */
function sweep(P, st, cutting, rec) {
  const { cells, ns, blocks, bridge } = P;
  let changed = 0, broke = false, grew = false, A = analyse(P, st);
  const put = (x, v) => {
    if (st[x] === v) return;
    if (st[x]) { broke = true; return; }
    st[x] = v; changed = 1;
    if (v === 2) grew = true;
    if (rec) note(rec, x, v);
  };
  const done = (tech, focus) => { if (rec && rec.set?.length) { rec.tech = tech; rec.focus = focus; return true; } return false; };
  /** After a rule: stop with its first finding for a hint, or carry on with the islands as they now stand. */
  const after = () => { if (broke) return -1; if (changed) { if (rec) return 1; if (grew) { A = analyse(P, st); grew = false; } } return 0; };
  const rules = [];
  // an arch bridge: its two ends are island and the water runs under it, so its two sides are sea
  if (P.fancy) rules.push(() => {
    for (let x = 0; x < cells; x++) {
      if (!bridge[x]) continue;
      const arms = bridgeArms(P.N, x, bridge[x]);
      for (const y of arms.ends) put(y, 2);
      for (const y of arms.sides) put(y, 1);
      if (done("bridge", [x])) return;
    }
  });
  rules.push(
    // an island that has all its cells (the most its number, its bound or the land count allows) is walled in by sea
    () => {
      for (const c of A.comps) {
        if (c.clues > 1 || (c.clues && c.cells.length > c.hi)) { broke = true; return; }
        if (c.clues !== 1 || c.cells.length !== c.hi) continue;
        for (const x of c.libs) put(x, 1);
        if (done("complete", c.cells)) return;
      }
    },
    // a cell beside two islands that would join into one with two numbers, or too big for its number, is sea
    () => {
      for (let x = 0; x < cells; x++) {
        if (st[x]) continue;
        const near = new Set();
        for (const y of ns[x]) if (st[y] === 2) near.add(A.cid[y]);
        if (near.size < 2) continue;
        let n = 1, clues = 0, clueOf = 0;
        for (const k of near) { const c = A.comps[k]; n += c.cells.length; clues += c.clues; if (c.clues) clueOf = c.hi; }
        if (clues > 1 || (clues && n > clueOf)) {
          put(x, 1);
          if (done("between", [x, ...[...near].flatMap(k => A.comps[k].cells)])) return;
        }
      }
    },
    // an island still short of its number with one way out takes it; one with none can't be finished
    () => {
      for (const c of A.comps) {
        if (c.clues === 1 && (c.cells.length === c.hi || c.cells.length >= c.lo)) continue;     // (an island past its fewest cells need not grow)
        const free = c.libs.filter(x => st[x] !== 1);          // (the sea set since the islands were read is left out)
        if (!free.length) { broke = true; return; }
        if (free.length === 1) { put(free[0], 2); if (done("grow", c.cells)) return; }
      }
    },
    // three sea cells of a 2×2 block: the fourth is island
    () => {
      for (const b of blocks) {
        let sea = 0, free = -1;
        for (const x of b) { if (st[x] === 1 || (bridge[x] && st[x] === 2)) sea++; else if (!st[x]) free = x; }
        if (sea === 4) { broke = true; return; }
        if (sea === 3 && free >= 0) { put(free, 2); if (done("pool", Array.from(b))) return; }
      }
    },
    // the islands' cells are as many as the numbers add up to: once that many are known, the rest are sea, and the other way
    () => {
      let sea = 0, land = 0;
      for (let x = 0; x < cells; x++) { if (st[x] === 1) sea++; else if (st[x] === 2) land++; }
      if (P.total < 0) return;
      if (land > P.total || cells - sea < P.total) { broke = true; return; }
      if (land === P.total) { for (let x = 0; x < cells; x++) if (!st[x]) put(x, 1); if (done("count", [])) return; }
      else if (cells - sea === P.total) { for (let x = 0; x < cells; x++) if (!st[x]) put(x, 2); if (done("count", [])) return; }
    },
    // a cell no island can reach with the cells it has left is sea; an island piece without a number that none can reach is wrong
    () => {
      const { comps, cid } = A, got = new Uint8Array(cells), dist = new Int8Array(cells);
      comps.forEach((c, ci) => {
        const room = c.hi - c.cells.length;
        if (c.clues !== 1 || room <= 0) return;
        dist.fill(-1);
        const queue = c.cells.slice();
        for (const x of queue) dist[x] = 0;
        for (let i = 0; i < queue.length; i++) {
          const y = queue[i];
          if (dist[y] >= room) continue;
          for (const z of ns[y]) {
            if (dist[z] >= 0 || st[z] === 1) continue;
            if (st[z] === 2) { if (comps[cid[z]].clues) continue; }                  // another numbered island: not to be joined
            else if (ns[z].some(w => st[w] === 2 && cid[w] !== ci && comps[cid[w]].clues)) continue;   // would touch one
            dist[z] = dist[y] + 1; got[z] = 1; queue.push(z);
          }
        }
        if (P.fancy && queue.length < c.lo) broke = true;       // the cells it could ever hold are fewer than its fewest
      });
      if (broke) return;
      for (const c of comps) if (!c.clues && !c.cells.some(x => got[x])) { broke = true; return; }
      for (let x = 0; x < cells; x++) {
        if (st[x] || got[x]) continue;
        put(x, 1);
        if (done("reach", [x])) return;
      }
    },
  );
  if (cutting) {
    // a cell that is the only link between parts of the sea is sea itself; sea already cut in two can't be put right
    rules.push(() => {
      const wet = x => st[x] === 1 || (bridge[x] > 0 && st[x] === 2);       // the water runs under a bridge
      let total = 0, root = -1;
      for (let x = 0; x < cells; x++) if (wet(x)) { total++; if (root < 0) root = x; }
      if (!total) return;
      const disc = new Int16Array(cells).fill(-1), low = new Int16Array(cells), sub = new Int16Array(cells), cuts = [];
      let t = 0, seen = 0;
      const walk = (u, from) => {
        disc[u] = low[u] = t++;
        if (wet(u)) { sub[u] = 1; seen++; }
        for (const v of ns[u]) {
          if ((st[v] === 2 && !wet(v)) || v === from) continue;
          if (disc[v] < 0) {
            walk(v, u);
            low[u] = Math.min(low[u], low[v]);
            sub[u] += sub[v];
            if (!st[u] && low[v] >= disc[u] && sub[v] > 0) cuts.push(u);
          } else low[u] = Math.min(low[u], disc[v]);
        }
      };
      walk(root, -1);
      if (seen < total) { broke = true; return; }
      for (const x of cuts) { put(x, 1); if (done("cut", [x])) return; }
    });
  }
  for (const rule of rules) {
    rule();
    const r = after();
    if (r) return r;
  }
  return changed;
}
/** The rules followed until nothing more is settled, or for `rounds` rounds. -1 if they break, else 0. */
function propagate(P, st, cutting, rounds = Infinity) {
  for (let i = 0; i < rounds; i++) {
    const a = sweep(P, st, cutting, null);
    if (a < 0) return -1;
    if (!a) return 0;
  }
  return 0;
}
/** Whether a state with every cell settled is an answer: every island its number (or within its bound), no 2×2 of sea, the sea in one piece (a bridge counts as sea). */
function valid(P, st) {
  const { cells, ns, blocks, bridge } = P;
  if (st.includes(0)) return false;
  const A = analyse(P, st), wet = x => st[x] === 1 || bridge[x] > 0;
  if (A.comps.some(c => c.clues !== 1 || c.cells.length < c.lo0 || c.cells.length > c.hi0)) return false;
  if (P.total >= 0 && A.comps.reduce((n, c) => n + c.cells.length, 0) !== P.total) return false;
  if (blocks.some(b => b.every(wet))) return false;
  const first = st.findIndex((v, x) => wet(x));
  if (first < 0) return true;
  const seen = new Uint8Array(cells), todo = [first];
  seen[first] = 1;
  let reached = 0, sea = 0;
  for (let x = 0; x < cells; x++) if (wet(x)) sea++;
  while (todo.length) {
    const x = todo.pop();
    reached++;
    for (const y of ns[x]) if (wet(y) && !seen[y]) { seen[y] = 1; todo.push(y); }
  }
  return reached === sea;
}

/**
 * A trial: suppose a cell is sea, or island, and follow the rules for `rounds` rounds; if they break, it is the other.
 * Settles every cell it can, and says whether it settled any (-1 when the puzzle has no answer).
 */
function trial(P, st, rounds) {
  let any = 0;
  for (let x = 0; x < P.cells; x++) {
    if (st[x]) continue;
    for (const v of [1, 2]) {
      const t = st.slice();
      t[x] = v;
      if (propagate(P, t, true, rounds) < 0) {
        st[x] = 3 - v;
        if (propagate(P, st, true) < 0) return -1;
        any = 1;
        break;
      }
    }
  }
  return any;
}
/** The first cell a trial settles, and how many rounds it took to break: for a hint. */
function trialStep(P, st, rounds, rec) {
  for (let x = 0; x < P.cells; x++) {
    if (st[x]) continue;
    for (const v of [1, 2]) {
      const t = st.slice();
      t[x] = v;
      if (propagate(P, t, true, rounds) < 0) {
        let depth = 1;
        while (propagate(P, Int8Array.from(st).fill(v, x, x + 1), true, depth) >= 0 && depth < 60) depth++;
        Object.assign(rec, { set: [[x, 3 - v]], tech: "trial", cell: x, focus: [x], supposed: v, depth });
        return true;
      }
    }
  }
  return false;
}

/**
 * Solve with what a person at a level can do: 0, the plain rules (an island's walls, cells between islands, ways out,
 * pools, reach, the count); 1, the sea kept in one piece too; 2, a supposition too (suppose a cell is sea or island, follow
 * the rules, and if they break it is the other). { ok, st, need } with need 2 if a supposition was used.
 */
export function solveAs(P, level, st = startOf(P)) {
  let need = 0;
  for (;;) {
    if (propagate(P, st, level >= 1) < 0) return { ok: false, st, need, broken: true };
    if (!st.includes(0)) return { ok: valid(P, st), st, need };
    if (level < 2) return { ok: false, st, need };
    const got = trial(P, st, Infinity);
    if (got < 0) return { ok: false, st, need, broken: true };
    if (!got) return { ok: false, st, need };
    need = 2;
  }
}
/** The lowest level (0 to 2) that solves the puzzle by reasoning, or -1 when none does. */
export function gradeOf(P, upto = 2) {
  for (let lv = 0; lv < upto; lv++) if (solveAs(P, lv).ok) return lv;
  return solveAs(P, upto).ok ? upto : -1;
}
/** How many answers the numbers have, counted up to `limit`: a search, the rules followed after every guess. */
export function count(P, limit = 2, st = startOf(P)) {
  if (propagate(P, st, true) < 0) return 0;
  if (!st.includes(0)) return valid(P, st) ? 1 : 0;
  // guess beside an island that isn't finished, so the guess is followed up at once
  let pick = -1;
  for (const c of analyse(P, st).comps) if (pick < 0 && c.libs.length) pick = c.libs[0];
  if (pick < 0) pick = st.indexOf(0);
  let n = 0;
  for (const v of [2, 1]) {
    const t = st.slice();
    t[pick] = v;
    n += count(P, limit - n, t);
    if (n >= limit) break;
  }
  return n;
}
/** The answer of a puzzle that has one, as marks (1 sea, 2 island), or null. */
export function answerOf(size, grid) {
  const P = puzzleOf(size, grid), r = solveAs(P, 2);
  if (r.ok) return Array.from(r.st).join("");
  const find = (st = startOf(P)) => {
    if (propagate(P, st, true) < 0) return null;
    if (!st.includes(0)) return valid(P, st) ? st : null;
    const x = st.indexOf(0);
    for (const v of [2, 1]) { const t = st.slice(); t[x] = v; const s = find(t); if (s) return s; }
    return null;
  };
  const s = find();
  return s ? Array.from(s).join("") : null;
}

// ---------- making a puzzle ----------
/**
 * A board filled in: the island each cell is in (-1 for sea) and each island's size. Islands are grown a cell at a time
 * (never beside another, never cutting the sea in two) up to a share of the board, then more cells wherever a 2×2 of sea
 * is left. Null when it boxed itself in.
 */
function randomSolution(N, rng, share, biggest, fresh) {
  const { ns, blocks } = board(N), cells = N * N, isl = new Int16Array(cells).fill(-1), size = [];
  let land = 0;
  const seaWhole = skip => {                                   // the sea stays one piece without cell `skip`
    let first = -1, total = 0;
    for (let x = 0; x < cells; x++) if (isl[x] < 0 && x !== skip) { total++; if (first < 0) first = x; }
    if (first < 0) return false;
    const seen = new Uint8Array(cells), todo = [first];
    seen[first] = 1;
    let reached = 0;
    while (todo.length) {
      const x = todo.pop();
      reached++;
      for (const y of ns[x]) if (isl[y] < 0 && y !== skip && !seen[y]) { seen[y] = 1; todo.push(y); }
    }
    return reached === total;
  };
  /** Makes sea cell x island if the rules of the board allow: beside at most one island, which has room, and the sea whole. */
  const add = x => {
    if (isl[x] >= 0) return false;
    let k = -1;
    for (const y of ns[x]) if (isl[y] >= 0) { if (k >= 0 && isl[y] !== k) return false; k = isl[y]; }
    if (k >= 0 && size[k] >= biggest) return false;
    if (!seaWhole(x)) return false;
    if (k < 0) { k = size.length; size.push(0); }
    isl[x] = k; size[k]++; land++;
    return true;
  };
  for (let guard = 0; land < Math.round(cells * share) && guard < cells * 6; guard++) {
    const x = Math.floor(rng() * cells);
    if (isl[x] >= 0 || (!ns[x].some(y => isl[y] >= 0) && rng() > fresh)) continue;   // a new island only now and then; mostly the ones there grow
    add(x);
  }
  for (;;) {
    const pools = blocks.filter(b => b.every(x => isl[x] < 0));
    if (!pools.length) break;
    const b = pools[Math.floor(rng() * pools.length)];
    if (!shuffle(Array.from(b), rng).some(add)) return null;
  }
  return { isl, size };
}
const gridOf = P => Array.from(P.clue, n => (n ? n.toString(36) : "-")).join("");
const boundsOf = P => Array.from(P.bound, b => "-+<?"[b]).join(""), bridgesOf = P => Array.from(P.bridge, b => "-hv"[b]).join("");

/**
 * Arch bridges laid over a made board (only for a puzzle with the twist): a sea cell with island on two opposite sides and
 * sea on the other two becomes a bridge, a cell of the island its ends then join (two islands become one, the bridge cell
 * counting in its size). The first is a cell the sea can't do without (the sea would be cut in two were it island), so the
 * bridge is what keeps the sea one piece. Returns { isl, size, bridge, lockLand, lockSea } with islands numbered afresh, or null.
 */
function bridgeUp(S, N, rng, many, cap) {
  const { ns } = board(N), cells = N * N, isl = S.isl.slice(), size = S.size.slice();
  const bridge = new Uint8Array(cells), lockLand = new Uint8Array(cells), lockSea = new Uint8Array(cells);
  const wet = x => isl[x] < 0 || bridge[x] > 0;
  const needed = b => {          // the water can't go round: without b the rest of it is cut in two
    let first = -1, total = 0;
    for (let x = 0; x < cells; x++) if (wet(x) && x !== b) { total++; if (first < 0) first = x; }
    const seen = new Uint8Array(cells), todo = [first];
    seen[first] = 1;
    let reached = 0;
    while (todo.length) { const x = todo.pop(); reached++; for (const y of ns[x]) if (wet(y) && y !== b && !seen[y]) { seen[y] = 1; todo.push(y); } }
    return reached < total;
  };
  for (let n = 0; n < many; n++) {
    const found = [];
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
      const b = r * N + c;
      if (isl[b] >= 0 || lockSea[b]) continue;
      for (const axis of [1, 2]) {
        const arms = bridgeArms(N, b, axis);
        if (!arms.ends.every(e => isl[e] >= 0) || !arms.sides.every(e => isl[e] < 0 && !bridge[e] && !lockLand[e])) continue;
        const k1 = isl[arms.ends[0]], k2 = isl[arms.ends[1]];
        if ((k1 === k2 ? size[k1] : size[k1] + size[k2]) + 1 > cap) continue;
        found.push({ b, axis, arms });
      }
    }
    const must = n === 0 ? found.filter(f => needed(f.b)) : found;
    if (!must.length) return n ? { isl, size, bridge, lockLand, lockSea, done: true } : null;
    const { b, axis, arms } = must[Math.floor(rng() * must.length)], k1 = isl[arms.ends[0]], k2 = isl[arms.ends[1]];
    if (k1 !== k2) { for (let x = 0; x < cells; x++) if (isl[x] === k2) isl[x] = k1; size[k1] += size[k2]; size[k2] = 0; }
    isl[b] = k1; size[k1]++;
    bridge[b] = axis; lockLand[b] = 1;
    for (const e of arms.ends) lockLand[e] = 1;
    for (const e of arms.sides) lockSea[e] = 1;
  }
  return { isl, size, bridge, lockLand, lockSea, done: true };
}
const unknownIn = st => { let n = 0; for (const v of st) if (!v) n++; return n; };
/**
 * Boards made towards a level (`want`, 0 to 2), the best of the tries: { size, grid, sol, level } with level what it came
 * to, or null. A board is dealt with a number in one cell of each
 * island, then changed a little at a time (a number moved inside its island, an island given another cell, a new island of
 * one cell), keeping a change when the solver is left with no more to do than before, until reasoning finishes it. Then
 * cells are given back to the sea, one by one, for as long as reasoning at the level still finishes the board: so the
 * board has about the fewest numbers the level allows. Every change keeps the board an answer. Easy is the plain rules,
 * Medium the sea kept whole too, Hard a supposition too.
 */
function build(seed, size, want, tw = null) {
  const rng = rngOf(seed), N = size, cells = N * N, { ns, blocks } = board(N);
  const pick = a => a[Math.floor(rng() * a.length)];
  let best = null;
  for (let t = 0, raw = 0; t < TRIES[want] && raw < TRIES[want] * 30; raw++) {
    const roomy = ROOMY[want], S = randomSolution(N, rng, SHARE + rng() * 0.08, roomy, FRESH);
    if (!S) continue;
    t++;
    let { isl, size: sz } = S;
    // arch bridges (a puzzle with the twist): islands joined over a canal; a board that has no place for one is another try
    let lock = null;
    if (tw?.bridges) {
      lock = bridgeUp(S, N, rng, N <= 6 ? 1 : N === 8 ? 1 + (rng() < 0.5 ? 1 : 0) : 2, ROOMY[want] * 2 + 1);
      if (!lock) continue;
      const names = [], index = new Map();
      for (const k of lock.isl) if (k >= 0 && !index.has(k)) { index.set(k, names.length); names.push(lock.size[k]); }
      isl = lock.isl.map(k => (k < 0 ? -1 : index.get(k)));
      sz = names;
    }
    const bridgeAt = lock ? lock.bridge : null;
    const wet = x => isl[x] < 0 || (bridgeAt && bridgeAt[x] > 0);
    const holds = (k, x) => isl[x] === k && !(bridgeAt && bridgeAt[x]);       // (a number never sits on a bridge)
    const at = sz.map((_, k) => pick(Array.from(isl, (j, x) => (holds(k, x) ? x : -1)).filter(x => x >= 0)));
    const P = puzzleOf(N, "-".repeat(cells), "1".repeat(cells));
    if (tw) P.fancy = true;
    /** The puzzle as the board stands: numbers where the islands' numbers are, and the answer. */
    const sync = () => {
      P.clue.fill(0);
      sz.forEach((n, k) => { if (n) P.clue[at[k]] = n; });
      P.total = sz.reduce((n, v) => n + v, 0);
      for (let x = 0; x < cells; x++) P.sol[x] = isl[x] < 0 ? 1 : 2;
      if (bridgeAt) P.bridge.set(bridgeAt);
      seat(P);
    };
    const seaWhole = skip => {                                       // the sea is one piece without cell `skip` (a land cell stays land)
      const seen = new Uint8Array(cells), todo = [];
      let total = 0;
      for (let x = 0; x < cells; x++) if (wet(x) && x !== skip) { total++; if (!todo.length) { todo.push(x); seen[x] = 1; } }
      let reached = 0;
      while (todo.length) {
        const x = todo.pop();
        reached++;
        for (const y of ns[x]) if (wet(y) && y !== skip && !seen[y]) { seen[y] = 1; todo.push(y); }
      }
      return reached === total;
    };
    /** Makes sea cell x land: a new island if nothing is beside it, else the one island beside it (never two). */
    const give = x => {
      if (lock?.lockSea[x]) return false;
      let k = -1;
      for (const y of ns[x]) if (isl[y] >= 0) { if (k >= 0 && isl[y] !== k) return false; k = isl[y]; }
      if (k >= 0 && sz[k] >= roomy) return false;
      if (!seaWhole(x)) return false;
      if (k < 0) { k = sz.length; sz.push(0); at.push(x); }
      isl[x] = k; sz[k]++;
      return true;
    };
    /** Makes land cell x sea: not its island's number, its island staying whole, no 2×2 of sea made, joined to the sea. */
    const take = x => {
      const k = isl[x];
      if (k < 0 || (x === at[k] && sz[k] > 1) || lock?.lockLand[x]) return false;
      if (!ns[x].some(wet)) return false;
      if (blocks.some(b => b.includes(x) && b.every(y => y === x || wet(y)))) return false;
      if (sz[k] > 1) {
        const rest = Array.from(isl, (j, y) => (j === k && y !== x ? y : -1)).filter(y => y >= 0), seen = new Set([rest[0]]), todo = [rest[0]];
        while (todo.length) for (const y of ns[todo.pop()]) if (isl[y] === k && y !== x && !seen.has(y)) { seen.add(y); todo.push(y); }
        if (seen.size !== rest.length) return false;
      } else at[k] = -1;
      isl[x] = -1; sz[k]--;
      return true;
    };
    const save = () => [isl.slice(), sz.slice(), at.slice()];
    const back = was => { [isl, sz] = [was[0], was[1]]; at.length = 0; at.push(...was[2]); sync(); };
    sync();
    // the solver's standing at this level: the cells it can't settle (null if the board is broken, which none should be)
    const stand = () => { const st = startOf(P); return propagate(P, st, want >= 1) < 0 ? null : st; };
    let st = stand(), solved = false;
    for (let step = 0; step < STEPS * cells && st; step++) {
      const left = unknownIn(st);
      if (!left) { solved = valid(P, st); break; }
      if (step === Math.floor(STEPS * cells * 0.4) && left > cells * 0.3) break;       // far from done at two fifths of the way: another board
      const was = save(), r = rng();
      let moved = false;
      if (r < 0.5) {
        // a number moves in an island the solver is stuck at (cells of it, or beside it, undecided), else in any
        const stuck = new Set();
        for (let x = 0; x < cells; x++) if (isl[x] >= 0 && sz[isl[x]] > 1 && (!st[x] || ns[x].some(y => !st[y]))) stuck.add(isl[x]);
        const k = pick(stuck.size && want > 0 ? [...stuck] : sz.map((n, j) => (n > 1 ? j : -1)).filter(j => j >= 0));
        if (k !== undefined) { at[k] = pick(Array.from(isl, (j, x) => (holds(k, x) && x !== at[k] ? x : -1)).filter(x => x >= 0)); moved = true; }
      } else if (r < 0.9) {
        const open = Array.from(st, (v, x) => (!v && isl[x] < 0 ? x : -1)).filter(x => x >= 0);
        const beside = open.filter(x => ns[x].some(y => isl[y] >= 0));      // mostly an island grows; a new one now and then
        moved = open.length > 0 && give(pick(beside.length && rng() < BESIDE ? beside : open));
      } else {
        moved = take(pick(Array.from(isl, (j, x) => (j >= 0 ? x : -1)).filter(x => x >= 0)));
      }
      if (!moved) continue;
      sync();
      // a worse board is kept now and then, less as the search goes on (plain arithmetic, so every device deals the same board)
      const next = stand(), worse = next ? unknownIn(next) - left : Infinity, heat = 1 - step / (STEPS * cells) + 0.1;
      if (next && (worse <= 0 || rng() * (heat + worse * worse) < heat)) st = next;
      else back(was);
    }
    if (!solved) continue;
    // the fewest numbers: land given back to the sea while the level still finishes the board
    const finishes = () => { sync(); return want === 2 ? solveAs(P, 2).ok : !unknownIn(stand() || [0]) && solveAs(P, want).ok; };
    for (const k of shuffle(sz.map((n, j) => (n ? j : -1)).filter(j => j >= 0), rng)) {         // a whole island back to the sea
      const was = save(), mine = Array.from(isl, (j, y) => (j === k ? y : -1)).filter(y => y >= 0);
      if (lock && mine.some(y => lock.lockLand[y])) continue;                                    // (one with a bridge stays)
      for (const y of mine) isl[y] = -1;
      sz[k] = 0; at[k] = -1;
      if (blocks.some(b => b.every(y => isl[y] < 0)) || !finishes()) back(was);
    }
    for (const x of shuffle(Array.from(isl, (j, y) => (j >= 0 ? y : -1)).filter(y => y >= 0), rng)) {   // then a cell at a time
      const was = save();
      if (take(x) && !finishes()) back(was);
    }
    // Medium wants a board the plain rules can't finish, Hard one the sea rule alone can't: numbers move about in their
    // islands while the level's reasoning still finishes it, until the level below is left with cells undecided
    const below = () => { const st = startOf(P); return propagate(P, st, want >= 2) < 0 ? 1 : unknownIn(st); };
    for (let h = 0; h < HARDEN && want > 0 && !below(); h++) {
      const k = pick(sz.map((n, j) => (n > 1 ? j : -1)).filter(j => j >= 0));
      if (k === undefined) break;
      const was = save();
      at[k] = pick(Array.from(isl, (j, x) => (holds(k, x) && x !== at[k] ? x : -1)).filter(x => x >= 0));
      sync();
      if (!finishes()) back(was);
    }
    sync();
    // bounds and unknown islands: numbers loosened one at a time (an island's "n" to "n+" or "≤n", or to "?") for as long as
    // reasoning at the level still finishes the board, so each bound left is one the puzzle needs. The land count is given.
    if (tw && (tw.ranges || tw.unknown)) {
      let loose = 0, hidden = 0;
      const order = shuffle(Array.from(P.clues), rng);
      for (const x of order) {
        const n = P.clue[x], options = [];
        if (tw.unknown) options.push([0, 3]);
        if (tw.ranges) options.push([n - (rng() < 0.4 ? 1 : 0), 1], [n + (rng() < 0.4 ? 1 : 0), 2]);     // "n+" or "(n-1)+", "≤n" or "≤(n+1)"
        for (const [v, b] of shuffle(options, rng)) {
          if (b !== 3 && v < 2) continue;                                   // (a bound of one cell is no bound)
          P.clue[x] = v; P.bound[x] = b; seat(P);
          if (solveAs(P, want).ok) { if (b === 3) hidden++; else loose++; break; }
          P.clue[x] = n; P.bound[x] = 0; seat(P);
        }
      }
      const few = N <= 6 ? 1 : 2;
      if ((tw.ranges && loose < few) || (tw.unknown && hidden < few)) continue;
    }
    P.grid = gridOf(P);
    const got = gradeOf(P, want);
    if (got < 0) continue;
    const found = { size, grid: P.grid, sol: Array.from(P.sol).join(""), level: ORDER[got] };
    if (tw) {
      if (tw.ranges || tw.unknown) { found.bd = boundsOf(P); found.land = P.total; }
      if (tw.bridges) found.br = bridgesOf(P);
    }
    if (got === want) return found;
    if (!best || Math.abs(got - want) < Math.abs(ORDER.indexOf(best.level) - want)) best = found;
  }
  return best;
}
/**
 * A puzzle of a size and level, the same for the same seed: { size, grid, sol, level } with level what it came to. When
 * no board of the level comes in the tries allowed, the nearest level's is dealt (and, were there none, the seed moved on
 * and the levels tried again), so a puzzle is always dealt.
 */
export function generate(seed, size, level, twist = "none") {
  const tw = twistsOf(twist), want = Math.max(0, ORDER.indexOf(level));
  const order = [want, ...[0, 1, 2].filter(l => l !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b)];
  for (let round = 0; round < 3; round++) for (const lv of order) { const found = build(seed + round * 7919, size, lv, tw); if (found) return found; }
  return null;
}
/** The level a size can be had at that is nearest the one asked for (every level is offered for every size here). */
export const levelOn = (size, level) => (LEVELS[level] ? level : "medium");

// ---------- marks ----------
export const nextMark = m => (m === NONE ? SEA : m === SEA ? LAND : NONE);
export const withMark = (marks, i, m) => marks.slice(0, i) + m + marks.slice(i + 1);
/** The state a player's marks make: sea where shaded, island where dotted or numbered, else unknown. */
export const stateOf = (P, marks) => {
  const st = Int8Array.from(marks, ch => +ch);
  for (const x of P.clues) st[x] = 2;
  if (P.fancy) for (let x = 0; x < P.cells; x++) if (P.bridge[x]) st[x] = 2;
  return st;
};

/** Whether the sea shaded is the answer's (dots are the player's notes and don't count). */
export function solvedBy(P, marks) {
  for (let x = 0; x < P.cells; x++) if ((marks[x] === SEA) !== (P.sol[x] === 1)) return false;
  return true;
}
/**
 * What the marks break, from the rules alone (never the answer): { pool, island, cut, done } with the cells of a 2×2 of
 * sea (a bridge counts as sea), of an island with two numbers or more cells than its number (or than its "≤" bound), and of
 * sea cut off from the rest by islands; and the numbered cells of islands already whole (an exact island with its cells, a
 * bound or unknown one within its bound and walled in).
 */
export function breaks(P, marks) {
  const { cells, ns, blocks, bridge } = P, st = stateOf(P, marks), pool = new Set(), island = new Set(), cut = new Set(), done = [];
  const wet = x => st[x] === 1 || bridge[x] > 0;
  for (const b of blocks) if (b.every(wet)) for (const x of b) pool.add(x);
  for (const c of analyse(P, st).comps) {
    if (c.clues > 1 || (c.clues && c.cells.length > c.hi0)) for (const x of c.cells) island.add(x);
    else if (c.clues === 1 && (c.hi0 === c.lo0 ? c.cells.length === c.hi0 : !c.libs.length && c.cells.length >= c.lo0)) done.push(c.cells.find(x => P.stone[x]));
  }
  // sea in pieces that no unmarked cell could join (every cell round the piece an island), while sea lies elsewhere
  const seen = new Uint8Array(cells), pieces = [];
  for (let x = 0; x < cells; x++) {
    if (!wet(x) || seen[x]) continue;
    const piece = { cells: [], open: false }, todo = [x];
    seen[x] = 1;
    while (todo.length) {
      const y = todo.pop();
      piece.cells.push(y);
      for (const z of ns[y]) {
        if (st[z] === 0) piece.open = true;
        else if (wet(z) && !seen[z]) { seen[z] = 1; todo.push(z); }
      }
    }
    pieces.push(piece);
  }
  if (pieces.length > 1) for (const p of pieces) if (!p.open) for (const x of p.cells) cut.add(x);
  return { pool: [...pool], island: [...island], cut: [...cut], done };
}

// ---------- hints ----------
/**
 * The next thing to tell a player: a mark that is wrong, put right ({ wrong, should }); else the next step a person
 * would take, simplest first ({ step: { set, tech, focus, … } }); else one cell of the answer ({ reveal, should }).
 */
export function hintFor(P, marks) {
  for (let x = 0; x < P.cells; x++) {
    if (fixedAt(P, x)) continue;
    const should = P.sol[x] === 2 ? LAND : SEA;
    if (marks[x] !== NONE && marks[x] !== should) return { wrong: x, should };
  }
  const st = stateOf(P, marks);
  if (propagate(P, st.slice(), true) >= 0) {
    for (const cutting of [false, true]) {
      const rec = {};
      if (sweep(P, st.slice(), cutting, rec) > 0) return { step: rec };
    }
    const r2 = {};
    if (trialStep(P, st, 1, r2) || trialStep(P, st, Infinity, r2)) return { step: r2 };
  }
  const x = st.indexOf(0);
  return x < 0 ? null : { reveal: x, should: P.sol[x] === 2 ? LAND : SEA };
}

