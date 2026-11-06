// What the menu says of today's daily (menu.js `todayPart`), as plain data so it can be tested in Node. Korbi, 4 November 2026:
// "daily shouldn't be served to the user in settings -> content 'random/levels/today's'. There should be a button 'do today's',
// if today's is available". Today's is a button while it's still to play, a line once it's done, and a line (with a way back to
// the run left) while it's being played; never a mode to choose.

/** A mark from the games screen's tile (`markOf`, suite.js) → whether today's is done, for the kinds that are today's alone. */
export const markDone = m => !!m && (m.kind === "daily" ? m.today != null : m.kind === "time" || m.kind === "guesses");
/** The same mark's result in words: a time as 12:34, a score with its thousands; "" where it has none. */
export function markResult(m) {
  const v = m ? (m.kind === "daily" ? m.today : m.kind === "time" ? m.v : null) : null;
  if (!Number.isFinite(v)) return "";
  return m.kind === "time" ? `${Math.floor(v / 60)}:${String(Math.round(v) % 60).padStart(2, "0")}` : v.toLocaleString("en-GB");
}
/**
 * The state of today's part: { kind: "play", button } (still to play), { kind: "playing", line, back } (on the board now;
 * back: { text, fn } to the run left, or null) or { kind: "done", line }. done and result are the game's own record, or, with
 * `mark`, read from the tile's.
 */
export function todayState({ done, result, playing = false, back = null, mark = null }) {
  if (done === undefined) done = markDone(mark);
  if (result === undefined) result = markResult(mark);
  if (done) return { kind: "done", line: `Today's: done${result ? ` · ${result}` : ""}` };
  if (playing) return { kind: "playing", line: "Today's: playing", back: back ? { text: "Back to your run", ...(typeof back === "function" ? { fn: back } : back) } : null };
  return { kind: "play", button: "Play today's" };
}
