// Which subjects are on, kept in one place for every knowledge game (topics.js: SUBJECTS; README, The knowledge base).
// `topics:on` is { subject: 0 | 1 }; a missing one is on, so a subject added later starts on, and nothing kept means all on.
// It syncs with the solo code like every other key. A game reads it when it deals (never once at start-up), so a change in
// Settings reaches the next board, set or run, and a run already dealt keeps what it was dealt.
import { cleanSubjects, dealable } from "./topics.js";

export const TOPICS_KEY = "topics:on";
/** The subjects as they stand: each 0 or 1. */
export function subjectsOn() {
  try { return cleanSubjects(JSON.parse(localStorage.getItem(TOPICS_KEY) || "null")); } catch { return cleanSubjects(null); }
}
/** Keeps the subjects (all on is kept as nothing, so a device that never chose anything has nothing to sync). */
export function setSubjects(on) {
  const clean = cleanSubjects(on);
  try {
    if (Object.values(clean).every(v => v === 1)) localStorage.removeItem(TOPICS_KEY); else localStorage.setItem(TOPICS_KEY, JSON.stringify(clean));
  } catch { /* private mode */ }
  try { dispatchEvent(new CustomEvent("topics:changed", { detail: clean })); } catch { /* not in a page */ }
  return clean;
}

/** Content marked for removal (specialist and personal material; topics.js `dealable`): "exclude" (the default) or "include".
 *  Kept like the subjects and synced with the solo code; a game reads it when it deals, and a daily never does (it is dealt as
 *  Exclude, so it is the same for everyone). */
export const MARKED_KEY = "topics:marked";
let memory = null;   // where there is no localStorage (the tests)
export function markedIn() {
  if (memory !== null) return memory;
  if (typeof localStorage === "undefined") return false;   // (a thrown ReferenceError, caught, is slow in a loop)
  try { return localStorage.getItem(MARKED_KEY) === "include"; } catch { return false; }
}
export function setMarkedIn(on) {
  memory = typeof localStorage === "undefined" ? !!on : null;
  try { if (on) localStorage.setItem(MARKED_KEY, "include"); else localStorage.removeItem(MARKED_KEY); } catch { /* private mode */ }
  try { dispatchEvent(new CustomEvent("topics:changed", { detail: { marked: !!on } })); } catch { /* not in a page */ }
  return !!on;
}
/** The pool for a deal: `list` without what is marked for removal, unless Settings includes it. A daily passes `daily = true`. */
export const dealt = (list, daily = false) => dealable(list, !daily && markedIn());
/** Whether an item's mark lets it be dealt now: kept, or marked and Settings includes it (never in a daily; never the living). */
export const allowed = (mk, daily = false) => !mk || (!daily && markedIn() && mk !== "l");
