// Nonet's human-style solver, pure: the techniques a person uses, from the plainest to the hardest, each a function
// that finds one step on the grid as it stands (a digit placed, or candidates struck out) and says why. It does three
// jobs: it grades a grid by the hardest technique it needs (Easy needs singles only, Expert needs chains), it gives
// hints (the easiest next step, named, with the cells that prove it), and it is the computer player, which works
// through the same steps at a person's pace (sudoku-bot.js). Every step is sound: tests/sudoku.mjs runs the solver on
// hundreds of grids and checks that no step ever strikes out or places anything the solution contradicts.
//
// A state is { val, cand, virt }: each cell's digit (0 while empty), its candidates as a bit mask (sudoku-grid.js),
// and the Killer cages the rule of 45 has found so far (virtual cages: cells whose total is known).
import { POP, bit, digitOf, digitsOf, unitName, cellName } from "./sudoku-grid.js";

/**
 * The techniques, easiest first, with the rank that sets a grid's level (1 Easy … 4 Expert) and their names. The
 * tiers are the ones solvers commonly agree on (HoDoKu's, for one): singles; then locked candidates, pairs and
 * triples; then quads, fish, wings, colouring and the short single-digit chains (the skyscraper, the kite, the turbot
 * fish); then the long chains.
 */
export const TECHNIQUES = {
  full: { rank: 1, name: "Last cell" },
  hidden: { rank: 1, name: "Hidden single" },
  naked: { rank: 1, name: "Naked single" },
  cage: { rank: 1, name: "Cage sum" },
  locked: { rank: 2, name: "Locked candidates" },
  cageline: { rank: 2, name: "Cage in a unit" },
  pair: { rank: 2, name: "Naked pair" },
  hpair: { rank: 2, name: "Hidden pair" },
  rule45: { rank: 2, name: "Rule of 45" },
  triple: { rank: 2, name: "Naked triple" },
  htriple: { rank: 2, name: "Hidden triple" },
  xwing: { rank: 3, name: "X-wing" },
  short: { rank: 3, name: "Skyscraper" },
  ywing: { rank: 3, name: "XY-wing" },
  xyzwing: { rank: 3, name: "XYZ-wing" },
  wwing: { rank: 3, name: "W-wing" },
  swordfish: { rank: 3, name: "Swordfish" },
  colour: { rank: 3, name: "Colouring" },
  quad: { rank: 3, name: "Naked quad" },
  hquad: { rank: 3, name: "Hidden quad" },
  rule45b: { rank: 3, name: "Rule of 45" },
  jellyfish: { rank: 3, name: "Jellyfish" },
  xchain: { rank: 4, name: "X-chain" },
  xychain: { rank: 4, name: "XY-chain" },
};
/** What a grid needs beyond every technique here: it is never dealt. */
export const BEYOND = 5;

// ---------- the state ----------
/** The state of a grid with these digits in it (0 for empty): every empty cell's candidates are the digits none of
 *  its peers holds. */
export function stateOf(shape, values) {
  const { cells, peers, all } = shape, val = Uint8Array.from(values), cand = new Uint16Array(cells);
  for (let i = 0; i < cells; i++) {
    if (val[i]) { cand[i] = bit(val[i]); continue; }
    let seen = 0;
    for (const p of peers[i]) if (val[p]) seen |= bit(val[p]);
    cand[i] = all & ~seen;
  }
  return { val, cand, virt: [] };
}
export const copyState = st => ({ val: st.val.slice(), cand: st.cand.slice(), virt: st.virt.slice() });
export const solved = st => st.val.every(v => v > 0);

/** Places a digit: the cell takes it, and no empty peer may. */
export function place(shape, st, i, d) {
  st.val[i] = d;
  st.cand[i] = bit(d);
  for (const p of shape.peers[i]) if (!st.val[p]) st.cand[p] &= ~bit(d);
}
/** Applies a step: its digit placed, its candidates struck out, a virtual cage it found kept. */
export function apply(shape, st, step) {
  if (step.place) place(shape, st, step.place[0], step.place[1]);
  if (step.elim) for (const [c, m] of step.elim) st.cand[c] &= ~m;
  if (step.virt) st.virt.push(step.virt);
}

// ---------- what each shape keeps for the techniques ----------
// The same for every grid of a size, regions and diagonals (cages aren't units), so kept by those (shapeOf's key).
const EXTRA = new Map();
function extra(shape) {
  const id = `${shape.key}|${shape.cages ? 1 : 0}`;
  let x = EXTRA.get(id);
  if (x) return x;
  const { units, kinds, cells, n } = shape;
  // pairs of units that cross in two cells or more (a box and a row, a jigsaw piece and a column, a diagonal and a
  // box), the box or region first: locked candidates point out of one into the other
  const inter = [];
  const order = [...units.keys()].sort((a, b) => rankKind(kinds[a]) - rankKind(kinds[b]));
  for (const a of order) for (const b of order) {
    if (a === b) continue;
    const A = new Set(units[a]), both = [...units[b]].filter(c => A.has(c));
    if (both.length < 2) continue;
    const B = new Set(units[b]);
    inter.push({ a, b, both, aOnly: [...units[a]].filter(c => !B.has(c)), bOnly: [...units[b]].filter(c => !A.has(c)) });
  }
  // hidden singles look in boxes first, as a person scans
  const hiddenOrder = [...units.keys()].sort((a, b) => rankKind(kinds[a]) - rankKind(kinds[b]));
  // the rule of 45's units: every unit, then two and three rows or columns side by side
  const sets45 = [];
  if (shape.cages) {
    for (let u = 0; u < units.length; u++) if (kinds[u] !== "diag") sets45.push({ units: [u], cells: [...units[u]], rank: 2 });
    for (const lines of [shape.rows, shape.cols]) for (const w of [2, 3]) for (let s = 0; s + w <= n; s++) {
      const set = []; for (let k = 0; k < w; k++) set.push(...lines[s + k]);
      const first = lines === shape.rows ? s : n + s;
      sets45.push({ units: Array.from({ length: w }, (_, k) => first + k), cells: set, rank: 3 });
    }
  }
  x = { inter, hiddenOrder, sets45, cells };
  if (EXTRA.size > 64) EXTRA.delete(EXTRA.keys().next().value);
  EXTRA.set(id, x);
  return x;
}
const rankKind = k => ({ box: 0, region: 0, row: 1, col: 2, diag: 3 }[k]);
const sees = (shape, a, b) => shape.sees[a * shape.cells + b] === 1;

// ---------- singles ----------
function fullHouse(sh, st) {
  for (let u = 0; u < sh.units.length; u++) {
    let left = -1, empty = 0, have = 0;
    for (const c of sh.units[u]) { if (st.val[c]) have |= bit(st.val[c]); else { empty++; left = c; } }
    if (empty !== 1) continue;
    const m = sh.all & ~have;
    if (POP[m] === 1 && (st.cand[left] & m)) return { tech: "full", place: [left, digitOf(m)], units: [u], cells: [...sh.units[u]] };
  }
  return null;
}
function hiddenSingle(sh, st) {
  for (const u of extra(sh).hiddenOrder) {
    const cs = sh.units[u];
    let have = 0;
    for (const c of cs) if (st.val[c]) have |= bit(st.val[c]);
    for (let d = 1; d <= sh.n; d++) {
      const b = bit(d);
      if (have & b) continue;
      let at = -1, k = 0;
      for (const c of cs) if (!st.val[c] && (st.cand[c] & b)) { k++; at = c; if (k > 1) break; }
      if (k === 1) return { tech: "hidden", place: [at, d], units: [u], digit: d, cells: [...cs] };
    }
  }
  return null;
}
function nakedSingle(sh, st) {
  for (let c = 0; c < sh.cells; c++) if (!st.val[c] && POP[st.cand[c]] === 1) return { tech: "naked", place: [c, digitOf(st.cand[c])], cells: [c] };
  return null;
}

// ---------- locked candidates: a digit confined to where two units cross ----------
function locked(sh, st) {
  for (const { a, b, both, aOnly, bOnly } of extra(sh).inter) {
    for (let d = 1; d <= sh.n; d++) {
      const B = bit(d);
      if (aOnly.some(c => !st.val[c] && (st.cand[c] & B))) continue;
      const inside = both.filter(c => !st.val[c] && (st.cand[c] & B));
      if (!inside.length) continue;
      const elim = bOnly.filter(c => !st.val[c] && (st.cand[c] & B)).map(c => [c, B]);
      if (elim.length) return { tech: "locked", units: [a, b], digit: d, cells: inside, elim };
    }
  }
  return null;
}

// ---------- subsets ----------
const SUBSET = { 2: ["pair", "hpair"], 3: ["triple", "htriple"], 4: ["quad", "hquad"] };
/** k cells of a unit that hold only k digits between them: those digits are theirs, and no other cell's there. */
function naked(k) {
  return (sh, st) => {
    for (let u = 0; u < sh.units.length; u++) {
      const empty = [...sh.units[u]].filter(c => !st.val[c]);
      if (empty.length <= k) continue;
      const pool = empty.filter(c => POP[st.cand[c]] >= 2 && POP[st.cand[c]] <= k);
      const pick = [];
      const found = (from, union) => {
        if (pick.length === k) {
          if (POP[union] !== k) return null;
          const elim = empty.filter(c => !pick.includes(c) && (st.cand[c] & union)).map(c => [c, st.cand[c] & union]);
          return elim.length ? { tech: SUBSET[k][0], units: [u], cells: [...pick], digits: union, elim } : null;
        }
        for (let i = from; i < pool.length; i++) {
          const next = union | st.cand[pool[i]];
          if (POP[next] > k) continue;
          pick.push(pool[i]);
          const r = found(i + 1, next);
          pick.pop();
          if (r) return r;
        }
        return null;
      };
      const r = found(0, 0);
      if (r) return r;
    }
    return null;
  };
}
/** k digits of a unit with only k cells between them to go in: those cells hold nothing else. */
function hidden(k) {
  return (sh, st) => {
    for (let u = 0; u < sh.units.length; u++) {
      const cs = sh.units[u];
      let have = 0;
      for (const c of cs) if (st.val[c]) have |= bit(st.val[c]);
      const where = [];                                      // [digit, positions in the unit as a mask]
      for (let d = 1; d <= sh.n; d++) {
        if (have & bit(d)) continue;
        let m = 0;
        cs.forEach((c, j) => { if (!st.val[c] && (st.cand[c] & bit(d))) m |= 1 << j; });
        if (POP[m] >= 2 && POP[m] <= k) where.push([d, m]);
      }
      if (where.length < k) continue;
      const pick = [];
      const found = (from, union) => {
        if (pick.length === k) {
          if (popcount(union) !== k) return null;
          const digits = pick.reduce((m, [d]) => m | bit(d), 0), cells = [...cs].filter((_, j) => union & (1 << j));
          const elim = cells.filter(c => st.cand[c] & ~digits).map(c => [c, st.cand[c] & ~digits]);
          return elim.length ? { tech: SUBSET[k][1], units: [u], cells, digits, elim } : null;
        }
        for (let i = from; i < where.length; i++) {
          const next = union | where[i][1];
          if (popcount(next) > k) continue;
          pick.push(where[i]);
          const r = found(i + 1, next);
          pick.pop();
          if (r) return r;
        }
        return null;
      };
      const r = found(0, 0);
      if (r) return r;
    }
    return null;
  };
}
const popcount = m => POP[m & 1023] + POP[(m >> 10) & 1023];

// ---------- fish: a digit's places in k rows lying in k columns (or the other way round) ----------
const FISH = { 2: "xwing", 3: "swordfish", 4: "jellyfish" };
function fish(k) {
  return (sh, st) => {
    const n = sh.n;
    for (let d = 1; d <= n; d++) {
      const B = bit(d);
      for (const [base, cover] of [[sh.rows, sh.cols], [sh.cols, sh.rows]]) {
        const lines = [];
        base.forEach((cs, li) => {
          let m = 0, placed = false;
          cs.forEach((c, j) => { if (st.val[c] === d) placed = true; else if (!st.val[c] && (st.cand[c] & B)) m |= 1 << j; });
          if (!placed && popcount(m) >= 2 && popcount(m) <= k) lines.push([li, m]);
        });
        if (lines.length < k) continue;
        const pick = [];
        const found = (from, union) => {
          if (pick.length === k) {
            if (popcount(union) !== k) return null;
            const inBase = new Set(pick.flatMap(([li]) => [...base[li]]));
            const elim = [];
            for (let j = 0; j < n; j++) if (union & (1 << j)) for (const c of cover[j]) if (!inBase.has(c) && !st.val[c] && (st.cand[c] & B)) elim.push([c, B]);
            if (!elim.length) return null;
            const cells = pick.flatMap(([li]) => [...base[li]].filter(c => !st.val[c] && (st.cand[c] & B)));
            const bu = base === sh.rows ? 0 : n, cu = cover === sh.rows ? 0 : n;
            return { tech: FISH[k], digit: d, cells, units: [...pick.map(([li]) => bu + li), ...[...Array(n).keys()].filter(j => union & (1 << j)).map(j => cu + j)], elim };
          }
          for (let i = from; i < lines.length; i++) {
            const next = union | lines[i][1];
            if (popcount(next) > k) continue;
            pick.push(lines[i]);
            const r = found(i + 1, next);
            pick.pop();
            if (r) return r;
          }
          return null;
        };
        const r = found(0, 0);
        if (r) return r;
      }
    }
    return null;
  };
}

// ---------- wings ----------
const bivalues = (sh, st) => { const out = []; for (let c = 0; c < sh.cells; c++) if (!st.val[c] && POP[st.cand[c]] === 2) out.push(c); return out; };
/** Empty cells (other than these) that see every one of them and hold the digit. */
const seenByAll = (sh, st, cells, B) => {
  const out = [];
  for (let c = 0; c < sh.cells; c++) if (!st.val[c] && (st.cand[c] & B) && !cells.includes(c) && cells.every(x => sees(sh, c, x))) out.push([c, B]);
  return out;
};
function xyWing(sh, st) {
  const bv = bivalues(sh, st);
  for (const p of bv) {
    const [x, y] = digitsOf(st.cand[p]);
    const wings = bv.filter(c => c !== p && sees(sh, p, c));
    for (const a of wings) {
      if (!(st.cand[a] & bit(x)) || (st.cand[a] & bit(y))) continue;
      const z = st.cand[a] & ~bit(x);
      for (const b of wings) {
        if (b === a || st.cand[b] !== (bit(y) | z)) continue;
        const elim = seenByAll(sh, st, [a, b], z);
        if (elim.length) return { tech: "ywing", cells: [p, a, b], digit: digitOf(z), elim };
      }
    }
  }
  return null;
}
function xyzWing(sh, st) {
  const bv = bivalues(sh, st);
  for (let p = 0; p < sh.cells; p++) {
    if (st.val[p] || POP[st.cand[p]] !== 3) continue;
    const wings = bv.filter(c => sees(sh, p, c) && (st.cand[c] & ~st.cand[p]) === 0);
    for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
      const a = wings[i], b = wings[j], z = st.cand[a] & st.cand[b];
      if (POP[z] !== 1 || (st.cand[a] | st.cand[b]) !== st.cand[p]) continue;
      const elim = seenByAll(sh, st, [p, a, b], z);
      if (elim.length) return { tech: "xyzwing", cells: [p, a, b], digit: digitOf(z), elim };
    }
  }
  return null;
}
/** Where a digit has exactly two places in a unit, one of them holds it: [[a, b, unit]] for that digit. */
function strongLinks(sh, st, d) {
  const B = bit(d), out = [];
  sh.units.forEach((cs, u) => {
    const at = [];
    for (const c of cs) { if (st.val[c] === d) return; if (!st.val[c] && (st.cand[c] & B)) at.push(c); }
    if (at.length === 2) out.push([at[0], at[1], u]);
  });
  return out;
}
function wWing(sh, st) {
  const bv = bivalues(sh, st);
  for (let i = 0; i < bv.length; i++) for (let j = i + 1; j < bv.length; j++) {
    const a = bv[i], b = bv[j];
    if (st.cand[a] !== st.cand[b] || sees(sh, a, b)) continue;
    for (const y of digitsOf(st.cand[a])) {
      const x = digitsOf(st.cand[a] & ~bit(y))[0];
      for (const [c1, c2, u] of strongLinks(sh, st, y)) {
        if ([c1, c2].some(c => c === a || c === b)) continue;
        if (!((sees(sh, c1, a) && sees(sh, c2, b)) || (sees(sh, c1, b) && sees(sh, c2, a)))) continue;
        const elim = seenByAll(sh, st, [a, b], bit(x));
        if (elim.length) return { tech: "wwing", cells: [a, b, c1, c2], units: [u], digit: x, link: y, elim };
      }
    }
  }
  return null;
}

// ---------- chains ----------
/**
 * X-chains: a digit's strong links (a unit where it has two places) joined by weak ones (two places that see each
 * other), strong at both ends. If the first cell isn't the digit, its partner is, which rules out the next, whose
 * partner then is, and so on: one end or the other holds the digit, so a cell that sees both ends can't. Searched
 * breadth first from every strong link, so the shortest chain is the one found. Two strong links (the skyscraper, the
 * kite, the turbot fish) are a Hard technique; three to six, an Expert one.
 */
const xChain = (least, most) => (sh, st) => {
  let best = null;
  for (let d = 1; d <= sh.n; d++) {
    const B = bit(d), links = strongLinks(sh, st, d);
    if (links.length < 2) continue;
    const partners = new Map();
    for (const [a, b] of links) { (partners.get(a) || partners.set(a, []).get(a)).push(b); (partners.get(b) || partners.set(b, []).get(b)).push(a); }
    const nodes = [];
    for (let c = 0; c < sh.cells; c++) if (!st.val[c] && (st.cand[c] & B)) nodes.push(c);
    for (const [a, b] of links) for (const [s, t] of [[a, b], [b, a]]) {
      // on: cells that hold the digit if s doesn't (reached by a strong link); off: cells that then can't
      const on = new Map([[t, { from: s, strong: 1 }]]), off = new Map(), queue = [t];
      for (let q = 0; q < queue.length; q++) {
        const z = queue[q], at = on.get(z);
        if (best && at.strong >= best.strong) break;
        if (at.strong >= least) {
          const elim = [];
          for (const c of nodes) if (c !== s && c !== z && sees(sh, c, s) && sees(sh, c, z)) elim.push([c, B]);
          if (elim.length) { best = { strong: at.strong, step: { tech: least === 2 ? "short" : "xchain", digit: d, cells: chainPath(on, off, z, s), elim, strong: at.strong } }; break; }
        }
        if (at.strong >= most) continue;
        for (const w of nodes) {
          if (w === z || w === s || off.has(w) || !sees(sh, z, w)) continue;
          off.set(w, { from: z });
          for (const v of partners.get(w) || []) {
            if (on.has(v) || v === s) continue;
            on.set(v, { from: w, strong: at.strong + 1 });
            queue.push(v);
          }
        }
      }
    }
  }
  return best?.step || null;
};
/** The cells of a chain found breadth first, from its start to z, by the links each cell was reached by. */
function chainPath(on, off, z, s) {
  const path = [z];
  let cur = z, strong = true;
  while (cur !== s) {
    const rec = strong ? on.get(cur) : off.get(cur);
    if (!rec) break;
    cur = rec.from;
    path.push(cur);
    strong = !strong;
  }
  return path.reverse();
}
/** Simple colouring: a digit's strong links coloured two ways round each chain of them; one colour is all true, the
 *  other all false, so two cells of one colour that see each other make that colour false. A cell that sees both
 *  colours can't hold the digit either. */
function colouring(sh, st) {
  for (let d = 1; d <= sh.n; d++) {
    const B = bit(d), links = strongLinks(sh, st, d), colour = new Map();
    const next = new Map();
    for (const [a, b] of links) { (next.get(a) || next.set(a, []).get(a)).push(b); (next.get(b) || next.set(b, []).get(b)).push(a); }
    for (const start of next.keys()) {
      if (colour.has(start)) continue;
      const group = [start];
      colour.set(start, 0);
      for (let i = 0; i < group.length; i++) for (const m of next.get(group[i])) if (!colour.has(m)) { colour.set(m, 1 - colour.get(group[i])); group.push(m); }
      if (group.length < 3) continue;
      for (const side of [0, 1]) {
        const same = group.filter(c => colour.get(c) === side);
        if (same.some((a, i) => same.slice(i + 1).some(b => sees(sh, a, b)))) {
          return { tech: "colour", digit: d, cells: group, elim: same.map(c => [c, B]), wrap: true };
        }
      }
      const one = group.filter(c => colour.get(c) === 0), two = group.filter(c => colour.get(c) === 1), elim = [];
      for (let c = 0; c < sh.cells; c++) if (!st.val[c] && (st.cand[c] & B) && !colour.has(c) && one.some(x => sees(sh, c, x)) && two.some(x => sees(sh, c, x))) elim.push([c, B]);
      if (elim.length) return { tech: "colour", digit: d, cells: group, elim };
    }
  }
  return null;
}
/** XY-chains: cells of two candidates each, every one seeing the next and sharing a digit with it; if the first isn't
 *  the digit it starts with, the chain forces the last to be it, so a cell that sees both ends can't be. */
function xyChain(sh, st) {
  const bv = bivalues(sh, st);
  if (bv.length < 3) return null;
  let best = null;
  for (const s of bv) for (const a of digitsOf(st.cand[s])) {
    // a state is a cell and the digit it's forced to if s isn't a; breadth first, so the shortest chain is found
    const first = digitOf(st.cand[s] & ~bit(a)), key = (c, d) => c * 16 + d;
    const seen = new Map([[key(s, first), { cell: s, out: first, len: 1, from: null }]]), queue = [key(s, first)];
    for (let q = 0; q < queue.length; q++) {
      const rec = seen.get(queue[q]);
      if (best && rec.len >= best.len) break;
      if (rec.len >= 3 && rec.out === a) {
        const elim = seenByAll(sh, st, [s, rec.cell], bit(a));
        if (elim.length) {
          const cells = [];
          for (let r = rec; r; r = r.from) cells.unshift(r.cell);
          best = { len: rec.len, step: { tech: "xychain", digit: a, cells, elim } };
          break;
        }
      }
      if (rec.len >= 8) continue;
      for (const w of bv) {
        if (w === rec.cell || w === s || !sees(sh, rec.cell, w) || !(st.cand[w] & bit(rec.out))) continue;
        const out = digitOf(st.cand[w] & ~bit(rec.out)), k = key(w, out);
        if (seen.has(k)) continue;
        seen.set(k, { cell: w, out, len: rec.len + 1, from: rec });
        queue.push(k);
      }
    }
  }
  return best?.step || null;
}

// ---------- Killer's cages ----------
/**
 * What a cage's sum allows each of its empty cells, exactly: every way of filling them that adds up (digits different
 * where cells see each other), each cell's digits across those ways, and the digits every way uses. Returns null if
 * no way adds up. Kept by the cells' candidates, since the same cage is read again at every step.
 */
function cageWays(sh, st, cage, memo) {
  const free = cage.cells.filter(c => !st.val[c]);
  let sum = cage.sum;
  for (const c of cage.cells) if (st.val[c]) sum -= st.val[c];
  cage.key ??= cage.cells.join(",");
  let key = `${cage.key}|${sum}`;
  for (const c of free) key += `,${st.cand[c]}`;
  if (memo?.has(key)) return memo.get(key);
  free.sort((x, y) => POP[st.cand[x]] - POP[st.cand[y]]);
  const k = free.length, cand = free.map(c => st.cand[c]);
  // what each free cell may not take: a placed digit of the cage it sees; which earlier free cells it sees, as bits
  const barred = free.map(c => { let m = 0; for (const p of cage.cells) if (st.val[p] && sees(sh, p, c)) m |= bit(st.val[p]); return m; });
  const before = free.map((c, j) => { let m = 0; for (let i = 0; i < j; i++) if (sees(sh, free[i], c)) m |= 1 << i; return m; });
  // the least and most the cells from j on can add up to
  const minFrom = new Array(k + 1).fill(0), maxFrom = new Array(k + 1).fill(0);
  for (let j = k - 1; j >= 0; j--) { minFrom[j] = minFrom[j + 1] + digitOf(cand[j] & -cand[j]); maxFrom[j] = maxFrom[j + 1] + digitOf(cand[j]); }
  const picked = new Array(k).fill(0), can = new Array(k).fill(0);
  let every = -1, ways = 0;
  const go = (j, left) => {
    if (j === k) {
      if (left !== 0) return;
      ways++;
      let m = 0;
      for (let i = 0; i < k; i++) { can[i] |= bit(picked[i]); m |= bit(picked[i]); }
      every &= m;
      return;
    }
    let banned = barred[j];
    for (let i = 0, b = before[j]; b; i++, b >>= 1) if (b & 1) banned |= bit(picked[i]);
    for (let m = cand[j] & ~banned; m; m &= m - 1) {
      const d = digitOf(m & -m), rest = left - d;
      if (rest < minFrom[j + 1] || rest > maxFrom[j + 1]) continue;
      picked[j] = d;
      go(j + 1, rest);
    }
  };
  if (sum >= minFrom[0] && sum <= maxFrom[0]) go(0, sum);
  const out = ways ? { free, can: new Map(free.map((c, j) => [c, can[j]])), every: k ? every : 0, sum } : null;
  memo?.set(key, out);
  return out;
}
/** The cages whose sums are known: Killer's own (but not one whose sum this player can't see), and the virtual ones. */
const cagesOf = (sh, st) => [...(sh.cages || []).filter(c => c.sum != null), ...st.virt];
function cageSum(sh, st, ctx) {
  for (const cage of cagesOf(sh, st)) {
    const w = cageWays(sh, st, cage, ctx.memo);
    if (!w) continue;
    const elim = w.free.filter(c => st.cand[c] & ~w.can.get(c)).map(c => [c, st.cand[c] & ~w.can.get(c)]);
    if (elim.length) return { tech: "cage", cage, cells: [...cage.cells], elim };
  }
  return null;
}
/** A digit every way of filling a cage needs, whose places in the cage all lie in one unit: no other cell there has it. */
function cageLine(sh, st, ctx) {
  for (const cage of cagesOf(sh, st)) {
    const w = cageWays(sh, st, cage, ctx.memo);
    if (!w || !w.every) continue;
    for (const d of digitsOf(w.every)) {
      const at = w.free.filter(c => w.can.get(c) & bit(d));
      if (!at.length || cage.cells.some(c => st.val[c] === d)) continue;
      const common = sh.unitsOf[at[0]].filter(u => at.every(c => sh.unitsOf[c].includes(u)));
      for (const u of common) {
        const elim = [...sh.units[u]].filter(c => !cage.cells.includes(c) && !st.val[c] && (st.cand[c] & bit(d))).map(c => [c, bit(d)]);
        if (elim.length) return { tech: "cageline", cage, units: [u], digit: d, cells: at, elim };
      }
    }
  }
  return null;
}
/**
 * The rule of 45: a unit's digits add up to 45 (21 on a 6×6), so with the cages wholly inside it taken away, the cells
 * left (the innies) add up to what remains; and the cells the unit's other cages put outside it (the outies) add up to
 * those cages' sums less the innies. Two and three rows or columns side by side add up to 90 and 135. Each total is a
 * cage of its own, a virtual one, kept once it tells something.
 */
function rule45(rank) {
  return (sh, st, ctx) => {
    const unitSum = sh.n * (sh.n + 1) / 2;
    const known = new Set(st.virt.map(v => v.key));
    for (const set of extra(sh).sets45) {
      if (set.rank !== rank) continue;
      const inside = new Set(set.cells);
      let total = unitSum * set.units.length, partSum = 0;
      const innies = [], outies = [];
      let unknown = false;
      sh.cages.forEach(cage => {
        const inn = cage.cells.filter(c => inside.has(c));
        if (!inn.length) return;
        if (cage.sum == null) { unknown = true; return; }     // a sum this player can't see: no total to work from
        if (inn.length === cage.cells.length) { total -= cage.sum; return; }
        partSum += cage.sum;
        innies.push(...inn);
        outies.push(...cage.cells.filter(c => !inside.has(c)));
      });
      if (unknown) continue;
      for (const [cells, sum, side] of [[innies, total, "in"], [outies, partSum - total, "out"]]) {
        if (!cells.length || cells.length > 4 || sum <= 0) continue;
        const key = `${side}:${[...cells].sort((a, b) => a - b).join(",")}`;
        if (known.has(key)) continue;
        const virt = { cells: [...cells], sum, key, side, units: set.units };
        const w = cageWays(sh, st, virt, ctx.memo);
        if (!w) continue;
        const elim = w.free.filter(c => st.cand[c] & ~w.can.get(c)).map(c => [c, st.cand[c] & ~w.can.get(c)]);
        if (elim.length) return { tech: rank === 2 ? "rule45" : "rule45b", units: set.units, cells: [...cells], virt, elim };
      }
    }
    return null;
  };
}

// ---------- solving ----------
const FIND = [
  ["full", fullHouse], ["hidden", hiddenSingle], ["naked", nakedSingle], ["cage", cageSum],
  ["locked", locked], ["cageline", cageLine], ["pair", naked(2)], ["hpair", hidden(2)], ["rule45", rule45(2)],
  ["triple", naked(3)], ["htriple", hidden(3)],
  ["xwing", fish(2)], ["short", xChain(2, 2)], ["ywing", xyWing], ["xyzwing", xyzWing], ["wwing", wWing], ["swordfish", fish(3)],
  ["colour", colouring], ["quad", naked(4)], ["hquad", hidden(4)], ["rule45b", rule45(3)], ["jellyfish", fish(4)],
  ["xchain", xChain(3, 6)], ["xychain", xyChain],
];
const KILLER_ONLY = new Set(["cage", "cageline", "rule45", "rule45b"]);

/** The easiest step from here, among the techniques up to `upTo` (a rank), or null when none applies. */
export function nextStep(shape, st, { upTo = 4, ctx = { memo: new Map() } } = {}) {
  for (const [tech, find] of FIND) {
    if (TECHNIQUES[tech].rank > upTo) continue;
    if (KILLER_ONLY.has(tech) && !shape.cages) continue;
    const step = find(shape, st, ctx);
    if (step) return { ...step, rank: TECHNIQUES[tech].rank };
  }
  return null;
}

/**
 * Solves a grid the way a person would, always taking the easiest step: { solved, rank (the hardest technique it
 * needed; BEYOND if it got stuck), steps, uses (how many times each technique), state }.
 */
export function grade(shape, values, { upTo = 4, limit = 2000 } = {}) {
  const st = stateOf(shape, values), uses = {}, steps = [], ctx = { memo: new Map() };
  let rank = 1;
  for (let k = 0; k < limit && !solved(st); k++) {
    const step = nextStep(shape, st, { upTo, ctx });
    if (!step) return { solved: false, rank: BEYOND, steps, uses, state: st };
    apply(shape, st, step);
    steps.push(step);
    uses[step.tech] = (uses[step.tech] || 0) + 1;
    if (step.rank > rank) rank = step.rank;
  }
  return { solved: solved(st), rank: solved(st) ? rank : BEYOND, steps, uses, state: st };
}

// ---------- in words ----------
const listOf = xs => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const digitList = m => listOf(digitsOf(m).map(String));
/** A step as a hint says it: what to look at, and why it follows. */
export function say(shape, step) {
  const n = shape.n, u = step.units?.[0], U = u != null ? unitName(shape, u) : "";
  switch (step.tech) {
    case "full": return `${cap(U)} has one empty cell left: it takes the ${step.place[1]} the unit is missing.`;
    case "hidden": return `In ${U}, the ${step.place[1]} fits only one cell: every other is ruled out by its row, column or ${shape.kinds.includes("region") ? "region" : "box"}.`;
    case "naked": return `${cap(cellName(n, step.cells[0]))} can only be ${step.place[1]}: every other digit is already in its row, column or ${shape.kinds.includes("region") ? "region" : "box"}${shape.cages ? " or cage" : ""}.`;
    case "locked": {
      const a = unitName(shape, step.units[0]), b = unitName(shape, step.units[1]);
      return `In ${a}, every place for ${step.digit} is also in ${b}, so ${b} has no ${step.digit} anywhere else.`;
    }
    case "pair": case "triple": case "quad":
      return `In ${U}, the lit cells hold only ${digitList(step.digits)} between them, so no other cell of ${U} can be ${digitsOf(step.digits).length === 2 ? "either" : "any of them"}.`;
    case "hpair": case "htriple": case "hquad":
      return `In ${U}, ${digitList(step.digits)} can only go in the lit cells, so those cells hold nothing else.`;
    case "xwing": case "swordfish": case "jellyfish":
      return `${TECHNIQUES[step.tech].name} on ${step.digit}: in the lit lines, every ${step.digit} falls in the same ${step.cells.length > 4 ? "few" : "two"} crossing lines, so ${step.digit} is struck from the rest of those.`;
    case "ywing": return `XY-wing: whichever digit the middle lit cell takes, one of the two outer cells is ${step.digit}, so a cell that sees both can't be ${step.digit}.`;
    case "xyzwing": return `XYZ-wing: one of the three lit cells is always ${step.digit}, so a cell that sees all three can't be.`;
    case "wwing": return `W-wing: the two lit pairs can't both be ${step.link}, so one of them is ${step.digit}, and a cell that sees both can't be.`;
    case "short": return `${shortName(shape, step.cells)} on ${step.digit}: in each lit pair one cell is ${step.digit}, and the pairs' inner ends see each other, so one outer end is ${step.digit}; a cell that sees both outer ends can't be.`;
    case "xchain": return `X-chain on ${step.digit}: follow the lit cells; one end or the other is ${step.digit}, so a cell that sees both ends can't be.`;
    case "colour": return step.wrap ? `Colouring on ${step.digit}: two lit cells of the same colour see each other, so that colour is never ${step.digit}.`
      : `Colouring on ${step.digit}: the lit cells take ${step.digit} in one colour or the other, so a cell that sees both colours can't.`;
    case "xychain": return `XY-chain: through the lit cells, if the first isn't ${step.digit} the last is, so a cell that sees both ends can't be ${step.digit}.`;
    case "cage": return `The cage of ${step.cage.sum} can only add up one way${step.cage.cells.length > 2 ? " or a few" : ""}: the lit cells lose the digits no sum of ${step.cage.sum} allows.`;
    case "cageline": return `The cage of ${step.cage.sum} must hold a ${step.digit}, and it lies in ${U}, so no other cell of ${U} is ${step.digit}.`;
    case "rule45": case "rule45b": {
      const where = step.units.length > 1 ? `${unitName(shape, step.units[0])} to ${unitName(shape, step.units.at(-1))}` : U;
      return `Rule of 45: ${where} adds up to ${n * (n + 1) / 2 * step.units.length}, so the lit cells ${step.virt.side === "in" ? "inside it" : "sticking out of it"} add up to ${step.virt.sum}.`;
    }
    default: return TECHNIQUES[step.tech]?.name || "";
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/** A chain of two strong links by its usual name: two rows or two columns make a skyscraper, a row and a column a
 *  kite, anything through a box a turbot fish. */
function shortName(shape, [a, b, c, d]) {
  const n = shape.n, line = (x, y) => (Math.floor(x / n) === Math.floor(y / n) ? "row" : x % n === y % n ? "col" : "box");
  const one = line(a, b), two = line(c, d);
  return one === "box" || two === "box" ? "Turbot fish" : one === two ? "Skyscraper" : "Kite";
}
