// Tally's rules and its grids, pure (no DOM): shared by the page, its worker (kakuro-worker.js) and tests/kakuro.mjs.
//
// The rules are the usual ones: a crossword of numbers. Every run of white cells, across or down, holds different
// digits 1 to 9 that add up to the clue at its head (the black cell to its left, or above it); in Products they
// multiply to it.
//
// How a grid is made (generate): a pattern of black cells, symmetric under a half turn, with no run shorter than two;
// a fill, a digit in every white cell and none twice in a run, never two crossing pairs that could be swapped; the
// fill leaned toward clues with fewer ways or more (the level's doubt); its clues worked out from it; then, while the
// exact solver (kakuro-solve.js) finds two solutions, a digit where they differ is changed, until it finds exactly one.
// The human-style solver (kakuro-logic.js) grades it; a grid not at its level leans the next try's fill the other
// way. Every number in it comes from the seed by integer arithmetic, so a seed makes the same grid on every phone.
import { ALL, POP, bit, digitOf, shapeOf, patternOk, joined, combosOf, total, rng, mix, below, shuffle } from "./kakuro-grid.js";
import { solver } from "./kakuro-solve.js";
import { grade, stateOf, nextStep, apply, BEYOND } from "./kakuro-logic.js";

export const RULES = {
  sums: { label: "Sums", op: "sum", note: "Each run adds up to its clue" },
  products: { label: "Products", op: "product", note: "Each run multiplies to its clue" },
};
export const SIZES = { 8: { label: "8×8" }, 10: { label: "10×10" }, 12: { label: "12×12" } };
export const LEVELS = {
  easy: { label: "Easy", note: "Sums with few ways, a little working out" },
  medium: { label: "Medium", note: "The ways that fit, often" },
  hard: { label: "Hard", note: "Much working out, now and then a block's sums" },
  expert: { label: "Expert", note: "A chain, or block after block" },
};
const ORDER = ["easy", "medium", "hard", "expert"];
/** Today's grid, the same for everyone: Sums, 10×10, Medium. */
export const DAILY = { rules: "sums", size: 10, level: "medium" };
/** The largest product a clue may be: three digits fit a clue cell's corner, four don't. */
export const MOST = 999;

/** The levels offered for rules and a size: Expert needs a grid of 10×10 or more, and Products, whose clues give
 *  more away (a 5 or a 7 shows itself in a product), has no Expert. */
export function levelsOf(rules, size) {
  return rules === "products" || Number(size) < 10 ? ORDER.slice(0, 3) : ORDER;
}
/** The nearest level the rules and size offer. */
export const levelFor = (rules, size, level) => (levelsOf(rules, size).includes(level) ? level : levelsOf(rules, size).at(-1));
/**
 * The level a grid is, from how it was solved: work, the steps that took more than a glance (rank 2 and up), for each
 * white cell, and rank, the hardest technique. Easy and Medium never need more than the ways that fit, Easy once for
 * every twelve cells or so, Medium up to once for every four or five; Hard more, up to once for every two or three, or
 * a block's sums; Expert a chain, or working out at nearly every other cell. null: beyond every technique (never dealt).
 */
export function levelOf(rank, work, white) {
  if (rank >= BEYOND) return null;
  const w = work / white;
  if (rank <= 2 && w <= 0.08) return "easy";
  if (rank <= 2 && w <= 0.22) return "medium";
  if (rank <= 3 && w <= 0.38) return "hard";
  return "expert";
}
/** How a grid of each rules is laid out: how much of its inside is black, and its longest run (a product of five
 *  digits is mostly four digits long, too long for a clue). */
const PATTERN = { sums: { density: 0.33, longest: 7 }, products: { density: 0.4, longest: 4 } };
/**
 * Each level's fill: where it starts and how far it may lean, in thousandths of a bit of doubt a run (more doubt: more
 * ways to make the clues). Past about 1.6 bits most fills can't be brought to one solution, and chains come from a
 * grid's shape more than from its doubt, so no level leans further.
 */
const LEAN = {
  sums: { easy: [500, 300, 800], medium: [900, 600, 1300], hard: [1300, 900, 1600], expert: [1300, 1000, 1600] },
  products: { easy: [800, 500, 1100], medium: [1200, 900, 1500], hard: [1500, 1200, 1700] },
};
const TRIES = 40;

// ---------- doubt ----------
/**
 * log2 n in thousandths, by integer arithmetic (Math.log2 may differ in its last digit between browsers, and a grid
 * must come out the same on every phone): the whole part from the bit length, the fraction a bit at a time by squaring.
 */
function milliLog2(n) {
  if (n <= 1) return 0;
  const whole = 31 - Math.clz32(n), ONE = 1 << 20;
  let x = Math.floor((n * ONE) / (1 << whole)), frac = 0;
  for (let b = 0; b < 12; b++) {
    x = Math.floor((x * x) / ONE);
    frac *= 2;
    if (x >= 2 * ONE) { frac += 1; x = Math.floor(x / 2); }
  }
  return whole * 1000 + Math.floor((frac * 1000) / 4096);
}
const LOG = Int32Array.from({ length: 512 }, (_, n) => milliLog2(n));
/** How many ways a run's clue leaves it, as thousandths of a bit of doubt (0 for a run with one combination). */
export const doubt = (op, len, value) => LOG[Math.max(1, combosOf(op, len, value).length)];

// ---------- the pattern ----------
/** The cell a cell is turned into by a half turn of the grid's inside (the first row and column are the clues' frame). */
const mirrorOf = (rows, cols) => i => (rows - Math.floor(i / cols)) * cols + (cols - (i % cols));
/** The length of the run of white cells through cell i, along a row (step 1) or a column (step cols). */
function runThrough(black, cols, cells, i, step) {
  const row = Math.floor(i / cols);
  let n = 1;
  for (let j = i - step; j >= 0 && !black[j] && (step !== 1 || Math.floor(j / cols) === row); j -= step) n++;
  for (let j = i + step; j < cells && !black[j] && (step !== 1 || Math.floor(j / cols) === row); j += step) n++;
  return n;
}
/** Whether turning cells i and j black leaves every white cell in runs of two or more, and the white cells joined. */
function canBlacken(black, rows, cols, i, j) {
  const cells = rows * cols;
  black[i] = 1; black[j] = 1;
  let ok = true;
  for (const x of i === j ? [i] : [i, j]) {
    const c = x % cols;
    for (const [y, step] of [[c ? x - 1 : -1, 1], [c + 1 < cols ? x + 1 : -1, 1], [x - cols, cols], [x + cols, cols]]) {
      if (y < 0 || y >= cells || black[y]) continue;
      if (runThrough(black, cols, cells, y, step) < 2) { ok = false; break; }
    }
    if (!ok) break;
  }
  if (ok) ok = joined({ cols, cells, black, white: whiteOf(black) });
  black[i] = 0; black[j] = 0;
  return ok;
}
const whiteOf = black => { const out = []; for (let i = 0; i < black.length; i++) if (!black[i]) out.push(i); return out; };
/** How welcome a black cell at i is for the runs it cuts: the pieces it leaves of its row's run and its column's, a
 *  piece of three to five welcome, a pair less so (a grid of pairs is a lattice, not a Tally), a solid block of four
 *  black cells inside the grid least of all. */
function pieces(black, rows, cols, i) {
  const cells = rows * cols, c = i % cols, row = j => Math.floor(j / cols) === Math.floor(i / cols);
  let w = 1;
  const side = (from, step, same) => { let n = 0; for (let j = from; j >= 0 && j < cells && !black[j] && same(j); j += step) n++; return n; };
  for (const n of [side(i - 1, -1, row), side(i + 1, 1, row), side(i - cols, -cols, () => true), side(i + cols, cols, () => true)]) {
    if (n === 2) w *= 0.6;
    else if (n >= 3 && n <= 5) w *= 1.4;
  }
  const at = j => j >= 0 && j < cells && black[j] && j >= cols && j % cols;
  for (const [a, b, d] of [[i - 1, i - cols, i - cols - 1], [i + 1, i - cols, i - cols + 1], [i - 1, i + cols, i + cols - 1], [i + 1, i + cols, i + cols + 1]]) {
    if ((a === i - 1 ? c > 0 : c + 1 < cols) && at(a) && at(b) && at(d)) w *= 0.25;
  }
  return w;
}
/**
 * A pattern of black cells for a grid rows × cols: the first row and column black (they hold the clues), the inside
 * symmetric under a half turn (a printed Tally's convention), every white cell in an across run and a down run of
 * two to `longest` cells, the white cells in one piece, about `density` of the inside black. Black cells are added a
 * pair at a time, each pair the other's half turn, weighted: one that cuts a run too long most, then one touching a
 * black cell corner to corner (which draws the staircases printed grids have), by the pieces it leaves (pieces), and
 * never one that leaves a run of one.
 */
export function patternOf(rows, cols, r, { density = 0.33, longest = 7 } = {}) {
  const cells = rows * cols, inside = (rows - 1) * (cols - 1), mirror = mirrorOf(rows, cols);
  for (let t = 0; t < 40; t++) {
    const black = new Uint8Array(cells);
    for (let c = 0; c < cols; c++) black[c] = 1;
    for (let q = 0; q < rows; q++) black[q * cols] = 1;
    let blacks = 0;
    const long = i => runThrough(black, cols, cells, i, 1) > longest || runThrough(black, cols, cells, i, cols) > longest;
    for (let step = 0; step < inside; step++) {
      let tooLong = false;
      for (let i = 0; i < cells && !tooLong; i++) if (!black[i] && long(i)) tooLong = true;
      if (!tooLong && blacks / inside >= density) break;
      const opts = [], weights = [];
      for (let i = cols + 1; i < cells; i++) {
        if (black[i] || i % cols === 0) continue;
        const j = mirror(i);
        if (j < i || !canBlacken(black, rows, cols, i, j)) continue;
        let w = (long(i) || long(j) ? 9 : 1) * pieces(black, rows, cols, i);
        const c = i % cols, diag = [c ? i - cols - 1 : -1, c + 1 < cols ? i - cols + 1 : -1, c ? i + cols - 1 : -1, c + 1 < cols ? i + cols + 1 : -1];
        if (diag.some(y => y > cols && y < cells && y % cols && black[y])) w *= 2;
        opts.push([i, j]);
        weights.push(w);
      }
      if (!opts.length) break;
      let x = r() * weights.reduce((a, b) => a + b, 0), k = 0;
      while ((x -= weights[k]) > 0 && k < opts.length - 1) k++;
      const [i, j] = opts[k];
      black[i] = 1; black[j] = 1;
      blacks += i === j ? 1 : 2;
    }
    if (!patternOk(rows, cols, black) || shapeOf(rows, cols, black).runs.some(run => run.cells.length > longest)) continue;
    const share = blacks / inside;
    if (share < density - 0.04 || share > density + 0.12) continue;
    return black;
  }
  return null;
}

// ---------- the fill ----------
/**
 * Whether digit d in cell c would close a rectangle that can be swapped: c and a cell of its across run, and the two
 * cells of another across run under them in the same two down runs, holding a b over b a. Swapping the four leaves
 * every sum (and product) as it was, so a grid with one can never have one solution.
 */
export function closesSwap(shape, val, c, d) {
  const { runs, across, down, cols } = shape;
  for (const x of runs[across[c]].cells) {
    if (x === c || !val[x]) continue;
    const cx = x % cols;
    for (const y of runs[down[c]].cells) {
      if (y === c || val[y] !== val[x]) continue;
      const z = Math.floor(y / cols) * cols + cx;
      if (val[z] === d && across[z] === across[y] && down[z] === down[x]) return true;
    }
  }
  return false;
}
/**
 * A solution for a pattern: a digit in every white cell, none twice in a run and no swappable rectangle, by a search
 * on the cell with the fewest digits left, its digits tried in a random order. With products, every run's product
 * stays at MOST or under.
 */
export function fillOf(shape, r, { op = "sum" } = {}) {
  const { cells, white, peers, runs, across, down } = shape;
  const val = new Uint8Array(cells), cand = new Uint16Array(cells);
  for (const c of white) cand[c] = ALL;
  let nodes = 0;
  const LEAST = [1, 1, 2, 6, 24, 120, 720];             // the least product of n different digits
  const productOk = c => {
    for (const k of [across[c], down[c]]) {
      let p = 1, left = 0;
      for (const x of runs[k].cells) if (val[x]) p *= val[x]; else left++;
      if (p * LEAST[Math.min(left, 6)] > MOST) return false;
    }
    return true;
  };
  const search = () => {
    if (++nodes > 20000) return false;
    let best = -1, fewest = 10;
    for (const c of white) if (!val[c]) { const p = POP[cand[c]]; if (p < fewest) { fewest = p; best = c; } }
    if (best < 0) return true;
    if (!fewest) return false;
    const ds = [];
    for (let x = cand[best]; x; x &= x - 1) ds.push(digitOf(x & -x));
    for (const d of shuffle(r, ds)) {
      if (closesSwap(shape, val, best, d)) continue;
      val[best] = d;
      if (op === "product" && !productOk(best)) { val[best] = 0; continue; }
      const took = [];
      for (const p of peers[best]) if (!val[p] && (cand[p] & bit(d))) { cand[p] &= ~bit(d); took.push(p); }
      if (search()) return true;
      for (const p of took) cand[p] |= bit(d);
      val[best] = 0;
    }
    return false;
  };
  return search() ? val : null;
}
/** A run's clue as a solution has it. */
const clueOf = (op, cellsIn, sol) => { let m = 0; for (const c of cellsIn) m |= bit(sol[c]); return total(op, m); };
/** Each run's clue: the sum (or product) of its digits in the solution. */
export const cluesOf = (shape, sol, op = "sum") => shape.runs.map(run => clueOf(op, run.cells, sol));
/**
 * Leans a fill toward `target` (thousandths of a bit of doubt a run, on average: fewer ways to make its clues, or
 * more): a cell at a time takes the digit that moves its two runs' doubt the most the right way (never a repeat in a
 * run, never a swappable rectangle), until the runs average the target or `steps` cells have been tried.
 */
export function lean(shape, sol, r, { op = "sum", target = 1000, steps = 4000 } = {}) {
  const { runs, white, across, down, peers } = shape;
  const runDoubt = k => doubt(op, runs[k].cells.length, clueOf(op, runs[k].cells, sol));
  const each = runs.map((_, k) => runDoubt(k));
  let sum = each.reduce((a, b) => a + b, 0);
  const goal = target * runs.length, way = Math.sign(goal - sum);
  for (let t = 0; t < steps && way * (goal - sum) > 0; t++) {
    const c = white[below(r, white.length)], a = across[c], b = down[c], was = sol[c], before = each[a] + each[b];
    let used = 0;
    for (const p of peers[c]) used |= bit(sol[p]);
    let best = null;
    for (let d = 1; d <= 9; d++) {
      if (used & bit(d) || d === was || closesSwap(shape, sol, c, d)) continue;
      sol[c] = d;
      if (op === "product" && (clueOf(op, runs[a].cells, sol) > MOST || clueOf(op, runs[b].cells, sol) > MOST)) continue;
      const da = runDoubt(a), db = runDoubt(b);
      if (way * (da + db - before) > 0 && (!best || way * (da + db - best[0]) > 0)) best = [da + db, d, da, db];
    }
    sol[c] = was;
    if (!best) continue;
    sol[c] = best[1];
    sum += best[0] - before;
    each[a] = best[2]; each[b] = best[3];
  }
  return sol;
}
/**
 * Makes a fill's clues have exactly one solution: while the solver finds two, a cell where they differ (one in the
 * runs with the most ways first: the doubt is theirs) takes another digit, the one that leaves its two runs the fewest
 * ways, give or take a little luck, and the clues are worked out again. { solution, clues }, or null when it doesn't
 * come to one solution in `tries` (it can go round in circles; a fresh fill is quicker than more tries).
 */
export function uniqueFill(shape, sol, r, { op = "sum", tries = 40 } = {}) {
  sol = Uint8Array.from(sol);
  const { runs, across, down } = shape;
  for (let t = 0; t < tries; t++) {
    const clues = cluesOf(shape, sol, op), res = solver(shape, clues, op).solve({ limit: 2, maxNodes: 20000 });
    if (res.aborted) return null;
    if (res.count === 1) return { solution: sol, clues };
    const other = res.solutions.find(s => s.some((d, i) => d !== sol[i])) || res.solutions[1];
    const runDoubt = k => doubt(op, runs[k].cells.length, clues[k]);
    const diff = shuffle(r, [...shape.white].filter(c => other[c] !== sol[c]))
      .map(c => [runDoubt(across[c]) + runDoubt(down[c]) + below(r, 1500), c]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    let changed = false;
    for (const c of diff) {
      let used = 0;
      for (const p of shape.peers[c]) used |= bit(sol[p]);
      const opts = [];
      for (let d = 1; d <= 9; d++) {
        if (used & bit(d) || d === sol[c] || closesSwap(shape, sol, c, d)) continue;
        const was = sol[c];
        sol[c] = d;
        const ca = clueOf(op, runs[across[c]].cells, sol), cb = clueOf(op, runs[down[c]].cells, sol);
        sol[c] = was;
        if (op === "product" && (ca > MOST || cb > MOST)) continue;
        opts.push([doubt(op, runs[across[c]].cells.length, ca) + doubt(op, runs[down[c]].cells.length, cb) + below(r, 800), d]);
      }
      if (!opts.length) continue;
      opts.sort((x, y) => x[0] - y[0]);
      sol[c] = opts[0][1];
      changed = true;
      break;
    }
    if (!changed) return null;
  }
  return null;
}

// ---------- making a grid ----------
/**
 * A grid of these rules, size and level, made from the seed: { seed, rules, op, rows, cols, level, rank, work,
 * black, solution, clues, shape, uses, tries }. Each try is a fresh pattern and fill; a grid easier than the level
 * leans the next try's fill toward more doubt, a harder one toward less. If none comes out at the level, the nearest
 * one under it is dealt, called by the level it is (a grid never claims a level it hasn't). The same seed always
 * makes the same grid.
 */
export function generate({ seed, rules = "sums", size = 10, level = "medium" }) {
  size = Number(size);
  if (!RULES[rules]) rules = "sums";
  if (!SIZES[size]) size = 10;
  level = levelFor(rules, size, level);
  const op = RULES[rules].op, want = ORDER.indexOf(level), [start, lo, hi] = LEAN[rules][level];
  let target = start, nearest = null;
  for (let t = 0; t < TRIES; t++) {
    const r = rng(mix(seed, rules, size, level, t));
    const black = patternOf(size, size, r, PATTERN[rules]);
    if (!black) continue;
    const shape = shapeOf(size, size, black);
    const fill = fillOf(shape, r, { op });
    if (!fill) continue;
    const u = uniqueFill(shape, lean(shape, fill, r, { op, target }), r, { op });
    if (!u) continue;
    const g = grade({ shape, clues: u.clues, op }, new Uint8Array(shape.cells));
    const got = levelOf(g.rank, g.work, shape.white.length);
    if (!got) continue;
    const out = { seed, rules, op, rows: size, cols: size, level: got, rank: g.rank, work: g.work, black, solution: u.solution, clues: u.clues, shape, uses: g.uses, tries: t + 1 };
    const at = ORDER.indexOf(got);
    if (at === want) return out;
    if (at < want && (!nearest || at > ORDER.indexOf(nearest.level))) nearest = out;
    target = Math.max(lo, Math.min(hi, target + (at < want ? 150 : -150)));
  }
  if (nearest) return nearest;
  // nothing at all in every try (it hasn't happened in testing): the level below, from the same seed
  return want > 0 ? generate({ seed, rules, size, level: ORDER[want - 1] }) : generate({ seed: seed + 1, rules, size, level });
}

// ---------- as text: for the saved run, a match, and a link ----------
/** A grid as strings: { rules, r, c, level, rank, seed, p (the pattern, "#" black, "." white), s (the solution) }. */
export function encode(p) {
  return { rules: p.rules, r: p.rows, c: p.cols, level: p.level, rank: p.rank, seed: p.seed,
    p: [...p.black].map(b => (b ? "#" : ".")).join(""), s: [...p.solution].join("") };
}
/** A grid from its text, its shape and clues worked out again from the pattern and the solution. */
export function decode(e) {
  const rows = Number(e.r), cols = Number(e.c), op = RULES[e.rules]?.op || "sum";
  const black = Uint8Array.from([...e.p], ch => (ch === "#" ? 1 : 0)), solution = Uint8Array.from([...e.s], Number);
  const shape = shapeOf(rows, cols, black);
  return { rules: e.rules, op, rows, cols, level: e.level, rank: e.rank, seed: e.seed, black, solution, shape, clues: cluesOf(shape, solution, op) };
}
/** Whether an encoded grid is whole: its size, a Tally's pattern, a digit in every white cell and none twice in a
 *  run, and (Products) every clue short enough to print. */
export function validGrid(e) {
  try {
    if (!e || !RULES[e.rules] || !SIZES[e.r] || Number(e.c) !== Number(e.r) || !LEVELS[e.level]) return false;
    const cells = e.r * e.c;
    if (typeof e.p !== "string" || typeof e.s !== "string" || e.p.length !== cells || e.s.length !== cells || !/^[#.]+$/.test(e.p) || !/^\d+$/.test(e.s)) return false;
    const p = decode(e);
    if (!patternOk(p.rows, p.cols, p.black)) return false;
    for (let i = 0; i < cells; i++) if (p.black[i] ? p.solution[i] : !p.solution[i]) return false;
    if (p.shape.runs.some(run => new Set([...run.cells].map(c => p.solution[c])).size !== run.cells.length)) return false;
    return p.op !== "product" || p.clues.every(x => x <= MOST);
  } catch { return false; }
}

// ---------- playing together: the clues split between the players ----------
/**
 * Together, each player sees only part of the clues (the rest show as "?"), and what anyone writes is everyone's.
 * For two, one holds the across clues and the other the down ones: every cell is where an across run meets a down
 * run, so every digit needs both. That alone can't be finished without talking, so then, a few at a time, clues are
 * shown to both, until the relay below finishes: each player works out what they can from what they see, what they
 * find goes to the other, and round again. The clues shown are the ones worth most: those whose cells the other
 * player already sees the crossing clues of, so they'd hold both sums there. As few are shared as that takes (about a
 * third), so each still holds a dozen or so clues the other needs. A table of three to six gets the clues dealt round
 * it a clue cell at a time instead (across and down from one clue cell to the same player), and the same relay.
 *
 * A split is a string, a character a run (in the shape's order): the player ("0".."5") who alone sees that clue, or
 * "*" for a clue everyone sees.
 */
export function splitFor(p, k, seed) {
  k = Math.max(2, Math.min(6, k | 0));
  const r = rng(mix(seed, "split", k)), runs = p.shape.runs;
  let last = null;
  for (let deal = 0; deal < 4; deal++) {
    const parts = k === 2 ? runs.map(run => (run.dir === "across" ? "0" : "1")) : dealRound(p, k, r);
    for (let t = 0; t < 200; t++) {
      const run = relay(p, parts.join(""), k);
      if (run.done) break;
      // the clues worth showing: where the others already see the crossing clues, so they'd hold both sums at those
      // cells; a few at once while most are still private (a whole relay is the price of each look)
      const hidden = [...parts.keys()].filter(i => parts[i] !== "*");
      if (!hidden.length) break;
      const worth = k2 => {
        let n = 0;
        for (const c of runs[k2].cells) {
          if (run.placed[c]) continue;
          const cross = runs[k2].dir === "across" ? p.shape.down[c] : p.shape.across[c];
          if (parts[cross] === "*" || parts[cross] !== parts[k2]) n++;
        }
        return n;
      };
      // among clues worth as much, those of whoever holds the most, so nobody is left holding next to nothing
      const own = {};
      for (const i of hidden) own[parts[i]] = (own[parts[i]] || 0) + 1;
      const most = Math.max(...Object.values(own));
      const ranked = shuffle(r, hidden).map(i => [worth(i) * 16 + Math.floor((15 * own[parts[i]]) / most), i]).sort((a, b) => b[0] - a[0]);
      for (const [, i] of ranked.slice(0, Math.max(1, Math.floor(hidden.length / 12)))) parts[i] = "*";
    }
    last = parts.join("");
    // a split where someone could finish alone (what they see has one solution) isn't one: share again, otherwise
    if (![...Array(k).keys()].some(q => alone(p, last, q))) return last;
  }
  return last;
}
/** Whether player q of a split could finish alone: what they see has exactly one solution. */
export function alone(p, parts, q) {
  const v = viewOf(p, parts, q);
  return solver(v.shape, v.clues, v.op).solve({ limit: 2, maxNodes: 20000 }).count === 1;
}
/** Clues dealt round a table: a clue cell's across and down clues to one player, the next clue cell's to the next. */
function dealRound(p, k, r) {
  const out = [], runs = p.shape.runs;
  let turn = below(r, k), head = -1;
  for (const run of runs) {
    if (run.head !== head) { head = run.head; turn = (turn + 1) % k; }
    out.push(String(turn));
  }
  return out;
}
/** What one player of a split sees: the grid as the solvers take it ({ shape, clues, op }), others' clues null. */
export function viewOf(p, parts, q) {
  const mine = String(q);
  return { shape: p.shape, op: p.op, clues: p.clues.map((x, k) => (parts == null || parts[k] === "*" || parts[k] === mine ? x : null)) };
}
/** Which clues a player sees, as a list of booleans: theirs, the shared ones and those lent to them. */
export const cluesSeen = (p, parts, q, lent = []) => p.clues.map((_, k) => !parts || parts[k] === "*" || parts[k] === String(q) || lent.includes(Number(parts[k])));
/**
 * The relay for a split: in each round every player works out all they can from their own view with the techniques
 * up to the grid's own rank, and what they found is placed for everyone. { done, rounds, credit (cells each found
 * first; a cell two found at once counts half to each), placed }.
 */
export function relay(p, parts, k, { upTo = Math.min(p.rank || 2, 4) } = {}) {
  const { white, cells } = p.shape, placed = new Uint8Array(cells), credit = new Array(k).fill(0);
  let rounds = 0;
  const left = () => white.filter(c => !placed[c]).length;
  while (left() > 0 && rounds < 60) {
    const found = new Map();                         // cell -> [digit, players]
    for (let q = 0; q < k; q++) {
      const view = viewOf(p, parts, q), st = stateOf(view, placed);
      for (let s = 0; s < 600; s++) {
        const step = nextStep(view, st, { upTo });
        if (!step) break;
        apply(view, st, step);
        if (step.place && !placed[step.place[0]]) {
          const f = found.get(step.place[0]);
          if (f) f[1].push(q); else found.set(step.place[0], [step.place[1], [q]]);
        }
      }
    }
    if (!found.size) break;
    for (const [c, [d, who]] of found) { placed[c] = d; for (const q of who) credit[q] += 1 / who.length; }
    rounds++;
  }
  return { done: left() === 0, rounds, credit, placed };
}

export { shapeOf, solver, BEYOND };
