// Bridges (Hashiwokakero): islands numbered with how many bridges they need, joined by straight bridges, none
// crossing, until every island is in one network. The rules, the puzzles and the reasoning live here, with no page
// in it: bridges-worker.js makes puzzles off the page, bridges.js plays them, tests/bridges.mjs checks it all in Node.
// Every puzzle made here has exactly one answer and is graded by the hardest step a person needs to reach it.
//
// A board is a grid string, one character a cell: "." for water, an island's number otherwise (1 to 9, then a, b, c for
// ten to twelve). A link is a place a bridge could go: two islands in one row or column with nothing between them (and a
// cell of water at least between). Links are numbered from the islands in reading order, each island's link to its right
// and then the one below it. A state is a bound on each link, lo (bridges that must be there) and hi (at most), and what
// a player keeps is one character a link, "0" to "3", the bridges drawn. A road (a link) holds two bridges at most.
//
// The twists change the rules a little (a puzzle has none, one or several). Ranges: an island's number may be only a
// bound ("4+" at least four, "≤3" at most three), given by a second string, `kinds`, a character a cell ("=" exactly,
// "+" at least, "-" at most). Two realms: the islands are of two colours, given by a third string, `realms` ("0" or "1" a
// cell), a bridge joins two of a colour, an island of the other colour in the way stops a link as another island does,
// and each colour must be one network of its own. Viaducts: some islands are hills, given by a fourth string, `hills`
// ("1" a cell), and a bridge between two hills is high: a high bridge may cross a low one (the others still may not
// cross), so a hill's viaduct goes over the lowland's bridges. Narrow and wide roads: some roads hold one bridge at most
// and some up to three, given by a fifth string, `roads`, a character a link (in link order, like the answer): "1", "2"
// or "3", the most bridges the road holds. Straits: lines across the sea, each with a number, the bridges that cross it
// counted (a double counts twice), given by a sixth string, `straits`: one character a gap between two rows (`size - 1`
// of them, top to bottom) and then one a gap between two columns (left to right), "." for none or the digit. No loops:
// the bridges never close a ring (a double bridge is no ring), so each realm's islands are joined by a tree.
//
// The hex board (5 November 2026, bridges-lattice.js): the same grid string, but the points are a triangular lattice in a hexagon,
// so an island has up to six links (along a row and down both slants) and may read up to twelve. A puzzle on it says `shape: "hex"`,
// and the layout is built with `more.hex`. Links are numbered as before, each island's links in the order row, down-right, down-left.
// Two links cross when they pass over one lattice point; the twists mean what they meant (a strait is a gap between two lines of
// the lattice, in three families instead of two), so the solver is the same one.
import { axesOf, stepsOf, onBoard, pointsOf, gapsOf, lineOf, gapAt } from "./bridges-lattice.js";

export const SIZES = [7, 9, 11];
export const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const ORDER = ["easy", "medium", "hard"];
export const DAILY = { size: 9, level: "medium" };
export const TWISTS = { none: "Classic", ranges: "Ranges", realms: "Two realms", hills: "Viaducts", narrow: "Narrow roads", wide: "Wide roads", straits: "Straits", tree: "No loops" };
/** The order twists are named in once they are joined by "+", whichever order they were given in. */
const TWIST_ORDER = ["ranges", "realms", "hills", "narrow", "wide", "straits", "tree"];
/** Which twists a twist name holds: "none", or one or more of ranges, realms, hills, narrow, wide, straits and tree joined by "+" (a name that is no twist, reefs and lanes included, holds none). */
export const flagsOf = t => { const s = String(t); return Object.fromEntries(TWIST_ORDER.map(k => [k, s.includes(k)])); };
/** A twist name made canonical, or "none" for anything unknown. */
export const twistOn = t => { const f = flagsOf(t), out = TWIST_ORDER.filter(k => f[k]); return out.length ? out.join("+") : "none"; };
/** An island's number from its character in the grid: "1" to "9", then "a" to "c" for ten to twelve (a road that holds three lets an island have twelve). */
export const numOf = ch => parseInt(ch, 16);
const charOf = n => n.toString(16);
const TRIES = 600;                 // layouts tried towards a level before the nearest is dealt
const HEX_DENSITY = 1.5;          // a hex board holds this many times the islands of a square one with as many points (more neighbours each, so fewer are free to stand)

// ---------- the board ----------
const LAYOUTS = new Map();
/**
 * The islands of a grid and the links between them (not remembered: the generator makes thousands): { size, isl, at, links, byIsl, cross, realmSize, first, groups, cons, tree }.
 * A link between two hills is `high`; a link has a `cap`, the most bridges its road holds (two, unless `roads` says one or three).
 * `more` is { straits, tree }: a strait is a group of links (those that cross its line) whose bridges add up to its number;
 * `cons` is every sum the bridges must make, the islands' (`at` the island) and the straits' (`strait` the group), `tree` whether a ring is forbidden.
 */
function buildLayout(size, grid, kinds = "", realms = "", hills = "", roads = "", more = {}) {
  const hex = !!more.hex, axes = axesOf(hex), isl = [], at = new Int16Array(size * size).fill(-1);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === ".") continue;
    const n = numOf(grid[i]), kind = kinds[i] === "+" ? 1 : kinds[i] === "-" ? 2 : 0;
    // mn and mx: the fewest and most bridges the island may have (an island "at most" may be left with none by the numbers, but the network asks for one)
    at[i] = isl.length; isl.push({ r: Math.floor(i / size), c: i % size, n, kind, mn: kind === 2 ? 0 : n, mx: kind === 1 ? 12 : n, realm: realms[i] === "1" ? 1 : 0, hill: hills[i] === "1" });
  }
  const links = [], byIsl = isl.map(() => []);
  const add = (a, b, dir) => { byIsl[a].push(links.length); byIsl[b].push(links.length); links.push({ a, b, dir, vertical: dir === 1, high: isl[a].hill && isl[b].hill, cap: +(roads[links.length] || 2) }); };
  isl.forEach((x, a) => {
    // the first island along each axis is the only one a bridge can reach (joined only if a point of water lies between and it is of the same realm)
    axes.forEach(([dr, dc], dir) => {
      for (let s = 1; ; s++) {
        const r = x.r + dr * s, c = x.c + dc * s;
        if (!onBoard(size, hex, r, c)) break;
        const b = at[r * size + c];
        if (b >= 0) { if (s >= 2 && isl[b].realm === x.realm) add(a, b, dir); break; }
      }
    });
  });
  const cross = links.map(() => []);
  if (!hex) {
    // two links cross when one's row is strictly inside the other's rows and its column inside the other's columns; a high bridge goes over a low one, so
    // those two don't hinder each other (two high ones, or two low ones, do)
    links.forEach((h, i) => {
      if (h.vertical) return;
      links.forEach((v, j) => {
        if (!v.vertical) return;
        const r = isl[h.a].r, c = isl[v.a].c;
        if (c > isl[h.a].c && c < isl[h.b].c && r > isl[v.a].r && r < isl[v.b].r && h.high === v.high) { cross[i].push(j); cross[j].push(i); }
      });
    });
  } else {
    // on the lattice two links of different axes meet at a lattice point or not at all: they cross when both pass over the same point (a high one and a low one pass each other)
    const over = new Map();
    links.forEach((l, i) => {
      const [dr, dc] = axes[l.dir], x = isl[l.a], s = Math.max(Math.abs(isl[l.b].r - x.r), Math.abs(isl[l.b].c - x.c));
      for (let t = 1; t < s; t++) { const key = (x.r + dr * t) * size + x.c + dc * t; (over.get(key) || over.set(key, []).get(key)).push(i); }
    });
    for (const list of over.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const i = list[p], j = list[q];
      if (links[i].high === links[j].high && !cross[i].includes(j)) { cross[i].push(j); cross[j].push(i); }
    }
  }
  const realmSize = [0, 0], first = [-1, -1];
  isl.forEach((x, i) => { realmSize[x.realm]++; if (first[x.realm] < 0) first[x.realm] = i; });
  const groups = [];
  for (let g = 0; g < gapsOf(size, hex); g++) {
    const ch = more.straits?.[g];
    if (!ch || ch === ".") continue;
    const { fam, gap } = gapAt(size, g), across = fam === 1;           // a gap between two columns is crossed by the row's links, between two rows by the column's (the hex board has a third family, between slants)
    const ls = [];
    links.forEach((l, i) => { const a = lineOf(size, fam, isl[l.a].r, isl[l.a].c), b = lineOf(size, fam, isl[l.b].r, isl[l.b].c); if (Math.min(a, b) <= gap && gap < Math.max(a, b)) ls.push(i); });
    groups.push({ ls, mn: +ch, mx: +ch, across, fam, gap, g });
  }
  const cons = [...isl.map((x, i) => ({ ls: byIsl[i], mn: x.mn, mx: x.mx, at: i })), ...groups.map((x, k) => ({ ls: x.ls, mn: x.mn, mx: x.mx, strait: k }))];
  return { size, hex, isl, at, links, byIsl, cross, realmSize, first, groups, cons, tree: !!more.tree };
}
/** The layout of a grid (and, for the twists, its kinds, realms, hills, roads and `more`: { straits, tree, hex }), made once. */
export function layoutOf(size, grid, kinds = "", realms = "", hills = "", roads = "", more = {}) {
  const key = `${size}:${grid}:${kinds}:${realms}:${hills}:${roads}:${more.straits || ""}:${more.tree ? 1 : 0}${more.hex ? ":hex" : ""}`;
  if (!LAYOUTS.has(key)) LAYOUTS.set(key, buildLayout(size, grid, kinds, realms, hills, roads, more));
  return LAYOUTS.get(key);
}
/** A puzzle from its grid and, if known, its answer (a character a link, the bridges there); `kinds`, `realms`, `hills`, `roads` and `more.straits` are the twists' strings, "" for none, `more.tree` forbids a ring. */
export function puzzleOf(size, grid, sol = null, kinds = "", realms = "", hills = "", roads = "", more = {}) {
  const lay = layoutOf(size, grid, kinds, realms, hills, roads, more);
  return { size, grid, kinds, realms, hills, roads, straits: more.straits || "", tree: !!more.tree, ...(more.hex ? { shape: "hex" } : {}), lay, sol: sol && Uint8Array.from(sol, Number), solMarks: sol };
}
/** The `more` of layoutOf and puzzleOf for a saved or generated puzzle (a run, a match, a shared board): its straits, whether it forbids rings, whether it is on the hex board. */
export const moreOf = p => ({ straits: p.straits || "", tree: !!flagsOf(p.twist || "none").tree, hex: p.shape === "hex" });

// ---------- the rules, as a solver follows them ----------
const freshState = lay => ({
  lo: new Int8Array(lay.links.length),
  hi: Int8Array.from(lay.links, l => Math.min(l.cap, lay.isl[l.a].mx, lay.isl[l.b].mx)),
});
const copyOf = st => ({ lo: st.lo.slice(), hi: st.hi.slice() });
const find = (par, x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };

/**
 * The rules followed until nothing more is settled, or for `rounds` rounds: each island's number and the bridges that
 * can't cross, and, with `net`, that all the islands must end up joined. -1 if they break, 0 otherwise; with `rec`
 * given, it stops at the first bridge that must be there and says what settled it (returns 2).
 */
function propagate(lay, st, rounds = Infinity, rec = null, net = true) {
  const { isl, links, byIsl, cross, realmSize, first, cons, tree } = lay, { lo, hi } = st, nI = isl.length, L = links.length;
  for (let round = 0; round < rounds; round++) {
    let changed = false;
    // an island: its bridges add up to its number (between its fewest and its most, for a range), so each link has at least what the others can't carry and at most what the others leave;
    // a strait is the same sum over the links that cross it
    for (let i = 0; i < cons.length; i++) {
      const { ls, mn, mx } = cons[i];
      let sl = 0, sh = 0;
      for (const l of ls) { sl += lo[l]; sh += hi[l]; }
      if (sl > mx || sh < mn) return -1;
      for (const l of ls) {
        const nl = mn - (sh - hi[l]), nh = mx - (sl - lo[l]);
        if (nl > lo[l]) {
          if (nl > hi[l]) return -1;
          sl += nl - lo[l]; lo[l] = nl; changed = true;
          if (rec) { rec.step = { tech: sh === mn ? "all" : "need", ...(cons[i].strait != null ? { strait: cons[i].strait } : { at: i }), link: l, to: nl }; return 2; }
        }
        if (nh < hi[l]) {
          if (nh < lo[l]) return -1;
          sh -= hi[l] - nh; hi[l] = nh; changed = true;
        }
      }
    }
    // a bridge keeps every link that would cross it empty
    for (let l = 0; l < L; l++) {
      if (!lo[l]) continue;
      for (const k of cross[l]) {
        if (lo[k]) return -1;
        if (hi[k]) { hi[k] = 0; changed = true; }
      }
    }
    // no loops: a link between two islands the bridges already join would close a ring
    if (tree) {
      const joined = Int16Array.from({ length: nI }, (_, i) => i);
      for (let l = 0; l < L; l++) if (lo[l]) { const ra = find(joined, links[l].a), rb = find(joined, links[l].b); if (ra === rb) return -1; joined[ra] = rb; }       // the bridges already built close a ring
      for (let l = 0; l < L; l++) if (!lo[l] && hi[l] && find(joined, links[l].a) === find(joined, links[l].b)) { hi[l] = 0; changed = true; }
    }
    if (!net) { if (!changed) return 0; continue; }
    // the network: islands joined by bridges that must be there; a group that has all its bridges and isn't all the islands of its realm is shut off
    // (a group's room is what its islands could still take: their most, or what their links can carry, less what they have)
    const par = Int16Array.from({ length: nI }, (_, i) => i);
    for (let l = 0; l < L; l++) if (lo[l]) par[find(par, links[l].a)] = find(par, links[l].b);
    const size = new Int16Array(nI), room = new Int16Array(nI);
    for (let i = 0; i < nI; i++) {
      let s = 0, h = 0;
      for (const l of byIsl[i]) { s += lo[l]; h += hi[l]; }
      const root = find(par, i);
      size[root]++; room[root] += Math.min(isl[i].mx, h) - s;
    }
    for (let i = 0; i < nI; i++) if (find(par, i) === i && room[i] === 0 && size[i] < realmSize[isl[i].realm]) return -1;
    const pot = Int16Array.from({ length: nI }, (_, i) => i);      // and the islands that could ever be joined must be all of a realm's
    for (let l = 0; l < L; l++) if (hi[l]) pot[find(pot, links[l].a)] = find(pot, links[l].b);
    for (let i = 0; i < nI; i++) if (find(pot, i) !== find(pot, first[isl[i].realm])) return -1;
    // one more bridge on a link would shut its group off: it takes no more than it has
    for (let l = 0; l < L; l++) {
      if (hi[l] <= lo[l]) continue;
      const ra = find(par, links[l].a), rb = find(par, links[l].b);
      const sz = ra === rb ? size[ra] : size[ra] + size[rb], left = (ra === rb ? room[ra] : room[ra] + room[rb]) - 2;
      if (left === 0 && sz < realmSize[isl[links[l].a].realm]) { hi[l] = lo[l]; changed = true; }
    }
    if (!changed) return 0;
  }
  return 0;
}
/** Every link settled, every island has its number, and the bridges join all the islands. */
function complete(lay, st) {
  const { isl, links, byIsl, first } = lay, { lo, hi } = st;
  for (let l = 0; l < links.length; l++) if (lo[l] !== hi[l]) return false;
  const par = Int16Array.from({ length: isl.length }, (_, i) => i);
  for (let i = 0; i < isl.length; i++) { const s = byIsl[i].reduce((t, l) => t + lo[l], 0); if (s < isl[i].mn || s > isl[i].mx) return false; }
  for (let l = 0; l < links.length; l++) if (lo[l]) par[find(par, links[l].a)] = find(par, links[l].b);
  for (let i = 0; i < isl.length; i++) if (find(par, i) !== find(par, first[isl[i].realm])) return false;
  if (lay.tree) { let edges = 0; for (let l = 0; l < links.length; l++) if (lo[l]) edges++; if (edges !== isl.length - (lay.realmSize[1] ? 2 : 1)) return false; }      // joined, and a tree: one fewer bridge between pairs than islands
  return true;
}

/**
 * A trial: suppose a link has at least k bridges, or at most k, and follow the rules; if they break, the opposite holds. Settles every link it can: 1 if it settled any, 0 if none, -1 if the puzzle has no answer. With
 * `rec`, it stops at the first bridge that must be there (2).
 */
function trial(lay, st, rec = null) {
  const { lo, hi } = st;
  let any = 0;
  for (let l = 0; l < lo.length; l++) {
    for (let k = lo[l] + 1; k <= hi[l]; k++) {                     // at least k: if that breaks, at most k - 1
      const t = copyOf(st);
      t.lo[l] = k;
      if (propagate(lay, t) < 0) {
        hi[l] = k - 1; any = 1;
        const p = propagate(lay, st, Infinity, rec);
        if (p < 0) return -1;
        if (p === 2) return 2;
        break;
      }
    }
    for (let k = hi[l] - 1; k >= lo[l]; k--) {                     // at most k: if that breaks, at least k + 1
      const t = copyOf(st);
      t.hi[l] = k;
      if (propagate(lay, t) < 0) {
        if (rec) { lo[l] = k + 1; rec.step = { tech: "trial", at: lay.links[l].a, link: l, to: k + 1, supposed: k }; return 2; }
        lo[l] = k + 1; any = 1;
        const p = propagate(lay, st, Infinity, rec);
        if (p < 0) return -1;
        if (p === 2) return 2;
        break;
      }
    }
  }
  return any;
}
/**
 * Solve with what a person at a level can do: 0, each island's number and the bridges that can't cross; 1, that the
 * islands must all be joined too (a group with all its bridges can't be left on its own); 2, a trial of one link as
 * well. { ok, st }; with `rec`, it stops at the first bridge that must be there ({ ok: false, raised: true }, the step
 * in rec.step).
 */
export function solveAs(lay, level, st = freshState(lay), rec = null) {
  for (;;) {
    const p = propagate(lay, st, Infinity, rec, level >= 1);
    if (p < 0) return { ok: false, st, broken: true };
    if (p === 2) return { ok: false, st, raised: true };
    if (complete(lay, st)) return { ok: true, st };
    if (level < 2) return { ok: false, st };
    const got = trial(lay, st, rec);
    if (got === 2) return { ok: false, st, raised: true };
    if (got < 0) return { ok: false, st, broken: true };
    if (!got) return { ok: false, st };
  }
}
/** The lowest level (0 to 2) that solves the puzzle by reasoning, or -1 when none does. */
export function gradeOf(lay) {
  for (let lv = 0; lv < 3; lv++) if (solveAs(lay, lv).ok) return lv;
  return -1;
}

// ---------- counting answers (the proof, and the tests') ----------
/** How many answers the board has, counted up to `limit`: a search that guesses, the rules followed after every guess. */
export function count(lay, limit = 2, st = freshState(lay)) {
  if (propagate(lay, st) < 0) return 0;
  if (complete(lay, st)) return 1;
  const l = st.lo.findIndex((v, i) => v < st.hi[i]);
  if (l < 0) return 0;
  let n = 0;
  for (let v = st.lo[l]; v <= st.hi[l]; v++) {
    const t = copyOf(st);
    t.lo[l] = t.hi[l] = v;
    n += count(lay, limit - n, t);
    if (n >= limit) break;
  }
  return n;
}
/** The answer of a board that has one, as bridges a link (the arguments are layoutOf's). */
export function answerOf(size, grid, kinds = "", realms = "", hills = "", roads = "", more = {}) {
  const lay = layoutOf(size, grid, kinds, realms, hills, roads, more), r = solveAs(lay, 2);
  if (r.ok) return Array.from(r.st.lo, String).join("");
  const go = (st = freshState(lay)) => {
    if (propagate(lay, st) < 0) return null;
    if (complete(lay, st)) return st;
    const l = st.lo.findIndex((v, i) => v < st.hi[i]);
    for (let v = st.lo[l]; v <= st.hi[l]; v++) { const t = copyOf(st); t.lo[l] = t.hi[l] = v; const s = go(t); if (s) return s; }
    return null;
  };
  const s = go();
  return s ? Array.from(s.lo, String).join("") : null;
}

// ---------- making a puzzle ----------
export const rngOf = seed => {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * A board with bridges already across it: islands grown from one, each joined to an earlier one by a straight run of
 * water, then more bridges between islands side by side where nothing crosses. Returns { grid, sol, bridges, realms }:
 * with `realms`, two networks are grown at once (a second island of its own colour is placed first, and a new island
 * takes its parent's colour), and null if either is too small to be a puzzle. The classic board draws the same numbers
 * from `rng` as it always has. With `hills`, some islands are hills (the `hills` string, "1" a cell) and viaducts are added
 * between hills side by side over the low bridges that cross their way at right angles, at least one; null if none came.
 * With `widths` ({ wide, narrow }), roads hold other than two: a wide road holds three (and some of the answer's bridges
 * are triples), a narrow road one (only where the answer has no more than one), the board's `roads` string saying which.
 * The draws for them come after every other, so a board without them is the board it always was.
 */
export function randomBoard(size, rng, wanted, extra, realms = false, hills = false, widths = null, hex = false) {
  const occ = new Uint8Array(size * size);                         // 0 water, 1 island, 2 a bridge over it, 9 off the board (a hex board's cut corners)
  const isl = [], bridges = [], colour = [], dirs = hex ? stepsOf(true) : DIRS, fwd = axesOf(hex), inb = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  if (hex) for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!onBoard(size, true, r, c)) occ[r * size + c] = 9;
  const place = (r, c, k = 0) => { occ[r * size + c] = 1; isl.push([r, c]); colour.push(k); };
  if (hex) { for (;;) { const r = Math.floor(rng() * size), c = Math.floor(rng() * size); if (!occ[r * size + c]) { place(r, c); break; } } }
  else place(Math.floor(rng() * size), Math.floor(rng() * size));
  const touchesIsland = (r, c) => dirs.some(([dr, dc]) => { const y = r + dr, x = c + dc; return inb(y, x) && occ[y * size + x] === 1; });
  if (realms) {
    for (let guard = 0; guard < 200; guard++) {
      const r = Math.floor(rng() * size), c = Math.floor(rng() * size);
      if (!occ[r * size + c] && !touchesIsland(r, c)) { place(r, c, 1); break; }
    }
    if (isl.length < 2) return null;
  }
  for (let guard = 0; isl.length < wanted && guard < wanted * 40; guard++) {
    const parent = Math.floor(rng() * isl.length), [r0, c0] = isl[parent], [dr, dc] = dirs[Math.floor(rng() * dirs.length)];
    const reach = 2 + Math.floor(rng() * 4), ends = [];
    for (let s = 1; s <= reach; s++) {
      const r = r0 + dr * s, c = c0 + dc * s;
      if (!inb(r, c) || occ[r * size + c]) break;
      if (s >= 2 && !touchesIsland(r, c)) ends.push(s);
    }
    if (!ends.length) continue;
    const s = ends[Math.floor(rng() * ends.length)], k = rng() < 0.35 ? 2 : 1;
    for (let t = 1; t < s; t++) occ[(r0 + dr * t) * size + c0 + dc * t] = 2;
    place(r0 + dr * s, c0 + dc * s, colour[parent]);
    bridges.push([r0, c0, r0 + dr * s, c0 + dc * s, k]);
  }
  // extra bridges between islands side by side, over water only (and, with two realms, of one colour)
  const index = new Map(isl.map(([r, c], k) => [r * size + c, k]));
  isl.forEach(([r0, c0], from) => { for (const [dr, dc] of fwd) {
    let s = 1;
    while (true) {
      const r = r0 + dr * s, c = c0 + dc * s;
      if (!inb(r, c) || occ[r * size + c] !== 0) break;
      s++;
    }
    const r = r0 + dr * s, c = c0 + dc * s;
    if (s < 2 || !inb(r, c) || occ[r * size + c] !== 1 || colour[index.get(r * size + c)] !== colour[from] || rng() >= extra) continue;
    for (let t = 1; t < s; t++) occ[(r0 + dr * t) * size + c0 + dc * t] = 2;
    bridges.push([r0, c0, r, c, rng() < 0.4 ? 2 : 1]);
  } });
  if (realms && (colour.filter(k => k === 0).length < 3 || colour.filter(k => k === 1).length < 3)) return null;
  let hillStr = "";
  if (hills) {
    // what passes over each cell: a bit for a low bridge along each axis (1 a row, 2 a column, on the hex board 4 the third), and the same bits shifted up by the
    // number of axes for a high one (between two hills)
    const A = fwd.length, lowAll = (1 << A) - 1;
    const passOf = high => {
      const pass = new Uint8Array(size * size);
      for (const [ra, ca, rb, cb] of bridges) {
        const dr = Math.sign(rb - ra), dc = Math.sign(cb - ca), axis = fwd.findIndex(([x, y]) => (x === dr && y === dc) || (x === -dr && y === -dc));
        const bit = (1 << axis) << (high(index.get(ra * size + ca), index.get(rb * size + cb)) ? A : 0);
        for (let r = ra + dr, c = ca + dc; r !== rb || c !== cb; r += dr, c += dc) pass[r * size + c] |= bit;
      }
      return pass;
    };
    // the island a hill at (r0, c0) would reach along axis k, if the way is clear, and how many low bridges pass under it on the way
    const spanFrom = (pass, from, k) => {
      const [r0, c0] = isl[from], [dr, dc] = fwd[k], along = 1 << k, over = lowAll & ~along;      // my own axis's low bit, and the other axes'
      let s = 1, crossing = 0;
      for (; ; s++) {
        const r = r0 + dr * s, c = c0 + dc * s;
        if (!inb(r, c)) return null;
        const at = r * size + c;
        if (occ[at] === 1) break;                                                          // an island
        if (occ[at] === 9) return null;
        if (pass[at] & (along | (lowAll << A))) return null;                               // along a bridge, or across a high one
        if (pass[at] & over) crossing++;
      }
      const to = index.get((r0 + dr * s) * size + c0 + dc * s);
      return s < 2 || to == null || colour[to] !== colour[from] || !crossing ? null : { to, s, along };
    };
    // Where two islands of a colour face each other over a low bridge a viaduct could go; hills are drawn so that some of them
    // are hills at both ends (else a board with a viaduct is rare, and the generator wastes its tries), the rest by chance.
    const spans = [], flat = passOf(() => false);
    isl.forEach((_, from) => { for (let k = 0; k < A; k++) { const sp = spanFrom(flat, from, k); if (sp) spans.push([from, sp.to]); } });
    if (!spans.length) return null;
    const hill = isl.map(() => rng() < 0.25);
    for (let n = 1 + (rng() < 0.4 ? 1 : 0); n > 0 && spans.length; n--) { const [x, y] = spans.splice(Math.floor(rng() * spans.length), 1)[0]; hill[x] = hill[y] = true; }
    const pass = passOf((x, y) => hill[x] && hill[y]);
    let crossings = 0;
    isl.forEach(([r0, c0], from) => { if (!hill[from]) return; for (let ax = 0; ax < A; ax++) {
      const sp = spanFrom(pass, from, ax), [dr, dc] = fwd[ax];
      if (!sp || !hill[sp.to] || rng() >= 0.85) continue;
      const { to, s, along } = sp, r = r0 + dr * s, c = c0 + dc * s;
      for (let t = 1; t < s; t++) { const k = (r0 + dr * t) * size + c0 + dc * t; pass[k] |= along << A; if (!occ[k]) occ[k] = 2; }
      bridges.push([r0, c0, r, c, rng() < 0.4 ? 2 : 1]);
      crossings++;
    } });
    if (!crossings) return null;
    hillStr = Array.from({ length: size * size }, (_, i) => (index.has(i) && hill[index.get(i)] ? "1" : ".")).join("");
  }
  // wide roads: some of the answer's own roads hold three, and a bridge on one is a triple more often than not
  const keyOf = (x, y) => `${Math.min(x, y)}:${Math.max(x, y)}`, roadKey = ([r1, c1, r2, c2]) => keyOf(r1 * size + c1, r2 * size + c2), wide = new Set();
  if (widths?.wide) {
    for (const b of bridges) if (rng() < 0.3) { wide.add(roadKey(b)); if (rng() < 0.7) b[4] = 3; }
    if (!bridges.some(b => b[4] === 3)) { const b = bridges[Math.floor(rng() * bridges.length)]; wide.add(roadKey(b)); b[4] = 3; }
  }
  const numbers = new Map(isl.map(([r, c]) => [r * size + c, 0]));
  for (const [r1, c1, r2, c2, k] of bridges) { numbers.set(r1 * size + c1, numbers.get(r1 * size + c1) + k); numbers.set(r2 * size + c2, numbers.get(r2 * size + c2) + k); }
  if (hex && [...numbers.values()].some(n => n > 12)) return null;       // an island reads twelve at most (six links of a double each; a wide road's triples could pass it)
  const grid = Array.from({ length: size * size }, (_, i) => (numbers.has(i) ? charOf(numbers.get(i)) : ".")).join("");
  const colours = realms ? Array.from({ length: size * size }, (_, i) => (index.has(i) ? String(colour[index.get(i)]) : ".")).join("") : "";
  let roads = "";
  if (widths && (widths.wide || widths.narrow)) {
    const lay = buildLayout(size, grid, "", colours, hillStr, "", { hex }), by = new Map(bridges.map(b => [roadKey(b), b[4]]));
    const caps = lay.links.map(l => {
      const v = by.get(keyOf(lay.isl[l.a].r * size + lay.isl[l.a].c, lay.isl[l.b].r * size + lay.isl[l.b].c)) || 0, k = keyOf(lay.isl[l.a].r * size + lay.isl[l.a].c, lay.isl[l.b].r * size + lay.isl[l.b].c);
      if (wide.has(k)) return 3;
      if (widths.narrow && v <= 1 && rng() < 0.55) return 1;       // a narrow road: where the answer has one bridge or none (many, and generate() pares them to the ones the puzzle needs)
      if (widths.wide && v <= 2 && rng() < 0.15) return 3;                      // a wide road the answer doesn't fill
      return 2;
    });
    if (widths.narrow && !caps.includes(1)) { const at = lay.links.findIndex((l, i) => caps[i] === 2 && (by.get(keyOf(lay.isl[l.a].r * size + lay.isl[l.a].c, lay.isl[l.b].r * size + lay.isl[l.b].c)) || 0) <= 1); if (at < 0) return null; caps[at] = 1; }
    roads = caps.some(c => c !== 2) ? caps.join("") : "";
  }
  return { grid, sol: answerFrom(size, grid, "", colours, bridges, hillStr, roads, hex), bridges, realms: colours, hills: hillStr, roads, ...(hex ? { hex: true } : {}) };
}
/** The answer of a board as a character a link, from the bridges it was made with: [r1, c1, r2, c2, bridges]. */
function answerFrom(size, grid, kinds, realms, bridges, hills = "", roads = "", hex = false) {
  const lay = buildLayout(size, grid, kinds, realms, hills, roads, { hex }), keyOf = (x, y) => `${Math.min(x, y)}:${Math.max(x, y)}`;
  const by = new Map(bridges.map(([r1, c1, r2, c2, k]) => [keyOf(r1 * size + c1, r2 * size + c2), k]));
  return lay.links.map(l => by.get(keyOf(lay.isl[l.a].r * size + lay.isl[l.a].c, lay.isl[l.b].r * size + lay.isl[l.b].c)) || 0).join("");
}
/** The layout of a board as the generator has it so far, with its own kinds or `kinds`. */
const layOfBoard = (size, b, kinds = "") => buildLayout(size, b.grid, kinds, b.realms, b.hills, b.roads, { straits: b.straits, tree: b.tree, hex: b.hex });
/**
 * The clues of one kind (`field`: "roads", the narrow and wide ones, or "straits") taken away again, in random order,
 * wherever the puzzle can still be finished by reasoning at no more than `most`: a clue left is one the puzzle needs (a
 * wide road the answer fills with three can't be taken away at all). Returns the field's string, "" if none is left.
 */
function pare(size, board, rng, most, field) {
  const cur = Array.from(board[field]), plain = field === "roads" ? "2" : ".", order = [];
  cur.forEach((c, l) => { if (c !== plain && !(field === "roads" && c === "3" && board.sol[l] === "3")) order.push(l); });
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const l of order) {
    const was = cur[l];
    cur[l] = plain;
    const g = gradeOf(layOfBoard(size, { ...board, [field]: cur.join("") }));
    if (g < 0 || g > most) cur[l] = was;
  }
  return cur.every(c => c === plain) ? "" : cur.join("");
}
/** Every strait a board could have, as the answer crosses it (a count of ten or more is left out: it wants a digit): the `straits` string. */
function straitsOf(size, board) {
  const gaps = gapsOf(size, !!board.hex), lay = buildLayout(size, board.grid, "", board.realms, board.hills, board.roads, { straits: "0".repeat(gaps), hex: board.hex });
  return lay.groups.reduce((out, g) => { const n = g.ls.reduce((t, l) => t + +board.sol[l], 0); return out.slice(0, g.g) + (n < 10 ? String(n) : ".") + out.slice(g.g + 1); }, ".".repeat(gaps));
}
/**
 * Numbers loosened to bounds: islands, in random order, have their number replaced by "at least" or "at most" while the
 * puzzle can still be finished by reasoning at no more than `most`; about `share` of the islands are tried. Returns the
 * kinds string and the grade the loosened puzzle came to.
 */
function loosen(size, board, rng, share, most) {
  const lay0 = layOfBoard(size, board), order = lay0.isl.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const kinds = Array.from(board.grid, ch => (ch === "." ? "." : "=")), want = Math.round(order.length * share);
  let done = 0, grade = gradeOf(lay0);
  for (const i of order) {
    if (done >= want) break;
    const x = lay0.isl[i], at = x.r * size + x.c, pick = rng() < 0.5 ? "+" : "-", n = x.n;
    // "at most 1" says no more than the island's one way in, "at least 8" no more than the 8 itself: nothing is loosened by them
    const choices = [pick, pick === "+" ? "-" : "+"].filter(k => (k === "+" ? n < (lay0.hex ? 12 : 8) : n > 1));
    for (const k of choices) {
      kinds[at] = k;
      const g = gradeOf(layOfBoard(size, board, kinds.join("")));
      if (g >= 0 && g <= most) { done++; grade = g; break; }
      kinds[at] = "=";
    }
  }
  return { kinds: done ? kinds.join("") : "", grade };
}
/**
 * A puzzle of a size and level, the same for the same seed: { size, grid, sol, level } with level what it came to (the
 * nearest when the level asked for wouldn't come in the tries allowed). Boards are made at random and kept when a solver
 * of the level finishes them: that proves the answer is the only one, since every step it takes is forced. A twist
 * ("ranges", "realms", "hills", "narrow", "wide", "straits", "tree", or several joined by "+") adds `twist`, `kinds`,
 * `realms`, `hills`, `roads` and `straits` to it as it needs them. The twists that add clues (roads, straits) start from a
 * board with all of them, and keep only those the puzzle needs, so none is decoration.
 */
export function generate(seed, size, level, twist = "none", shape = "square") {
  const want = Math.max(0, ORDER.indexOf(level)), rng = rngOf(seed), T = flagsOf(twist), twisted = Object.values(T).some(Boolean), hex = shape === "hex";
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const wanted = Math.round((hex ? pointsOf(size, true) * HEX_DENSITY : size * size) * (0.2 + rng() * 0.14)), extra = [0.45, 0.15, 0.2][want] * (0.5 + rng());
    let board = randomBoard(size, rng, wanted, T.tree ? 0 : extra, T.realms, T.hills, T.narrow || T.wide ? T : null, hex);
    if (!board) continue;
    if (T.tree) board = { ...board, tree: true };
    if (T.straits) board = { ...board, straits: straitsOf(size, board) };
    if (board.roads || board.straits) {
      const first = gradeOf(layOfBoard(size, board));
      if (first < 0 || first > want) continue;
      for (const field of ["roads", "straits"]) if (board[field]) board = { ...board, [field]: pare(size, board, rng, want, field) };
      // a twist asked for with fewer than two clues left is no twist (with narrow and wide roads both asked for, one of each at least)
      const narrow = Array.from(board.roads || "").filter(c => c === "1").length, wide = Array.from(board.roads || "").filter(c => c === "3").length, few = T.narrow && T.wide ? 1 : 2;
      if ((T.narrow && narrow < few) || (T.wide && wide < few) || (board.straits ? Array.from(board.straits).filter(c => c !== ".").length < 2 : T.straits)) continue;
    }
    const { grid, sol } = board, lay = layOfBoard(size, board);
    if (lay.isl.length < 4) continue;
    let got = gradeOf(lay), kinds = "";
    if (got < 0) continue;
    // the one answer must be the board's own (viaducts can close a ring the rule against loops forbids, so a board made with them need not be its own answer)
    if (hex || (T.hills && T.tree)) { const r = solveAs(lay, got); if (!r.ok || Array.from(r.st.lo, String).join("") !== sol) continue; }
    if (T.tree) { const loose = gradeOf(layOfBoard(size, { ...board, tree: false })); if (loose >= 0 && loose <= want) continue; }       // the rule must be a step the puzzle needs, not a fact about its answer
    if (T.ranges) ({ kinds, grade: got } = loosen(size, board, rng, 0.25 + 0.15 * rng(), want));
    const found = { size, grid, sol, level: ORDER[got] };
    if (hex) found.shape = "hex";
    if (twisted) { found.twist = twistOn(twist); if (kinds) found.kinds = kinds; if (board.realms) found.realms = board.realms; if (board.hills) found.hills = board.hills; if (board.roads) found.roads = board.roads; if (board.straits) found.straits = board.straits; }
    if (got === want) return found;
    if (!best || Math.abs(got - want) < Math.abs(ORDER.indexOf(best.level) - want)) best = found;
  }
  return best;
}
export const levelOn = (size, level) => (LEVELS[level] ? level : "medium");

// ---------- marks ----------
/** A tap on a link: one more bridge, up to what the road holds (`cap`, two unless the puzzle has narrow or wide roads), then none. */
export const nextMark = (m, cap = 2) => String((+m + 1) % (cap + 1));
export const withMark = (marks, i, m) => marks.slice(0, i) + m + marks.slice(i + 1);

/** Whether the bridges drawn are the answer. */
export function solvedBy(P, marks) {
  for (let l = 0; l < P.sol.length; l++) if (+marks[l] !== P.sol[l]) return false;
  return true;
}
/** Whether drawing a bridge on a link would cross one already drawn. */
export const crossed = (P, marks, l) => P.lay.cross[l].some(k => marks[k] !== "0");
/** The links with a bridge on them that crosses another bridge. One player is never allowed it (`crossed`), two partners laying at once can make it. */
export const crossings = (P, marks) => new Set(Array.from(marks, (m, l) => (m !== "0" && crossed(P, marks, l) ? l : -1)).filter(l => l >= 0));
/**
 * What the marks break, from the rules alone (never the answer): the islands with more bridges than their number, the
 * islands met, and the islands in a group that has all its bridges while others are left out.
 */
export function breaks(P, marks) {
  const { isl, links, byIsl, groups } = P.lay, over = [], met = [], cut = [];
  const par = Int16Array.from({ length: isl.length }, (_, i) => i), sum = isl.map((x, i) => { const s = byIsl[i].reduce((t, l) => t + +marks[l], 0); if (s > x.mx) over.push(i); else if (s >= Math.max(1, x.mn)) met.push(i); return s; });
  for (let l = 0; l < links.length; l++) if (+marks[l]) par[find(par, links[l].a)] = find(par, links[l].b);
  const full = new Map(), size = new Map();
  isl.forEach((x, i) => { const r = find(par, i); size.set(r, (size.get(r) || 0) + 1); full.set(r, (full.get(r) ?? true) && sum[i] >= x.mx); });
  isl.forEach((x, i) => { const r = find(par, i); if (full.get(r) && size.get(r) < P.lay.realmSize[x.realm]) cut.push(i); });
  const straitsOver = [], straitsMet = [];                         // a strait with more bridges across it than its number, and one with exactly its number
  groups.forEach((g, k) => { const n = g.ls.reduce((t, l) => t + +marks[l], 0); if (n > g.mx) straitsOver.push(k); else if (n === g.mn) straitsMet.push(k); });
  return { over, met, cut, straitsOver, straitsMet, ring: P.lay.tree ? ringLinks(P.lay, marks) : [] };
}
/** The links of a ring: bridges built that close a loop (those on a path between two islands that has another path too), for the no-loops rule. */
export function ringLinks(lay, marks) {
  const { isl, links, byIsl } = lay, disc = new Int16Array(isl.length).fill(-1), low = new Int16Array(isl.length), bridge = new Set();
  let clock = 0;
  const walk = (u, via) => {
    disc[u] = low[u] = clock++;
    for (const l of byIsl[u]) {
      if (!+marks[l] || l === via) continue;
      const v = links[l].a === u ? links[l].b : links[l].a;
      if (disc[v] < 0) { walk(v, l); low[u] = Math.min(low[u], low[v]); if (low[v] > disc[u]) bridge.add(l); } else low[u] = Math.min(low[u], disc[v]);
    }
  };
  for (let i = 0; i < isl.length; i++) if (disc[i] < 0) walk(i, -1);
  return links.map((_, l) => l).filter(l => +marks[l] && !bridge.has(l));
}

/** An island's number as printed: 4, 4+ (at least) or ≤4 (at most). */
export const labelOf = isle => (isle.kind === 1 ? `${isle.n}+` : isle.kind === 2 ? `≤${isle.n}` : String(isle.n));
const NUMBER = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
/**
 * What the marks break, as a line that names it (from the rules alone, never the answer), or "" when nothing is broken: the
 * islands with more bridges than their number or bound (the island and how many too many), else a group shut off from the
 * rest. The line is the board's words for what its oxblood marks show, so it is the same after any tap, undo or reload.
 */
export function whatBreaks(P, marks, br = breaks(P, marks)) {
  const { over, cut } = br, { isl, byIsl } = P.lay;
  const has = i => byIsl[i].reduce((t, l) => t + +marks[l], 0);
  if (over.length === 1) {
    const i = over[0], by = has(i) - isl[i].mx;
    return `The ${labelOf(isl[i])} has ${has(i)} bridges, ${NUMBER[by] ?? by} too many.`;
  }
  if (over.length) {                                              // several: which, counted by their number ("two 1s and the ≤3"), since many islands share one
    const tally = new Map();
    for (const i of over) tally.set(labelOf(isl[i]), (tally.get(labelOf(isl[i])) || 0) + 1);
    const parts = [...tally].map(([lab, n]) => (n === 1 ? `the ${lab}` : `${NUMBER[n] ?? n} ${lab}s`)).slice(0, 4);
    return `Too many bridges on ${over.length} islands: ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}${tally.size > 4 ? ", …" : ""}.`;
  }
  if (br.straitsOver?.length > 1) return `${br.straitsOver.length} straits have more bridges across them than their numbers.`;
  if (br.straitsOver?.length) {                                   // a strait with more bridges across it than its number, said by its number
    const g = P.lay.groups[br.straitsOver[0]], n = g.ls.reduce((t, l) => t + +marks[l], 0), by = n - g.mx;
    return `The strait marked ${g.mx} has ${n} bridges across it, ${NUMBER[by] ?? by} too many.`;
  }
  if (br.ring?.length) return "The bridges close a ring. In this puzzle they may never come back round to where they started.";
  if (cut.length) return `A group has all its bridges, and the other islands${P.lay.realmSize[1] ? " of its colour" : ""} aren't joined to it.`;
  return "";
}

// ---------- hints ----------
/**
 * The next thing to tell a player: a link with more bridges than the answer ({ wrong, should }); else the next bridge a
 * person would see must be there, simplest first ({ step: { tech, at, link, to, … } }); else one link of the answer
 * ({ reveal, should }).
 */
export function hintFor(P, marks) {
  const { lay } = P;
  for (let l = 0; l < P.sol.length; l++) if (+marks[l] > P.sol[l]) return { wrong: l, should: String(P.sol[l]) };
  const st = freshState(lay);
  for (let l = 0; l < P.sol.length; l++) st.lo[l] = +marks[l];
  const rec = {};
  if (solveAs(lay, 2, st, rec).raised && rec.step) return { step: rec.step };
  const l = P.sol.findIndex((v, i) => v > +marks[i]);
  return l < 0 ? null : { reveal: l, should: String(P.sol[l]) };
}
