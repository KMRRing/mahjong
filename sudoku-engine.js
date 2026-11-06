// Nonet's rules and its grids, pure (no DOM), shared by the page, its worker (sudoku-worker.js) and tests/sudoku.mjs.
//
// The rules are the usual ones: fill the grid so that every row, every column and every region holds each digit once.
// The regions are the boxes (3×3 on a 9×9, two rows by three columns on a 6×6) or, in Jigsaw, pieces of any shape;
// Diagonals adds the two long diagonals as units of their own; in Killer there are no digits to start with, only
// cages, each with the sum of its cells, and no digit repeats within a cage.
//
// How a grid is made (generate): a random solution first (sudoku-solve.js fills an empty grid at random); then, for
// the digit puzzles, its digits are taken away a pair at a time, each pair the mirror of the other through the centre,
// for as long as the solver still finds exactly one solution; for Killer, the solution is cut into cages of one cell
// each and neighbouring cages are joined while it still has one. Then the human-style solver (sudoku-logic.js)
// grades it by the hardest technique it needs. A grid harder than the level gets digits back (or cages split), in the
// reverse of the order they went, until it's down to the level; a grid easier than the level is thrown away and
// another made from the next seed in the same stream, so a seed always makes the same grid, on every phone.
import { BOX, boxRegions, shapeOf, rng, mix, below, shuffle, bit, POP, digitOf } from "./sudoku-grid.js";
import { solver } from "./sudoku-solve.js";
import { grade, stateOf, nextStep, apply, BEYOND } from "./sudoku-logic.js";

export const RULES = {
  classic: { label: "Classic", note: "Rows, columns and boxes" },
  x: { label: "Diagonals", note: "The two long diagonals too" },
  jigsaw: { label: "Jigsaw", note: "Regions of any shape" },
  killer: { label: "Killer", note: "Cages and their sums" },
};
export const SIZES = { 9: { label: "9×9" }, 6: { label: "6×6" } };
export const LEVELS = {
  easy: { rank: 1, label: "Easy", note: "Singles only" },
  medium: { rank: 2, label: "Medium", note: "Locked candidates, pairs and triples" },
  hard: { rank: 3, label: "Hard", note: "Quads, fish, wings and short chains" },
  expert: { rank: 4, label: "Expert", note: "Chains" },
};
/** Today's grid, the same for everyone: a classic 9×9 at Medium. */
export const DAILY = { rules: "classic", size: 9, level: "medium" };

/**
 * What each level asks of a grid, by its rules and size: { lo, hi } the ranks of the hardest technique it may need
 * (sudoku-logic.js: 1 singles, 2 locked candidates, pairs and triples, 3 fish, wings and short chains, 4 long chains),
 * floor the digits it keeps at least. On a 9×9 the four levels are the four ranks, and an Easy grid also keeps 36
 * digits, so it's gentle as well as singles-only. A 6×6 almost never needs anything between singles and chains (its
 * pared-down grids are 97% singles; of the rest, nearly all jump straight to fish and chains), so its levels are
 * Easy (singles, 16 digits kept), Medium (singles, but pared to the last digit it needs, which leaves single places to
 * find rather than several) and Hard (anything beyond singles). Killer's cages settle so much by their sums that its
 * grids hardly ever need chains: Easy, Medium and Hard, Hard taking ranks 3 and 4.
 */
export function levelsOf(rules, n) {
  n = Number(n);
  if (rules === "killer") return { easy: { lo: 1, hi: 1 }, medium: { lo: 2, hi: 2 }, hard: { lo: 3, hi: 4 } };
  if (n === 6) return { easy: { lo: 1, hi: 1, floor: 16 }, medium: { lo: 1, hi: 1, floor: 0 }, hard: { lo: 2, hi: 4 } };
  return { easy: { lo: 1, hi: 1, floor: 36 }, medium: { lo: 2, hi: 2 }, hard: { lo: 3, hi: 3 }, expert: { lo: 4, hi: 4 } };
}
/** The nearest level a choice of rules and size offers (a 6×6 or Killer has no Expert). */
export const levelFor = (rules, n, level) => (levelsOf(rules, n)[level] ? level : "hard");
const TRIES = { killer: 120, jigsaw: 80, other: 400 };   // grids tried for a level before the nearest one is taken
/** The level a grid of this rank is, for these rules and size. */
const levelAt = (rules, n, rank) => Object.entries(levelsOf(rules, n)).find(([, s]) => rank >= s.lo && rank <= s.hi)?.[0] || "easy";

/** The grid's shape for its rules: regions (a jigsaw's own), diagonals, cages. */
export function shapeFor(p) {
  return shapeOf(p.n, p.regions || boxRegions(p.n), { diagonals: p.rules === "x", cages: p.cages || null });
}

// ---------- jigsaw regions ----------
/**
 * Irregular regions and a solution that fits them: start from the boxes and swap cells between neighbouring regions,
 * a cell on the edge of one for a cell of the other on the same edge, so every region keeps its size and stays in one
 * piece; after enough swaps the boxes are jigsaw pieces. Not every way of cutting a grid can be filled (each piece,
 * row and column holding every digit once), so a solution is then searched for: { regions, solution, moved } (moved:
 * how many cells left their box), or null when this cut has none.
 */
export function jigsawOf(n, r) {
  const boxes = boxRegions(n), reg = Int8Array.from(boxes), cells = n * n;
  const near = i => [i - n, i + n, i % n ? i - 1 : -1, (i + 1) % n ? i + 1 : -1].filter(j => j >= 0 && j < cells);
  const NEAR = Array.from({ length: cells }, (_, i) => near(i));
  const whole = g => {                             // is region g one piece?
    let first = -1, size = 0;
    for (let i = 0; i < cells; i++) if (reg[i] === g) { size++; if (first < 0) first = i; }
    const seen = new Uint8Array(cells), stack = [first];
    seen[first] = 1;
    let reached = 1;
    while (stack.length) for (const j of NEAR[stack.pop()]) if (reg[j] === g && !seen[j]) { seen[j] = 1; reached++; stack.push(j); }
    return reached === size;
  };
  const want = n * 9;
  for (let done = 0, tries = 0; done < want && tries < want * 30; tries++) {
    const a = below(r, cells), ga = reg[a];
    const others = [...new Set(NEAR[a].map(j => reg[j]).filter(g => g !== ga))];
    if (!others.length) continue;
    const gb = others[below(r, others.length)];
    const edge = [];
    for (let j = 0; j < cells; j++) if (reg[j] === gb && j !== a && NEAR[j].some(k => reg[k] === ga && k !== a)) edge.push(j);
    if (!edge.length) continue;
    const b = edge[below(r, edge.length)];
    reg[a] = gb; reg[b] = ga;
    if (whole(ga) && whole(gb)) done++;
    else { reg[a] = ga; reg[b] = gb; }
  }
  const moved = [...reg].filter((g, i) => g !== boxes[i]).length;
  const fill = solver(shapeOf(n, reg)).solve(new Uint8Array(cells), { limit: 1, rng: r, maxNodes: 5000 });
  return fill.solution && !fill.aborted ? { regions: reg, solution: fill.solution, moved } : null;
}

// ---------- making a grid ----------
/**
 * A grid of these rules, size and level, made from the seed: { seed, rules, n, level, rank (what it needs, 1..4),
 * givens, solution, regions (Jigsaw), cages (Killer), uses (techniques the solver used), tries }. The same seed
 * always makes the same grid.
 */
export function generate({ seed, rules = "classic", size = 9, level = "medium" }) {
  const n = Number(size);
  level = levelFor(rules, n, level);
  const spec = levelsOf(rules, n)[level];
  let nearest = null;
  for (let t = 0, tries = TRIES[rules] || TRIES.other; t < tries; t++) {
    const r = rng(mix(seed, rules, n, level, t));
    const made = rules === "killer" ? killerGrid(n, spec, LEVELS[level].rank, r) : digitGrid(n, rules, spec, r);
    if (!made) continue;
    const out = { seed, rules, n, level, regions: null, cages: null, ...made, tries: t + 1 };
    if (made.rank >= spec.lo && made.rank <= spec.hi) return out;
    // the nearest yet, if none comes out at the level: under it rather than over it (a hard grid is never dealt as easy)
    if (made.rank < spec.lo && (!nearest || made.rank > nearest.rank)) nearest = out;
  }
  // none at the level: the nearest under it, called by the level it is (a grid never claims a level it hasn't)
  if (nearest) return { ...nearest, level: levelAt(rules, n, nearest.rank) };
  // nothing at all in every try (a rare run of Killer cuts with no single solution): the level below, from the same seed
  const ids = Object.keys(levelsOf(rules, n)), lower = ids.indexOf(level) - 1;
  return lower >= 0 ? generate({ seed, rules, size: n, level: ids[lower] }) : generate({ seed, rules: "classic", size: n, level: "easy" });
}

/** A digit puzzle (Classic, Diagonals, Jigsaw): digits taken from a random solution in mirrored pairs. */
function digitGrid(n, rules, spec, r) {
  const target = spec.hi;
  let regions = boxRegions(n), solution;
  if (rules === "jigsaw") {
    const j = jigsawOf(n, r);
    if (!j || j.moved < n * n / 3) return null;      // a cut still mostly boxes isn't a jigsaw
    ({ regions, solution } = j);
  }
  const shape = shapeOf(n, regions, { diagonals: rules === "x" }), S = solver(shape), cells = n * n;
  solution ||= S.solve(new Uint8Array(cells), { limit: 1, rng: r }).solution;
  if (!solution) return null;
  const givens = Uint8Array.from(solution);
  // in mirrored pairs, the convention of a printed grid; a jigsaw's pieces aren't symmetric, so its digits go singly,
  // which also lets a hard one be given back a digit at a time
  const pairs = [];
  for (let i = 0; i < cells; i++) { const j = cells - 1 - i; if (rules === "jigsaw") pairs.push([i]); else if (i <= j) pairs.push(i === j ? [i] : [i, j]); }
  shuffle(r, pairs);
  const gone = [];                                     // pairs taken, in order
  const floor = spec.floor || 0;
  let left = cells;
  for (const pair of pairs) {
    if (left - pair.length < floor) continue;
    for (const c of pair) givens[c] = 0;
    if (S.solve(givens).count === 1) { gone.push(pair); left -= pair.length; }
    else for (const c of pair) givens[c] = solution[c];
  }
  let g = grade(shape, givens, { upTo: 4 });
  // too hard: a pair of digits back where the solver first needed more than the level allows, until it's down to it
  while (g.rank > target && gone.length) {
    const back = backFor(g, target, gone, r);
    gone.splice(gone.indexOf(back), 1);
    for (const c of back) givens[c] = solution[c];
    g = grade(shape, givens, { upTo: 4 });
  }
  if (g.rank > target) return null;
  return { rank: g.rank, givens, solution, regions: rules === "jigsaw" ? regions : null, uses: g.uses, count: givens.filter(Boolean).length };
}
/**
 * Which pair of digits to give back to a grid that's too hard: one at the cells of the first step it needed beyond the
 * level (so that step is no longer needed and the rest stays as it was), else, where it got stuck, one of the cells
 * nearest to being settled (fewest candidates left), else any.
 */
function backFor(g, target, gone, r) {
  const hard = g.steps.find(s => s.rank > target);
  let focus;
  if (hard) focus = new Set([...(hard.cells || []), ...(hard.elim || []).map(([c]) => c)]);
  else {
    const open = [...g.state.val.keys()].filter(c => !g.state.val[c]);
    const fewest = Math.min(...open.map(c => POP[g.state.cand[c]]));
    focus = new Set(open.filter(c => POP[g.state.cand[c]] === fewest));
  }
  const near = gone.filter(pair => pair.some(c => focus.has(c)));
  const from = near.length ? near : gone;
  return from[below(r, from.length)];
}

// ---------- Killer ----------
/**
 * Cage sizes by level, as the odds of each size from one cell up: an Easy grid has small cages, whose few ways of
 * adding up give digits away; harder grids have longer cages, and fewer of them. A cage of one cell is a digit given
 * in all but name: an Easy grid keeps up to four, a Medium two, a Hard one.
 */
const KILLER = {
  9: { 1: [0, 0, 6, 4, 1], 2: [0, 0, 4, 4, 2], 3: [0, 0, 3, 4, 3, 1], 4: [0, 0, 2, 4, 4, 2] },
  6: { 1: [0, 0, 6, 3], 2: [0, 0, 4, 4, 1], 3: [0, 0, 3, 4, 2], 4: [0, 0, 2, 4, 3] },
};
const SINGLES = { 1: 4, 2: 2, 3: 1, 4: 1 };
const pickSize = (r, odds) => { let x = r() * odds.reduce((a, b) => a + b, 0); for (let s = 0; s < odds.length; s++) { x -= odds[s]; if (x < 0) return s; } return odds.length - 1; };

/**
 * A solution cut into cages, with one solution: cages grow from random cells to sizes drawn from `odds` (no digit
 * twice in a cage), a cell left alone joins a neighbour, then wherever two solutions differ the cage of a cell they
 * differ at is split in two, until only one is left. Returns { solution, cages(), split(cell), sizeAt(cell) }, or null
 * when the cut can't be made to have one solution.
 */
export function killerCut(n, odds, r) {
  const cells = n * n, solution = solver(shapeOf(n)).solve(new Uint8Array(cells), { limit: 1, rng: r }).solution;
  const NEAR = Array.from({ length: cells }, (_, i) => [i - n, i + n, i % n ? i - 1 : -1, (i + 1) % n ? i + 1 : -1].filter(j => j >= 0 && j < cells));
  const cageOf = new Int16Array(cells).fill(-1);
  let next = 0;
  for (const a of shuffle(r, [...Array(cells).keys()])) {
    if (cageOf[a] >= 0) continue;
    const k = next++, want = pickSize(r, odds), mine = [a];
    cageOf[a] = k;
    while (mine.length < want) {
      const edge = [...new Set(mine.flatMap(c => NEAR[c]))].filter(j => cageOf[j] < 0 && !mine.some(c => solution[c] === solution[j]));
      if (!edge.length) break;
      const j = edge[below(r, edge.length)];
      cageOf[j] = k;
      mine.push(j);
    }
  }
  const members = () => { const m = new Map(); for (let i = 0; i < cells; i++) (m.get(cageOf[i]) || m.set(cageOf[i], []).get(cageOf[i])).push(i); return m; };
  const biggest = odds.length - 1;
  // a cell left on its own pairs up with a neighbour left alone (side by side, they never share a digit), or joins a
  // neighbouring cage it doesn't repeat a digit of, one cell past the usual size if need be
  for (const [k, cs] of members()) {
    if (cs.length !== 1) continue;
    const map = members(), a = cs[0];
    if (map.get(k)?.length !== 1) continue;
    const lone = NEAR[a].filter(j => map.get(cageOf[j]).length === 1 && cageOf[j] !== k);
    if (lone.length) { cageOf[lone[below(r, lone.length)]] = k; continue; }
    const homes = [...new Set(NEAR[a].map(j => cageOf[j]))].filter(h => h !== k && map.get(h).length <= biggest && !map.get(h).some(c => solution[c] === solution[a]));
    if (homes.length) cageOf[a] = homes[below(r, homes.length)];
  }
  const cages = () => [...members().values()].map(cs => ({ cells: cs, sum: cs.reduce((s, c) => s + solution[c], 0) }));
  const sizeAt = cell => members().get(cageOf[cell]).length;
  /** The cage holding `cell` in two, each part in one piece; false if it can't be. */
  const split = cell => {
    const k = cageOf[cell], cs = members().get(k);
    if (cs.length < 2) return false;
    const half = Math.floor(cs.length / 2);
    for (let t = 0; t < 6; t++) {
      const part = new Set([cell]), grow = [cell];
      while (part.size < half && grow.length) {
        const from = grow[below(r, grow.length)], nb = NEAR[from].filter(j => cageOf[j] === k && !part.has(j));
        if (!nb.length) { grow.splice(grow.indexOf(from), 1); continue; }
        const j = nb[below(r, nb.length)];
        part.add(j); grow.push(j);
      }
      if (!connected(cs.filter(c => !part.has(c)), NEAR)) continue;
      const fresh = next++;
      for (const c of part) cageOf[c] = fresh;
      return true;
    }
    return false;
  };
  const check = () => solver(shapeOf(n, boxRegions(n), { cages: cages() })).solve(new Uint8Array(cells), { limit: 2, maxNodes: 30000 });
  for (let k = 0; ; k++) {
    if (k > 60) return null;
    const res = check();
    if (res.aborted) return null;
    if (res.count === 1) break;
    // the longest cage first, so a split leaves cages of two or more rather than single cells
    const diff = shuffle(r, [...Array(cells).keys()].filter(i => res.solutions[0][i] !== res.solutions[1][i])).sort((a, b) => sizeAt(b) - sizeAt(a));
    if (!diff.some(split)) return null;
  }
  /** Joins a random pair of neighbouring cages (no digit twice, `most` cells at most) if the grid still has one
   *  solution: returns the way to undo it, or null if no join kept one solution in a few tries. */
  const join = most => {
    for (let t = 0; t < 8; t++) {
      const a = below(r, cells), map = members(), ka = cageOf[a], mine = map.get(ka);
      const nbrs = [...new Set(mine.flatMap(c => NEAR[c]).map(j => cageOf[j]))].filter(k => k !== ka && map.get(k).length + mine.length <= most && !map.get(k).some(c => mine.some(d => solution[c] === solution[d])));
      if (!nbrs.length) continue;
      const before = cageOf.slice();
      for (const c of map.get(nbrs[below(r, nbrs.length)])) cageOf[c] = ka;
      const res = check();
      if (res.count === 1 && !res.aborted) return () => cageOf.set(before);
      cageOf.set(before);
    }
    return null;
  };
  return { solution, cages, split, join, sizeAt };
}

/**
 * Killer at a level: a cut graded; split where the solver first needed more than the level (or got stuck), or, for a
 * Hard grid, cages joined until it needs a Hard technique (most cuts come out Medium, and joining is quicker than
 * cutting again), a join undone if it leaves the solver stuck.
 */
function killerGrid(n, spec, level, r) {
  const cut = killerCut(n, KILLER[n][Math.min(level, 2)], r), cells = n * n, target = spec.hi;
  if (!cut) return null;
  const gradeNow = () => grade(shapeOf(n, boxRegions(n), { cages: cut.cages() }), new Uint8Array(cells), { upTo: 4 });
  let g = gradeNow();
  for (let k = 0; g.rank < spec.lo && k < 10; k++) {
    const undo = cut.join(KILLER[n][level].length), was = g;
    if (!undo) break;
    g = gradeNow();
    if (g.rank > target) { undo(); g = was; }
  }
  for (let k = 0; g.rank > target; k++) {
    if (k >= 6) return null;
    const hard = g.steps.find(s => s.rank > target);
    const focus = hard ? [...(hard.cells || []), ...(hard.elim || []).map(([c]) => c)]
      : [...g.state.val.keys()].filter(c => !g.state.val[c]).sort((a, b) => POP[g.state.cand[a]] - POP[g.state.cand[b]]).slice(0, 6);
    if (!shuffle(r, focus.filter(c => cut.sizeAt(c) > 1)).sort((a, b) => cut.sizeAt(b) - cut.sizeAt(a)).some(cut.split)) return null;
    g = gradeNow();
  }
  const cages = cut.cages();
  if (g.rank < spec.lo || cages.filter(c => c.cells.length === 1).length > SINGLES[level]) return null;
  return { rank: g.rank, givens: new Uint8Array(cells), solution: cut.solution, cages, uses: g.uses, count: cages.length };
}
/** Whether these cells are one piece, joined edge to edge. */
function connected(cs, NEAR) {
  if (!cs.length) return false;
  const set = new Set(cs), seen = new Set([cs[0]]), stack = [cs[0]];
  while (stack.length) for (const j of NEAR[stack.pop()]) if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
  return seen.size === cs.length;
}

// ---------- playing together: the givens split between the players ----------
/**
 * Together, each player sees only part of the givens (in Killer, of the cages' sums: every cage is outlined on every
 * screen, but not every sum), and what anyone places is everyone's. Half the givens each is too little: in a measured
 * run of Medium grids, a pair split half and half got stuck after a round of placing what they could, every time. So
 * every given is dealt to one player (round each region in turn), and then, one at a time and at random, givens are
 * shown to everyone, until the relay below finishes: each player works out what they can from what they see, what
 * they find goes to the others, and round again. As few are shared as that takes, so each player still holds what
 * the other needs, and the table can always finish without a word (talking is quicker).
 *
 * A split is a string: for a digit puzzle a character a cell, the player ("0".."5") who alone sees that given, "*"
 * for a given everyone sees, "." for an empty cell; for Killer a character a cage.
 */
export function splitFor(p, k, seed) {
  k = Math.max(2, Math.min(6, k | 0));
  const r = rng(mix(seed, "split", k));
  let last = null;
  for (let deal = 0; deal < 4; deal++) {
    const parts = [...dealSplit(p, k, r)];
    for (let t = 0; t < 200; t++) {
      if (relay(p, parts.join(""), k).done) break;
      // a few at once while most are still private (a whole relay is the price of each look), then one at a time
      const hidden = [...parts.keys()].filter(i => /\d/.test(parts[i]));
      if (!hidden.length) break;
      for (const i of shuffle(r, hidden).slice(0, Math.max(1, Math.floor(hidden.length / 8)))) parts[i] = "*";
    }
    last = parts.join("");
    // a split where someone could finish alone isn't one: deal again
    if (![...Array(k).keys()].some(q => { const v = viewOf(p, last, q); return grade(v.shape, v.givens, { upTo: p.rank || 1 }).solved; })) return last;
  }
  return last;
}
/** A split dealt round each region (cages: by the region of their first cell), so each player holds some of every one. */
function dealSplit(p, k, r) {
  if (p.cages) {
    const out = new Array(p.cages.length);
    const byRegion = new Map();
    p.cages.forEach((c, i) => { const g = p.regions ? p.regions[c.cells[0]] : boxRegions(p.n)[c.cells[0]]; (byRegion.get(g) || byRegion.set(g, []).get(g)).push(i); });
    let turn = below(r, k);
    for (const list of byRegion.values()) for (const i of shuffle(r, list)) out[i] = String(turn++ % k);
    return out.join("");
  }
  const out = [...p.givens].map(() => "."), regions = p.regions || boxRegions(p.n);
  let turn = below(r, k);
  for (let g = 0; g < p.n; g++) {
    const mine = [...p.givens.keys()].filter(i => p.givens[i] && regions[i] === g);
    for (const i of shuffle(r, mine)) out[i] = String(turn++ % k);
  }
  return out.join("");
}
/**
 * What one player of a split holds: { givens (theirs, with what's been placed), cages (others' sums hidden), shape }.
 * placed: the digits placed so far by anyone (0 for empty).
 */
export function viewOf(p, parts, q, placed = null) {
  const cells = p.n * p.n, givens = new Uint8Array(cells), mine = String(q), sees = x => x === mine || x === "*";
  for (let i = 0; i < cells; i++) {
    if (placed?.[i]) givens[i] = placed[i];
    else if (!p.cages && p.givens[i] && sees(parts[i])) givens[i] = p.givens[i];
  }
  const cages = p.cages ? p.cages.map((c, i) => ({ cells: c.cells, sum: sees(parts[i]) ? c.sum : null })) : null;
  return { givens, cages, shape: shapeOf(p.n, p.regions || boxRegions(p.n), { diagonals: p.rules === "x", cages }) };
}
/**
 * The relay for a split: in each round every player works out all they can from their own view with the techniques up
 * to the grid's own level, and what they found is placed for everyone. { done, rounds, credit (cells each found
 * first; a cell two found at once counts half to each), placed }.
 */
export function relay(p, parts, k, { upTo = p.rank || 1 } = {}) {
  const cells = p.n * p.n, placed = new Uint8Array(cells), credit = new Array(k).fill(0);
  const writable = i => !p.givens[i];
  let rounds = 0;
  const left = () => [...placed.keys()].filter(i => writable(i) && !placed[i]).length;
  while (left() > 0 && rounds < 40) {
    const found = new Map();                         // cell -> [digit, players]
    for (let q = 0; q < k; q++) {
      const view = viewOf(p, parts, q, placed), st = stateOf(view.shape, view.givens), ctx = { memo: new Map() };
      for (let s = 0; s < 400; s++) {
        const step = nextStep(view.shape, st, { upTo, ctx });
        if (!step) break;
        apply(view.shape, st, step);
        if (step.place && writable(step.place[0]) && !placed[step.place[0]]) {
          const f = found.get(step.place[0]);
          if (f) f[1].push(q); else found.set(step.place[0], [step.place[1], [q]]);
        }
      }
    }
    if (!found.size) break;
    for (const [i, [d, who]] of found) { placed[i] = d; for (const q of who) credit[q] += 1 / who.length; }
    rounds++;
  }
  return { done: left() === 0, rounds, credit, placed };
}

// ---------- as text: for the saved run, a match, and a link ----------
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
/** A grid as strings: { g (the givens), s (the solution), r (a jigsaw's regions), k (each cell's cage), ks (the sums) }. */
export function encode(p) {
  const out = { rules: p.rules, n: p.n, level: p.level, rank: p.rank, seed: p.seed, g: [...p.givens].join(""), s: [...p.solution].join("") };
  if (p.regions) out.r = [...p.regions].join("");
  if (p.cages) { out.k = cageString(p); out.ks = p.cages.map(c => c.sum).join("."); }
  return out;
}
/** Cages as one character a cell (base 36 can't count past 36 cages, so two characters a cell when there are more). */
function cageString(p) {
  const cells = p.n * p.n, of = new Int16Array(cells);
  p.cages.forEach((c, k) => c.cells.forEach(i => { of[i] = k; }));
  const wide = p.cages.length > 36;
  return [...of].map(k => (wide ? B36[Math.floor(k / 36)] + B36[k % 36] : B36[k])).join("");
}
export function decode(e) {
  const n = Number(e.n), cells = n * n, digits = s => Uint8Array.from([...s].map(Number));
  const p = { rules: e.rules, n, level: e.level, rank: e.rank, seed: e.seed, givens: digits(e.g), solution: digits(e.s), regions: e.r ? Int8Array.from([...e.r].map(Number)) : null, cages: null };
  if (e.k) {
    const sums = String(e.ks).split(".").map(Number), wide = e.k.length > cells, of = [];
    for (let i = 0; i < cells; i++) of.push(wide ? B36.indexOf(e.k[2 * i]) * 36 + B36.indexOf(e.k[2 * i + 1]) : B36.indexOf(e.k[i]));
    p.cages = sums.map((sum, k) => ({ cells: of.map((x, i) => (x === k ? i : -1)).filter(i => i >= 0), sum }));
  }
  return p;
}
/** Whether an encoded grid is whole: the sizes right and the solution fitting its own rules. */
export function validGrid(e) {
  try {
    if (!e || !RULES[e.rules] || !SIZES[e.n] || !LEVELS[e.level]) return false;
    const p = decode(e), cells = p.n * p.n;
    if (p.givens.length !== cells || p.solution.length !== cells || (p.regions && p.regions.length !== cells)) return false;
    if (p.givens.some((d, i) => d && d !== p.solution[i])) return false;
    const sh = shapeFor(p);
    return sh.units.every(u => new Set([...u].map(c => p.solution[c])).size === p.n && [...u].every(c => p.solution[c] >= 1 && p.solution[c] <= p.n))
      && (!p.cages || p.cages.every(c => c.cells.reduce((s, i) => s + p.solution[i], 0) === c.sum));
  } catch { return false; }
}

export { BEYOND };
