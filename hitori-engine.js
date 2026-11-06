// Cull's rules, pure (no page). A grid of numbers: shade cells so that no number is left twice in a row or a column
// (on a hex board, in any of its three lines), no two shaded cells touch side by side, and the cells left unshaded stay
// joined in one piece. Every puzzle here has exactly one answer, which a counting solver proves, and a solver that
// reasons as a person does grades it by the hardest step it needs; the same solver gives hints, paces the computer
// rival, and checks that in a split board neither half of the numbers is enough alone. tests/hitori.mjs checks it.
//
// A board is its cells, each cell's neighbours, and its lines (rows and columns; on a hex board the three directions),
// each line in order so that cells next to each other in it are neighbours. A puzzle is a board and a number in every
// cell; a state is what is known of each cell: U unknown, B shaded (black), W kept (white).

export const U = 0, B = 1, W = 2;
export const SHAPES = { square: "Square", hex: "Hex" };
/** The sizes offered: a square board's side; a hex board's width across the middle (its numbers run 1 to that). */
export const SIZES = { square: [5, 6, 7, 8, 9, 10, 11, 12], hex: [5, 7, 9, 11] };
export const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
export const LEVEL_LIST = Object.keys(LEVELS);
/**
 * The levels a board offers. On a hex board the connection rule almost never settles anything (a kept cell has six
 * neighbours, so the kept cells are hardly ever at risk of being cut apart), so there is no Medium; and on the widest
 * hex a supposition always breaks within two rounds, so there is no Expert either (measured: README, Cull).
 */
export function levelsFor(shape, size) {
  if (shape !== "hex") return LEVEL_LIST;
  return size >= 11 ? ["easy", "hard"] : ["easy", "hard", "expert"];
}
/** The level a board plays when the one chosen isn't offered on it: the nearest above, else below. */
export function levelOn(shape, size, level) {
  const offered = levelsFor(shape, size);
  if (offered.includes(level)) return level;
  const at = LEVEL_LIST.indexOf(level);
  return offered.find(l => LEVEL_LIST.indexOf(l) > at) || offered[offered.length - 1];
}
/** Today's puzzle, the same for everyone (its seed is today's date). */
export const DAILY = { shape: "square", size: 8, level: "medium" };
const DIGITS = "123456789abcdefghijklmnopqrstuvwxyz";

// ---------- randomness from a seed, the same on every device ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mix = (a, b) => (Math.imul((a >>> 0) ^ 0x9E3779B1, 0x85EBCA6B) ^ Math.imul((b >>> 0) + 1, 0xC2B2AE35)) >>> 0;
function shuffle(xs, rand) {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}

// ---------- boards ----------
const SQ3 = Math.sqrt(3);
const BOARDS = new Map();
/** The board of a shape and size: { shape, size, m (numbers 1..m), cells, xy (centres, for drawing), nbr, lines, dir, linesOf }. */
export function boardOf(shape, size) {
  const key = `${shape}:${size}`;
  let b = BOARDS.get(key);
  if (!b) { b = shape === "hex" ? hexBoard(size) : squareBoard(size); BOARDS.set(key, b); }
  return b;
}
function finish(b) {
  b.linesOf = Array.from({ length: b.cells }, () => []);
  b.lines.forEach((l, k) => l.forEach(i => b.linesOf[i].push(k)));
  return b;
}
function squareBoard(n) {
  const nbr = [], xy = [], lines = [], dir = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c, a = [];
    if (r > 0) a.push(i - n);
    if (c > 0) a.push(i - 1);
    if (c < n - 1) a.push(i + 1);
    if (r < n - 1) a.push(i + n);
    nbr.push(a); xy.push([c, r]);
  }
  for (let r = 0; r < n; r++) { lines.push(Array.from({ length: n }, (_, c) => r * n + c)); dir.push(0); }
  for (let c = 0; c < n; c++) { lines.push(Array.from({ length: n }, (_, r) => r * n + c)); dir.push(1); }
  return finish({ shape: "square", size: n, m: n, cells: n * n, xy, nbr, lines, dir, rc: xy.map(([c, r]) => [r, c]) });
}
/** A hexagon of hexes, `m` across the middle (m odd), in axial coordinates (q, r): rows of constant r, drawn pointy-top. */
function hexBoard(m) {
  const R = (m - 1) / 2, at = new Map(), qr = [];
  for (let r = -R; r <= R; r++) for (let q = Math.max(-R, -r - R); q <= Math.min(R, -r + R); q++) { at.set(`${q},${r}`, qr.length); qr.push([q, r]); }
  const D = [[0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
  const nbr = qr.map(([q, r]) => D.map(([dq, dr]) => at.get(`${q + dq},${r + dr}`)).filter(j => j !== undefined));
  const xy = qr.map(([q, r]) => [SQ3 * (q + r / 2), 1.5 * r]);
  const lines = [], dir = [];
  const group = (key, order, d) => {
    const by = new Map();
    qr.forEach((p, i) => { const k = key(p); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
    for (const k of [...by.keys()].sort((a, b) => a - b)) { lines.push(by.get(k).sort((a, b) => order(qr[a]) - order(qr[b]))); dir.push(d); }
  };
  group(([, r]) => r, ([q]) => q, 0);              // rows, left to right
  group(([q]) => q, ([, r]) => r, 1);              // down to the right
  group(([q, r]) => q + r, ([q]) => q, 2);         // down to the left, read from its top
  return finish({ shape: "hex", size: m, m, cells: qr.length, xy, nbr, lines, dir, qr });
}

// ---------- puzzles ----------
export const encode = vals => Array.from(vals, v => DIGITS[v - 1]).join("");
export const decode = text => Int8Array.from(text, ch => DIGITS.indexOf(ch) + 1);
/** A number as it is shown: 1 to 9, then 10, 11, 12. */
export const showValue = v => String(v);

/**
 * A puzzle from its numbers (a string, one character a cell): the board, the numbers, and for every cell its rivals
 * (the cells in its lines with its number), the pairs (the same number side by side in a line) and the sandwiches (a
 * cell between two of the same number), which every solver here reads. `sol` is its answer, if known ("1" shaded).
 */
export function puzzleOf(shape, size, grid, sol = null) {
  const board = boardOf(shape, size), val = typeof grid === "string" ? decode(grid) : Int8Array.from(grid);
  if (val.length !== board.cells) throw new Error("hitori: a grid of the wrong size");
  const riv = Array.from({ length: board.cells }, () => []), pairs = [], sandwiches = [];
  board.lines.forEach((line, k) => {
    for (let a = 0; a < line.length; a++) for (let b = a + 1; b < line.length; b++) if (val[line[a]] === val[line[b]]) { riv[line[a]].push(line[b]); riv[line[b]].push(line[a]); }
    for (let a = 0; a + 1 < line.length; a++) if (val[line[a]] === val[line[a + 1]]) pairs.push([line[a], line[a + 1], k]);
    for (let a = 0; a + 2 < line.length; a++) if (val[line[a]] === val[line[a + 2]]) sandwiches.push([line[a], line[a + 1], line[a + 2]]);
  });
  const n = board.cells;
  const P = { shape, size, board, val, riv, pairs, sandwiches, grid: encode(val), sol: sol == null ? null : typeof sol === "string" ? Uint8Array.from(sol, ch => (ch === "1" ? 1 : 0)) : Uint8Array.from(sol) };
  P.scratch = { disc: new Int32Array(n), low: new Int32Array(n), par: new Int32Array(n), it: new Int32Array(n), stack: new Int32Array(n), cut: new Uint8Array(n) };
  return P;
}

// ---------- states ----------
/** A state: st (U, B or W for each cell) and nb (for each cell, how many of its rivals are not shaded). */
export function freshState(P) { return { st: new Uint8Array(P.board.cells), nb: Int16Array.from(P.riv, r => r.length) }; }
export const copyState = s => ({ st: s.st.slice(), nb: s.nb.slice() });
/** A state from cell values (U, B, W each). */
export function stateOf(P, st) {
  const s = freshState(P);
  st.forEach((v, i) => { if (v === B) { s.st[i] = B; for (const r of P.riv[i]) s.nb[r]--; } else if (v === W) s.st[i] = W; });
  return s;
}

let why = null;   // the last contradiction found: { kind, cells }
const fail = (kind, ...cells) => { why = { kind, cells }; return false; };

/** Sets cell i to v (and queues it); false if that contradicts what is known. */
function put(P, s, i, v, q) {
  const cur = s.st[i];
  if (cur === v) return true;
  if (cur !== U) return fail("both", i);
  if (v === B && s.nb[i] === 0) return fail("needless", i);    // shaded, with no rival left unshaded: nothing needs it shaded
  s.st[i] = v;
  if (v === B) for (const r of P.riv[i]) s.nb[r]--;
  q?.push(i);
  return true;
}
/** Follows the queued cells' consequences: a shaded cell's neighbours are kept, a kept cell's rivals are shaded, and a
 *  number whose rivals are all shaded is kept. False on a contradiction. */
function drain(P, s, q) {
  const { st, nb } = s, nbr = P.board.nbr, riv = P.riv;
  while (q.length) {
    const i = q.pop();
    if (st[i] === B) {
      for (const j of nbr[i]) { if (st[j] === B) return fail("touch", i, j); if (st[j] === U && !put(P, s, j, W, q)) return false; }
      for (const r of riv[i]) if (nb[r] === 0) { if (st[r] === B) return fail("needless", r); if (st[r] === U && !put(P, s, r, W, q)) return false; }
    } else {
      for (const r of riv[i]) { if (st[r] === W) return fail("twice", i, r); if (st[r] === U && !put(P, s, r, B, q)) return false; }
    }
  }
  return true;
}

/**
 * The unshaded cells as a graph: false if they fall apart (the kept cells could never be joined), else the unknown
 * cells that join two parts of it (shading one would cut it), in P.scratch.cut.
 */
function joints(P, st) {
  const n = P.board.cells, nbr = P.board.nbr, { disc, low, par, it, stack, cut } = P.scratch;
  disc.fill(-1); cut.fill(0);
  let root = -1;
  for (let i = 0; i < n; i++) if (st[i] !== B) { root = i; break; }
  if (root < 0) return true;
  let time = 0, sp = 0, kids = 0;
  disc[root] = low[root] = time++; par[root] = -1; it[root] = 0; stack[sp++] = root;
  while (sp) {
    const v = stack[sp - 1], a = nbr[v];
    if (it[v] < a.length) {
      const w = a[it[v]++];
      if (st[w] === B) continue;
      if (disc[w] < 0) { par[w] = v; disc[w] = low[w] = time++; it[w] = 0; stack[sp++] = w; if (v === root) kids++; }
      else if (w !== par[v] && disc[w] < low[v]) low[v] = disc[w];
    } else {
      sp--;
      const p = par[v];
      if (p >= 0) { if (low[v] < low[p]) low[p] = low[v]; if (p !== root && low[v] >= disc[p]) cut[p] = 1; }
    }
  }
  if (kids > 1) cut[root] = 1;
  for (let i = 0; i < n; i++) if (st[i] !== B && disc[i] < 0) return fail("split", root, i);
  return true;
}
/** Cells that cannot be kept: every neighbour is shaded or a rival (keeping it would shade them all and wall it in). */
function walledIn(P, st, c) {
  const riv = P.riv[c];
  for (const j of P.board.nbr[c]) if (st[j] !== B && !(st[j] === U && riv.includes(j))) return false;
  return true;
}
/** Everything the plain rules and the connection rule force, to a fixed point; false on a contradiction. */
function propagate(P, s, q) {
  for (;;) {
    if (!drain(P, s, q)) return false;
    if (!joints(P, s.st)) return false;
    const { cut } = P.scratch, st = s.st, n = P.board.cells;
    for (let i = 0; i < n; i++) if (st[i] === U && cut[i] && !put(P, s, i, W, q)) return false;
    for (let i = 0; i < n; i++) if (st[i] === U && walledIn(P, st, i) && !put(P, s, i, B, q)) return false;
    if (!q.length) return true;
  }
}
/** What every puzzle starts from: the pairs' and sandwiches' cells, and numbers with no rival at all. */
function opening(P, s, q) {
  const { st } = s, val = P.val, lines = P.board.lines;
  for (let i = 0; i < P.board.cells; i++) if (P.riv[i].length === 0 && !put(P, s, i, W, q)) return false;
  for (const [a, b, k] of P.pairs) for (const x of lines[k]) if (x !== a && x !== b && val[x] === val[a] && !put(P, s, x, B, q)) return false;
  for (const [, mid] of P.sandwiches) if (!put(P, s, mid, W, q)) return false;
  return st.length > 0;
}

// ---------- counting the answers ----------
/**
 * Every answer of the puzzle, up to `limit`: [Uint8Array (1 shaded)]. It counts the answers in which every shaded cell
 * has a rival left unshaded (one that doesn't could simply be unshaded, which is a second answer); the generator's
 * shading is also maximal (no cell could be shaded on top of it), and together the two prove an answer that is unique
 * among all shadings (tests/hitori.mjs checks that against a plain search on small boards).
 */
export function solutions(P, limit = 2) {
  const s = freshState(P), q = [], out = [];
  if (!opening(P, s, q) || !propagate(P, s, q)) return out;
  const n = P.board.cells;
  (function dfs(s) {
    let pick = -1, most = -1;
    for (let i = 0; i < n; i++) if (s.st[i] === U && s.nb[i] > most) { most = s.nb[i]; pick = i; }
    if (pick < 0) { out.push(Uint8Array.from(s.st, v => (v === B ? 1 : 0))); return; }
    for (const v of [B, W]) {
      const t = copyState(s), q2 = [];
      if (put(P, t, pick, v, q2) && propagate(P, t, q2)) dfs(t);
      if (out.length >= limit) return;
    }
  })(s);
  return out;
}
/** Whether a shading keeps every rule: no rival pair unshaded, no two shaded side by side, the unshaded in one piece. */
export function obeys(P, shaded) {
  const n = P.board.cells, st = Uint8Array.from(shaded, v => (v ? B : W));
  for (let i = 0; i < n; i++) {
    if (st[i] === B) { if (P.board.nbr[i].some(j => st[j] === B)) return false; }
    else if (P.riv[i].some(j => st[j] === W)) return false;
  }
  return joints(P, st);
}
/** Whether no unshaded cell could be shaded on top of a shading (none is free of shaded neighbours and not a joint). */
export function maximal(P, shaded) {
  const st = Uint8Array.from(shaded, v => (v ? B : U));
  joints(P, st);
  const { cut } = P.scratch;
  for (let i = 0; i < P.board.cells; i++) if (st[i] === U && !cut[i] && !P.board.nbr[i].some(j => st[j] === B)) return false;
  return true;
}

// ---------- reasoning as a person does ----------
// Each step is one thing seen on the board and what it settles: { tech, tier, set: [[cell, B or W]…], why: [cells] }.
// Tier 1 (Easy): beside a shaded cell; a kept cell's rivals; a pair side by side; a sandwich; a number alone. Tier 2
// (Medium): the connection rule (a cell joining two parts of the board is kept; one that would be walled in if kept
// is shaded). Tier 3 (Hard and Expert): a trial, a cell supposed one way and followed until it breaks a rule; how
// many rounds of consequences that takes is its depth, and Expert is a puzzle needing a deep one.
export const TECHS = {
  beside: { tier: 1, name: "Beside a shaded cell" },
  rival: { tier: 1, name: "A kept number's rivals" },
  pair: { tier: 1, name: "A pair side by side" },
  sandwich: { tier: 1, name: "A sandwich" },
  lone: { tier: 1, name: "A number alone" },
  cut: { tier: 2, name: "Keeping the board joined" },
  walled: { tier: 2, name: "Walled in" },
  trial: { tier: 3, name: "A trial" },
};
const step = (tech, set, why, more = {}) => ({ tech, tier: TECHS[tech].tier, set, why, ...more });

/** The next step a person would take from state s (the simplest there is), or null if none up to maxTier; `ways`:
 *  a trial also says how many suppositions break as soon (slower). */
export function nextStep(P, s, maxTier = 3, ways = false) {
  const { st, nb } = s, n = P.board.cells, nbr = P.board.nbr, riv = P.riv, val = P.val;
  for (let i = 0; i < n; i++) if (st[i] === B) {
    const set = nbr[i].filter(j => st[j] === U);
    if (set.length) return step("beside", set.map(j => [j, W]), [i]);
  }
  for (let i = 0; i < n; i++) if (st[i] === W) {
    const set = riv[i].filter(j => st[j] === U);
    if (set.length) return step("rival", set.map(j => [j, B]), [i]);
  }
  for (const [a, b, k] of P.pairs) {
    const set = P.board.lines[k].filter(x => x !== a && x !== b && val[x] === val[a] && st[x] === U);
    if (set.length) return step("pair", set.map(x => [x, B]), [a, b]);
  }
  for (const [a, mid, c] of P.sandwiches) if (st[mid] === U) return step("sandwich", [[mid, W]], [a, c]);
  const alone = [];
  for (let i = 0; i < n; i++) if (st[i] === U && nb[i] === 0) alone.push([i, W]);
  if (alone.length) return step("lone", alone, alone.map(([i]) => i));
  if (maxTier < 2) return null;
  if (!joints(P, st)) return null;
  const { cut } = P.scratch;
  for (let i = 0; i < n; i++) if (st[i] === U && cut[i]) return step("cut", [[i, W]], [i]);
  for (let i = 0; i < n; i++) if (st[i] === U && walledIn(P, st, i)) return step("walled", [[i, B]], nbr[i].filter(j => st[j] !== B));
  if (maxTier < 3) return null;
  return trial(P, s, ways);
}

/**
 * The shallowest trial on the board: the cell and the way it can't go, the consequences that break, and how deep. With
 * `ways`, also how many suppositions (of all there were to try) break that soon, the fewer the harder the step is to
 * find; without, the search stops at the first that breaks at once, which is all the generator needs.
 */
function trial(P, s, ways = false, cap = 40) {
  let best = null, count = 0, tried = 0;
  const n = P.board.cells;
  search: for (let i = 0; i < n; i++) {
    if (s.st[i] !== U) continue;
    for (const v of [B, W]) {
      tried++;
      const r = trialDepth(P, s, i, v, best ? best.depth - (ways ? 0 : 1) : cap);
      if (!r) continue;
      if (!best || r.depth < best.depth) { best = { cell: i, v, ...r }; count = 1; }
      else count++;
      if (!ways && best.depth === 1) break search;
    }
  }
  if (!best) return null;
  return step("trial", [[best.cell, best.v === B ? W : B]], best.cells, { depth: best.depth, supposed: best.v, kind: best.kind, ...(ways ? { ways: count, tried } : {}) });
}
/**
 * Cell c supposed v, its consequences followed a round at a time (each round everything the last one forces, then the
 * connection rule): { depth (rounds until a rule broke), kind, cells (where) }, or null if nothing broke within cap.
 */
function trialDepth(P, s0, c, v, cap) {
  if (cap < 1) return null;
  // one scratch state per puzzle, copied into: a trial is tried for every open cell, both ways, at every stuck point
  const s = P.scratch.trial ||= { st: new Uint8Array(P.board.cells), nb: new Int16Array(P.board.cells) };
  s.st.set(s0.st); s.nb.set(s0.nb);
  const { st, nb } = s, nbr = P.board.nbr, riv = P.riv, n = P.board.cells;
  if (!put(P, s, c, v, null)) return { depth: 1, ...why };
  let frontier = [c], shaded = v === B;
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const i of frontier) {
      if (st[i] === B) {
        for (const j of nbr[i]) { if (st[j] === B) return { depth: d, kind: "touch", cells: [i, j] }; if (st[j] === U) { put(P, s, j, W, null); next.push(j); } }
        for (const r of riv[i]) if (nb[r] === 0) { if (st[r] === B) return { depth: d, kind: "needless", cells: [r] }; if (st[r] === U) { put(P, s, r, W, null); next.push(r); } }
      } else {
        for (const r of riv[i]) {
          if (st[r] === W) return { depth: d, kind: "twice", cells: [i, r] };
          if (st[r] === U) { if (!put(P, s, r, B, null)) return { depth: d, ...why }; next.push(r); shaded = true; }
        }
      }
    }
    // only new shading can cut the board or wall a cell in
    if (shaded) {
      shaded = false;
      if (!joints(P, st)) return { depth: d, ...why };
      const { cut } = P.scratch;
      for (let i = 0; i < n; i++) if (st[i] === U && cut[i]) { put(P, s, i, W, null); next.push(i); }
      for (let i = 0; i < n; i++) if (st[i] === U && walledIn(P, st, i)) { if (!put(P, s, i, B, null)) return { depth: d, ...why }; next.push(i); shaded = true; }
    }
    if (!next.length) return null;
    frontier = next;
  }
  return null;
}

/** Applies a step's cells to a state (no consequences: those are steps of their own). */
export function apply(P, s, st) { for (const [i, v] of st.set) put(P, s, i, v, null); return s; }

/**
 * The puzzle solved as a person would, simplest step first: { solved, steps, tier (the hardest step), depth (the
 * deepest trial), trials (how many), level }. A puzzle a trial can't finish (it would need guessing deeper) is not solved.
 */
export function grade(P, { maxTier = 3, ways = false } = {}) {
  const s = freshState(P), steps = [];
  let tier = 0, depth = 0, trials = 0, cuts = 0, narrow = Infinity;
  for (;;) {
    const x = nextStep(P, s, maxTier, ways);
    if (!x) break;
    apply(P, s, x);
    steps.push(x);
    if (x.tier > tier) tier = x.tier;
    if (x.tier === 2) cuts++;
    if (x.tech === "trial") {
      trials++;
      const w = x.ways ?? Infinity;
      if (x.depth > depth) { depth = x.depth; narrow = w; }
      else if (x.depth === depth && w < narrow) narrow = w;
    }
  }
  const solved = !s.st.includes(U);
  return { solved, steps, tier, depth, trials, cuts, narrow: Number.isFinite(narrow) ? narrow : null, level: solved ? levelOf(tier, depth, trials) : null, state: s };
}
/** The level a grading comes to. */
export function levelOf(tier, depth, trials) {
  if (tier <= 1) return "easy";
  if (tier === 2) return "medium";
  return depth >= EXPERT_DEPTH ? "expert" : "hard";
}
export const EXPERT_DEPTH = 3;

// ---------- making a puzzle ----------
/** A shading: every cell in random order shaded if it touches no shaded cell and leaves the rest joined, so it is maximal. */
function shadingOf(board, rand) {
  const n = board.cells, st = new Uint8Array(n), order = shuffle([...Array(n).keys()], rand);
  const seen = new Int32Array(n), queue = new Int32Array(n);
  let mark = 0;
  const joinedWithout = c => {
    // the unshaded neighbours of c stay joined once c is shaded: a search from one of them reaches the others
    const open = board.nbr[c].filter(j => st[j] === 0);
    if (open.length <= 1) return true;
    mark++;
    seen[c] = mark;
    let h = 0, t = 0, found = 1;
    queue[t++] = open[0]; seen[open[0]] = mark;
    const want = new Set(open.slice(1));
    while (h < t) {
      const v = queue[h++];
      for (const w of board.nbr[v]) {
        if (st[w] === 1 || seen[w] === mark) continue;
        seen[w] = mark;
        if (want.has(w) && ++found === open.length) return true;
        queue[t++] = w;
      }
    }
    return false;
  };
  for (const c of order) if (!board.nbr[c].some(j => st[j] === 1) && joinedWithout(c)) st[c] = 1;
  return st;
}
/** Numbers for the kept cells, none twice in a line: the cell with the fewest choices first, at random among equals. */
function fillKept(board, shaded, rand) {
  const n = board.cells, m = board.m, cells = [...Array(n).keys()].filter(i => !shaded[i]);
  for (let attempt = 0; attempt < 30; attempt++) {
    const val = new Int8Array(n), used = board.lines.map(() => new Uint8Array(m + 1));
    let budget = 4000;
    const free = i => { let k = 0; for (let v = 1; v <= m; v++) if (board.linesOf[i].every(L => !used[L][v])) k++; return k; };
    const order = [];
    const go = () => {
      if (--budget < 0) return false;
      let pick = -1, fewest = Infinity;
      for (const i of cells) if (!val[i]) { const f = free(i); if (f < fewest || (f === fewest && rand() < 0.5)) { fewest = f; pick = i; } }
      if (pick < 0) return true;
      if (!fewest) return false;
      const vs = shuffle(Array.from({ length: m }, (_, k) => k + 1), rand).filter(v => board.linesOf[pick].every(L => !used[L][v]));
      for (const v of vs) {
        val[pick] = v; for (const L of board.linesOf[pick]) used[L][v] = 1; order.push(pick);
        if (go()) return true;
        val[pick] = 0; for (const L of board.linesOf[pick]) used[L][v] = 0; order.pop();
        if (budget < 0) return false;
      }
      return false;
    };
    if (go()) return val;
  }
  return null;
}
/** What a shaded cell's number may be: a kept number in one of its lines, each with how near it lies. */
function choicesFor(board, shaded, val, b) {
  const out = [];
  for (const k of board.linesOf[b]) {
    const line = board.lines[k], at = line.indexOf(b);
    line.forEach((x, j) => { if (!shaded[x]) out.push({ v: val[x], cell: x, gap: Math.abs(j - at) }); });
  }
  return out;
}
/** The shaded cells' numbers: each a rival of a kept cell (else it needn't be shaded), near or far by the level. */
function numberShaded(board, shaded, val, rand, near) {
  for (let b = 0; b < board.cells; b++) {
    if (!shaded[b]) continue;
    const ch = choicesFor(board, shaded, val, b);
    const weight = c => (near ? (c.gap === 1 ? 6 : c.gap === 2 ? 3 : 1) : (c.gap <= 2 ? 0.15 : 1));
    let total = 0;
    for (const c of ch) total += weight(c);
    let x = rand() * total;
    for (const c of ch) { x -= weight(c); if (x <= 0) { val[b] = c.v; break; } }
    if (!val[b]) val[b] = ch[ch.length - 1].v;
  }
}
/**
 * Breaks a second answer: a cell shaded in ours but kept in the other takes the number of a cell kept in both, in one
 * of its lines, so the other answer has a number twice. True if one was found.
 */
function breakOther(board, shaded, val, other, rand) {
  const cands = shuffle([...Array(board.cells).keys()].filter(b => shaded[b] && !other[b]), rand);
  for (const b of cands) {
    const ks = [];
    for (const k of board.linesOf[b]) for (const x of board.lines[k]) if (!shaded[x] && !other[x]) ks.push(x);
    if (!ks.length) continue;
    val[b] = val[ks[Math.floor(rand() * ks.length)]];
    return true;
  }
  return false;
}

/** How a level is made: the numbers of shaded cells near their rivals (more pairs and sandwiches) or far from them. */
const RECIPES = { easy: { near: true }, medium: { near: true }, hard: { near: false }, expert: { near: false } };
export const TRIES = 40, STEERS = 60;

/**
 * How close a grading is to the level wanted: the levels apart first, then how hard it is within its level (its hardest
 * step, the deepest trial, how many trials and connections), for a puzzle short of the level the harder the closer,
 * for one past it the easier.
 */
function closeness(g, want) {
  const at = LEVEL_LIST.indexOf(g.level);
  const hard = g.tier * 100 + g.depth * 40 + Math.min(g.trials, 10) * 2 + Math.min(g.cuts, 10);
  return -Math.abs(at - want) * 1000 + (at < want ? hard : at > want ? -hard : 0);
}
/** A unique puzzle for these shaded cells, mending the numbers until there is one answer; null if it won't come. */
function uniqueOf(shape, size, board, shaded, val, rand) {
  for (let fix = 0; fix < 40; fix++) {
    const P = puzzleOf(shape, size, val), sols = solutions(P, 2);
    if (sols.length === 1) { P.sol = Uint8Array.from(shaded); return P; }
    const other = sols.find(x => x.some((v, i) => v !== shaded[i]));
    if (!other || !breakOther(board, shaded, val, other, rand)) return null;
  }
  return null;
}

/**
 * A puzzle for a seed: { shape, size, level (what it came to), wanted (what was asked), grid, sol, steps, tier, depth,
 * trials }. The same seed, shape, size and level give the same puzzle on every device (only the seed's randomness, and
 * a fixed number of tries, never a clock). A try shades a board, numbers it and mends it to one answer, then steers it:
 * a shaded cell's number changed to another of its kept rivals', kept when the puzzle stays unique and grades nearer
 * the level asked. The first to reach the level is taken; else the nearest of them all.
 */
export function generate(seed, shape = "square", size = 8, level = "medium") {
  const board = boardOf(shape, size), want = Math.max(0, LEVEL_LIST.indexOf(level)), recipe = RECIPES[LEVEL_LIST[want]];
  let best = null, bestScore = -Infinity;
  const consider = (P, g, t, steers) => {
    const score = closeness(g, want);
    if (score > bestScore) {
      bestScore = score;
      best = { shape, size, level: g.level, wanted: LEVEL_LIST[want], grid: P.grid, sol: Array.from(P.sol).join(""), tier: g.tier, depth: g.depth, trials: g.trials, steps: g.steps.length, tries: t + 1, steers };
    }
    return g.level === LEVEL_LIST[want];
  };
  for (let t = 0; t < TRIES; t++) {
    const rand = rng(mix(seed, t * 7919 + want));
    const shaded = shadingOf(board, rand);
    const val = fillKept(board, shaded, rand);
    if (!val) continue;
    numberShaded(board, shaded, val, rand, recipe.near);
    let P = uniqueOf(shape, size, board, shaded, val, rand);
    if (!P) continue;
    let g = grade(P);
    if (!g.solved) continue;
    if (consider(P, g, t, 0)) return best;
    // steer: one shaded cell's number at a time
    const blacks = [...Array(board.cells).keys()].filter(i => shaded[i]);
    let here = closeness(g, want);
    for (let k = 0; k < STEERS; k++) {
      const b = blacks[Math.floor(rand() * blacks.length)], ch = choicesFor(board, shaded, P.val, b).filter(c => c.v !== P.val[b]);
      if (!ch.length) continue;
      const v = ch[Math.floor(rand() * ch.length)].v, next = Int8Array.from(P.val);
      next[b] = v;
      const Q = puzzleOf(shape, size, next);
      if (solutions(Q, 2).length !== 1) continue;
      Q.sol = P.sol;
      const h = grade(Q);
      if (!h.solved) continue;
      const score = closeness(h, want);
      if (score < here) continue;
      P = Q; g = h; here = score;
      if (consider(P, g, t, k + 1)) return best;
    }
  }
  return best;
}

// ---------- a puzzle in play ----------
// The marks a player makes are a string, a character a cell: "." unmarked, "#" shaded, "o" kept (circled). Only the
// shading counts: the puzzle is solved the moment exactly the answer's cells are shaded; kept marks are notes.
export const NONE = ".", SHADE = "#", KEEP = "o";
export const emptyMarks = P => NONE.repeat(P.board.cells);
/** A tap's next mark: unmarked, shaded, kept, unmarked again. */
export const nextMark = m => (m === NONE ? SHADE : m === SHADE ? KEEP : NONE);
export const withMark = (marks, i, m) => marks.slice(0, i) + m + marks.slice(i + 1);
export function solvedBy(P, marks) {
  for (let i = 0; i < P.board.cells; i++) if ((marks[i] === SHADE) !== (P.sol[i] === 1)) return false;
  return true;
}
/**
 * The rules the marks break, for the board to show: shaded cells side by side (touch), a number kept twice in one line
 * (twice), and unshaded cells cut off from the rest (cut: every part but the largest). They follow from the rules
 * alone, never from the answer.
 */
export function breaks(P, marks) {
  const n = P.board.cells, nbr = P.board.nbr, touch = [], twice = [], cut = [];
  for (let i = 0; i < n; i++) {
    if (marks[i] === SHADE && nbr[i].some(j => marks[j] === SHADE)) touch.push(i);
    if (marks[i] === KEEP && P.riv[i].some(j => marks[j] === KEEP)) twice.push(i);
  }
  const part = new Int32Array(n).fill(-1), sizes = [];
  for (let i = 0; i < n; i++) {
    if (marks[i] === SHADE || part[i] >= 0) continue;
    const k = sizes.length, stack = [i];
    part[i] = k; let size = 0;
    while (stack.length) { const v = stack.pop(); size++; for (const w of nbr[v]) if (marks[w] !== SHADE && part[w] < 0) { part[w] = k; stack.push(w); } }
    sizes.push(size);
  }
  if (sizes.length > 1) {
    const main = sizes.indexOf(Math.max(...sizes));
    for (let i = 0; i < n; i++) if (part[i] >= 0 && part[i] !== main) cut.push(i);
  }
  return { touch, twice, cut, any: touch.length + twice.length + cut.length > 0 };
}
const stOfMarks = marks => Array.from(marks, m => (m === SHADE ? B : m === KEEP ? W : U));
/**
 * A hint for the marks as they stand: a wrong mark first ({ wrong, should }: the cell, and the mark it should have),
 * else the step a person would take next from the marks ({ step }), else a cell of the answer ({ reveal, should }).
 */
export function hintFor(P, marks) {
  for (let i = 0; i < P.board.cells; i++) {
    if (marks[i] === SHADE && !P.sol[i]) return { wrong: i, should: KEEP };
    if (marks[i] === KEEP && P.sol[i]) return { wrong: i, should: SHADE };
  }
  const x = nextStep(P, stateOf(P, stOfMarks(marks)), 3, true);
  if (x) return { step: x };
  for (let i = 0; i < P.board.cells; i++) if (P.sol[i] && marks[i] !== SHADE) return { reveal: i, should: SHADE };
  return null;
}

// ---------- the split board: each of two players sees half the numbers ----------
/**
 * Who sees a cell's number on a split board, 0 or 1: the first seat the top half (and the left of a middle row), the
 * second the rest. Each then has rows of their own to work, and every column (on a hex board, two of the three
 * directions) needs both of them. A chessboard split was tried first: alone, a player could settle almost nothing, so
 * one of them only read numbers out to the other.
 */
export function ownerOf(board, i) {
  const half = (board.cells - 1) / 2;   // reading order, the middle cell (an odd count) to the first seat
  return i <= Math.floor(half) ? 0 : 1;
}
/**
 * What a player can settle alone, seeing only the numbers of the cells `sees` marks: every rule they can apply (with
 * `trials`, suppositions too), a hidden number never counted as a rival and a number never taken to be alone while a cell
 * of its lines is hidden and unshaded. Returns the state reached (U where it stays open).
 */
export function aloneSettles(P, sees, { trials = true } = {}) {
  const n = P.board.cells, nbr = P.board.nbr, lines = P.board.lines, val = P.val;
  const riv = P.riv.map((r, i) => (sees[i] ? r.filter(j => sees[j]) : []));
  const hiddenIn = Array.from({ length: n }, (_, i) => [...new Set(P.board.linesOf[i].flatMap(k => lines[k]))].filter(j => j !== i && !sees[j]));
  // a number alone: seen, every seen rival shaded, every hidden cell of its lines shaded
  const alone = (st, i) => sees[i] && riv[i].every(j => st[j] === B) && hiddenIn[i].every(j => st[j] === B);
  const settle = st => {
    for (let changed = true; changed;) {
      changed = false;
      const set = (i, v) => { if (st[i] === v) return true; if (st[i] !== U) return false; st[i] = v; changed = true; return true; };
      for (let i = 0; i < n; i++) {
        if (st[i] === B) {
          for (const j of nbr[i]) if (!set(j, W)) return false;
          if (alone(st, i)) return false;                                  // shaded with nothing left to need it
        } else if (st[i] === W) for (const j of riv[i]) if (!set(j, B)) return false;
        else if (alone(st, i) && !set(i, W)) return false;
      }
      for (const [a, b, k] of P.pairs) if (sees[a] && sees[b]) for (const x of lines[k]) if (x !== a && x !== b && sees[x] && val[x] === val[a] && !set(x, B)) return false;
      for (const [a, mid, c] of P.sandwiches) if (sees[a] && sees[c] && !set(mid, W)) return false;
      if (!joints(P, st)) return false;
      const cut = P.scratch.cut.slice();
      for (let i = 0; i < n; i++) if (st[i] === U && cut[i] && !set(i, W)) return false;
      for (let i = 0; i < n; i++) if (st[i] === U && nbr[i].every(j => st[j] === B || (st[j] === U && riv[i].includes(j))) && !set(i, B)) return false;
    }
    return true;
  };
  let st = new Uint8Array(n);
  settle(st);
  for (let progress = trials; progress && st.includes(U);) {
    progress = false;
    for (let i = 0; i < n && !progress; i++) {
      if (st[i] !== U) continue;
      for (const v of [B, W]) {
        const t = st.slice();
        t[i] = v;
        if (!settle(t)) { st[i] = v === B ? W : B; settle(st); progress = true; break; }
      }
    }
  }
  return st;
}
