// Mahjong: Hong Kong mahjong at a table of four, you and three computer players (or you, your partner and two of them).
// The rules are hong-engine.js's, the players hong-bot.js's (they think in hong-worker.js, off this thread); this file
// lays the table, takes your tiles and calls, runs the players at a pace you can follow, keeps the score over a game of
// one, two or four rounds of wind, and coaches: what the computer would do in your seat and why, or only where your move
// parted from its, by how many points and why; and after each hand, where your play and its parted.
import * as E from "./hong-engine.js";
import { routeName, shantenWords, differ, differWords, decide, explainMove } from "./hong-bot.js";
import { installTiles, tileSvg, SLAB_H, TILE_W } from "./hong-tiles.js";
import { createTable3d } from "./hong-3d.js";
import { bindSwitcher, APPS } from "./apps.js";
import { createTogether, seatsOf, seatOfSlot, peopleSeats, runsElsewhere } from "./together.js";
import { GAMES, roomInAddress, joiningWords } from "./rooms.js";
import "./pwa.js";
import { part, choice, toggle, action, line, onPause, isPaused } from "./menu.js";
import { ramp } from "./ramp.js";
import { roundOver } from "./random.js";
import { IN_FRAME, today } from "./suite.js";
import { wants3D, onDefaultChange } from "./mode3d.js";
import { MODES, modeOf, clockText, strikeMarks, clockFor, runDown, graceAgain, timeUp, noteRun, bestsLine, endTitle } from "./rush-core.js";
import { rushMenu } from "./rush-menu.js";
import { busy } from "./loading.js";
import { SIDEWAYS, sideways } from "./wide.js";
import { createCourse, progressOf } from "./course.js";
import { COURSE } from "./hong-lessons.js";
import { tileStage } from "./hong-course.js";

const $ = id => document.getElementById(id);
const RUN = "hong:run", OPTS = "hong:opts", STATS = "hong:stats", BEST = "hong:best", BEST_NOFAN = "hong:bestNoFan";
const COACH = ["off", "hints", "check", "on"];                  // the coach's ways: see coachOn
const APP = 1;                                                   // this code's version of the together state
const BOTS = ["Mei", "Wing", "Lok"];
const PACE = { quick: 380, steady: 750, slow: 1300 };            // a computer player's turn, in ms
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const clone = x => JSON.parse(JSON.stringify(x));

// ---------- state ----------
// G: the hand in play (the engine's state). S: the game around it: { seed, firstDealer, names, humans, results }.
// R: the coach's notes on your decisions this hand, for the review at its end.
let G = null, S = null, R = [];
let opts = { flowers: true, minFan: 3, rounds: 1, scoring: "fan", coach: "on", pace: "steady", numbers: true, bots: "hard", full: false, ...read(OPTS, {}) };
// Korbi, 4 November 2026: the menu is the minimum it needs to be. Classic rules (fan, flowers, 3 fan, the East round), a
// steady pace, numbered tiles, one row, no full screen: whatever an older save chose. A game in hand keeps its own rules
// (G.opts, in the run). The computer's strength is the hidden ramp (below); the old saved choice is its first step.
const OLD_BOTS = opts.bots;
Object.assign(opts, { flowers: true, minFan: 3, rounds: 1, scoring: "fan", pace: "steady", numbers: true, rows: "one", full: false });
const VIEWS = [["flat", "Table"], ["3d", "3D"]];                   // the table drawn flat (hong.js) or seen at an angle (hong-3d.js)
// opts.view is kept only when the player chose (else the suite's default, mode3d.js); "table" was the old default written into every save
if (!VIEWS.some(([k]) => k === opts.view)) delete opts.view;
// the coach was on or off (with Hint) until October 2026, and "differ" for a day: kept as the way it means now
const coachWas = opts.coach;
opts.coach = coachWas === true ? "on" : coachWas === false ? "hints" : coachWas === "differ" ? "check" : COACH.includes(coachWas) ? coachWas : "on";
if (opts.coach !== coachWas && !IN_FRAME) write(OPTS, opts);
let me = 0;                                                      // your seat
let picked = null;                                               // the tile you've lifted to discard
let advice = null;                                               // { key, decision }: the coach's view of your decision now
const isHuman = seat => !!S?.humans?.includes(seat);
const nameOf = seat => S?.names?.[seat] || BOTS[seat % 3];
const windName = seat => E.WIND_NAMES[E.windOf(G, seat)];
const windGlyph = seat => E.WINDS[E.windOf(G, seat)];
const keyNow = () => (G ? `${G.hand}:${G.log.length}:${G.phase}` : "");
/** A phone held sideways (hong.css's last query): the table takes the screen, your tiles lie along its edge. */
const low = () => matchMedia(`${SIDEWAYS} and (max-height: 500px)`).matches;
/** The view chosen in the menu: the table drawn flat (#board, below) or seen at an angle (#board3d, hong-3d.js). The tiles
 *  in your hand, your seat's line, the coach and the buttons are the same elements in both, drawn here. */
const in3d = () => wants3D(opts.view, "3d") && !!table3d;
const viewNow = () => (wants3D(opts.view, "3d") ? "3d" : "flat");
let table3d = null;
/** The ratio of a tile in your hand's height to its width: the 3D view's slabs are thicker (hong-tiles.js). */
const tileRatio = () => (in3d() ? SLAB_H / TILE_W : 4 / 3);

// ---------- the computer players, in a worker ----------
let worker = null, asked = 0, local = null;
const answers = new Map();
function startWorker() {
  if (worker !== null) return;
  try {
    worker = new Worker(new URL("./hong-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = e => { const done = answers.get(e.data.id); answers.delete(e.data.id); done?.(e.data); };
    worker.onerror = () => { worker = false; for (const done of answers.values()) done({ decision: null }); answers.clear(); };
  } catch { worker = false; }
}
/** How strong the computer players are: the room's setting at a table together, so both devices play the same. */
const strength = () => ramp("hong", ["medium", "hard"], { start: OLD_BOTS });
const skill = () => ((together.room ? S?.bots : strength()) === "medium" ? "medium" : "hard");
/** What the computer would do in a seat now: { action, why, rows, threats }. A computer player plays at the strength
 *  chosen; the coach, in your seat, is always hard's, and gives the same answer every time it's asked. */
const think = (state, seat) => ask(state, seat, { how: isHuman(seat) ? { skill: "hard", noise: false } : { skill: skill(), seed: seat + 1 } });
/** The coach's choice set against a move of yours, in words (a puzzle's verdict): hong-bot.js's explainMove. */
const explain = (state, seat, action) => ask(state, seat, { kind: "explain", action });
async function ask(state, seat, extra) {
  startWorker();
  let reply = null;
  if (worker) reply = await new Promise(res => { const id = ++asked; answers.set(id, res); worker.postMessage({ id, state, seat, ...extra }); });
  if (reply?.decision) return reply.decision;
  // no worker (or it failed): think here
  local ||= await import("./hong-bot.js");
  return extra.kind === "explain" ? local.explainMove(state, seat, extra.action) : local.decide(state, seat, extra.how);
}

// ---------- the game: a hand, then the next, to the end of its rounds ----------
function newGame() {
  const seed = (Math.random() * 2 ** 32) >>> 0, firstDealer = Math.floor(Math.random() * 4);
  me = 0;
  S = { v: 1, seed, firstDealer, names: ["You", ...BOTS], humans: [0], results: [], started: Date.now() };
  G = E.deal({ seed, dealer: firstDealer, round: 0, hand: 0, opts: { flowers: opts.flowers, minFan: opts.minFan, rounds: opts.rounds, scoring: opts.scoring } });
  R = [];
  write(GAME_WORDS, []);
  closeDialogs();
  afterChange();
}
function nextHand() {
  if (!G || G.phase !== "over") return;
  if (together.room) { nextTogether(); return; }
  const cfg = E.nextHand(G, { seed: S.seed, firstDealer: S.firstDealer });
  $("resultDlg").close();
  if (!cfg) { newGame(); return; }
  keepHand();
  G = E.deal(cfg);
  afterChange();
}
const gameOver = () => G?.phase === "over" && !E.nextHand(G, { seed: S.seed, firstDealer: S.firstDealer });
function save() {
  if (together.room || IN_FRAME) return;
  if (rush) write(RUSH, rush);                                    // a puzzle's table is the bank's: the game waits as it was
  else write(RUN, { G, S, R });
}

// ---------- the turn: who's to move, and moving them ----------
let timer = null, busyWith = null, gen = 0;
const paused = () => !together.room && isPaused();
function kick(ms = 0) { clearTimeout(timer); timer = setTimeout(step, ms); }
/** After any change: draw it, save it, and set the next move going. */
function afterChange() {
  gen++;
  picked = null;
  save();
  render();
  kick(0);
}
function step() {
  timer = null;
  if (!G || IN_FRAME) return;
  if (rush) { render(); return; }                                // a puzzle: nobody else moves
  if (G.phase === "over") { handOver(); return; }
  // a seat with nothing it could do but pass passes at once (the engine leaves them while a win is pending)
  for (const s of E.waitingOn(G)) {
    const l = E.legal(G, s);
    if (l.length === 1 && l[0].t === "pass" && G.phase !== "act") { apply(s, l[0]); return; }
  }
  const waiting = E.waitingOn(G);
  askCoach();
  const bot = waiting.find(s => !isHuman(s));
  if (bot === undefined || busyWith !== null || paused()) { render(); return; }
  const g0 = gen, snap = clone(G), slow = G.phase === "act" ? PACE[opts.pace] || PACE.steady : (PACE[opts.pace] || PACE.steady) * 0.45;
  busyWith = bot;
  render();
  sleep(backup() ? BACKUP_MS : 0)
    .then(() => (g0 !== gen ? [null] : Promise.all([think(snap, bot), sleep(slow)])))
    .then(([d]) => {
      busyWith = null;
      if (g0 !== gen || !G || paused()) { render(); kick(0); return; }
      if (!d?.action) { console.error("no decision", d); render(); return; }
      apply(bot, d.action);
    }).catch(e => { busyWith = null; console.error(e); toast("A computer player stumbled; tap to carry on"); render(); });
}
/** A move: a seat's action applied (in a room, as one transaction on the room's copy). */
function apply(seat, act) {
  if (together.room) { applyTogether(seat, act); return; }
  try { E.act(G, seat, act); }
  catch (e) { console.error(e); toast("That move isn't allowed now"); render(); return; }
  afterChange();
}
/** Your move: noted against the coach's (for the review), then made. */
function mine(act) {
  if (!G) return;
  const seat = me;
  if (!E.legal(G, seat).some(a => a.t === act.t && (a.k ?? null) === (act.k ?? null) && (a.how ?? null) === (act.how ?? null))) { toast("That move isn't allowed now"); return; }
  if (rush) { rushAnswer(act); return; }
  note(act);
  picked = null;
  apply(seat, act);
}

// ---------- the coach ----------
function askCoach() {
  const key = keyNow(), seat = me;
  if (advice?.key === key || !G || !E.waitingOn(G).includes(seat) || E.legal(G, seat).length <= 1) return;
  advice = { key, decision: null };
  const snap = clone(G);
  think(snap, seat).then(d => {
    if (advice?.key !== key) return;
    advice.decision = d;
    render();
  });
}
/**
 * Your decision beside the coach's, for the hand's review and the coach's word on it: what it would have done, and
 * where it would have done otherwise, how many points worse it values yours and why (hong-bot.js's explainMove and
 * differ). The words are kept in the note, so they're there after a reload; the coach's reckoning, for Why?, isn't.
 */
const reckoned = new WeakMap();                                  // a note → the coach's answer it came from
const shots = new WeakMap();                                     // a note → the table as you decided at it (until a reload)
/** The coach's verdict on a move from its reckoning: { coach, best, why, gap, against } (coach: its move, or yours where
 *  it values yours within a tenth of a point of its own; best: its own pick either way; gap and against where it
 *  differs). */
function verdict(j, act) {
  const o = differ(j, act);
  return { coach: o?.coach || act, best: j.decision.action, why: j.decision.why, ...(o ? { gap: o.gap, against: o.against, unit: o.unit } : {}) };
}
/** A decision of yours, noted with the coach's (kept with the coach off too, silent, for Copy game): your tiles then,
 *  the tile drawn or the discard answered, and where in the hand's log it fell. */
function note(act) {
  const snap = clone(G), notes = R;
  const entry = { wall: E.wallLeft(G), phase: G.phase, mine: act, coach: null, why: "", gap: null, against: [], at: G.log.length,
    hand: G.seats[me].hand.slice(), drawn: G.phase === "act" ? G.drawn : null, last: G.phase === "act" ? null : { seat: G.last.seat, k: G.last.k } };
  R.push(entry);
  shots.set(entry, snap);
  explain(clone(snap), me, act).then(j => {
    if (!j || notes !== R) return;                               // a new hand since
    Object.assign(entry, verdict(j, act));
    reckoned.set(entry, j);
    save(); render();
  }).catch(e => console.error(e));
}
const sameAct = (a, b) => !!a && !!b && a.t === b.t && (a.k ?? null) === (b.k ?? null);
/** A noted decision the coach would have made otherwise. */
const differed = e => !!e?.coach && !sameAct(e.mine, e.coach);
const pts = x => (Math.abs(x) >= 10 ? `${Math.round(x)}` : x.toFixed(1)).replace("-", "−");

// ---------- the table ----------
// The cloth is one SVG drawn in its own units, a unit as many pixels as fit (k): a discard 18 by 24, a set's tile 15 by
// 20, a flower 9.5 by 12.7. Of the ways to lay the table out (how many discards to a row in the middle and at the
// sides) the box gets the one that draws the tiles largest, no larger than your own (nor than 2.4rem a discard, on a
// tablet). Every river has its room from the start, 24 discards (the most on the table in 1,800 of the computer
// players' hands), and every player's sets theirs, so the tiles keep their size through a hand.
const RW = 18, RH = 24, MW = 15, MH = 20, FW = 9.5, FH = 12.7;
const PX = RW + 1, PY = RH + 1, RIVER = 24;
const SET_ROW = MH + 2;                                          // a row of sets, and the room under it
const use = (k, x, y, w, h, cls = "") => `<use href="#hk-${k < 0 ? "back" : k}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${+w.toFixed(2)}" height="${+h.toFixed(2)}"${cls ? ` class="${cls}"` : ""}/>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A meld's tiles as they lie: a concealed kong with its ends turned down. */
const meldTiles = m => (m.t === "chow" ? [m.k, m.k + 1, m.k + 2] : m.t === "kong" ? (m.open || m.added ? [m.k, m.k, m.k, m.k] : [-1, m.k, m.k, -1]) : [m.k, m.k, m.k]);
/** A seat's discards still on the table (a claimed one went to the claimer's set), the latest marked. */
function riverOf(seat) {
  const r = G.seats[seat].river, lastAt = G.last && G.last.seat === seat && G.last.e === "discard" ? r.length - 1 : -1;
  return r.map((d, i) => ({ k: d.k, last: i === lastAt && d.by === undefined, by: d.by })).filter(d => d.by === undefined);
}
/** A seat's discards, each where `at(i)` puts it, the latest ringed. */
function lay(seat, at) {
  return riverOf(seat).map((d, i) => {
    const { x, y } = at(i);
    return use(d.k, x, y, RW, RH) + (d.last ? `<rect class="hk-last-ring" x="${(x - 1).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="${RW + 2}" height="${RH + 2}" rx="3"/>` : "");
  }).join("");
}
/** Rows of a river: room for 24 discards, or for the longest on the table if one ever runs past that. */
const rowsFor = per => Math.ceil(Math.max(RIVER, ...[0, 1, 2, 3].map(s => riverOf(s).length)) / per);

// A label's words are measured, in the drawing's units (its fonts are sized in them), to take one line or two.
let ruler = null, rulerFont = "";
function textW(s, font) {
  ruler ??= document.createElement("canvas").getContext("2d");
  const f = `${font} ${rulerFont}`;
  if (ruler.font !== f) ruler.font = f;
  return ruler.measureText(s).width * 1.05;                       // a little over: a web font may not be in yet
}
const turnNow = () => (G.phase === "act" ? G.turn : -1);
/**
 * A player's label in a width: their wind (the dealer's in jade), name and score, and how many tiles they hold (a figure
 * and a tile's back); on one line, or where that's too wide on two or three (the count, or the score, under the name).
 * It's measured with a four-figure score, so it keeps its lines as the score grows and the table keeps its size (past
 * that it's drawn a little smaller, within its width). ts shrinks it on a big screen. { w, h } without x and y; with
 * them, its svg too.
 */
function label(seat, width, ts, x = null, y = 0, centre = false) {
  const name = nameOf(seat), score = signed(G.scores[seat]), CW = 19, nw = textW(name, "700 10.5px");
  const ways = scoreW => [19 + nw + 5 + scoreW + 6 + CW, Math.max(19 + nw + 5 + scoreW, 19 + CW), Math.max(19 + nw + 6 + CW, 19 + scoreW), Math.max(19 + nw, 19 + scoreW, 19 + CW)];
  const kept = ways(textW("−888", "600 10.5px"));
  const way = Math.max(0, kept.findIndex((v, i) => v * ts <= width || i === kept.length - 1));
  const w = kept[way] * ts, h = [15, 27, 27, 39][way] * ts;
  if (x === null) return { w, h };
  const dealer = E.windOf(G, seat) === 0, thinking = busyWith === seat, on = seat === turnNow() || thinking;
  const sw = textW(score, "600 10.5px"), real = ways(sw)[way] * ts, z = ts * Math.min(1, Math.max(w, width) / real);
  const x0 = centre ? x + (width - real * z / ts) / 2 : x;
  // how many held: a figure ending 11 units into its slot, a tile's back after it
  const count = (cx, base) => `<text class="hk-count" x="${(cx + 11).toFixed(1)}" y="${base}">${thinking ? "…" : G.seats[seat].hand.length}</text>`
    + `<use href="#hk-back" x="${(cx + 12.5).toFixed(1)}" y="${(base - 8.2).toFixed(1)}" width="6.5" height="8.7"/>`;
  let svg = `<g class="hk-label${on ? " on" : ""}${thinking ? " thinking" : ""}" transform="translate(${x0.toFixed(1)} ${y.toFixed(1)})${z < 1 ? ` scale(${z.toFixed(3)})` : ""}">`;
  svg += `<rect class="hk-badge${dealer ? " dealer" : ""}" x="0" y="0" width="15" height="15" rx="2.5"/><text class="hk-badge-t" x="7.5" y="11.6">${windGlyph(seat)}</text>`;
  const scored = `<tspan class="hk-score" dx="5">${score}</tspan>`, under = (base, t) => `<text class="hk-name hk-score" x="19" y="${base}">${t}</text>`;
  if (way === 0) svg += `<text class="hk-name" x="19" y="11.2">${esc(name)}${scored}</text>${count(19 + nw + 5 + sw + 6, 11.2)}`;
  else if (way === 1) svg += `<text class="hk-name" x="19" y="11.2">${esc(name)}${scored}</text>${count(19, 24.4)}`;
  else if (way === 2) svg += `<text class="hk-name" x="19" y="11.2">${esc(name)}</text>${count(19 + nw + 6, 11.2)}${under(24.4, score)}`;
  else svg += `<text class="hk-name" x="19" y="11.2">${esc(name)}</text>${under(24.4, score)}${count(19, 37.6)}`;
  return { w, h, svg: `${svg}</g>` };
}
/** A player's flowers and sets in rows within a width, flowers first: at full size, or smaller where they need more
 *  rows than the height kept for them (a fourth set in a narrow column): { svg, w, h }. */
function setsIn(seat, x, y, width, height, align = "start") {
  const s = G.seats[seat], groups = [];
  for (let i = 0; i < s.flowers.length; i += 4) groups.push(s.flowers.slice(i, i + 4).map(k => ({ k, flower: true })));
  for (const m of s.melds) groups.push(meldTiles(m).map(k => ({ k })));
  if (!groups.length) return { svg: "", w: 0, h: 0 };
  let f;
  for (const z of [1, 0.9, 0.8, 0.72, 0.64, 0.56]) {
    f = flowSets(groups, width, z);
    if (f.h <= height + 0.5) break;
  }
  // a group wider than the column (a kong in a column three discards wide) reaches into the gap, never off the cloth
  const x0 = align === "centre" ? x + (width - f.w) / 2 : align === "end" ? x + Math.min(0, width - f.w) : x;
  return { svg: f.tiles.map(t => use(t.k, x0 + t.x, y + t.y, t.w, t.h, t.flower ? "hk-flower" : "")).join(""), w: f.w, h: f.h };
}
/** Groups of tiles flowing left to right in rows of a width at scale z, each group kept whole, flowers on the line. */
function flowSets(groups, width, z) {
  const tiles = [];
  let x = 0, y = 0, most = 0;
  for (const g of groups) {
    const ws = g.map(t => (t.flower ? FW : MW) * z), gw = ws.reduce((a, b) => a + b, 0);
    if (x > 0 && x + gw > width + 2) { x = 0; y += SET_ROW * z; }        // two units over may reach into the gap
    g.forEach((t, i) => { const h = (t.flower ? FH : MH) * z; tiles.push({ k: t.k, x, y: y + MH * z - h, w: ws[i], h, flower: t.flower }); x += ws[i]; });
    most = Math.max(most, x);
    x += 3 * z;
  }
  return { tiles, w: most, h: y + MH * z };
}
/** The width of three sets and two flowers: what the player across is kept in his row. */
const keepW = () => 9 * MW + 6 + (G.opts.flowers ? 2 * FW + 3 : 0);
/** The round's dial: its wind with the wall's count under it, an arc on its rim toward whoever is to move, and,
 *  upright, the round and the hand under it. */
function dialAt(cx, cy, r, caption, ts) {
  const right = (me + 1) % 4, top = (me + 2) % 4, left = (me + 3) % 4;
  const at = G.phase === "act" ? G.turn : busyWith ?? -1;
  let out = `<g class="hk-dial"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  if (at >= 0) {
    const a = { [me]: 90, [right]: 0, [top]: -90, [left]: 180 }[at] * Math.PI / 180, R = r - 1;
    const p = t => `${(cx + Math.cos(t) * R).toFixed(1)} ${(cy + Math.sin(t) * R).toFixed(1)}`;
    out += `<path class="hk-turn" d="M${p(a - 0.62)}A${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${p(a + 0.62)}"/>`;
  }
  out += `<text class="hk-dial-wind" x="${cx.toFixed(1)}" y="${(cy + r * 0.16).toFixed(1)}" style="font-size:${(r * 0.82).toFixed(1)}px">${E.WINDS[G.round]}</text>`;
  out += `<text class="hk-dial-t" x="${cx.toFixed(1)}" y="${(cy + r * 0.66).toFixed(1)}" style="font-size:${(r * 0.4).toFixed(1)}px">${E.wallLeft(G)}</text>`;
  if (caption) out += `<text class="hk-dial-t" x="${cx.toFixed(1)}" y="${(cy + r + 11 * ts).toFixed(1)}" style="font-size:${(9.5 * ts).toFixed(1)}px">${E.WIND_NAMES[G.round]} round · hand ${G.hand + 1}</text>`;
  return `${out}</g>`;
}
const CAPTION = 13;                                              // the round and the hand under the dial, upright

/**
 * Upright: the player across along the top, his label with his sets beside it (under it, where the row is too
 * narrow); the others in columns at the edges, each their label, their sets and their discards, c to a row (a set
 * called moves them down a row of sets); between, his discards at the top, m to a row, the dial, and yours at the
 * foot, near you. At scale k: { W, H } it needs, and draw(W, H) for the box's.
 */
function upright(m, c, k, clear) {
  const top = (me + 2) % 4, left = (me + 3) % 4, right = (me + 1) % 4;
  const E0 = 2, GAP = 10, mw = m * PX - 1, sw = c * PX - 1, rowsM = rowsFor(m), rowsC = rowsFor(c);
  const ts = Math.min(1, 1.6 / k);                               // words stop growing at 1.6 pixels a unit
  const W = 2 * E0 + 2 * sw + 2 * GAP + mw;
  // full screen: the header's buttons lie over the cloth's top right (clear, in pixels from the drawing's corner);
  // the player across keeps left of them, the column on the right starts under them
  const hx = clear ? clear.left / k - 4 : Infinity, hy = clear ? clear.bottom / k + 3 : 0;
  const bandRight = W => Math.min(W, hx) - E0;
  const lab = label(top, bandRight(W) - E0, ts);
  const beside = lab.w + 8 + keepW() <= bandRight(W) - E0;
  const bandH = beside ? Math.max(lab.h, MH) : lab.h + 4 + MH;
  const T = E0 + bandH + 6;
  // a side column's sets get two rows (four sets, two to a row) where the column is six discards wide, else three (one
  // to a row: a fourth set, rare, draws smaller)
  const keepSets = (c >= 6 ? 2 : 3) * SET_ROW;
  const labL = label(left, sw, ts), labR = label(right, sw, ts), rightY = Math.max(T, hy);
  const side = (y, l) => y + l.h + 4 + keepSets + rowsC * PY + E0;
  const dialMin = 2 * 15 + 8 + CAPTION * ts;
  const midTop = W => ((W + mw) / 2 > hx ? Math.max(T, hy) : T);   // the top river under the buttons too, if they reach it
  const H = Math.max(midTop(W) + 2 * rowsM * PY + dialMin + E0, side(T, labL), side(rightY, labR));
  return {
    W, H,
    draw(Wv, Hv) {
      const gap = GAP + Math.min((Wv - W) / 2, 2 * GAP), edge = (Wv - 2 * sw - 2 * gap - mw) / 2;
      let out = "";
      // the player across: his label and sets in a row, or his sets under his label, centred left of the buttons
      const br = bandRight(Wv), cw = Math.min(br - E0, beside ? lab.w + 8 + keepW() : Math.max(lab.w, keepW()));
      const x0 = clamp(Wv / 2 - cw / 2, E0, br - cw);
      if (beside) {
        out += label(top, lab.w + 1, ts, x0, E0 + (MH - lab.h) / 2).svg;
        out += setsIn(top, x0 + lab.w + 8, E0, br - x0 - lab.w - 8, MH).svg;
      } else {
        out += label(top, cw, ts, x0, E0, true).svg;
        const mid = x0 + cw / 2, half = Math.min(mid - E0, br - mid);
        out += setsIn(top, mid - half, E0 + lab.h + 4, 2 * half, MH, "centre").svg;
      }
      // the others in their columns: label, sets, discards in rows (the sets as small as it takes to leave the
      // discards their room)
      for (const [seat, x, y, l, align] of [[left, edge, T, labL, "start"], [right, Wv - edge - sw, rightY, labR, "end"]]) {
        out += label(seat, sw, ts, x, y).svg;
        const sy = y + l.h + 4, st = setsIn(seat, x, sy, sw, Hv - E0 - rowsC * PY - sy - 2, align);
        out += st.svg;
        const ry = sy + (st.h ? st.h + 4 : 0);
        out += lay(seat, i => ({ x: x + (i % c) * PX, y: ry + Math.floor(i / c) * PY }));
      }
      // the middle: his discards at the top, mine at the foot, the dial between
      const mx = (Wv - mw) / 2, ty = midTop(Wv), my = Hv - E0 - rowsM * PY + 1;
      out += lay(top, i => ({ x: mx + (i % m) * PX, y: ty + Math.floor(i / m) * PY }));
      out += lay(me, i => ({ x: mx + (i % m) * PX, y: my + Math.floor(i / m) * PY }));
      // the dial and its words under it, centred between the rivers
      const g0 = ty + rowsM * PY, room = my - g0 - CAPTION * ts;
      const r = clamp(Math.min((room - 8) / 2, 34 / k), 13, 22);
      out += dialAt(Wv / 2, g0 + room / 2, r, true, ts);
      return out;
    },
  };
}

/**
 * A phone on its side: the table as it lies. The rivers round the dial, yours below it and the one across above it in
 * rows of eight, the others' beside it in columns of four, each starting next to the dial and growing away from it.
 * The player across has the top row: his label left of his discards, his sets right of them; the others their own
 * edge under it, label over their discards and sets under them. The round and the hand are said in the console.
 */
function lying(k) {
  const top = (me + 2) % 4, left = (me + 3) % 4, right = (me + 1) % 4;
  const E0 = 3, GAP = 9, m = 8, mw = m * PX - 1, per = 4, sw = rowsFor(per) * PX - 1, bh = per * PY - 1;
  const rowsM = rowsFor(m), ts = Math.min(1, 1.6 / k);
  const W = 2 * E0 + 2 * sw + 2 * GAP + mw;
  const labT = label(top, sw + GAP - 8, ts), labL = label(left, sw, ts), labR = label(right, sw, ts);   // his label ends 8 short of his discards
  const keepSets = 2 * SET_ROW;                                  // four sets, two to a row
  const T = E0 + Math.max(labT.h, MH) + 6;                       // the top row's foot: the others start under it
  const H = Math.max(2 * E0 + 2 * rowsM * PY + 2 * 15 + 8, T + Math.max(labL.h, labR.h) + 4 + bh + 5 + keepSets + E0);
  return {
    W, H,
    draw(Wv, Hv) {
      const gap = GAP + Math.min((Wv - W) / 2, 3 * GAP), edge = (Wv - 2 * sw - 2 * gap - mw) / 2, cx = Wv / 2, pond = cx - mw / 2;
      let out = "";
      // the dial in the middle, the rivers round it
      const cy = Hv / 2, r = clamp(Math.min((Hv - 2 * E0 - 2 * rowsM * PY) / 2 - 4, 34 / k), 13, 22);
      out += lay(top, i => ({ x: pond + (i % m) * PX, y: cy - r - 4 - RH - Math.floor(i / m) * PY }));
      out += lay(me, i => ({ x: pond + (i % m) * PX, y: cy + r + 4 + Math.floor(i / m) * PY }));
      // the top row, the player across's: his label ending at his discards, his sets from their other end
      out += label(top, labT.w + 1, ts, pond - 8 - labT.w, E0 + Math.max(0, (MH - labT.h) / 2)).svg;
      out += setsIn(top, pond + mw + 8, E0, Wv - edge - (pond + mw + 8), MH).svg;
      // the others: their columns of four beside the dial, the first next to it; label over, sets under
      const lh = Math.max(labL.h, labR.h), ry = clamp(cy - bh / 2, T + lh + 4, Hv - E0 - keepSets - 5 - bh);
      for (const [seat, x, dir] of [[left, edge, -1], [right, Wv - edge - sw, 1]]) {
        out += label(seat, sw, ts, x, ry - 4 - lh).svg;
        const first = dir < 0 ? x + sw - RW : x;
        out += lay(seat, i => ({ x: first + dir * Math.floor(i / per) * PX, y: ry + (i % per) * PY }));
        const sy = ry + bh + 5;
        out += setsIn(seat, x, sy, sw, Hv - E0 - sy, dir < 0 ? "start" : "end").svg;
      }
      out += dialAt(cx, cy, r, false, ts);
      return out;
    },
  };
}

// The upright ways, the most like a real table's rows of six first: of those that draw the tiles within a twentieth of
// the largest, the first is taken.
const UPRIGHT = [[6, 6], [8, 6], [6, 4], [8, 4], [6, 3]];
/** Where the header's buttons lie over the drawing in full screen, in pixels from its top left: { left, bottom }. */
function headerOver(svg) {
  if (!opts.full) return null;
  const head = document.querySelector("header.top"), s = svg.getBoundingClientRect(), h = head?.getBoundingClientRect();
  if (!h || !s.width || h.left >= s.right || h.bottom <= s.top || h.top >= s.bottom) return null;
  return { left: h.left - s.left, bottom: h.bottom - s.top };
}
function drawTable() {
  const svg = $("board"), box = $("table");
  if (!G) { svg.innerHTML = ""; return; }
  // the drawing's own box: in full screen the section has a band and a frame
  const bw = svg.clientWidth || box.clientWidth || 380, bh = svg.clientHeight || box.clientHeight || 400;
  rulerFont = getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "sans-serif";
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const most = Math.min(handSize([]).tw, 2.4 * rem) / RW, clear = headerOver(svg);
  const ways = low() ? [k => lying(k)] : UPRIGHT.map(([m, c]) => k => upright(m, c, k, clear));
  // each way's scale: what it needs depends a little on the scale (its words stop growing; the header's buttons are a
  // size on screen), so it's worked out again until it settles
  const fits = ways.map(way => {
    let k = most;
    for (let i = 0; i < 4; i++) { const p = way(k); k = Math.min(most, bw / p.W, bh / p.H); }
    return { way, k };
  });
  const largest = Math.max(...fits.map(f => f.k));
  const { way, k } = fits.find(f => f.k >= largest * 0.95);
  const Wv = bw / k, Hv = bh / k;
  svg.setAttribute("viewBox", `0 0 ${Wv.toFixed(2)} ${Hv.toFixed(2)}`);
  svg.innerHTML = way(k).draw(Wv, Hv);
}

// ---------- your hand ----------
function drawMine() {
  const box = $("mine");
  if (!G) { box.replaceChildren(); return; }
  const s = G.seats[me];
  const myTurn = G.phase === "act" && G.turn === me;
  // on a phone on its side the dial has room only for the wind and the wall: the round and the hand are said here
  const round = low() ? ` · ${E.WIND_NAMES[G.round]} round, hand ${G.hand + 1}` : "";
  box.innerHTML = `<span class="hk-me${myTurn ? " on" : ""}"><b class="hk-wind${E.windOf(G, me) === 0 ? " dealer" : ""}">${windGlyph(me)}</b><span class="hk-me-name">${esc(nameOf(me))}</span><span class="hk-me-score">${signed(G.scores[me])}</span></span>`
    + `<span class="hk-me-flowers">${s.flowers.map(f => tileSvg(f, "hk-mini")).join("")}</span>`
    + (rush ? rushStatus() : `<span class="hk-me-rule">${E.noFan(G.opts) ? "No fan: any hand wins" : `${G.opts.minFan} fan to win`}${round}${s.passBlock ? " · passed a win: none off a discard till you draw" : ""}</span>`);
}
/** Upright, your tiles in a row (one), two rows filled down the columns (two: 1 3 5 / 2 4 6), or three with each
 *  suit, the winds and the dragons a section of its own (suits); held sideways, always in a row (Menu). */
const rowsOf = () => (sideways() ? "one" : opts.rows === "two" || opts.rows === "suits" ? opts.rows : "one");
/** Which section of the hand a tile goes in, by suit: characters, dots, bamboo, then the winds and the dragons. */
const section = k => (k < 27 ? Math.floor(k / 9) : k < 31 ? 3 : 4);
/**
 * Your tiles' size on screen, { tw, rows }: from what the hand holds between calls (13 less three a set, and room for
 * the one drawn), not from what it holds this moment (the row used to shrink a tenth as you drew and grow back as you
 * let a tile go). `melds`: the sets it's sized with (the table's tiles are kept no larger than a hand's without any).
 */
function handSize(melds = G.seats[me].melds) {
  const box = $("hand");
  const layout = rowsOf(), rows = layout === "two" ? 2 : layout === "suits" ? 3 : 1;
  const slots = 13 - 3 * melds.length, meldUnits = melds.reduce((n, m) => n + meldTiles(m).length * 0.74 + 0.3, 0);
  const units = rows === 1 ? slots + 1.35 + meldUnits + (melds.length ? 0.3 : 0)
    // in rows, the columns the most the hand can need, fixed for the layout so the tiles keep their size: two rows, seven
    // columns, the drawn tile's and the sets'; by suit, about eight and the gaps between sections
    : rows === 2 ? 9 : 10.5;
  const pad = getComputedStyle(box), room = (box.clientWidth || 360) - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // on a phone on its side the row lies on the table, which leaves room for it at its foot (--hk-reserve): on the
  // shortest phones a little smaller, so the table keeps its share of the height; in full screen the row has the whole
  // width under the console too, and takes a little more of the height
  const thick = 4 / 3 / tileRatio();                              // the 3D view's slabs are taller for their width: the heights below are for a flat tile
  const most = (opts.full ? Math.min(rem * 2.75, innerHeight * 0.112) : Math.min(rem * 2.3, innerHeight * 0.095)) * thick;
  // in rows, no more than about a quarter of the screen's height for them all, so the table keeps its share
  const tall = rows > 1 ? (innerHeight * 0.24 / rows) * 0.72 * thick : Infinity;
  return { tw: Math.max(18, Math.min(room / Math.max(units, 9.5), low() ? most : rem * 3.1, tall)), rows };
}
function drawHand() {
  const box = $("hand");
  if (!G) { box.replaceChildren(); return; }
  const s = G.seats[me], myTurn = G.phase === "act" && G.turn === me;
  const tiles = s.hand.slice();
  // the tile just drawn sits apart at the right
  let drawn = -1;
  if (myTurn && G.drawn !== null && tiles.includes(G.drawn)) { drawn = G.drawn; tiles.splice(tiles.lastIndexOf(drawn), 1); }
  // the coach's tile: in a puzzle, the best, once you've answered
  const rec = rush ? rushBest()?.k ?? null : coachOn() && advice?.key === keyNow() && advice.decision?.action?.t === "discard" ? advice.decision.action.k : null;
  const { tw, rows } = handSize(), rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  box.style.setProperty("--hk-t", `${tw.toFixed(1)}px`);
  box.style.setProperty("--rows", rows);
  box.classList.toggle("grid", rows > 1);
  if (low()) $("app").style.setProperty("--hk-reserve", `${(tw * tileRatio() + 1.25 * rem).toFixed(1)}px`);
  const btn = (k, extra = "") => {
    const cls = ["hk-tile"];
    if (picked === k && myTurn) cls.push("picked");
    if (rec === k && myTurn) cls.push("advised");
    return `<button type="button" class="${cls.join(" ")}${extra}" data-k="${k}" aria-label="${E.tileName(k)}"${myTurn ? "" : " tabindex=\"-1\""}>${tileSvg(k, "", in3d())}</button>`;
  };
  const meld = m => `<span class="hk-meld">${meldTiles(m).map(k => tileSvg(k, "", in3d())).join("")}</span>`;
  let html;
  if (rows === 1) {
    html = `<span class="hk-concealed${myTurn ? " live" : ""}">${tiles.map(k => btn(k)).join("")}`;
    if (drawn >= 0) html += btn(drawn, " drawn");
    html += "</span>";
  } else {
    // sections filled down their columns: the whole hand (two rows), or each suit, the winds, the dragons (by suit);
    // the drawn tile a section of its own at the right
    const groups = rows === 2 ? [tiles] : [0, 1, 2, 3, 4].map(g => tiles.filter(k => section(k) === g)).filter(g => g.length);
    html = `<span class="hk-concealed${myTurn ? " live" : ""}">${groups.map(g => `<span class="hk-grid">${g.map(k => btn(k)).join("")}</span>`).join("")}`;
    if (drawn >= 0) html += `<span class="hk-grid">${btn(drawn, " drawn")}</span>`;
    html += "</span>";
  }
  if (s.melds.length) html += `<span class="hk-melds">${s.melds.map(meld).join("")}</span>`;
  box.innerHTML = html;
}
// The coach: "off", silent; "hints", a Hint asks it about one decision; "check", a Hint too, and once you've moved, a
// word only where it would have done otherwise: what, how many points worse it values yours, and why; "on" (Always),
// what it would do at every decision, and the same word after a move it advised against; and, unless it's off, the
// hand's review at its end.
let hintFor = null;
const coachOn = () => opts.coach === "on" || hintFor === keyNow();
const checking = () => opts.coach === "check" || opts.coach === "on";
/** The coach's word on your last move it would have made otherwise, until a turn of yours it agrees with (a claim you
 *  pass on as it would doesn't end it: there may be one before you've read it). */
function lesson() {
  if (!checking() || rush) return null;
  for (let i = R.length - 1; i >= 0; i--) {
    if (differed(R[i])) return R[i];
    if (R[i].phase === "act" && R[i].coach) return null;
  }
  return null;
}

// ---------- what you can do now ----------
function drawActions() {
  const box = $("actions"), coach = $("coach");
  box.replaceChildren();
  coach.hidden = true;
  coach.classList.remove("rush");
  // a coach that speaks unasked keeps its room under your tiles, so the table doesn't change size as it speaks and falls quiet
  coach.classList.toggle("kept", checking() && !rush && G?.phase !== "over");
  if (!G) return;
  if (rush) { drawRush(box, coach); return; }
  if (G.phase === "over") {
    box.append(goBtn(gameOver() ? "The final score" : "Next hand", () => $("resultDlg").open ? null : showResult(), "primary"));
    return;
  }
  const waiting = E.waitingOn(G);
  const legal = waiting.includes(me) ? E.legal(G, me) : [];
  const d = advice?.key === keyNow() ? advice.decision : null;
  const last = lesson();
  if (legal.length && coachOn()) {
    coach.hidden = false;
    coach.innerHTML = d ? `<b>Coach</b> ${esc(d.why)} <button type="button" class="link hk-why-btn">Why?</button>` : `<b>Coach</b> <span class="hk-thinking">thinking…</span>`;
    coach.querySelector(".hk-why-btn")?.addEventListener("click", () => showWhy(d));
  } else if (last) {
    const j = reckoned.get(last);
    coach.hidden = false;
    coach.innerHTML = `<b class="hk-miss">Coach</b> ${esc(differWords(last.mine, last))}${j ? ' <button type="button" class="link hk-why-btn">Why?</button>' : ""}`;
    coach.querySelector(".hk-why-btn")?.addEventListener("click", () => showWhy(reasonsFor(j, last.mine), last.mine));
  } else if (coach.classList.contains("kept")) { coach.hidden = false; coach.replaceChildren(); }
  if (!legal.length) {
    const who = busyWith !== null ? busyWith : waiting.find(s => !isHuman(s) || s !== me);
    const p = document.createElement("p");
    p.className = "hk-wait";
    p.textContent = paused() ? "Paused" : who !== undefined && who !== null ? `${nameOf(who)} (${windName(who)}) to move…` : "";
    box.append(p);
    return;
  }
  moveButtons(box, legal);
  if (!coachOn() && opts.coach !== "off") box.append(goBtn("Hint", () => { hintFor = keyNow(); askCoach(); render(); }, "quiet"));
}
/** Your moves now as buttons: a win, flowers, kongs and the tile you've lifted; offered a discard, its calls. */
function moveButtons(box, legal) {
  if (G.phase === "act") {
    const win = legal.find(a => a.t === "win"), flowers = legal.find(a => a.t === "flowers");
    if (win) box.append(goBtn(`Win · ${win.fan} fan`, () => mine({ t: "win" }), "primary"));
    if (flowers) box.append(goBtn("Seven flowers: win", () => mine({ t: "flowers" }), "primary"));
    for (const k of legal.filter(a => a.t === "kong")) box.append(goBtn(`Kong ${E.tileName(k.k)}`, () => mine({ t: "kong", k: k.k, how: k.how }), ""));
    if (picked !== null) box.append(goBtn(`Discard ${E.tileName(picked)}`, () => mine({ t: "discard", k: picked }), win ? "" : "primary"));
    else if (!win && !flowers) { const p = document.createElement("p"); p.className = "hk-wait"; p.textContent = "Your turn: tap a tile to let it go"; box.append(p); }
    return;
  }
  // a discard (or a kong being added) you could claim
  box.append(claimHead());
  const win = legal.find(a => a.t === "win");
  if (win) box.append(goBtn(G.phase === "rob" ? `Rob it · ${win.fan} fan` : `Win · ${win.fan} fan`, () => mine({ t: "win" }), "primary"));
  for (const a of legal.filter(x => x.t === "kong")) box.append(goBtn("Kong", () => mine({ t: "kong", k: a.k, how: a.how }), ""));
  for (const a of legal.filter(x => x.t === "pung")) box.append(goBtn("Pung", () => mine({ t: "pung", k: a.k }), ""));
  for (const a of legal.filter(x => x.t === "chow")) {
    const b = goBtn("", () => mine({ t: "chow", k: a.k }), "chow");
    b.innerHTML = [a.k, a.k + 1, a.k + 2].map(x => tileSvg(x, "hk-mini")).join("");
    b.setAttribute("aria-label", `Chow ${E.tileName(a.k)} to ${E.tileName(a.k + 2)}`);
    box.append(b);
  }
  box.append(goBtn("Pass", () => mine({ t: "pass" }), "quiet"));
}
/** The discard on offer: who let it go, and the tile. */
function claimHead() {
  const head = document.createElement("p");
  head.className = "hk-claim";
  head.innerHTML = `${esc(nameOf(G.last.seat))} ${G.phase === "rob" ? "adds to a kong" : "lets go"} ${tileSvg(G.last.k, "hk-mini")}`;
  return head;
}
function goBtn(text, fn, kind = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `hk-go${kind ? ` ${kind}` : ""}`;
  b.textContent = text;
  b.addEventListener("click", fn);
  return b;
}
$("hand").addEventListener("click", e => {
  const b = e.target.closest(".hk-tile");
  if (!b || !G || G.phase !== "act" || G.turn !== me || rush?.answer || rush?.over) return;
  const k = Number(b.dataset.k);
  if (picked === k) { mine({ t: "discard", k }); return; }   // a second tap lets it go
  picked = k;
  render();
});

// ---------- the coach's reasons ----------
/** The coach's reasons: its choice and the others in words, the discards side by side, what the others look to be up
 *  to. `yours`: in a puzzle, the move you made, marked among them. */
function showWhy(d, yours = null) {
  if (!d) return;
  const body = $("whyBody");
  let html = `<p class="hk-why-lead">${esc(d.why)}</p>`;
  // the choices in words: the coach's first, each with what speaks for it (+) and against it (−)
  if (d.options?.length > 1) {
    const up = x => x.charAt(0).toUpperCase() + x.slice(1);
    html += `<ol class="hk-opts">${d.options.map((o, i) => {
      const pc = [...o.pros.map(x => `<li class="pro">${esc(up(x))}</li>`), ...o.cons.map(x => `<li class="con">${esc(up(x))}</li>`)].join("");
      const mineToo = yours && sameAct(o.action, yours);
      return `<li class="hk-opt${i === 0 ? " best" : ""}${mineToo && i ? " missed" : ""}"><b>${esc(o.title)}</b>${mineToo ? '<span class="hk-yours">yours</span>' : ""}${pc ? `<ul class="hk-pc">${pc}</ul>` : ""}</li>`;
    }).join("")}</ol>`;
  }
  if (d.rows?.length) {
    const rows = d.rows.slice(0, 7);
    if (yours?.t === "discard" && !rows.some(r => r.k === yours.k)) rows.push(...d.rows.filter(r => r.k === yours.k));
    html += `<table class="hk-cands"><thead><tr><th>Let go</th><th>Keeps</th><th>From ready</th><th>Tiles that help</th><th>Win</th><th>Danger</th>${yours ? "<th>Points</th>" : ""}</tr></thead><tbody>`;
    for (const r of rows) {
      const other = r.routes?.find(x => x.route !== r.route && x.ev > 0);
      const or = other ? `<small>or ${esc(routeName(other.route).replace(/^a /, ""))}, ${other.sh <= 0 ? "ready" : `${other.sh} away`}</small>` : "";
      const mineToo = yours && sameAct(yours, { t: "discard", k: r.k });
      html += `<tr${sameAct(d.action, { t: "discard", k: r.k }) ? ' class="best"' : ""}><td>${tileSvg(r.k, "hk-mini")}${mineToo ? "<small>yours</small>" : ""}</td><td>${esc(routeName(r.route).replace(/^a /, ""))}${or}</td><td>${r.sh <= 0 ? "ready" : r.sh}</td><td>${r.uk?.n ?? ""}</td><td>${Math.round((r.p || 0) * 100)}%</td><td>${E.noFan(G?.opts) ? (r.risk >= 0.05 ? r.risk.toFixed(1) : "—") : r.risk >= 0.5 ? r.risk.toFixed(0) : "—"}</td>${yours ? `<td>${pts(r.score)}</td>` : ""}</tr>`;
    }
    html += "</tbody></table>";
    html += `<p class="hk-note">Tiles that help: those still unseen (not in your hand, on the table or in a set) that would bring the hand a step nearer. Win: the chance this hand wins, from its live tiles, the draws left and how soon the others look to win. Danger: the points the tile is likely to cost, if someone ready can take it.${yours ? " Points: what the hand is worth after it on average (each win it could make, by what it pays and how likely it comes; a little more with a second way open), less the danger." : ""}</p>`;
  }
  if (d.threats?.length) html += `<h3 class="hk-sub">The others</h3><ul class="hk-threats">${d.threats.map(t => `<li><b>${esc(nameOf(t.seat))}</b> (${windName(t.seat)}): ${threatBits(t).join(", ")}.</li>`).join("")}</ul>`;
  body.innerHTML = html;
  $("whyDlg").showModal();
}

/** How the coach reads another player: their sets, the flush or pungs they look to be on, how likely they're ready. */
function threatBits(t) {
  const bits = [t.melds ? `${t.melds} set${t.melds === 1 ? "" : "s"} down` : "nothing called"];
  if (t.flushSuit >= 0) bits.push(`on a ${E.SUIT_NAMES[t.flushSuit]} flush, likely`);
  else if (t.pungish) bits.push("all pungs, likely");
  if (!t.canTake) bits.push("can't reach the minimum off a discard");
  else bits.push(`ready ${Math.round(t.ready * 100)}%${E.noFan(G?.opts) ? "" : `, about ${t.fanEst} fan`}`);
  return bits;
}

// ---------- the end of a hand ----------
let shownFor = null;
function handOver() {
  render();
  const id = `${S?.started}:${G.hand}`;
  if (shownFor === id) return;
  shownFor = id;
  record();
  setTimeout(() => { if (G?.phase === "over" && !$("resultDlg").open) showResult(); }, 650);
  roundOver("hong");
}
/** Your stats from a finished hand, and the game's best once it's over (solo only: a duo match is the pair's). */
function record() {
  if (together.room || IN_FRAME || !G?.result) return;
  const r = G.result;
  if (S.results.some(x => x.hand === G.hand)) return;
  S.results.push({ hand: G.hand, dealer: G.dealer, round: G.round, kind: r.kind, seat: r.seat ?? -1, how: r.how || "", fan: r.fan ?? 0, pay: r.pay });
  const st = read(STATS, { hands: 0, wins: 0, self: 0, dealIns: 0, bestFan: 0, games: 0, firsts: 0 });
  st.hands++;
  if (r.kind === "win" && r.seat === me) { st.wins++; if (r.how === "self") st.self++; st.bestFan = Math.max(st.bestFan, r.fan); }
  if (r.kind === "win" && r.from === me) st.dealIns++;
  if (gameOver()) {
    st.games++;
    const mineScore = G.scores[me];
    const first = G.scores.every((x, i) => i === me || x < mineScore);
    if (first) st.firsts++;
    if (!together.room) { strength(); first ? ramp.won(true) : ramp.lost(); }
    // no fan's wins pay a few points where fan's pay tens: its best is kept apart (the menu says it), the games screen's is fan's
    const key = E.noFan(G.opts) ? BEST_NOFAN : BEST, best = read(key, null);
    if (best == null || mineScore > best) write(key, mineScore);
  }
  write(STATS, st);
  save();
}
function showResult() {
  if (!G?.result) return;
  const r = G.result, over = gameOver();
  const head = $("resultHead"), body = $("resultBody");
  let html = "";
  if (r.kind === "win") {
    const who = r.seat === me ? "You win" : `${nameOf(r.seat)} wins`;
    const how = r.how === "self" ? "self-drawn" : r.how === "flowers" ? "on flowers" : r.how === "rob" ? `robbing ${nameOf(r.from)}'s kong` : `off ${r.from === me ? "your" : `${nameOf(r.from)}'s`} discard`;
    head.textContent = `${who}, ${how}`;
    const s = G.seats[r.seat];
    html += `<div class="hk-win-hand">${s.hand.map(k => tileSvg(k, k === r.tile ? "hk-won" : "")).join("")}${s.melds.length ? `<span class="hk-gap"></span>${s.melds.map(m => `<span class="hk-meld">${meldTiles(m).map(k => tileSvg(k)).join("")}</span>`).join("")}` : ""}${s.flowers.length ? `<span class="hk-gap"></span>${s.flowers.map(f => tileSvg(f, "hk-mini")).join("")}` : ""}</div>`;
    if (E.noFan(G.opts)) {
      // no fan: nothing counted; who paid what, the dealer's share doubled
      // the dealer is in every win: the winner, or one who pays (the discarder or not)
      const d = G.dealer, dealerIn = r.seat === d ? `${d === me ? "you deal" : `${esc(nameOf(d))} deals`}, so each pays double`
        : `${d === me ? "you deal, so pay" : `${esc(nameOf(d))} deals, so pays`} double`;
      const payer = r.how === "self" ? "each of the others pays 2" : `${r.from === me ? "you pay" : `${esc(nameOf(r.from))} pays`} 2, each of the others 1`;
      html += `<p class="hk-pay-line">No fan: ${payer}; ${dealerIn}.</p>`;
    } else {
      html += `<table class="hk-fan"><tbody>${r.items.map(i => `<tr><td class="zh">${esc(i.zh)}</td><td>${esc(i.en)}</td><td class="n">${i.fan}</td></tr>`).join("")}`;
      html += `<tr class="total"><td></td><td>${r.limit ? "A limit hand" : r.raw > r.fan ? `${r.raw} fan, capped at ${r.fan}` : "Fan"}</td><td class="n">${r.fan}</td></tr></tbody></table>`;
      const payer = r.liable >= 0 ? `${nameOf(r.liable)} pays it all (liable)` : r.how === "self" || r.how === "flowers" ? "each of the others pays 2 × base" : `${nameOf(r.from)} pays 4 × base`;
      html += `<p class="hk-pay-line">${r.fan} fan is ${r.base} base: ${payer}.</p>`;
    }
  } else {
    head.textContent = "A drawn hand: the wall ran dry";
    html += `<p class="hk-pay-line">No one won; ${G.dealer === me ? "you keep" : `${esc(nameOf(G.dealer))} keeps`} the deal.</p>`;
  }
  // paid within the hand (no fan): kongs, a point from each, and the dealer followed (跟莊), a point to each
  const paid = G.paid || [];
  if (paid.length) html += `<p class="hk-pay-line">${paid.map(e => (e.e === "follow" ? `The first four discards were all ${esc(E.tileName(e.k))}: ${e.seat === me ? "you" : esc(nameOf(e.seat))}, dealing, paid each of the others 1.` : `${e.seat === me ? "Your" : `${esc(nameOf(e.seat))}'s`} kong of ${esc(E.tileName(e.k))}: 1 from each of the others.`)).join(" ")}</p>`;
  const hand = [0, 1, 2, 3].map(i => r.pay[i] + paid.reduce((a, e) => a + e.pay[i], 0));
  html += `<table class="hk-scores"><tbody>${[0, 1, 2, 3].map(s => `<tr${s === me ? ' class="me"' : ""}><td>${E.WINDS[E.windOf(G, s)]}</td><td>${esc(nameOf(s))}</td><td class="n">${hand[s] ? signed(hand[s]) : ""}</td><td class="n tot">${signed(G.scores[s])}</td></tr>`).join("")}</tbody></table>`;
  html += review();
  if (over) {
    const order = [0, 1, 2, 3].sort((a, b) => G.scores[b] - G.scores[a]);
    const place = order.indexOf(me);
    html += `<p class="hk-final">${place === 0 ? "You finish first." : `You finish ${["first", "second", "third", "fourth"][place]}.`} The game is over.</p>`;
  }
  body.innerHTML = html;
  $("nextBtn").textContent = over ? "New game" : "Next hand";
  const dlg = $("resultDlg");
  dlg.showModal();
  dlg.scrollTop = 0;                                             // from the top: who won, before the review
  $("nextBtn").focus({ preventScroll: true });
}
/** The coach's review of your hand: how often it would have done as you did (or valued yours as well), and the costliest
 *  decisions where it wouldn't: what yours was worth against its move, why, and its move's reason. */
function review() {
  if (!R.length || opts.coach === "off") return "";
  const decided = R.filter(e => e.coach), differs = decided.filter(differed);
  const worst = differs.slice().sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 3);
  let html = `<h3 class="hk-sub">Your play</h3><p class="hk-review-lead">You and the coach agreed on ${decided.length - differs.length} of ${decided.length} decision${decided.length === 1 ? "" : "s"}${differs.length > worst.length ? `; the ${worst.length} that cost most:` : "."}</p>`;
  if (worst.length) {
    html += `<ul class="hk-review">`;
    for (const e of worst) html += `<li><span class="hk-when">${e.wall} in the wall</span> ${esc(differWords(e.mine, e))} <b>Coach:</b> ${esc(e.why)}</li>`;
    html += "</ul>";
  }
  return html;
}

// ---------- drawing ----------
// ---------- full screen ----------
/**
 * Full screen (Menu): the header's buttons go onto the table, over the cloth's top right (the cloth then the whole
 * section, the drawing keeping clear of them); on a phone held sideways the console lies on the cloth too, the buttons
 * at its top, and your tiles take the whole width under it, larger. Where the browser can, the page goes full screen as well (an app on the home
 * screen already is).
 */
function placeFull() {
  const app = $("app"), table = $("table"), top = document.querySelector("header.top"), on = !!opts.full;
  app.classList.toggle("ontable", on);   // the table-filling mode, the Full screen choice in the menu (not the shared frame, #app.full)
  if (on && top.parentElement !== table) table.append(top);
  else if (!on && top.parentElement !== app) app.prepend(top);
}
function fullScreen(on) {
  try {
    if (on && document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch { /* a browser without it: the layout alone */ }
}

function render() {
  placeFull();
  if (!G) return;
  const box = $("table"), size = () => `${box.clientWidth}x${box.clientHeight}`, three = in3d();
  const drawn = () => (three ? table3d.draw() : drawTable());
  if (three) table3d.snapshot();               // where the tiles were, for the ones that fly (hong-3d.js)
  if (low()) drawHand();                       // on a phone on its side the table leaves your row its room: sized first
  drawn();
  const drawnFor = size();
  drawMine();
  if (!low()) drawHand();
  drawActions();
  drawPartner();
  // the rows under the table changed height (a claim's buttons, a verdict, the first draw after a reload): the table's
  // box changed with them, and the drawing takes its proportions
  if (size() !== drawnFor) drawn();
  if (three) table3d.fly();
}
function closeDialogs() { for (const id of ["resultDlg", "whyDlg", "rushDlg", "copyDlg"]) if ($(id).open) $(id).close(); }

// ---------- puzzle rush ----------
// Positions from the computer players' own hands where one discard (or one call) is clearly best by the coach's
// reckoning, which is exact this near ready (hong-rush.js; the bank, hong-puzzles.js, loads with the first rush). Find it
// with every game's rush settings (rush-core.js): Random or Today's; 3 min, 5 min or Survival; three misses end the run.
// The clock stands while you read a verdict and while the menu or the rules are open. The verdict is the puzzle's; its
// reasons are the coach's, worked out again at the table. The run is kept as it goes (hong:rush), your bests by clock in
// hong:rushBest, today's runs in hong:rushDaily, the next run's choices in hong:rushNext; your game waits as you left it.
const RUSH = "hong:rush", RUSH_BEST = "hong:rushBest", RUSH_DAILY = "hong:rushDaily", RUSH_SEEN = "hong:rushSeen", RUSH_NEXT = "hong:rushNext";
let rush = null, bank = null, rushLib = null, ticking = null, savedAt = 0, rushPick = null;   // rushPick: the menu's choices for the next run
let words = null;                                                // { at, j }: the coach's reasons for the puzzle answered
const here = () => `${rush.seed}:${rush.i}`;                      // which puzzle of which run
async function loadRush() {
  rushLib ||= await import("./hong-rush.js");
  bank ||= (await import("./hong-puzzles.js")).PUZZLES;
}
const rushPuzzle = () => (rush && bank ? bank.find(p => p.id === rush.order[rush.i]) : null);
/** The best move, once you've answered. */
const rushBest = () => (rush?.answer && rushPuzzle() ? rushLib.decodeAction(rushPuzzle().best) : null);
const rushClock = () => (rush.left == null ? MODES.survival.label : clockText(rush.left));
function rushStatus() {
  return `<span class="hk-me-rule hk-rush"><b>Puzzle ${rush.i + 1}</b> · ✓ ${rush.score} · <span class="hk-strikes" aria-label="${rush.strikes} of 3 missed">${strikeMarks(rush.strikes)}</span> · <span id="rushClock">${rushClock()}</span></span>`;
}
/** The next run's kind and clock: what the rush's menu last started (Random and 3 min to begin with). */
const rushNext = () => { const n = read(RUSH_NEXT, null); return { kind: n?.kind === "daily" ? "daily" : "random", mode: modeOf(n?.mode) }; };
/** A run from before the clocks were chosen was a random five-minute one. */
const upgradeRush = r => (r?.v === 1 ? { ...r, v: 2, kind: "random", mode: "five", wait: 0 } : r?.v === 2 ? r : null);
async function startRush() {
  const done = busy("Dealing the puzzles", { delay: 150 });
  try { await loadRush(); } finally { done(); }
  const { kind, mode } = rushNext(), daily = kind === "daily", seed = daily ? today() : (Math.random() * 2 ** 32) >>> 0;
  rush = { v: 2, kind, mode, seed, order: rushLib.runOrder(bank, seed, daily ? [] : read(RUSH_SEEN, [])), i: 0, score: 0, strikes: 0, ...clockFor(mode), answer: null, over: false, log: [] };
  closeDialogs();
  showRushPuzzle();
}
/** The puzzle in hand laid on the table: its seat yours, the others named as at your own table. */
function showRushPuzzle() {
  const p = rushPuzzle();
  if (!p) { endRush(); return; }
  G = rushLib.replay(p); me = p.seat;
  const names = []; names[me] = "You";
  for (let k = 1; k < 4; k++) names[(me + k) % 4] = BOTS[k - 1];
  S = { v: 1, seed: p.s, firstDealer: p.dl, names, humans: [me], results: [], started: 0 };
  R = []; advice = null; hintFor = null; gen++;
  picked = rush.answer?.action.t === "discard" ? rush.answer.action.k : null;
  save(); render(); tick();
  if (rush.answer && words?.at !== here()) explainRush();
}
function tick() {
  clearInterval(ticking);
  if (!rush || rush.over || IN_FRAME) return;
  let last = Date.now();
  ticking = setInterval(() => {
    const now = Date.now(), dt = now - last;
    last = now;
    if (!rush || rush.answer || rush.over || isPaused() || document.hidden) return;
    const out = runDown(rush, dt), el = $("rushClock");
    if (el) el.textContent = rushClock();
    if (out) endRush();
    else if (now - savedAt > 3000) { savedAt = now; save(); }
  }, 250);
}
/** Your answer: judged at once from the puzzle, then the coach's reasons, yours among the options it weighed. */
function rushAnswer(act) {
  if (!rush || rush.answer || rush.over) return;
  const p = rushPuzzle(), verdict = rushLib.verdictOf(p, act);
  rush.answer = { action: act, verdict };
  if (verdict === "wrong") rush.strikes++; else rush.score++;
  rush.log.push({ id: p.id, verdict });
  write(RUSH_SEEN, [...read(RUSH_SEEN, []).filter(id => id !== p.id), p.id].slice(-150));
  if (rush.strikes >= 3) rush.over = true;
  picked = act.t === "discard" ? act.k : null;
  save(); render();
  explainRush();
}
async function explainRush() {
  const at = here(), j = await explain(clone(G), me, rush.answer.action);
  if (!rush || here() !== at || !rush.answer) return;
  words = { at, j };
  render();
}
function nextRush() {
  if (!rush) return;
  if (rush.over || timeUp(rush)) { endRush(); return; }
  rush.i++; rush.answer = null;
  graceAgain(rush);
  showRushPuzzle();
}
/** The run's end: noted once in your bests by clock (and today's), and its score. */
function endRush() {
  if (!rush) return;
  rush.over = true;
  clearInterval(ticking);
  if (rush.best == null) {
    const res = noteRun(read(RUSH_BEST, {}), read(RUSH_DAILY, {}), { kind: rush.kind, mode: rush.mode, score: rush.score }, today());
    write(RUSH_BEST, res.bests);
    if (rush.kind === "daily") write(RUSH_DAILY, res.daily);
    rush.best = res.best; rush.was = res.was;
  }
  save(); render();
  $("rushHead").textContent = endTitle(timeUp(rush) ? "time" : rush.strikes >= 3 ? "strikes" : "bank");
  const missed = rush.log.filter(x => x.verdict === "wrong").length, was = rush.was ?? 0;
  $("rushBody").innerHTML = `<p class="hk-rush-score"><b>${rush.score}</b> solved${rush.score > was ? " · your best" : was ? ` · best ${was}` : ""}</p>`
    + `<p class="hk-rush-sub">${MODES[modeOf(rush.mode)].label}${rush.kind === "daily" ? ", today's run" : ""}: ${rush.log.length} answered, ${missed} missed${rush.left != null ? `, ${clockText(rush.left)} left on the clock` : ""}.</p>`;
  if (!$("rushDlg").open) $("rushDlg").showModal();
}
function leaveRush() {
  rush = null; words = null;
  clearInterval(ticking);
  try { localStorage.removeItem(RUSH); } catch { /* private mode */ }
  closeDialogs();
  load();
}
/** A rush left open: back where it was (an answer and its reasons too), or its score if it was over. */
async function resumeRush(r) {
  await loadRush();
  rush = r;
  if (!rushPuzzle()) { leaveRush(); return; }
  showRushPuzzle();
  if (rush.over) endRush();
}
const worse = gap => (gap == null ? "" : gap >= 0.5 ? `about ${pts(gap)} points worse` : "a shade worse");
/** The question while it's open, and your moves; then the verdict, its reasons and the next puzzle. */
function drawRush(box, coach) {
  const a = rush.answer;
  coach.hidden = false;
  coach.classList.add("rush");
  if (!a) {
    const ask = G.phase === "act" ? ["Find the best discard", "Which tile goes?"] : ["Find the best call", "Call it, or let it go by?"];
    coach.innerHTML = `<b>${ask[0]}</b> ${E.noFan(G.opts) ? "No fan" : `${G.opts.minFan} fan to win`}, ${E.wallLeft(G)} tiles in the wall. ${ask[1]}`;
    if (rush.over) { box.append(goBtn("See the score", endRush, "primary")); return; }
    moveButtons(box, E.legal(G, me));
    return;
  }
  const j = words?.at === here() ? words.j : null;
  let html;
  if (a.verdict === "best") html = `<b class="hk-hit">✓ Best</b> ${j ? esc(j.decision.why) : ""}`;
  else if (a.verdict === "fine") html = `<b class="hk-hit">✓ As good</b> ${j ? `${esc(j.decision.why)} Yours does as well${j.gap >= 0.05 ? `, within ${pts(j.gap)} points` : ""}.` : ""}`;
  else {
    // what tells most against yours: further from ready, then fewer wins, then whatever the coach says first
    const cons = (j?.mine?.cons || []).filter(c => !/on balance$/.test(c));
    const against = cons.find(c => c.includes("further from ready")) || cons.find(c => c.startsWith("wins less")) || cons[0];
    html = `<b class="hk-miss">✗ Not the best</b> ${j ? `${esc(j.decision.why)} Yours: ${against ? `${esc(against)}, ` : ""}${worse(j.gap)}.` : ""}`;
  }
  coach.innerHTML = `${html}${j ? ' <button type="button" class="link hk-why-btn">Why?</button>' : ' <span class="hk-thinking">…</span>'}`;
  coach.querySelector(".hk-why-btn")?.addEventListener("click", () => showWhy(reasonsFor(j, a.action), a.action));
  if (G.phase !== "act") box.append(claimHead());
  box.append(goBtn(rush.over ? "See the score" : "Next puzzle", nextRush, "primary"));
}
/** The coach's decision for the Why sheet, set against a move of yours: its options the best first, then yours, then
 *  the rest as it ranked them. */
function reasonsFor(j, act) {
  const best = j.options.find(o => sameAct(o.action, j.best.action)) || j.options[0];
  const yours = j.options.find(o => o !== best && sameAct(o.action, act));
  return { ...j.decision, options: [best, ...(yours ? [yours] : []), ...j.options.filter(o => o !== best && o !== yours)] };
}

// ---------- together: you, your partner across the table, and two computer players (or two friends) ----------
// The room holds the hand and the game: { game, session }. Any device may move a computer player once its turn has
// come; a move is a transaction that checks the hand hasn't moved on since, so none is moved twice. A pair sits across
// from each other, at seats 0 and 2 (the first to sit down at 0); a party of three or four (README, Party) seats its
// others at 1 and 3, as they sit down, and the computer plays any seat nobody has.
const mySlot = () => (together.room ? seatsOf(roomData).find(([id]) => id === together.room.uid)?.[1].slot ?? 0 : 0);
let roomData = null, joining = null;                            // joining: the mark while you sit down, until the table's drawn
const seated = () => { joining?.(); joining = null; };
/**
 * At a table together, the device whose player sat down first, of those here, moves the computer players; the others
 * step in only when a move hasn't come for a few seconds (that page asleep, or gone). Both used to work out every move
 * and race to save it: twice the work on each phone, and the loser's try thrown away.
 */
const BACKUP_MS = 4000;
const backup = () => !!together.room && runsElsewhere(roomData, together.room.uid);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** A new game at the table, for so many people: the request's (a party's), or the table's as it was. */
function freshRoom(players, { ask = null, people = null } = {}) {
  const seed = (Math.random() * 2 ** 32) >>> 0, firstDealer = Math.floor(Math.random() * 4);
  const humans = peopleSeats(people ?? ask?.people);
  const names = [0, 1, 2, 3].map(s => (humans.includes(s) ? "" : BOTS[s - 1]));
  for (const [, p] of Object.entries(players)) names[seatOfSlot(p.slot)] = p.name;
  const game = E.deal({ seed, dealer: firstDealer, round: 0, hand: 0, opts: { flowers: opts.flowers, minFan: opts.minFan, rounds: opts.rounds, scoring: opts.scoring } });
  return { v: 1, app: APP, created: Date.now(), players, game, session: { v: 1, seed, firstDealer, names, humans, results: [], started: Date.now(), bots: strength() } };
}
let roomHand = null, roomGame = null;                            // the table's hand and game last drawn here, by their seeds
function onRoomState(g) {
  roomData = g;
  if (g.game && roomHand !== null && g.game.seed !== roomHand) {
    if (g.session?.seed === roomGame) keepHand();
    else { tableHands = []; R = []; advice = null; hintFor = null; }
  }
  if (g.game) { roomHand = g.game.seed; roomGame = g.session?.seed ?? null; }
  me = seatOfSlot(mySlot());
  const humans = g.session?.humans || peopleSeats(2), names = [...(g.session?.names || [])];
  for (const [, p] of seatsOf(g)) names[seatOfSlot(p.slot)] = p.name;
  // a seat kept for a person until they sit down: a pair's partner by the name they go by here, if they're about
  const partner = humans.length === 2 ? together.partner()?.name : null;
  for (const s of humans) names[s] ||= s === me ? together.room?.name || "You" : partner || (humans.length === 2 ? "Your partner" : "On the way");
  S = { ...g.session, names, humans, results: g.session?.results || [] };
  // your own discard already on the table, on its way: an older state meanwhile doesn't take it back
  const behind = pending && g.game?.hand === pending.hand && (g.game.log?.length || 0) < pending.len;
  if (!behind) {
    const was = G ? `${G.hand}:${G.log.length}` : "";
    G = E.fromRoom(clone(g.game));
    if (`${G.hand}:${G.log.length}` !== was) { gen++; picked = null; }
  }
  if (G.phase !== "over" && $("resultDlg").open) $("resultDlg").close();
  render();
  seated();
  if (!behind) kick(0);
}
let pending = null;                                              // your discard on its way to the room: { hand, len } it makes
/** A move at the table together, as one transaction on the room's copy. Your own discard shows at once: the room's
 *  answer is a round trip away, and on your turn nobody else can move, so it comes back as you made it or not at all
 *  (then the room's state is put back). A call waits for the room: your partner may be answering the same discard. */
async function applyTogether(seat, act) {
  const len = G.log.length, hand = G.hand;
  let shown = null;
  if (seat === me && G.phase === "act" && G.turn === me) {
    try {
      const next = clone(G);
      E.act(next, seat, act);
      G = next; gen++; picked = null;
      pending = shown = { hand, len: G.log.length };
      render();
    } catch { /* not a move the rules allow: the room's own check turns it down */ }
  }
  const ok = await together.act(g => {
    const game = E.fromRoom(g.game);
    if (game.hand !== hand || game.log.length !== len) return false;   // someone moved first
    if (!E.legal(game, seat).some(a => a.t === act.t && (a.k ?? null) === (act.k ?? null) && (a.how ?? null) === (act.how ?? null))) return false;
    E.act(game, seat, act);
    g.game = game;
  });
  if (pending === shown) pending = null;
  if (!ok) {
    if (roomData) G = E.fromRoom(clone(roomData.game));
    render(); kick(300);
  }
}
async function nextTogether() {
  const hand = G.hand;
  $("resultDlg").close();
  await together.act(g => {
    const game = E.fromRoom(g.game);
    if (game.hand !== hand || game.phase !== "over") return false;
    const cfg = E.nextHand(game, { seed: g.session.seed, firstDealer: g.session.firstDealer });
    if (cfg) g.game = E.deal(cfg);
    else { const fresh = freshRoom(g.players, { people: g.session?.humans?.length }); g.game = fresh.game; g.session = fresh.session; g.created = Date.now(); }
  });
}
function drawPartner() {
  if (!together.room) return;
  const left = (S?.humans?.length || 2) - seatsOf(roomData).length;
  if (left > 1) { toastOnce(`Waiting for ${left} more to sit down…`); return; }
  if (left === 1) { toastOnce(S?.humans?.length > 2 ? "Waiting for one more to sit down…" : "Waiting for your partner to join…"); return; }
  const p = together.partner();
  if (p?.game && p.game !== "hong") toastOnce(`${p.name} is in ${GAMES[p.game]?.name || "another game"}`);
}
let toldAt = "";
function toastOnce(msg) { if (toldAt === msg) return; toldAt = msg; toast(msg, 3000); }
async function askName() {
  const saved = localStorage.getItem("crates:name");
  if (saved) return saved;
  const dlg = $("nameDlg");
  dlg.showModal();
  $("nameInput").focus();
  const name = await new Promise(res => dlg.addEventListener("close", () => res($("nameInput").value.trim()), { once: true }));
  if (name) try { localStorage.setItem("crates:name", name); } catch { /* private mode */ }
  return name;
}
const together = createTogether({
  game: "hong",
  app: APP,
  toast,
  askName,
  valid: g => g?.v === 1 && !!g.game && !!g.session,
  fresh: freshRoom,
  slots: g => g?.session?.humans?.length || 2,
  onState: onRoomState,
  onPresence: render,
  onLeave: () => { roomData = null; seated(); load(); },
  // a game played to its end: the pair's record, by points; each of you for yourself against the other (a party's
  // isn't recorded)
  result: g => {
    const game = E.fromRoom(clone(g.game));
    if (game.phase !== "over" || E.nextHand(game, { seed: g.session.seed, firstDealer: g.session.firstDealer })) return null;
    const mine = seatOfSlot(mySlot()), mineS = game.scores[mine], theirs = game.scores[(mine + 2) % 4];
    return { match: `${g.session.started}`, score: mineS, won: mineS > theirs ? true : mineS < theirs ? false : null, coop: false, lower: false };
  },
});

// ---------- the menu ----------
let toastTimer = null;
function toast(msg, ms = 2400) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function openMenu() {
  const body = $("menuBody");
  body.replaceChildren();
  const set = (k, v) => { opts[k] = v; write(OPTS, opts); applyLook(); render(); };
  // the copies, to check the coach elsewhere: this decision (or your last) and the game so far, in words
  const copies = () => [action("Copy turn", copyTurn, "link"), action("Copy game", copyGame, "link")];
  if (together.room) {
    part(body, "play").append(...copies());
    const others = [1, 2, 3].map(k => (me + k) % 4), list = a => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
    const bots = others.filter(s => !isHuman(s)).map(nameOf);
    part(body, "together").append(line(`At the table: you and ${list(others.filter(isHuman).map(nameOf))}${bots.length ? `; the computer plays ${list(bots)}` : ""}.`), action("Back to solo", () => together.leave(), "link"));
  } else if (rush) {
    // the rush's own, as every game's rush has it (rush-menu.js): a run and its clock, your bests
    rushPick ??= rushNext();
    rushMenu(body, { pick: rushPick, start: () => { write(RUSH_NEXT, rushPick); rushPick = null; startRush(); }, results: rush.over ? endRush : null, back: leaveRush,
      bests: read(RUSH_BEST, {}), daily: read(RUSH_DAILY, {}), day: today(), inFrame: IN_FRAME });
  }
  else part(body, "play").append(action("New game", () => newGame(), "primary"), action("Puzzle rush", () => startRush(), ""), ...copies());
  const cp = progressOf("hong", COURSE);
  part(body, "play").append(action(cp.done ? `Learn: ${cp.done} of ${cp.of} lessons done` : "Learn Mahjong, from the rules", () => course.open()));
  part(body, "settings").append(
    choice("View", VIEWS, viewNow(), v => set("view", v)),
    toggle("Coach", opts.coach !== "off", v => { set("coach", v ? "on" : "off"); if (v) askCoach(); }),
  );
  const st = read(STATS, null), best = read(BEST, null), bestNoFan = read(BEST_NOFAN, null);
  if (st?.hands) part(body, "about").append(line(`${st.hands} hand${st.hands === 1 ? "" : "s"}: won ${st.wins} (${st.self} self-drawn), dealt in ${st.dealIns}${st.bestFan ? ` · biggest ${st.bestFan} fan` : ""}${st.games ? ` · ${st.games} game${st.games === 1 ? "" : "s"}, first in ${st.firsts}` : ""}${best != null ? ` · best game ${signed(best)}` : ""}${bestNoFan != null ? ` · best without fan ${signed(bestNoFan)}` : ""}`));
  const rushBests = rush ? "" : bestsLine(read(RUSH_BEST, {}));
  if (rushBests) part(body, "about").append(line(rushBests));
  if (!$("menuDlg").open) $("menuDlg").showModal();
}
function applyLook() {
  $("app").style.setProperty("--hk-num", opts.numbers ? "1" : "0");
  showView();
}
/** The view chosen in the menu: the flat table (#board) or the table at an angle (#board3d); the one not shown is emptied
 *  of what it knew, so a view shown again starts from the table as it is (nothing flies that it didn't see go). */
function showView() {
  const three = in3d();
  $("app").classList.toggle("hk3", three);
  $("board").toggleAttribute("hidden", three);                   // (an svg has no .hidden)
  $("board3d").hidden = !three;
  table3d?.reset();
}

// ---------- copying it out (Menu) ----------
// For checking the coach elsewhere. Copy turn: your decision now (between your turns, your last one, while the page is
// open) in words as your seat saw it: the rules, the round and the wall, every seat's flowers, sets and discards in
// order, your tiles, what you could do, and the coach's move with its reasons and its numbers. Copy game: every hand of
// the game so far, move by move, your tiles at each of your decisions with the coach's choice beside yours, and how
// each ended. A finished hand is kept as words for the game (hong:game; at a table together, on this device).
const GAME_WORDS = "hong:game";
let tableHands = [];                                             // together: the hands before this one, as words
const TILE_KEY = "Tiles: 1m–9m the characters (萬), 1p–9p the dots (筒), 1s–9s the bamboo (索); E S W N the winds; Rd Gd Wd the red, green and white dragons; F1–F4 the flowers (梅蘭菊竹), F5–F8 the seasons (春夏秋冬).";
const tt = k => E.tileShort(k), tts = ks => ks.map(tt).join(" ");
const whoOf = (seat, start = true) => (seat === me ? (start ? "You" : "you") : nameOf(seat));
const up1 = x => x.charAt(0).toUpperCase() + x.slice(1);
const num = x => x.toFixed(Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 1 ? 1 : 2).replace("-", "−");   // a copy's points: close calls show
/** The coach on a decision of yours, in a few words: the same, as good, or its move, how much better and why. */
function coachSaid(n) {
  if (!n.coach) return "(The coach hadn't answered.)";
  if (differed(n)) return `The coach: ${moveWords(n.coach)}${n.gap != null ? `, about ${num(n.gap)} points better` : ""}${n.against?.length ? ` (${n.against.join("; ")})` : ""}. Its reason: ${n.why}`;
  return n.best && !sameAct(n.best, n.mine) ? `The coach: ${moveWords(n.best)}, but yours is as good (within a tenth of a point).` : "The coach: the same.";
}
/** The rules a table plays, in words. */
function rulesWords(o) {
  const shared = "the head bump (of two who could win on one discard, the first after the discarder takes it), the pass block (pass a win you could take and you can't win off a discard until you next draw), robbing a kong, play to the last tile; no seven pairs";
  if (E.noFan(o)) return `Rules: Hong Kong mahjong without fan (雞糊). Any complete hand (four sets and a pair, or the thirteen orphans) wins, and every win pays alike: self-drawn, 2 points from each of the others; off a discard, 2 from the discarder and 1 from each of the others (robbing a kong counts as off a discard). The dealer pays and receives double and keeps the deal on a win or a drawn hand. A kong takes 1 from each of the others when it stands. If the first four discards are one tile (the dealer's, then each of the others in turn, nothing called), the dealer pays each of the others 1. No flowers, no minimum, no liability; ${shared}.`;
  return `Rules: Hong Kong mahjong (新派清章): ${o.minFan ? `${o.minFan} fan to win` : "no minimum (a chicken hand wins)"}, ${o.cap} fan the most a hand pays; half-spicy payouts (the base doubles up to four fan, then every two: 1 2 4 8 16 24 32 48 64 96 128 at ten); off a discard, its discarder pays 4 × base; self-drawn, each of the others pays 2 × base; liability (包: let go the tile that makes someone's fourth set, or third dragon set, and pay all of their self-drawn win); the dealer keeps the deal on a win or a drawn hand; ${o.flowers ? "flowers in play (set aside when drawn and replaced from the wall's end)" : "no flowers"}; ${shared}.`;
}
/** A move in words: "discard 5s", "pung 5s", "chow 3p 4p 5p", "kong 7s, concealed", "win", "pass". */
function moveWords(a) {
  if (!a) return "?";
  if (a.t === "discard") return `discard ${tt(a.k)}`;
  if (a.t === "chow") return `chow ${tts([a.k, a.k + 1, a.k + 2])}`;
  if (a.t === "pung" || a.t === "kong") return `${a.t} ${tt(a.k)}${a.how === "concealed" ? ", concealed" : a.how === "added" ? ", added to the pung" : ""}`;
  return a.t === "flowers" ? "win on the flowers" : a.t;
}
/** A set on the table in words: "pung of 5s off Mei", "chow 3p 4p 5p (4p off Wing)", "kong of 7s, concealed". */
function meldWords(m) {
  const off = m.open && m.from >= 0 ? ` off ${whoOf(m.from, false)}` : "";
  if (m.t === "chow") return `chow ${tts([m.k, m.k + 1, m.k + 2])}${m.got !== undefined ? ` (${tt(m.got)}${off})` : off}`;
  if (m.t === "kong") return `kong of ${tt(m.k)}${!m.open ? ", concealed" : m.added ? `, a pung${off} added to` : off}`;
  return `pung of ${tt(m.k)}${off}`;
}
/** A position as your seat saw it, in words: the round, every seat in turn from yours, and what you could do. */
function positionWords(st) {
  const order = [0, 1, 2, 3].map(i => (st.dealer + i) % 4);
  const out = [`${E.WIND_NAMES[st.round]} round, hand ${st.hand + 1}; ${E.wallLeft(st)} tiles left in the wall. Play goes ${order.map(s => whoOf(s)).join(" → ")}, from the dealer.`];
  for (const i of [0, 1, 2, 3]) {
    const s = (me + i) % 4, x = st.seats[s];
    out.push("", `${whoOf(s)}: ${E.WIND_NAMES[E.windOf(st, s)]}${s === st.dealer ? " (the dealer)" : ""}, score ${signed(st.scores[s])}${s === me ? "" : `, ${x.hand.length} tiles in hand`}.`);
    if (s === me) {
      const hand = x.hand.slice(), drew = st.phase === "act" && st.turn === me && st.drawn !== null && hand.includes(st.drawn) ? st.drawn : null;
      if (drew !== null) hand.splice(hand.lastIndexOf(drew), 1);
      out.push(`  Your tiles: ${tts(hand)}${drew !== null ? `, and ${tt(drew)} just drawn` : ""}.`);
    }
    if (x.flowers.length) out.push(`  Flowers: ${tts(x.flowers)}.`);
    if (x.melds.length) out.push(`  Sets: ${x.melds.map(meldWords).join("; ")}.`);
    out.push(`  Discards, in order: ${x.river.length ? x.river.map(d => (d.by !== undefined ? `${tt(d.k)} (taken by ${whoOf(d.by, false)})` : tt(d.k))).join(", ") : "none"}.`);
    if (x.passBlock) out.push("  Has passed a win since drawing: can't win off a discard until drawing again.");
  }
  const can = E.legal(st, me), fan = a => (a.t === "win" && a.fan !== undefined && !E.noFan(st.opts) ? `win (${a.fan} fan)` : moveWords(a));
  if (!can.length) out.push("", "Nothing for you to decide.");
  else if (st.phase === "act") {
    const more = can.filter(a => a.t !== "discard").map(fan);
    out.push("", `Your turn${st.drawn !== null ? `, ${tt(st.drawn)} just drawn` : ", after your call"}: discard a tile${more.length ? `, or ${more.join(", or ")}` : ""}.`);
  } else out.push("", `${whoOf(st.last.seat)} has just ${st.phase === "rob" ? `added ${tt(st.last.k)} to a pung, a kong that can be robbed` : `discarded ${tt(st.last.k)}`}. You can ${can.map(fan).join(", or ")}.`);
  return out.join("\n");
}
/** The coach's reckoning in words: its move and reason, yours beside it, the choices it weighed with what speaks for
 *  and against each, its discards in numbers, and how it reads the others. */
function coachWords(d, n = null) {
  const out = [`The coach (the computer player's reckoning at Hard, from what your seat could see): ${d.why}`];
  if (n) out.push(`Your move: ${moveWords(n.mine)}. ${differed(n) ? differWords(n.mine, n) : sameAct(n.mine, d.action) ? "The same as the coach's." : "As good as the coach's, within a tenth of a point."}`);
  if (d.options?.length > 1) {
    out.push("", "The choices it weighed, its own first (+ for, − against; points: what the hand is worth after the move on average, each win it could make by what it pays and how likely it comes, less the danger):");
    d.options.forEach((o, i) => {
      out.push(`${i + 1}. ${o.title}${n && i && sameAct(o.action, n.mine) ? " (yours)" : ""}${o.value != null ? `: ${num(o.value)} points` : ""}`);
      for (const p of o.pros) out.push(`   + ${up1(p)}`);
      for (const c of o.cons) out.push(`   − ${up1(c)}`);
    });
  }
  if (d.rows?.length) {
    out.push("", "Its discards in numbers (from ready: tiles from a ready hand; help: unseen tiles that would bring it a step nearer; win: the chance this hand wins; danger: the points the tile is likely to cost):");
    for (const r of d.rows) {
      const other = r.routes?.find(x => x.route !== r.route && x.ev > 0);
      out.push(`  ${tt(r.k)}: keeps ${routeName(r.route)}${other ? ` (or ${routeName(other.route)}, ${other.sh <= 0 ? "ready" : `${other.sh} away`})` : ""}; ${r.sh <= 0 ? "ready" : `${r.sh} from ready`}; help ${r.uk?.n ?? 0}; win ${Math.round((r.p || 0) * 100)}%; danger ${num(r.risk)}; points ${num(r.score)}`);
    }
  }
  if (d.threats?.length) out.push("", "How it reads the others:", ...d.threats.map(t => `  ${nameOf(t.seat)} (${windName(t.seat)}): ${threatBits(t).join(", ")}.`));
  return out.join("\n");
}
/** A hand move by move as your seat saw it: your tiles after the deal, the others' discards and calls, your tiles at
 *  each of your decisions with the coach's choice beside yours, and how it ended. */
function handWords(st, notes) {
  const dealt = E.deal({ seed: st.seed, dealer: st.dealer, round: st.round, hand: st.hand, opts: st.opts }).seats[me];
  const out = [`Hand ${st.hand + 1}: ${E.WIND_NAMES[st.round]} round, ${whoOf(st.dealer)} dealing. ${[0, 1, 2, 3].map(i => (me + i) % 4).map(s => `${whoOf(s)} ${E.WIND_NAMES[E.windOf(st, s)]}`).join(", ")}.`,
    `Your tiles after the deal: ${tts(dealt.hand)}${dealt.flowers.length ? ` (flowers set aside: ${tts(dealt.flowers)})` : ""}.`];
  const at = new Map();
  for (const n of notes) if (n.at !== undefined) at.set(n.at, [...(at.get(n.at) || []), n]);
  let i = 0;
  const say = t => out.push(`${++i}. ${t}`);
  for (let x = 0; x <= st.log.length; x++) {
    let covered = null;
    for (const n of at.get(x) || []) {
      const hand = n.hand.slice();
      if (n.drawn !== null && hand.includes(n.drawn)) hand.splice(hand.lastIndexOf(n.drawn), 1);
      const seen = n.phase === "act" ? `${n.drawn !== null ? `You draw ${tt(n.drawn)}. ` : ""}Your tiles: ${tts(hand)}${n.drawn !== null ? ` + ${tt(n.drawn)}` : ""}.`
        : `On ${whoOf(n.last.seat, false) === "you" ? "your" : `${nameOf(n.last.seat)}'s`} ${tt(n.last.k)}, your tiles ${tts(hand)}:`;
      say(`${seen} You ${moveWords(n.mine)}. ${coachSaid(n)}`);
      covered = n.mine;
    }
    const e = st.log[x];
    if (!e) break;
    // your own move, already said with your decision
    if (covered && e.seat === me && (e.e === covered.t || (e.e === "win" && covered.t === "flowers"))) continue;
    const w = whoOf(e.seat), from = e.from !== undefined && e.from >= 0 ? `${whoOf(e.from, false) === "you" ? "your" : `${nameOf(e.from)}'s`}` : "";
    if (e.e === "discard") say(`${w} discard${e.seat === me ? "" : "s"} ${tt(e.k)}.`);
    else if (e.e === "flower") say(`${w} show${e.seat === me ? "" : "s"} a flower, ${tt(e.k)}, and draw${e.seat === me ? "" : "s"} again.`);
    else if (e.e === "pung" || e.e === "chow") say(`${w} ${e.e}${e.seat === me ? "" : "s"} ${e.e === "chow" ? tts([e.k, e.k + 1, e.k + 2]) : tt(e.k)} off ${from} discard.`);
    else if (e.e === "kong") say(`${w} ${e.how === "concealed" ? `declare${e.seat === me ? "" : "s"} a concealed kong of ${tt(e.k)}` : e.how === "added" ? `add${e.seat === me ? "" : "s"} ${tt(e.k)} to a pung, a kong` : `kong${e.seat === me ? "" : "s"} ${tt(e.k)} off ${from} discard`}.`);
    else if (e.e === "kong-paid") say(`${w === "You" ? "Your" : `${w}'s`} kong of ${tt(e.k)} takes 1 from each of the others.`);
    else if (e.e === "follow") say(`The first four discards were all ${tt(e.k)}: ${whoOf(e.seat, false)}, dealing, pay${e.seat === me ? "" : "s"} each of the others 1.`);
    else if (e.e === "win") {
      const by = st.result?.seat === e.seat && st.result.from >= 0 ? (st.result.from === me ? "your" : `${nameOf(st.result.from)}'s`) : "the";
      say(`${w} win${e.seat === me ? "" : "s"}${e.how === "self" ? ", self-drawn" : e.how === "flowers" ? " on the flowers" : e.how === "rob" ? `, robbing ${by} kong` : ` off ${by} discard`}.`);
    }
    else if (e.e === "draw-game") say("The wall is empty: a drawn hand.");
  }
  const r = st.result;
  if (r?.kind === "win") {
    const x = st.seats[r.seat];
    out.push(`${whoOf(r.seat)} won with ${tts(x.hand)}${x.melds.length ? `; sets: ${x.melds.map(meldWords).join("; ")}` : ""}${x.flowers.length ? `; flowers: ${tts(x.flowers)}` : ""}${E.noFan(st.opts) ? "." : `: ${r.fan} fan${r.limit ? " (a limit hand)" : ""} (${r.items.map(it => `${it.en} ${it.fan}`).join(", ")}).`}`);
  }
  if (r) {
    const paid = st.paid || [], hand = [0, 1, 2, 3].map(s => r.pay[s] + paid.reduce((a, e) => a + e.pay[s], 0));
    out.push(`This hand: ${[0, 1, 2, 3].map(s => `${whoOf(s)} ${signed(hand[s])}`).join(", ")}. Scores: ${[0, 1, 2, 3].map(s => `${whoOf(s)} ${signed(st.scores[s])}`).join(", ")}.`);
  } else out.push("(The hand goes on.)");
  const decided = notes.filter(n => n.coach);
  if (decided.length) out.push(`You and the coach agreed on ${decided.filter(n => !differed(n)).length} of ${decided.length} decisions.`);
  return out.join("\n");
}
/** The hand just played kept in words for Copy game, and the coach's notes begun again for the next. */
function keepHand() {
  if (G?.log.length && !rush) {
    const words = handWords(G, R);
    if (together.room) tableHands.push(words);
    else write(GAME_WORDS, [...read(GAME_WORDS, []), words]);
  }
  R = []; advice = null; hintFor = null;
}
/** Words to the clipboard within the tap that asked for them; where the browser refuses, a sheet to copy them by hand. */
function copyOut(what, text) {
  const sheet = () => { $("copyHead").textContent = what; $("copyText").value = text; $("copyDlg").showModal(); $("copyText").select(); };
  if (!navigator.clipboard?.writeText) { sheet(); return; }
  navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), sheet);
}
function copyTurn() {
  if (!G) return;
  const head = `Hong Kong mahjong: a decision, to check the coach.\n\n${rulesWords(G.opts)}\n${TILE_KEY}\n\n`;
  if (G.phase !== "over" && E.waitingOn(G).includes(me) && E.legal(G, me).length > 1) {
    const d = advice?.key === keyNow() && advice.decision ? advice.decision : decide(clone(G), me, { noise: false });
    copyOut("Your turn", `${head}${positionWords(G)}\n\n${coachWords(d)}`);
    return;
  }
  // between your turns: your last decision, as the table stood then
  const n = R[R.length - 1], st = n && shots.get(n);
  if (st) {
    const j = reckoned.get(n) || explainMove(clone(st), me, n.mine);
    copyOut("Your last turn", `${head}${positionWords(st)}\n\n${coachWords(reasonsFor(j, n.mine), n.coach ? n : { ...n, ...verdict(j, n.mine) })}`);
    return;
  }
  copyOut("The table", `${head}${positionWords(G)}`);
}
function copyGame() {
  if (!G) return;
  const before = together.room ? tableHands : read(GAME_WORDS, []);
  const length = ["", "the East round", "two rounds", "", "all four rounds"][G.opts.rounds || 1] || `${G.opts.rounds} rounds`;
  const head = `Hong Kong mahjong: a game, move by move, to check the coach (its choice beside each of yours). A game is ${length}; the others' draws are unseen.\n\n${rulesWords(G.opts)}\n${TILE_KEY}`;
  copyOut("The game", [head, ...before, handWords(G, R)].join("\n\n"));
}

// ---------- the rules ----------
function rules() {
  const nofan = E.noFan(G && !rush ? G.opts : opts);              // the table's own rules: the game in hand, else the menu's
  const fan = [
    ["自摸", "Self-drawn", 1], ["門前清", "Concealed hand (nothing called)", 1], ["無花", "No flowers", 1], ["正花", "Own flower or season (each)", 1], ["一台花", "All four flowers, or all four seasons", 2],
    ["平糊", "All chows", 1], ["對對糊", "All pungs", 3], ["坎坎糊", "Four concealed pungs, in place of all pungs", 8], ["混一色", "Half flush: one suit and honours", 3], ["清一色", "Full flush: one suit only", 7],
    ["中 發 白", "Pung of a dragon (each)", 1], ["門風 圈風", "Pung of your seat's or the round's wind (each)", 1], ["混么九", "Terminals and honours only", 1],
    ["小三元", "Little three dragons", 5], ["大三元", "Big three dragons", 8], ["小四喜", "Little four winds", 6],
    ["槓上開花", "Win on a kong's replacement", 1], ["槓上槓自摸", "Win on a second kong's replacement", 8], ["海底撈月", "Win on the last tile", 1], ["搶槓", "Robbing a kong", 1], ["花糊", "Seven flowers: an instant win", 3],
  ];
  const limits = [["天糊", "Heavenly hand: the dealer's deal is complete"], ["地糊", "Earthly hand: won off the dealer's first discard"], ["十三么", "Thirteen orphans"], ["九子連環", "Nine gates"], ["字一色", "All honours"], ["清么九", "All terminals"], ["大四喜", "Big four winds"], ["十八羅漢", "Four kongs"], ["大花糊", "All eight flowers"]];
  return `<p><b>The tiles.</b> Three suits, characters (萬), dots and bamboo, 1 to 9, four of each; the honours, four winds (東南西北) and three dragons (中發白), four of each${opts.flowers && !nofan ? "; and eight flowers and seasons, one of each, set aside when drawn and replaced from the wall's end" : ""}.</p>
<p><b>A hand</b> is four sets and a pair: a set is a chow (three in a row in one suit), a pung (three alike) or a kong (four alike, which draws a replacement). Draw, then let one tile go; first to complete a hand ${nofan ? "wins" : "that scores the minimum wins"}.</p>
<p><b>Calls.</b> Anyone may take a discard to win, or to make a pung or kong; only the next player may take it for a chow. A win comes first, then a pung or kong, then a chow; of two wins, the player first after the discarder takes it. Pass a win you could take and you can't win off a discard until you draw again. A kong added to a called pung can be robbed by anyone who wins on that tile.</p>
${nofan ? `<p><b>No fan.</b> Any complete hand wins, and every win pays alike: self-drawn, 2 from each of the others; off a discard, 2 from its discarder and 1 from each of the others. The dealer (東) pays and receives double, and keeps the deal on a win or a drawn hand; your seat's wind turns each time the deal passes. A kong takes 1 from each of the others when it's made (one added to a pung, once no one has robbed it). If the first four discards are all the same tile (跟莊), the dealer pays each of the others 1. No flowers.</p>`
  : `<p><b>Fan.</b> A win needs ${opts.minFan ? `${opts.minFan} fan` : "no fan (a chicken hand will do)"}; ten is the most a hand pays. Your seat's wind turns each time the deal passes; the dealer (東) keeps the deal on a win or a drawn hand.</p>
<table class="hk-fan"><tbody>${fan.map(([z, e, n]) => `<tr><td class="zh">${z}</td><td>${e}</td><td class="n">${n}</td></tr>`).join("")}</tbody></table>
<p><b>Limit hands</b> pay the most a hand pays, and nothing else counts: ${limits.map(([z, e]) => `${e} (${z})`).join(", ")}.</p>
<p><b>Paying.</b> Each fan doubles the base up to four, then every two (1 2 4 8 16 24 32 48 64 96 128 at ten). Off a discard, its discarder pays 4 × base; self-drawn, each of the others pays 2 × base. Let go the tile that makes someone's fourth set, or their third dragon set, and you pay all of their self-drawn win (包).</p>`}`;
}

// ---------- the course ----------
// Learn (the Menu): Hong Kong mahjong taught from nothing (hong-lessons.js) on the course's sheet (course.js), the tiles
// drawn as the table draws them and every answer the referee's; its last lesson starts a game with the rules it taught.
const course = createCourse({
  id: "hong", course: COURSE, cls: "hk", inFrame: IN_FRAME, stage: tileStage(),
  onRules: () => { $("rulesBody").innerHTML = rules(); $("rulesDlg").showModal(); },
  onPlay: () => {
    if (together.room) { toast("Your table plays on: try a game when you're back to solo"); return; }
    if (rush) leaveRush();
    Object.assign(opts, { scoring: "fan", flowers: true, minFan: 3 });
    write(OPTS, opts);
    newGame();
  },
});

// ---------- wiring ----------
installTiles();
table3d = createTable3d({
  state: () => G, me: () => me, nameOf, meldTiles, busy: () => busyWith, quiet: IN_FRAME,
  cap: () => Math.min(handSize([]).tw, 2.4 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)),
  headerOver, answering: () => !!G && E.legal(G, me).some(a => a.t !== "pass"),
  hand: () => [...$("hand").querySelectorAll(".hk-tile")], melds: () => [...$("hand").querySelectorAll(".hk-meld")],
});
bindSwitcher($("appsBtn"), "hong");
document.querySelector(".hk-mark").innerHTML = APPS.find(a => a.id === "hong")?.logo || "";
$("menuBtn").addEventListener("click", openMenu);
$("menuClose").addEventListener("click", () => $("menuDlg").close());
$("helpBtn").addEventListener("click", () => { $("rulesBody").innerHTML = rules(); $("rulesDlg").showModal(); });
$("rulesClose").addEventListener("click", () => $("rulesDlg").close());
$("whyClose").addEventListener("click", () => $("whyDlg").close());
$("nextBtn").addEventListener("click", () => { if (gameOver() && !together.room) { $("resultDlg").close(); newGame(); } else nextHand(); });
$("tableBtn").addEventListener("click", () => $("resultDlg").close());
for (const id of ["rulesDlg", "whyDlg"]) $(id).addEventListener("click", e => { if (e.target === $(id)) $(id).close(); });
$("rushAgain").addEventListener("click", () => startRush());
$("rushLeave").addEventListener("click", () => leaveRush());
$("copyClose").addEventListener("click", () => $("copyDlg").close());
onPause(() => { clearTimeout(timer); table3d.pause(true); render(); }, () => { table3d.pause(false); kick(0); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) together.resync(); });
window.addEventListener("pageshow", e => { if (e.persisted) together.resync(); });
let resizeTimer = null;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 60); });

onDefaultChange(() => { if (!opts.view) { applyLook(); render(); } });   // Settings' 2D mode, live

// for tests and debugging
window.__hong = { course, get state() { return G; }, get session() { return S; }, get review() { return R; }, get advice() { return advice; }, get me() { return me; }, get together() { return together; },
  get rush() { return rush; }, get words() { return words; }, startRush, nextRush, leaveRush,
  mine, newGame, nextHand, get view() { return viewNow(); }, set(o) { Object.assign(opts, o); write(OPTS, opts); applyLook(); render(); } };

/** Back to where you were: a puzzle rush left open, else your game as you left it, else a new one. */
function load() {
  const r = upgradeRush(read(RUSH, null));
  if (r) { resumeRush(r); return; }
  const run = read(RUN, null);
  if (run?.G && run?.S && run.G.v === 1) {
    G = E.fromRoom(run.G); S = run.S; R = run.R || []; me = 0;
    closeDialogs();
    gen++;
    render();
    kick(0);
    return;
  }
  newGame();
}
applyLook();
// Opened for a duo match: your solo game isn't dealt or played on while you sit down (its computer players would
// move on without you); it waits as you left it, for Back to solo, or for a join that doesn't come off.
const code = roomInAddress();
if (code) {
  joining = busy(joiningWords(), { delay: 0 });
  together.join(code).then(ok => { if (!ok) { seated(); load(); } });
} else load();
