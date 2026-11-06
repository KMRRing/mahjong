// The Ledger's record: how well what you learn stays learned, and how well your confidence matches your results.
// The pile reports every item that comes back (right or wrong, after how long), Punt every bet (the stake, the odds
// and whether it won), Quote every market (its grade, and whether the truth was inside it). Kept as weekly totals,
// so it stays a few kilobytes however much you play, and syncs like every key. The Ledger (ledger.html) reads it.

const KEY = "ledger:stats";
const DAY = 24 * 60 * 60 * 1000;
/** How long an item was away before it came back: the Ledger's columns for recall. */
export const GAPS = [
  { id: "hour", name: "Within the hour", max: 60 * 60 * 1000 },
  { id: "day", name: "Within two days", max: 2 * DAY },
  { id: "week", name: "After a week or two", max: 21 * DAY },
  { id: "month", name: "After a month", max: 70 * DAY },
  { id: "quarter", name: "After three months", max: Infinity },
];
/** Stake sizes, as Punt offers them (a share of the pot). */
export const STAKES = [0, 5, 10, 25, 50, 100];      // 0: a pass
export const GRADES = ["SS", "S", "A", "B", "C"];

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
const fresh = () => ({ since: Date.now(), recall: {}, stake: {}, size: {}, know: {}, market: {}, days: {} });
/** The record as kept: { since, recall: { week: { gap: [right, n] } }, stake: { week: { tenth: [won, n, brier] } }, size: { week: { pct: [won, n] } }, know: { week: { pct: [won, n, guesses, implied] } }, market: { week: { n, inside, grades } }, days: { YYYYMMDD: [items back, right] } (the last 120 days) } */
export function stats() { return read() || fresh(); }
/** Starts the record afresh (the piles stay as they are). */
export function reset() { write(fresh()); }

/** The ISO week a time falls in, as "2026-W41". */
export function weekOf(t = Date.now()) {
  const d = new Date(t), day = (d.getUTCDay() + 6) % 7;            // Monday 0
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
  const year = new Date(thursday).getUTCFullYear(), first = Date.UTC(year, 0, 4);
  const week = 1 + Math.round((thursday - first - 3 * DAY + ((new Date(first).getUTCDay() + 6) % 7) * DAY) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export const gapOf = ms => GAPS.find(g => ms < g.max).id;
/** Kelly's stake read backwards: staking a fraction f of the pot at decimal odds o, a Kelly bettor believes p = (1 + f(o − 1)) / o. */
export const kellyChance = (f, o) => (o > 1 ? Math.min(1, Math.max(0, (1 + f * (o - 1)) / o)) : 1);
export const stakeOf = pct => STAKES.find(s => pct <= s) ?? 100;
/** Knowledge, read two ways (the correction for guessing): a chance p on a question a pure guess gets right with chance g
 *  is knowing the answer with probability (p − g) / (1 − g), the rest guessed. What a stake implies: Kelly's chance,
 *  corrected so (a pass claims nothing; at a fair price, odds 1/g, it comes out at the stake itself). */
export const impliedKnowledge = (f, o, g) => (f > 0 && g < 1 ? Math.min(1, Math.max(0, (kellyChance(f, o) - g) / (1 - g))) : 0);
/** What results show: `won` of `n`, where pure guessing would have won `guesses` (the sum of their chances). Below 0 is
 *  worse than guessing: sure, and wrong. null with nothing to go on. */
export const actualKnowledge = (won, n, guesses) => (n - guesses > 1e-9 ? (won - guesses) / (n - guesses) : null);
const r4 = x => Math.round(x * 1e4) / 1e4;

function bump(path, add) {
  const s = stats(); let node = s;
  for (const k of path.slice(0, -1)) node = node[k] ??= {};
  const last = path[path.length - 1];
  node[last] = add(node[last]);
  write(s);
}
/** An item from the pile came back after `gap` ms and was answered right or not. */
export function noteRecall(gap, right) {
  bump(["recall", weekOf(), gapOf(Math.max(0, gap))], v => { const [r, n] = v || [0, 0]; return [r + (right ? 1 : 0), n + 1]; });
  // the days with a review, for the Ledger's streak: the pile keeps only an item's latest answer, so the days are noted here
  const s = stats(), d = new Date().toISOString().slice(0, 10).replace(/-/g, ""), days = (s.days ||= {}), [k, n] = days[d] || [0, 0];
  days[d] = [k + (right ? 1 : 0), n + 1];
  for (const old of Object.keys(days).sort().slice(0, -120)) delete days[old];
  write(s);
}
/** A Punt bet: a share `pct` (1–100) of the pot at decimal odds `odds`, won or lost, and (when Punt says) the chance a
 *  pure guess had, `guess`, for knowledge read two ways. */
export function noteStake(pct, odds, won, guess) {
  if (!(pct >= 0) || won == null) return;                     // a pass is a bet of 0%: it believed no more than the price
  const p = kellyChance(pct / 100, odds), tenth = Math.min(9, Math.floor(p * 10)), w = won ? 1 : 0;
  bump(["stake", weekOf(), tenth], v => { const [k, n, b] = v || [0, 0, 0]; return [k + w, n + 1, Math.round((b + (p - w) ** 2) * 1e4) / 1e4]; });
  bump(["size", weekOf(), stakeOf(pct)], v => { const [k, n] = v || [0, 0]; return [k + w, n + 1]; });
  if (Number.isFinite(guess) && guess >= 0 && guess < 1) bump(["know", weekOf(), stakeOf(pct)], v => {
    const [k, n, g, im] = v || [0, 0, 0, 0];
    return [k + w, n + 1, r4(g + guess), r4(im + impliedKnowledge(pct / 100, odds, guess))];
  });
}
/** A Quote market, graded (SS, S, A, B or C), and whether the truth lay inside it. */
export function noteMarket(grade, inside) {
  bump(["market", weekOf()], v => {
    const m = v || { n: 0, inside: 0, grades: {} };
    m.n++; if (inside) m.inside++;
    m.grades[grade] = (m.grades[grade] || 0) + 1;
    return m;
  });
}
