// The pile: what you didn't know, brought back until you do. Every knowledge game records an item when you miss
// it, pass on it, or barely stake on it, and when it comes back and you get it right it moves up a pile; wrong,
// and it drops to the first. Six piles with growing gaps, Leitner's boxes on Pimsleur's clock: ultra-short
// (due at once, for the next block), short (ten minutes), medium (twelve hours), long (a week), longer (a month),
// longest (three months); right in the longest pile and it's learned. Chess puzzles skip the short-term piles: ultra-short,
// a week, three months. (Until October 2026 the week was the last;
// items learned then come back once, a month after they were learned.) Every item that comes back, right or wrong,
// goes to the Ledger's record with how long it was away (ledger-log.js). Learning mode lets each game's dealer draw what's due into its next block, alongside
// new content. Deck is the tile that reviews everything due, across the games.

import { noteRecall } from "./ledger-log.js";
import { today } from "./days.js";

const STORE = "pile:items", SETTINGS = "pile:settings", DAY = 24 * 60 * 60 * 1000;
export const PILES = [
  { id: 0, name: "Ultra-short", gap: 0 },
  { id: 1, name: "Short", gap: 10 * 60 * 1000 },
  { id: 2, name: "Medium", gap: 12 * 60 * 60 * 1000 },
  { id: 3, name: "Long", gap: 7 * DAY },
  { id: 4, name: "Longer", gap: 30 * DAY },
  { id: 5, name: "Longest", gap: 91 * DAY },
];
// the piles a game's items climb through. Most use every pile; a chess puzzle skips the short-term ones (a tactic seen
// ten minutes or twelve hours ago is still in mind, so passing it then proves little): ultra-short, then a week, then
// three months, then learned
const LADDER = { rush: [0, 3, 5] };
/** The pile an item moves to when it's right, or null if that makes it learned. */
export function nextPile(game, pile) {
  const steps = LADDER[game] || PILES.map(p => p.id);
  const next = steps.find(s => s > pile);
  return next === undefined ? null : next;
}
// brut: what Brut (retired, November 2026) put on the pile; its wine cards are Punt's Wine level now, and the key stays so those are still asked
export const GAMES = { punt: "Punt", quote: "Quote", chart: "Chart", crates: "Crates", rush: "Chess", slate: "Slate", parley: "Parley", brut: "Wine",
  nonogram: "Nonogram", isomer: "Isomer", lode: "Lode", crossword: "Crossword", nexus: "Nexus" };

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };
let items = null;
function load() {
  if (items) return items;
  items = read(STORE, {});
  // once: what was learned when the week was the last pile comes back for its month, a month after it was learned
  const settings = read(SETTINGS, {});
  if (!settings.months) {
    for (const it of Object.values(items)) if (it.learned) { it.pile = 4; it.due = it.learned + PILES[4].gap; delete it.learned; }
    save();
    write(SETTINGS, { ...settings, months: true });
  }
  return items;
}
function save() { write(STORE, items); }

/** An item's last answers, oldest first: [[YYYYMMDD, 1 right | 0 wrong when it came back | 2 the miss that put it in the pile]…],
 *  at most HISTORY. Items stored before it existed have none (`it.h` absent): the Ledger then falls back on their latest answer. */
export const HISTORY = 8;
export const historyOf = it => (Array.isArray(it?.h) ? it.h : []);
function remember(it, code, now) {
  it.h = [...historyOf(it).slice(1 - HISTORY), [today(new Date(now)), code]];
}

/**
 * The learning mode, one for every game (its menu's "Learning mode"):
 *   norepeat  deals nothing from the piles, and keeps what it deals fresh: nothing again until the rest has had its turn
 *   learn     what's newest: the shortest-term pile first (due or not), so a new miss is drilled before it can fade
 *   revision  what's due, the longest-term pile first (what a lapse would cost most); how the games always dealt
 *   mixed     both, one then the other: the shortest-term and the longest-term due together
 * The old on/off switch is read as revision/no repeats.
 */
export const MODES = [["norepeat", "No repeats"], ["learn", "Learn"], ["revision", "Revision"], ["mixed", "Mixed"]];
export function mode() {
  const s = read(SETTINGS, {});
  return MODES.some(([m]) => m === s.mode) ? s.mode : s.learning === false ? "norepeat" : "revision";
}
export function setMode(m) { if (MODES.some(([k]) => k === m)) write(SETTINGS, { ...read(SETTINGS, {}), mode: m }); }
/** Whether the piles deal anything (every mode but No repeats). */
export const learning = () => mode() !== "norepeat";

// what each game has dealt lately, oldest first, for No repeats: a game's `fresh` weighs these down
const DEALT = "pile:dealt", DEALT_CAP = 1500;
/** Notes keys a game has just dealt (keeps the latest `cap`, so a pool smaller than that comes round again in turn). */
export function dealt(game, keys, cap = DEALT_CAP) {
  const all = read(DEALT, {}), had = (all[game] || []).filter(k => !keys.includes(k));
  all[game] = [...had, ...keys].slice(-cap);
  write(DEALT, all);
}
/**
 * No repeats for a dealer: `need` picks (`pick(pool, n)` is the game's own draw) from what hasn't been dealt lately,
 * the rest from what has if that falls short. `key` names a pool item as `dealt` was told it.
 */
export function freshPicks(game, pool, key, need, pick) {
  if (need <= 0) return [];
  const lately = recent(game), got = pick(pool.filter(x => !lately.has(key(x))), need);
  return got.length >= need ? got : [...got, ...pick(pool.filter(x => lately.has(key(x))), need - got.length)];
}
/** The keys a game has dealt lately: a Set, for a dealer to put last. */
export const recent = game => new Set(read(DEALT, {})[game] || []);

/**
 * Records an item. game: which game; key: its id in that game; payload: enough to ask it again anywhere
 * (see Deck); why: "wrong" | "pass" | "lowStake" | "miss" | "clue" | "lookup". A new item starts in the
 * ultra-short pile; a known one drops back to it.
 */
export function record(game, key, payload, why) {
  const all = load(), id = `${game}:${key}`, now = Date.now();
  if (all[id]) noteRecall(now - (all[id].last?.at ?? all[id].added), false);   // it came back, and you didn't have it
  const it = all[id] || { id, game, key, added: now, seen: 0, fails: 0, passes: 0 };
  it.payload = payload;
  if (payload?.about?.length) it.about = payload.about;     // the entities it's about (kb/), so other games can ask about them too
  it.pile = 0;
  it.due = now;
  delete it.learned;                                   // a learned item that's missed again is back in the piles
  it.fails++;
  it.last = { at: now, why };
  remember(it, all[id] ? 0 : 2, now);
  all[id] = it;
  save();
  return it;
}
/** Adds an item to learn (a new word): it starts in the ultra-short pile, due now, without counting as a miss. */
export function add(game, key, payload) {
  const all = load(), id = `${game}:${key}`;
  if (all[id]) return all[id];
  const now = Date.now();
  all[id] = { id, game, key, added: now, seen: 0, fails: 0, passes: 0, payload, pile: 0, due: now, last: { at: now, why: "new" } };
  save();
  return all[id];
}
/** Notes an item was shown (for the cap on how much of a block is old). */
export function seen(game, key) {
  const all = load(), id = `${game}:${key}`;
  if (all[id]) { all[id].seen++; all[id].shown = Date.now(); save(); }
}
/** The item got answered when it came back: right moves it up a pile (and out, past the long one); wrong drops it to the first. */
export function answer(game, key, right) {
  const all = load(), id = `${game}:${key}`, it = all[id];
  if (!it) return null;
  const now = Date.now();
  noteRecall(now - (it.last?.at ?? it.added), right);
  if (right) {
    it.passes++;
    const next = nextPile(it.game, it.pile);
    if (next === null) { it.learned = now; it.due = Infinity; }
    else { it.pile = next; it.due = now + PILES[next].gap; }
  } else {
    it.fails++;
    it.pile = 0;
    it.due = now;
  }
  it.last = { at: now, why: right ? "right" : "wrong" };
  remember(it, right ? 1 : 0, now);
  save();
  return it;
}
/** Every item, or a game's; learned ones last. */
export function all(game = null) {
  return Object.values(load()).filter(it => !game || it.game === game).sort((a, b) => (a.learned ? 1 : 0) - (b.learned ? 1 : 0) || a.pile - b.pile || a.due - b.due);
}
/**
 * What's due now (or by `at`), the most revised first: the highest pile first, and within a pile the longest overdue.
 * What has lasted longest is what a lapse would cost most, so it's checked first; moving a new miss from the ultra-short
 * pile up is for when every longer check is done. Deck's review and every game's learning mode take this order.
 */
export function due(game = null, at = Date.now()) {
  return all(game).filter(it => !it.learned && it.due <= at).sort((a, b) => b.pile - a.pile || a.due - b.due);
}
/**
 * What the learning mode deals now, from a game's items (or every game's), in the order to deal it:
 * revision is due(); learn the shortest-term pile first, due or not yet; mixed takes one of each in turn (the
 * shortest-term, then the longest-term due), nothing twice; No repeats nothing.
 */
export function picks(game = null, at = Date.now()) {
  const m = mode();
  if (m === "norepeat") return [];
  const revise = due(game, at);
  if (m === "revision") return revise;
  const learn = all(game).filter(it => !it.learned).sort((a, b) => a.pile - b.pile || a.due - b.due);
  if (m === "learn") return learn;
  const out = [], taken = new Set();
  for (let i = 0; i < Math.max(learn.length, revise.length); i++) {
    for (const it of [learn[i], revise[i]]) if (it && !taken.has(it.id)) { taken.add(it.id); out.push(it); }
  }
  return out;
}
/** Counts per pile for a game or all, plus learned and due. */
export function counts(game = null) {
  const list = all(game), out = { piles: PILES.map(() => 0), learned: 0, due: 0, total: list.length };
  for (const it of list) { if (it.learned) out.learned++; else { out.piles[it.pile]++; if (it.due <= Date.now()) out.due++; } }
  return out;
}
/**
 * The knowledge base's entities that other games have found you weak on: what's due there now, by entity, with how
 * many due items name it. A game's learning mode deals its own questions about them, in its own format: miss who
 * painted the Mona Lisa in Punt and Quote asks the year it was painted; miss Geneva in Crates and Chart asks you to
 * pin it.
 */
export function weakElsewhere(game, at = Date.now()) {
  const weak = new Map();
  for (const it of picks(null, at)) if (it.game !== game) for (const id of it.about || []) weak.set(id, (weak.get(id) || 0) + 1);
  return weak;
}
/**
 * A learning mode's picks from a game's pool: its own due keys first, then (up to `cap`) questions about what other
 * games found you weak on, most-missed first, never one already dealt. pool: [{ key, about }].
 */
export function dealDue(game, pool, ownDue, cap) {
  const weak = weakElsewhere(game), taken = new Set(ownDue);
  const cross = pool.filter(q => !taken.has(q.key) && q.about?.some(id => weak.has(id)))
    .sort((a, b) => Math.max(...b.about.map(id => weak.get(id) || 0)) - Math.max(...a.about.map(id => weak.get(id) || 0)));
  return [...ownDue, ...cross.slice(0, Math.max(0, cap - ownDue.length)).map(q => q.key)];
}
/** Has this item been recorded (and not yet learned)? */
/** Replaces what an item shows (its question has been rewritten since it went in) and nothing else: not its pile, its
 *  streak or when it's due. */
export function refresh(game, key, payload) { const all = load(), it = all[`${game}:${key}`]; if (!it) return; it.payload = payload; save(); }
export function has(game, key) { const it = load()[`${game}:${key}`]; return !!it && !it.learned; }
export function forget(game, key) { const all = load(); delete all[`${game}:${key}`]; save(); }
export function clear() { items = {}; save(); }

/**
 * A dealer's helper: given the game, the pool it would deal from (items with a `key`) and the block size, returns
 * the keys to put in the block: all due items first (up to half the block), then new content preferring the
 * unseen. Never the same key twice. The caller then builds the block in that order.
 */
export function plan(game, pool, size) {
  if (!learning()) return null;
  const keys = new Set(pool.map(p => p.key));
  const dueKeys = picks(game).map(it => it.key).filter(k => keys.has(k)).slice(0, Math.ceil(size / 2));
  return dueKeys;
}
