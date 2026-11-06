// Cull played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again. Pure, so tests can check it without a page, and loaded by the host's phone on any page when a partner is let in
// (coop-games.js lists it), not only by Cull's own. Not the split board of duel.js (each partner sees half the numbers):
// here both of you see every number and edit one board.
//
// The shared board: the puzzle (`fixed`: it never changes) and one layer, `marks`, a character a cell as in a run ("." nothing,
// "#" shaded, "o" kept: a note, but one both of you see). Hints are a tally (`hints`), the solve a once-value (`done`).
// Undo, redo and the hint's gilt are each player's own and stay on their page.
import { SHAPES, SIZES, boardOf } from "./hitori-engine.js";
import { tallyOf, onceOf } from "./board-share.js";

export const KEY = "hitori:run";

/** The number of cells of a board of this shape and size, or 0 for one there is none of. */
const cellsOf = (shape, size) => (Object.hasOwn(SHAPES, shape) && SIZES[shape].includes(size) ? boardOf(shape, size).cells : 0);

/** A saved run that is a puzzle in play on its own (not a table's: a race and the split board are not kept under this key). */
export const playable = s => !!s && s.v === 1 && s.mode !== "duel" && s.mode !== "pair" && typeof s.grid === "string" && typeof s.marks === "string" && typeof s.sol === "string"
  && cellsOf(s.shape, s.size) > 0 && s.grid.length === cellsOf(s.shape, s.size) && s.marks.length === s.grid.length && s.sol.length === s.grid.length && Number.isFinite(s.ms);

/** The puzzle, the part of a run that does not change. */
export const fixedOf = s => ({ mode: s.mode === "daily" ? "daily" : "random", seed: s.seed, shape: s.shape, size: s.size, level: s.level, came: s.came || s.level, grid: s.grid, sol: s.sol });

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

  /** Once the shading is the answer, nothing else changes the marks. */
  rules: { frozen: board => !!board.once?.done },

  /** The board is worth keeping: a puzzle of a board and size this version knows, a number, an answer and a mark for every cell, the marks only ".", "#" or "o". */
  valid: board => {
    const f = board?.fixed, n = f ? cellsOf(f.shape, f.size) : 0;
    return n > 0 && typeof f.grid === "string" && typeof f.sol === "string" && f.grid.length === n && f.sol.length === n && board.layers?.marks?.length === n && /^[.#o]+$/.test(board.layers.marks);
  },
};
