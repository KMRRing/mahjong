// Calcudoku's human-style solver, pure: the techniques a person uses, from the plainest to the hardest, each a function
// that finds one step on the grid as it stands (a digit placed, or candidates struck out) and says why. It does three
// jobs: it grades a grid by the hardest technique it needs, it gives hints (the easiest next step, named, with the
// cells that prove it), and it is the computer player, which works through the same steps at a person's pace
// (calcudoku-bot.js). Every step is sound: tests/calcudoku.mjs runs it over many grids and checks that no step ever
// strikes out or places anything the solution contradicts.
//
// A view is the grid as one player sees it: { shape (calcudoku-grid.js), cages (cagesFor in calcudoku-cage.js: a cage
// whose clue is out of sight has no ways), cageOf, lines (each cage's cells grouped by the rows and columns they share) }.
// A state is { val, cand }: each cell's digit (0 while empty) and its candidates as a bit mask. The techniques run at
// every step of every grade the generator makes, so they work on masks and loops rather than building lists.
import { POP, bit, digitOf, digitsOf, unitName, cellName, seesOf } from "./calcudoku-grid.js";
import { readCage, eachAlive, waysOf, opsFor, targetOf, SIGN } from "./calcudoku-cage.js";

/**
 * The techniques, easiest first, with the rank that sets a grid's level (1 Easy … 4 Expert) and their names. The
 * tiers follow the ones Calcudoku's solvers agree on (Simon Tatham's Keen grades the same way): reading a cage on its
 * own and the singles of a Latin square; then a cage and a line read together, the subsets of a line, and a line's
 * total; then fish, the XY-wing, quads and the total of two or three lines at once; then a contradiction followed
 * through a short chain of the plainest steps.
 */
export const TECHNIQUES = {
  single: { rank: 1, name: "One-cell cage" },
  full: { rank: 1, name: "Last cell" },
  hidden: { rank: 1, name: "Hidden single" },
  naked: { rank: 1, name: "Naked single" },
  cage: { rank: 1, name: "Cage arithmetic" },
  cageline: { rank: 2, name: "Cage in a line" },
  linecage: { rank: 2, name: "Line into a cage" },
  pair: { rank: 2, name: "Naked pair" },
  hpair: { rank: 2, name: "Hidden pair" },
  linesum: { rank: 2, name: "A line's total" },
  triple: { rank: 2, name: "Naked triple" },
  htriple: { rank: 2, name: "Hidden triple" },
  xwing: { rank: 3, name: "X-wing" },
  ywing: { rank: 3, name: "XY-wing" },
  swordfish: { rank: 3, name: "Swordfish" },
  quad: { rank: 3, name: "Naked quad" },
  hquad: { rank: 3, name: "Hidden quad" },
  linesum2: { rank: 3, name: "Lines' total" },
  forcing: { rank: 4, name: "Contradiction" },
};
/** What a grid needs beyond every technique here: it is never dealt. */
export const BEYOND = 5;
/** The most plain steps a contradiction may take to show itself: longer than this, a person wouldn't follow it. */
const CHAIN = 12;

// ---------- the view and the state ----------
/** A view of a grid: its shape, its cages ready to solve, each cell's cage, and each cage's cells by shared line. */
export function viewFor(shape, cages) {
  const cageOf = new Int16Array(shape.cells).fill(-1);
  cages.forEach((c, k) => { for (const i of c.cells) cageOf[i] = k; });
  const lines = cages.map(c => {
    const by = new Map();
    c.cells.forEach((cell, j) => { for (const u of shape.unitsOf[cell]) (by.get(u) || by.set(u, []).get(u)).push(j); });
    return [...by].filter(([, js]) => js.length >= 2);
  });
  return { shape, cages, cageOf, lines };
}
/** The state of a grid with these digits in it (0 for empty): every empty cell's candidates are the digits none of
 *  its peers holds. */
export function stateOf(view, values) {
  const { cells, peers, all } = view.shape, val = Uint8Array.from(values), cand = new Uint16Array(cells);
  for (let i = 0; i < cells; i++) {
    if (val[i]) { cand[i] = bit(val[i]); continue; }
    let seen = 0;
    for (const p of peers[i]) if (val[p]) seen |= bit(val[p]);
    cand[i] = all & ~seen;
  }
  return { val, cand };
}
export const copyState = st => ({ val: st.val.slice(), cand: st.cand.slice() });
export const solved = st => st.val.every(v => v > 0);
/** Places a digit: the cell takes it, and no empty peer may. */
export function place(shape, st, i, d) {
  st.val[i] = d;
  st.cand[i] = bit(d);
  const ps = shape.peers[i], b = ~bit(d);
  for (let k = 0; k < ps.length; k++) if (!st.val[ps[k]]) st.cand[ps[k]] &= b;
}
/** Applies a step: its digit placed, its candidates struck out. */
export function apply(view, st, step) {
  if (step.place) place(view.shape, st, step.place[0], step.place[1]);
  if (step.elim) for (const [c, m] of step.elim) st.cand[c] &= ~m;
}

/** A cage read against the candidates, kept until its cells' candidates change (the same cage is read at every step). */
function read(cage, st, ctx) {
  const memo = ctx?.memo;
  if (!memo) return readCage(cage, st.cand);
  const cs = cage.cells, k = cs.length;
  let e = memo.get(cage.index);
  if (e) {
    let same = true;
    for (let j = 0; j < k; j++) if (e.cand[j] !== st.cand[cs[j]]) { same = false; break; }
    if (same) return e.r;
  } else memo.set(cage.index, (e = { cand: new Uint16Array(k), r: null }));
  for (let j = 0; j < k; j++) e.cand[j] = st.cand[cs[j]];
  e.r = readCage(cage, st.cand);
  return e.r;
}
/** Calls fn with each way of choosing k items of a list (the same array each time); fn returning a value stops. */
function choose(list, k, fn) {
  const picked = [];
  const go = from => {
    if (picked.length === k) return fn(picked);
    for (let i = from; i <= list.length - (k - picked.length); i++) {
      picked.push(list[i]);
      const out = go(i + 1);
      picked.pop();
      if (out) return out;
    }
    return null;
  };
  return go(0);
}
/** The digits placed in a line, as a mask. */
function placedIn(st, cs) { let m = 0; for (let k = 0; k < cs.length; k++) if (st.val[cs[k]]) m |= bit(st.val[cs[k]]); return m; }
/** The cells of a cage that eliminate what `can` (by position) leaves out: [[cell, mask]]. */
function narrowed(cage, st, can) {
  const out = [];
  for (let j = 0; j < cage.cells.length; j++) {
    const c = cage.cells[j], x = st.cand[c] & ~can[j];
    if (!st.val[c] && x) out.push([c, x]);
  }
  return out;
}

// ---------- rank 1: singles and a cage on its own ----------
function oneCell(v, st) {
  for (const cage of v.cages) {
    if (!cage.ways || cage.cells.length !== 1) continue;
    const c = cage.cells[0];
    if (!st.val[c] && st.cand[c] & bit(cage.target)) return { tech: "single", place: [c, cage.target], cells: [c], cage: cage.index };
  }
  return null;
}
function fullHouse(v, st) {
  const { units, all } = v.shape;
  for (let u = 0; u < units.length; u++) {
    const cs = units[u];
    let empty = -1, k = 0;
    for (let x = 0; x < cs.length; x++) if (!st.val[cs[x]]) { empty = cs[x]; k++; }
    const m = all & ~placedIn(st, cs);
    if (k === 1 && POP[m] === 1 && st.cand[empty] & m) return { tech: "full", place: [empty, digitOf(m)], units: [u], cells: [...cs] };
  }
  return null;
}
function hiddenSingle(v, st) {
  const { units, n } = v.shape;
  for (let u = 0; u < units.length; u++) {
    const cs = units[u], have = placedIn(st, cs);
    for (let d = 1; d <= n; d++) {
      if (have & bit(d)) continue;
      let at = -1, k = 0;
      for (let x = 0; x < cs.length && k < 2; x++) if (!st.val[cs[x]] && st.cand[cs[x]] & bit(d)) { k++; at = cs[x]; }
      if (k === 1) return { tech: "hidden", place: [at, d], units: [u], cells: [...cs] };
    }
  }
  return null;
}
function nakedSingle(v, st) {
  for (let c = 0; c < v.shape.cells; c++) if (!st.val[c] && POP[st.cand[c]] === 1) return { tech: "naked", place: [c, digitOf(st.cand[c])], cells: [c] };
  return null;
}
/** A cage's arithmetic: its cells keep only the digits some way of making its target still allows. The tightest cage
 *  first (fewest ways left), as a person sees it first. */
function cageRead(v, st, ctx) {
  let best = null;
  for (const cage of v.cages) {
    if (!cage.ways) continue;
    const r = read(cage, st, ctx);
    if (!r.alive || (best && r.alive >= best.alive)) continue;
    const elim = narrowed(cage, st, r.can);
    if (elim.length) best = { tech: "cage", cage: cage.index, cells: [...cage.cells], elim, alive: r.alive };
  }
  return best;
}

// ---------- rank 2: a cage and a line together, a line's subsets, a line's total ----------
/** Every way of making a cage puts digit d somewhere in its cells on one line: no other cell of that line is d. */
function cageLine(v, st) {
  const { shape } = v;
  for (let k = 0; k < v.cages.length; k++) {
    const cage = v.cages[k], groups = v.lines[k];
    if (!cage.ways || !groups.length) continue;
    const must = groups.map(() => shape.all);
    let any = false;
    eachAlive(cage, st.cand, (W, w) => {
      any = true;
      for (let g = 0; g < groups.length; g++) { let m = 0; for (const j of groups[g][1]) m |= bit(W[w + j]); must[g] &= m; }
    });
    if (!any) continue;
    for (let g = 0; g < groups.length; g++) {
      const [u, js] = groups[g], mine = js.map(j => cage.cells[j]);
      for (const d of digitsOf(must[g])) {
        const elim = [];
        for (const c of shape.units[u]) if (!st.val[c] && st.cand[c] & bit(d) && !mine.includes(c)) elim.push([c, bit(d)]);
        if (elim.length) return { tech: "cageline", cage: k, units: [u], digit: d, cells: mine, elim };
      }
    }
  }
  return null;
}
/** In a line, every place left for digit d is in one cage: that cage holds the d there, which narrows its ways. */
function lineCage(v, st) {
  const { shape } = v;
  for (let u = 0; u < shape.units.length; u++) {
    const cs = shape.units[u], have = placedIn(st, cs);
    for (let d = 1; d <= shape.n; d++) {
      if (have & bit(d)) continue;
      let k = -2, count = 0;
      for (const c of cs) {
        if (st.val[c] || !(st.cand[c] & bit(d))) continue;
        count++;
        k = k === -2 ? v.cageOf[c] : k === v.cageOf[c] ? k : -1;
      }
      if (count < 2 || k < 0 || !v.cages[k].ways) continue;
      const cage = v.cages[k], js = [];
      cage.cells.forEach((c, j) => { if (shape.unitsOf[c].includes(u) && !st.val[c] && st.cand[c] & bit(d)) js.push(j); });
      const can = new Uint16Array(cage.cells.length);
      let any = false;
      eachAlive(cage, st.cand, (W, w) => {
        if (!js.some(j => W[w + j] === d)) return;
        any = true;
        for (let j = 0; j < can.length; j++) can[j] |= bit(W[w + j]);
      });
      if (!any) continue;
      const elim = narrowed(cage, st, can);
      if (elim.length) return { tech: "linecage", cage: k, units: [u], digit: d, cells: js.map(j => cage.cells[j]), elim };
    }
  }
  return null;
}
const SUBSET = { 2: ["pair", "hpair"], 3: ["triple", "htriple"], 4: ["quad", "hquad"] };
/** k cells of a line that hold only k digits between them: no other cell of the line holds any of those digits. */
function naked(k) {
  return (v, st) => {
    const { units } = v.shape;
    for (let u = 0; u < units.length; u++) {
      const open = [], small = [];
      for (const c of units[u]) if (!st.val[c]) { open.push(c); if (POP[st.cand[c]] <= k) small.push(c); }
      if (open.length <= k || small.length < k) continue;
      const step = choose(small, k, set => {
        let m = 0;
        for (const c of set) m |= st.cand[c];
        if (POP[m] !== k) return null;
        const elim = [];
        for (const c of open) if (!set.includes(c) && st.cand[c] & m) elim.push([c, st.cand[c] & m]);
        return elim.length ? { tech: SUBSET[k][0], units: [u], digits: m, cells: [...set], elim } : null;
      });
      if (step) return step;
    }
    return null;
  };
}
/** k digits of a line with only k places between them: those cells hold nothing else. */
function hidden(k) {
  return (v, st) => {
    const { units, n } = v.shape;
    for (let u = 0; u < units.length; u++) {
      const cs = units[u], have = placedIn(st, cs), ds = [], at = [];
      let open = 0;
      for (const c of cs) if (!st.val[c]) open++;
      if (open <= k) continue;
      for (let d = 1; d <= n; d++) {
        if (have & bit(d)) continue;
        let m = 0;                                     // its places, as positions along the line
        for (let x = 0; x < cs.length; x++) if (!st.val[cs[x]] && st.cand[cs[x]] & bit(d)) m |= 1 << x;
        if (POP[m] >= 2 && POP[m] <= k) { ds.push(d); at.push(m); }
      }
      if (ds.length < k) continue;
      const step = choose([...ds.keys()], k, set => {
        let where = 0, m = 0;
        for (const i of set) { where |= at[i]; m |= bit(ds[i]); }
        if (POP[where] !== k) return null;
        const cells = [], elim = [];
        for (let x = 0; x < cs.length; x++) if (where & (1 << x)) { cells.push(cs[x]); if (st.cand[cs[x]] & ~m) elim.push([cs[x], st.cand[cs[x]] & ~m]); }
        return elim.length ? { tech: SUBSET[k][1], units: [u], digits: m, cells, elim } : null;
      });
      if (step) return step;
    }
    return null;
  };
}

/** n! for each side: what a line's digits multiply to. */
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];
const SPANS = new Map();
/** The lines a total is taken over: each row and column alone, or two or three side by side: [{ units, inside }]. */
function spansOf(shape, width) {
  const key = `${shape.n}:${width}`;
  if (SPANS.has(key)) return SPANS.get(key);
  const n = shape.n, out = [];
  for (const base of [0, n]) for (let a = 0; a + width <= n; a++) {
    const units = Array.from({ length: width }, (_, k) => base + a + k), inside = new Uint8Array(shape.cells), cells = [];
    for (const u of units) for (const c of shape.units[u]) { inside[c] = 1; cells.push(c); }
    out.push({ units, inside, cells });
  }
  SPANS.set(key, out);
  return out;
}
/**
 * A line's total: its digits add up to n(n+1)/2 and multiply to n!. Take away the digits placed and every cage wholly
 * inside the lines whose cells left make a known total (a sum cage, or one whose every way left comes to the same),
 * and the few cells left over must make the rest between them: read them as a cage of their own. Two or three lines
 * side by side hold each digit twice or three times, so they add up to twice or three times as much, and two multiply
 * to n! twice over (a person counts the factors rather than the product; three 9×9 lines' product is past what a
 * number holds exactly, so a product is taken over two at most).
 */
function lineTotal(width) {
  return (v, st, ctx) => {
    const { shape } = v, n = shape.n;
    for (const { units, inside, cells } of spansOf(shape, width)) {
      for (const op of width > 2 ? ["+"] : ["+", "x"]) {
        let total = op === "+" ? width * n * (n + 1) / 2 : FACT[n] ** width;
        const left = [], done = new Set();
        for (const c of cells) {
          if (st.val[c]) { total = op === "+" ? total - st.val[c] : total / st.val[c]; continue; }
          const k = v.cageOf[c], cage = v.cages[k];
          let whole = k >= 0 && !!cage.ways;
          if (whole) for (const x of cage.cells) if (!inside[x]) { whole = false; break; }
          if (!whole) { left.push(c); continue; }
          if (done.has(k)) continue;
          done.add(k);
          const t = fixedTotal(cage, st, op);
          if (t == null) { for (const x of cage.cells) if (!st.val[x]) left.push(x); }
          else total = op === "+" ? total - t : total / t;
          if (left.length > 3) break;
        }
        if (!left.length || left.length > 3 || !Number.isInteger(total) || total < 1) continue;
        const index = `${op}${total}:${left.join(",")}`;
        let ways = ctx?.virt?.get(index);
        if (!ways) { ways = waysOf(shape, left, op, total); ctx?.virt?.set(index, ways); }
        const r = readCage({ cells: left, ways }, st.cand);
        if (!r.alive) continue;
        const elim = [];
        left.forEach((c, j) => { if (st.cand[c] & ~r.can[j]) elim.push([c, st.cand[c] & ~r.can[j]]); });
        if (elim.length) return { tech: width === 1 ? "linesum" : "linesum2", units, cells: left, virt: { op, target: total }, elim };
      }
    }
    return null;
  };
}
/** What a cage's empty cells come to, if every way left gives the same total (a sum cage always does), else null. */
function fixedTotal(cage, st, op) {
  const open = [];
  cage.cells.forEach((c, j) => { if (!st.val[c]) open.push(j); });
  let t = null, same = true;
  eachAlive(cage, st.cand, (W, w) => {
    let x = op === "+" ? 0 : 1;
    for (const j of open) x = op === "+" ? x + W[w + j] : x * W[w + j];
    if (t == null) t = x;
    else if (t !== x) return (same = false);
    return true;
  });
  return same ? t : null;
}

// ---------- rank 3: fish, the XY-wing ----------
const FISH = { 2: "xwing", 3: "swordfish" };
/** On a digit: in k rows its places all fall in the same k columns (or the other way round), so no other cell of those
 *  columns holds it. */
function fish(k) {
  return (v, st) => {
    const { shape } = v, n = shape.n;
    for (let d = 1; d <= n; d++) {
      const b = bit(d);
      for (const [base, off] of [[shape.rows, 0], [shape.cols, n]]) {
        const lines = [], masks = [];
        for (let x = 0; x < n; x++) {
          let m = 0, placed = false;
          for (let y = 0; y < n; y++) { const c = base[x][y]; if (st.val[c] === d) { placed = true; break; } if (!st.val[c] && st.cand[c] & b) m |= 1 << y; }
          if (!placed && POP[m] >= 2 && POP[m] <= k) { lines.push(x); masks.push(m); }
        }
        if (lines.length < k) continue;
        const step = choose([...lines.keys()], k, set => {
          let across = 0;
          for (const i of set) across |= masks[i];
          if (POP[across] !== k) return null;
          const xs = set.map(i => lines[i]), elim = [];
          for (let y = 0; y < n; y++) if (across & (1 << y)) for (let x = 0; x < n; x++) {
            const c = base[x][y];
            if (!xs.includes(x) && !st.val[c] && st.cand[c] & b) elim.push([c, b]);
          }
          if (!elim.length) return null;
          const cells = [];
          for (const i of set) for (let y = 0; y < n; y++) if (masks[i] & (1 << y)) cells.push(base[lines[i]][y]);
          return { tech: FISH[k], digit: d, units: xs.map(x => off + x), cells, elim };
        });
        if (step) return step;
      }
    }
    return null;
  };
}
/** A cell of two digits XY sees one of XZ and one of YZ: whichever it takes, one of the two is Z, so a cell that sees
 *  both can't be. */
function yWing(v, st) {
  const { shape } = v, two = [];
  for (let c = 0; c < shape.cells; c++) if (!st.val[c] && POP[st.cand[c]] === 2) two.push(c);
  for (const p of two) {
    const xy = st.cand[p], wings = [];
    for (const c of two) if (c !== p && seesOf(shape, p, c) && POP[st.cand[c] & xy] === 1) wings.push(c);
    for (const a of wings) for (const b of wings) {
      if (b <= a || (st.cand[a] & xy) === (st.cand[b] & xy)) continue;
      const z = st.cand[a] & ~xy;
      if (z !== (st.cand[b] & ~xy) || POP[z] !== 1) continue;
      const elim = [];
      for (let c = 0; c < shape.cells; c++) if (c !== p && c !== a && c !== b && !st.val[c] && st.cand[c] & z && seesOf(shape, c, a) && seesOf(shape, c, b)) elim.push([c, z]);
      if (elim.length) return { tech: "ywing", digit: digitOf(z), cells: [p, a, b], elim };
    }
  }
  return null;
}

// ---------- rank 4: a contradiction ----------
/** What's broken in a state, if anything: a cell with no digit left, a digit a line can't place, or a cage that can no
 *  longer make its target. */
function broken(v, st, ctx) {
  const { shape } = v;
  for (let c = 0; c < shape.cells; c++) if (!st.cand[c]) return { cells: [c] };
  for (let u = 0; u < shape.units.length; u++) {
    let m = 0;
    for (const c of shape.units[u]) m |= st.cand[c];
    if (m !== shape.all) { const miss = shape.all & ~m; return { units: [u], digit: digitOf(miss & -miss) }; }
  }
  for (const cage of v.cages) if (cage.ways && !read(cage, st, ctx).alive) return { cage: cage.index };
  return null;
}
/**
 * Supposing a cell of two candidates took one of them: the plainest steps from there (singles and cages read on their
 * own) break the grid within a few moves, so it takes the other. The shortest such chain is the step.
 */
function forcing(v, st, ctx) {
  const { shape } = v;
  let best = null;
  for (let c = 0; c < shape.cells; c++) {
    if (st.val[c] || POP[st.cand[c]] !== 2) continue;
    for (const d of digitsOf(st.cand[c])) {
      const trial = copyState(st), path = [c];
      place(shape, trial, c, d);
      let why = broken(v, trial, ctx);
      for (let s = 0; !why && s < CHAIN && (!best || path.length < best.path.length); s++) {
        const step = nextStep(v, trial, { upTo: 1, ctx });
        if (!step) break;
        apply(v, trial, step);
        if (step.place) path.push(step.place[0]);
        why = broken(v, trial, ctx);
      }
      if (why && (!best || path.length < best.path.length)) best = { c, d, path, why };
    }
  }
  if (!best) return null;
  const other = digitOf(st.cand[best.c] & ~bit(best.d));
  return { tech: "forcing", place: [best.c, other], assumed: [best.c, best.d], cells: best.path, why: best.why };
}

// ---------- solving ----------
const FIND = [
  ["single", oneCell], ["full", fullHouse], ["hidden", hiddenSingle], ["naked", nakedSingle], ["cage", cageRead],
  ["cageline", cageLine], ["linecage", lineCage], ["pair", naked(2)], ["hpair", hidden(2)], ["linesum", lineTotal(1)],
  ["triple", naked(3)], ["htriple", hidden(3)],
  ["xwing", fish(2)], ["ywing", yWing], ["swordfish", fish(3)], ["quad", naked(4)], ["hquad", hidden(4)], ["linesum2", lineTotal(2)], ["linesum2", lineTotal(3)],
  ["forcing", forcing],
];
export const freshCtx = () => ({ memo: new Map(), virt: new Map() });

/** The easiest step from here, among the techniques up to `upTo` (a rank), or null when none applies. */
export function nextStep(view, st, { upTo = 4, ctx = freshCtx() } = {}) {
  for (const [tech, find] of FIND) {
    if (TECHNIQUES[tech].rank > upTo) continue;
    const step = find(view, st, ctx);
    if (step) { step.rank = TECHNIQUES[tech].rank; return step; }
  }
  return null;
}
/**
 * Solves a grid the way a person would, always taking the easiest step: { solved, rank (the hardest technique it
 * needed; BEYOND if it got stuck), steps, uses (how many times each technique), state }.
 */
export function grade(view, values, { upTo = 4, limit = 3000 } = {}) {
  const st = stateOf(view, values), uses = {}, steps = [], ctx = freshCtx();
  let rank = 1;
  for (let k = 0; k < limit && !solved(st); k++) {
    const step = nextStep(view, st, { upTo, ctx });
    if (!step) return { solved: false, rank: BEYOND, steps, uses, state: st };
    apply(view, st, step);
    steps.push(step);
    uses[step.tech] = (uses[step.tech] || 0) + 1;
    if (step.rank > rank) rank = step.rank;
  }
  return { solved: solved(st), rank: solved(st) ? rank : BEYOND, steps, uses, state: st };
}

// ---------- in words ----------
const listOf = xs => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const orList = xs => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
const digitList = m => listOf(digitsOf(m).map(String));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/** "a 5", "an 8". */
const aDigit = d => `${d === 8 ? "an" : "a"} ${d}`;
/** A large number grouped in thousands, as it's read: 362,880. */
const big = x => x.toLocaleString("en-GB");
/** A cage as a hint names it: "the 12× cage", "the cage of 7" (its operation hidden). */
export function cageName(cage) {
  if (!cage || cage.target == null) return "the lit cage";
  return cage.op === "?" ? `the cage of ${cage.target}` : cage.cells.length === 1 ? `the one-cell cage of ${cage.target}` : `the ${cage.target}${SIGN[cage.op]} cage`;
}
/** The different ways a cage can still be made, as a person writes them ("3 × 4", "6 − 2"), or null past `most` or
 *  past what a line under the grid holds. */
function waysInWords(cage, st, most = 3) {
  const seen = new Map();
  eachAlive(cage, st.cand, (W, w) => {
    const ds = [...W.subarray(w, w + cage.cells.length)].sort((a, b) => a - b), key = ds.join("");
    if (seen.has(key)) return true;
    const op = cage.op === "?" ? opsFor(ds.length).find(o => targetOf(o, ds) === cage.target) : cage.op;
    seen.set(key, (op === "-" || op === "/" ? ds.reverse() : ds).join(` ${SIGN[op]} `));
    return seen.size <= most;
  });
  const out = [...seen.values()];
  return seen.size <= most && orList(out).length <= 44 ? out : null;
}
/** A step as a hint says it: what to look at, and why it follows. st: the state it was found on (for a cage's ways). */
export function say(view, step, st = null) {
  const { shape } = view, n = shape.n, U = step.units?.length ? unitName(shape, step.units[0]) : "";
  const cage = step.cage != null ? view.cages[step.cage] : null;
  switch (step.tech) {
    case "single": return `${cap(cageName(cage))} is a single cell, so it holds its own target: ${step.place[1]}.`;
    case "full": return `${cap(U)} has one empty cell left: it takes the ${step.place[1]} the line is missing.`;
    case "hidden": return `In ${U}, only one cell can still take the ${step.place[1]}: it's ruled out of every other.`;
    case "naked": return `${cap(cellName(n, step.cells[0]))} can only be ${step.place[1]}: every other digit is ruled out of it.`;
    case "cage": {
      const ways = st ? waysInWords(cage, st) : null;
      return ways ? `${cap(cageName(cage))} can only be made as ${orList(ways)} here, so the lit cells lose every other digit.`
        : `Of the ways to make ${cageName(cage)}, only some still fit its rows and columns: the lit cells lose the digits none of them uses.`;
    }
    case "cageline": return `Every way to make ${cageName(cage)} puts ${aDigit(step.digit)} in its lit cells, all in ${U}: no other cell there is ${step.digit}.`;
    case "linecage": return `In ${U}, only the lit cells of ${cageName(cage)} can take the ${step.digit}, so the cage holds it there: its other cells narrow.`;
    case "pair": case "triple": case "quad":
      return `In ${U}, the lit cells hold only ${digitList(step.digits)} between them, so no other cell of ${U} can be ${digitsOf(step.digits).length === 2 ? "either" : "any of them"}.`;
    case "hpair": case "htriple": case "hquad":
      return `In ${U}, ${digitList(step.digits)} can only go in the lit cells, so those cells hold nothing else.`;
    case "linesum": case "linesum2": {
      const num = u => (u < n ? u + 1 : u - n + 1), us = step.units;
      const lines = us.length === 1 ? cap(U) : `${us[0] < n ? "Rows" : "Columns"} ${num(us[0])} ${us.length === 2 ? "and" : "to"} ${num(us.at(-1))}`;
      const sum = step.virt.op === "+", k = step.units.length;
      const whole = k > 1 && !sum ? `hold each digit ${k === 2 ? "twice" : "three times"}` : sum ? `add${k > 1 ? "" : "s"} up to ${k * n * (n + 1) / 2}` : `multiplies to ${big(FACT[n])}`;
      return `${lines} ${whole}; less what's placed and the cages wholly inside, the lit cells ${sum ? "add up to" : "multiply to"} ${big(step.virt.target)}.`;
    }
    case "xwing": case "swordfish":
      return `${TECHNIQUES[step.tech].name} on ${step.digit}: in the lit lines every ${step.digit} falls in the same ${step.tech === "xwing" ? "two" : "three"} crossing lines, so ${step.digit} is struck from the rest of those.`;
    case "ywing": return `XY-wing: whichever digit the first lit cell takes, one of the other two is ${step.digit}, so a cell that sees both can't be ${step.digit}.`;
    case "forcing": {
      const [c, d] = step.assumed, w = step.why;
      const end = w.cage != null ? `${cageName(view.cages[w.cage])} could no longer be made` : w.units ? `${unitName(shape, w.units[0])} would have nowhere for its ${w.digit}` : `${cellName(n, w.cells[0])} would have no digit left`;
      return `Suppose ${cellName(n, c)} were ${d}: follow the lit cells and ${end}. So it's ${step.place[1]}.`;
    }
    default: return TECHNIQUES[step.tech]?.name || "";
  }
}
