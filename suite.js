// The suite's codes, shown on the games screen.
// Solo: one 8-letter code for you. Every device that has it keeps every game in the same state: each game's saved
// state, the review pile and your settings go up to Firebase a moment after they change, and come down when a page
// opens or comes back into view, the newer winning key by key (each change carries its time). Crates' run follows the
// same code through its own sync (run.js), which already guards boards and banks of different versions.
// Duo: you and your partner link once, on the games screen, and stay linked. The link is a four-letter room that is
// yours for good (crates/rooms/CODE) and belongs to the player, not the device: it and your player id sync with your
// solo code, so your phone and laptop both know your partner. Every page you open tells the room what you're doing
// (live/PLAYER/DEVICE: the game, solo or duo, online while the page is), so your partner always sees it; either of you
// can ask the other to play a game together (ask), which shows a banner wherever the other is, and Play takes both of
// you into the duo match: the game opened in the room (?room=CODE&new=the request's time), at a new table, the solo
// game kept where it was. Nothing about multiplayer is set up inside a game.
// Loaded by every page (through pwa.js), so the sync and the presence run whichever game you open.
import { getSync } from "./net.js";
import { roomInAddress } from "./rooms.js";
import { today, movedToDates, bestOfDay } from "./days.js";
import { duoRecordsOf } from "./duo-records.js";
import { TILES as TRUMPS_TILES, tileOf, gameInAddress } from "./trumps-tiles.js";

const SOLO = "suite:solo", META = "suite:meta", PULLED = "suite:pulled";
const WATCHING = new URLSearchParams(location.search).has("watch");   // this page shows your partner's game (see below)
const FRAME = WATCHING && new URLSearchParams(location.search).has("frame");   // one frame of that view, inside the watching page
const PAIR = "pair:code", ME = "pair:me";       // the pair's room and your player id: synced, so all your devices share them
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PUSH_DELAY = 1500;
// what stays on this device: the suite's bookkeeping, Crates' run (synced by run.js), Firebase's own sign-in
// (settings:flat, the 2D battery saver, is one phone's: another device has its own battery)
const LOCAL = /^(suite:|settings:flat|crates:run|crates:updated|crates:v2|firebase:)/;
// the store sits beside Crates' run under crates/runs (where 8-letter codes may write), at the code moved on seven letters
// (codes made here avoid I and O, which read as 1 and 0; a code you choose may use any letter, and moves through all 26)
const storePath = code => `crates/runs/${/[IO]/.test(code)
  ? [...code].map(ch => String.fromCharCode(65 + ((ch.charCodeAt(0) - 65 + 7) % 26))).join("")
  : [...code].map(ch => LETTERS[(LETTERS.indexOf(ch) + 7) % LETTERS.length]).join("")}`;
const enc = k => encodeURIComponent(k).replace(/\./g, "%2E");     // a database key can't hold . # $ [ ] /
const raw = { getItem: Storage.prototype.getItem, set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
raw.get = k => raw.getItem.call(localStorage, k);
const json = (k, fallback) => { try { return JSON.parse(raw.get(k)) ?? fallback; } catch { return fallback; } };
const put = (k, v) => { try { raw.set.call(localStorage, k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* private mode */ } };
/** A figure a game's tile shows, kept like any game's own save: synced with your solo code, so every device shows it.
 *  (Written with put, as they once were, they never left the device, and an older copy from elsewhere could win.) */
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
export const soloCode = () => { const c = raw.get(SOLO); return c && c.length === 8 ? c : null; };
export const duoCode = () => { const c = raw.get(PAIR); return c && c.length === 4 ? c : null; };
/** Your player id, made once and synced: it tells your devices apart from your partner's. */
export const playerId = () => { let id = raw.get(ME); if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem(ME, id); } return id; };
const newPair = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const newCode = () => Array.from({ length: 8 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
/** The game this page is (its file's name), for whether a change from elsewhere is this page's own. */
const page = () => (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
const own = k => page() !== "index" && (k.startsWith("pile:") || k.startsWith(`${page()}:`));

let meta = json(META, {}), dirty = new Map(), timer = null;
let frozen = null;                                // the keys of a game being started over (resetGame): not written again before the reload
const syncing = () => !!soloCode();

/** Starts a solo code on this device (a new one, or one you chose that nobody has yet): everything here goes up, as of now. */
export function startSolo(code = newCode()) {
  meta = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!LOCAL.test(k)) meta[k] = Date.now(); }
  put(META, meta);
  put(SOLO, code);
  linkCrates(code);
  return code;
}
/** Joins a code started elsewhere: what's there wins over what's here (this device's progress so far stays only where the code has none). */
export function joinSolo(code) {
  meta = {};
  put(META, meta);
  put(SOLO, code);
  sessionStorage.removeItem(PULLED);
  linkCrates(code);
}
export function stopSolo() { raw.remove.call(localStorage, SOLO); }
/**
 * A solo code you typed or followed a link to: if it already holds someone's games, follow it (what's there wins);
 * if nobody has it yet, it becomes yours, starting from what this device has now. Resolves "joined" or "started".
 */
export async function chooseSolo(code) {
  let there = null;
  try { there = await once(await getSync(), storePath(code)); } catch (e) { console.error(e); }
  if (there && Object.keys(there).length) { joinSolo(code); return "joined"; }
  startSolo(code);
  return "started";
}
/** Crates' run follows the same code through run.js; rev 0 means whatever the code holds is newer. */
function linkCrates(code) { put("crates:run", { code, rev: 0, dirty: true }); }
/**
 * Links you to a partner by their code, or (none given) makes a new code to give them; a code nobody has used yet is
 * simply a new, empty room, so you can pick your own. Synced to your other devices.
 */
export function link(code) { code = code || newPair(); localStorage.setItem(PAIR, code); return code; }
export function unlink() { localStorage.removeItem(PAIR); }

// every write to this device's storage is noted with its time, and goes up a moment later
function touched(k, v) {
  if (typeof k !== "string") return;
  if (!WATCHING && duoCode() && gamesKey(pageGame(), k) && !mirrorTimer) mirrorTimer = setTimeout(() => { mirrorTimer = null; mirror(); }, PUSH_DELAY);
  if (!syncing() || LOCAL.test(k)) return;
  meta[k] = Date.now();
  put(META, meta);
  dirty.set(k, { v, t: meta[k] });
  clearTimeout(timer);
  timer = setTimeout(push, PUSH_DELAY);
}
Storage.prototype.setItem = function (k, v) {
  if (this === localStorage && WATCHING && !k.startsWith("suite:")) return;      // watching: their game, nothing of yours is written
  if (this === localStorage && frozen?.some(p => k.startsWith(p))) return;        // a game just started over: nothing of it comes back before the reload
  const was = this === localStorage && SIGN.test(k) ? raw.get(k) : null;
  raw.set.call(this, k, v);
  if (this === localStorage) {
    touched(k, String(v));
    if (was !== String(v) && SIGN.test(k) && k.startsWith(`${pageGame()}:`)) notePlayed();      // a sign that changed: a start-up that rewrites the same figure isn't play
  }
};
Storage.prototype.removeItem = function (k) {
  if (this === localStorage && WATCHING && !k.startsWith("suite:")) return;
  raw.remove.call(this, k);
  if (this === localStorage) touched(k, null);
};

async function push() {
  const code = soloCode();
  if (!code || !dirty.size) return;
  const batch = Object.fromEntries([...dirty].map(([k, x]) => [enc(k), x]));
  dirty = new Map();
  try { await (await getSync()).update(storePath(code), batch); } catch (e) { console.error(e); for (const [ek, x] of Object.entries(batch)) dirty.set(decodeURIComponent(ek), x); }
}
const once = (sync, path) => new Promise(resolve => { const stop = sync.watch(path, v => { resolve(v); setTimeout(() => stop?.(), 0); }, () => resolve(null)); });

/** Takes what's newer on the code than here; sends up what's newer here. A change to this page's own game reloads it (once a visit). */
export async function pull() {
  const code = soloCode();
  if (!code) return;
  let remote;
  try { remote = await once(await getSync(), storePath(code)); } catch (e) { console.error(e); return; }
  let mine = false, came = false;
  for (const [ek, x] of Object.entries(remote || {})) {
    const k = decodeURIComponent(ek);
    if (LOCAL.test(k) || !x || (meta[k] || 0) >= x.t) continue;
    if (x.v == null) raw.remove.call(localStorage, k); else raw.set.call(localStorage, k, x.v);
    meta[k] = x.t;
    came = true;
    if (own(k)) mine = true;
  }
  if (came) dispatchEvent(new Event("suite:pulled"));     // the games screen redraws its tiles from what came in
  for (const [k, t] of Object.entries(meta)) if (!(remote?.[enc(k)]?.t >= t)) dirty.set(k, { v: raw.get(k), t });
  put(META, meta);
  if (dirty.size) push();
  if (mine && !sessionStorage.getItem(PULLED)) { sessionStorage.setItem(PULLED, "1"); location.reload(); }
}

// ---------- starting a game over (Settings) ----------
/** A game's keys, for starting it over: its own prefix, and the other names a game keeps (Slate's glyph:, Blend's
 *  blend2:, Gambit's puzzle rush's rush:). Nothing of the suite's (LOCAL) and nothing shared (the review pile, the pictures). */
const RESET_PREFIXES = { maths: ["maths:", "odds:"], nonogram: ["nonogram:", "loom:"], glyph: ["glyph:", "slate:"], blend: ["blend:", "blend2:"], gambit: ["gambit:", "rush:"], reckoning: ["reckoning:", "courier:"],
  // Stow's page holds two tiles: Loose cargo's saves are two of stow:'s keys (and its figure, loose:stars), so each tile resets its own
  stow: ["stow:plan", "stow:day", "stow:view", "stow:mode", "stow:stars", "stow:best"], loose: ["stow:run", "stow:progress", "loose:"],
  jass: ["trumps:jass:"], belote: ["trumps:belote:"], coinche: ["trumps:coinche:"], schafkopf: ["trumps:schafkopf:", "trumps:course", "trumps:rush"] };   // the four tiles of trumps.html
/**
 * Starts a game over: every key under its prefixes goes, here and, with a solo code, on the code, so your other devices
 * drop them too (a removal syncs like any change, the newer winning: their older copies can't come back). Keys only
 * another device had are taken from the code and removed there as well. Until the page reloads, the game's keys can't
 * be written again, so a page still showing the game can't save it back. Resolves how many keys went.
 */
export async function resetGame(app) {
  if (WATCHING) return 0;
  const prefixes = RESET_PREFIXES[app] || [`${app}:`], ours = k => prefixes.some(p => k.startsWith(p)) && !LOCAL.test(k);
  const gone = new Set();
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && ours(k)) gone.add(k); }
  for (const k of gone) localStorage.removeItem(k);             // noted with its time, and sent up as a removal
  frozen = prefixes;
  const code = soloCode();
  if (!code) return gone.size;
  try {
    const remote = await Promise.race([getSync().then(sync => once(sync, storePath(code))), new Promise((_, no) => setTimeout(() => no(new Error("offline")), 6000))]);
    for (const [ek, x] of Object.entries(remote || {})) {
      const k = decodeURIComponent(ek);
      if (!ours(k) || gone.has(k) || x?.v == null) continue;
      meta[k] = Date.now();
      dirty.set(k, { v: null, t: meta[k] });
      gone.add(k);
    }
    put(META, meta);
  } catch (e) { console.error(e); }                            // offline: this device's keys go now, and their removals go up later
  clearTimeout(timer);
  await push();
  return gone.size;
}

// ---------- comparable results ----------
// The day, the same for everyone (days.js): the UTC date as YYYYMMDD. It seeds every game's daily, which is dealt on the
// device (offline too) and is the same set wherever you are, rolling over at the same moment for everyone.
export { today };
// ---------- days played ----------
// The Ledger's "games played" and its daily dots: { game: [YYYYMMDD…] }, the last PLAYED_DAYS per game, kept under
// ledger:played (not suite:, which stays on the device) so every device adds to it. A day is noted when the page is
// actually played: a comparable result, a streak, a day's time or count (the note* calls below), any write of a game's own
// sign of progress (best, daily, stars… on its page; the hook in setItem), or a round counted for Random (random.js).
// Never in a watching page: it is your partner's game, and nothing there is yours.
export const PLAYED = "ledger:played", PLAYED_DAYS = 120;
const SIGN = /:(best|daily|ranked|streak|stars|lessons|course|progress|today|count|wins)$/;
let playedNoted = "";                                    // "game/day" last written from this page, so a day costs one write
export function notePlayed(app = pageGame(), day = String(today())) {
  try {
    if (WATCHING || !app || playedNoted === `${app}/${day}`) return;
    const all = json(PLAYED, null), have = all && typeof all === "object" && !Array.isArray(all) ? all : {}, days = Array.isArray(have[app]) ? have[app] : [];
    playedNoted = `${app}/${day}`;
    if (days.includes(day)) return;
    have[app] = [...days, day].sort().slice(-PLAYED_DAYS);
    localStorage.setItem(PLAYED, JSON.stringify(have));
  } catch { /* private mode */ }
}
/** Games whose best counts only comparable runs: the daily, and the Standard preset (everything in, default settings,
 *  nothing from your pile or your history dealt in). The games screen and your partner see only these. */
export const RANKED = new Set(["chart", "quote", "punt", "crates"]);
/** Notes a comparable result (higher is better): the best of them, and for a daily (day: the date it was dealt for,
 *  YYYYMMDD) that day's, the latest day's only, so an older daily from a link leaves today's alone. */
export function noteComparable(app, score, day = null) {
  if (!Number.isFinite(score)) return;
  const r = json(`${app}:ranked`, null) || {};
  if (r.best == null || score > r.best) r.best = score;
  if (day && (!r.day || day > r.day.key || (day === r.day.key && score > r.day.score))) r.day = { key: day, score };
  try { localStorage.setItem(`${app}:ranked`, JSON.stringify(r)); } catch { /* private mode */ }   // synced like any game's best
}
/** A ranked game's comparable best, and today's daily (null if not played today). */
export function comparableOf(app) {
  const r = json(`${app}:ranked`, null);
  return { best: r?.best ?? null, today: r?.day?.key === today() ? r.day.score : null };
}

// ---------- bests ----------
/** A game's best, from what it keeps: a number, a { score }, or its bests by level (the highest). A ranked game's is
 *  its comparable best only. */
export function bestOf(app) {
  if (RANKED.has(app)) return comparableOf(app).best;
  const v = json(`${app}:best`, null);
  const num = x => (typeof x === "number" ? x : typeof x?.score === "number" ? x.score : null);
  if (num(v) != null) return num(v);
  const xs = v && typeof v === "object" ? Object.values(v).map(num).filter(x => x != null) : [];
  return xs.length ? Math.max(...xs) : null;
}
// ---------- what each game's tile shows ----------
// One figure a game, kept the same way on every device, so the games screen reads yours and your partner's alike: a win
// streak (Crates, Cartel), today's time (Slate, Delta) or count (Deck's cards, Parley's lessons), the guesses today's
// code took (Bulls, kept as a count), stars collected (the level games), or a best; and a game with a daily (Punt, Quote, Origin, Order, Chart) shows today's instead when either
// of you has played it.
export const MARKS = { crates: "streak", cartel: "streak", tribute: "streak", glyph: "time", delta: "time", survey: "time", punt: "daily", quote: "daily", origin: "daily",
  order: "daily", chart: "daily", columbiad: "daily", calibre: "stars", harbour: "stars", blend: "stars", refinery: "stars", stow: "stars", loose: "stars", deck: "count", parley: "count", wine: "lessons", firmament: "lessons", arthistory: "lessons", trade: "lessons", constitutions: "lessons", statecraft: "lessons", music: "lessons", maths: "lessons",
  river: "best", gambit: "best", yacht: "daily", boast: "streak", bigtwo: "streak", hearts: "streak", carrack: "streak", meld: "streak", rack: "streak", pegs: "streak", landlord: "streak", banquet: "streak", gammon: "streak", flank: "streak", morris: "streak", silo: "streak", carrom: "streak", crown: "streak", go: "streak", tarot: "streak", jass: "streak", belote: "streak", schafkopf: "streak", quest: "streak", bones: "streak", solitaire: "wins",
  contract: "streak", sudoku: "time", mines: "time", nonogram: "time", hitori: "time", slitherlink: "time", bridges: "time", masyu: "time", nurikabe: "time", lanterns: "time", moor: "time", asterism: "time", bulls: "guesses", assay: "daily", yield: "daily", nexus: "daily", isomer: "time", ladder: "time", lode: "time", lots: "daily", codeword: "time", crossword: "time", acrostic: "time", calcudoku: "time", kakuro: "time", manifest: "daily", shunt: "daily", ingot: "daily", speedmaths: "daily", speedfuels: "daily", pipes: "daily" };
const keyOf = app => (app === "glyph" ? "slate" : TRUMPS_TILES[app] ? `trumps:${app}` : app);   // Slate keeps its things under slate:; Jass, Belote and Schafkopf each theirs on the one trumps page
/** A game won or lost, in a game that counts streaks: the current run, and the longest. */
export function noteStreak(app, won) {
  const s = json(`${app}:streak`, null) || { now: 0, best: 0 };
  s.now = won ? s.now + 1 : 0;
  s.best = Math.max(s.best, s.now);
  keep(`${app}:streak`, s);
}
/** Today's puzzle solved, in seconds: the first solve counts, a second is a replay. */
export function noteDayTime(app, secs, day = today()) { if (json(`${app}:today`, null)?.key !== day) keep(`${app}:today`, { key: day, v: Math.round(secs) }); }
/** One more done today: a card revised, a lesson finished. */
export function noteDayCount(app, day = today()) { const r = json(`${app}:count`, null); keep(`${app}:count`, { key: day, v: r?.key === day ? r.v + 1 : 1 }); }
/** Stars collected, in all. */
export function noteStars(app, n) { if (json(`${app}:stars`, null) !== n) keep(`${app}:stars`, n); }   // only a change goes up
const calibreStars = () => Object.values(json("calibre:progress", {}) || {}).reduce((n, p) => n + (p?.stars || 0), 0);
// a daily game's best and today's: Quote, Chart and Punt keep them as comparable results; Origin keeps each day's total
// by the day (YYYYMMDD), Order each day's by the day and the mode (YYYYMMDD/dates: it has a daily for each), its tile
// today's best of them; Order's best leaves its History runs out
function dailyOf(app) {
  if (RANKED.has(app)) return comparableOf(app);
  const day = bestOfDay(json(`${app}:daily`, {}), today());
  if (app !== "order") return { best: bestOf(app), today: day };
  const xs = Object.entries(json("order:best", {}) || {}).filter(([k]) => !k.startsWith("s:")).map(([, v]) => v).filter(Number.isFinite);
  return { best: xs.length ? Math.max(...xs) : null, today: day };
}
/** Opened from the games screen's tile with #today in the address: today's daily is still to play, so the game opens
 *  on it. True once; the address is cleared for the game's own. */
export function arrivedForToday() {
  if (location.hash !== "#today") return false;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return true;
}
/** Whether today's daily of a game is still to play: the games screen's tile then opens it (#today). */
export const dailyDue = app => {
  const kind = MARKS[app];
  if (kind === "time" || kind === "guesses") return markOf(app) == null;
  if (kind === "daily") return markOf(app)?.today == null;
  return false;
};
/** A game's figure for its tile, as data: { kind, v }, or for a daily game { kind, best, day, today }; null if none yet. */
export function markOf(app) {
  const kind = MARKS[app] || "best", k = keyOf(app), d = today();
  if (kind === "streak") {                                     // Crates carries today's board too, which its tile shows first
    const r = json(`${k}:streak`, null), t = app === "crates" ? comparableOf("crates").today : null;
    return r?.best || t != null ? { kind, v: r?.best || 0, day: d, today: t } : null;
  }
  if (kind === "time" || kind === "count" || kind === "guesses") { const r = json(`${k}:${kind === "time" ? "today" : "count"}`, null); return r?.key === d ? { kind, day: d, v: r.v } : null; }
  if (kind === "lessons") { const r = json(`${k}:lessons`, null); return r?.done ? { kind, v: `${r.done}/${r.of}` } : null; }     // a course: lessons done of all
  if (kind === "wins") { const v = json(`${k}:wins`, null); return v ? { kind, v } : null; }
  if (kind === "stars") { const v = app === "calibre" ? calibreStars() : json(`${k}:stars`, null); return v ? { kind, v } : null; }
  if (kind === "daily") { const { best, today: t } = dailyOf(app); return best == null && t == null ? null : { kind, best, day: d, today: t }; }
  const v = bestOf(app);
  return v == null ? null : { kind, v };
}
/** Shares your bests with the duo room, under your name. */
export async function shareBests(apps) {
  const code = duoCode();
  if (!code) return;
  const sync = await getSync();
  const bests = Object.fromEntries(apps.map(a => [a, bestOf(a)]).filter(([, v]) => v != null));
  const marks = Object.fromEntries(apps.map(a => [a, markOf(a)]).filter(([, v]) => v));     // what your tiles show, for theirs
  await sync.update(`crates/rooms/${code}/best/${playerId()}`, { name: raw.get("crates:name") || "", at: Date.now(), bests, marks });
}
// ---------- duo records ----------
/**
 * A finished duo match, as this player saw it: duo/GAME/MATCH/PLAYER = { score, won, coop, lower, at }. Both players'
 * devices report the same match, each its own side, so a match counts once and both sides agree on who won.
 * coop: a team result (the same score on both sides); lower: a lower score is better (a time).
 */
export async function reportDuo(game, match, { score = null, won = null, coop = false, lower = false }) {
  const code = duoCode();
  if (!code || match == null) return;
  if (roomInAddress() && roomInAddress() !== code) return;     // a match in a party's room: not the pair's record
  const sync = await getSync();
  await sync.update(`crates/rooms/${code}/duo/${game}/${enc(String(match))}`, { [playerId()]: { score, won, coop, lower, at: Date.now() } });
}
/** Watches the pair's duo records: cb({ game: record }), each as `duoRecordsOf` in duo-records.js works it out. */
export async function watchDuoRecords(cb) {
  const code = duoCode();
  if (!code) return () => {};
  const sync = await getSync(), me = playerId();
  return sync.watch(`crates/rooms/${code}/duo`, all => cb(duoRecordsOf(all, me)));
}
/** Watches your partner's bests: cb({ app: value }, name) on every change. */
export async function watchBests(cb) {
  const code = duoCode();
  if (!code) return () => {};
  const sync = await getSync(), me = playerId();
  return sync.watch(`crates/rooms/${code}/best`, best => {
    const theirs = Object.entries(best || {}).filter(([id]) => id !== me).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0]?.[1];
    cb(theirs?.bests || {}, theirs?.name || "", theirs?.marks || {});
  });
}

// ---------- the pair: presence, requests, the banner ----------
/** The games that can be played together (a duo match is the game opened in the pair's room). */
export const DUO_GAMES = { crates: "crates.html", slate: "slate.html", chart: "chart.html", delta: "delta.html", punt: "punt.html", quote: "quote.html", spot: "spot.html", stow: "stow.html", hong: "hong.html", tribute: "tribute.html",
  river: "river.html", gambit: "gambit.html", rush: "rush.html", origin: "origin.html", order: "order.html", blend: "blend.html", nexus: "nexus.html", survey: "survey.html", manifest: "manifest.html", refinery: "refinery.html", sudoku: "sudoku.html", mines: "mines.html", nonogram: "nonogram.html", hitori: "hitori.html", bulls: "bulls.html", assay: "assay.html", yield: "yield.html", isomer: "isomer.html", ladder: "ladder.html", lode: "lode.html", lots: "lots.html", codeword: "codeword.html", crossword: "crossword.html", acrostic: "acrostic.html", calcudoku: "calcudoku.html", kakuro: "kakuro.html", bridges: "bridges.html", speedmaths: "speedmaths.html" };
/** The game this page is on the games screen: its file's name, but trumps.html is Jass, Belote or Schafkopf (the address's
 *  ?game=, else the one played last). "" at home (index): no game open. */
const pageGame = () => (page() === "index" ? "" : page() === "trumps" ? tileOf(gameInAddress(location.search) || json("trumps:opts", null)?.game) || "jass" : page());
const ASK_FOR = 2 * 60 * 1000;                  // a request stands for two minutes
const FOLLOW_FOR = 10 * 60 * 1000;              // its yes takes the device that asked to the table this long after (it may have slept through it)
const FOLLOWED = "suite:followed";              // the request this device last went to the table for (suite: keys stay on the device)
/** A duo match's address: the game in the pair's room; `asked`, the time of the request it answers, deals a new table there. */
export const duoHref = (game, asked = null) => `${DUO_GAMES[game]}?room=${duoCode()}${asked ? `&new=${asked}` : ""}`;
export const soloHref = () => { const u = new URL(location.href); u.searchParams.delete("room"); u.searchParams.delete("new"); return u.pathname.split("/").pop() + u.search; };

/** Watches your partner: cb({ name, game, mode, online, at } | null) whenever it changes. Their freshest device counts. */
export async function watchPartner(cb) {
  const code = duoCode();
  if (!code) { cb(null); return () => {}; }
  const sync = await getSync(), me = playerId();
  return sync.watch(`crates/rooms/${code}/live`, live => {
    const devices = Object.entries(live || {}).filter(([id]) => id !== me).flatMap(([, ds]) => Object.values(ds || {}));
    devices.sort((a, b) => (b.online === true) - (a.online === true) || (b.at || 0) - (a.at || 0));
    cb(devices[0] || null);
  });
}
/**
 * Asks your partner to play a game together; resolves "yes" (and this page goes to the table), "no" or "late". Every
 * answer is a transaction (Play, Not now, or this device after two minutes), so only the first lands: a Play can't
 * arrive after you were told nobody answered. If this page has moved on before the yes, listen (below) takes the
 * device that asked to the table from whatever page it's on.
 */
export async function ask(game) {
  const code = duoCode(), sync = await getSync(), me = playerId();
  const asked = { from: me, device: sync.uid, name: raw.get("crates:name") || "Your partner", game, at: Date.now(), answer: null };
  await sync.update(`crates/rooms/${code}`, { ask: asked });
  return new Promise(resolve => {
    let stop = null, settled = false;
    const done = said => {
      if (settled) return;
      settled = true; clearTimeout(late); setTimeout(() => stop?.(), 0);
      if (said === "yes" && raw.get(FOLLOWED) !== String(asked.at)) go(asked);     // unless listen has already gone
      resolve(said);
    };
    const late = setTimeout(() => answer(sync, code, asked.at, "late").then(r => done(r.now), e => { console.error(e); done("late"); }), ASK_FOR);
    stop = sync.watch(`crates/rooms/${code}/ask`, a => { if (a?.at === asked.at && a.answer && a.answer !== "late") done(a.answer); });
  });
}
/**
 * Answers the request made at `at` with `said`, in one transaction, unless it has an answer already or a newer
 * request has replaced it. Resolves { now, mine }: the request's answer now, and whether it's this one.
 */
async function answer(sync, code, at, said) {
  let now = "late", mine = false;
  const r = await sync.tx(`crates/rooms/${code}/ask`, cur => {
    mine = false;
    if (cur === null) { now = "late"; return null; }      // the cache may be cold: null makes Firebase ask the server
    if (cur.at !== at) { now = "late"; return undefined; }
    if (cur.answer) { now = cur.answer; return undefined; }
    now = said; mine = true;
    return { ...cur, answer: said };
  });
  return { now, mine: mine && r.committed };
}
/** To the table for a request, noted on this device so that it goes once (Back to solo stays solo). */
function go(a) {
  put(FOLLOWED, String(a.at));
  location.href = duoHref(a.game, a.at);
}
/**
 * Whether this device should still go to the table for your own request, answered yes, from wherever it is now:
 * the device that asked, within ten minutes, not gone yet, and able to note that it has (with nothing kept, as in
 * some private browsing, every page it opened would go again).
 */
function toFollow(a, uid) {
  if (a.answer !== "yes" || a.device !== uid || Date.now() - a.at >= FOLLOW_FOR || raw.get(FOLLOWED) === String(a.at)) return false;
  put("suite:probe", "1");
  return raw.get("suite:probe") === "1";
}
let say = null;                                  // present's: says where this page is (sayWhere, below)
/** Says where you are: this page's game, solo or duo, online while the page is open. */
async function present() {
  const code = duoCode();
  if (!code) return;
  const sync = await getSync(), path = `crates/rooms/${code}/live/${playerId()}/${sync.uid}`;
  say = () => sync.update(path, { name: raw.get("crates:name") || "", game: pageGame(), mode: WATCHING ? "watch" : roomInAddress() ? "duo" : "solo", at: Date.now() });
  await say();
  sync.presence(path);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") say(); });
}
/** Says where you are again, after this page sat down at a table or left one without reloading (together.js): else
 *  your partner's sheet would still offer to join a table you've left, or to ask you to one you're at. */
export function sayWhere() { say?.()?.catch?.(e => console.error(e)); }
/**
 * A request from your partner shows as a banner wherever you are, while it stands: Play takes you both into the duo
 * match, at a new table. Your own request, once answered yes, takes the device that asked there too, from whatever
 * page it's on by then (the page that asked may have closed, or the phone slept through the answer).
 */
async function listen() {
  const code = duoCode();
  if (!code) return;
  const sync = await getSync(), me = playerId();
  let lapse = null;
  sync.watch(`crates/rooms/${code}/ask`, a => {
    clearTimeout(lapse);
    banner(null);
    if (!a || !DUO_GAMES[a.game]) return;
    if (a.from === me) {
      if (toFollow(a, sync.uid)) go(a);
      return;
    }
    const left = ASK_FOR - (Date.now() - a.at);
    if (a.answer || left <= 0) return;
    const bar = document.createElement("div");
    bar.className = "pair-ask";
    bar.setAttribute("role", "alertdialog");
    const name = a.game === "crates" ? "Crates" : a.game[0].toUpperCase() + a.game.slice(1);
    bar.innerHTML = `<span><b></b> wants to play ${name} together</span><button class="btn primary" type="button" data-yes>Play</button><button class="btn" type="button" data-no>Not now</button>`;
    bar.querySelector("b").textContent = a.name || "Your partner";
    bar.querySelector("[data-yes]").addEventListener("click", async () => {
      for (const b of bar.querySelectorAll("button")) b.disabled = true;
      const r = await answer(sync, code, a.at, "yes").catch(e => { console.error(e); return { mine: false, now: null }; });
      if (r.mine) { go(a); return; }
      // too late (they gave up waiting, or asked again), or another of your devices said Play first
      bar.querySelector("span").textContent = r.now === "yes" ? "Your other device is on its way" : "That request lapsed: ask them again";
      for (const b of bar.querySelectorAll("button")) b.remove();
      banner(bar);                                  // the change that made it too late took it down: up again, to say so
      lapse = setTimeout(() => banner(null), 2500);
    });
    bar.querySelector("[data-no]").addEventListener("click", () => { answer(sync, code, a.at, "no").catch(e => console.error(e)); banner(null); });
    banner(bar);
    lapse = setTimeout(() => banner(null), left);   // the request lapses for them at two minutes: its banner goes with it
  });
  // Your partner asking to join your board (a prompt wherever you are), or your own such request answered yes (this
  // device goes to the party of two): coop-ui.js, loaded when there is something to show, since it brings the game's
  // engine with it.
  let ui = null, latest = null;
  const ctx = {
    sync, pair: code, me, banner,
    name: () => raw.get("crates:name") || "Your partner",
    saved: keys => Object.fromEntries(keys.map(k => [k, raw.get(k)])),
    followed: () => raw.get(FOLLOWED),
    go: (href, at) => { put(FOLLOWED, String(at)); location.href = href; },
  };
  sync.watch(`crates/rooms/${code}/join`, a => {
    latest = a;
    if (ui) { ui.onJoinNode(a, ctx); return; }
    const theirs = a && a.from !== me && !a.answer, mine = a && a.from === me && a.answer === "yes" && a.device === sync.uid && raw.get(FOLLOWED) !== String(a.at);
    if (theirs || mine) import("./coop-ui.js").then(m => { ui = m; ui.onJoinNode(latest, ctx); }).catch(e => console.error(e));
  });
}
/**
 * Puts up a request's banner (null takes it down); `slot` is which kind: "ask" (to play together), "join" (to join your
 * board: coop-ui.js), each with its own. It lives in the topmost open modal dialog when there is one
 * (the games screen, a menu, a sheet), since a modal dialog leaves everything outside it out of sight and out of
 * reach: on the games screen, where you'd often be when asked, a banner on the page could be neither seen nor tapped.
 * It moves as dialogs open and close.
 */
const shown = new Map();
let moves = null;
function banner(bar, slot = "ask") {
  const old = shown.get(slot);
  if (old && old !== bar) old.remove();
  if (bar) shown.set(slot, bar); else shown.delete(slot);
  if (!shown.size) { moves?.disconnect(); moves = null; return; }
  const place = () => {
    const modal = [...document.querySelectorAll("dialog[open]")].filter(d => { try { return d.matches(":modal"); } catch { return true; } }).pop();
    const home = modal || document.body;
    for (const b of shown.values()) if (b.parentNode !== home) home.appendChild(b);
  };
  place();
  if (!moves) {
    moves = new MutationObserver(place);
    moves.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  }
}

// ---------- watching your partner ----------
// While you play solo, the game you have open is mirrored to the pair's room: every key of its own (its run, its
// settings: "pipes:run"…), a moment after it changes (watch/PLAYER = { game, at, keys }). Your partner opens the same game
// with ?watch and sees yours: there, every read of that game's keys returns your copy and every write goes nowhere, so
// their own solo state is never touched; a veil keeps their taps off the board, and the page reloads when you move.
// So any game can be watched, without code of its own. Keys of the suite, Crates' run link and Firebase's stay out.
let mirrorTimer = null, watched = null;           // watched: inside a frame, the partner's copy { name, game, at, keys: Map }
/** The prefixes of a game's keys in storage: the game's id; but Slate keeps its old name, Glyph, and Blend's rebuild
 *  saves under blend2: (so its first version's saves were never misread), its stars under blend:. A key under none of
 *  them isn't the game's: it isn't mirrored, and a watching frame reads the watcher's own. */
const PREFIXES = { maths: ["maths:", "odds:"], nonogram: ["nonogram:", "loom:"], slate: ["glyph:"], blend: ["blend:", "blend2:"], reckoning: ["reckoning:", "courier:"], jass: ["trumps:"], belote: ["trumps:"], coinche: ["trumps:"], schafkopf: ["trumps:"] };
const gamesKey = (game, k) => !!game && (PREFIXES[game] || [`${game}:`]).some(p => k.startsWith(p));
// what never goes to a watcher: the suite's own keys, Crates' run link (watching must not join their run), Firebase's
const WATCH_SKIP = /^(suite:|crates:run|crates:updated|firebase:)/;
const MIRROR_MAX = 300000;                        // a key larger than this (a long history) isn't mirrored
async function mirror() {
  const code = duoCode();
  if (!code || WATCHING || !pageGame()) return;            // home has no game to show
  const game = pageGame(), keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!gamesKey(game, k) || WATCH_SKIP.test(k)) continue;
    const v = raw.get(k);
    if (v != null && v.length <= MIRROR_MAX) keys[enc(k)] = v;
  }
  try { await (await getSync()).update(`crates/rooms/${code}/watch`, { [playerId()]: { name: raw.get("crates:name") || "", game: pageGame(), at: Date.now(), keys } }); }
  catch (e) { console.error(e); }
}
/**
 * Watching, without reloads you can see. The watching page doesn't run the game itself: it holds it (this module never
 * finishes loading there) and shows the game in a frame, the same page with &frame, which reads your partner's copy
 * instead of yours. When they move, a new frame loads behind the one on show and takes its place once drawn, so the
 * view changes in place, at most every MIN_SWAP; the frames take no taps, and a bar says who you're watching, with Stop.
 */
const MIN_SWAP = 1200;
/** A frame of the watching view: it draws a copy and connects to nothing (no presence, no partner line, no bests). */
export const IN_FRAME = FRAME;
/** Inside a frame: every read of this game's keys returns the copy the watching page holds (the frame's parent). */
function readCopy() {
  const copy = window.parent !== window ? window.parent.__watchCopy : null;
  if (!copy) return;
  watched = copy;
  const game = pageGame();
  Storage.prototype.getItem = function (k) {
    if (this === localStorage && watched) { if (watched.keys.has(k)) return watched.keys.get(k); if (gamesKey(game, k) || WATCH_SKIP.test(k)) return null; }
    return raw.getItem.call(this, k);
  };
  // a frame is redrawn every time your partner moves: it stays silent (Parley speaks each card as it shows it)
  try { speechSynthesis.speak = () => {}; } catch { /* no speech here */ }
}
/** The watching page: your partner's game in frames that swap in place as they move. Never returns (the game itself stays held). */
async function watchInFrames() {
  const code = duoCode();
  const shell = document.createElement("div");
  shell.className = "watch-shell";
  shell.innerHTML = `<div class="watch-frames"></div><div class="watch-bar"><span>Watching <b></b></span><button class="btn" type="button">Stop</button></div>`;
  shell.querySelector("button").addEventListener("click", () => { const u = new URL(location.href); u.searchParams.delete("watch"); location.href = u.toString(); });
  // this page is drawn once the shell is in: pwa.js, which says so (html.ready) and takes the loading mark down, waits behind
  // this module, which never finishes loading here, so the mark would stay over the watching view
  const place = () => { document.body.appendChild(shell); document.documentElement.classList.add("ready"); };
  if (document.body) place(); else document.addEventListener("DOMContentLoaded", place);
  const frames = shell.querySelector(".watch-frames"), who = shell.querySelector("b");
  if (!code) { who.textContent = "nobody: link with a partner first"; return new Promise(() => {}); }
  const sync = await getSync(), me = playerId();
  let theirName = "";
  if ((await import("./coop-games.js")).isCoop(pageGame())) {      // a game two can share: Request to join, in the bar
    import("./coop-ui.js").then(m => {
      const join = m.watchJoin({ bar: shell.querySelector(".watch-bar"), sync, pair: code, me, game: pageGame(), name: () => raw.get("crates:name") || "Your partner", who: () => theirName,
        go: (href, at) => { put(FOLLOWED, String(at)); location.href = href; } });
      watchPartner(p => join.partner(p));
    }).catch(e => console.error(e));
  }
  let shownAt = null, busy = false, pending = false, last = 0;
  const swap = () => {
    if (busy) { pending = true; return; }
    busy = true; pending = false;
    const wait = Math.max(0, last + MIN_SWAP - Date.now());
    setTimeout(() => {
      const f = document.createElement("iframe");
      f.className = "watch-frame next";
      f.title = "Your partner's game";
      const u = new URL(location.href); u.searchParams.set("frame", "1"); u.hash = "";
      f.src = u.toString();
      f.addEventListener("load", () => setTimeout(() => {    // drawn: it takes the old one's place
        for (const old of frames.querySelectorAll(".watch-frame:not(.next)")) old.remove();
        f.classList.remove("next");
        last = Date.now(); busy = false;
        if (pending) swap();
      }, 350));
      frames.appendChild(f);
    }, wait);
  };
  sync.watch(`crates/rooms/${code}/watch`, all => {
    const theirs = Object.entries(all || {}).filter(([id, w]) => id !== me && w?.game === pageGame()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0];
    if (!theirs) { who.textContent = "your partner (not in this game now)"; return; }
    const [, w] = theirs;
    who.textContent = theirName = w.name || "your partner";
    if (w.at === shownAt) return;
    shownAt = w.at;
    window.__watchCopy = { name: w.name, game: w.game, at: w.at, keys: new Map(Object.entries(w.keys || {}).map(([k, v]) => [decodeURIComponent(k), v])) };
    swap();
  });
  return new Promise(() => {});                                // the game itself never starts on this page
}
/**
 * The link to this page that carries your codes: solo carries both (another of your devices opening it follows your
 * games and your partner), duo only the partner code (your partner opening it links with you).
 */
export function codesLink(kind) {
  const u = new URL(location.href);
  u.hash = "";
  for (const k of ["room", "new", "watch", "solo", "duo"]) u.searchParams.delete(k);
  if (kind === "solo" && soloCode()) u.searchParams.set("solo", soloCode());
  if (duoCode()) u.searchParams.set("duo", duoCode());
  return u.toString();
}
export const watchHref = game => (TRUMPS_TILES[game] ? `trumps.html?game=${game}&watch=1` : `${DUO_GAMES[game] || `${game}.html`}?watch=1`);

// a link with codes in it (?solo=, ?duo=): take them on, then go on without them in the address
{
  const q = new URLSearchParams(location.search), solo = cleanCode(q.get("solo")), duo = cleanCode(q.get("duo"));
  if (duo.length === 4 && duo !== duoCode()) link(duo);
  if (solo.length === 8 || duo.length === 4) {
    const u = new URL(location.href);
    u.searchParams.delete("solo"); u.searchParams.delete("duo");
    history.replaceState(null, "", u);
    if (solo.length === 8 && solo !== soloCode()) { await chooseSolo(solo); location.reload(); }
  }
}
// Origin and Order (and Arb, retired since) once counted their days on the phone's own clock (days since 1970), so their dailies were kept
// by a day the games screen never asked for. They go by the suite's day now; what they kept moves over once, by its date
// (days.js): today's run stays today's. Here, after everything a synced write touches is declared: earlier in the
// module, a partner code made the write throw and every page with it.
if (!WATCHING) for (const k of ["origin:daily", "order:daily"]) { const moved = movedToDates(json(k, null)); if (moved) keep(k, moved); }
// a page that opens catches up, and again when it comes back into view; a paired page says where it is and listens
{
  const old = raw.get("suite:duo");                       // the per-device duo memory before pairing became a link
  if (old && !raw.get(PAIR)) put(PAIR, old);
  if (old) raw.remove.call(localStorage, "suite:duo");
  if (duoCode() && !FRAME) { playerId(); present().catch(e => console.error(e)); if (!WATCHING) listen().catch(e => console.error(e)); }
  if (duoCode() && !WATCHING && !roomInAddress()) setTimeout(mirror, 800);   // your partner can watch from the moment you open a game
  if (syncing() && !WATCHING) {
    pull();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); else push(); });
  }
}
if (FRAME) readCopy();
else if (WATCHING) { try { await watchInFrames(); } catch (e) { console.error(e); } }

// Trumps became three tiles (Jass, Belote, Schafkopf): the one streak and the one record that covered them all go to the
// game played last, and each tile counts from there under trumps:<tile>:. Done on every page, so the games screen shows it.
(function moveTrumpsFigures() {
  if (WATCHING) return;
  try {
    const olds = ["streak", "record"].filter(n => raw.get(`trumps:${n}`) != null);
    if (!olds.length) return;
    const tile = tileOf(json("trumps:game", null)?.state?.game || json("trumps:opts", null)?.game) || "jass";
    for (const n of olds) {
      if (raw.get(`trumps:${tile}:${n}`) == null) localStorage.setItem(`trumps:${tile}:${n}`, raw.get(`trumps:${n}`));
      localStorage.removeItem(`trumps:${n}`);
    }
  } catch { /* private mode */ }
})();
