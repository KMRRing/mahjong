// Mahjong: Hong Kong mahjong (香港麻雀), four players, the rules as played in Hong Kong homes and clubs (新派清章): 144
// tiles with flowers or 136 without, three fan to win (or one, or none: a chicken hand), ten fan the cap, half-spicy
// payouts, the discarder paying the whole of a win off his discard (全銃), a self-drawn win paid by all three, the head
// bump (only the first claimant after the discarder wins), play to the last tile. Or no fan (opts.scoring "nofan", the
// way of a table that doesn't count fan, 雞糊): any complete hand wins and every win pays alike, 2 from each by self-draw,
// else 2 from the discarder and 1 from each of the others; the dealer pays and receives double; a kong takes 1 from
// each; when the first four discards are one tile (跟莊), the dealer pays each of the others 1; no flowers, no
// liability. The referee: the wall, the deal, the turn and the claims, kongs and flowers, the fan of a winning hand,
// who pays what, and the rounds of a session. Pure; the page, the computer players, the worker and the tests all play
// through it.

// ---------- tiles ----------
// A tile is its kind: 0–8 characters (萬) 1–9, 9–17 dots (筒), 18–26 bamboo (索), 27–30 the winds 東南西北, 31–33 the
// dragons 中發白; the flowers are 34–37 (梅蘭菊竹) and the seasons 38–41 (春夏秋冬), one of each.
export const SUITS = ["萬", "筒", "索"];
export const SUIT_NAMES = ["characters", "dots", "bamboo"];
export const WINDS = ["東", "南", "西", "北"], WIND_NAMES = ["East", "South", "West", "North"];
export const DRAGONS = ["中", "發", "白"], DRAGON_NAMES = ["red dragon", "green dragon", "white dragon"];
export const FLOWERS = ["梅", "蘭", "菊", "竹", "春", "夏", "秋", "冬"];
const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const suitOf = k => (k < 27 ? Math.floor(k / 9) : 3);
export const numOf = k => (k % 9) + 1;
export const isHonour = k => k >= 27 && k < 34;
export const isWind = k => k >= 27 && k <= 30;
export const isDragon = k => k >= 31 && k <= 33;
export const isTerminal = k => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isFlower = k => k >= 34;
/** A tile's name: "3 dots", "East wind", "red dragon", "plum (1)". */
export function tileName(k) {
  if (k < 27) return `${numOf(k)} ${SUIT_NAMES[suitOf(k)]}`;
  if (isWind(k)) return `${WIND_NAMES[k - 27]} wind`;
  if (isDragon(k)) return DRAGON_NAMES[k - 31];
  return `${["plum", "orchid", "chrysanthemum", "bamboo", "spring", "summer", "autumn", "winter"][k - 34]} (${((k - 34) % 4) + 1})`;
}
/** A tile as it's written on the tile: 三萬, 七筒, 東, 中, 梅. */
export function tileGlyph(k) {
  if (k < 27) return `${NUMERALS[k % 9]}${SUITS[suitOf(k)]}`;
  if (isWind(k)) return WINDS[k - 27];
  if (isDragon(k)) return DRAGONS[k - 31];
  return FLOWERS[k - 34];
}
/** Short: 3m, 7p, 5s, E, Rd. */
export function tileShort(k) {
  if (k < 27) return `${numOf(k)}${"mps"[suitOf(k)]}`;
  if (isWind(k)) return "ESWN"[k - 27];
  if (isDragon(k)) return ["Rd", "Gd", "Wd"][k - 31];
  return `F${k - 33}`;
}

// ---------- randomness ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the rules this table plays ----------
export const DEFAULTS = { flowers: true, minFan: 3, cap: 10, rounds: 1, scoring: "fan" };
/** No fan: any complete hand wins, every win pays alike (see the top of this file). */
export const noFan = opts => opts?.scoring === "nofan";
/** The rules a table plays, filled in: no fan has no flowers and no minimum. */
const rulesOf = o => { const opts = { ...DEFAULTS, ...(o || {}) }; if (noFan(opts)) { opts.flowers = false; opts.minFan = 0; } return opts; };
/** No fan: what a win pays, seat by seat (2 from each by self-draw, else 2 from the discarder and 1 from each of the
 *  others; any payment the dealer makes or receives doubled). */
export function payNoFan(dealer, winner, self, from) {
  const pay = [0, 0, 0, 0];
  for (let o = 0; o < 4; o++) {
    if (o === winner) continue;
    const n = (self || o === from ? 2 : 1) * (o === dealer || winner === dealer ? 2 : 1);
    pay[o] -= n; pay[winner] += n;
  }
  return pay;
}
/** Base points for a fan count, half spicy (半辣上): doubling to four fan, then doubling every two. */
export const BASE = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
export const base = f => BASE[Math.max(0, Math.min(f, BASE.length - 1))];

// ---------- a hand of counts ----------
export const counts = tiles => { const c = new Array(34).fill(0); for (const k of tiles) if (k < 34) c[k]++; return c; };

/**
 * Every way to split concealed tiles (counts) into sets and one pair: [{ pair, sets: [{ t: "chow"|"pung", k }] }].
 * `need` is how many sets the concealed tiles must make (4 less the melds already down).
 */
export function splits(c, need) {
  const out = [];
  const total = c.reduce((a, b) => a + b, 0);
  if (total !== need * 3 + 2) return out;
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const sets = [];
    (function rec(i) {
      while (i < 34 && c[i] === 0) i++;
      if (i === 34) { out.push({ pair: p, sets: sets.slice() }); return; }
      if (c[i] >= 3) { c[i] -= 3; sets.push({ t: "pung", k: i }); rec(i); sets.pop(); c[i] += 3; }
      if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ t: "chow", k: i }); rec(i); sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
      }
    })(0);
    c[p] += 2;
  }
  return out;
}
/** Whether concealed counts complete a hand with `need` sets (no fan counted). */
export function complete(c, need) {
  const total = c.reduce((a, b) => a + b, 0);
  if (total !== need * 3 + 2) return false;
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const ok = sets(c, 0);
    c[p] += 2;
    if (ok) return true;
  }
  return false;
}
function sets(c, i) {
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) return true;
  if (c[i] >= 3) { c[i] -= 3; const ok = sets(c, i); c[i] += 3; if (ok) return true; }
  if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = sets(c, i);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
/** Thirteen orphans: one of each terminal and honour, one of them twice. */
export const orphans = c => ORPHANS.every(k => c[k] >= 1) && ORPHANS.reduce((n, k) => n + c[k], 0) === 14 && c.reduce((a, b) => a + b, 0) === 14;

// ---------- the fan of a winning hand ----------
// Each item: { name (中文), en, fan } — a limit hand pays its limit (capped) and nothing stacks with it.
const LIMIT13 = 13, LIMIT10 = 10;
/**
 * The fan of a win. win: { seat, tile, how: "self" | "discard" | "rob" | "flowers" }. Uses the state for the seat's
 * melds, flowers, the winds, and how the tile came (last tile, kong replacement, first turn). Returns
 * { fan (capped), raw, items: [{ zh, en, fan }], limit } with the best split of the hand; fan −1 if it's no hand.
 */
export function scoreWin(state, win) {
  const s = state.seats[win.seat], opts = state.opts;
  const seatWind = windOf(state, win.seat), roundWind = state.round;
  const own = { flower: 34 + seatWind, season: 38 + seatWind };
  // flowers: a win by flowers counts nothing else
  if (win.how === "flowers") {
    const n = s.flowers.length;
    if (n >= 8) return result([{ zh: "大花糊", en: "Eight flowers", fan: LIMIT13 }], true, opts.cap);
    return result([{ zh: "花糊", en: "Seven flowers (self-drawn)", fan: 3 }], false, opts.cap);
  }
  const hand = s.hand.slice();
  if (win.how !== "self") hand.push(win.tile);                   // a discard (or a robbed kong's tile) joins the hand
  const c = counts(hand);
  const melds = s.melds, need = 4 - melds.length;
  const concealedHand = !melds.some(m => m.open);               // 門前清: no open meld (a concealed kong isn't one)
  const items0 = [];                                             // what applies whatever the split
  // flowers
  if (opts.flowers) {
    const fl = s.flowers;
    if (!fl.length) items0.push({ zh: "無花", en: "No flowers", fan: 1 });
    else {
      const allF = [34, 35, 36, 37].every(k => fl.includes(k)), allS = [38, 39, 40, 41].every(k => fl.includes(k));
      if (allF) items0.push({ zh: "一台花", en: "All four flowers", fan: 2 });
      else if (fl.includes(own.flower)) items0.push({ zh: "正花", en: `Own flower (${FLOWERS[own.flower - 34]})`, fan: 1 });
      if (allS) items0.push({ zh: "一台花", en: "All four seasons", fan: 2 });
      else if (fl.includes(own.season)) items0.push({ zh: "正花", en: `Own season (${FLOWERS[own.season - 34]})`, fan: 1 });
    }
  }
  // how it was won
  const self = win.how === "self";
  const doubleKong = self && state.flags.kongChain >= 2;
  const kongBloom = self && state.flags.afterKong;
  if (doubleKong) items0.push({ zh: "槓上槓自摸", en: "Win on a second kong's replacement", fan: 8 });
  else {
    if (self) items0.push({ zh: "自摸", en: "Self-drawn", fan: 1 });
    if (kongBloom) items0.push({ zh: "槓上開花", en: "Win on a kong's replacement", fan: 1 });
  }
  if (concealedHand) items0.push({ zh: "門前清", en: "Concealed hand", fan: 1 });
  if (win.how === "rob") items0.push({ zh: "搶槓", en: "Robbing a kong", fan: 1 });
  const lastTile = (self && state.flags.lastDraw && !kongBloom) || (win.how === "discard" && state.flags.finalDiscard);
  if (lastTile) items0.push({ zh: "海底撈月", en: "Win on the last tile", fan: 1 });
  // no hand at all: nothing to score (the limits below need a complete hand as much as anything does)
  const isOrphans = melds.length === 0 && orphans(c);
  if (!isOrphans && !complete(c.slice(), need)) return { fan: -1, raw: -1, items: [], limit: false };
  // limits that don't depend on the split
  const limits = [];
  if (state.flags.heavenly && self && win.seat === state.dealer) limits.push({ zh: "天糊", en: "Heavenly hand", fan: LIMIT13 });
  if (state.flags.earthly && win.how === "discard" && win.seat !== state.dealer) limits.push({ zh: "地糊", en: "Earthly hand", fan: LIMIT13 });
  if (isOrphans) limits.push({ zh: "十三么", en: "Thirteen orphans", fan: LIMIT13 });
  if (limits.length) return result([limits.sort((a, b) => b.fan - a.fan)[0]], true, opts.cap);
  let best = null;
  for (const sp of splits(c, need)) {
    const items = handItems(state, win, sp, c, own, seatWind, roundWind);
    const lim = items.find(i => i.limit);
    const scored = lim ? result([lim], true, opts.cap) : result([...items, ...items0], false, opts.cap);
    if (!best || scored.raw > best.raw) best = scored;
  }
  return best || { fan: -1, raw: -1, items: [], limit: false };
}
function result(items, limit, cap) {
  const raw = items.reduce((n, i) => n + i.fan, 0);
  // a chicken hand is one with no fan at all: named only then
  const shown = raw === 0 ? [{ zh: "雞糊", en: "Chicken hand", fan: 0 }] : items.filter(i => i.fan > 0 || i.zh !== "雞糊");
  return { fan: Math.min(raw, cap), raw, items: shown.map(({ zh, en, fan }) => ({ zh, en, fan })), limit };
}
/** The items a split of the hand earns: its pattern, its value honours, and the limit hands. */
function handItems(state, win, sp, c, own, seatWind, roundWind) {
  const s = state.seats[win.seat];
  const all = [...s.melds.map(m => ({ t: m.t === "kong" ? "pung" : m.t, k: m.k, kong: m.t === "kong" })), ...sp.sets.map(x => ({ ...x, kong: false }))];
  const tiles = [...all.flatMap(x => (x.t === "chow" ? [x.k, x.k + 1, x.k + 2] : [x.k])), sp.pair];
  const suits = new Set(tiles.filter(k => k < 27).map(suitOf)), honours = tiles.some(isHonour);
  const pungs = all.filter(x => x.t === "pung"), chows = all.filter(x => x.t === "chow");
  const kongs = all.filter(x => x.kong).length;
  const items = [];
  // limits
  if (kongs === 4) items.push({ zh: "十八羅漢", en: "Four kongs", fan: LIMIT13, limit: true });
  const windPungs = pungs.filter(x => isWind(x.k)).length, dragonPungs = pungs.filter(x => isDragon(x.k)).length;
  if (windPungs === 4) items.push({ zh: "大四喜", en: "Big four winds", fan: LIMIT13, limit: true });
  if (tiles.every(isHonour)) items.push({ zh: "字一色", en: "All honours", fan: LIMIT10, limit: true });
  if (tiles.every(isTerminal)) items.push({ zh: "清么九", en: "All terminals", fan: LIMIT10, limit: true });
  if (s.melds.length === 0 && suits.size === 1 && !honours) {
    const su = [...suits][0], n = Array.from({ length: 9 }, (_, i) => c[su * 9 + i]);
    if (n[0] >= 3 && n[8] >= 3 && n.every(x => x >= 1)) items.push({ zh: "九子連環", en: "Nine gates", fan: LIMIT10, limit: true });
  }
  const limit = items.filter(i => i.limit).sort((a, b) => b.fan - a.fan)[0];
  if (limit) return [limit];
  // the patterns
  if (suits.size === 1 && !honours) items.push({ zh: "清一色", en: "Full flush", fan: 7 });
  else if (suits.size === 1 && honours) items.push({ zh: "混一色", en: "Half flush", fan: 3 });
  // four concealed pungs (坎坎糊, eight fan, in the place of all pungs, the other fan stacking as with any pattern): nothing
  // called (a concealed kong is a concealed pung), and won off a discard only when it completes the pair (a discard
  // completing a pung makes that pung an exposed one)
  if (pungs.length === 4) items.push(!s.melds.some(m => m.open) && (win.how === "self" || sp.pair === win.tile) ? { zh: "坎坎糊", en: "Four concealed pungs", fan: 8 } : { zh: "對對糊", en: "All pungs", fan: 3 });
  else if (chows.length === 4) items.push({ zh: "平糊", en: "All chows", fan: 1 });
  if (tiles.every(k => isTerminal(k) || isHonour(k)) && honours && tiles.some(isTerminal)) items.push({ zh: "混么九", en: "Terminals and honours", fan: 1 });
  // dragons
  if (dragonPungs === 3) items.push({ zh: "大三元", en: "Big three dragons", fan: 8 });
  else if (dragonPungs === 2 && isDragon(sp.pair)) items.push({ zh: "小三元", en: "Little three dragons", fan: 5 });
  else for (const x of pungs.filter(y => isDragon(y.k))) items.push({ zh: DRAGONS[x.k - 31], en: `Pung of ${DRAGON_NAMES[x.k - 31]}s`, fan: 1 });
  // winds
  if (windPungs === 3 && isWind(sp.pair)) items.push({ zh: "小四喜", en: "Little four winds", fan: 6 });
  else for (const x of pungs.filter(y => isWind(y.k))) {
    const w = x.k - 27;
    if (w === seatWind) items.push({ zh: "門風", en: `Seat wind (${WINDS[w]})`, fan: 1 });
    if (w === roundWind) items.push({ zh: "圈風", en: `Round wind (${WINDS[w]})`, fan: 1 });
  }
  if (!items.length) items.push({ zh: "雞糊", en: "Chicken hand", fan: 0 });
  return items;
}

// ---------- the table ----------
/** The wind a seat sits at this hand: 0 East (the dealer), 1 South, 2 West, 3 North. */
export const windOf = (state, seat) => (seat - state.dealer + 4) % 4;
const nextSeat = s => (s + 1) % 4;

/**
 * A new hand: the wall shuffled from the seed, thirteen each and fourteen to the dealer, flowers set aside and
 * replaced from the tail (the dealer's first, then round the table). cfg: { seed, dealer, round, hand, opts, scores }.
 */
export function deal(cfg) {
  const opts = rulesOf(cfg.opts);
  const wall = [];
  for (let k = 0; k < 34; k++) for (let n = 0; n < 4; n++) wall.push(k);
  if (opts.flowers) for (let k = 34; k < 42; k++) wall.push(k);
  const r = rng(cfg.seed);
  for (let i = wall.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [wall[i], wall[j]] = [wall[j], wall[i]]; }
  const state = {
    v: 1, opts, seed: cfg.seed, dealer: cfg.dealer, round: cfg.round || 0, hand: cfg.hand || 0,
    scores: (cfg.scores || [0, 0, 0, 0]).slice(), wall, head: 0, tail: wall.length,
    seats: [0, 1, 2, 3].map(() => ({ hand: [], melds: [], flowers: [], river: [], passBlock: false })),
    turn: cfg.dealer, phase: "act", drawn: null, last: null, claims: {}, liable: [-1, -1, -1, -1],
    flags: { afterKong: false, kongChain: 0, lastDraw: false, finalDiscard: false, heavenly: true, earthly: false, firstTurn: [true, true, true, true], calls: 0, follow: 0, followK: -1 },
    log: [], result: null, paid: [],
  };
  for (let round = 0; round < 3; round++) for (let i = 0; i < 4; i++) for (let n = 0; n < 4; n++) state.seats[(cfg.dealer + i) % 4].hand.push(wall[state.head++]);
  for (let i = 0; i < 4; i++) state.seats[(cfg.dealer + i) % 4].hand.push(wall[state.head++]);
  state.seats[cfg.dealer].hand.push(wall[state.head++]);
  // the flowers in the deal: exposed and replaced, the dealer first, repeating while a replacement is a flower
  for (let i = 0; i < 4; i++) {
    const seat = (cfg.dealer + i) % 4, s = state.seats[seat];
    let f;
    while ((f = s.hand.find(isFlower)) !== undefined) {
      s.hand.splice(s.hand.indexOf(f), 1);
      s.flowers.push(f);
      if (state.tail <= state.head) break;
      s.hand.push(wall[--state.tail]);
    }
  }
  for (const s of state.seats) s.hand.sort((a, b) => a - b);
  state.drawn = state.seats[cfg.dealer].hand[state.seats[cfg.dealer].hand.length - 1];
  return state;
}
export const wallLeft = state => state.tail - state.head;
const log = (state, e) => { state.log.push(e); };

/** Draws for a seat (from the head, or the tail after a kong): flowers exposed and replaced. False if the wall is dry. */
function draw(state, seat, fromTail) {
  const s = state.seats[seat];
  if (wallLeft(state) <= 0) return false;
  let k = fromTail ? state.wall[--state.tail] : state.wall[state.head++];
  s.passBlock = false;                                           // a draw lifts the block on discard wins
  while (isFlower(k)) {
    s.flowers.push(k);
    log(state, { e: "flower", seat, k });
    if (wallLeft(state) <= 0) { state.drawn = null; state.flags.lastDraw = true; return "dry"; }
    k = state.wall[--state.tail];
  }
  s.hand.push(k);
  s.hand.sort((a, b) => a - b);
  state.drawn = k;
  state.flags.lastDraw = wallLeft(state) === 0;
  log(state, { e: "draw", seat, fromTail: !!fromTail });
  return true;
}

// ---------- what a seat may do now ----------
/**
 * The legal actions for a seat now: in its turn ("act") win (self-drawn), kong (concealed or added), flowers (seven
 * or eight shown) and discard; answering a discard ("claim") win, kong, pung, chow (only the seat after the
 * discarder) or pass; answering an added kong ("rob") win or pass.
 */
export function legal(state, seat) {
  const s = state.seats[seat], out = [];
  if (state.phase === "over") return out;
  if (state.phase === "act" && seat === state.turn) {
    if (state.opts.flowers && s.flowers.length >= 7 && !s.declinedFlowers?.includes(s.flowers.length)) out.push({ t: "flowers" });
    if (state.drawn !== null) {                                   // after a draw: a self-drawn win, kongs
      const sc = scoreWin(state, { seat, tile: state.drawn, how: "self" });
      if (sc.fan >= state.opts.minFan) out.push({ t: "win", fan: sc.fan });
      if (wallLeft(state) > 0) {
        const c = counts(s.hand);
        for (let k = 0; k < 34; k++) if (c[k] === 4) out.push({ t: "kong", k, how: "concealed" });
        for (const m of s.melds) if (m.t === "pung" && c[m.k] >= 1) out.push({ t: "kong", k: m.k, how: "added" });
      }
    }
    for (const k of [...new Set(s.hand)]) out.push({ t: "discard", k });
    return out;
  }
  if (state.phase === "claim" && seat !== state.last.seat && !(seat in state.claims)) {
    const k = state.last.k, c = counts(s.hand);
    out.push({ t: "pass" });
    if (!s.passBlock) {
      const sc = scoreWin(state, { seat, tile: k, how: "discard" });
      if (sc.fan >= state.opts.minFan) out.push({ t: "win", fan: sc.fan });
    }
    if (!state.flags.finalDiscard) {
      if (c[k] >= 3 && wallLeft(state) > 0) out.push({ t: "kong", k, how: "exposed" });
      if (c[k] >= 2) out.push({ t: "pung", k });
      if (seat === nextSeat(state.last.seat) && k < 27) {
        const n = k % 9;
        for (const start of [k - 2, k - 1, k]) {
          const sn = start - (k - n);
          if (sn < 0 || sn > 6) continue;
          const need = [start, start + 1, start + 2].filter(x => x !== k);
          if (need.every(x => c[x] >= 1)) out.push({ t: "chow", k: start });
        }
      }
    }
    return out;
  }
  if (state.phase === "rob" && seat !== state.last.seat && !(seat in state.claims)) {
    out.push({ t: "pass" });
    const sc = scoreWin(state, { seat, tile: state.last.k, how: "rob" });
    if (sc.fan >= state.opts.minFan) out.push({ t: "win", fan: sc.fan });
  }
  return out;
}
/** Seats still to answer a discard or an added kong (in order after the one who made it). */
export function waitingOn(state) {
  if (state.phase === "act") return [state.turn];
  if (state.phase !== "claim" && state.phase !== "rob") return [];
  const out = [];
  for (let i = 1; i < 4; i++) { const seat = (state.last.seat + i) % 4; if (!(seat in state.claims)) out.push(seat); }
  return out;
}
const same = (a, b) => a.t === b.t && (a.k ?? null) === (b.k ?? null) && (a.how ?? null) === (b.how ?? null);

// ---------- playing ----------
/** Applies a seat's action (one of legal(state, seat)); throws on anything else. Returns the state. */
export function act(state, seat, action) {
  const ok = legal(state, seat).find(a => same(a, action));
  if (!ok) throw new Error(`not a legal move for seat ${seat}: ${JSON.stringify(action)} (${state.phase})`);
  const s = state.seats[seat];
  if (state.phase === "act") {
    if (action.t === "win") return finishWin(state, { seat, tile: state.drawn, how: "self" });
    if (action.t === "flowers") {
      // shown seven (or eight) flowers: an immediate self-drawn win, declined only until another flower comes
      return finishWin(state, { seat, tile: null, how: "flowers" });
    }
    if (action.t === "kong") return kong(state, seat, action);
    // a discard
    s.hand.splice(s.hand.indexOf(action.k), 1);
    s.river.push({ k: action.k });
    if (s.flowers.length >= 7) s.declinedFlowers = [...(s.declinedFlowers || []), s.flowers.length];
    state.flags.earthly = seat === state.dealer && state.flags.firstTurn[seat] && state.flags.calls === 0 && !state.flags.dealerKong;
    state.flags.heavenly = false;
    state.flags.firstTurn[seat] = false;
    state.flags.afterKong = false; state.flags.kongChain = 0;
    state.flags.finalDiscard = wallLeft(state) === 0;
    state.last = { seat, k: action.k, e: "discard" };
    state.drawn = null;
    state.phase = "claim";
    state.claims = {};
    log(state, { e: "discard", seat, k: action.k });
    if (noFan(state.opts)) follow(state, seat, action.k);
    return settleClaims(state);
  }
  // answering a discard or a kong: passing a win you could have taken bars your discard wins until you next draw
  // (糊一唔糊二)
  if (action.t === "pass" && state.phase === "claim" && ok && legal(state, seat).some(a => a.t === "win")) s.passBlock = true;
  state.claims[seat] = action;
  return settleClaims(state);
}
/**
 * Settles the answers to a discard (or an added kong) as they come: the first seat after the discarder to claim a win
 * takes it (the head bump), once every seat before it that could also win has passed; otherwise, once everyone has
 * answered, a kong or pung, else a chow; nobody: the next seat draws. A seat with nothing it could do passes by itself.
 */
function settleClaims(state) {
  const order = [1, 2, 3].map(i => (state.last.seat + i) % 4);
  for (const seat of order) {
    const a = state.claims[seat];
    if (a === undefined) { if (legal(state, seat).some(x => x.t === "win")) return state; continue; }
    if (a.t === "win") return finishWin(state, { seat, tile: state.last.k, how: state.phase === "rob" ? "rob" : "discard", from: state.last.seat });
  }
  for (const seat of order) if (state.claims[seat] === undefined && legal(state, seat).length <= 1) state.claims[seat] = { t: "pass" };
  if (order.some(seat => state.claims[seat] === undefined)) return state;
  if (state.phase === "rob") {                                    // nobody robbed the kong: it stands, and its replacement comes
    const seat = state.last.seat;
    state.claims = {};
    kongPaid(state, seat, state.last.k);
    return kongDraw(state, seat);
  }
  const from = state.last.seat;
  const taker = order.find(seat => ["kong", "pung"].includes(state.claims[seat]?.t)) ?? order.find(seat => state.claims[seat]?.t === "chow");
  const action = taker === undefined ? null : state.claims[taker];
  state.claims = {};
  if (action) return applyClaim(state, taker, from, action);
  // nobody wants it: the next seat draws, or the wall is dry and the hand is drawn
  if (wallLeft(state) <= 0) return finishDraw(state);
  const seat = nextSeat(from);
  state.turn = seat; state.phase = "act";
  state.flags.earthly = false;
  const d = draw(state, seat, false);
  if (d !== true) return finishDraw(state);
  return state;
}
/** No fan, 跟莊: the dealer's first discard followed by the same tile from each of the others in turn, nothing called
 *  between (flags.follow: how many of the four so far, −1 once it's broken; followK the tile): the dealer pays each 1. */
function follow(state, seat, k) {
  const f = state.flags;
  if (f.follow < 0) return;
  if (f.calls > 0 || seat !== (state.dealer + f.follow) % 4 || (f.follow > 0 && k !== f.followK)) { f.follow = -1; return; }
  if (f.follow === 0) f.followK = k;
  if (++f.follow < 4) return;
  f.follow = -1;
  const pay = [0, 0, 0, 0];
  for (let o = 0; o < 4; o++) if (o !== state.dealer) { pay[o] += 1; pay[state.dealer] -= 1; }
  settle(state, { e: "follow", seat: state.dealer, k, pay });
}
/** No fan: a kong that stands takes 1 from each of the others, there and then. */
function kongPaid(state, seat, k) {
  if (!noFan(state.opts)) return;
  const pay = [0, 0, 0, 0];
  for (let o = 0; o < 4; o++) if (o !== seat) { pay[o] -= 1; pay[seat] += 1; }
  settle(state, { e: "kong-paid", seat, k, pay });
}
/** A payment within the hand (a kong, the follow): into the scores now, and kept for the hand's account. */
function settle(state, entry) {
  for (let i = 0; i < 4; i++) state.scores[i] += entry.pay[i];
  state.paid.push(entry);
  log(state, { e: entry.e, seat: entry.seat, k: entry.k });
}
// The claim itself (pung, kong, chow), recorded when the claims are settled.
function applyClaim(state, seat, from, action) {
  const s = state.seats[seat], k = state.last.k;
  const river = state.seats[from].river;
  river[river.length - 1].by = seat;                              // the discard goes to the claimer
  const take = (kind, n) => { for (let i = 0; i < n; i++) s.hand.splice(s.hand.indexOf(kind), 1); };
  if (action.t === "pung") { take(k, 2); s.melds.push({ t: "pung", k, from, open: true }); }
  else if (action.t === "kong") { take(k, 3); s.melds.push({ t: "kong", k, from, open: true }); }
  else { for (const x of [action.k, action.k + 1, action.k + 2]) if (x !== k) take(x, 1); s.melds.push({ t: "chow", k: action.k, from, open: true, got: k }); }
  state.flags.calls++;
  state.flags.heavenly = false; state.flags.earthly = false;
  state.flags.firstTurn = [false, false, false, false];
  // liability (包): the discard that makes a player's fourth set, or third dragon set, makes its discarder pay for that
  // player's self-drawn win
  const sets = s.melds.length, dragons = s.melds.filter(m => (m.t === "pung" || m.t === "kong") && isDragon(m.k)).length;
  if (sets === 4 || (dragons === 3 && isDragon(k) && action.t !== "chow")) state.liable[seat] = from;
  log(state, { e: action.t, seat, k: action.t === "chow" ? action.k : k, from });
  state.turn = seat; state.phase = "act"; state.drawn = null;
  if (action.t === "kong") { kongPaid(state, seat, k); state.flags.kongChain = 0; return kongDraw(state, seat); }
  return state;
}
/** A kong in your own turn: concealed (four in hand) or added to a pung (which the others may rob). */
function kong(state, seat, action) {
  const s = state.seats[seat];
  if (action.how === "concealed") {
    for (let i = 0; i < 4; i++) s.hand.splice(s.hand.indexOf(action.k), 1);
    s.melds.push({ t: "kong", k: action.k, from: -1, open: false });
    if (seat === state.dealer && state.flags.firstTurn[seat]) state.flags.dealerKong = true;
    state.flags.heavenly = false;
    log(state, { e: "kong", seat, k: action.k, how: "concealed" });
    kongPaid(state, seat, action.k);
    return kongDraw(state, seat);
  }
  // added: the others may rob it (搶槓) before it stands
  s.hand.splice(s.hand.indexOf(action.k), 1);
  const m = s.melds.find(x => x.t === "pung" && x.k === action.k);
  m.t = "kong"; m.added = true;
  log(state, { e: "kong", seat, k: action.k, how: "added" });
  state.last = { seat, k: action.k, e: "added" };
  state.phase = "rob"; state.claims = {};
  state.flags.heavenly = false;
  return settleClaims(state);
}
function kongDraw(state, seat) {
  state.flags.kongChain = (state.flags.afterKong ? state.flags.kongChain : 0) + 1;
  state.turn = seat; state.phase = "act";
  const d = draw(state, seat, true);
  if (d !== true) return finishDraw(state);
  state.flags.afterKong = true;
  return state;
}

// ---------- the end of a hand ----------
/** A win: the fan, who pays (the discarder all of it; a self-draw, all three; a liable seat, the whole self-draw). */
function finishWin(state, win) {
  const sc = scoreWin(state, win);
  const b = base(sc.fan);
  let pay = [0, 0, 0, 0];
  const self = win.how === "self" || win.how === "flowers";
  let liable = -1;
  if (noFan(state.opts)) {
    pay = payNoFan(state.dealer, win.seat, self, self ? -1 : win.how === "rob" ? state.last.seat : win.from);
    if (win.how === "rob") {                                      // the robbed kong goes back to a pung
      const m = state.seats[state.last.seat].melds.find(x => x.t === "kong" && x.k === win.tile && x.added);
      if (m) { m.t = "pung"; delete m.added; }
    }
  } else if (self) {
    liable = state.liable[win.seat];
    if (liable >= 0) { pay[liable] -= 6 * b; pay[win.seat] += 6 * b; }
    else for (let o = 0; o < 4; o++) if (o !== win.seat) { pay[o] -= 2 * b; pay[win.seat] += 2 * b; }
  } else {
    const from = win.how === "rob" ? state.last.seat : win.from;
    pay[from] -= 4 * b; pay[win.seat] += 4 * b;
    if (win.how === "rob") {                                      // the robbed kong goes back to a pung
      const m = state.seats[from].melds.find(x => x.t === "kong" && x.k === win.tile && x.added);
      if (m) { m.t = "pung"; delete m.added; }
    }
  }
  if (!self) state.seats[win.seat].hand.push(win.tile), state.seats[win.seat].hand.sort((a, b) => a - b);
  for (let i = 0; i < 4; i++) state.scores[i] += pay[i];
  state.phase = "over";
  const nf = noFan(state.opts);                                   // no fan: nothing counted, every win alike
  state.result = { kind: "win", seat: win.seat, how: win.how, from: self ? -1 : (win.how === "rob" ? state.last.seat : win.from), tile: win.tile, fan: nf ? 0 : sc.fan, raw: nf ? 0 : sc.raw, items: nf ? [] : sc.items, limit: nf ? false : sc.limit, base: nf ? 1 : b, pay, liable };
  log(state, { e: "win", seat: win.seat, how: win.how });
  return state;
}
function finishDraw(state) {
  state.phase = "over";
  state.result = { kind: "draw", pay: [0, 0, 0, 0] };
  log(state, { e: "draw-game" });
  return state;
}

// ---------- sessions: hands, the deal moving round, the rounds of wind ----------
/**
 * The next hand's settings after this one: the dealer keeps the deal when they win or the hand is drawn, else it
 * passes to the next seat; the round's wind moves on when the deal comes back to the session's first dealer. Null
 * when the session is over (its rounds played).
 */
export function nextHand(state, session) {
  const r = state.result;
  const keep = !r || r.kind === "draw" || r.seat === state.dealer;
  let dealer = state.dealer, round = state.round;
  if (!keep) {
    dealer = nextSeat(state.dealer);
    if (dealer === session.firstDealer) round++;
  }
  if (round >= (state.opts.rounds || 1)) return null;
  return { seed: (session.seed + (state.hand + 1) * 7919) >>> 0, dealer, round, hand: state.hand + 1, opts: state.opts, scores: state.scores };
}

// ---------- the state as a shared room keeps it ----------
/**
 * A state read from the room put back as it was written: the database keeps no nulls and no empty lists, and turns
 * an object of seats into a list with holes. Nothing in it may be undefined: the database refuses a whole write for one
 * undefined anywhere in it.
 */
export function fromRoom(g) {
  if (!g) return g;
  g.seats = [0, 1, 2, 3].map(i => {
    const s = g.seats?.[i] || {};
    return { hand: s.hand || [], melds: (s.melds || []).map(m => ({ ...m })), flowers: s.flowers || [], river: (s.river || []).map(d => ({ ...d })), passBlock: !!s.passBlock, ...(s.declinedFlowers ? { declinedFlowers: s.declinedFlowers } : {}) };
  });
  g.wall = g.wall || [];
  g.drawn = g.drawn ?? null;
  g.last = g.last ?? null;
  const claims = {};
  for (const [k, v] of Object.entries(g.claims || {})) if (v) claims[k] = v;
  g.claims = claims;
  g.liable = [0, 1, 2, 3].map(i => g.liable?.[i] ?? -1);
  g.flags = { afterKong: false, kongChain: 0, lastDraw: false, finalDiscard: false, heavenly: false, earthly: false, calls: 0, follow: -1, followK: -1, ...(g.flags || {}) };
  g.paid = (g.paid || []).map(e => ({ ...e, pay: [0, 1, 2, 3].map(i => e.pay?.[i] || 0) }));
  g.flags.firstTurn = [0, 1, 2, 3].map(i => !!g.flags.firstTurn?.[i]);
  g.log = g.log || [];
  g.scores = [0, 1, 2, 3].map(i => g.scores?.[i] || 0);
  g.result = g.result ?? null;
  if (g.result) {
    g.result.pay = [0, 1, 2, 3].map(i => g.result.pay?.[i] || 0);
    g.result.items = g.result.items || [];
  }
  g.opts = rulesOf(g.opts);
  return g;
}
