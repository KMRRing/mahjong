// The suite's day, and the records some games once kept by a day of their own.
// Every daily (Crates' board, Slate's and Delta's puzzle, Punt's, Quote's, Chart's, Origin's and Order's run) is
// seeded and kept by the same day: the UTC date, so it's the same set wherever you are, rolling over at the same moment
// for everyone, and the games screen finds it. Origin and Order once counted days on the phone's own clock (days
// since 1970 by its calendar: 20734 for 8 October 2026), so the games screen never found theirs; what they kept moves
// to dates, once (suite.js). Pure functions, tested by tests/days.mjs.

/** The day, the same for everyone: the UTC date as YYYYMMDD. */
export const today = (now = new Date()) => now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();

/** A day once counted on a phone's own clock (days since 1970 by its calendar), as the date it was there. */
export const fromPhoneDay = n => today(new Date(n * 864e5));

/** A day kept as a key ("20261008", or "20261008/dates" where a game keeps one a mode): true if it's a phone's day. */
const phoneDay = key => { const n = Number(key.split("/")[0]); return n > 0 && n < 1e6; };

/**
 * Records kept by day (YYYYMMDD, or YYYYMMDD/mode) with any phone days moved to their dates; where a moved day meets
 * one already there, the higher figure stays. null when there's nothing to move.
 */
export function movedToDates(days) {
  if (!days || typeof days !== "object" || !Object.keys(days).some(phoneDay)) return null;
  const out = {};
  for (const [key, v] of Object.entries(days)) {
    const [day, mode] = key.split("/");
    const to = phoneDay(key) ? `${fromPhoneDay(Number(day))}${mode ? `/${mode}` : ""}` : key;
    if (!(out[to] >= v)) out[to] = v;
  }
  return out;
}

/** The best figure kept for a day: its own, or the best of its modes (Order keeps one a mode). null if none. */
export function bestOfDay(days, day) {
  const xs = Object.entries(days || {}).filter(([k]) => k.split("/")[0] === String(day)).map(([, v]) => v).filter(Number.isFinite);
  return xs.length ? Math.max(...xs) : null;
}
