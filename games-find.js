// Finding a game on the games screen (docs/the-games-screen.md): favourites, a search and a filter. No page in it, so
// tests/games-find.mjs runs it in Node; games-bar.js draws it. Korbi, 3 November 2026.

// ---------- favourites ----------
/** One key a game, `home:fav:<id>` = "1", under the games screen's own prefix: suite.js syncs every key but `suite:`'s, so
 *  the stars follow your solo code to every device. A key a game rather than one list, so that two devices starring
 *  different games merge (the newer key wins, key by key) where a list would lose one device's change; and an id of a game
 *  that has since gone is a key nothing reads. */
export const FAV = "home:fav:";
const STAR = "1";
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** The starred ones among `ids`, read from storage (a private window with no storage: none). */
export function favourites(ids, from = store()) {
  const out = new Set();
  for (const id of ids) { try { if (from?.getItem(FAV + id) === STAR) out.add(id); } catch { /* private mode */ } }
  return out;
}
/** Stars a game, or takes the star off. */
export function setFavourite(id, on, to = store()) {
  try { if (on) to?.setItem(FAV + id, STAR); else to?.removeItem(FAV + id); } catch { /* private mode */ }
}
/** The id of the group of starred games above the sections. */
export const FAVOURITES = "favourites";
/** The games as the screen lists them, in groups: Favourites first (every starred game, in the order the games have on the
 *  screen: the sections in order, each in its own order), then each section without its starred games, which show once, in
 *  Favourites. A section with nothing left stays in the list, empty (the screen hides it); Favourites is left out while
 *  nothing is starred. A game's own section (`sec`) is still the one a filter by section means. */
export function listing(apps, sections, favs) {
  const home = sections.map(([id, title]) => ({ id, title, apps: apps.filter(a => a.sec === id) }));
  const starred = home.flatMap(s => s.apps.filter(a => favs.has(a.id)));
  const rest = home.map(s => ({ ...s, apps: s.apps.filter(a => !favs.has(a.id)) }));
  return starred.length ? [{ id: FAVOURITES, title: "Favourites", apps: starred }, ...rest] : rest;
}

// ---------- players ----------
/** Who can play a game, [fewest, most]: 1 is one person alone (against the computer, or a solo puzzle). Taken from what the game
 *  offers (party-core.js's `min` and `max`, the seats a table has with the computer filling the rest, a duo match's two);
 *  tests/games-find.mjs holds every entry to it. */
export const PLAYERS = [["", "Any players"], ["1", "Solo"], ["2", "2 players"], ["3-4", "3 to 4 players"], ["5+", "5 or more"]];
const SPANS = { "1": [1, 1], "2": [2, 2], "3-4": [3, 4], "5+": [5, Infinity] };
/** Whether a game that takes `players` can be played by that many ("" is any). */
export const takes = (players, count) => !count || (!!players && players[0] <= SPANS[count][1] && players[1] >= SPANS[count][0]);

// ---------- search ----------
/** Words other than a game's name that a person might type for it: its genre, the game it is a version of, its old name. A
 *  game's id (Slate's glyph, Almanac's lexicon) and its section's name are searched too, without being listed. */
export const AKA = {
  crates: "connections categories groups", punt: "trivia quiz venture purse commit", quote: "estimate range market bid ask",
  origin: "countries geography clues", order: "timeline sort dates", chart: "map atlas geography pin places",
  nexus: "links graph connections", crossword: "clues grid", lode: "strands word search", isomer: "jumble anagram scramble",
  acrostic: "hidden text clues", nonogram: "picross griddlers pixel picture loom weave weaving cloth thread", lexicon: "lookup reference encyclopedia knowledge base",
  ledger: "record progress statistics learning", calibre: "watchmaking watch horology movement",
  parley: "languages chinese french german spanish estonian vocabulary", glyph: "crossword letters words", delta: "hex sums arithmetic paths",
  spot: "mental maths arithmetic sums", speedmaths: "mental arithmetic sums quick", manifest: "memory packages quay",
  harbour: "ships program hex route", pipes: "pipe dream plumbing watch clockwork mainspring cogs", survey: "ore mining 3d deduction rock",
  stow: "packing cargo hold fit", loose: "block blast block puzzle blocks line clear tetris hexa", cartel: "dice bluff coup roles liar", hong: "mahjong mah jong majiang hong kong puzzle rush", tribute: "guan dan climbing cards partners puzzle rush",
  mines: "minesweeper", bulls: "bulls bulls and cows mastermind code breaking cows", assay: "word guess weigh alphabet balance", yield: "yield fathom words letters tray lead sounding depth sea",
  ladder: "doublets word ladder", calcudoku: "kenken", kakuro: "cross sums", bridges: "hashiwokakero", slitherlink: "portolan chart coast loop slitherlink circuit", sudoku: "number place digits nonet killer sudoku jigsaw sudoku diagonal sudoku x sudoku", hitori: "shade repeats numbers", masyu: "pearls loop", nurikabe: "dujiang canal irrigation nurikabe atoll islands sea", moor: "tents trees camping tents and trees docks barges boats harbour",
  party: "lobby room friends evening", undercover: "spy social deduction", whoami: "guess identity forehead", gauge: "estimate dial",
  fuse: "bomb", shoe: "playing cards deck deal shuffle hands", sketch: "drawing pictionary", whispers: "telephone chinese whispers",
  forger: "forgery drawing bluff", gallery: "art drawing", hilo: "higher lower cards", coup: "bluff secret roles influence", pewter: "skull bluff bid coins discs tavern", beacon: "codenames word association spies spymaster teams clue",
  cue: "charades word forehead acting", river: "xiangqi chinese chess puzzle rush", gambit: "chess school lessons course learn to play beginner openings tactics checkmate endgame puzzle rush", boast: "liar's dice perudo chinese dice bluff", carrack: "hanse portuguese venice ottoman ming china trade spice route silk pepper war game strategy exploration ships fleets", yacht: "five dice score sheet generala poker dice roll hold straight full house",
  bigtwo: "deuces climbing cards", hearts: "black lady queen of spades shoot the moon tricks", landlord: "dou dizhu fight the landlord", banquet: "finger game huaquan morra puzzle rush", gammon: "backgammon puzzle rush",
  jass: "schieber chibre swiss cards tricks trumps weis obenabe undenufe", belote: "coinche french cards tricks trumps", schafkopf: "bavarian cards tricks sauspiel wenz solo puzzle rush", contract: "bridge contract bridge auction", quest: "hidden roles traitors company hanse vitalian",
  bones: "dominoes tiles puzzle rush", factor: "factor island trading settlement", rack: "word tiles board", pegs: "cribbage", meld: "gin rummy",
  go: "weiqi baduk", tarot: "french tarot", solitaire: "patience klondike freecell", silo: "connect four four in a row",
  flank: "reversi", morris: "nine mens morris mills merels", crown: "draughts checkers", ingot: "2048 sliding tiles",
  lanterns: "akari light up bulbs lights lamps", asterism: "star battle two not touch stars regions", heliograph: "mirror", shunt: "gears hex shove jam train mesh", polder: "dyke windmill", topple: "dominoes hex", orrery: "match three planets",
  netting: "obligations trading houses", settle: "tank farm parcels", slipway: "carving ship",
  constitutions: "constitutions and institutions course political theory constitution constitutional law government separation of powers federalism judicial review amendment parliament presidential eu directive regulation legislative procedure congress cloture rulemaking veto",
  statecraft: "statecraft and strategy course diplomacy war deterrence clausewitz sun tzu machiavelli thucydides sanctions tribute neutrality empire revolution case studies",
  trade: "history of trade course silk road slave trade colonial colonialism geography commodities chokepoint chokepoints straits spices monsoon indian ocean atlantic opium east india company hanse cowries map",
  firmament: "astronomy history of the universe big bang cosmos stars planets galileo kepler newton einstein hubble copernicus telescope eclipse course",
  maths: "maths mathematics course gcse ib calculus algebra trigonometry geometry statistics probability vectors matrices differential equations proof", wine: "wine course grapes vintage sommelier champagne bordeaux burgundy rioja barolo tasting cellar", reckoning: "runner quay", landfall: "celestial navigation sextant astrolabe stars constellations night sky pole star polaris orion sirius sailing voyage latitude longitude chronometer compass noon sun notebook mercator tide", arthistory: "art history course painting sculpture architecture renaissance baroque impressionism cubism museum gallery", music: "music course theory ear training notes scales chords rhythm piano keyboard", blend: "blender gasoline fuel specification", refinery: "refining crude distillation",
  speedfuels: "fuel pricing mental maths", baccarat: "casino punto banco", blackjack: "casino twenty-one pontoon",
  roulette: "casino wheel", sicbo: "casino dice", craps: "casino dice", holdem: "poker casino texas",
  guilloche: "engine turning watch dial", timegrapher: "watch rate microphone",
};
/** Lower case, no accents or punctuation, an apostrophe dropped (Hold'em is holdem): what a name and a search are compared as. */
export const fold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "")
  .replace(/[^a-z0-9+]+/g, " ").trim();
const wordsOf = (...texts) => fold(texts.join(" ")).split(" ").filter(Boolean);

/** What a search is matched against, folded once: { words, name } (a name is also matched inside: "word" finds Crossword). */
export function searchable(app, sections) {
  const title = (sections.find(([id]) => id === app.sec) || [])[1] || "";
  return { words: wordsOf(app.name, app.id, AKA[app.id] || "", title), name: fold(`${app.name} ${app.id}`) };
}
/** Whether a game answers the search: every word typed is the start of one of its words (a name's, its id's, its genre's, its
 *  section's), or, from three letters, somewhere in its name. An empty search is every game. */
export function answers(found, query) {
  const tokens = fold(query).split(" ").filter(Boolean);
  return tokens.every(t => found.words.some(w => w.startsWith(t)) || (t.length >= 3 && found.name.includes(t)));
}
/** Whether a game is shown under the search, the section chosen ("" is all) and the players chosen ("" is any). */
export const shows = (app, found, { query = "", section = "", count = "" } = {}) =>
  (!section || app.sec === section) && takes(app.players, count) && answers(found, query);
/** The words for a filter that leaves nothing, plainly. */
export function nothing({ query = "", section = "", count = "" }, sections) {
  const where = section ? (sections.find(([id]) => id === section) || [])[1] : "";
  const who = count ? (PLAYERS.find(([v]) => v === count) || [])[1] : "";
  const parts = [query.trim() ? `“${query.trim()}”` : "", where ? `in ${where}` : "", who ? `for ${who.toLowerCase()}` : ""].filter(Boolean);
  return parts.length ? `No game matches ${parts.join(" ")}.` : "No games.";
}

// ---------- the pull ----------
/** What a drag or a wheel says to the search bar: "pull" (the list dragged down from its very top: show it) or "push" (the
 *  list moving up, scrolled down: put it away), else null. Every event brings the list's scrollTop as it is then.
 *  - A pull counts only if the list was at the very top when it began and stayed there: a drag that began lower and
 *    reached the top, or one that scrolled down a little and came back, is only a scroll.
 *  - A wheel gesture is the events within `quiet` ms of each other (a trackpad's flick and the momentum after it are one),
 *    and one gesture says one thing. On an iPhone the list bounces past its top, so scrollTop can be negative and no scroll
 *    event says "pulled"; the touch events do. */
export function pulls({ slop = 12, wheelSlop = 8, quiet = 150 } = {}) {
  let touch = null, wheel = null;
  return {
    touchStart(y, top) { touch = { y, atTop: top <= 0, done: false }; },
    touchMove(y, top) {
      if (!touch || touch.done) return null;
      if (top > 0) touch.atTop = false;
      const moved = y - touch.y;
      if (moved > slop && touch.atTop) { touch.done = true; return "pull"; }
      if (moved < -slop) { touch.done = true; return "push"; }
      return null;
    },
    touchEnd() { touch = null; },
    /** `dy` in pixels (a notched wheel's lines already multiplied), `at` the event's time in ms. */
    wheel(dy, top, at) {
      if (!wheel || at - wheel.at > quiet) wheel = { atTop: top <= 0, sum: 0, done: false, at };
      wheel.at = at;
      if (top > 0) wheel.atTop = false;
      if (wheel.done) return null;
      wheel.sum += dy;
      if (wheel.sum < -wheelSlop && wheel.atTop) { wheel.done = true; return "pull"; }
      if (wheel.sum > wheelSlop) { wheel.done = true; return "push"; }
      return null;
    },
  };
}
