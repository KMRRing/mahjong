// Mahjong's computer players, and the coach that explains them. A player sees what a seat at the table sees (its own
// tiles, everything shown, the discards, the wall's count) and nothing else, and decides by value:
//  - routes: a hand has to reach the minimum fan, so it is read against the routes that get there (any hand, a half
//    or full flush in each suit, all pungs, thirteen orphans), each with its shanten (tiles from ready) and its live
//    tiles (the unseen copies that would bring it closer)
//  - chance: how likely each route is to win before the wall runs dry or someone else wins, worked out stage by stage
//    from its live tiles (a ready hand from its actual waits, each scored by the real rules), and what it would pay
//  - danger: each opponent's chance of being ready (by turn and calls, as measured in play), whether they can take a
//    discard at all (a hand that can't reach the minimum off one can't), the suit their calls point to, the tiles
//    passed since they drew (safe), and what dealing in costs beyond what their self-draw would cost anyway
//  - calls, kongs, wins and flowers decided the same way, and every decision explained for the learning mode.
// Rollouts were tried first: at four or five tiles from ready a few hundred playouts are mostly noise, and the bots
// that used them dawdled; this reckoning is exact for a ready hand and smooth everywhere else.
import { counts, complete, orphans, scoreWin, windOf, wallLeft, isHonour, isWind, isDragon, isTerminal, suitOf, base, tileName, SUIT_NAMES, WIND_NAMES, legal, rng, noFan, payNoFan } from "./hong-engine.js";

// ---------- what a seat can see ----------
/** The seat's own tiles and everything public: who has shown what, the discards, the wall's count; never another hand. */
export function view(state, seat) {
  const me = state.seats[seat];
  const seen = new Array(34).fill(0);
  for (const k of me.hand) seen[k]++;
  for (const s of state.seats) {
    for (const m of s.melds) for (const k of meldTiles(m)) seen[k]++;
    for (const d of s.river) if (d.by === undefined) seen[d.k]++;
  }
  const unseen = seen.map(n => Math.max(0, 4 - n));
  const others = [0, 1, 2, 3].filter(o => o !== seat).map(o => ({
    seat: o, melds: state.seats[o].melds, flowers: state.seats[o].flowers, river: state.seats[o].river,
    concealed: state.seats[o].hand.length, wind: windOf(state, o),
  }));
  return {
    seat, hand: me.hand.slice(), melds: me.melds, flowers: me.flowers, wind: windOf(state, seat), round: state.round, dealer: state.dealer,
    opts: state.opts, wall: wallLeft(state), unseen, others, phase: state.phase, last: state.last, drawn: state.drawn,
    passBlock: me.passBlock, liable: state.liable, flags: state.flags, log: state.log, turn: state.turn, scores: state.scores,
  };
}
const meldTiles = m => (m.t === "chow" ? [m.k, m.k + 1, m.k + 2] : m.t === "kong" ? [m.k, m.k, m.k, m.k] : [m.k, m.k, m.k]);
const isValue = (v, k) => isDragon(k) || k - 27 === v.wind || k - 27 === v.round;
const tilesOf = c => { const out = []; for (let k = 0; k < 34; k++) for (let n = 0; n < c[k]; n++) out.push(k); return out; };

// ---------- shanten: tiles from ready, by suit with memory ----------
// Each suit's tiles give some sets, partial sets (a pair, two in a row, two with a gap) and maybe a pair to keep as
// the head; every combination worth having is worked out once per pattern of nine counts and remembered.
const SUIT_MEMO = new Map();
function suitOptions(c, off) {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 5 + c[off + i];
  let opts = SUIT_MEMO.get(key);
  if (opts) return opts;
  const a = Array.from({ length: 9 }, (_, i) => c[off + i]), found = new Map();
  (function rec(i, s, p, h) {
    while (i < 9 && a[i] === 0) i++;
    if (i === 9) { found.set(s * 100 + p * 10 + h, [s, p, h]); return; }
    if (a[i] >= 3) { a[i] -= 3; rec(i, s + 1, p, h); a[i] += 3; }
    if (i <= 6 && a[i + 1] && a[i + 2]) { a[i]--; a[i + 1]--; a[i + 2]--; rec(i, s + 1, p, h); a[i]++; a[i + 1]++; a[i + 2]++; }
    if (a[i] >= 2 && !h) { a[i] -= 2; rec(i, s, p, 1); a[i] += 2; }
    if (a[i] >= 2) { a[i] -= 2; rec(i, s, p + 1, h); a[i] += 2; }
    if (i <= 7 && a[i + 1]) { a[i]--; a[i + 1]--; rec(i, s, p + 1, h); a[i]++; a[i + 1]++; }
    if (i <= 6 && a[i + 2]) { a[i]--; a[i + 2]--; rec(i, s, p + 1, h); a[i]++; a[i + 2]++; }
    a[i]--; rec(i, s, p, h); a[i]++;
  })(0, 0, 0, 0);
  // keep only the options nothing else beats on sets, partials and head together
  const all = [...found.values()];
  opts = all.filter(x => !all.some(y => y !== x && y[0] >= x[0] && y[0] + y[1] >= x[0] + x[1] && y[2] >= x[2] && (y[0] > x[0] || y[0] + y[1] > x[0] + x[1] || y[2] > x[2])));
  SUIT_MEMO.set(key, opts);
  return opts;
}
function honourOptions(c) {
  let s = 0, pairs = 0;
  for (let k = 27; k < 34; k++) { if (c[k] >= 3) s++; else if (c[k] === 2) pairs++; }
  // a pair of honours is either the head or a partial set
  return pairs ? [[s, pairs, 0], [s, pairs - 1, 1]] : [[s, 0, 0]];
}
/** Standard shanten of concealed counts with `m` sets already down: −1 complete, 0 ready, n from ready. */
export function shanten(c, m) {
  const groups = [suitOptions(c, 0), suitOptions(c, 9), suitOptions(c, 18), honourOptions(c)];
  let best = 8;
  const need = 4 - m;
  for (const a of groups[0]) for (const b of groups[1]) for (const d of groups[2]) for (const e of groups[3]) {
    const h = a[2] + b[2] + d[2] + e[2];
    if (h > 1) continue;
    const s = a[0] + b[0] + d[0] + e[0], p = a[1] + b[1] + d[1] + e[1];
    const sets = Math.min(s, need), parts = Math.min(p + Math.max(0, s - need), need - sets);
    const v = 8 - 2 * (sets + m) - parts - h;
    if (v < best) best = v;
  }
  return best;
}
/** Shanten for all pungs: pungs and pairs only. */
function shantenPungs(c, m) {
  let pungs = m, pairs = 0;
  for (let k = 0; k < 34; k++) { if (c[k] >= 3) pungs++; else if (c[k] === 2) pairs++; }
  return 8 - 2 * Math.min(pungs, 4) - Math.min(pairs, 5 - Math.min(pungs, 4));
}
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
function shantenOrphans(c, m) {
  if (m) return 9;
  let kinds = 0, pair = 0;
  for (const k of ORPHANS) { if (c[k]) kinds++; if (c[k] >= 2) pair = 1; }
  return 13 - kinds - pair;
}

// ---------- routes: the ways a hand can reach the minimum ----------
// any: whatever comes (its fan from flowers, the concealed hand, self-draw, value pungs); flush s: one suit (half with
// honours, full without); pungs: all pungs; orphans: thirteen orphans. With no fan every win pays alike, so a flush or
// all pungs is only a slower way to the same win: any hand, or the orphans' other shape.
export const ROUTES = ["any", "flush0", "flush1", "flush2", "full0", "full1", "full2", "pungs", "orphans"];
const NOFAN_ROUTES = ["any", "orphans"];
const allows = (route, k) => {
  if (route.startsWith("flush")) return isHonour(k) || suitOf(k) === Number(route[5]);
  if (route.startsWith("full")) return k < 27 && suitOf(k) === Number(route[4]);
  if (route === "orphans") return isHonour(k) || isTerminal(k);
  return true;
};
function meldsFit(route, melds) {
  if (route.startsWith("flush") || route.startsWith("full")) return melds.every(m => meldTiles(m).every(k => allows(route, k)));
  if (route === "pungs") return melds.every(m => m.t !== "chow");
  if (route === "orphans") return melds.length === 0;
  return true;
}
/** A route's shanten for concealed counts: tiles outside it count as useless. */
function routeShanten(route, c, melds) {
  if (!meldsFit(route, melds)) return 9;
  const m = melds.length;
  if (route === "any") return shanten(c, m);
  if (route === "pungs") return shantenPungs(c, m);
  if (route === "orphans") return shantenOrphans(c, m);
  const r = c.slice();
  for (let k = 0; k < 34; k++) if (!allows(route, k)) r[k] = 0;
  return shanten(r, m);
}
/** Live tiles (unseen copies) that would bring the route's shanten down, and their kinds. */
function ukeire(v, route, c, sh) {
  let n = 0;
  const kinds = [];
  for (let k = 0; k < 34; k++) {
    if (!v.unseen[k] || !allows(route, k) || c[k] >= 4) continue;
    c[k]++;
    const s = routeShanten(route, c, v.melds);
    c[k]--;
    if (s < sh) { n += v.unseen[k]; kinds.push(k); }
  }
  return { n, kinds };
}

// ---------- the knobs, tuned in the arena (tools/hong-arena.mjs) ----------
// discardRate: how likely an opponent's discard is a given unseen tile, against a draw (they keep what they need);
// oppWin: a ready opponent's chance of winning in a go-round; ready: how readily opponents are taken to be ready;
// danger: how much a point of danger weighs against a point of value; claimMargin, claimBonus: how much better a call
// must look than letting the tile go.
export const TUNE = { discardRate: 0.7, oppWin: 0.13, ready: 1, danger: 1, claimMargin: 1, claimBonus: 0.3, eta: 1, calls: 1, flex: 0.3 };
// No fan pays a win four to twelve points where the fan game's minimum pays thirty-two and more: the margins below that
// are counted in points (a call's bonus, the discards alike enough to choose among, what's worth saying) shrink by this
const UNIT = 0.15;
// The two strengths, as what each adds to the knobs. hard: a discard win passed up when waiting for the self-draw is
// worth much more (wait), its discards nudged at random only among those within a quarter of a point (near); medium:
// takes every win, defends at six tenths of hard's weight (defence), and wanders among discards within five points,
// the better likelier (temper).
export const SKILLS = {
  hard: { wait: 1, near: 0.25, temper: 0 },
  medium: { wait: 0, near: 5, temper: 2.5, defence: 0.6 },
};

// ---------- the table as a seat reads it ----------
function context(v, tune = TUNE, extraDraws = 0) {
  const ts = threats(v, tune);
  const U = Math.max(1, v.unseen.reduce((a, b) => a + b, 0));
  const D = Math.max(1, Math.round(v.wall / 4) + extraDraws);
  // the chance, each go-round, that someone else ends the hand first
  const h = Math.min(0.4, ts.reduce((n, t) => n + t.readyAny * tune.oppWin, 0));
  // late in the hand the others hold on to what might be dangerous: a wait comes off a discard less often
  const discardRate = tune.discardRate * Math.min(1, 0.3 + v.wall / 80);
  const nofan = noFan(v.opts);
  return { ts, U, D, h, tune, discardRate, probe: probe(v), flowerDist: flowerFan(v, D), min: v.opts.minFan, cap: v.opts.cap, nofan, unit: nofan ? UNIT : 1, ...(nofan ? winsNoFan(v) : {}) };
}
/** No fan: what a win brings this seat, by self-draw and off a discard (the discarder's share averaged over who lets it go). */
function winsNoFan(v) {
  const others = [0, 1, 2, 3].filter(o => o !== v.seat);
  return { winS: payNoFan(v.dealer, v.seat, true, -1)[v.seat], winD: others.reduce((a, o) => a + payNoFan(v.dealer, v.seat, false, o)[v.seat], 0) / 3 };
}
/** A seat at the scoring table, for scoring this seat's possible wins: its tiles swapped in for each. */
function probe(v) {
  const seats = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], flowers: [] }));
  seats[v.seat] = { hand: [], melds: v.melds, flowers: v.flowers };
  return { opts: v.opts, round: v.round, dealer: v.dealer, seats, flags: { heavenly: false, earthly: false, afterKong: false, kongChain: 0, lastDraw: false, finalDiscard: false } };
}
/** The fan flowers will bring by the end, as chances of 0, 1, 2…: one's own (正花) kept and found, or none at all (無花)
 *  if none come (the flowers still hidden come, roughly, as a Poisson count over the draws left). */
function flowerFan(v, D) {
  if (!v.opts.flowers) return [1];
  const shown = new Set([...v.flowers, ...v.others.flatMap(o => o.flowers)]);
  const hidden = 8 - shown.size, W = Math.max(1, v.wall), own = [34 + v.wind, 38 + v.wind];
  const ownLeft = own.filter(k => !shown.has(k)).length;
  const lo = Math.min(D, W) * ownLeft / W, lx = Math.min(D, W) * (hidden - ownLeft) / W;   // own and other flowers to come
  const po = [Math.exp(-lo), lo * Math.exp(-lo)]; po.push(Math.max(0, 1 - po[0] - po[1]));  // own: 0, 1, 2+
  const set = s0 => [0, 1, 2, 3].every(i => v.flowers.includes(s0 + i));
  if (!v.flowers.length) {
    const none = Math.exp(-lx);
    // no flower drawn at all: 無花, one fan; else what own flowers came
    return [po[0] * (1 - none), po[0] * none + po[1], po[2]];
  }
  const have = (set(34) ? 2 : v.flowers.includes(own[0]) ? 1 : 0) + (set(38) ? 2 : v.flowers.includes(own[1]) ? 1 : 0);
  const out = new Array(have + 3).fill(0);
  po.forEach((p, j) => { out[have + j] += p; });
  return out;
}
/** The distribution of a sum: two lists of chances by fan. */
function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
const fixed = f => { const out = new Array(f + 1).fill(0); out[f] = 1; return out; };
const maybe = (p, f) => { const out = new Array(f + 1).fill(0); out[0] = 1 - p; out[f] += p; return out; };

// ---------- the chance of winning, and what it pays ----------
/**
 * The fan a hand on a route would show off a discard (a self-draw adds one), as chances by fan: what's certain (the
 * route's pattern, value honours down or held three, the concealed hand while it lasts) and what might come (flowers,
 * a value honour pair punged, all chows), each by its chance.
 */
function fanDist(v, route, c, ctx) {
  if (route === "orphans") return fixed(13);
  let sure = 0, dist = ctx.flowerDist;
  if (!v.melds.some(m => m.open)) sure += 1;                      // concealed (門前清), if it stays so (a concealed kong keeps it)
  const full = route.startsWith("full");
  if (!full) for (let k = 27; k < 34; k++) if (isValue(v, k)) {
    const worth = isWind(k) && k - 27 === v.wind && k - 27 === v.round ? 2 : 1;
    const n = c[k] || 0, down = v.melds.some(m => m.t !== "chow" && m.k === k);
    if (down || n >= 3) sure += worth;
    else if (n === 2 && v.unseen[k]) dist = convolve(dist, maybe(v.unseen[k] >= 2 ? 0.55 : 0.35, worth));   // punged if one comes
    else if (n === 1 && v.unseen[k] >= 2) dist = convolve(dist, maybe(0.06, worth));
  }
  if (route.startsWith("flush")) sure += 3;
  else if (full) sure += 7;
  else if (route === "pungs") sure += 3;
  else if (v.melds.every(m => m.t === "chow")) dist = convolve(dist, maybe(0.25, 1));   // all chows (平糊), perhaps
  return convolve(dist, fixed(sure));
}
/** What a win on a route would pay, and how likely it reaches the minimum, off a discard and by self-draw. */
function payOf(dist, ctx) {
  if (ctx.nofan) return { rD: 1, vD: ctx.winD, rS: 1, vS: ctx.winS, fan: 0 };   // any hand, every win alike
  let rD = 0, vD = 0, rS = 0, vS = 0;
  dist.forEach((p, f) => {
    if (!p) return;
    if (f >= ctx.min) { rD += p; vD += p * 4 * base(Math.min(ctx.cap, f)); }
    if (f + 1 >= ctx.min) { rS += p; vS += p * 6 * base(Math.min(ctx.cap, f + 1)); }
  });
  const mean = dist.reduce((a, p, f) => a + p * f, 0);
  return { rD, vD: rD ? vD / rD : 0, rS, vS: rS ? vS / rS : 0, fan: mean };
}
// the live tiles a hand typically has at each shanten, as a share of the tiles unseen, by kind of route (at 0: its
// waits), for the stages still to come; measured in the bots' own play
const TYPICAL = { any: [0.07, 0.19, 0.3, 0.4, 0.48, 0.58, 0.64, 0.66, 0.66], flush: [0.05, 0.16, 0.2, 0.22, 0.24, 0.26, 0.27, 0.28, 0.28],
  full: [0.04, 0.12, 0.14, 0.15, 0.16, 0.18, 0.2, 0.2, 0.2], pungs: [0.04, 0.08, 0.13, 0.2, 0.22, 0.3, 0.3, 0.3, 0.3], orphans: [0.03, 0.09, 0.13, 0.15, 0.17, 0.25, 0.25, 0.25, 0.25] };
const family = route => (route.startsWith("flush") ? "flush" : route.startsWith("full") ? "full" : route);
// how fast each kind of route actually comes on, against its live tiles: a plain hand's count overstates it (the bot
// keeps honours for their fan, and pairs of them improve little), measured in the bots' own play
const ETA = { any: [1, 0.9, 0.47, 0.47, 0.47, 0.47, 0.47, 0.47, 0.47], flush: [1, 0.95, 0.75, 0.88, 0.85, 0.85, 0.85, 0.85, 0.85],
  full: [1, 0.9, 0.9, 1, 1, 1, 1, 1, 1], pungs: [1, 0.75, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6], orphans: [1, 0.85, 0.85, 0.8, 0.85, 0.9, 0.9, 0.9, 0.9] };
// with no fan a plain hand two or more from ready is reckoned slower still: against the reckoning above, a seat that
// did so came out about a point a hand ahead over 3,000 hands (0.47, 0.35, 0.25, 0.2 and 0.12 tried; 0.2 best)
const ETA_NOFAN_ANY = [1, 0.9, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
// a ready hand is named by its most particular route: "a half flush in bamboo, ready", not "a plain hand"
const SPECIFIC = { any: 0, orphans: 1, pungs: 2, flush: 3, full: 4 };
/**
 * Win chance and value, go-round by go-round: the stages still to make (each made with the chance its live tiles
 * come, by draw or by call), then, once ready, the chance a winning tile comes by self-draw or off a discard; all the
 * while the chance someone else wins first and the draws left. ready: { pS, vS, pD, vD } per go-round.
 */
function chance(qs, ready, D, h) {
  const m = qs.length, mass = new Float64Array(m + 1);
  mass[0] = 1;
  let alive = 1, p = 0, self = 0, ev = 0;
  const pw = Math.min(0.95, ready.pS + ready.pD);
  for (let t = 0; t < D; t++) {
    alive *= 1 - h;
    const r = mass[m];
    if (r > 1e-9 && pw > 0) {
      p += r * pw * alive; self += r * ready.pS * alive;
      ev += r * alive * (ready.pS * ready.vS + ready.pD * ready.vD);
      mass[m] = r * (1 - pw);
    }
    for (let i = m - 1; i >= 0; i--) { const mv = mass[i] * qs[i]; mass[i] -= mv; mass[i + 1] += mv; }
  }
  return { p, self, ev };
}
/** A hand on a flush with two sets or more down in its suit: the others see it coming and keep that suit back. */
const showsFlush = v => v.melds.length >= 2 && new Set(v.melds.flatMap(m => meldTiles(m)).filter(k => k < 27).map(suitOf)).size === 1;
/** A ready hand's waits, each scored as it would be won: per go-round, the chance of a win by self-draw and off a
 *  discard, and what each pays. */
function readyParams(v, c, ctx) {
  const tiles = tilesOf(c), seat = ctx.probe.seats[v.seat], need = 4 - v.melds.length;
  const beta = 3 * ctx.discardRate * (showsFlush(v) ? 0.35 : 1);
  const waits = [];
  let nS = 0, sS = 0, nD = 0, sD = 0;
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    const ok = complete(c, need) || (need === 4 && orphans(c));
    c[k]--;
    if (!ok) continue;
    if (ctx.nofan) {                                              // every wait alike: what a win pays here
      const n = v.unseen[k];
      waits.push({ k, n, fanD: 0, fanS: 0 });
      if (n) { nS += n; sS += n * ctx.winS; if (!v.passBlock) { nD += n; sD += n * ctx.winD; } }
      continue;
    }
    seat.hand = tiles;
    const d = scoreWin(ctx.probe, { seat: v.seat, tile: k, how: "discard" }).fan;
    seat.hand = [...tiles, k];
    const s = scoreWin(ctx.probe, { seat: v.seat, tile: k, how: "self" }).fan;
    const n = v.unseen[k];
    waits.push({ k, n, fanD: d, fanS: s });
    if (!n) continue;
    if (s >= ctx.min) { nS += n; sS += n * 6 * base(s); }
    if (d >= ctx.min && !v.passBlock) { nD += n; sD += n * 4 * base(d); }
  }
  const ready = { pS: nS / ctx.U, vS: nS ? sS / nS : 0, pD: beta * nD / ctx.U, vD: nD ? sD / nD : 0 };
  return { ready, waits, fan: waits.reduce((f, w) => Math.max(f, w.fanD), -1), selfOnly: nS > 0 && nD === 0 };
}
/** A ready hand: its waits, each scored as it would be won, and the chance of each coming. */
function readyChance(v, c, ctx) {
  const r = readyParams(v, c, ctx);
  return { ...chance([], r.ready, ctx.D, ctx.h), waits: r.waits, fan: r.fan, selfOnly: r.selfOnly };
}
/**
 * A hand one from ready, worked out exactly: every tile that would make it ready, the ready hand it would make (the
 * discard chosen by what its waits would bring, each scored by the rules), weighted by the tile's live copies. The
 * routes' rough reckoning is too kind here: one tile from ready, whether the waits will reach the minimum is the whole
 * question, and this answers it.
 */
function oneAway(v, c, ctx) {
  const m = v.melds.length;
  let n = 0, pS = 0, vS = 0, pD = 0, vD = 0, fan = -1;
  const kinds = [];
  for (let k = 0; k < 34; k++) {
    const live = v.unseen[k];
    if (!live || c[k] >= 4) continue;
    c[k]++;
    let best = null;
    if (shanten(c, m) <= 0) {
      for (let j = 0; j < 34; j++) {
        if (!c[j] || j === k) continue;
        c[j]--;
        if (shanten(c, m) === 0) {
          const r = readyParams(v, c, ctx), worth = r.ready.pS * r.ready.vS + r.ready.pD * r.ready.vD;
          if (!best || worth > best.worth) best = { ...r, worth };
        }
        c[j]++;
      }
    }
    c[k]--;
    if (!best) continue;
    n += live; kinds.push(k);
    pS += live * best.ready.pS; vS += live * best.ready.pS * best.ready.vS;
    pD += live * best.ready.pD; vD += live * best.ready.pD * best.ready.vD;
    fan = Math.max(fan, best.fan);
  }
  if (!n) return null;
  const ready = { pS: pS / n, vS: pS ? vS / pS : 0, pD: pD / n, vD: pD ? vD / pD : 0 };
  const cf = callFactor(m, "any", ctx) * ctx.tune.calls;
  const q = Math.min(0.8, n / ctx.U * (1 + cf) * 0.9 * ctx.tune.eta);
  return { ...chance([q], ready, ctx.D, ctx.h), sh: 1, uk: { n, kinds }, fan };
}
/**
 * How readily a hand takes a discard to move on, as a share more chances than its draws alone: a hand already open, or
 * after a pattern, calls what it needs; a concealed plain hand at the fan game seldom does, since calling costs it the
 * concealed fan. With no fan nothing is lost by calling, so a concealed hand calls as readily as an open one: reckoned
 * slower, it made opening the hand look like speed, and the coach once advised chowing 5 dots with 3 and 4 out of a
 * made 2-3-4 (October 2026). Thirteen orphans calls nothing.
 */
const callFactor = (melds, route, ctx) => (route === "orphans" ? 0 : melds || route !== "any" || ctx.nofan ? 0.3 : 0.1);
/** One route's chance from its shanten and live tiles. */
function routeChance(v, route, sh, uk, c, ctx) {
  const T = TYPICAL[family(route)], t = ctx.tune;
  const cf = callFactor(v.melds.length, route, ctx) * t.calls;
  const qs = [];
  const eta = ctx.nofan && route === "any" ? ETA_NOFAN_ANY : ETA[family(route)];
  for (let s = sh; s >= 1; s--) qs.push(Math.min(0.8, (s === sh ? uk / ctx.U : T[s]) * (1 + cf) * eta[s] * t.eta));
  const pay = payOf(ctx.nofan ? null : fanDist(v, route, c, ctx), ctx), n0 = T[0];
  const ready = { pS: pay.rS * n0, vS: pay.vS, pD: pay.rD * 3 * ctx.discardRate * (showsFlush(v) ? 0.35 : 1) * n0, vD: pay.vD };
  return { ...chance(qs, ready, ctx.D, ctx.h), fan: Math.round(pay.fan * 10) / 10 };
}
/**
 * What a hand (13 tiles' worth, waiting to draw) is worth: its best route, with { route, sh, uk, p, self, ev, fan },
 * and the others it could still take.
 */
export function evaluate(v, c, ctx) {
  const routes = [];
  let ready = null, near;
  for (const route of ctx.nofan ? NOFAN_ROUTES : ROUTES) {
    const sh = routeShanten(route, c, v.melds);
    if (sh >= 7) continue;
    if (sh <= 0) {                                                // ready on this route: the hand's waits, exactly
      if (!ready) ready = { ...readyChance(v, c, ctx), sh: 0 };
      routes.push({ route, ...ready, uk: { n: ready.waits.reduce((a, w) => a + w.n, 0), kinds: ready.waits.map(w => w.k) } });
      continue;
    }
    if (sh === 1 && route !== "orphans") {                        // one from ready: exactly, whatever the route
      if (near === undefined) near = oneAway(v, c, ctx);
      if (near) { routes.push({ route, ...near }); continue; }
    }
    const uk = ukeire(v, route, c, sh);
    routes.push({ route, sh, uk, ...routeChance(v, route, sh, uk.n, c, ctx) });
  }
  routes.sort((a, b) => b.ev - a.ev || a.sh - b.sh || SPECIFIC[family(b.route)] - SPECIFIC[family(a.route)]);
  const best = routes[0] || { route: "any", sh: 8, uk: { n: 0, kinds: [] }, p: 0, self: 0, ev: 0, fan: 0 };
  // a hand that keeps a second route open is worth more than one that has staked everything on its first: early on
  // that's the difference between breaking a made set for a far flush and letting a stray tile go
  const second = routes.find(r => r !== best && r.route !== best.route);
  return { ...best, value: best.ev + ctx.tune.flex * (second?.ev || 0), routes };
}

// ---------- danger: what each opponent is up to ----------
// How often an opponent is ready to win off a discard, by sets called and turns played (measured in the bots' own
// play); and how often ready to win at all, self-draws included (for the chance the hand ends before mine)
const READY = [[0.12, 0, 0.006], [0.22, 0, 0.01], [0.42, 0.01, 0.017], [0.75, 0.3, 0.025]];
const readyDisc = (m, t) => (m >= 4 ? 1 : Math.min(READY[m][0], READY[m][1] + READY[m][2] * t));
const readyAny = (m, t) => (m >= 4 ? 1 : m === 3 ? Math.min(0.8, 0.2 + 0.02 * t) : Math.min(0.5, 0.012 * t + 0.04 * m));
/** Per opponent: how likely ready, whether they can win off a discard at all, the suit they're on, what dealing in costs. */
export function threats(v, tune = TUNE) {
  const out = [];
  const passed = passedSince(v), cap = v.opts.cap;
  // my discard after the wall's last tile is the hand's last: a win on it earns one fan more (海底), so more can take it
  const lastDiscard = v.wall === 0 ? 1 : 0;
  for (const o of v.others) {
    const melds = o.melds, turns = o.river.length;
    const suits = new Set(melds.flatMap(m => meldTiles(m)).filter(k => k < 27).map(suitOf));
    const honoursDown = melds.some(m => isHonour(m.k) && m.t !== "chow");
    // what they show: value honours and flowers, and the most their concealed tiles could add
    const value = melds.filter(m => m.t !== "chow" && (isDragon(m.k) || m.k - 27 === o.wind || m.k - 27 === v.round)).reduce((n, m) => n + 1 + (isWind(m.k) && m.k - 27 === o.wind && m.k - 27 === v.round ? 1 : 0), 0);
    let fanNow = value;
    if (v.opts.flowers) fanNow += o.flowers.length ? o.flowers.filter(k => k === 34 + o.wind || k === 38 + o.wind).length : 1;
    const flushSuit = melds.length >= 2 && suits.size === 1 ? [...suits][0] : -1;
    let maxFan = fanNow + (melds.some(m => m.open) ? 0 : 1) + lastDiscard;
    if (suits.size <= 1) maxFan += suits.size === 1 && honoursDown ? 3 : 7;   // still could be a flush
    if (melds.every(m => m.t !== "chow")) maxFan += 3;            // still could be all pungs
    else if (melds.every(m => m.t === "chow")) maxFan += 1;       // all chows
    maxFan += melds.length < 4 ? 2 : 0;                           // hidden value pungs, at most a couple
    const dragonSets = melds.filter(m => m.t !== "chow" && isDragon(m.k)).length;
    if (noFan(v.opts)) {
      // no fan: any hand takes a discard and none is worth chasing a flush for; dealing in costs twice my share (doubled
      // when the dealer is the winner or me), less what I'd pay anyway if they won another way
      const x = o.seat === v.dealer || v.seat === v.dealer ? 2 : 1;
      out.push({
        seat: o.seat, canTake: true, flushSuit: -1, fanEst: 0, dragonSets, melds: melds.length, river: o.river, passed: passed[o.seat],
        ready: Math.min(1, readyDisc(melds.length, turns) * tune.ready), readyAny: Math.min(1, readyAny(melds.length, turns) * tune.ready),
        pungish: melds.length >= 2 && melds.every(m => m.t !== "chow"), loss: 2 * x - 0.3 * 1.5 * x,
      });
      continue;
    }
    const canTake = maxFan >= v.opts.minFan;
    const fanEst = Math.min(cap, Math.max(v.opts.minFan, fanNow + (flushSuit >= 0 ? (honoursDown ? 3 : 5) : 0) + (melds.length ? 1 : 2)));
    out.push({
      seat: o.seat, canTake, flushSuit, fanEst, dragonSets, melds: melds.length, river: o.river, passed: passed[o.seat],
      ready: canTake ? Math.min(1, readyDisc(melds.length, turns) * tune.ready + (flushSuit >= 0 ? 0.08 : 0)) : 0,
      readyAny: Math.min(1, readyAny(melds.length, turns) * tune.ready),
      pungish: melds.length >= 2 && melds.every(m => m.t !== "chow"),
      // dealing in costs four times their base, less what their self-draw would have cost anyway
      loss: 4 * base(fanEst) - 0.3 * 2 * base(Math.min(cap, fanEst + 1)),
    });
  }
  return out;
}
/** The tiles discarded since each seat last drew (and not claimed): it couldn't, or wouldn't, win on them. */
function passedSince(v) {
  const since = [new Set(), new Set(), new Set(), new Set()];
  for (const e of v.log || []) {
    if (e.e === "draw") since[e.seat] = new Set();
    else if (e.e === "discard") { for (let o = 0; o < 4; o++) if (o !== e.seat) since[o].add(e.k); }
    else if (e.e === "pung" || e.e === "kong" || e.e === "chow") since[e.seat] = new Set();
  }
  return since;
}
/** The chance a ready opponent is waiting on k. */
function hitChance(v, k, t) {
  if (t.passed.has(k)) return 0;                                   // passed since they drew: safe (糊一唔糊二)
  const live = v.unseen[k];
  let p;
  if (isHonour(k)) p = [0, 0.025, 0.055, 0.08, 0.08][live];
  else {
    const i = k % 9;
    p = i === 0 || i === 8 ? 0.045 : i === 1 || i === 7 ? 0.055 : 0.068;
    if (!live) p *= 0.7;                                           // only a chow can still want it
  }
  if (t.melds >= 4) p = isHonour(k) ? [0, 0.04, 0.08, 0.1, 0.1][live] : live ? 0.035 : 0;   // a single wait on a pair
  if (t.flushSuit >= 0) p *= isHonour(k) ? 1.3 : suitOf(k) === t.flushSuit ? 2.4 : 0.15;
  if (t.pungish) p *= isHonour(k) || isTerminal(k) ? 1.4 : 0.75;
  if (t.river.some(d => d.k === k)) p *= 0.6;                      // no furiten here, but a tile they let go is less likely wanted
  return Math.min(0.4, p);
}
/** How dangerous discarding k is: the points it's expected to cost. */
function danger(v, k, ts) {
  let d = 0;
  for (const t of ts) {
    d += t.ready * hitChance(v, k, t) * t.loss;
    if (noFan(v.opts)) continue;                                   // no liability without fan
    // liability (包): handing them a fourth set, or a third dragon set, makes me pay the whole of their self-drawn win
    const pairLikely = v.unseen[k] >= 2 ? 0.12 : 0;
    const chowable = t.seat === (v.seat + 1) % 4 && k < 27 ? 0.12 : 0;
    if (t.melds === 3) d += (pairLikely + chowable) * 0.35 * 4 * base(Math.min(v.opts.cap, t.fanEst + 1));
    if (t.dragonSets === 2 && isDragon(k) && v.unseen[k] >= 2) d += 0.3 * 0.5 * 4 * base(v.opts.cap);
  }
  return d;
}

// ---------- decisions ----------
/** Weighs every discard: { k, route, sh, uk, p, ev, risk, score, routes }, best first. */
export function weighDiscards(v, { tune = TUNE, ctx = context(v, tune) } = {}) {
  const c = counts(v.hand);
  const rows = [...new Set(v.hand)].map(k => {
    c[k]--;
    const e = evaluate(v, c, ctx);
    c[k]++;
    const risk = danger(v, k, ctx.ts) * tune.danger, follow = followWorth(v, k, ctx);
    return { k, ...e, risk, follow, score: e.value - risk + follow };
  });
  return rows.sort((a, b) => b.score - a.score || a.risk - b.risk || a.sh - b.sh || b.uk.n - a.uk.n || a.k - b.k);
}

/**
 * No fan, 跟莊: the dealer's first discard followed by the same tile from each of the others in turn, the dealer pays
 * each of them 1. Following, while all before have: worth that point by the chance the rest follow too (the last of
 * them, certain; the others are taken to follow about a third of the time). The dealer's first discard: what being
 * followed would cost, by the chance each of the others holds the tile and lets it go.
 */
function followWorth(v, k, ctx) {
  const f = v.flags;
  if (!ctx.nofan || !f || f.calls > 0 || f.follow < 0 || f.follow > 3) return 0;
  if (f.follow === 0) {
    if (v.seat !== v.dealer) return 0;
    const q = Math.min(0.6, 13 * v.unseen[k] / ctx.U) * (isHonour(k) ? 0.9 : 0.5);
    return -3 * q ** 3;
  }
  if (k !== f.followK || v.seat !== (v.dealer + f.follow) % 4) return 0;
  return f.follow === 3 ? 1 : f.follow === 2 ? 0.35 : 0.12;
}
/**
 * The decision for a seat now, with its reasons: { action, why, rows (the discards weighed), threats, stay }.
 */
export function decide(state, seat, { tune = {}, skill = "hard", seed = 1, noise = true } = {}) {
  const options = legal(state, seat);
  if (!options.length) return null;
  const v = view(state, seat);
  const t = { ...TUNE, ...(SKILLS[skill] || SKILLS.hard), ...tune };
  t.danger *= t.defence ?? 1;
  const nofan = noFan(v.opts);
  if (nofan) { t.near *= UNIT; t.temper *= UNIT; t.claimBonus *= UNIT; }   // the margins in points, at no fan's scale
  const r = noise ? rng((seed * 2654435761 + state.log.length * 97 + (state.hand || 0) * 7919 + seat * 131) >>> 0) : null;
  const win = options.find(a => a.t === "win");
  if (nofan && win) {
    // every win pays alike and a self-draw only a little more: taken at once
    const self = state.phase === "act", pts = payNoFan(v.dealer, seat, self, self ? -1 : state.last.seat)[seat];
    return { action: { t: "win" }, why: `Win: ${pts} points, ${self ? "self-drawn" : `off ${seatName(v, state.last.seat)}'s ${state.phase === "rob" ? "kong" : "discard"}`}.`, fan: 0, value: pts };
  }
  if (win) {
    const w = state.phase === "claim" ? weighWait(v, win, t) : null;
    if (w?.wait && t.wait) return w.wait;
    return { action: { t: "win" }, why: `Win: ${win.fan} fan.`, fan: win.fan, options: w?.options };
  }
  if (options.some(a => a.t === "flowers")) return { action: { t: "flowers" }, why: "Seven flowers: win now, three fan, paid as a self-draw." };
  if (state.phase === "rob") return { action: { t: "pass" }, why: "Nothing to rob." };
  if (state.phase === "claim") return decideClaim(state, v, options, t);
  return decideTurn(state, v, options, t, r);
}
/**
 * A discard win against passing it up for the self-draw (the pass block then bars discard wins until my next draw):
 * waiting is worth what the hand's waits bring (each wait's self-draw, scored by the rules, by its live tiles and the
 * draws left, against the chance someone else wins first), and wins when it beats taking by a margin, with a dozen
 * draws or more to come. Four concealed pungs is the common case: off a discard the pung it completes is an exposed
 * one, and the eight fan become all pungs' three. { wait: the decision to pass, or null; options: the two, in words }.
 */
function weighWait(v, win, tune) {
  const take = 4 * base(Math.min(v.opts.cap, win.fan));
  const ctx = context(v, tune), c = counts(v.hand);
  const r = readyChance(v, c, ctx);
  const top = r.waits.filter(w => w.n > 0).sort((a, b) => b.fanS - a.fanS)[0];
  const better = v.wall >= 16 && r.ev > take * 1.3 + 8;
  const options = [
    { action: { t: "win" }, title: `Win: ${win.fan} fan`, value: take, pros: [`${take} points now, certain`], cons: better ? [`gives up the self-draw${top ? ` (${top.fanS} fan on ${tileName(top.k)})` : ""}, worth about ${Math.round(r.ev)} points waited for`] : [] },
    { action: { t: "pass" }, title: "Pass and wait for the self-draw", value: r.ev, pros: top && top.fanS > win.fan ? [`a self-draw on ${tileName(top.k)} would be ${top.fanS} fan, paid by all three`] : [],
      cons: [`about ${Math.round(r.ev)} points waited for (${pct(r.self)} to self-draw before the hand ends)${better ? "" : `, less than the ${take} in hand`}`, "until you draw, the pass block bars winning off any discard", "meanwhile someone else may win, and you must keep discarding"] },
  ];
  if (better) options.reverse();
  const wait = better ? { action: { t: "pass" }, why: `Pass the win (${win.fan} fan off the discard, ${take} points): a self-draw${top ? ` on ${tileName(top.k)} would be ${top.fanS} fan` : ""}, and waiting for it is worth about ${Math.round(r.ev)} points (${pct(r.self)} to self-draw).`, stay: r, options } : null;
  return { wait, options };
}

function decideTurn(state, v, options, tune, r = null) {
  const ctx = context(v, tune);
  const rows = weighDiscards(v, { tune, ctx });
  // among discards the reckoning can't tell apart, any (medium wanders further, and the further the less likely)
  if (r && rows.length > 1) {
    const near = rows.filter(x => x.score >= rows[0].score - tune.near);
    if (near.length > 1) {
      const w = near.map(x => (tune.temper ? Math.exp((x.score - rows[0].score) / tune.temper) : 1));
      let pick = r() * w.reduce((a, b) => a + b, 0), i = 0;
      while (i < near.length - 1 && (pick -= w[i]) > 0) i++;
      if (i) { const chosen = near[i]; rows.splice(rows.indexOf(chosen), 1); rows.unshift(chosen); }
    }
  }
  const best = rows[0];
  // kongs: an extra draw, worth taking when what's left of the hand loses nothing by it
  const kongs = [];
  for (const a of options.filter(x => x.t === "kong")) {
    const c = counts(v.hand);
    c[a.k] -= a.how === "concealed" ? 4 : 1;
    const melds = a.how === "concealed" ? [...v.melds, { t: "kong", k: a.k, open: false }] : v.melds.map(m => (m.t === "pung" && m.k === a.k ? { ...m, t: "kong" } : m));
    const v2 = { ...v, melds };
    const e = evaluate(v2, c, context(v2, tune, 1));
    // no fan: a kong that stands takes a point from each of the others, there and then
    const rob = a.how === "added" ? danger(v, a.k, ctx.ts) * 1.25 * tune.danger : 0, value = e.value - rob + (ctx.nofan ? 3 : 0);
    const kong = { action: a, title: `Kong ${tileName(a.k)}`, value, pros: [ctx.nofan ? "a point from each of the others now, and a free draw from the end of the wall" : "a free draw from the end of the wall, and a win on it is a fan more"], cons: [] };
    if (a.how === "added" && rob >= ctx.unit) kong.cons.push(`someone waiting on ${tileName(a.k)} could rob it: about ${points(rob)} points of danger`);
    if (value >= best.score - 0.25 * ctx.unit) {
      const paid = ctx.nofan ? " and a point from each of the others" : "";
      const why = a.how === "added" ? `Kong: add the fourth ${tileName(a.k)} to the pung for an extra draw${paid}${rob > ctx.unit ? "" : " (no one looks ready to rob it)"}.`
        : `Kong: four ${tileName(a.k)} make a set either way; the kong brings a free draw${paid}.`;
      return { action: a, why, rows, threats: ctx.ts, options: [kong, ...discardOptions(v, rows, ctx), ...kongs] };
    }
    // what what's left of the hand loses by it, against the discard
    if (e.sh > best.sh) kong.cons.push(`what's left is a step further from ready (${shantenWords(e.sh)})`);
    if (e.p <= best.p - 0.02) kong.cons.push(`wins less often (${pct(e.p)} against ${pct(best.p)})`);
    if (best.score - value >= 0.5 * ctx.unit) kong.cons.push(`about ${points(best.score - value)} points worse on balance than letting go ${tileName(best.k)}`);
    kongs.push(kong);
  }
  return { action: { t: "discard", k: best.k }, why: explainDiscard(v, best, rows, ctx), rows, threats: ctx.ts, options: [...discardOptions(v, rows, ctx), ...kongs] };
}

function decideClaim(state, v, options, tune) {
  const k = state.last.k, ctx = context(v, tune);
  const calls = options.filter(a => a.t === "pung" || a.t === "chow" || a.t === "kong");
  if (!calls.length) return { action: { t: "pass" }, why: "Nothing to claim." };
  const c = counts(v.hand);
  const stay = evaluate(v, c, ctx);
  // letting it go keeps the hand as it is, with a discard still to make after the next draw
  const minRisk = Math.min(...[...new Set(v.hand)].map(x => danger(v, x, ctx.ts))) * tune.danger;
  const passValue = stay.value - minRisk;
  let best = { action: { t: "pass" }, value: passValue }, bestRow = null;
  const weighed = [];
  for (const a of calls) {
    const cc = c.slice();
    let meld;
    if (a.t === "pung") { cc[k] -= 2; meld = { t: "pung", k, open: true }; }
    else if (a.t === "kong") { cc[k] -= 3; meld = { t: "kong", k, open: true }; }
    else { for (const x of [a.k, a.k + 1, a.k + 2]) if (x !== k) cc[x]--; meld = { t: "chow", k: a.k, open: true }; }
    const v2 = { ...v, hand: tilesOf(cc), melds: [...v.melds, meld] };
    let value, row = null;
    let e = null;
    if (a.t === "kong") { e = evaluate(v2, cc, context(v2, tune, 1)); value = e.value + (ctx.nofan ? 3 : 0); }   // and a replacement draw (no fan: a point from each)
    else { row = weighDiscards(v2, { tune, ctx: context(v2, tune) })[0]; value = row.score; }
    weighed.push({ a, value, row, e });
    if (value > best.value * tune.claimMargin + tune.claimBonus) { best = { action: a, value }; bestRow = row; }
  }
  const choices = claimOptions(v, k, stay, passValue, weighed, best.action, ctx);
  if (best.action.t === "pass") {
    const why = stay.ev < 0.5 * ctx.unit ? `Pass: calling ${tileName(k)} doesn't bring the hand within reach of ${ctx.nofan ? "a win" : "the minimum fan"}.`
      : `Pass: the hand does better as it is (${pct(stay.p)} to win) than with ${tileName(k)} called.`;
    return { action: best.action, why, stay, options: choices };
  }
  const a = best.action;
  const what = a.t === "chow" ? `Chow ${tileName(a.k)} to ${tileName(a.k + 2)}` : `${a.t === "pung" ? "Pung" : "Kong"} ${tileName(k)}`;
  const value = ctx.nofan ? (a.t === "kong" ? ": a point from each of the others" : "") : isValue(v, k) && a.t !== "chow" ? ": a value honour, one fan" : "";
  const then = bestRow ? `; then ${tileName(bestRow.k)} goes, ${shantenWords(bestRow.sh)} on ${routeName(bestRow.route)}, ${pct(bestRow.p)} to win` : "";
  return { action: a, why: `${what}${value}${then} (${pct(stay.p)} without it).`, stay, rows: bestRow ? [bestRow] : undefined, options: choices };
}

// ---------- the choices in words: what speaks for each and against it ----------
/** The opponent a discard is most dangerous against, if anyone looks ready to take it. */
function dangerFrom(v, k, ts) {
  let worst = null, most = 0;
  for (const t of ts) { const d = t.ready * hitChance(v, k, t) * t.loss; if (d > most) { most = d; worst = t; } }
  return worst;
}
const points = x => (x >= 10 ? `${Math.round(x)}` : x >= 0.095 ? x.toFixed(1) : x.toFixed(2));
const waitsOf = r => {
  const live = (r.waits || []).filter(w => w.n > 0);
  return live.length ? `waiting on ${live.map(w => tileName(w.k)).join(", ")} (${live.reduce((a, w) => a + w.n, 0)} left)` : "waiting on tiles all gone";
};
/** The discards weighed, the choice and the next three (and the tile `also`, if it isn't among them), each with what
 *  speaks for it and against it. */
function discardOptions(v, rows, ctx, also = null) {
  const u = ctx.unit ?? (noFan(v.opts) ? UNIT : 1);                // a point's weight at this table (no fan: smaller wins)
  const b = rows[0], bOther = b.routes?.find(x => x.route !== b.route && x.ev > 0);
  const fastest = rows.reduce((a, x) => (x.ev > a.ev ? x : a)), safest = rows.reduce((a, x) => (x.risk < a.risk ? x : a));
  const shown = rows.slice(0, 4);
  if (also !== null && !shown.some(r => r.k === also)) shown.push(...rows.filter(r => r.k === also));
  return shown.map((r, i) => {
    const pros = [], cons = [], other = r.routes?.find(x => x.route !== r.route && x.ev > 0);
    if (i === 0) {
      pros.push(r.sh <= 0 ? `ready on ${routeName(r.route)}, ${waitsOf(r)}: ${pct(r.p)} to win` : `keeps ${routeName(r.route)}, ${shantenWords(r.sh)}, with ${r.uk.n} tiles to help: ${pct(r.p)} to win`);
      if (other) pros.push(`${routeName(other.route)} stays open too (${shantenWords(other.sh)})`);
      const passer = ctx.ts.find(t => t.ready >= 0.3 && t.passed.has(r.k));
      if (passer) pros.push(`certain against ${seatName(v, passer.seat)}, who let it go since drawing`);
      else if (r.risk < 0.5 * u) pros.push("safe: no one who looks ready is likely to want it");
      if (r.follow > 0) pros.push(followWords(v, r));
      if (fastest !== r && fastest.ev > r.ev + 0.5 * u) cons.push(`${tileName(fastest.k)} would win more often (${pct(fastest.p)}), but it carries about ${points(fastest.risk)} points of danger`);
      else if (safest !== r && r.risk - safest.risk >= u) cons.push(`${tileName(safest.k)} is safer, by about ${points(r.risk - safest.risk)} points of danger, but slower`);
      if (r.risk >= u) { const t = dangerFrom(v, r.k, ctx.ts); cons.push(`about ${points(r.risk)} points of danger${t ? `, mostly from ${seatName(v, t.seat)}` : ""}`); }
    } else {
      if (r.route !== b.route) (r.ev >= b.ev ? pros : cons).push(`aims at ${routeName(r.route)} instead`);
      if (r.sh < b.sh) pros.push(r.sh <= 0 ? `ready at once, ${waitsOf(r)}` : `a step nearer ready (${shantenWords(r.sh)})`);
      else if (r.sh > b.sh) cons.push(`a step further from ready (${shantenWords(r.sh)})`);
      else if (r.uk.n >= b.uk.n + 3) pros.push(`more tiles would help (${r.uk.n} against ${b.uk.n})`);
      else if (r.uk.n <= b.uk.n - 3) cons.push(`fewer tiles would help (${r.uk.n} against ${b.uk.n})`);
      if (r.p >= b.p + 0.02) pros.push(`wins more often (${pct(r.p)} against ${pct(b.p)})`);
      else if (r.p <= b.p - 0.02) cons.push(`wins less often (${pct(r.p)} against ${pct(b.p)})`);
      if (r.fan >= b.fan + 0.5) pros.push(`a bigger hand (about ${r.fan} fan against ${b.fan})`);
      else if (r.fan <= b.fan - 0.5) cons.push(`a smaller hand (about ${r.fan} fan against ${b.fan})`);
      if (r.risk >= b.risk + u) { const t = dangerFrom(v, r.k, ctx.ts); cons.push(`riskier: about ${points(r.risk)} points of danger${t ? `, mostly from ${seatName(v, t.seat)}` : ""}`); }
      else if (r.risk <= b.risk - u) pros.push(`safer, by about ${points(b.risk - r.risk)} points of danger`);
      if (r.follow > b.follow + 0.05) pros.push(followWords(v, r));
      else if (b.follow > r.follow + 0.05) cons.push(`doesn't follow the dealer's ${tileName(v.flags.followK)}, as ${tileName(b.k)} does`);
      if (other && !b.routes?.some(x => x.route === other.route && x.ev > 0)) pros.push(`keeps ${routeName(other.route)} open`);
      if (bOther && bOther.route !== r.route && !r.routes?.some(x => x.route === bOther.route && x.ev > 0)) cons.push(`closes ${routeName(bOther.route)}, the hand's other way`);
      if (r.route === b.route && r.sh === b.sh && Math.abs(r.uk.n - b.uk.n) < 3) pros.push(`leaves the hand as far along: ${shantenWords(r.sh)} on ${routeName(r.route)}, ${r.uk.n} tiles to help`);
      const gap = b.score - r.score;
      if (gap > 0.05 * u && !cons.length) {
        // nothing above says why: the way it weakens most, or its danger
        let worst = null, drop = 0.01;
        for (const x of b.routes || []) {
          if (x.ev <= 0) continue;
          const y = r.routes?.find(z => z.route === x.route), d = x.ev - (y?.ev || 0);
          if (d > drop) { drop = d; worst = { x, y }; }
        }
        // a route can win as often and still be worth less: its ready hands would wait on cheaper tiles
        const { x, y } = worst || {};
        if (worst && (!y || y.p < x.p - 0.005)) cons.push(`${gap >= 0.5 * u ? "weakens" : "a shade less for"} ${routeName(x.route)}${y ? ` (${pct(y.p)} to win that way, against ${pct(x.p)})` : ", which it ends"}`);
        else if (worst) cons.push(`wins ${y.p > x.p + 0.005 ? "a little more often" : "as often"} (${pct(y.p)} against ${pct(x.p)}), but its wins would pay less: about ${points(y.ev)} points to expect from ${routeName(x.route)}, against ${points(x.ev)}`);
        else if (r.risk > b.risk) cons.push(`a shade riskier (about ${points(r.risk)} points of danger against ${points(b.risk)})`);
      }
      if (gap >= 0.5 * u) cons.push(`about ${points(gap)} points worse on balance`);
      else if (gap <= 0.05 * u) pros.push("as good on balance: either would do");
    }
    return { action: { t: "discard", k: r.k }, title: `Discard ${tileName(r.k)}`, pros, cons, value: r.score };
  });
}
/** A discard that follows the dealer's first, in words (no fan, 跟莊). */
function followWords(v, r) {
  const t = tileName(v.flags.followK);
  return v.flags.follow === 3 ? `the fourth ${t} in a row, after the dealer's: the dealer pays each of the others a point`
    : `follows the dealer's ${t}: if the rest follow too, the dealer pays each of the others a point`;
}
/** A claim's choices: letting the tile go, and each call, with what the hand would be after it. */
function claimOptions(v, k, stay, passValue, weighed, chosen, ctx = {}) {
  const concealed = !v.melds.length, nofan = noFan(v.opts), u = nofan ? UNIT : 1;
  const pass = { action: { t: "pass" }, title: "Pass", pros: [], cons: [] };
  pass.pros.push(stay.ev < 0.5 * u ? `the hand keeps its shape, though it's far from ${nofan ? "a win" : "the minimum"} either way` : `the hand as it is: ${shantenWords(stay.sh)} on ${routeName(stay.route)}, ${pct(stay.p)} to win`);
  if (concealed) pass.pros.push(nofan ? "stays concealed: nothing shown to read" : "stays concealed: a fan for that, and nothing shown to read");
  const out = [pass];
  for (const { a, value, row, e } of weighed) {
    const what = a.t === "chow" ? `Chow ${tileName(a.k)} to ${tileName(a.k + 2)}` : `${a.t === "pung" ? "Pung" : "Kong"} ${tileName(k)}`;
    const pros = [], cons = [], after = row || e;
    if (a.t !== "chow" && isValue(v, k) && !nofan) pros.push("a value honour: a fan for the set");
    if (a.t === "kong") pros.push(nofan ? "a point from each of the others, and a free draw from the end of the wall" : "a free draw from the end of the wall");
    if (after) {
      const at = after.sh <= 0 ? "ready" : shantenWords(after.sh);
      pros.push(`${row ? `then ${tileName(row.k)} goes: ` : ""}${at} on ${routeName(after.route)}, ${pct(after.p)} to win`);
      if (after.route !== stay.route && stay.ev >= 0.5 * u) cons.push(`gives up ${routeName(stay.route)} for ${routeName(after.route)}`);
      if (after.fan <= stay.fan - 0.5) cons.push(`a smaller hand (about ${after.fan} fan against ${stay.fan})`);
      else if (after.fan >= stay.fan + 0.5) pros.push(`a bigger hand (about ${after.fan} fan against ${stay.fan})`);
      if (after.sh < stay.sh) pros.push(`a step nearer ready than passing (${shantenWords(stay.sh)})`);
      if (after.p <= stay.p - 0.02) cons.push(`wins less often than passing (${pct(after.p)} against ${pct(stay.p)})`);
      else if (after.p >= stay.p + 0.02) pros.push(`wins more often than passing (${pct(after.p)} against ${pct(stay.p)})`);
      if (row && row.risk >= u) cons.push(`the discard after it carries about ${points(row.risk)} points of danger`);
    }
    if (concealed) cons.push(nofan ? "opens the hand: the others see a set to read" : "opens the hand: the concealed hand's fan goes, and the others see a set to read");
    if (a.t === "chow" && v.melds.length >= 2) cons.push("a third set shown leaves few tiles to defend with");
    const gap = passValue - value;
    if (gap >= 0.5 * u) cons.push(`about ${points(gap)} points worse on balance than passing`);
    else if (-gap >= 0.5 * u && !sameAct(a, chosen)) pros.push(`about ${points(-gap)} points better than passing, short of the margin a call must clear`);
    out.push({ action: a, title: what, pros, cons, value });
  }
  for (const o of out.slice(1)) if (o.value > passValue + 0.5 * u) pass.cons.push(`slower than ${o.title.charAt(0).toLowerCase() + o.title.slice(1)} (${pct(stay.p)} to win as it is)`);
  pass.value = passValue;
  const i = out.findIndex(o => sameAct(o.action, chosen));
  if (i > 0) out.unshift(out.splice(i, 1)[0]);
  return out;
}
/**
 * The coach's choice set against a move of yours (a puzzle's verdict, the coach's word on your move): { decision,
 * options, best, mine, gap } — the options weighed in words (title, pros, cons, value; yours among them), best and mine
 * two of them, gap the points of expected winnings between them (null when it can't say).
 */
export function explainMove(state, seat, action) {
  const d = decide(state, seat, { noise: false }), unit = noFan(state.opts) ? UNIT : 1;
  if (d.rows && action.t === "discard" && d.action.t === "discard") {
    const list = [...discardOptions(view(state, seat), d.rows, { ts: d.threats, unit }, action.k), ...d.options.filter(o => o.action.t === "kong")];
    const row = d.rows.find(r => r.k === action.k);
    return { decision: d, options: list, best: list[0], mine: list.find(o => sameAct(o.action, action)) || null, gap: row ? Math.max(0, d.rows[0].score - row.score) : null, unit };
  }
  const opts = d.options ? d.options.slice() : [];
  let best = opts.find(o => sameAct(o.action, d.action));
  if (!best) {
    // a win on your own draw: what it pays now, all three paying
    const v = view(state, seat), value = d.action.t === "win" && state.phase === "act" ? (unit < 1 ? d.value : 6 * base(Math.min(v.opts.cap, d.fan))) : undefined;
    best = { action: d.action, title: d.why.split(":")[0], pros: value ? [`${value} points now, certain`] : [], cons: [], value };
    opts.unshift(best);
  }
  let mine = opts.find(o => sameAct(o.action, action)) || null;
  if (!mine && action.t === "discard" && best.value != null) {
    // a discard where the coach would win: the hand it leaves, against the win in hand
    const v = view(state, seat), row = weighDiscards(v).find(r => r.k === action.k);
    if (row) {
      mine = { action, title: `Discard ${tileName(action.k)}`, value: row.score, pros: [`${shantenWords(row.sh)} on ${routeName(row.route)}, ${pct(row.p)} to win`], cons: [`gives up the win in hand (${points(best.value)} points) for a hand worth about ${points(Math.max(0, row.score))} on average`] };
      opts.push(mine);
    }
  }
  const gap = best.value != null && mine?.value != null ? Math.max(0, best.value - mine.value) : null;
  return { decision: d, options: opts, best, mine, gap, unit };
}
const sameAct = (a, b) => a.t === b.t && (a.k ?? null) === (b.k ?? null);
/**
 * Whether the coach would have done otherwise (explainMove's answer, j, to your move): null when it would have made the
 * same move, or values yours as well (within a tenth of a point); else { coach: its move, gap: the points yours was
 * worse by (null when it can't say), against: what tells most against yours, at most two reasons }.
 */
export function differ(j, action) {
  const best = j.best?.action || j.decision.action, unit = j.unit ?? 1;
  if (sameAct(best, action) || (j.gap != null && j.gap < 0.1 * unit)) return null;
  // what the points come from first: further from ready, fewer wins, a smaller hand, more danger; then the rest in turn
  const weight = c => { const i = WEIGHED.findIndex(re => re.test(c)); return i < 0 ? WEIGHED.length : i; };
  const against = (j.mine?.cons || []).filter(c => !/on balance/.test(c)).map((c, i) => ({ c, i })).sort((x, y) => weight(x.c) - weight(y.c) || x.i - y.i);
  return { coach: best, gap: j.gap, against: against.slice(0, 2).map(x => x.c), unit };
}
const WEIGHED = [/further from ready/, /wins less often/, /smaller hand/, /danger/];
const NOUN = {
  discard: a => tileName(a.k), pass: () => "pass", pung: a => `pung of ${tileName(a.k)}`, kong: a => `kong of ${tileName(a.k)}`,
  chow: a => `chow, ${tileName(a.k)} to ${tileName(a.k + 2)}`, win: () => "win", flowers: () => "flower win",
};
const VERB = {
  discard: a => `let go ${tileName(a.k)}`, pass: () => "pass", pung: a => `pung ${tileName(a.k)}`, kong: a => `kong ${tileName(a.k)}`,
  chow: a => `chow ${tileName(a.k)} to ${tileName(a.k + 2)}`, win: () => "win", flowers: () => "win on the flowers",
};
/** differ's answer in words: "Your 5 dots: about 2.3 points worse than the coach's 9 bamboo. A step further from ready…" */
export function differWords(mine, { coach, gap, against = [], unit = 1 }) {
  const yours = `Your ${NOUN[mine.t]?.(mine) ?? mine.t}`;
  const head = gap == null ? `${yours}: the coach would rather ${VERB[coach.t]?.(coach) ?? coach.t}`
    : `${yours}: ${gap >= 0.5 * unit ? `about ${points(gap)} points` : "a shade"} worse than the coach's ${NOUN[coach.t]?.(coach) ?? coach.t}`;
  return `${head}.${against.length ? ` ${against.join("; ").replace(/^./, c => c.toUpperCase())}.` : ""}`;
}

// ---------- the words ----------
const pct = x => `${Math.round((x || 0) * 100)}%`;
/** A route's name: "a half flush in dots", "all pungs", "a plain hand". */
export function routeName(route) {
  if (route.startsWith("flush")) return `a half flush in ${SUIT_NAMES[Number(route[5])]}`;
  if (route.startsWith("full")) return `a full flush in ${SUIT_NAMES[Number(route[4])]}`;
  if (route === "pungs") return "all pungs";
  if (route === "orphans") return "thirteen orphans";
  return "a plain hand";
}
export const shantenWords = sh => (sh <= -1 ? "complete" : sh === 0 ? "ready" : sh === 1 ? "one from ready" : `${sh} from ready`);
export const seatName = (v, seat) => WIND_NAMES[(seat - v.dealer + 4) % 4];
function explainDiscard(v, best, rows, ctx) {
  const t = tileName(best.k);
  const scary = ctx.ts.filter(x => x.ready >= 0.3).sort((a, b) => b.ready * b.loss - a.ready * a.loss)[0];
  const who = scary ? seatName(v, scary.seat) : "";
  // the fastest discard, if safety made it another
  const fastest = rows.reduce((a, b) => (b.ev > a.ev ? b : a)), u = ctx.unit;
  if (best.ev < 0.5 * u) return `Discard ${t}: no way to ${ctx.nofan ? "a win" : "the minimum fan"} in time, so it plays the safest tile${scary ? ` (${who} looks ready)` : ""}.`;
  let s;
  if (best.sh === 0) {
    const live = best.waits.filter(w => w.n > 0 && w.fanS >= ctx.min);
    const names = live.length ? live.map(w => tileName(w.k)).join(", ") : best.waits.map(w => tileName(w.k)).join(", ");
    const n = live.reduce((a, w) => a + w.n, 0);
    s = `Discard ${t}: ready, waiting on ${names} (${n} left)${best.selfOnly ? ", by self-draw only" : ctx.nofan ? "" : `, ${best.fan} fan`}; ${pct(best.p)} to win.`;
  } else s = `Discard ${t}: keeps ${routeName(best.route)}, ${shantenWords(best.sh)}, ${best.uk.n} tiles would help; ${pct(best.p)} to win.`;
  if (best.follow > 0) s += ` ${followWords(v, best).replace(/^./, c => c.toUpperCase())}.`;
  else if (fastest !== best && fastest.ev - best.ev > 0.5 * u && fastest.risk > best.risk) s += ` ${tileName(fastest.k)} would be faster but could feed ${who || "someone"}.`;
  else if (scary && scary.passed.has(best.k)) s += ` It's safe against ${who}, who let it go since drawing.`;
  else {
    // several tiles the route doesn't need, alike to it: the one chosen is the least use to the hand's other way
    const alike = rows.filter(r => r.route === best.route && Math.abs(r.ev - best.ev) <= Math.max(0.05, best.ev * 0.02)).length;
    const other = best.routes?.find(r => r.route !== best.route && r.ev > 0);
    if (alike > 1 && other) s += ` Of the tiles it can spare, this one matters least to ${routeName(other.route)}${other.sh > 0 ? ` (${shantenWords(other.sh)})` : ""}.`;
  }
  return s;
}
