// The puzzle rush's choices, the same controls in every game (rush-core.js has the rules of it): the clock (3 min, 5 min,
// Survival) and, where a game has them, its own kinds of run, on a menu or on the rush's own sheet; and, where the rush
// takes the game's place on the page (Chess's, River's, Hong's, Tribute's), its whole menu. Today's run is a button
// (`todayPart`, menu.js), not a kind to pick: it has a run for each clock.
import { part, choice, action, line, todayPart } from "./menu.js";
import { sure } from "./sure.js";
import { MODES, modeOf, bestLines, dayKey } from "./rush-core.js";

/** The run to start: Random, or a game's own kinds (own: [[id, name]…]); taps change pick.kind. Null with no kinds of its own. */
export const runChoice = (pick, own = [], onChange = () => {}) =>
  own.length ? choice("Run", [["random", "Random"], ...own], pick.kind, v => { pick.kind = v; onChange(); }) : null;
/** The clock: 3 min, 5 min or Survival; taps change pick.mode. */
export const modeChoice = (pick, onChange = () => {}) =>
  choice("Mode", Object.entries(MODES).map(([id, m]) => [id, m.label]), modeOf(pick.mode), v => { pick.mode = v; onChange(); });
/** Your rating in words: "Rating 1,240 over 56 puzzles", "(still settling)" for the first twenty. */
export const ratingText = ({ r, n }) => `Rating ${Math.round(r).toLocaleString("en-GB")} over ${n} puzzle${n === 1 ? "" : "s"}${n < 20 ? " (still settling)" : ""}`;

/**
 * The rush's menu while it holds the page. pick: { kind, mode }, what Start a run starts (the choices change it);
 * start(); results(), the last run's, once it's over (else null); back(), to the game (backText, its words); own: a
 * game's own kinds of run; rating ({ r, n }) and resetRating() where the rush keeps one; bests and daily as the game
 * keeps them, day today's; ownNote: a line under the choices about the game's own kinds; inFrame: a partner watching,
 * with nothing to press; todayOn: today's run is the one on the page. Today's run of the clock chosen is a button until
 * it's done; Start a run is always the other kind (a "daily" kept from the last run is read as Random).
 */
export function rushMenu(body, { pick, start, results = null, back, backText = "Back to the game", own = [], ownNote = "", rating = null, resetRating = null,
  bests = {}, daily = {}, day, inFrame = false, todayOn = false }) {
  if (pick.kind === "daily") pick.kind = "random";
  let today = [];
  const drawToday = () => {
    for (const n of today) n.remove();
    const got = daily[dayKey(day, pick.mode)];
    if (!inFrame) today = todayPart(body, { done: got != null, result: got != null ? String(got) : "", play: () => { pick.kind = "daily"; start(); }, playing: todayOn });
  };
  if (!inFrame) part(body, "play").append(action("Start a run", start, "primary"), ...(results ? [action("The run's results", results, "link")] : []), action(backText, back, "link"));
  part(body, "content").append(...[runChoice(pick, own), modeChoice(pick, drawToday)].filter(Boolean), ...(ownNote ? [line(ownNote)] : []));
  drawToday();
  if (rating && resetRating && !inFrame) part(body, "settings").append(action("Reset my rating", async () => { if (await sure("Reset your puzzle rating to 1,000?", { yes: "Reset" })) resetRating(); }, "link"));
  part(body, "about").append(...(rating ? [line(ratingText(rating))] : []), ...bestLines(bests, daily, day, Object.fromEntries(own)).map(t => line(t)));
}
