// The games that can be played as a pair on one shared board (docs/coop.md), by id. Light on purpose: suite.js reads it on
// a watching page to know whether to offer Request to join, and must not load a game's engine for that. Each entry is the
// game's id, name and page, the keys its board in play is saved under (the host's run is where the co-op starts), and
// `load`, which brings in its adapter (<game>-coop.js: share, run, valid, rules) only when a phone is about to share a
// board. The adapters are pure, so a phone can load one from any page. A game is added here once its own page is wired to
// the shared board (coop-page.js).
export const COOP_GAMES = {
  slitherlink: { id: "slitherlink", name: "Portolan", page: "slitherlink.html", keys: ["slitherlink:run"], load: () => import("./slitherlink-coop.js") },
  nurikabe: { id: "nurikabe", name: "Dujiang", page: "nurikabe.html", keys: ["nurikabe:run"], load: () => import("./nurikabe-coop.js") },
  hitori: { id: "hitori", name: "Cull", page: "hitori.html", keys: ["hitori:run"], load: () => import("./hitori-coop.js") },
  sudoku: { id: "sudoku", name: "Nonet", page: "sudoku.html", keys: ["sudoku:run"], load: () => import("./sudoku-coop.js") },
  calcudoku: { id: "calcudoku", name: "Calcudoku", page: "calcudoku.html", keys: ["calcudoku:run"], load: () => import("./calcudoku-coop.js") },
  kakuro: { id: "kakuro", name: "Tally", page: "kakuro.html", keys: ["kakuro:run"], load: () => import("./kakuro-coop.js") },
  nonogram: { id: "nonogram", name: "Nonogram", page: "nonogram.html", keys: ["nonogram:run"], load: () => import("./nonogram-coop.js") },
  masyu: { id: "masyu", name: "Pearl", page: "masyu.html", keys: ["masyu:run"], load: () => import("./masyu-coop.js") },
  bridges: { id: "bridges", name: "Bridges", page: "bridges.html", keys: ["bridges:run", "bridges:lruns", "bridges:track", "bridges:camp"], load: () => import("./bridges-coop.js") },
};

export const isCoop = id => Object.hasOwn(COOP_GAMES, id);
export const coopGame = id => (isCoop(id) ? COOP_GAMES[id] : null);
/** The game's id, name, page and keys together with its adapter's share, run, valid and rules, or null. */
export async function coopAdapter(id) {
  const entry = coopGame(id);
  return entry ? { ...entry, ...(await entry.load()).default } : null;
}
