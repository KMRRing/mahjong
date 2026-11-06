// Bridges' levels, pure (no page): a ladder of puzzles in chapters, each chapter bringing something to the one before: the
// plain game on charts from 7×7 to 11×11; ranges, numbers that are only a bound ("4+", "≤3"); two realms, two colours of
// island each with a network of its own; the admiralty's charts, where they meet; viaducts, hills whose bridges go over
// the lowland's; narrow roads that hold one bridge and wide roads that hold three; straits, lines across the sea with the
// bridges that cross them counted; no loops; and the grand charts where they meet. A level is a kind of puzzle (a size, a
// difficulty, a twist), not one puzzle: the first time it is the same puzzle for everyone (the level's own seed), and a new
// puzzle of the level is another from the same recipe, so a level can be replayed for its stars. Stars are for the score as
// everywhere in Bridges (seconds plus 30 a hint, lower is better): one for solving it, two for a score within twice the par,
// three within the par, which is a few seconds an island and grows with how hard the puzzle is. Solving a level opens the next;
// any level open can be played at any time.
//
// The ladder was reordered on 3 November 2026, when reefs and fairways were taken out: `was` is the number a level had before
// (a level new then has none), and `migrate` carries the stars and the puzzles left half done from the old numbers to the new.
import { generate } from "./bridges-engine.js";

const level = spec => ({ twist: "none", ...spec });
/** A level on the hex board (5 November 2026). */
const hex = spec => level({ ...spec, shape: "hex" });
/** The chapters: where each begins in LEVELS, its name and what it brings. */
export const CHAPTERS = [
  { name: "Harbour charts", from: 0, about: "Bridges as it always was: every island with as many bridges as its number, all of them one network, no bridge crossing another." },
  { name: "Ranges", from: 6, about: "Some numbers are only a bound: 4+ is at least four bridges, ≤3 at most three." },
  { name: "Two realms", from: 11, about: "Two colours of island. A bridge joins two of one colour, an island of the other colour in the way stops a link, and each colour is a network of its own." },
  { name: "The admiralty", from: 16, about: "The twists together." },
  { name: "Viaducts", from: 19, about: "Some islands are hills, ringed like a map's contour lines. A bridge between two hills is a viaduct, and goes over any low bridge it meets. Two viaducts, or two low bridges, still can't cross." },
  { name: "Narrow roads", from: 24, about: "Some roads are narrow: they hold one bridge, not two. A narrow road is pinched in the middle." },
  { name: "Wide roads", from: 29, about: "Some roads are wide: they hold up to three bridges. A wide road is drawn with three lanes." },
  { name: "Straits", from: 34, about: "A line across the sea with a number on its end: exactly that many bridges cross it, a double bridge counting twice." },
  { name: "No loops", from: 39, about: "The bridges may never close a ring: from an island you can't walk round and come back to it without turning back. A double bridge is not a ring." },
  { name: "The grand charts", from: 44, about: "The twists together, as many as one chart will hold." },
  // 5 November 2026 (Korbi: "implement them all including hex view. Agree with the chapters and mixed gauntlet levels"): the hex board, one twist at a time, then the gauntlets
  { name: "The hexagon", from: 50, about: "A new board: the islands stand on a triangular lattice, so a bridge runs along three lines through an island (a row and two slants), an island has up to six neighbours, and a number can reach 12." },
  { name: "Hex ranges", from: 56, about: "Bounds on the hexagon: 4+ is at least four bridges, ≤3 at most three." },
  { name: "Hex realms", from: 61, about: "Two colours of island on the hexagon: a bridge joins one colour, and each colour is a network of its own." },
  { name: "Hex viaducts", from: 66, about: "Hills on the hexagon: a viaduct between two hills goes over the low bridges, along any of the three lines." },
  { name: "Hex narrow roads", from: 71, about: "Roads that hold one bridge, on the hexagon." },
  { name: "Hex wide roads", from: 76, about: "Roads that hold up to three bridges, on the hexagon." },
  { name: "Hex straits", from: 81, about: "A line across the sea counts the bridges that cross it; on the hexagon it can run along any of the three directions." },
  { name: "Hex no loops", from: 86, about: "No ring of bridges, on the hexagon: its triangles are rings of three, so the rule bites everywhere." },
  { name: "Gauntlet: the square charts", from: 91, about: "Mixed gauntlet: twists that have not met yet, two and more at a time, on the square board." },
  { name: "Gauntlet: the hexagon", from: 102, about: "Mixed gauntlet on the hexagon: the twists together, up to all five roads, bounds, hills and colours at once." },
];
export const LEVELS = [
  level({ name: "First light", size: 7, level: "easy", was: 0 }),
  level({ name: "Two shores", size: 7, level: "medium", was: 1 }),
  level({ name: "Open water", size: 9, level: "easy", was: 2 }),
  level({ name: "The channel", size: 9, level: "medium", was: 3 }),
  level({ name: "The long haul", size: 11, level: "easy", was: 4 }),
  level({ name: "Deep soundings", size: 9, level: "hard", was: 5 }),

  level({ name: "Rough numbers", size: 7, level: "easy", twist: "ranges", was: 11 }),
  level({ name: "Soundings", size: 9, level: "easy", twist: "ranges", was: 12 }),
  level({ name: "Fog signals", size: 9, level: "medium", twist: "ranges", was: 13 }),
  level({ name: "Tide tables", size: 11, level: "medium", twist: "ranges", was: 14 }),
  level({ name: "The ledger", size: 11, level: "hard", twist: "ranges", was: 15 }),

  level({ name: "Two flags", size: 7, level: "easy", twist: "realms", was: 16 }),
  level({ name: "Rival ports", size: 9, level: "easy", twist: "realms", was: 17 }),
  level({ name: "Border waters", size: 9, level: "medium", twist: "realms", was: 18 }),
  level({ name: "Two crowns", size: 11, level: "medium", twist: "realms", was: 19 }),
  level({ name: "The partition", size: 11, level: "hard", twist: "realms", was: 20 }),

  level({ name: "Ledger and flag", size: 9, level: "medium", twist: "ranges+realms" }),
  level({ name: "Rival ledgers", size: 11, level: "medium", twist: "ranges+realms", was: 23 }),
  level({ name: "Admiralty chart", size: 11, level: "hard", twist: "ranges+realms", was: 24 }),

  level({ name: "First arch", size: 7, level: "easy", twist: "hills", was: 25 }),
  level({ name: "The causeway", size: 9, level: "easy", twist: "hills", was: 26 }),
  level({ name: "Pier and pillar", size: 9, level: "medium", twist: "hills", was: 27 }),
  level({ name: "High road", size: 11, level: "medium", twist: "hills", was: 28 }),
  level({ name: "The great span", size: 11, level: "hard", twist: "hills", was: 29 }),

  level({ name: "Single file", size: 7, level: "easy", twist: "narrow" }),
  level({ name: "Toll gate", size: 9, level: "easy", twist: "narrow" }),
  level({ name: "Cart tracks", size: 9, level: "medium", twist: "narrow" }),
  level({ name: "Hairpin", size: 11, level: "medium", twist: "narrow" }),
  level({ name: "The bottleneck", size: 11, level: "hard", twist: "narrow" }),

  level({ name: "Broad way", size: 7, level: "easy", twist: "wide" }),
  level({ name: "High street", size: 9, level: "easy", twist: "wide" }),
  level({ name: "Triple span", size: 9, level: "medium", twist: "wide" }),
  level({ name: "Three abreast", size: 11, level: "medium", twist: "wide" }),
  level({ name: "The great road", size: 11, level: "hard", twist: "wide" }),

  level({ name: "Harbour mouth", size: 7, level: "easy", twist: "straits" }),
  level({ name: "Ferry line", size: 9, level: "easy", twist: "straits" }),
  level({ name: "Tide gauge", size: 9, level: "medium", twist: "straits" }),
  level({ name: "The long strait", size: 11, level: "medium", twist: "straits" }),
  level({ name: "Channel count", size: 11, level: "hard", twist: "straits" }),

  level({ name: "Straight roads", size: 7, level: "easy", twist: "tree" }),
  level({ name: "No way back", size: 9, level: "easy", twist: "tree" }),
  level({ name: "Treeline", size: 9, level: "medium", twist: "tree" }),
  level({ name: "Root and branch", size: 11, level: "medium", twist: "tree" }),
  level({ name: "The great tree", size: 11, level: "hard", twist: "tree" }),

  level({ name: "Narrow and broad", size: 9, level: "medium", twist: "narrow+wide" }),
  level({ name: "Toll viaduct", size: 9, level: "medium", twist: "hills+narrow" }),
  level({ name: "Counted ledgers", size: 9, level: "medium", twist: "ranges+straits" }),
  level({ name: "Rival rings", size: 11, level: "medium", twist: "realms+tree" }),
  level({ name: "Great span road", size: 11, level: "medium", twist: "hills+wide" }),
  level({ name: "Grand chart", size: 11, level: "hard", twist: "ranges+realms+hills+narrow+wide" }),

  // the hexagon (a level's id is its place here: new chapters go at the end, nothing above moves)
  hex({ name: "Honeycomb", size: 7, level: "easy" }),
  hex({ name: "Six ways", size: 7, level: "medium" }),
  hex({ name: "Beehive", size: 9, level: "easy" }),
  hex({ name: "Cell and comb", size: 9, level: "medium" }),
  hex({ name: "The wide hive", size: 11, level: "medium" }),
  hex({ name: "Deep honey", size: 11, level: "hard" }),

  hex({ name: "Loose cells", size: 7, level: "easy", twist: "ranges" }),
  hex({ name: "Bounded comb", size: 9, level: "easy", twist: "ranges" }),
  hex({ name: "Hive ledger", size: 9, level: "medium", twist: "ranges" }),
  hex({ name: "Swarm count", size: 11, level: "medium", twist: "ranges" }),
  hex({ name: "The queen's bound", size: 11, level: "hard", twist: "ranges" }),

  hex({ name: "Two hives", size: 7, level: "easy", twist: "realms" }),
  hex({ name: "Rival combs", size: 9, level: "easy", twist: "realms" }),
  hex({ name: "Border cells", size: 9, level: "medium", twist: "realms" }),
  hex({ name: "Twin crowns", size: 11, level: "medium", twist: "realms" }),
  hex({ name: "Hive and flag", size: 11, level: "hard", twist: "ranges+realms" }),

  hex({ name: "Hex arch", size: 7, level: "easy", twist: "hills" }),
  hex({ name: "Honey causeway", size: 9, level: "easy", twist: "hills" }),
  hex({ name: "Comb and pillar", size: 9, level: "medium", twist: "hills" }),
  hex({ name: "The high hive", size: 9, level: "hard", twist: "hills" }),
  hex({ name: "The great hex span", size: 11, level: "hard", twist: "realms+hills" }),

  hex({ name: "Single comb", size: 7, level: "easy", twist: "narrow" }),
  hex({ name: "Hex toll", size: 9, level: "easy", twist: "narrow" }),
  hex({ name: "Cart cells", size: 9, level: "medium", twist: "narrow" }),
  hex({ name: "Hex hairpin", size: 11, level: "medium", twist: "narrow" }),
  hex({ name: "Narrow arches", size: 11, level: "medium", twist: "hills+narrow" }),

  hex({ name: "Broad comb", size: 7, level: "easy", twist: "wide" }),
  hex({ name: "Slant street", size: 9, level: "easy", twist: "wide" }),
  hex({ name: "Triple cells", size: 9, level: "medium", twist: "wide" }),
  hex({ name: "The wide road", size: 11, level: "medium", twist: "wide" }),
  hex({ name: "Narrow and wide cells", size: 11, level: "medium", twist: "narrow+wide" }),

  hex({ name: "Hex harbour mouth", size: 7, level: "easy", twist: "straits" }),
  hex({ name: "Slant ferry", size: 9, level: "easy", twist: "straits" }),
  hex({ name: "Three tides", size: 9, level: "medium", twist: "straits" }),
  hex({ name: "The slant strait", size: 11, level: "medium", twist: "straits" }),
  hex({ name: "Counted combs", size: 11, level: "medium", twist: "ranges+straits" }),

  hex({ name: "Triangles", size: 7, level: "easy", twist: "tree" }),
  hex({ name: "No way round", size: 9, level: "easy", twist: "tree" }),
  hex({ name: "Hive treeline", size: 9, level: "medium", twist: "tree" }),
  hex({ name: "Hive roots", size: 11, level: "medium", twist: "tree" }),
  hex({ name: "Rival hex rings", size: 11, level: "medium", twist: "realms+tree" }),

  // the gauntlet on the square board: twists that have not met yet
  level({ name: "Contour ledger", size: 9, level: "medium", twist: "ranges+hills" }),
  level({ name: "Two peaks", size: 9, level: "medium", twist: "realms+hills" }),
  level({ name: "Bounded branches", size: 9, level: "medium", twist: "ranges+tree" }),
  level({ name: "Broad branches", size: 9, level: "medium", twist: "wide+tree" }),
  level({ name: "Tide and tree", size: 11, level: "medium", twist: "straits+tree" }),
  level({ name: "Peak soundings", size: 11, level: "medium", twist: "hills+straits" }),
  level({ name: "Rival tides", size: 11, level: "medium", twist: "realms+straits" }),
  level({ name: "Rival heights", size: 11, level: "medium", twist: "ranges+realms+hills+narrow" }),
  level({ name: "Toll counts", size: 11, level: "medium", twist: "wide+straits" }),
  level({ name: "Gauntlet's end", size: 11, level: "hard", twist: "ranges+hills+wide+straits" }),
  level({ name: "The great gauntlet", size: 11, level: "hard", twist: "realms+hills+wide+straits" }),

  // the gauntlet on the hexagon
  hex({ name: "Hex ledger and flag", size: 9, level: "medium", twist: "ranges+realms" }),
  hex({ name: "Hex toll strait", size: 9, level: "medium", twist: "narrow+straits" }),
  hex({ name: "Hex broad rivals", size: 9, level: "medium", twist: "realms+wide" }),
  hex({ name: "Hex tides", size: 11, level: "medium", twist: "hills+straits" }),
  hex({ name: "Hex counted tree", size: 11, level: "hard", twist: "ranges+straits+tree" }),
  hex({ name: "Hex rival heights", size: 11, level: "medium", twist: "ranges+realms+hills+narrow" }),
  hex({ name: "Hex grand chart", size: 11, level: "hard", twist: "ranges+realms+hills+narrow+wide" }),
];
export const COUNT = LEVELS.length;
/** The chapter a level is in. */
export const chapterOf = i => { let c = 0; CHAPTERS.forEach((ch, k) => { if (i >= ch.from) c = k; }); return c; };

/** A level's own seed: the puzzle everyone gets the first time. */
export const seedOf = i => 9001 + 7919 * i;
/** The puzzle of level i (0 on), from a seed (default: the level's own): the engine's { size, grid, sol, level, … }, null if none came. */
export function levelPuzzle(i, seed = seedOf(i)) {
  const L = LEVELS[i];
  return generate(seed, L.size, L.level, L.twist, L.shape);
}
/** The kind a level asks the generator for (a hex level says so). */
export const kindOf = i => ({ size: LEVELS[i].size, level: LEVELS[i].level, twist: LEVELS[i].twist, ...(LEVELS[i].shape ? { shape: LEVELS[i].shape } : {}) });

// ---------- the ladder before 3 November 2026 ----------
/** The number of levels there were before the ladder was reordered, and the version of the save that came with it. */
export const OLD_COUNT = 39;
export const LADDER_VERSION = 2;
/** Where each old level (by its old number) stands now, or -1 for one taken out (reefs and fairways). */
export const NOW = Array.from({ length: OLD_COUNT }, (_, old) => LEVELS.findIndex(L => L.was === old));
/**
 * The campaign and the puzzles left half done, from the old numbers to the new: `camp` is { at, stars } as the page kept it,
 * `runs` the saved puzzle of each level by its number (an object). A level taken out takes its stars and its puzzle with it.
 * Returns { camp, runs } with camp.v the version, or the same camp if it already is.
 */
export function migrate(camp, runs = {}) {
  if (camp?.v === LADDER_VERSION) return { camp, runs };
  const stars = LEVELS.map(L => (L.was != null && Number.isInteger(camp?.stars?.[L.was]) ? Math.max(0, Math.min(3, camp.stars[L.was])) : 0));
  // the level in hand is the same level; if it is gone, the first one not yet solved (the last one, if all are)
  const to = Number.isInteger(camp?.at) ? camp.at : 0, unsolved = stars.findIndex(s => s < 1), at = NOW[to] >= 0 ? NOW[to] : unsolved >= 0 ? unsolved : COUNT - 1;
  const moved = {};
  for (const [old, run] of Object.entries(runs || {})) { const n = NOW[+old]; if (n >= 0 && run && typeof run === "object") moved[n] = { ...run, lv: n }; }
  return { camp: { v: LADDER_VERSION, at, stars }, runs: moved };
}

// ---------- the stars ----------
/** Seconds an island is allowed for the par, and the room that grows with how hard the puzzle came out. A guess, to be set by play. */
export const PAR_PER_ISLAND = 4;
export const PAR_BASE = 8;
const HARDER = { easy: 1, medium: 1.35, hard: 1.7 };
const HEX_SLOWER = 1.3;            // an island on the hex board has up to six links to weigh: more to read for each number
const islandsOf = grid => { let n = 0; for (const ch of grid) if (ch !== ".") n++; return n; };
/** The par of a puzzle in seconds: a score at or under it is three stars, within twice it two. */
export const parOf = p => Math.round(PAR_BASE + PAR_PER_ISLAND * islandsOf(p.grid) * (HARDER[p.level] ?? 1) * (p.shape === "hex" ? HEX_SLOWER : 1));
/** Stars for a score on a puzzle: 1, 2 or 3. */
export function starsFor(p, score) {
  const par = parOf(p);
  return score <= par ? 3 : score <= 2 * par ? 2 : 1;
}
