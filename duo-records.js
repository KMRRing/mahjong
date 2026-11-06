// The pair's duo records, from every finished match each of them reported (duo/GAME/MATCH/PLAYER in the pair's room:
// suite.js writes and watches them), and the words a tile on the games screen shows for one. Pure, so
// tests/duo-records.mjs can check them without a database.

/**
 * { game: { n, teams, best, lower, wins, duels, mine, theirs } } as player `me` sees them. Team matches give the best
 * team result and how many were won; head-to-heads the wins on each side (a draw counts for neither). A game played
 * both ways (Punt, Spot, Manifest: a pot each or one for the team) has both.
 */
export function duoRecordsOf(all, me) {
  const out = {};
  for (const [game, matches] of Object.entries(all || {})) {
    const r = out[game] = { n: 0, teams: 0, best: null, lower: false, wins: 0, duels: 0, mine: 0, theirs: 0 };
    for (const sides of Object.values(matches || {})) {
      const entries = Object.entries(sides || {});
      if (!entries.length) continue;
      r.n++;
      if (entries[0][1]?.coop) {
        r.teams++;
        r.lower ||= !!entries[0][1].lower;                   // a game's team matches all score the same way
        if (entries.some(([, x]) => x?.won)) r.wins++;
        for (const [, x] of entries) if (x?.score != null && (r.best == null || (r.lower ? x.score < r.best : x.score > r.best))) r.best = x.score;
      } else {
        r.duels++;
        if (entries.some(([id, x]) => id === me && x?.won)) r.mine++;
        if (entries.some(([id, x]) => id !== me && x?.won)) r.theirs++;
      }
    }
  }
  return out;
}

/**
 * A record as its tile says it: the team's best ("Duo 1,240", a time, or boards cleared of those played, "Duo 5/7"),
 * the wins each way ("Duo 2–1", yours first), or both for a game played both ways ("Duo 2–1 · team 1,240"); "" before
 * the first match. format(best) writes a team result in the game's own way.
 */
export function duoLine(r, format = n => String(n)) {
  if (!r?.n) return "";
  const team = r.teams ? (r.best == null ? `${r.wins}/${r.teams}` : format(r.best, r.lower)) : null;
  const vs = r.duels ? `${r.mine}–${r.theirs}` : null;
  return `Duo ${vs && team ? `${vs} · team ${team}` : vs ?? team}`;
}
