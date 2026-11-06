// Nonogram played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again. Pure, so tests can check it without a page, and loaded by the host's phone on any page when a partner is let in
// (coop-games.js lists it), not only by Nonogram's own. Not the Split match of duel.js (there the clues are dealt out, the rows
// to one of you and the columns to the other): here both of you see every clue and draw on one grid.
//
// The shared board: the picture (`fixed`: its id, size and grid, the mistakes setting, and the cell count so a phone whose
// picture came out another size can say so) and one layer, `grid`, a character a cell as in a run ("." empty, "x" crossed out,
// "1"-"7" a colour). Mistakes and hints are tallies (each counts once, however many of you made one at the same time), the solve
// a once-value (`done`). Undo, redo, the tool in hand and a hint's ring are each player's own. Naming the picture is off while
// you draw together (it is one player's typed answer, and a go at it for the team, which the Split match already is); the
// board remembers whether it was on (`nameIt`) so the host's own run has it back when the co-op ends.
import { tallyOf, onceOf } from "./board-share.js";

export const KEY = "nonogram:run";

// nonogram-pictures.js's sizes and the most cells a picture has, here by hand: importing it loads every picture
const SIZE_IDS = ["small", "medium", "large"];
const MOST_CELLS = 2000;

/** A saved run that is a picture in play on its own: not a match's, nor one the computer draws half of or races. */
export const playable = s => !!s && s.v === 1 && s.mode !== "duel" && (s.rules?.computer ?? "off") === "off" && typeof s.id === "string" && SIZE_IDS.includes(s.size)
  && typeof s.grid === "string" && s.grid.length > 0 && s.grid.length <= MOST_CELLS && /^[.x1-7]+$/.test(s.grid) && Array.isArray(s.undo) && Number.isFinite(s.ms);

/** The picture, the part of a run that does not change. */
export const fixedOf = s => ({
  mode: s.mode === "daily" ? "daily" : "random", id: s.id, size: s.size, hex: !!s.hex, ...(s.mode === "daily" ? { day: s.day } : {}),
  mistakes: s.rules?.mistakes === "hidden" ? "hidden" : "shown", nameIt: s.rules?.nameIt !== false, cells: s.grid.length, ...(s.name ? { name: s.name } : {}),
});

export default {
  /** The shared board out of what the game has saved ({ key: the saved text }); null when there is no picture in play to share (none, or drawn). */
  share(saved) {
    let run;
    try { run = JSON.parse(saved?.[KEY]); } catch { return null; }
    if (!playable(run) || run.done) return null;
    return { fixed: fixedOf(run), layers: { grid: run.grid }, start: { ms: Math.round(run.ms), mistakes: run.mistakes || 0, hints: run.hints || 0 } };
  },

  /** The board to show, as a run: the page adds its own (undo, redo) and keeps the clock from `start`. Today's picture drawn together stops being today's: it counts for nobody's daily, so the host run must not stand in for it. */
  run(board) {
    const f = board.fixed, done = onceOf(board, "done") || null, st = board.start || {};
    return {
      v: 1, id: f.id, size: f.size, hex: !!f.hex, mode: done && f.mode === "daily" ? "random" : f.mode, day: f.day ?? null, play: "solo",
      grid: board.layers.grid, undo: [], redo: [], ms: Math.round(st.ms || 0),
      mistakes: (st.mistakes || 0) + tallyOf(board, "mistakes"), hints: (st.hints || 0) + tallyOf(board, "hints"),
      name: f.name || null, done: done ? { ms: done.ms, score: done.score } : null,
      rules: { mistakes: f.mistakes === "hidden" ? "hidden" : "shown", nameIt: false, computer: "off", pace: "medium" }, rival: null,
    };
  },

  /** Once the picture is drawn, nothing else changes the grid. */
  rules: { frozen: board => !!board.once?.done },

  /** The board is worth keeping: a picture of a size this version knows, a character for every cell of the count it says, only ".", "x" or a colour 1-7. */
  valid: board => {
    const f = board?.fixed, g = board?.layers?.grid;
    return !!f && typeof f.id === "string" && SIZE_IDS.includes(f.size) && Number.isInteger(f.cells) && f.cells > 0 && f.cells <= MOST_CELLS
      && typeof g === "string" && g.length === f.cells && /^[.x1-7]+$/.test(g) && (f.mistakes === "shown" || f.mistakes === "hidden") && (f.name == null || typeof f.name === "object");
  },
};

// ---------- pointing at a clue: a line lit on your partner's screen ----------
export const LOOK_FOR = 6000;                      // ms a line stays lit
const SKEW = 8000;                                 // ms the two phones' clocks may differ by before a look is taken for an old one
/** What a player writes at their own place in the room to point at line `line` (a row, then the columns) at time `at`. */
export const lookValue = (line, at = Date.now()) => `${line}:${at}`;
/** The lines the others are pointing at now, from the room's players ({ uid: { slot, look } }): those here, not yours, lit for LOOK_FOR. */
export function looksOf(players, me, hereIds, lines, now = Date.now()) {
  const out = [];
  for (const [uid, p] of Object.entries(players || {})) {
    if (!p || uid === me || !hereIds.includes(uid) || typeof p.look !== "string") continue;
    const [line, at] = p.look.split(":").map(Number);
    if (Number.isInteger(line) && line >= 0 && line < lines && Number.isFinite(at) && now - at < LOOK_FOR && at - now < SKEW) out.push({ slot: p.slot ?? 1, line });
  }
  return out;
}
