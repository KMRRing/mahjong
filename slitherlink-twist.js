// Portolan's twists and the hex board, pure (no page): RANGES (a number may be only a bound, "2+" at least or "≤1" at most),
// TUNNELS (marked dots of a square board where the loop crosses itself, straight through) and the HEX board (a honeycomb: the loop
// runs along hex edges, a hex shows 0 to 6, every vertex has two lines or none). The plain square game stays slitherlink-engine.js's
// own code and its seeds make the puzzles they always did; a puzzle with any of these is made and played here, and the engine hands
// it over. Same proof of uniqueness: the generator only keeps clues a solver of the level can finish from by forced steps.
//
// How a tunnel is reasoned about. A tunnel dot is split into two nodes, one for the loop going across it (its left and right edges)
// and one for the loop going up and down (its top and bottom edges); every other rule then runs on that graph unchanged: a node has
// two lines or none, and the four edges of a tunnel are lines from the start. What changes is the loop rule: a path that comes out of
// a tunnel on the far side is not the same strand as the one that went in on the other axis, so a line that looks as if it closes
// a loop on the flat board may only cross a tunnel and carry on (and one that looks harmless may close the loop early).
//
// A honeycomb vertex has three edges, so a loop can never cross itself there: a hex board has no tunnels.
import { LINE, CROSS, TRIAL_ROUNDS, geometry, vertexRule, note, loopSolver, rngOf, shuffle, randomLoop } from "./loop-engine.js";

export const HEX_SIZES = [5, 7, 9];                     // hexagons across a hexagon of hexagons (19, 37 and 61 cells)
export const ORDER = ["easy", "medium", "hard"];
const TRIES = 8;
const SQ3 = Math.sqrt(3);

/** The twists a name holds: "none", "ranges", "tunnels" or "ranges+tunnels" ("shade" is the engine's own). */
export const TWIST_NAMES = { none: "Classic", ranges: "Ranges", tunnels: "Tunnels", "ranges+tunnels": "Ranges + Tunnels" };
export const flagsOf = t => ({ ranges: /ranges/.test(t || ""), tunnels: /tunnels/.test(t || "") });
export const twistOn = (t, shape = "square") => {
  const f = flagsOf(t), tunnels = f.tunnels && shape !== "hex";
  return f.ranges && tunnels ? "ranges+tunnels" : f.ranges ? "ranges" : tunnels ? "tunnels" : "none";
};

// ---------- the boards ----------
const BOARDS = new Map();
/**
 * A board as a graph. Square: `size`×`size` cells, edges numbered as the plain game has them (the horizontal ones first, then the
 * vertical), `tun` the dots (row*(size+1)+col) that are tunnels. Hex: `size` hexagons across. Fields: cells, E, V (nodes: a
 * tunnel's dot is two), ea/eb (an edge's two nodes), vedges (a node's edges), cedges (a cell's edges), ecells (an edge's cells),
 * forced (the edges that are lines from the start: a tunnel's four), and for drawing pos (a node's place), epos (an edge's two
 * ends), cpos (a cell's middle), cpoly (a hex's six corners), dots (the places dots are drawn), box (the board's extent).
 */
export function boardOf(shape, size, tun = []) {
  const key = `${shape}${size}:${tun.join(",")}`;
  if (BOARDS.has(key)) return BOARDS.get(key);
  const g = shape === "hex" ? hexBoard(size) : squareBoard(size, tun);
  BOARDS.set(key, g);
  return g;
}
function finish(g) {
  g.vedges = Array.from({ length: g.V }, () => []);
  for (let e = 0; e < g.E; e++) { g.vedges[g.ea[e]].push(e); g.vedges[g.eb[e]].push(e); }
  g.epos = Array.from({ length: g.E }, (_, e) => [...g.pos[g.ea[e]], ...g.pos[g.eb[e]]]);
  return g;
}
function squareBoard(size, tun) {
  const base = geometry(size, size), { R, C, H, E, V: V0, cells } = base, W = C + 1;
  const ea = Int16Array.from(base.ea), eb = Int16Array.from(base.eb), pos = [], forced = [], vert = new Map();
  for (let v = 0; v < V0; v++) pos.push([v % W, Math.floor(v / W)]);
  tun.forEach((v, i) => { vert.set(v, V0 + i); pos.push([v % W, Math.floor(v / W)]); });
  for (let e = H; e < E; e++) {                               // a tunnel's vertical edges meet its second node
    if (vert.has(ea[e])) ea[e] = vert.get(ea[e]);
    if (vert.has(eb[e])) eb[e] = vert.get(eb[e]);
  }
  const isT = new Set(tun);
  for (let e = 0; e < E; e++) if (isT.has(base.ea[e]) || isT.has(base.eb[e])) forced.push(e);
  const cedges = Array.from({ length: cells }, (_, k) => [base.ce[k * 4], base.ce[k * 4 + 1], base.ce[k * 4 + 2], base.ce[k * 4 + 3]]);
  const cpos = Array.from({ length: cells }, (_, k) => [k % C + 0.5, Math.floor(k / C) + 0.5]);
  const dotOf = Array.from({ length: V0 + tun.length }, (_, x) => (x < V0 ? x : tun[x - V0]));
  return finish({ shape: "square", size, R, C, H, E, V: V0 + tun.length, cells, ea, eb, ecells: base.ecells, cedges, forced, tun, pos, cpos, dotOf, dots: pos.slice(0, V0), box: [0, 0, C, R] });
}
function hexBoard(m) {
  const rho = (m - 1) / 2, cp = [], at = new Map(), pos = [], ea = [], eb = [], ecells = [], cedges = [], cpoly = [], ek = new Map();
  for (let r = -rho; r <= rho; r++) for (let q = Math.max(-rho, -rho - r); q <= Math.min(rho, rho - r); q++) cp.push([SQ3 * (q + r / 2), 1.5 * r]);
  const node = (x, y) => {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    if (!at.has(key)) { at.set(key, pos.length); pos.push([x, y]); }
    return at.get(key);
  };
  cp.forEach(([cx, cy], k) => {
    const ring = Array.from({ length: 6 }, (_, j) => { const a = Math.PI / 6 + (Math.PI / 3) * j; return node(cx + Math.cos(a), cy + Math.sin(a)); });
    cpoly.push(ring.map(v => pos[v]));
    cedges.push(ring.map((a, j) => {
      const b = ring[(j + 1) % 6], key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!ek.has(key)) { ek.set(key, ea.length); ea.push(a); eb.push(b); ecells.push([]); }
      const e = ek.get(key);
      ecells[e].push(k);
      return e;
    }));
  });
  const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
  const g = { shape: "hex", size: m, E: ea.length, V: pos.length, cells: cp.length, ea: Int16Array.from(ea), eb: Int16Array.from(eb), ecells, cedges, forced: [], tun: [], pos, cpos: cp, cpoly, dotOf: pos.map((_, i) => i), dots: pos, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  return finish(g);
}

// ---------- the clues ----------
// A cell's clue is its lowest and highest number of lines (lo = hi for a plain number, lo -1 for none). In a puzzle's grid string one
// character a cell: a digit (0 to 6) is that number, "-" none, "a" to "e" is 1+ to 5+ (at least), "p" to "t" is ≤1 to ≤5 (at most).
// `code` is what the page draws: 0 to 6 the number, 10+n for "n+", 20+n for "≤n", -1 none.
export function clueOf(g, grid) {
  const n = g.cells, lo = new Int8Array(n), hi = new Int8Array(n), code = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const ch = grid[k], deg = g.cedges[k].length;
    if (ch === "-") { lo[k] = hi[k] = code[k] = -1; }
    else if (ch >= "a" && ch <= "e") { lo[k] = ch.charCodeAt(0) - 96; hi[k] = deg; code[k] = 10 + lo[k]; }
    else if (ch >= "p" && ch <= "t") { lo[k] = 0; hi[k] = ch.charCodeAt(0) - 111; code[k] = 20 + hi[k]; }
    else { lo[k] = hi[k] = code[k] = +ch; }
  }
  return { lo, hi, code };
}
const gridOf = (lo, hi, deg) => Array.from(lo, (l, k) => (l < 0 ? "-" : l === hi[k] ? String(l) : l === 0 ? String.fromCharCode(111 + hi[k]) : String.fromCharCode(96 + l))).join("");
/** A clue as printed: "3", "2+", "≤1", or "" for none. */
export const labelOf = code => (code < 0 ? "" : code >= 20 ? `≤${code - 20}` : code >= 10 ? `${code - 10}+` : String(code));

/** A puzzle from its grid and, if known, its answer (marks). `spec`: { shape, tun } with tun a list of dots or "12,40". */
export function puzzleOf(size, grid, sol = null, spec = {}) {
  const shape = spec.shape === "hex" ? "hex" : "square";
  const tun = (Array.isArray(spec.tun) ? spec.tun : String(spec.tun || "").split(",").filter(Boolean).map(Number)).filter(Number.isInteger);
  const g = boardOf(shape, size, shape === "hex" ? [] : tun), X = clueOf(g, grid);
  const locked = new Uint8Array(g.E);
  for (const e of g.forced) locked[e] = 1;
  return { twisted: true, shape, size, g, view: g, grid, shaded: false, clue: X.code, X, tun: g.tun, locked, sol: sol && Uint8Array.from(sol, ch => (ch === LINE ? 1 : 0)), solMarks: sol };
}
/** The marks a puzzle starts with: nothing, but a tunnel's four edges are lines. */
export const startMarks = P => Array.from(P.locked, x => (x ? LINE : "0")).join("");
/** Whether a grid string fits a board of this shape and size. */
export const fits = (shape, size, grid) => typeof grid === "string" && (shape === "hex" ? HEX_SIZES.includes(size) && grid.length === boardOf("hex", size).cells : grid.length === size * size);

// ---------- the rules, as a solver follows them ----------
/** One sweep: a tunnel's edges are lines; a number or bound is met (-1 on a contradiction, 1 if it settled something, else 0); then the corner rule. */
function sweep(g, X, st, rec) {
  const { lo, hi } = X;
  let changed = 0;
  for (const e of g.forced) {
    if (st[e] === 2) return -1;
    if (st[e] === 0) { st[e] = 1; changed = 1; if (rec) { note(rec, e, 1); rec.tech = "tunnel"; rec.vertex = g.ea[e]; return 1; } }
  }
  for (let k = 0; k < g.cells; k++) {
    if (lo[k] < 0) continue;
    const es = g.cedges[k];
    let l = 0, u = 0;
    for (const e of es) { const s = st[e]; if (s === 1) l++; else if (s === 0) u++; }
    if (l > hi[k] || l + u < lo[k]) return -1;
    if (u && (l === hi[k] || l + u === lo[k])) {
      const v = l === hi[k] ? 2 : 1, bound = lo[k] !== hi[k];
      for (const e of es) if (st[e] === 0) { st[e] = v; if (rec) note(rec, e, v); }
      if (rec) { rec.tech = v === 2 ? (bound ? "most" : "full") : (bound ? "least" : "short"); rec.cell = k; return 1; }
      changed = 1;
    }
  }
  const v = vertexRule(g, st, rec);
  if (v < 0) return -1;
  return changed || v ? 1 : 0;
}
/** Whether the lines drawn with edge `e` added meet every number and bound. */
function closes(g, X, st, e) {
  for (let k = 0; k < g.cells; k++) {
    if (X.lo[k] < 0) continue;
    let l = 0;
    for (const f of g.cedges[k]) if (st[f] === 1 || f === e) l++;
    if (l < X.lo[k] || l > X.hi[k]) return false;
  }
  return true;
}
const S = loopSolver({ sweep, closes });
export const { loopRule, propagate, trialStep, solveAs, gradeOf, count, firstAnswer } = S;

/** The answer of a puzzle that has one, as marks. */
export function answerOf(size, grid, spec) {
  const P = puzzleOf(size, grid, null, spec), st = firstAnswer(P.g, P.X);
  return st ? Array.from(st, x => String(x)).join("") : null;
}

// ---------- making a puzzle ----------
const marksOfRegion = (g, ins) => g.ecells.map(cs => ((cs.length === 1 ? ins[cs[0]] : ins[cs[0]] !== ins[cs[1]]) ? LINE : CROSS));
const linesAround = (g, marks) => Int8Array.from({ length: g.cells }, (_, k) => g.cedges[k].filter(e => marks[e] === LINE).length);

/** A random region of hexagons that stays in one piece and has no hole: its outline is one loop (a honeycomb vertex can't pinch). */
function hexRegion(g, rng) {
  const nb = Array.from({ length: g.cells }, () => []), rim = [];
  g.ecells.forEach(cs => { if (cs.length === 2) { nb[cs[0]].push(cs[1]); nb[cs[1]].push(cs[0]); } else rim.push(cs[0]); });
  const ins = new Uint8Array(g.cells), onRim = new Uint8Array(g.cells);
  for (const k of rim) onRim[k] = 1;
  const target = Math.round(g.cells * (0.45 + rng() * 0.2));
  ins[Math.floor(rng() * g.cells)] = 1;
  let size = 1;
  const joined = () => {                                     // every cell outside, reached from beyond the board without crossing the region
    const seen = new Uint8Array(g.cells), todo = [];
    for (let k = 0; k < g.cells; k++) if (!ins[k] && onRim[k]) { seen[k] = 1; todo.push(k); }
    let reached = todo.length;
    while (todo.length) for (const j of nb[todo.pop()]) if (!ins[j] && !seen[j]) { seen[j] = 1; reached++; todo.push(j); }
    return reached === g.cells - size;
  };
  while (size < target) {
    const cand = [];
    for (let k = 0; k < g.cells; k++) if (!ins[k] && nb[k].some(j => ins[j])) cand.push(k);
    shuffle(cand, rng);
    let added = false;
    for (const k of cand) {
      ins[k] = 1; size++;
      if (joined()) { added = true; break; }
      ins[k] = 0; size--;
    }
    if (!added) break;
  }
  return ins;
}

/** What a set of cells inside a square board has for an outline when the loop may cross itself straight at a corner where two diagonal cells are in. */
function outlineOf(base, ins) {
  const { R, C, E, ea, eb, ecells, vedges, V } = base, W = C + 1;
  const line = new Uint8Array(E), deg = new Uint8Array(V);
  for (let e = 0; e < E; e++) {
    const cs = ecells[e];
    if (cs.length === 1 ? ins[cs[0]] : ins[cs[0]] !== ins[cs[1]]) { line[e] = 1; deg[ea[e]]++; deg[eb[e]]++; }
  }
  let pinch = 0;
  const tun = [];
  for (let v = 0; v < V; v++) if (deg[v] === 4) { pinch++; tun.push(v); }
  const seen = new Uint8Array(E);
  let curves = 0;
  for (let e0 = 0; e0 < E; e0++) {
    if (!line[e0] || seen[e0]) continue;
    curves++;
    let e = e0, from = ea[e0], to = eb[e0];
    for (let guard = 0; guard < E + 2; guard++) {
      seen[e] = 1;
      const rest = vedges[to].filter(f => line[f] && f !== e);
      let next = -1;
      if (deg[to] === 2) next = rest[0];
      else {                                                    // a crossing: straight on, to the dot as far on as we came from
        const fx = from % W, fy = Math.floor(from / W), tx = to % W, ty = Math.floor(to / W), ox = 2 * tx - fx, oy = 2 * ty - fy;
        next = rest.find(f => { const o = ea[f] === to ? eb[f] : ea[f]; return o % W === ox && Math.floor(o / W) === oy; });
      }
      if (next == null || next < 0) return null;
      const o = ea[next] === to ? eb[next] : ea[next];
      from = to; to = o; e = next;
      if (e === e0) break;
    }
  }
  return { curves, pinch, tun, line };
}
/**
 * A loop that crosses itself straight through some dots: a region of cells grown as the plain game's, then cells flipped in or out
 * one at a time, each flip kept while the outline (a crossing taken straight on) stays one curve, until the wanted number of
 * dots are crossings. Returns { tun, marks } or null.
 */
function tunnelLoop(size, rng) {
  const base = geometry(size, size), { R, C } = base;
  const loop = randomLoop(R, C, rng), ins = new Uint8Array(R * C);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) ins[r * C + c] = loop.ins[loop.at(r, c)];
  const maxT = size <= 5 ? 2 : size <= 7 ? 3 : 4, want = 1 + Math.floor(rng() * maxT), lowest = Math.round(R * C * 0.3), highest = Math.round(R * C * 0.75);
  let cur = outlineOf(base, ins), had = ins.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 600 && cur.pinch < want; i++) {
    const k = Math.floor(rng() * R * C);
    ins[k] ^= 1;
    const now = had + (ins[k] ? 1 : -1), a = now >= lowest && now <= highest ? outlineOf(base, ins) : null;
    if (a && a.curves === 1 && a.pinch <= maxT) { cur = a; had = now; } else ins[k] ^= 1;
  }
  if (cur.pinch < 1) return null;
  return { tun: cur.tun, marks: Array.from(cur.line, x => (x ? LINE : CROSS)) };
}

/** Turns some numbers into bounds, "n+" or "≤n", one at a time, each kept only while a solver of the level still finishes. */
function loosen(g, X, n, rng, want, share) {
  for (const k of shuffle(Array.from({ length: g.cells }, (_, i) => i), rng)) {
    if (rng() > share) continue;
    const deg = g.cedges[k].length, ways = [];
    if (n[k] >= 1 && n[k] < deg) ways.push([n[k] - (n[k] > 1 && rng() < 0.3 ? 1 : 0), deg]);
    if (n[k] < deg) ways.push([0, Math.min(deg - 1, n[k] + (n[k] + 1 < deg && rng() < 0.3 ? 1 : n[k] === 0 ? 1 : 0))]);
    if (!ways.length) continue;
    const [l, h] = ways[Math.floor(rng() * ways.length)];
    if (l === 0 && h === 0) continue;
    const was = [X.lo[k], X.hi[k]];
    X.lo[k] = l; X.hi[k] = h;
    if (!solveAs(g, X, want).ok) { X.lo[k] = was[0]; X.hi[k] = was[1]; }
  }
}
/** Takes clues away, in random order, for as long as a solver of the level can still finish. */
function pare(g, X, level, rng) {
  for (const k of shuffle(Array.from({ length: g.cells }, (_, i) => i), rng)) {
    const was = [X.lo[k], X.hi[k]];
    X.lo[k] = X.hi[k] = -1;
    if (!solveAs(g, X, level).ok) { X.lo[k] = was[0]; X.hi[k] = was[1]; }
  }
}
const boundsIn = X => { let n = 0, all = 0; for (let k = 0; k < X.lo.length; k++) if (X.lo[k] >= 0) { all++; if (X.lo[k] !== X.hi[k]) n++; } return [n, all]; };

/**
 * A puzzle of a shape ("square" or "hex"), size, level and twist ("none", "ranges", "tunnels", "ranges+tunnels"), the same for the
 * same seed: { size, shape, grid, sol, tun, twist, level } with level what it came to (the nearest when the one asked for would
 * not come in the tries allowed), or null.
 */
export function generate(seed, shape, size, level, twist = "none") {
  const T = flagsOf(twist), tunnels = T.tunnels && shape !== "hex", want = Math.max(0, ORDER.indexOf(level)), rng = rngOf(seed);
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    let g, marks;
    if (shape === "hex") { g = boardOf("hex", size); marks = marksOfRegion(g, hexRegion(g, rng)); }
    else if (tunnels) {
      const L = tunnelLoop(size, rng);
      if (!L) continue;
      g = boardOf("square", size, L.tun); marks = L.marks;
    } else {
      const base = geometry(size, size), loop = randomLoop(size, size, rng);
      g = boardOf("square", size);
      marks = marksOfRegion(g, Uint8Array.from({ length: base.cells }, (_, k) => loop.ins[loop.at(Math.floor(k / size), k % size)]));
    }
    const n = linesAround(g, marks), X = { lo: Int8Array.from(n), hi: Int8Array.from(n) };
    if (T.ranges) loosen(g, X, n, rng, want, 0.45 + 0.2 * rng());
    pare(g, X, want, rng);
    let got = -1;
    for (let lv = 0; lv < 3 && got < 0; lv++) if (solveAs(g, X, lv).ok) got = lv;
    if (got < 0) continue;
    const [bounds, all] = boundsIn(X);
    if (T.ranges && bounds < 1) continue;
    const found = { size, shape, grid: gridOf(X.lo, X.hi), sol: marks.join(""), tun: g.tun.join(","), twist: twistOn(twist, shape), level: ORDER[got], bounds, all };
    const enough = !T.ranges || bounds >= Math.max(2, Math.ceil(all * 0.2));
    if (got === want && enough) return found;
    const score = Math.abs(got - want) + (enough ? 0 : 1);
    if (!best || score < best.score) best = { found, score };
  }
  return best && best.found;
}

// ---------- what the marks break ----------
const stateOf = marks => Int8Array.from(marks, ch => +ch);
/** What the marks break, from the rules alone: numbers with too many lines (`over`), numbers and bounds met (`met`), nodes with three lines or a dead end (`bad`), a closed loop that isn't the answer (`loop`). */
export function breaks(P, marks) {
  const { g, X } = P, st = stateOf(marks), over = [], met = [], bad = [], loop = [];
  for (let k = 0; k < g.cells; k++) {
    if (X.lo[k] < 0) continue;
    let l = 0, u = 0;
    for (const e of g.cedges[k]) { if (st[e] === 1) l++; else if (!st[e]) u++; }
    if (l > X.hi[k]) over.push(k);
    else if (l >= X.lo[k] && (l === X.hi[k] || !u)) met.push(k);
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
  if (closing >= 0) {
    let right = true;
    for (let e = 0; e < g.E; e++) if ((st[e] === 1) !== (P.sol[e] === 1)) { right = false; break; }
    if (!right) { const root = find(g.ea[closing]); for (let e = 0; e < g.E; e++) if (st[e] === 1 && find(g.ea[e]) === root) loop.push(e); }
  }
  return { over, met, bad, loop, shade: [] };
}

/** The next thing to tell a player: a mark that is wrong, put right; else the next step a person would take; else one edge of the answer. */
export function hintFor(P, marks) {
  const { g, X } = P;
  for (let e = 0; e < g.E; e++) {
    const should = P.sol[e] ? LINE : CROSS;
    if (marks[e] !== "0" && marks[e] !== should) return { wrong: e, should };
  }
  const st = stateOf(marks), rec = {};
  if (propagate(g, X, st.slice()) >= 0) {
    if (sweep(g, X, st.slice(), rec) > 0 || loopRule(g, X, st.slice(), rec) > 0) return { step: rec };
    const r2 = {};
    if (trialStep(g, X, st, TRIAL_ROUNDS, r2) || trialStep(g, X, st, Infinity, r2)) return { step: r2 };
  }
  const e = st.indexOf(0);
  return e < 0 ? null : { reveal: e, should: P.sol[e] ? LINE : CROSS };
}
