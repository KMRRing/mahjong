// Nonet played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again, on the digit grid's adapter (digits-coop.js: the digits and a layer of pencil marks for each digit). Pure, so tests can
// check it without a page, and loaded by the host's phone on any page when a partner is let in (coop-games.js lists it), not
// only by Nonet's own. Not Together (sudoku-room.js: each player sees a share of the givens, on duel.js): here both of you see
// every given and write on one grid.
import { validGrid } from "./sudoku-engine.js";
import { digitsAdapter } from "./digits-coop.js";

const { KEY, playable, adapter } = digitsAdapter({ key: "sudoku:run", validGrid });
export { KEY, playable };
export default adapter;
