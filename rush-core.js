// The puzzle rush, the same in every game that has one (README, "Puzzle rush"): Chess's chess puzzles (rush.html), and
// River's, Hong's and Tribute's on the game's own page; Schafkopf's, Gammon's, Banquet's and Bones' on a sheet over it
// (rush-sheet.js). The kinds of run, the clocks, the three misses, your bests and the words for them are here once, so
// they read and work alike everywhere; how a game deals its puzzles and judges a move stays its own. No page in it: the
// games and tests/rush.mjs share it (rush-menu.js puts the choices in a menu).

/**
 * The clocks: 3 minutes, each puzzle's first five seconds free (a chess clock's delay: it waits, then runs, and never
 * gains); 5 minutes; or survival, no clock, the run going on to the third miss.
 */
export const MODES = {
  three: { label: "3 min", ms: 3 * 60 * 1000, grace: 5000 },
  five: { label: "5 min", ms: 5 * 60 * 1000, grace: 0 },
  survival: { label: "Survival", ms: 0, grace: 0 },
};
/** A clock's id; anything else (a run kept before the clocks were chosen) reads as the first. */
export const modeOf = id => (Object.hasOwn(MODES, id ?? "") ? id : "three");
/** The kinds of run: random, or today's, the same puzzles in the same order for everyone that day. A game may add its
 *  own after them (River's Patterns). */
export const RUNS = [["random", "Random"], ["daily", "Today's"]];
/** Misses that end a run. */
export const STRIKES = 3;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A clock's time, m:ss, rounded up: it shows 0:00 only once the time is out. */
export function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** Misses as marks, ✗ for each and ○ for those left: "✗○○". */
export const strikeMarks = n => "✗".repeat(Math.min(n, STRIKES)) + "○".repeat(Math.max(0, STRIKES - n));

// ---------- the clock of a rush on a board (chess, River): it runs from the first solve, through every puzzle ----------
/** Time a run has used: from its start, less the grace each puzzle used (this one's so far). run: { mode, started,
 *  free (grace banked), puzzleAt (this puzzle's start) }, all in the same milliseconds as `now`. */
export function spentOf(run, now) {
  const g = MODES[modeOf(run.mode)].grace;
  return now - run.started - (run.free || 0) - (run.puzzleAt != null ? Math.min(g, now - run.puzzleAt) : 0);
}
/** A new puzzle on the board: the grace the last one used is banked, and this one's begins. */
export function nextPuzzleAt(run, now) {
  if (run.started == null) return;
  const g = MODES[modeOf(run.mode)].grace;
  if (run.puzzleAt != null) run.free = (run.free || 0) + Math.min(g, now - run.puzzleAt);
  run.puzzleAt = now;
}

// ---------- the clock of a rush of positions (the card and tile games, Gammon): it stands while a verdict is read ----------
/** A run's clock: the time left (null with none: survival) and the current puzzle's grace still to use. */
export function clockFor(mode) {
  const m = MODES[modeOf(mode)];
  return { left: m.ms || null, wait: m.grace };
}
/** Whether a run's time is out (never, with no clock). */
export const timeUp = run => run.left != null && run.left <= 0;
/** dt milliseconds of a puzzle waiting for your play: its grace first, then the clock. True once the time's out. */
export function runDown(run, dt) {
  if (run.left == null) return false;
  const free = Math.min(Math.max(0, run.wait || 0), dt);
  run.wait = (run.wait || 0) - free;
  run.left = Math.max(0, run.left - (dt - free));
  return run.left <= 0;
}
/** The next puzzle: its grace, whole. */
export function graceAgain(run) { run.wait = MODES[modeOf(run.mode)].grace; }

/**
 * The order a rush of positions on a sheet deals its puzzles (rush-sheet.js): rising difficulty, four at each rating (r,
 * 1 to 10), chosen at random within a rating from those not seen lately (`recent`: ids), any seen if a rating runs dry;
 * then the rest, hardest first. Today's run passes today as the seed and nothing seen, so it's the same everywhere.
 */
export function runOrder(bank, seed, recent = []) {
  const r = rng(seed), seen = new Set(recent), out = [], used = new Set();
  for (let step = 1; step <= 10; step++) {
    const pool = bank.filter(p => p.r === step && !used.has(p.id));
    const fresh = pool.filter(p => !seen.has(p.id)), from = fresh.length >= 4 ? fresh : pool;
    for (let i = 0; i < 4 && from.length; i++) {
      const p = from.splice(Math.floor(r() * from.length), 1)[0];
      out.push(p.id);
      used.add(p.id);
    }
  }
  for (const p of bank.filter(x => !used.has(x.id)).sort((a, b) => b.r - a.r)) out.push(p.id);
  return out;
}

// ---------- a rated rush (chess, River): your rating, and the puzzles it serves ----------
/**
 * Your rating ({ r, n }) after a puzzle, Elo-style against the puzzle's: fast for your first twenty puzzles (30 points a
 * game's worth), then slowly (10 for a solve, halving with each miss earlier in the run so a careless run can't climb;
 * 14 for a miss), between 400 and 3,000.
 */
export function rated({ r, n }, puzzle, solved, missesSoFar) {
  const expected = 1 / (1 + 10 ** ((puzzle.rating - r) / 400));
  const k = n < 20 ? 30 : solved ? 10 / 2 ** missesSoFar : 14;
  return { r: Math.max(400, Math.min(3000, r + k * ((solved ? 1 : 0) - expected))), n: n + 1 };
}
/**
 * The rating a run's next puzzle aims at (run: { warming, duel, daily, at, solved }; r: your rating; rand: the run's
 * chance, seeded by the run and how far it has got): the warm-up an easy one; a battle the same climb for everyone at
 * the table by the puzzle's number in the run, 650 and 60 a puzzle; today's run the same for everyone, 800 and 60 a
 * solve; otherwise from about 250 below your rating, 40 a solve, to about 150 above it (a miss doesn't raise it).
 */
export function targetOf(run, r, rand) {
  if (run.warming) return 650 + rand() * 100;
  if (run.duel) return Math.min(2500, 650 + run.at * 60 + (rand() - 0.5) * 120);
  if (run.daily) return Math.min(2500, 800 + run.solved * 60 + (rand() - 0.5) * 200);
  return Math.max(600, Math.min(2500, Math.min(r + 150, r - 250 + run.solved * 40) + (rand() - 0.5) * 160));
}
/** The puzzle nearest a target among those not yet used (all of them again, once a run has used every one), a salt of
 *  up to 40 points so a target doesn't always give the same one. */
export function nearest(bank, used, target, rand) {
  const free = bank.some(p => !used.has(p.id)) ? p => !used.has(p.id) : () => true;
  let best = null;
  for (const p of bank) {
    if (!free(p)) continue;
    const d = Math.abs(p.rating - target) + rand() * 40;
    if (!best || d < best.d) best = { p, d };
  }
  return best?.p || null;
}

// ---------- your bests ----------
/**
 * Your bests by kind of run, as a game keeps them: a best for each clock ({ three, five, survival }) and for a game's
 * own kinds (River's patterns). A lone number is from before the clocks were chosen, a five-minute run's; the chess
 * Rush kept its today's runs' bests apart ("three:daily"), and they count for their clock now.
 */
export function bestsOf(kept) {
  if (typeof kept === "number") return kept > 0 ? { five: kept } : {};
  const out = {};
  for (const [k, n] of Object.entries(kept && typeof kept === "object" ? kept : {})) {
    const key = k.replace(/:daily$/, "");
    if (typeof n === "number" && n > 0) out[key] = Math.max(out[key] || 0, n);
  }
  return out;
}
/** The best a run counts for: its clock's, whether random or today's; a game's own kind of run (River's patterns) its own. */
export const bestKey = ({ kind = "random", mode }) => (kind === "random" || kind === "daily" ? modeOf(mode) : kind);
/** Today's runs' key ({ "YYYYMMDD/mode": n }). */
export const dayKey = (day, mode) => `${day}/${modeOf(mode)}`;
/**
 * A finished run ({ kind, mode, score }) noted: its best and, for today's run, today's best. Returns the new { bests,
 * daily }, the best the run is set against (today's for today's run) and what that was before it.
 */
export function noteRun(bests, daily, run, day) {
  const b = { ...bestsOf(bests) }, d = { ...(daily || {}) }, key = bestKey(run), wasBest = b[key] || 0;
  b[key] = Math.max(wasBest, run.score);
  if (run.kind !== "daily") return { bests: b, daily: d, best: b[key], was: wasBest };
  const k = dayKey(day, run.mode), was = d[k] || 0;
  d[k] = Math.max(was, run.score);
  return { bests: b, daily: d, best: d[k], was };
}
/** A kind of run's name: a clock's ("3 min", "Survival") or a game's own kind's (own: { patterns: "Patterns" }). */
export const kindName = (key, own = {}) => MODES[key]?.label || own[key] || key;
/** Your bests in the rush's own menu: a line for each clock and each of a game's own kinds, today's run beside it. */
export function bestLines(bests, daily, day, own = {}) {
  const b = bestsOf(bests), d = daily || {};
  return [...Object.keys(MODES), ...Object.keys(own)].map(k => {
    const t = MODES[k] ? d[dayKey(day, k)] : undefined;
    return `${kindName(k, own)}: ${b[k] ? `best ${b[k]}` : "no run yet"}${t != null ? `, today's run ${t}` : ""}`;
  });
}
/** Your bests in a game's About, in one line: "Puzzle rush bests: 3 min 12, 5 min 15, Survival 9"; "" before a run. */
export function bestsLine(bests, own = {}) {
  const b = bestsOf(bests), xs = [...Object.keys(MODES), ...Object.keys(own)].filter(k => b[k]).map(k => `${kindName(k, own)} ${b[k]}`);
  return xs.length ? `Puzzle rush bests: ${xs.join(", ")}` : "";
}
/** How a run ended, as its results say it: on time, at three misses, or with every puzzle there is done. */
export const endTitle = why => (why === "time" ? "Time" : why === "strikes" ? "Three misses" : "Every puzzle done");
