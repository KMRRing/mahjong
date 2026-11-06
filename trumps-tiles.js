// The four tiles of the games screen that open trumps.html: Jass, Belote, Coinche (Belote's auction, in the Appendix) and Schafkopf. One
// page and one engine (trumps-games.js); `?game=` says which, else the one played last (trumps:opts). No imports, so
// suite.js, party-core.js and the Node tests can read it.
export const TILES = {
  jass: { name: "Jass", games: ["jass"] },
  belote: { name: "Belote", games: ["belote"] },
  coinche: { name: "Coinche", games: ["coinche"] },
  schafkopf: { name: "Schafkopf", games: ["schafkopf"] },
};
/** The tile a game of the engine belongs to; null for anything else. */
export const tileOf = game => Object.keys(TILES).find(t => TILES[t].games.includes(game)) || null;
/** The engine game an address asks for (`?game=jass|belote|coinche|schafkopf`), else null. */
export const gameInAddress = (search = "") => {
  const g = new URLSearchParams(search).get("game");
  return tileOf(g) ? g : null;
};
