// Bridges played as a pair (docs/coop.md): how the host's saved run becomes a shared board and a shared board becomes a run
// again. Pure, so tests can check it without a page, and loaded by the host's phone on any page when a partner is let in
// (coop-games.js lists it), not only by Bridges' own.
//
// The shared board: the puzzle (`fixed`: every twist's strings, never changes) and two layers, `marks`, a character a link in
// the layout's link order as in a run ("0" to "3" bridges), and `split`, one character (below). Hints are a tally (`hints`), the
// solve a once-value (`done`). Two edits to the same link are settled by the board's own rule: the later one wins (board-share.js's
// `merge`), and two partners tapping the same link together lay one bridge, not two (both saw the same bridges, and made the same
// change). Undo, redo and a hint's gilt are each player's own and stay on their page.
import { tallyOf, onceOf } from "./board-share.js";
import { playable, fixedOf } from "./bridges-run.js";
import { rngOf } from "./bridges-engine.js";

export const RUN = "bridges:run", LRUNS = "bridges:lruns", TRACK = "bridges:track", CAMP = "bridges:camp";
const parse = text => { try { return JSON.parse(text); } catch { return null; } };

/**
 * The shared board for a run (what the host's puzzle becomes when a partner joins), or null if it is not a puzzle in play.
 * `split` is the setting that hides half of the numbers from each player (3 November 2026, Korbi); it lives in the board as a
 * layer of one character, so either of you can change it, both screens change at once, and a reload or a late joiner reads it.
 */
export function shareRun(run, split = true) {
  if (!playable(run) || run.done) return null;
  return { fixed: fixedOf(run), layers: { marks: run.marks, split: split ? "1" : "0" }, start: { ms: Math.round(run.ms), hints: run.hints || 0 } };
}

// ---------- the split: half of the numbers to each of you ----------
/** Whether a board splits its numbers between the two of you. A board with no setting (one from before) does not. */
export const splitOn = board => board?.layers?.split === "1";

/**
 * Who sees each island's number: a string a cell, "h" for the host, "g" for the guest, "." where there is no island. Dealt from
 * the puzzle's seed, so the same on both phones, after a reload and for a late joiner. The board is cut into nine regions; in each
 * the islands are shuffled and handed out alternately, so neither of you is left with none anywhere there are two, and the odd
 * island of a region goes to whoever has fewer so far, so the whole board is shared to within one island.
 */
export function halves({ seed, size, grid }) {
  const rng = rngOf(((Number(seed) | 0) ^ 0x5bd1e995) >>> 0), out = Array.from(grid, ch => (ch === "." ? "." : "?"));
  const regions = Array.from({ length: 9 }, () => []);
  for (let i = 0; i < grid.length; i++) if (grid[i] !== ".") regions[Math.floor((Math.floor(i / size) * 3) / size) * 3 + Math.floor(((i % size) * 3) / size)].push(i);
  const got = { h: 0, g: 0 };
  for (const cells of regions) {
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const first = got.h === got.g ? (rng() < 0.5 ? "h" : "g") : got.h < got.g ? "h" : "g";      // the side that gets the odd one
    cells.forEach((c, k) => { const side = k % 2 === 0 ? first : first === "h" ? "g" : "h"; out[c] = side; got[side]++; });
  }
  return out.join("");
}
/** Whether the island at cell `i` shows its number to this player (`host`: the host's phone), given a board's halves and its setting. */
export const sees = (mask, i, host, on = true) => !on || mask[i] === (host ? "h" : "g");

// ---------- pings: a ring on an island, shown to your partner ----------
export const PING_FOR = 2200;                      // ms a ring stays on an island
const SKEW = 8000;                                 // ms the two phones' clocks may differ by before a ping is taken for an old one
/** What a player writes at their own place in the room to ping island `isl` (its index) at time `at`. */
export const pingValue = (isl, at = Date.now()) => `${isl}:${at}`;
/**
 * The pings to show now, from the room's players ({ uid: { slot, ping } }): those not seen before (`seen`, a Map of uid → the
 * last value, kept by the page) that are new enough that they are not a ping left in the room from before a reload. A player's
 * own place holds only their last ping, so a second ping replaces the first. Returns [{ uid, isl, slot }].
 */
export function newPings(players, seen, now = Date.now(), count = Infinity) {
  const out = [];
  for (const [uid, p] of Object.entries(players || {})) {
    const v = typeof p?.ping === "string" ? p.ping : null;
    if (!v || seen.get(uid) === v) continue;
    seen.set(uid, v);
    const [isl, at] = v.split(":").map(Number);
    if (Number.isInteger(isl) && isl >= 0 && isl < count && Number.isFinite(at) && Math.abs(now - at) < SKEW) out.push({ uid, isl, slot: p.slot ?? 0 });
  }
  return out;
}

export default {
  /**
   * The shared board out of what the game has saved ({ key: the saved text }): the puzzle the host is on, the level's when
   * they are playing the ladder, else the free one. Null when there is none in play to share (none, or solved).
   */
  share(saved) {
    const free = parse(saved?.[RUN]), track = parse(saved?.[TRACK]), camp = parse(saved?.[CAMP]);
    const levels = track === "levels" || (track !== "free" && !playable(free));
    const run = levels ? parse(saved?.[LRUNS])?.[camp?.at] : free;
    return shareRun(run && (levels ? run.mode === "level" && run.lv === camp?.at : run.mode !== "level") ? run : null);
  },

  /** The board to show, as a run: the page adds its own (undo, redo, the hint showing) and keeps the clock from `start`. */
  run(board) {
    const f = board.fixed, done = onceOf(board, "done") || null;
    return { v: 1, ...f, marks: board.layers.marks, hints: (board.start?.hints || 0) + tallyOf(board, "hints"), done: done ? { ms: done.ms, score: done.score } : null };
  },

  /** Once the puzzle is solved, nothing else changes the bridges. */
  rules: { frozen: board => !!board.once?.done },

  /** The board is worth keeping: a puzzle this version plays, with a bridge count for every link of its answer (and the split, if it has it, one character). */
  valid: board => !!board?.fixed && typeof board.layers?.marks === "string" && playable({ ...board.fixed, v: 1, ms: 0, marks: board.layers.marks })
    && (board.layers.split == null || board.layers.split === "0" || board.layers.split === "1"),
};
