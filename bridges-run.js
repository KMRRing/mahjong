// What a Bridges puzzle in play is, as data and with no page: the check a saved run must pass, and the part of a run that
// never changes (the puzzle). The page, the race (bridges-race.js) and the shared board (bridges-coop.js) all go by this
// one definition, so a run, a match and a board agree on what a puzzle is.
import { SIZES } from "./bridges-engine.js";
import { gapsOf } from "./bridges-lattice.js";
import { COUNT } from "./bridges-levels.js";

export const HINT = 30;                     // seconds a hint adds to the score, solo, in a race and together

/**
 * A saved run that is a puzzle in play: the shapes of its strings agree with the board's size and its answer. Reefs and
 * fairways (taken out on 3 November 2026) make a run no longer one.
 */
export const playable = s => !!s && s.v === 1 && SIZES.includes(s.size) && typeof s.grid === "string" && typeof s.marks === "string"
  && typeof s.sol === "string" && s.sol.length === s.marks.length && s.grid.length === s.size * s.size && Number.isFinite(s.ms)
  && (s.kinds == null || (typeof s.kinds === "string" && s.kinds.length === s.grid.length)) && (s.realms == null || (typeof s.realms === "string" && s.realms.length === s.grid.length))
  && (s.hills == null || (typeof s.hills === "string" && s.hills.length === s.grid.length)) && (s.roads == null || (typeof s.roads === "string" && s.roads.length === s.sol.length))
  && (s.straits == null || (typeof s.straits === "string" && s.straits.length === gapsOf(s.size, s.shape === "hex")))
  && (s.shape == null || s.shape === "hex")
  && !s.grid.includes("#") && s.lanes == null && /^[0-9a-c.]+$/.test(s.grid)
  && (s.mode !== "level" || (Number.isInteger(s.lv) && s.lv >= 0 && s.lv < COUNT));

/** The puzzle of a run, the part that does not change: what a match and a shared board carry. */
export const fixedOf = s => {
  const f = { mode: s.mode || "random", seed: s.seed, size: s.size, level: s.level, twist: s.twist || "none", came: s.came || s.level, grid: s.grid, sol: s.sol };
  for (const k of ["lv", "kinds", "realms", "hills", "roads", "straits", "shape"]) if (s[k] != null && s[k] !== "") f[k] = s[k];
  return f;
};

/** A fixed puzzle as a run with no bridges laid: the shape `playable` asks for. */
export const blankRun = f => ({ v: 1, ms: 0, hints: 0, ...f, marks: "0".repeat(f.sol.length) });

/** A run from the engine's puzzle for a kind ({ size, level, twist }): no bridges laid yet. `extra` adds fields (a level's number). */
export const fromPuzzle = (mode, seed, k, puzzle, extra = {}) => ({
  mode, seed, size: k.size, level: k.level, twist: puzzle.twist || "none", came: puzzle.level, grid: puzzle.grid, sol: puzzle.sol,
  ...(puzzle.kinds ? { kinds: puzzle.kinds } : {}), ...(puzzle.realms ? { realms: puzzle.realms } : {}),
  ...(puzzle.hills ? { hills: puzzle.hills } : {}), ...(puzzle.roads ? { roads: puzzle.roads } : {}), ...(puzzle.straits ? { straits: puzzle.straits } : {}), ...(puzzle.shape ? { shape: puzzle.shape } : {}), marks: "0".repeat(puzzle.sol.length), ...extra,
});

/** The score of a solve: seconds on the clock and a penalty for each hint; lower is better, in every way of playing. */
export const scoreOf = (ms, hints = 0) => Math.round(ms / 1000) + HINT * hints;
