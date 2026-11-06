// Mahjong's puzzle rush: positions from the computer players' own hands where one discard (or one call) is clearly best,
// the bank in hong-puzzles.js (tools/hong-puzzles.mjs finds them). A puzzle is the deal and the moves that led to it,
// so it replays through the engine to exactly the table the player saw; the verdict comes from the coach's own
// reckoning at that table, the same as Why? in a game. Pure: the page, the tests and the generator share it.
import * as E from "./hong-engine.js";
import { decide, view, explainMove } from "./hong-bot.js";

// ---------- a puzzle as text ----------
// Each move two characters: what it is (d discard, p pass, P pung, c chow, K kong off a discard, C concealed kong,
// A added kong, w win, f the seven flowers) and its tile in base 36 (0 when it has none).
const KIND = { discard: "d", pass: "p", pung: "P", chow: "c", win: "w", flowers: "f" };
const KONG = { exposed: "K", concealed: "C", added: "A" };
export const encodeAction = a => (a.t === "kong" ? KONG[a.how] : KIND[a.t]) + (a.k ?? 0).toString(36);
export function decodeAction(s) {
  const c = s[0], k = parseInt(s[1], 36);
  if (c === "K" || c === "C" || c === "A") return { t: "kong", k, how: { K: "exposed", C: "concealed", A: "added" }[c] };
  const t = Object.keys(KIND).find(x => KIND[x] === c);
  return t === "pass" || t === "win" || t === "flowers" ? { t } : { t, k };
}
export const decodeActions = s => Array.from({ length: s.length / 2 }, (_, i) => decodeAction(s.slice(2 * i, 2 * i + 2)));
/** The puzzle's table: the deal, every move before it made again, and the seat to move. */
export function replay(p) {
  const st = E.deal({ seed: p.s, dealer: p.dl, round: 0, hand: 0, opts: { flowers: !!p.o[0], minFan: p.o[1] } });
  for (const a of decodeActions(p.acts)) E.act(st, E.waitingOn(st)[0], a);
  if (!E.waitingOn(st).includes(p.seat)) throw new Error(`puzzle ${p.id}: seat ${p.seat} isn't to move`);
  return st;
}
export const sameAct = (a, b) => !!a && !!b && a.t === b.t && (a.k ?? null) === (b.k ?? null) && (a.how ?? null) === (b.how ?? null);

/** The verdict on a move, from the puzzle alone: "best", "fine" (within its tolerance of the best: its ok list) or "wrong". */
export function verdictOf(p, action) {
  if (sameAct(action, decodeAction(p.best))) return "best";
  return p.ok.map(decodeAction).some(a => sameAct(a, action)) ? "fine" : "wrong";
}
/**
 * The verdict with its reasons: { verdict, best, mine, options, gap, why } — best and mine the coach's options in words
 * (title, pros, cons), options all it weighed (yours among them), gap how many points (of expected winnings) the move
 * gives up, why the coach's reason for its own.
 */
export function judge(p, state, action) {
  const { best, mine, options, gap, decision } = explainMove(state, p.seat, action);
  return { verdict: verdictOf(p, action), best, mine, options, gap, why: decision.why, decision };
}

// ---------- a run ----------
/** The order a run deals its puzzles: rising difficulty, four at each step, chosen at random within a step from those
 *  not seen lately (`recent`: ids), any seen if a step runs dry; then the rest, hardest first. */
export function runOrder(bank, seed, recent = []) {
  const r = E.rng(seed), seen = new Set(recent), out = [], used = new Set();
  for (let step = 1; step <= 10; step++) {
    const pool = bank.filter(p => p.r === step && !used.has(p.id));
    const fresh = pool.filter(p => !seen.has(p.id)), from = fresh.length >= 3 ? fresh : pool;
    for (let i = 0; i < 4 && from.length; i++) {
      const j = Math.floor(r() * from.length), p = from.splice(j, 1)[0];
      out.push(p.id); used.add(p.id);
    }
  }
  for (const p of bank.filter(x => !used.has(x.id)).sort((a, b) => b.r - a.r)) out.push(p.id);
  return out;
}
export { decide, view };
