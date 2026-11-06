// Tally played as a pair (docs/coop.md): how the game's saved run becomes a shared board and a shared board becomes a run
// again, on the digit grid's adapter (digits-coop.js: the digits and a layer of pencil marks for each digit; a clue's black cell
// is a cell like any other that nobody writes in). Pure, so tests can check it without a page, and loaded by the host's phone on
// any page when a partner is let in (coop-games.js lists it), not only by Tally's own. Not Together (kakuro-room.js: each player
// sees a share of the clues, on duel.js): here both of you see every clue and write on one grid.
import { validGrid } from "./kakuro-engine.js";
import { digitsAdapter } from "./digits-coop.js";

const { KEY, playable, adapter } = digitsAdapter({ key: "kakuro:run", validGrid, shape: g => ({ k: 9, cells: g.r * g.c }) });
export { KEY, playable };
export default adapter;
