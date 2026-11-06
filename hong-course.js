// Mahjong's course (Learn, in the menu): Hong Kong mahjong taught from nothing on the course's sheet (course.js) with a
// stage of its own, the tiles drawn as the table draws them (hong-tiles.js). Every question is put to the referee
// (hong-engine.js): a lesson only describes a table (tiles, melds, flowers, the dealer, the discard in the air) and the
// engine builds that table, says what is legal, scores the hand and moves the points, so the course can't disagree
// with the game. The rules taught are the default ones the game plays: fan scoring, flowers, three fan to win, ten the
// cap (the menu's other choices, no fan and the other minimums, aren't taught).
//
// Tiles are written as the game's short names: 1m–9m characters, 1p–9p dots, 1s–9s bamboo, E S W N, Rd Gd Wd, F1–F8.
// Melds: "c:3p" a chow from the 3 of dots, "p:5s" a pung, "k:Rd" an open kong, "ck:Rd" a concealed kong.
//
// A step's table (all optional): hand (the concealed tiles), draw (the tile just drawn: it's your turn), discard +
// from (the tile in the air and the seat that threw it; you are seat 0, the player on your right 1, across 2, left 3),
// melds, flowers, dealer (the seat that deals: 0 makes you East), round (0 East …), others {seat: tiles}, seen (tiles
// out of play on the table, for counting what's left), flags (afterKong, lastDraw …), rob (an added kong in the air),
// block (you passed a win and haven't drawn since). rows: [{ label, zh, tiles }] show tiles that aren't a hand.
// An exercise's goal: tiles (tap the ones that are `what`), pair, set (a chow or a pung), waits (tap the tiles that
// complete it, out of `cands`), discard (tap the tile to throw, by `crit`), claim (the button to press), fan (the
// number), pay (the points you win), taker (who gets the tile, after `claims`). quiz steps may carry `check()`, which
// the tests compare with the answer.
import * as E from "./hong-engine.js";
import { shanten } from "./hong-bot.js";
import { tileSvg } from "./hong-tiles.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const OPTS = { flowers: true, minFan: 3, cap: 10, rounds: 1, scoring: "fan" };

// ---------- tiles and tables as text ----------
/** Tiles written "1m 2m E Rd F3" as kinds. */
export function tilesOf(text) {
  const out = [];
  for (const tok of String(text ?? "").trim().split(/\s+/).filter(Boolean)) {
    let k = -1, m;
    if ((m = /^([1-9])([mps])$/.exec(tok))) k = "mps".indexOf(m[2]) * 9 + Number(m[1]) - 1;
    else if ("ESWN".includes(tok) && tok.length === 1) k = 27 + "ESWN".indexOf(tok);
    else if ((m = /^(Rd|Gd|Wd)$/.exec(tok))) k = 31 + ["Rd", "Gd", "Wd"].indexOf(tok);
    else if ((m = /^F([1-8])$/.exec(tok))) k = 33 + Number(m[1]);
    if (k < 0) throw new Error(`no tile "${tok}"`);
    out.push(k);
  }
  return out;
}
export const textOf = ks => ks.map(E.tileShort).join(" ");
/** A meld "c:3p" as the referee keeps it, and the tiles it shows. */
export function meldOf(tok) {
  const m = /^(c|p|k|ck):(\S+)$/.exec(tok);
  if (!m) throw new Error(`no meld "${tok}"`);
  const k = tilesOf(m[2])[0], t = m[1] === "c" ? "chow" : m[1] === "p" ? "pung" : "kong";
  return { t, k, from: m[1] === "ck" ? -1 : 3, open: m[1] !== "ck" };
}
export const meldTiles = m => (m.t === "chow" ? [m.k, m.k + 1, m.k + 2] : Array(m.t === "kong" ? 4 : 3).fill(m.k));
const SEATS = ["you", "the player on your right", "the player across", "the player on your left"];

/**
 * The table a step describes, as the referee has it: seat 0 is you; the others hold nothing unless the step gives
 * them tiles. A turn of yours (draw) or a discard in the air (discard) or a kong in the air (rob).
 */
export function sceneOf(step) {
  const dealer = step.dealer ?? 0, opts = { ...OPTS, ...(step.opts || {}) };
  const s = E.deal({ seed: 11, dealer, round: step.round ?? 0, opts });
  s.seats = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], flowers: [], river: [], passBlock: false }));
  const me = s.seats[0];
  me.hand = tilesOf(step.hand);
  me.melds = (step.melds || []).map(meldOf);
  me.flowers = tilesOf(step.flowers);
  if (step.block) me.passBlock = true;
  for (const [seat, text] of Object.entries(step.others || {})) {
    s.seats[seat].hand = tilesOf(text);
    s.seats[seat].melds = (step.othersMelds?.[seat] || []).map(meldOf);
  }
  s.flags = { afterKong: false, kongChain: 0, lastDraw: false, finalDiscard: false, heavenly: false, earthly: false, firstTurn: [false, false, false, false], calls: 1, follow: -1, followK: -1, ...(step.flags || {}) };
  s.log = []; s.paid = []; s.claims = {}; s.liable = [-1, -1, -1, -1];
  if (step.draw) { const k = tilesOf(step.draw)[0]; me.hand.push(k); s.drawn = k; s.phase = "act"; s.turn = 0; }
  else if (step.discard) {
    const k = tilesOf(step.discard)[0], from = step.from ?? 3;
    s.last = { seat: from, k, e: "discard" }; s.phase = "claim"; s.turn = from; s.drawn = null;
    s.seats[from].river.push({ k });
  } else if (step.rob) {
    const k = tilesOf(step.rob)[0], from = step.from ?? 2;
    s.seats[from].melds = [{ t: "kong", k, from: 0, open: true, added: true }];
    s.last = { seat: from, k, e: "added" }; s.phase = "rob"; s.turn = from; s.drawn = null;
  }
  if (step.flags?.lastDraw || step.flags?.finalDiscard) s.head = s.tail - (step.flags.finalDiscard ? 0 : 1);
  for (const x of s.seats) x.hand.sort((a, b) => a - b);
  return s;
}
/** The step's hand as it's shown: the concealed tiles with the drawn one last. */
export function handShown(step) {
  const hand = tilesOf(step.hand).sort((a, b) => a - b);
  return step.draw ? [...hand, tilesOf(step.draw)[0]] : hand;
}
const needSets = s => 4 - s.seats[0].melds.length;
const countsOf = ks => E.counts(ks);
/** The tiles that complete a hand of this many sets and a pair (the shape only: no fan counted). */
export function waitsOf(tiles, melds = 0) {
  const c = countsOf(tiles), out = [];
  for (let k = 0; k < 34; k++) { c[k]++; if (E.complete(c.slice(), 4 - melds)) out.push(k); c[k]--; }
  return out;
}
/** Whether tiles are one set, and which: "chow", "pung", or null. */
export function setOf(tiles) {
  if (tiles.length !== 3) return null;
  const c = countsOf(tiles);
  const p = [...Array(34).keys()].find(k => !c[k]);
  c[p] += 2;
  const found = E.splits(c, 1);
  return found[0]?.sets[0]?.t ?? null;
}
/** The first set of the shown hand (indices) of the kind the step wants: what Hint picks. */
export function findSet(step) {
  const hand = handShown(step);
  for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) {
    const t = setOf([hand[a], hand[b], hand[c]]);
    if (t && (!step.want || t === step.want)) return [a, b, c];
  }
  return null;
}
/** The kinds that can be the pair of a hand of 14 tiles (and the melds down). */
export const pairsOf = (tiles, melds = 0) => [...new Set(E.splits(countsOf(tiles), 4 - melds).map(sp => sp.pair))];

// ---------- what the referee says now ----------
const NAMES = { pass: "Pass", chow: "Chow", pung: "Pung", kong: "Kong", win: "Win" };
/** The buttons that are legal for you at this table, by name ("Chow" too if any chow is). */
export function legalNames(s) { return [...new Set(E.legal(s, 0).filter(a => NAMES[a.t]).map(a => NAMES[a.t]))]; }
/** Why a button isn't legal here, in the referee's terms. */
export function whyNot(s, name) {
  const me = s.seats[0], k = s.last?.k, c = countsOf(me.hand);
  if (name === "Win") {
    if (me.passBlock) return "You passed a win and haven't drawn since: until you draw, you can't win off a discard.";
    const sc = E.scoreWin(s, { seat: 0, tile: k, how: s.phase === "rob" ? "rob" : "discard" });
    return sc.fan < 0 ? "That tile doesn't complete your hand." : `That completes a hand, but it's worth only ${sc.fan} fan: three are needed to win.`;
  }
  if (name === "Chow") return s.last.seat !== 3 ? "Only the player after the one who threw the tile (on the thrower's left) may chow." : "You don't hold the other two tiles of any run with it.";
  if (name === "Pung") return `A pung needs two ${E.tileName(k)} in your hand.`;
  if (name === "Kong") return `A kong from a discard needs three ${E.tileName(k)} in your hand.`;
  return `That isn't allowed (${c.length} tiles).`;
}
const winsAs = s => (s.phase === "act" ? "self" : s.phase === "rob" ? "rob" : "discard");
/** The score of the win at this table (its tile is the drawn one, the discard, or the kong), as the referee counts it. */
export const scoreAt = s => E.scoreWin(s, { seat: 0, tile: s.phase === "act" ? s.drawn : s.last.k, how: winsAs(s) });
export const itemsText = r => r.items.map(i => `${i.en}${i.fan ? ` ${i.fan}` : ""}`).join(", ");
/** Your points from winning at this table: the referee takes the win and pays it. */
export function winPay(s) {
  const t = JSON.parse(JSON.stringify(s));
  E.act(t, 0, { t: "win" });
  return t.result;
}
/** Who ends up with the discard (or the win on it) after these answers (claims: {seat: action}, in the order given). */
export function takerOf(s, claims) {
  const t = JSON.parse(JSON.stringify(s)), had = t.seats.map(x => x.melds.length);
  for (const [seat, action] of Object.entries(claims)) {
    if (t.phase === "over") break;
    E.act(t, Number(seat), action);
  }
  if (t.result?.kind === "win") return { seat: t.result.seat, how: "win" };
  const seat = t.seats.findIndex((x, i) => x.melds.length > had[i]);
  return seat >= 0 ? { seat, how: t.seats[seat].melds.at(-1).t } : { seat: -1, how: "none" };
}

// ---------- a discard judged ----------
/** The tiles still unseen of a kind: four, less those in your hand and those on the table (`seen`). */
const unseen = (step, hand) => { const c = countsOf(hand), v = countsOf(tilesOf(step.seen)); return k => 4 - c[k] - v[k]; };
/** Each discard (a kind) of the shown hand, with what it leaves: { k, sh (shanten), waits, live (tiles left that win) }. */
export function discardsOf(step) {
  const hand = handShown(step), melds = (step.melds || []).length, out = [];
  for (const k of new Set(hand)) {
    const rest = hand.slice();
    rest.splice(rest.indexOf(k), 1);
    const sh = shanten(countsOf(rest), melds), waits = sh === 0 ? waitsOf(rest, melds) : [];
    const left = unseen(step, rest);
    out.push({ k, sh, waits, live: waits.reduce((n, w) => n + left(w), 0), safe: k >= 27 && k < 34 && unseen(step, hand)(k) === 0 });
  }
  return out;
}
/** The kinds a discard criterion accepts at this step: ready (leaves a hand one tile from complete), shanten (fewest
 *  tiles from ready), waits (ready, with the most tiles left to win on), safe (a tile no one else can use). */
export function rightDiscards(step) {
  const all = discardsOf(step);
  if (step.crit === "ready") return all.filter(d => d.sh === 0).map(d => d.k);
  if (step.crit === "shanten") { const best = Math.min(...all.map(d => d.sh)); return all.filter(d => d.sh === best).map(d => d.k); }
  if (step.crit === "waits") { const best = Math.max(...all.map(d => d.live)); return all.filter(d => d.sh === 0 && d.live === best).map(d => d.k); }
  if (step.crit === "safe") return all.filter(d => d.safe).map(d => d.k);
  return [];
}
export function judgeDiscard(step, k) {
  const right = rightDiscards(step), d = discardsOf(step).find(x => x.k === k), name = E.tileName(k);
  if (right.includes(k)) return { ok: true, msg: step.then || "Right." };
  const how = d.sh < 0 ? "a complete hand" : d.sh === 0 ? `ready, ${d.live} tile${d.live === 1 ? "" : "s"} left to win on` : `${d.sh} from ready`;
  if (step.crit === "safe") return { ok: false, why: k >= 27 && k < 34 ? `${d.safe ? "" : `${name}: others may still hold a pair of it.`}` : `${name} can complete someone's run: suited tiles are never safe like that.` };
  return { ok: false, why: `${name} leaves you ${how}. ${step.why || "There's a better one."}` };
}

// ---------- the answers judged ----------
const predicates = {
  dragon: k => E.isDragon(k), wind: k => E.isWind(k), honour: k => E.isHonour(k), terminal: k => E.isTerminal(k), flower: k => E.isFlower(k),
};
function rightTiles(step) {
  const hand = handShown(step), what = step.pred;
  if (what.startsWith("suit:")) return hand.map((k, i) => (k < 27 && E.suitOf(k) === Number(what.slice(5)) ? i : -1)).filter(i => i >= 0);
  if (what === "own") { const w = E.windOf(sceneOf(step), 0); return hand.map((k, i) => (k === 34 + w || k === 38 + w ? i : -1)).filter(i => i >= 0); }
  return hand.map((k, i) => (predicates[what](k) ? i : -1)).filter(i => i >= 0);
}
/** What a multi-pick goal accepts: tiles (the indices of those that are `what`), pair, set, waits (the candidates that complete). */
export function rightPicks(step) {
  if (step.goal === "tiles") return rightTiles(step);
  if (step.goal === "waits") { const w = new Set(waitsOf(handShown(step), (step.melds || []).length)); return tilesOf(step.cands).map((k, i) => (w.has(k) ? i : -1)).filter(i => i >= 0); }
  return [];
}
/** A pick (indices into the shown tiles, or the candidates) judged. */
export function judgePick(step, picked) {
  const hand = handShown(step), melds = (step.melds || []).length;
  const idx = [...picked].sort((a, b) => a - b), ks = idx.map(i => hand[i]);
  if (step.goal === "pair") {
    if (idx.length !== 2) return { ok: false, why: "A pair is two tiles." };
    if (ks[0] !== ks[1]) return { ok: false, why: "A pair is two of the same tile." };
    return pairsOf(hand, melds).includes(ks[0]) ? { ok: true, msg: step.then || "Right." } : { ok: false, why: `${E.tileName(ks[0])} twice would leave the rest unable to make four sets: the pair is the other one.` };
  }
  if (step.goal === "set") {
    const t = setOf(ks);
    if (!t) return { ok: false, why: idx.length === 3 ? "Those three aren't a set: three in a row of one suit (a chow) or three alike (a pung)." : "A set is three tiles." };
    if (step.want && t !== step.want) return { ok: false, why: `That's a ${t}; this time pick a ${step.want}.` };
    return { ok: true, msg: step.then || `A ${t}.` };
  }
  const right = rightPicks(step), set = new Set(right);
  const wrong = idx.filter(i => !set.has(i)), missed = right.filter(i => !idx.includes(i));
  if (!wrong.length && !missed.length) return { ok: true, msg: step.then || "Right." };
  const cands = step.goal === "waits" ? tilesOf(step.cands) : hand;
  if (wrong.length) return { ok: false, why: step.goal === "waits" ? `${E.tileName(cands[wrong[0]])} doesn't complete the hand.` : `${E.tileName(cands[wrong[0]])} isn't ${step.what}.` };
  return { ok: false, why: step.goal === "waits" ? "There's another tile that completes it." : `You've missed ${missed.length}.` };
}
/** A button pressed (claim: its name; fan or pay: the number; taker: the seat) judged. */
export function judgeTap(step, value) {
  const s = sceneOf(step);
  if (step.goal === "claim") {
    const legal = legalNames(s);
    if (!legal.includes(value)) return { ok: false, why: whyNot(s, value) };
    if (value !== step.answer) return { ok: false, why: step.not?.[value] || "You can, but it isn't the best use here." };
    return { ok: true, msg: step.then || "Right." };
  }
  if (step.goal === "fan") {
    const r = scoreAt(s);
    const words = `${r.fan} fan: ${itemsText(r)}.`;
    return Number(value) === r.fan ? { ok: true, msg: `${words} ${step.then || ""}`.trim() } : { ok: false, why: Number(value) > r.fan ? "Fewer than that." : "More than that: count each item the hand earns." };
  }
  if (step.goal === "pay") {
    const r = winPay(s), got = r.pay[0];
    return Number(value) === got ? { ok: true, msg: `${r.fan} fan is a base of ${E.base(r.fan)}; ${r.how === "self" ? `each of the three pays 2 × ${E.base(r.fan)}` : `the thrower pays 4 × ${E.base(r.fan)}`}: ${got}. ${step.then || ""}`.trim() } : { ok: false, why: `Not ${value}: find the base for ${r.fan} fan, then ${r.how === "self" ? "two bases from each of three players" : "four bases from the thrower"}.` };
  }
  if (step.goal === "taker") {
    const t = takerOf(s, step.claims), name = t.seat < 0 ? "Nobody" : t.seat === 0 ? "You" : SEATS[t.seat].replace(/^the player /, "The player ").replace(/^./, c => c.toUpperCase());
    return value === name ? { ok: true, msg: step.then || "Right." } : { ok: false, why: step.why || "Look at the order again." };
  }
  return { ok: false, why: "?" };
}
/** The answer Hint shows for a tap goal. */
export function answerOf(step) {
  const s = sceneOf(step);
  if (step.goal === "claim") return step.answer;
  if (step.goal === "fan") return String(scoreAt(s).fan);
  if (step.goal === "pay") return String(winPay(s).pay[0]);
  if (step.goal === "taker") { const t = takerOf(s, step.claims); return t.seat < 0 ? "Nobody" : t.seat === 0 ? "You" : SEATS[t.seat].replace(/^the player /, "The player ").replace(/^./, c => c.toUpperCase()); }
  return null;
}
/** The options a tap goal offers. */
export function optionsOf(step) {
  if (step.goal === "claim") return step.opts || ["Pass", "Chow", "Pung", "Kong", "Win"];
  if (step.goal === "taker") return step.opts;
  return step.opts.map(String);
}
const PICKS = ["tiles", "pair", "set", "waits"];
/** What a person taps to answer an exercise right: selectors in order, and whether Check follows (for looking at the stage with real taps). */
export function planOf(step) {
  if (step.goal === "discard") return { clicks: [`.hc [data-k="${rightDiscards(step)[0]}"]`], submit: false };
  if (step.goal === "waits") return { clicks: rightPicks(step).map(i => `.hc [data-i="${i}"]`), submit: true };
  if (step.goal === "tiles") return { clicks: rightPicks(step).map(i => `.hc [data-i="${i}"]`), submit: true };
  if (step.goal === "set") return { clicks: findSet(step).map(i => `.hc [data-i="${i}"]`), submit: true };
  if (step.goal === "pair") { const k = pairsOf(handShown(step), (step.melds || []).length)[0], at = handShown(step).map((x, i) => (x === k ? i : -1)).filter(i => i >= 0).slice(0, 2); return { clicks: at.map(i => `.hc [data-i="${i}"]`), submit: true }; }
  return { clicks: [`[data-o="${answerOf(step)}"]`], submit: false };
}
const isTask = s => !!s.goal;

// ---------- the stage ----------
/**
 * The stage on the course's sheet: the tiles as the table draws them (a hand to pick from, the tile in the air, melds,
 * flowers, examples in rows) and, for an exercise, its buttons: tap tiles then Check, or tap the answer.
 */
export function tileStage() {
  let box = null, api = null, step = null, st = null;
  const tile = (k, o = {}) => {
    const cls = `hc-tile${o.sel ? " sel" : ""}${o.hint ? " hint" : ""}${o.gap ? " gap" : ""}`;
    const inner = tileSvg(k);
    return o.i == null ? `<span class="${cls}">${inner}</span>` : `<button type="button" class="${cls}" data-i="${o.i}">${inner}</button>`;
  };
  // a line of tiles: up to nine in one row, more in two rows of the same length (--per: tiles to a row)
  const lineOf = (inner, weight, cls = "") => `<span class="hc-line ${cls}" style="--per:${weight <= 9 ? Math.ceil(weight) : Math.ceil(weight / 2)}" data-per="${weight <= 9 ? Math.ceil(weight) : Math.ceil(weight / 2)}">${inner}</span>`;
  const line = ks => lineOf(ks.map(k => tile(k)).join(""), ks.length);
  const melds = list => list.map(m => `<span class="hc-meld${m.t === "kong" && !m.open ? " shut" : ""}">${meldTiles(m).map(k => tile(k)).join("")}</span>`).join("");
  function fit() {
    const hc = box.querySelector(".hc");
    if (!hc) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const W = box.clientWidth, Hh = box.clientHeight;
    const per = Math.max(1, ...[...hc.querySelectorAll("[data-per]")].map(l => Number(l.dataset.per)));
    // the largest tile at which the longest row fits the width, then the whole the height
    for (let t = Math.min(rem * 3.1, (W - 4) / (per * 1.12 + 0.2)); t >= rem * 1.05; t -= 1) {
      hc.style.setProperty("--hc-t", `${t.toFixed(1)}px`);
      if (hc.scrollHeight <= Hh - rem * 0.4 && hc.scrollWidth <= W + 1) break;
    }
  }
  return {
    mount(b, a) {
      box = b;
      api = a;
      box.addEventListener("click", e => {
        if (!step || st.done || !isTask(step)) return;
        const tl = e.target.closest("[data-i]"), op = e.target.closest("[data-o]");
        if (tl && PICKS.includes(step.goal)) {
          st.sel ??= new Set();
          const i = Number(tl.dataset.i);
          if (st.sel.has(i)) st.sel.delete(i); else st.sel.add(i);
          api.changed();
        } else if (tl && step.goal === "discard") {
          const k = Number(tl.dataset.k);
          st.tried = k;
          api.answer(judgeDiscard(step, k));
        } else if (op) {
          st.tried = op.dataset.o;
          api.answer(judgeTap(step, op.dataset.o));
        }
      });
    },
    task: isTask,
    submits: s => PICKS.includes(s.goal),
    ready: (s, t) => (s.goal === "pair" ? t.sel?.size === 2 : s.goal === "set" ? t.sel?.size === 3 : !!t.sel?.size),
    label: () => "Check",
    submit: (s, t) => judgePick(s, t.sel || []),
    hint(s, t) {
      t.show = true;
      if (s.goal === "discard") t.show = rightDiscards(s)[0];
      else if (PICKS.includes(s.goal)) {
        if (s.goal === "pair") { const k = pairsOf(handShown(s), (s.melds || []).length)[0], at = handShown(s).map((x, i) => (x === k ? i : -1)).filter(i => i >= 0); t.sel = new Set(at.slice(0, 2)); }
        else if (s.goal === "set") t.sel = new Set(findSet(s) || []);
        else t.sel = new Set(rightPicks(s));
      } else t.show = answerOf(s);
    },
    draw(s, t) {
      step = s;
      st = t;
      const parts = [], task = isTask(s) && !t.done;
      const sc = s.hand != null || s.discard != null || s.rob != null ? sceneOf(s) : null;
      if ((s.rows || []).length >= 3 && s.rows.every(r => r.text && !r.tiles && !r.melds)) parts.push(`<div class="hc-table">${s.rows.map(r => `<div class="hc-trow"><span>${esc(r.label)}</span><b>${esc(r.text)}</b></div>`).join("")}</div>`);
      else for (const r of s.rows || []) parts.push(`<div class="hc-row"><small>${esc(r.label || "")}${r.zh ? ` <i>${esc(r.zh)}</i>` : ""}</small>${r.tiles ? line(tilesOf(r.tiles)) : ""}${r.melds ? lineOf(melds(r.melds.map(meldOf)), r.melds.length * 3 * 0.8) : ""}${r.text ? `<b class="hc-word">${esc(r.text)}</b>` : ""}</div>`);
      if (sc) {
        const chips = [`You: ${E.WIND_NAMES[E.windOf(sc, 0)]}`, `Round: ${E.WIND_NAMES[sc.round]}`];
        if (!s.handLabel) parts.push(`<div class="hc-chips">${chips.map(c => `<span>${c}</span>`).join("")}</div>`);
        for (const [seat, text] of Object.entries(s.others || {})) parts.push(`<div class="hc-row"><small>${esc(SEATS[seat].replace(/^./, c => c.toUpperCase()))} holds</small>${line(tilesOf(text))}</div>`);
        if (s.discard) parts.push(`<div class="hc-row hc-air"><small>${esc(s.throwLabel || `${SEATS[s.from ?? 3].replace(/^./, c => c.toUpperCase())} throws`)}</small>${tile(sc.last.k)}</div>`);
        if (s.rob) parts.push(`<div class="hc-row hc-air"><small>${esc(SEATS[s.from ?? 2].replace(/^./, c => c.toUpperCase()))} adds to a pung</small>${tile(sc.last.k)}</div>`);
        if (s.seen) parts.push(`<div class="hc-row"><small>Already out on the table</small>${line(tilesOf(s.seen))}</div>`);
        if (s.flowers) parts.push(`<div class="hc-row"><small>Your flowers</small>${line(tilesOf(s.flowers))}</div>`);
        const shown = handShown(s);
        const mine = [];
        if (s.melds?.length) mine.push(`<span class="hc-melds">${melds(sc.seats[0].melds)}</span>`);
        const cands = s.goal === "waits" ? tilesOf(s.cands) : null;
        const picking = task && (PICKS.includes(s.goal) || s.goal === "discard");
        const right = new Set(t.show && s.goal === "tiles" ? rightTiles(s) : []);
        shown.forEach((k, i) => {
          const drawn = !!s.draw && i === shown.length - 1;
          mine.push(tile(k, { i: picking && s.goal !== "waits" ? i : null, sel: t.sel?.has(i) && s.goal !== "waits", hint: (s.goal === "discard" && t.show === k) || right.has(i), gap: drawn }).replace("<button ", `<button data-k="${k}" `));
        });
        const weight = shown.length + (s.melds || []).length * 2.4 + (s.draw ? 0.4 : 0);
        parts.push(`<div class="hc-row"><small>${esc(s.handLabel || (s.goal === "waits" ? "Your ready hand" : "Your tiles"))}</small>${lineOf(mine.join(""), weight, "hc-hand")}</div>`);
        if (cands) parts.push(`<div class="hc-row"><small>Which complete it?</small>${lineOf(cands.map((k, i) => tile(k, { i, sel: t.sel?.has(i), hint: t.show && rightPicks(s).includes(i) })).join(""), cands.length)}</div>`);
      }
      if (task && ["claim", "fan", "pay", "taker"].includes(s.goal)) {
        parts.push(`<div class="hc-opts">${optionsOf(s).map(o => `<button type="button" class="hc-opt${t.show === o ? " hint" : ""}${t.tried === o && t.show !== o ? " tried" : ""}" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>`);
      }
      box.innerHTML = `<div class="hc">${parts.join("")}</div>`;
      fit();
    },
  };
}
