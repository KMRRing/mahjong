// Calcudoku's rules and its grids, pure (no DOM), shared by the page, its worker (calcudoku-worker.js) and
// tests/calcudoku.mjs.
//
// The rules are the usual ones (the genre KenKen made famous): fill an n×n grid so that every row and every column
// holds each digit 1..n once; the grid is cut into cages, each with a target and an operation, and a cage's digits
// make its target by its operation (+ and × over any number of cells, − and ÷ over two, the larger first). A digit may
// repeat in a cage where its cells share no row or column. Hidden shows the targets alone; Products has every cage a
// product.
//
// How a grid is made (generate): a random Latin square first (calcudoku-solve.js fills an empty grid at random); then
// it's cut into cages grown from random cells to sizes drawn from the level's odds, each given a clue its digits make.
// The human-style solver (calcudoku-logic.js) works on it with the techniques up to the level's hardest. Where it gets
// stuck, a short search by the exact solver looks for a second solution: if there is one, a cage where the two differ
// is given another clue that rules it out (or is split in two); if not, the grid is only too hard there, and a cage
// there is given the sharpest clue its digits make (or is split). Once the solver finishes it, cages are joined while
// it still does (the lone cells past the level's few first, then, while the grid is easier than its level, the cages
// that gave the solver its first footholds), and last of all the exact solver counts its solutions, up to two. A try
// that misses is thrown away for the next seed in the same stream, so a seed always makes the same grid.
import { shapeOf, rng, mix, below, shuffle, weighted, nearOf, connected, POP } from "./calcudoku-grid.js";
import { opsFor, targetOf, holds, cagesFor } from "./calcudoku-cage.js";
import { solver, latinSquare } from "./calcudoku-solve.js";
import { viewFor, grade, stateOf, nextStep, apply, freshCtx } from "./calcudoku-logic.js";

export const RULES = {
  classic: { label: "Classic", note: "Each cage's target and operation" },
  hidden: { label: "Hidden", note: "Only the targets: the operations are yours to find" },
  products: { label: "Products", note: "Every cage a product" },
};
export const SIZES = Object.fromEntries([4, 5, 6, 7, 8, 9].map(n => [n, { label: `${n}×${n}` }]));
export const LEVELS = {
  easy: { rank: 1, label: "Easy", note: "Cages read on their own, and singles" },
  medium: { rank: 2, label: "Medium", note: "Cages read with their lines, pairs, a line's total" },
  hard: { rank: 3, label: "Hard", note: "Fish, wings, several lines' totals" },
  expert: { rank: 4, label: "Expert", note: "A contradiction followed through" },
};
/** Today's grid, the same for everyone: a classic 6×6 at Medium. */
export const DAILY = { rules: "classic", size: 6, level: "medium" };

/**
 * What each level asks of a grid, by its rules and size: { lo, hi } the ranks of the hardest technique it may need
 * (calcudoku-logic.js: 1 cages on their own and singles, 2 a cage with its lines, subsets and a line's total, 3 fish,
 * wings and several lines, 4 a contradiction). A 4×4 is over before anything harder than a cage and a line comes up,
 * so it has Easy and Medium; a 5×5 adds Hard (but not in Products, whose cages say so much that a 5×5 hardly ever
 * needs more than a cage and a line); from 6×6 up there are all four.
 */
export function levelsOf(rules, n) {
  n = Number(n);
  if (n === 4 || (n === 5 && rules === "products")) return { easy: { lo: 1, hi: 1 }, medium: { lo: 2, hi: 4 } };
  if (n === 5) return { easy: { lo: 1, hi: 1 }, medium: { lo: 2, hi: 2 }, hard: { lo: 3, hi: 4 } };
  return { easy: { lo: 1, hi: 1 }, medium: { lo: 2, hi: 2 }, hard: { lo: 3, hi: 3 }, expert: { lo: 4, hi: 4 } };
}
/** The nearest level a size offers (a 4×4 has no Hard, a 5×5 no Expert). */
export function levelFor(rules, n, level) {
  const have = Object.keys(levelsOf(rules, n));
  return have.includes(level) ? level : have.at(-1);
}
/** The level a grid of this rank is, for these rules and size. */
const levelAt = (rules, n, rank) => Object.entries(levelsOf(rules, n)).find(([, s]) => rank >= s.lo && rank <= s.hi)?.[0] || "easy";

/**
 * Cage sizes by level, as the odds of each size from one cell up: an Easy grid has small cages, whose few ways of
 * being made give digits away; harder grids have longer cages, and fewer of them. A cage of one cell is a digit given
 * in all but name: an Easy grid keeps up to half a line of them, harder ones one to three, by size.
 */
const ODDS = { 1: [0, 1, 6, 3, 0.4], 2: [0, 0.4, 5, 4, 1.2], 3: [0, 0.2, 4, 4, 2.2, 0.4], 4: [0, 0.2, 3.5, 4, 2.6, 0.6] };
const SINGLES = (rank, n) => (rank === 1 ? Math.ceil(n / 2) : rank === 2 ? (n >= 7 ? 3 : 2) : n >= 7 ? 2 : 1);
const TRIES = 120;                 // cuts tried for a level before the nearest one is taken
/** The largest product a classic cage is given: past it a cage adds up (a phone's corner can't hold "5184×"). */
const MOST_PRODUCT = 999;
/** The largest target any cage has: a 9×9's corner holds four digits and a sign, so a Products cage that would
 *  multiply past it ("12096×") is split. */
const MOST_TARGET = 9999;
/** The most ways a cage may have of making its target: past that it's more than a person weighs (a 9×9's six cells
 *  adding up to 27 have tens of thousands), so it's split, and never made by a join. */
const MOST_WAYS = 800;

// ---------- making a grid ----------
/**
 * A grid of these rules, size and level, made from the seed: { seed, rules, n, level, rank (what it needs, 1..4),
 * solution, cages: [{ cells, op, target }], uses (techniques the solver used), tries }. The same seed always makes
 * the same grid.
 */
export function generate({ seed, rules = "classic", size = 6, level = "medium" }) {
  const n = Number(size);
  level = levelFor(rules, n, level);
  const spec = levelsOf(rules, n)[level], rank = LEVELS[level].rank;
  let nearest = null;
  for (let t = 0; t < TRIES; t++) {
    const r = rng(mix(seed, rules, n, level, t));
    const made = attempt(n, rules, spec, rank, r);
    if (!made) continue;
    const out = { seed, rules, n, level, ...made, tries: t + 1 };
    if (made.rank >= spec.lo && made.rank <= spec.hi) return out;
    // the nearest yet, if none comes out at the level: under it rather than over it (a hard grid is never dealt as easy)
    if (made.rank < spec.lo && (!nearest || made.rank > nearest.rank)) nearest = out;
  }
  if (nearest) return { ...nearest, level: levelAt(rules, n, nearest.rank) };
  const ids = Object.keys(levelsOf(rules, n)), lower = ids.indexOf(level) - 1;
  return generate({ seed, rules: lower >= 0 ? rules : "classic", size: n, level: lower >= 0 ? ids[lower] : "easy" });
}

/** One try: a Latin square cut into cages, clued, made to have one solution, then brought to the level. */
function attempt(n, rules, spec, rank, r) {
  const shape = shapeOf(n), solution = latinSquare(shape, r);
  // cages of five only on the larger grids (Hard and Expert have them)
  const cut = cutOf(n, solution, rules, n >= 7 ? ODDS[rank] : ODDS[rank].slice(0, 5), SINGLES(rank, n), r);
  for (let big; (big = cut.unwieldy()) >= 0;) if (!cut.split(big)) return null;
  // Graded with the techniques up to the level's hardest. A grid the solver finishes has one solution: every step is
  // sound, so nothing but the solution it found survives them. One it can't finish is either too hard or has a second
  // solution: a short search for one (limit 2) says which, and the second is ruled out where the two differ (another
  // clue for a cage there, or the cage split); else, where the solver got stuck (the cells nearest to being settled),
  // a cage is given the sharpest clue its digits make (the one with the fewest ways), or split.
  const gradeNow = () => gradeCut(cut, spec.hi), cells = shape.cells, bySize = ks => shuffle(r, [...new Set(ks)]).sort((a, b) => cut.sizeOf(b) - cut.sizeOf(a));
  let g = gradeNow();
  for (let k = 0; !g.solved; k++) {
    if (k >= 16) return null;
    const res = solver(shape, solvable(cut)).solve(new Uint8Array(cells), { limit: 2, maxNodes: 300 });
    const other = res.count === 2 ? res.solutions.find(s => s.some((d, i) => d !== solution[i])) : null;
    if (other) {
      const ks = bySize([...Array(cells).keys()].filter(i => other[i] !== solution[i]).map(c => cut.cageOf[c]));
      if (!ks.some(c => cut.reclue(c, other)) && !ks.some(cut.split)) return null;
    } else {
      const open = [...Array(cells).keys()].filter(c => !g.state.val[c]).sort((a, b) => POP[g.state.cand[a]] - POP[g.state.cand[b]]).slice(0, 6);
      const ks = bySize(open.map(c => cut.cageOf[c]));
      if (!ks.some(cut.sharpen) && !ks.some(cut.split)) return null;
    }
    g = gradeNow();
  }
  // Then cages are joined while the solver still finishes the grid within the level, which also proves it still has
  // one solution (every step is sound, so a grid the solver finishes has only the solution it found): first the lone
  // cells past the level's few, each into a neighbour; then, while it's too easy, any two neighbours.
  const most = SINGLES(rank, n), lone = () => cut.cages().filter(c => c.cells.length === 1);
  const tryJoin = cell => {
    const undo = cut.join(cell);
    if (!undo) return;
    const was = g;
    g = gradeNow();
    if (!g.solved) { undo(); g = was; }
  };
  for (let k = 0; k < 3 * n && lone().length > most; k++) { const cs = lone(); tryJoin(cs[below(r, cs.length)].cells[0]); }
  // too easy: a cage that gave the solver one of its first footholds is joined to a neighbour (a random join hardens
  // a grid less often: most cages are read only once the rest has narrowed them)
  for (let k = 0; g.rank < spec.lo && k < 14; k++) {
    const early = g.steps.slice(0, Math.ceil(g.steps.length / 3)).filter(s => s.tech === "cage" || s.tech === "single").flatMap(s => s.cells);
    tryJoin(early.length ? early[below(r, early.length)] : undefined);
  }
  const cages = cut.cages();
  if (lone().length > most) return null;
  // the last word: the exact solver counts its solutions, up to two (on a finished grid it takes milliseconds)
  const proof = solver(shape, solvable(cut)).solve(new Uint8Array(cells), { limit: 2, maxNodes: 20000 });
  if (proof.count !== 1 || proof.aborted) return null;
  return { rank: g.rank, solution, cages, uses: g.uses, count: cages.length };
}
/** The cut's cages ready to solve, their ways kept between looks. */
const solvable = cut => cagesFor(cut.shape, cut.cages(), { hidden: cut.rules === "hidden", cache: cut.ways });
const gradeCut = (cut, upTo) => grade(viewFor(cut.shape, solvable(cut)), new Uint8Array(cut.shape.cells), { upTo });

/**
 * A Latin square cut into clued cages: { shape, rules, solution, cageOf, ways, cages(), sizeOf(k), unwieldy(),
 * reclue(k, other), split(k), join() }. Cages grow from random cells to sizes drawn from `odds`; a cell left on its
 * own joins a neighbouring cage once there are as many lone cells as the level keeps. ways: every cage's ways, kept
 * by its cells and clue, for the solvers that look at the same cut again and again.
 */
export function cutOf(n, solution, rules, odds, singles, r) {
  const shape = shapeOf(n), cells = n * n, cageOf = new Int16Array(cells).fill(-1), clue = new Map(), ways = new Map();
  const most = odds.length - 1;
  let next = 0;
  const pickSize = () => { let x = r() * odds.reduce((a, b) => a + b, 0); for (let s = 0; s < odds.length; s++) { x -= odds[s]; if (x < 0) return s; } return most; };
  for (const a of shuffle(r, [...Array(cells).keys()])) {
    if (cageOf[a] >= 0) continue;
    const k = next++, want = Math.max(1, pickSize()), mine = [a];
    cageOf[a] = k;
    while (mine.length < want) {
      const edge = [...new Set(mine.flatMap(c => nearOf(n, c)))].filter(j => cageOf[j] < 0);
      if (!edge.length) break;
      const j = edge[below(r, edge.length)];
      cageOf[j] = k;
      mine.push(j);
    }
  }
  const members = () => { const m = new Map(); for (let i = 0; i < cells; i++) (m.get(cageOf[i]) || m.set(cageOf[i], []).get(cageOf[i])).push(i); return m; };
  // lone cells past the level's few join a neighbour (one cell past the usual size if need be)
  let lone = [...members().values()].filter(cs => cs.length === 1).map(cs => cs[0]);
  for (const a of shuffle(r, lone)) {
    const map = members();
    if ([...map.values()].filter(cs => cs.length === 1).length <= singles) break;
    if (map.get(cageOf[a]).length !== 1) continue;
    const homes = [...new Set(nearOf(n, a).map(j => cageOf[j]))].filter(h => h !== cageOf[a] && map.get(h).length <= most);
    if (homes.length) cageOf[a] = homes[below(r, homes.length)];
  }
  const sizeOf = k => { let s = 0; for (let i = 0; i < cells; i++) if (cageOf[i] === k) s++; return s; };
  const cellsOf = k => { const out = []; for (let i = 0; i < cells; i++) if (cageOf[i] === k) out.push(i); return out; };
  const clueOf = k => { if (!clue.has(k)) clue.set(k, clueFor(cellsOf(k).map(c => solution[c]), rules, r)); return clue.get(k); };
  const cages = () => [...members().entries()].sort((a, b) => a[1][0] - b[1][0]).map(([k, cs]) => ({ cells: cs, ...clueOf(k) }));
  const waysIn = k => { const cs = cellsOf(k); return cagesFor(shape, [{ cells: cs, ...clueOf(k) }], { hidden: rules === "hidden", cache: ways })[0].ways.length / cs.length; };
  /** A cage with more ways than a person weighs (MOST_WAYS), or a target longer than its corner holds; -1 if none. */
  const tooMuch = k => clueOf(k).target > MOST_TARGET || (sizeOf(k) > 2 && waysIn(k) > MOST_WAYS);
  const unwieldy = () => { for (const k of members().keys()) if (tooMuch(k)) return k; return -1; };
  /** Another clue for cage k that its own digits make but `other`'s don't: true if there was one. */
  const reclue = (k, other) => {
    const cs = cellsOf(k), ds = cs.map(c => solution[c]), theirs = cs.map(c => other[c]), now = clueOf(k);
    const ops = rules === "products" || cs.length === 1 ? [] : opsFor(cs.length).filter(op => op !== now.op && (op !== "x" || cs.length < 3 || targetOf("x", ds) <= MOST_PRODUCT));
    const fits = shuffle(r, ops).filter(op => { const t = targetOf(op, ds); return t != null && !holds(rules === "hidden" ? "?" : op, t, theirs); });
    if (!fits.length) return false;
    clue.set(k, { op: fits[0], target: targetOf(fits[0], ds) });
    return true;
  };
  /** Cage k in two, each part in one piece, each with a clue of its own; false if it can't be. */
  const split = k => {
    const cs = cellsOf(k);
    if (cs.length < 2) return false;
    const half = Math.floor(cs.length / 2);
    for (let t = 0; t < 8; t++) {
      const start = cs[below(r, cs.length)], part = new Set([start]), grow = [start];
      while (part.size < half && grow.length) {
        const from = grow[below(r, grow.length)], nb = nearOf(n, from).filter(j => cageOf[j] === k && !part.has(j));
        if (!nb.length) { grow.splice(grow.indexOf(from), 1); continue; }
        const j = nb[below(r, nb.length)];
        part.add(j); grow.push(j);
      }
      if (!connected(n, cs.filter(c => !part.has(c)))) continue;
      const fresh = next++;
      for (const c of part) cageOf[c] = fresh;
      clue.delete(k);
      return true;
    }
    return false;
  };
  /** Cage k's clue swapped for the one its digits make with the fewest ways, if that's fewer: true if it changed. */
  const sharpen = k => {
    const cs = cellsOf(k);
    if (cs.length === 1 || rules === "products") return false;
    const ds = cs.map(c => solution[c]), was = clueOf(k);
    let best = null, fewest = waysIn(k);
    for (const op of opsFor(cs.length)) {
      const target = targetOf(op, ds);
      if (target == null || op === was.op || (op === "x" && cs.length > 2 && target > MOST_PRODUCT)) continue;
      clue.set(k, { op, target });
      const w = waysIn(k);
      if (w < fewest) { fewest = w; best = { op, target }; }
    }
    clue.set(k, best || was);
    return !!best;
  };
  /** Joins the cage of cell a (a random one if not given) and a neighbouring cage into one, with a clue of its own:
   *  returns the way to undo it, or null (none to join, or the cage they'd make is unwieldy). */
  const join = (a = below(r, cells)) => {
    const map = members(), ka = cageOf[a], mine = map.get(ka);
    const nbrs = [...new Set(mine.flatMap(c => nearOf(n, c)).map(j => cageOf[j]))].filter(k => k !== ka && map.get(k).length + mine.length <= Math.max(most, 3));
    if (!nbrs.length) return null;
    const before = cageOf.slice(), kept = new Map(clue), kb = nbrs[below(r, nbrs.length)];
    for (const c of map.get(kb)) cageOf[c] = ka;
    clue.delete(ka); clue.delete(kb);
    const undo = () => { cageOf.set(before); clue.clear(); for (const [k, v] of kept) clue.set(k, v); };
    if (tooMuch(ka)) { undo(); return null; }
    return undo;
  };
  return { shape, rules, solution, cageOf, ways, cages, sizeOf, unwieldy, reclue, sharpen, split, join };
}

/**
 * A clue for a cage with these digits: a cage of one cell is its digit; two cells are a quotient where one divides
 * the other (as printed puzzles favour), else most often a difference; longer cages a sum or a product (a product
 * no larger than a corner can hold). Products has every cage a product.
 */
function clueFor(ds, rules, r) {
  if (ds.length === 1) return { op: "=", target: ds[0] };
  if (rules === "products") return { op: "x", target: targetOf("x", ds) };
  let op;
  if (ds.length === 2) op = weighted(r, targetOf("/", ds) != null ? [["/", 4], ["-", 3], ["+", 1.5], ["x", 1.5]] : [["-", 5], ["+", 2.5], ["x", 2.5]]);
  else op = targetOf("x", ds) <= MOST_PRODUCT && r() < 0.45 ? "x" : "+";
  return { op, target: targetOf(op, ds) };
}

// ---------- playing together: the clues split between the players ----------
/**
 * Together, each player sees only part of the cages' clues (every cage is outlined on every screen, but a clue only
 * someone else holds shows as "?"), and what anyone places is everyone's. Half the clues each is too little to get
 * far, so every clue is dealt to one player (in reading order, round the table), and then, a few at a time and at
 * random, clues are shown to everyone, until the relay below finishes: each player works out what they can from what
 * they see, what they find goes to the others, and round again. Shown at random, more are shown than the relay needs
 * (on a hard grid a player was left holding none), so each shared clue is then offered back to whoever holds fewest,
 * and kept private where the relay still finishes. So each player holds clues the others need, and the table can
 * always finish without a word (talking is quicker).
 *
 * A split is a string, a character a cage: the player ("0".."5") who alone sees its clue, or "*" for everyone.
 */
export function splitFor(p, k, seed) {
  k = Math.max(2, Math.min(6, k | 0));
  const r = rng(mix(seed, "split", k)), shape = shapeOf(p.n), zeros = new Uint8Array(shape.cells), cache = new Map();
  const finishes = parts => relay(p, parts.join(""), k, { cache }).done;
  const alone = parts => [...Array(k).keys()].some(q => solver(shape, viewOf(p, parts.join(""), q, cache).view.cages).solve(zeros, { limit: 2, maxNodes: 20000 }).count < 2);
  let last = null;
  for (let deal = 0; deal < 4; deal++) {
    const parts = [], start = below(r, k);
    p.cages.forEach((c, i) => { parts[i] = String((start + i) % k); });
    // a few at once while most are still private (a whole relay is the price of each look), then one at a time
    for (let t = 0; t < 200 && !finishes(parts); t++) {
      const held = [...parts.keys()].filter(i => /\d/.test(parts[i]));
      if (!held.length) break;
      for (const i of shuffle(r, held).slice(0, Math.max(1, Math.floor(held.length / 8)))) parts[i] = "*";
    }
    for (const i of shuffle(r, [...parts.keys()].filter(i => parts[i] === "*"))) {
      const held = [...Array(k).keys()].map(q => parts.filter(x => x === String(q)).length), fewest = Math.min(...held);
      const qs = [...held.keys()].filter(q => held[q] === fewest);
      parts[i] = String(qs[below(r, qs.length)]);
      if (!finishes(parts)) parts[i] = "*";
    }
    last = parts.join("");
    // a split where someone could finish alone isn't one: deal again
    if (!alone(parts)) return last;
  }
  return last;
}
/** What one player of a split sees: { view (calcudoku-logic.js), seen (by cage) }; q null sees everything. cache: the
 *  cages' ways, kept between looks at the same grid. */
export function viewOf(p, split, q, cache = null) {
  const shape = shapeOf(p.n), seen = p.cages.map((_, i) => !split || q == null || split[i] === "*" || split[i] === String(q));
  return { view: viewFor(shape, cagesFor(shape, p.cages, { hidden: p.rules === "hidden", seen, cache })), seen };
}
/**
 * The relay for a split: in each round every player works out all they can from their own view with the techniques up
 * to the grid's own level, and what they found is placed for everyone. { done, rounds, credit (cells each found
 * first; a cell two found at once counts half to each), placed }.
 */
export function relay(p, split, k, { upTo = p.rank || 1, cache = null } = {}) {
  const cells = p.n * p.n, placed = new Uint8Array(cells), credit = new Array(k).fill(0);
  const views = [...Array(k).keys()].map(q => viewOf(p, split, q, cache).view), ctxs = views.map(() => freshCtx());
  let rounds = 0, left = cells;
  while (left > 0 && rounds < 40) {
    const found = new Map();                         // cell -> [digit, players]
    views.forEach((view, q) => {
      const st = stateOf(view, placed);
      for (let s = 0; s < 600; s++) {
        const step = nextStep(view, st, { upTo, ctx: ctxs[q] });
        if (!step) break;
        apply(view, st, step);
        if (step.place && !placed[step.place[0]]) {
          const f = found.get(step.place[0]);
          if (f) f[1].push(q); else found.set(step.place[0], [step.place[1], [q]]);
        }
      }
    });
    if (!found.size) break;
    for (const [i, [d, who]] of found) { placed[i] = d; left--; for (const q of who) credit[q] += 1 / who.length; }
    rounds++;
  }
  return { done: left === 0, rounds, credit, placed };
}

// ---------- as text: for the saved run, a match, and a link ----------
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
/** A grid as strings: { s (the solution), k (each cell's cage), o (each cage's operation), t (the targets) }. */
export function encode(p) {
  const cells = p.n * p.n, of = new Int16Array(cells), wide = p.cages.length > 36;
  p.cages.forEach((c, k) => c.cells.forEach(i => { of[i] = k; }));
  return { rules: p.rules, n: p.n, level: p.level, rank: p.rank, seed: p.seed, s: [...p.solution].join(""),
    k: [...of].map(k => (wide ? B36[Math.floor(k / 36)] + B36[k % 36] : B36[k])).join(""),
    o: p.cages.map(c => c.op).join(""), t: p.cages.map(c => c.target).join(".") };
}
export function decode(e) {
  const n = Number(e.n), cells = n * n, wide = e.k.length > cells, of = [];
  for (let i = 0; i < cells; i++) of.push(wide ? B36.indexOf(e.k[2 * i]) * 36 + B36.indexOf(e.k[2 * i + 1]) : B36.indexOf(e.k[i]));
  const targets = String(e.t).split(".").map(Number);
  const cages = [...e.o].map((op, k) => ({ cells: of.map((x, i) => (x === k ? i : -1)).filter(i => i >= 0), op, target: targets[k] }));
  return { rules: e.rules, n, level: e.level, rank: e.rank, seed: e.seed, solution: Uint8Array.from([...e.s].map(Number)), cages };
}
/** Whether an encoded grid is whole: the sizes right, the solution a Latin square, every cell in one cage and every
 *  cage made by its digits. */
export function validGrid(e) {
  try {
    if (!e || !RULES[e.rules] || !SIZES[e.n] || !LEVELS[e.level]) return false;
    const p = decode(e), n = p.n, cells = n * n, shape = shapeOf(n);
    if (p.solution.length !== cells || e.k.length % cells) return false;
    if (!shape.units.every(u => new Set([...u].map(c => p.solution[c])).size === n && [...u].every(c => p.solution[c] >= 1 && p.solution[c] <= n))) return false;
    const covered = p.cages.reduce((s, c) => s + c.cells.length, 0);
    return covered === cells && p.cages.every(c => c.cells.length && opsFor(c.cells.length).includes(c.op) && holds(c.op, c.target, c.cells.map(i => p.solution[i])));
  } catch { return false; }
}
