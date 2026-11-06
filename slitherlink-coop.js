// Portolan played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes
// a run again. Pure, so tests can check it without a page, and loaded by the host's phone on any page when a partner is
// let in (coop-games.js lists it), not only by Portolan's own.
//
// The shared board: the puzzle (`fixed`: it never changes) and one layer, `marks`, a character an edge as in a run
// ("0" nothing, "1" a line, "2" crossed). Hints are a tally (`hints`), the solve a once-value (`done`: { ms, score, by }).
// Undo, redo and the hint's gilt are each player's own and stay on their page.
import { fitsBoard, twistOn } from "./slitherlink-engine.js";
import { tallyOf, onceOf } from "./board-share.js";

export const KEY = "slitherlink:run";
export const HINT = 30;                              // seconds a hint adds, as in the solo game

/** A saved run that is a puzzle in play (the page's own check, without the page). */
export const playable = s => !!s && s.v === 1 && fitsBoard(s) && typeof s.marks === "string"
  && typeof s.sol === "string" && s.sol.length === s.marks.length && Number.isFinite(s.ms);

/** The puzzle, the part of a run that does not change. */
// 5 November 2026: the board (square or hex), its causeways (`tun`, dots) and its twist travel with the puzzle; the ranges are in the grid.
export const fixedOf = s => {
  const board = s.board === "hex" ? "hex" : "square";
  return { mode: s.mode || "random", seed: s.seed, board, size: s.size, level: s.level, twist: s.twist === "shade" ? "shade" : twistOn(s.twist, board), tun: board === "hex" ? "" : s.tun || "", came: s.came || s.level, grid: s.grid, sol: s.sol };
};

export default {
  /** The shared board out of what the game has saved ({ key: the saved text }); null when there is no board in play to share (none, or solved). */
  share(saved) {
    let run;
    try { run = JSON.parse(saved?.[KEY]); } catch { return null; }
    if (!playable(run) || run.done) return null;
    return { fixed: fixedOf(run), layers: { marks: run.marks }, start: { ms: Math.round(run.ms), hints: run.hints || 0 } };
  },

  /** The board to show, as a run: the page adds its own (undo, redo, the hint showing) and keeps the clock from `start`. */
  run(board) {
    const f = board.fixed, done = onceOf(board, "done") || null;
    return { v: 1, ...f, marks: board.layers.marks, hints: (board.start?.hints || 0) + tallyOf(board, "hints"), done: done ? { ms: done.ms, score: done.score } : null };
  },

  /** Once the loop is solved, nothing else changes the marks. */
  rules: { frozen: board => !!board.once?.done },

  /** The board is worth keeping: a puzzle of a size this version knows, with its marks the length of its answer. */
  valid: board => !!board?.fixed && fitsBoard(board.fixed) && typeof board.fixed.sol === "string" && board.layers?.marks?.length === board.fixed.sol.length,
};
