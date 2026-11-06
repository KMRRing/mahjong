// Calcudoku played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again, on the digit grid's adapter (digits-coop.js: the digits and a layer of pencil marks for each digit). Pure, so tests can
// check it without a page, and loaded by the host's phone on any page when a partner is let in (coop-games.js lists it), not
// only by Calcudoku's own. Not Together (calcudoku-room.js: each player sees a share of the cages' clues, on duel.js): here both of
// you see every clue and write on one grid.
import { validGrid } from "./calcudoku-engine.js";
import { digitsAdapter } from "./digits-coop.js";

const { KEY, playable, adapter } = digitsAdapter({ key: "calcudoku:run", validGrid });
export { KEY, playable };
export default adapter;
