// Dujiang played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again. Pure, so tests can check it without a page, and loaded by the host's phone on any page when a partner is let in
// (coop-games.js lists it), not only by Dujiang's own.
//
// The shared board: the puzzle (`fixed`: it never changes) and one layer, `marks`, a character a cell as in a run ("0" nothing,
// "1" sea, "2" an island dot: a note, but one both of you see). Hints are a tally (`hints`), the solve a once-value (`done`:
// { ms, score, by }). Undo, redo and the hint's gilt are each player's own and stay on their page.
import { SIZES } from "./nurikabe-engine.js";
import { tallyOf, onceOf } from "./board-share.js";

export const KEY = "nurikabe:run";

/** A saved run that is a puzzle in play (the page's own check, without the page). */
export const playable = s => !!s && s.v === 1 && SIZES.includes(s.size) && typeof s.grid === "string" && typeof s.marks === "string"
  && typeof s.sol === "string" && s.sol.length === s.marks.length && s.grid.length === s.size * s.size && s.marks.length === s.grid.length && Number.isFinite(s.ms);

/** The puzzle, the part of a run that does not change. */
// (a level's puzzle is shared as a random one: it earns no stars for two. The twists are parts of the puzzle, so they travel with it.)
export const fixedOf = s => ({ mode: s.mode === "level" ? "random" : s.mode || "random", seed: s.seed, size: s.size, level: s.level, came: s.came || s.level, grid: s.grid, sol: s.sol,
  ...(s.twist ? { twist: s.twist } : {}), ...(s.bd ? { bd: s.bd } : {}), ...(s.br ? { br: s.br } : {}), ...(s.land != null ? { land: s.land } : {}) });

export default {
  /** The shared board out of what the game has saved ({ key: the saved text }); null when there is no board in play to share (none, or solved). */
  share(saved) {
    let run;
    try { run = JSON.parse(saved?.[KEY]); } catch { return null; }
    if (!playable(run) || run.done) return null;
    return { fixed: fixedOf(run), layers: { marks: run.marks }, start: { ms: Math.round(run.ms), hints: run.hints || 0 } };
  },

  /** The board to show, as a run: the page adds its own (undo, redo, the hint showing) and keeps the clock from `start`. Today's puzzle solved together stops being today's: it counts for nobody's daily, so the host run must not stand in for it. */
  run(board) {
    const f = board.fixed, done = onceOf(board, "done") || null;
    return { v: 1, ...f, mode: done && f.mode === "daily" ? "random" : f.mode, marks: board.layers.marks, hints: (board.start?.hints || 0) + tallyOf(board, "hints"), done: done ? { ms: done.ms, score: done.score } : null };
  },

  /** Once the sea is right, nothing else changes the marks. */
  rules: { frozen: board => !!board.once?.done },

  /** The board is worth keeping: a puzzle of a size this version knows, a mark and an answer for every cell, the marks only 0, 1 or 2. */
  valid: board => !!board?.fixed && SIZES.includes(board.fixed.size) && typeof board.fixed.sol === "string" && typeof board.fixed.grid === "string"
    && board.fixed.grid.length === board.fixed.size ** 2 && board.fixed.sol.length === board.fixed.grid.length && board.layers?.marks?.length === board.fixed.sol.length && /^[012]+$/.test(board.layers.marks),
};
