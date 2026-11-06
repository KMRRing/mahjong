// Mahjong's second view (Menu, View: Table or 3D; 23 October 2026, Korbi asking for "a mahjong and Guandan view that are
// similarly stylish, 3d design like, as the mtg one. Very clean. Full screen modes included."): the same game drawn as
// a table seen at an angle. The cloth is a plane tipped away from you (CSS perspective, so the player across is
// further off and a little smaller); the four walls stand round it as stacks of two tiles, eaten from one end by the
// draws and from the other by the flowers' and kongs' replacements; inside them each player's discards lie in their own
// pool, the latest ringed; outside them the others' hands stand as backs with their sets and flowers face up beside
// them; in the middle is the round's plate (the wind, the wall's count, the four seats' winds lit for whoever is to
// move, or the discard on offer to you). Tiles are slabs (hong-tiles.js): an ivory face, its side, the green back at
// the foot. The others' names and scores are plates across the top; yours, your tiles, the coach and your buttons are
// the page's own elements, which hong.js draws for whichever view is showing. Tiles move as the game does: drawn from
// the wall, let go onto the pool, taken for a set, each flown from where it was (the Web Animations API, as Dandan's
// cards). This file keeps what can be worked out without a page (the geometry; tests/hong.mjs) apart from the view.
import * as E from "./hong-engine.js";
import { slabSvg, SLAB_H, TILE_W } from "./hong-tiles.js";

// ---------- the geometry (pure) ----------
// Everything on the plane is laid out in px of the plane from a handful of ratios: a wall stack's width p is the unit
// of the ring and of the strips beyond it; a discard's width d is the unit of the pools inside it.
export const WT = 4 / 3;                                         // a wall stack's depth in its widths: a tile lies 22 across and 29 long
export const SR = SLAB_H / TILE_W;                               // a slab's height over its width
const STRIP = { top: 1.75, side: 1.5, foot: 0.3 };               // the room outside the ring (the player across, the others, your edge), in p
const PAD = 0.2;                                                 // between the ring and the pools, in p
const DISC = { px: 1.05, py: 1.5 };                              // a discard's pitch across and down, in its widths (a row tucks under the last's thickness)
const GAP = 0.42, PLATE = 2.6;                                   // between the pools and the plate, and the least plate, in discard widths
export const RIVER = 24;                                         // the most discards on a table in 1,800 of the computer players' hands
export const TILT = 17, EYE = 2.3;                               // the plane's tilt (degrees) and the eye's distance (in field heights)
/** How the pools can lie: [discards to a row in the middle (yours and the player across's), in a side pool]. */
const WAYS = [[6, 4], [6, 6], [8, 4], [6, 3], [12, 4], [8, 6], [12, 6], [8, 3]];

const rad = d => (d * Math.PI) / 180;
/** The plane's height for a field's: it fills the field once tipped and seen from EYE field heights (the eye level with the near edge). */
export const planeHeight = fh => (fh * EYE) / (EYE * Math.cos(rad(TILT)) - Math.sin(rad(TILT)));

/** The ring of wall stacks, in the order they're drawn (counter-clockwise from the near edge's left end: yours, the right's,
 *  the far one, the left's), in stack widths from the ring's corner: [{ side, x, y, w, h }], side 0 near, 1 right, 2 far, 3 left. */
export function ring(nTop, nSide) {
  const W = nTop, H = nSide + 2 * WT, out = [];
  for (let i = 0; i < nTop; i++) out.push({ side: 0, x: i, y: H - WT, w: 1, h: WT });
  for (let j = 0; j < nSide; j++) out.push({ side: 1, x: W - WT, y: H - WT - 1 - j, w: WT, h: 1 });
  for (let i = 0; i < nTop; i++) out.push({ side: 2, x: W - 1 - i, y: 0, w: 1, h: WT });
  for (let j = 0; j < nSide; j++) out.push({ side: 3, x: 0, y: WT + j, w: WT, h: 1 });
  return out;
}
/** Where the wall begins: the first stack of the dealer's side (rel: where the dealer sits from you; nTop and nSide the sides' lengths). */
export const wallStart = (rel, nTop, nSide) => [0, nTop, nTop + nSide, 2 * nTop + nSide][rel];
/** How many tiles a stack still has: tiles 2i and 2i + 1 of the wall, those before `head` drawn, those from `tail` on taken for replacements. */
export const stackLeft = (i, head, tail) => (2 * i >= head && 2 * i < tail ? 1 : 0) + (2 * i + 1 >= head && 2 * i + 1 < tail ? 1 : 0);

/**
 * The best way to lay the table out in a plane of box = { w, h } px: how long the ring's sides are (the wall is `half`
 * stacks to a pair of sides), how many discards to a row, and the discard's width, as large as it will go (no larger than
 * `cap`, your own tile's), the walls and strips and plate as large as that leaves. Of the ways within a twentieth of the
 * largest discard, the one with the largest wall, then the closest to a real table's rows of six.
 */
export function plan(box, { half, rows = RIVER, cap = Infinity }) {
  const found = [];
  for (let nTop = 12; nTop <= half - 8; nTop++) {
    const nSide = half - nTop;
    const Wc = nTop + 2 * STRIP.side, Hc = STRIP.top + nSide + 2 * WT + STRIP.foot;
    const p = Math.min(box.w / Wc, box.h / Hc);
    const ix = (nTop - 2 * WT - 2 * PAD) * p, iy = (nSide - 2 * PAD) * p;
    WAYS.forEach(([m, c], way) => {
      const rm = Math.ceil(rows / m), rc = Math.ceil(rows / c);
      const dh = ix / (DISC.px * (2 * c + m) + 2 * GAP);
      const dv = Math.min(iy / (2 * rm * DISC.py + 2 * GAP + PLATE), iy / (rc * DISC.py));
      const d = Math.min(dh, dv, cap);
      if (d > 0) found.push({ nTop, nSide, m, c, rm, rc, p, d, way });
    });
  }
  const largest = Math.max(...found.map(f => f.d));
  return found.filter(f => f.d >= largest * 0.95).sort((a, b) => b.p - a.p || a.way - b.way)[0];
}

/**
 * Where everything is, in px of the plane (a plan laid in a box): the ring's stacks, each seat's pool (by where it sits
 * from you: 0 you, 1 the right, 2 across, 3 the left) with slot(i) for the place of its i-th discard, the plate in the
 * middle, and the strips outside the ring for the three others' hands and sets.
 */
export function compose(pl, box) {
  const { nTop, nSide, m, c, rm, rc, p, d } = pl;
  const Wc = (nTop + 2 * STRIP.side) * p, Hc = (STRIP.top + nSide + 2 * WT + STRIP.foot) * p;
  const ox = (box.w - Wc) / 2, oy = (box.h - Hc) / 2;
  const at = (x, y) => ({ x: ox + (STRIP.side + x) * p, y: oy + (STRIP.top + y) * p });
  const stacks = ring(nTop, nSide).map(r => ({ side: r.side, ...at(r.x, r.y), w: r.w * p, h: r.h * p }));
  // the pools: three columns (the left's, the middle's, the right's) inside the ring, the plate between the middle's two
  const ix0 = ox + (STRIP.side + WT + PAD) * p, iy0 = oy + (STRIP.top + WT + PAD) * p;
  const ix = (nTop - 2 * WT - 2 * PAD) * p, iy = (nSide - 2 * PAD) * p;
  const px = DISC.px * d, py = DISC.py * d, cw = c * px, mw = m * px, hm = rm * py, hc = rc * py, gap = GAP * d;
  const spare = Math.max(0, ix - 2 * cw - mw - 2 * gap);          // what's over goes between the columns, mostly, and a little to the edges
  const between = gap + spare * 0.32, xL = ix0 + spare * 0.18, xM = xL + cw + between, xR = xM + mw + between;
  const cy = iy0 + iy / 2, avail = iy - 2 * hm - 2 * gap;
  const plate = { w: Math.min(mw, 9.5 * d), h: Math.max(2 * d, Math.min(avail, 4.4 * d)) };
  plate.x = xM + (mw - plate.w) / 2; plate.y = cy - plate.h / 2;
  // a pool's i-th discard: along its rows, the first row nearest the plate for the middle's two (the player across's grow upward)
  const grid = (x, y, per, rowsN = 0) => i => ({ x: x + (i % per) * px, y: y + (rowsN ? rowsN - 1 - Math.floor(i / per) : Math.floor(i / per)) * py });
  const pools = [
    { x: xM, y: plate.y + plate.h + gap, w: mw, h: hm, per: m },
    { x: xR, y: cy - hc / 2, w: cw, h: hc, per: c },
    { x: xM, y: plate.y - gap - hm, w: mw, h: hm, per: m },
    { x: xL, y: cy - hc / 2, w: cw, h: hc, per: c },
  ];
  pools.forEach((q, r) => { q.slot = grid(q.x, q.y, q.per, r === 2 ? rm : 0); });
  // the strips: the player across's along the top, the others' down their sides, beside the ring; yours is the foot
  const strips = [
    null,
    { x: ox + (STRIP.side + nTop) * p, y: oy + STRIP.top * p, w: STRIP.side * p, h: (nSide + 2 * WT) * p, axis: "y" },
    { x: ox + STRIP.side * p, y: oy, w: nTop * p, h: STRIP.top * p, axis: "x" },
    { x: ox, y: oy + STRIP.top * p, w: STRIP.side * p, h: (nSide + 2 * WT) * p, axis: "y" },
  ];
  return { p, d, t: 0.9 * p, stacks, pools, plate, strips, nTop, nSide, box: { x: ox, y: oy, w: Wc, h: Hc } };
}

/**
 * One seat's hand and sets laid along its strip (rel: 1 the right's, 2 across, 3 the left's): the hand as backs (a tile
 * set apart when it has just drawn) or, once it has won, face up; its sets face up; its flowers two to a place. `t` is a
 * tile's width on the strip; everything shrinks to fit the strip's length. Items: { key, k (-1 a back), cx, cy, w, h,
 * rot, small, won } in the plane's px.
 */
export function stripItems(strip, rel, t, info) {
  const along = strip.axis === "x", cells = [];
  const turn = rel === 3 ? 90 : -90;                              // a hidden tile on a side stands across its strip
  const cell = (len, pre, ...tiles) => cells.push({ len, pre, tiles });
  info.hand.forEach((tile, i) => {
    const up = info.show, w = up ? 0.9 * t : t, h = w * SR, apart = info.apart && i === info.hand.length - 1;
    cell(along ? w * 1.02 : up ? h * 0.96 : t * 0.62, apart ? 0.45 * t : 0, { key: `h${i}`, k: up ? tile : -1, w, h, v: 0, rot: !up && !along ? turn : 0, won: info.won === i });
  });
  info.melds.forEach((m, j) => m.forEach((k, i) => {
    const w = 0.9 * t, h = w * SR;
    cell(along ? w * 1.02 : h * 0.96, i === 0 ? 0.5 * t : 0, { key: `m${j}:${i}`, k, w, h, v: 0, rot: 0 });
  }));
  const fw = 0.52 * t, fh = fw * SR;
  for (let i = 0; i < info.flowers.length; i += 2) {
    const pair = info.flowers.slice(i, i + 2).map((k, j) => ({ key: `f${i + j}`, k, w: fw, h: fh, v: (j ? 0.5 : -0.5) * (along ? fh : fw) * 1.04, rot: 0, small: true }));
    cell(along ? fw * 1.06 : fh * 0.98, i === 0 ? 0.5 * t : 0, ...pair);
  }
  const total = cells.reduce((n, c) => n + c.len + c.pre, 0);
  const length = along ? strip.w : strip.h, f = Math.min(1, (length * 0.98) / (total || 1));
  const mid = along ? strip.y + strip.h / 2 : strip.x + strip.w / 2, items = [];
  let pos = (length - total * f) / 2;
  for (const c of cells) {
    pos += c.pre * f;
    const a = pos + (c.len * f) / 2;
    for (const x of c.tiles) {
      const v = x.v * f;
      items.push({ key: x.key, k: x.k, cx: along ? strip.x + a : mid + v, cy: along ? mid + v : strip.y + a, w: x.w * f, h: x.h * f, rot: x.rot, small: !!x.small, won: !!x.won });
    }
    pos += c.len * f;
  }
  return items;
}

/** A seat's discards still on the table (a claimed one went to the claimer's set): { k, raw (its place in the seat's river), last }. */
export function riverOf(G, seat) {
  const r = G.seats[seat].river, lastAt = G.last && G.last.seat === seat && G.last.e === "discard" ? r.length - 1 : -1;
  const out = [];
  r.forEach((d, raw) => { if (d.by === undefined) out.push({ k: d.k, raw, last: raw === lastAt }); });
  return out;
}
/**
 * What the log says happened since it was `from` long, for the flights: draws, discards and the calls on them, each with
 * the seat, the tile where the log says it, and for a discard (or the one a call took) its place in its seat's river.
 */
export function movesSince(G, from) {
  const counts = [0, 0, 0, 0], out = [];
  let lastD = null;
  G.log.forEach((e, i) => {
    if (e.e === "discard") lastD = { seat: e.seat, raw: counts[e.seat]++, k: e.k };
    if (i < from) return;
    if (e.e === "draw") out.push({ t: "draw", seat: e.seat, tail: !!e.fromTail });
    else if (e.e === "discard") out.push({ t: "discard", seat: e.seat, k: e.k, raw: lastD.raw });
    else if ((e.e === "pung" || e.e === "chow" || e.e === "kong") && e.from !== undefined && e.from >= 0 && !e.how) out.push({ t: "claim", seat: e.seat, kind: e.e, k: lastD.k, from: lastD.seat, raw: lastD.raw });
  });
  return out;
}

// ---------- the view ----------
const still = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const FLY_MS = 440, EASE = "cubic-bezier(.3, .7, .2, 1)", MOST_FLIGHTS = 6;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/**
 * The view, given what it reads of hong.js (c): the state and your seat (state(), me()), names (nameOf), the tiles of a
 * set (meldTiles), who the computer is thinking for (busy()), whether a partner's watching frame is showing (quiet), the
 * widest a discard may be on screen (cap()), where the header's buttons lie over the board in full screen
 * (headerOver(el)), whether you have a call to answer (answering()), and your tiles on the page (hand()).
 */
export function createTable3d(c) {
  const $ = id => document.getElementById(id);
  const box = $("board3d");
  box.innerHTML = `
    <div class="hk3-hud" id="hk3hud"></div>
    <div class="hk3-field" id="hk3field">
      <div class="hk3-stage"><div class="hk3-plane" id="hk3plane">
        <div class="hk3-cloth"></div><div class="hk3-world" id="hk3world"></div><div class="hk3-centre" id="hk3centre"></div>
      </div></div>
      <div class="hk3-banner" id="hk3banner" aria-live="polite"></div>
      <button type="button" class="hk3-look" id="hk3look" hidden></button>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", `<div class="hk3-fx" id="hk3fx" aria-hidden="true"></div>`);
  const hudEl = $("hk3hud"), field = $("hk3field"), plane = $("hk3plane"), world = $("hk3world"), centreEl = $("hk3centre"), fx = $("hk3fx"), lookEl = $("hk3look"), bannerEl = $("hk3banner");
  let geo = null, geoKey = "", seen = null, snap = null, jump = false, reading = null;
  // the third view (hong-gl.js) is loaded when first chosen: three.js is large and the other two views don't need it
  let gl = null, glLoading = false;
  const glOn = () => !!c.gl?.();
  function needGL() {
    if (gl || glLoading) return;
    glLoading = true;
    import("./hong-gl.js").then(m => { gl = m.createGL({ host: field }); draw(); }, e => { console.error(e); glLoading = false; c.glFailed?.(); });
  }
  const flying = new Set();

  /** An element's contents, set only when they change (what runs on it, a pulse, doesn't restart). */
  const fill = (el, html) => { if (el._h !== html) { el.innerHTML = html; el._h = html; } };
  const moving = () => !still?.matches && !document.hidden && !c.quiet;

  /** The plane's children as these items, each kept from the last draw where it was (so it can slide), made where it's new. */
  function sync(parent, list) {
    const have = new Map();
    for (const el of parent.children) have.set(el.dataset.k, el);
    for (const it of list) {
      let el = have.get(it.key);
      if (el) have.delete(it.key);
      else { el = document.createElement(it.tag); el.dataset.k = it.key; parent.append(el); }
      const cls = flying.has(it.key) ? `${it.cls} coming` : it.cls;
      if (el.className !== cls) el.className = cls;
      const st = `width:${it.w.toFixed(1)}px;height:${it.h.toFixed(1)}px;transform:translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)${it.rot ? ` rotate(${it.rot}deg)` : ""};z-index:${Math.round(it.y + it.h)}`;
      if (el._st !== st) { el.style.cssText = st; el._st = st; }
      for (const [k, v] of Object.entries(it.attrs || {})) if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v);
      if (el._html !== it.html) { el.innerHTML = it.html || ""; el._html = it.html; }
    }
    for (const el of have.values()) el.remove();
  }

  // ---------- what's on the plane ----------
  const rel = (seat, me) => (seat - me + 4) % 4;
  const claim = G => (G.phase === "claim" || G.phase === "rob") && G.last ? G.last : null;
  const answering = G => !!claim(G) && c.answering();
  /** A hand's strip, for a seat: its tiles, apart when just drawn; face up once it has won. */
  function infoOf(G, seat) {
    const s = G.seats[seat], r = G.result, won = G.phase === "over" && r?.kind === "win" && r.seat === seat;
    return { hand: s.hand, apart: G.phase === "act" && G.turn === seat && s.hand.length % 3 === 2, show: won, won: won && r.tile != null ? s.hand.lastIndexOf(r.tile) : -1, melds: s.melds.map(c.meldTiles), flowers: s.flowers };
  }
  function items(G, me) {
    const out = [], g = geo, d = g.d, n = g.stacks.length, offer = answering(G);
    // the wall: from the dealer's side, the head's stack the next to draw, the tail's where the replacements come from
    const start = wallStart(rel(G.dealer, me), g.nTop, g.nSide), head = Math.floor(G.head / 2), tail = Math.floor((G.tail - 1) / 2);
    for (let i = 0; i < n; i++) {
      const r = g.stacks[(start + i) % n], left = stackLeft(i, G.head, G.tail);
      out.push({ g3: { kind: "wall", side: r.side, n: left, head: !!(left && i === head), tail: !!(left && i === tail) }, key: `w${i}`, tag: "div", cls: `hk3-w s${r.side} n${left}${left && i === head ? " head" : ""}${left && i === tail ? " tail" : ""}`, ...r, x: r.x, y: r.y });
    }
    // the pools: a frame for each, lit while its player is to move, and the discards
    const turn = G.phase === "act" ? G.turn : -1;
    for (let r = 0; r < 4; r++) {
      const seat = (me + r) % 4, q = g.pools[r];
      out.push({ g3: { kind: "pool", on: seat === turn }, key: `p${r}`, tag: "div", cls: `hk3-pool r${r}${seat === turn ? " on" : ""}`, x: q.x - 0.25 * d, y: q.y - 0.2 * d, w: q.w + 0.45 * d, h: q.h + 0.4 * d });
      riverOf(G, seat).forEach((t, i) => {
        const { x, y } = q.slot(i);
        out.push({ g3: { kind: "disc", k: t.k, last: !!t.last, offer: !!(t.last && offer) }, key: `d${seat}:${t.raw}`, tag: "button", cls: `hk3-t d${t.last ? " last" : ""}${t.last && offer ? " offer" : ""}`, x, y, w: d, h: d * SR, html: slabSvg(t.k),
          attrs: { "data-read": t.k, "data-ctx": `${c.nameOf(seat)}’s discard`, "aria-label": `${E.tileName(t.k)}, ${c.nameOf(seat)}’s discard` } });
      });
    }
    // the others' hands, sets and flowers on their strips
    for (let r = 1; r < 4; r++) {
      const seat = (me + r) % 4, strip = g.strips[r];
      for (const it of stripItems(strip, r, g.t, infoOf(G, seat))) {
        const read = it.k >= 0;
        out.push({ g3: { kind: "strip", k: it.k, rel: r, part: it.key[0], small: !!it.small, won: !!it.won }, key: `s${seat}:${it.key}`, tag: read ? "button" : "div", cls: `hk3-t ${it.k < 0 ? "hidden" : "up"}${it.small ? " small" : ""}${it.won ? " won" : ""}`, x: it.cx - it.w / 2, y: it.cy - it.h / 2, w: it.w, h: it.h, rot: it.rot, html: slabSvg(it.k),
          attrs: read ? { "data-read": it.k, "data-ctx": `${c.nameOf(seat)}’s ${it.key[0] === "f" ? "flower" : it.key[0] === "m" ? "set" : "hand"}`, "aria-label": `${E.tileName(it.k)}, ${c.nameOf(seat)}’s ${it.key[0] === "f" ? "flower" : it.key[0] === "m" ? "set" : "tile"}` } : {} });
      }
    }
    return out;
  }

  // ---------- the plate in the middle ----------
  function centre(G, me) {
    const p = geo.plate, turn = G.phase === "act" ? G.turn : c.busy() ?? -1, offer = answering(G) ? claim(G) : null;
    centreEl.classList.toggle("slim", p.h < 3 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));   // too short for a second line between the seats' badges
    centreEl.style.cssText = `left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;width:${p.w.toFixed(1)}px;height:${p.h.toFixed(1)}px;--u:${Math.min(p.h, p.w / 1.9).toFixed(1)}px`;
    const badge = r => { const seat = (me + r) % 4, w = E.windOf(G, seat); return `<i class="hk3-cb r${r}${w === 0 ? " dealer" : ""}${seat === turn ? " on" : ""}">${E.WINDS[w]}</i>`; };
    const mid = offer
      ? `<span class="hk3-offer">${slabSvg(offer.k)}</span><span class="hk3-cap"><b>${esc(c.nameOf(offer.seat))}</b><small>${G.phase === "rob" ? "adds to a kong" : "lets go"}</small></span>`
      : `<b class="hk3-cwind">${E.WINDS[G.round]}</b><span class="hk3-cap"><b class="hk3-count">${E.wallLeft(G)}</b><small>in the wall</small></span>`;
    fill(centreEl, `${[0, 1, 2, 3].map(badge).join("")}<div class="hk3-mid${offer ? " offering" : ""}">${mid}</div>`);
  }

  // ---------- the others' plates across the top ----------
  function hud(G, me) {
    const turn = G.phase === "act" ? G.turn : -1, thinking = c.busy();
    const plate = r => {
      const seat = (me + r) % 4, w = E.windOf(G, seat), s = G.seats[seat], is = thinking === seat;
      return `<div class="hk3-plate r${r}${w === 0 ? " dealer" : ""}${seat === turn || is ? " on" : ""}${is ? " thinking" : ""}"><b class="hk3-wind">${E.WINDS[w]}</b><span class="hk3-nm">${esc(c.nameOf(seat))}</span><span class="hk3-sc">${signed(G.scores[seat])}</span><span class="hk3-ct" aria-label="${s.hand.length} tiles held">${is ? "…" : s.hand.length}</span></div>`;
    };
    fill(hudEl, [3, 2, 1].map(plate).join(""));
    // in full screen the header's buttons lie over the board's top right: the plates keep left of them, and the plane under them
    const over = c.headerOver(box);
    hudEl.style.paddingRight = over ? `${Math.max(0, box.clientWidth - over.left + 4)}px` : "";
    hudEl.style.minHeight = over ? `${over.bottom}px` : "";
    hudEl.classList.toggle("tight", hudEl.clientWidth / 3 < 7.4 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
  }

  // ---------- the end of a hand, across the plate ----------
  function banner(G, me) {
    const r = G.result;
    let text = "";
    if (G.phase === "over") {
      if (r?.kind === "win") text = `${r.seat === me ? "You win" : `${c.nameOf(r.seat)} wins`}${r.fan ? ` · ${r.fan} fan` : ""}`;
      else text = "A drawn hand";
    }
    // across the plate: what the hand ended with is on the pools and strips, which a band anywhere else would cover
    if (text) { const pr = centreEl.getBoundingClientRect(), fr = field.getBoundingClientRect(); bannerEl.style.top = `${(pr.top + pr.height / 2 - fr.top).toFixed(0)}px`; }
    if (bannerEl._text === text) return;
    bannerEl._text = text;
    bannerEl.innerHTML = text ? `<span>${esc(text)}</span>` : "";
    bannerEl.classList.toggle("show", !!text);
    if (text && moving()) bannerEl.firstElementChild.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE });
  }

  // ---------- a tile read: tapped, large over the table (tap it to put it down) ----------
  function read(el) {
    const k = Number(el.dataset.read);
    reading = { k, ctx: el.dataset.ctx || "" };
    lookEl.hidden = false;
    lookEl.innerHTML = `<span class="hk3-lk">${slabSvg(k)}</span><b>${esc(E.tileName(k))}</b><small>${esc(reading.ctx)}</small>`;
    lookEl.setAttribute("aria-label", `${E.tileName(k)}. Tap to put it down.`);
  }
  const unread = () => { reading = null; lookEl.hidden = true; };
  plane.addEventListener("click", e => { const t = e.target.closest("[data-read]"); if (t) read(t); });
  lookEl.addEventListener("click", unread);

  // ---------- drawing ----------
  function empty() {
    world.replaceChildren();
    fill(hudEl, "");
    fill(centreEl, "");
    fill(bannerEl, "");
    bannerEl._text = "";
    unread();
    geoKey = ""; seen = null; snap = null;
  }
  /** Draw the table. */
  function draw() {
    const G = c.state();
    if (!G) { empty(); return; }
    const me = c.me();
    hud(G, me);
    const fr = field.getBoundingClientRect();
    if (fr.width < 40 || fr.height < 40) return;
    const fw = Math.round(fr.width), fh = Math.round(fr.height), hp = Math.round(planeHeight(fh));
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const half = (G.wall?.length ?? (G.opts.flowers ? 144 : 136)) / 4;
    const rows = Math.max(RIVER, ...[0, 1, 2, 3].map(s => riverOf(G, s).length));
    const key = [fw, fh, half, rows, Math.round(c.cap()), Math.round(rem)].join();
    if (key !== geoKey) {
      // the cloth has a margin all round (a rim), the layout the rest
      const rim = 0.55 * rem, cap = c.cap();
      geo = compose(plan({ w: fw - 2 * rim, h: hp - 2 * rim }, { half, rows, cap }), { w: fw, h: hp });
      geoKey = key;
      jump = true;
      field.style.setProperty("--fw", `${fw}px`);
      field.style.setProperty("--fh", `${fh}px`);
      field.style.setProperty("--hp", `${hp}px`);
      field.style.setProperty("--eye", `${(EYE * fh).toFixed(0)}px`);
      field.style.setProperty("--tilt", `${TILT}deg`);
      plane.style.setProperty("--p", `${geo.p.toFixed(2)}px`);
      plane.style.setProperty("--d", `${geo.d.toFixed(2)}px`);
    }
    if (jump) { plane.classList.add("jump"); requestAnimationFrame(() => requestAnimationFrame(() => plane.classList.remove("jump"))); jump = false; }
    field.classList.toggle("gl", glOn());
    if (glOn()) {
      centre(G, me);
      if (!drawGL(G, me, fw, fh, hp)) { field.classList.remove("gl"); c.glFailed?.(); }
      banner(G, me);
      return;
    }
    gl?.show(false);
    sync(world, items(G, me));
    centre(G, me);
    banner(G, me);
    if (reading && !world.querySelector(`[data-read="${reading.k}"]`)) unread();
  }

  /** The same items, stood up in the scene (hong-gl.js): hidden tiles stay backs whatever they are. */
  function drawGL(G, me, fw, fh, hp) {
    needGL();
    if (!gl) return true;
    if (gl.failed) return false;
    gl.show(true);
    const p = geo.plate, turn = G.phase === "act" ? G.turn : c.busy() ?? -1, offer = answering(G) ? claim(G) : null;
    const badges = [0, 1, 2, 3].map(r => { const seat = (me + r) % 4, w = E.windOf(G, seat); return { w: E.WINDS[w], dealer: w === 0, on: seat === turn }; });
    const ok = gl.set({
      items: items(G, me), labels: c.labels ? c.labels() : true, strips: geo.strips, d: geo.d, plane: { w: fw, h: hp }, box: { w: fw, h: fh }, jump: plane.classList.contains("jump"),
      plate: p, centre: { badges, round: E.WINDS[G.round], left: E.wallLeft(G), offer: offer ? { tile: E.tileName(offer.k), who: c.nameOf(offer.seat), how: G.phase === "rob" ? "adds to a kong" : "lets go" } : null },
    });
    return ok;
  }

  // ---------- motion: what moved since the last draw, flown from where it was ----------
  /** The screen as it was, before a new state is drawn (render calls this first): where each tile of the plane and of your hand is, if the log has moved. */
  function snapshot() {
    snap = null;
    const G = c.state();
    if (!G || !moving() || !seen) return;
    if (seen.id !== `${G.seed}:${G.hand}` || G.log.length <= seen.len) return;
    const rects = new Map(), mine = [];
    for (const el of world.querySelectorAll(".hk3-t, .hk3-w")) rects.set(el.dataset.k, el.getBoundingClientRect());
    for (const el of c.hand()) mine.push({ k: Number(el.dataset.k), picked: el.classList.contains("picked"), r: el.getBoundingClientRect() });
    snap = { rects, mine };
  }
  const centred = r => (r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null);
  /** The flights for what's new in the log, once the page is drawn (render calls this last). */
  function fly() {
    const G = c.state();
    if (!G) return;
    const id = `${G.seed}:${G.hand}`, was = snap, before = seen;
    snap = null;
    seen = { id, len: G.log.length };
    if (!was || !before || before.id !== id) return;
    const me = c.me();
    const list = movesSince(G, before.len).slice(-MOST_FLIGHTS);
    const stack = i => `w${i}`;
    const find = k => world.querySelector(`[data-k="${k}"]`);
    const ownTile = k => { const m = c.hand().filter(el => Number(el.dataset.k) === k); return m.find(el => el.classList.contains("drawn")) || m[m.length - 1]; };
    list.forEach((m, i) => {
      const delay = i * 170;
      let a = null, b = null, el = null, k = -1, up0 = false, up1 = false;
      if (m.t === "draw") {
        // from the wall's head stack (or its tail's, after a kong or a flower) to the player's strip or your hand
        const s = m.tail ? Math.floor(G.tail / 2) : Math.max(0, Math.floor((G.head - 1) / 2));
        a = centred(was.rects.get(stack(s)));
        if (m.seat === me) { const mine = c.hand().find(x => x.classList.contains("drawn")) || c.hand().pop(); el = mine; b = centred(mine?.getBoundingClientRect()); k = Number(mine?.dataset.k); up1 = true; }
        else { el = find(`s${m.seat}:h${G.seats[m.seat].hand.length - 1}`); b = centred(el?.getBoundingClientRect()); }
      } else if (m.t === "discard") {
        el = find(`d${m.seat}:${m.raw}`);
        b = centred(el?.getBoundingClientRect());
        k = m.k; up0 = m.seat === me; up1 = true;
        if (m.seat === me) { const t = was.mine.find(x => x.k === m.k && x.picked) || was.mine.find(x => x.k === m.k); a = centred(t?.r); }
        else a = centred(was.rects.get(`s${m.seat}:h${Math.max(0, G.seats[m.seat].hand.length - 3)}`));
      } else {
        // a call: the discard flies from the pool to the caller's new set
        k = m.k; up0 = up1 = true;
        a = centred(was.rects.get(`d${m.from}:${m.raw}`));
        const sets = G.seats[m.seat].melds.length - 1;
        if (m.seat === me) { el = c.melds().at(-1)?.firstElementChild ?? null; }
        else el = find(`s${m.seat}:m${sets}:${m.kind === "chow" ? 1 : 0}`);
        b = centred(el?.getBoundingClientRect());
      }
      if (a && b) flight(k, a, b, el, up0, up1, delay);
    });
  }
  /** A tile flown from one place to another, turning over on the way where it's face down at one end. */
  function flight(k, a, b, el, up0, up1, delay) {
    const fit = r => ({ w: r.w, h: r.w * SR, x: r.x, y: r.y });
    const A = fit(a), B = fit(b), g = document.createElement("div");
    g.className = "hk3-ghost";
    g.innerHTML = `<div class="hk3-gin">${up0 || up1 ? `<div class="hk3-gf">${slabSvg(k)}</div>` : ""}<div class="hk3-gb">${slabSvg(-1)}</div></div>`;
    const at = r => ({ left: `${r.x - r.w / 2}px`, top: `${r.y - r.h / 2}px`, width: `${r.w}px`, height: `${r.h}px` });
    Object.assign(g.style, at(A));
    fx.append(g);
    const key = el?.dataset?.k, onPlane = !!key && world.contains(el);
    if (onPlane) { flying.add(key); el.classList.add("coming"); } else if (el) el.style.visibility = "hidden";
    const t = { duration: FLY_MS, delay, easing: EASE, fill: "both" };
    const turn = x => `rotateY(${x ? 0 : 180}deg)`;
    g.firstElementChild.animate([{ transform: `${turn(up0)} scale(1)` }, { transform: `rotateY(${up0 === up1 ? (up0 ? 0 : 180) : 90}deg) scale(1.2)`, offset: 0.5 }, { transform: `${turn(up1)} scale(1)` }], t);
    g.animate([at(A), at(B)], t).onfinish = () => {
      g.remove();
      if (onPlane) { flying.delete(key); el.classList.remove("coming"); } else if (el) el.style.visibility = "";
      el?.firstElementChild?.animate([{ scale: 1.14 }, { scale: 1 }], { duration: 200, easing: "ease-out" });
    };
  }
  /** The menu or the rules open: nothing flies on, and what was in the air lands. */
  function pause(on) {
    box.classList.toggle("paused", on);
    if (on) for (const a of fx.getAnimations({ subtree: true })) a.finish();
  }

  // the page turned or resized: drawn again by hong.js; a view shown again after the table view has moves it didn't see (none are flown)
  return { draw, snapshot, fly, pause: on => { pause(on); gl?.pause(on); }, empty, resetView: () => gl?.resetView(), reset: () => { seen = null; snap = null; geoKey = ""; unread(); gl?.show(glOn()); } };
}
