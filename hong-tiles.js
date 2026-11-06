// Mahjong's tiles, drawn once as SVG symbols and used everywhere by reference (<use href="#hk-12">): characters as their
// numeral over 萬, dots and bamboo as the patterns on a real set (the one of bamboo a bird), the winds and dragons in
// their characters, the flowers and seasons with their number. Colours are CSS variables (hong.css), so a tile follows
// the theme; each suited tile and wind also carries a small corner index (1–9, E S W N) for players who don't read the
// characters, hidden by --hk-num: 0. Each tile is in two builds, from one drawing of its face: flat (hk-12: the face and
// a green edge under it) and a slab (hk3-12, for the 3D view: a thicker one, its ivory side and green back showing).
import { tileName, isWind, isDragon } from "./hong-engine.js";

const W = 30, H = 40, FACE = 36.5;                               // the face, then the tile's edge below it
const SLAB = 46, SIDE = 42;                                      // a slab: its height, and where its green back begins under the ivory side
const NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const ink = c => `style="fill:var(--hk-${c})"`;
const CJK = `font-family="'Songti TC','STSong','Noto Serif CJK TC','Noto Serif TC','Hiragino Mincho ProN','PMingLiU','MingLiU',serif"`;
const text = (s, x, y, size, colour, extra = "") => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" ${CJK} ${ink(colour)} ${extra}>${s}</text>`;
const index = s => `<text class="hk-num" x="1.9" y="7" font-size="6.3" font-weight="700" font-family="system-ui,sans-serif" style="fill:var(--hk-ink);stroke:var(--hk-face);stroke-width:1.8;paint-order:stroke;opacity:var(--hk-num,1)">${s}</text>`;

// ---------- dots ----------
const dot = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" ${ink(c)}/><circle cx="${x}" cy="${y}" r="${(r * 0.62).toFixed(2)}" style="fill:var(--hk-face)"/><circle cx="${x}" cy="${y}" r="${(r * 0.3).toFixed(2)}" ${ink(c)}/>`;
const DOTS = [
  null,
  [[15, 10, 5, "green"], [15, 26.5, 5, "blue"]],
  [[8.6, 9.2, 4.3, "blue"], [15, 18.2, 4.3, "red"], [21.4, 27.2, 4.3, "green"]],
  [[9.2, 10, 4.6, "blue"], [20.8, 10, 4.6, "green"], [9.2, 26.5, 4.6, "green"], [20.8, 26.5, 4.6, "blue"]],
  [[8.6, 8.8, 4.1, "blue"], [21.4, 8.8, 4.1, "green"], [15, 18.2, 4.1, "red"], [8.6, 27.6, 4.1, "green"], [21.4, 27.6, 4.1, "blue"]],
  [[9.4, 7.4, 3.7, "green"], [20.6, 7.4, 3.7, "green"], [9.4, 19.2, 3.7, "red"], [20.6, 19.2, 3.7, "red"], [9.4, 29.2, 3.7, "red"], [20.6, 29.2, 3.7, "red"]],
  [[9.6, 5.4, 3.2, "green"], [16, 8.8, 3.2, "green"], [22.4, 12.2, 3.2, "green"], [9.4, 21.6, 3.3, "red"], [20.6, 21.6, 3.3, "red"], [9.4, 30.4, 3.3, "red"], [20.6, 30.4, 3.3, "red"]],
  [6, 14, 22.4, 30.6].flatMap(y => [[9.4, y, 3.5, "blue"], [20.6, y, 3.5, "blue"]]),
  [7.8, 18.4, 29].flatMap((y, row) => [8, 15.4, 22.8].map(x => [x, y, 3.4, ["blue", "red", "green"][row]])),
];
const oneDot = `<circle cx="15" cy="18.2" r="11" style="fill:none;stroke:var(--hk-blue);stroke-width:1.6"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return `<circle cx="${(15 + Math.cos(a) * 8.6).toFixed(2)}" cy="${(18.2 + Math.sin(a) * 8.6).toFixed(2)}" r="1.25" ${ink("green")}/>`; }).join("")}<circle cx="15" cy="18.2" r="6.4" ${ink("red")}/><circle cx="15" cy="18.2" r="4" style="fill:var(--hk-face)"/><circle cx="15" cy="18.2" r="2.2" ${ink("blue")}/>`;

// ---------- bamboo ----------
const stick = (x, y, h, c, tilt = 0) => {
  const t = tilt ? ` transform="rotate(${tilt} ${x} ${y + h / 2})"` : "";
  return `<g${t}><rect x="${x - 1.55}" y="${y}" width="3.1" height="${h}" rx="1.4" ${ink(c)}/><path d="M${x - 1.55} ${y + h / 2}h3.1M${x - 1.55} ${y + 1.4}h3.1M${x - 1.55} ${y + h - 1.4}h3.1" style="stroke:var(--hk-face);stroke-width:.55"/></g>`;
};
const BAMBOO = [
  null,
  [[15, 3.5, 13, "green"], [15, 19.5, 13, "green"]],
  [[15, 3.5, 13, "green"], [9, 19.5, 13, "green"], [21, 19.5, 13, "green"]],
  [[9.5, 3.5, 13, "green"], [20.5, 3.5, 13, "green"], [9.5, 19.5, 13, "green"], [20.5, 19.5, 13, "green"]],
  [[7.5, 3.5, 13, "green"], [22.5, 3.5, 13, "green"], [15, 11.5, 13, "red"], [7.5, 19.5, 13, "green"], [22.5, 19.5, 13, "green"]],
  [3.5, 19.5].flatMap(y => [7.5, 15, 22.5].map(x => [x, y, 13, "green"])),
  [[15, 2, 9.5, "red"], ...[13, 24.5].flatMap(y => [7.5, 15, 22.5].map(x => [x, y, 9.5, "green"]))],
  [[5.5, 3.5, 13, "green", -14], [11.8, 3.5, 13, "green", 14], [18.2, 3.5, 13, "green", -14], [24.5, 3.5, 13, "green", 14],
    [5.5, 19.5, 13, "green", 14], [11.8, 19.5, 13, "green", -14], [18.2, 19.5, 13, "green", 14], [24.5, 19.5, 13, "green", -14]],
  [2.5, 13.6, 24.7].flatMap(y => [[7.5, y, 9.4, "green"], [15, y, 9.4, "red"], [22.5, y, 9.4, "green"]]),
];
// the one of bamboo: a bird on a stem
const bird = `<path d="M15 33.5V24" style="stroke:var(--hk-green);stroke-width:1.6"/><path d="M11 33.5h8" style="stroke:var(--hk-green);stroke-width:1.2"/>
<path d="M6.5 15.5c2.5 7 9 9.5 15 6.5-2.8-1-4.4-3-5-6-1.8 1.6-5.6 1.4-10-.5z" ${ink("green")}/>
<path d="M16.5 16c.4-4 3-6.6 6.2-6.6 1.8 0 3 1 3.6 2.2l2.6.7-2.5 1c-.2 3-2.2 5.2-5.3 5.7" ${ink("red")}/>
<circle cx="23.2" cy="12.4" r=".9" style="fill:var(--hk-face)"/><path d="M8 15.2c-1.8-2.5-1.6-5.4.2-7.6.6 2.6 2 4.6 4.3 6" ${ink("blue")}/>
<path d="M12 19.6c2.2.6 4.5.3 6-1" style="fill:none;stroke:var(--hk-face);stroke-width:.7"/>`;

// ---------- the faces ----------
function face(k) {
  if (k < 9) return `${text(NUM[k], 15, 16.5, 14.5, "ink")}${text("萬", 15, 33, 15, "red")}${index(k + 1)}`;
  if (k < 18) { const n = k - 9; return `${n === 0 ? oneDot : DOTS[n].map(d => dot(...d)).join("")}${index(n + 1)}`; }
  if (k < 27) { const n = k - 18; return `${n === 0 ? bird : BAMBOO[n].map(s => stick(...s)).join("")}${index(n + 1)}`; }
  if (isWind(k)) return `${text("東南西北"[k - 27], 15, 26.5, 21, "ink")}${index("ESWN"[k - 27])}`;
  if (isDragon(k)) {
    if (k === 31) return text("中", 15, 27, 23, "red");
    if (k === 32) return text("發", 15, 27, 22, "green");
    return `<rect x="6.5" y="6" width="17" height="24.5" rx="1.5" style="fill:none;stroke:var(--hk-blue);stroke-width:2.2"/><rect x="9.6" y="9.1" width="10.8" height="18.3" style="fill:none;stroke:var(--hk-blue);stroke-width:.8"/>`;
  }
  // flowers (梅蘭菊竹, red) and seasons (春夏秋冬, blue), each with its number
  const season = k >= 38, n = ((k - 34) % 4) + 1, c = season ? "blue" : "red";
  // a sprig with three blossoms under the character
  const sprig = `<path d="M7 31.2Q15 28.6 23 31.2" style="fill:none;stroke:var(--hk-green);stroke-width:.9"/>${[[9.6, 30.2], [15, 29.4], [20.4, 30.2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" ${ink(c)}/>`).join("")}`;
  return `${text("梅蘭菊竹春夏秋冬"[k - 34], 15, 22, 16, c)}${sprig}<text x="25.8" y="8.2" font-size="7" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif" ${ink(c)}>${n}</text>`;
}
const blank = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" style="fill:var(--hk-back);stroke:var(--hk-edge);stroke-width:.8"/><rect x=".5" y=".5" width="${W - 1}" height="${FACE}" rx="3.6" style="fill:var(--hk-face);stroke:var(--hk-edge);stroke-width:.8"/>`;
// a slab: the face, an ivory side under it (a shade darker), the green back showing at the foot; light along the face's top edge
const slabBase = `<rect x=".5" y=".5" width="${W - 1}" height="${SLAB - 1}" rx="4" style="fill:var(--hk-back);stroke:var(--hk-edge);stroke-width:.8"/>`
  + `<rect x=".5" y=".5" width="${W - 1}" height="${SIDE - 0.5}" rx="4" style="fill:color-mix(in srgb, var(--hk-face) 80%, var(--hk-edge));stroke:var(--hk-edge);stroke-width:.8"/>`
  + `<rect x=".5" y=".5" width="${W - 1}" height="${FACE}" rx="3.6" style="fill:var(--hk-face);stroke:var(--hk-edge);stroke-width:.8"/>`
  + `<path d="M4 1.7h${W - 8}" style="fill:none;stroke:#FFF;stroke-width:.9;stroke-linecap:round;opacity:.55"/>`;
// the back of a tile standing in a hand, seen from across the table: its green back, the ivory of its top edge above
const slabBack = `<rect x=".5" y=".5" width="${W - 1}" height="${SLAB - 1}" rx="4" style="fill:var(--hk-back);stroke:var(--hk-edge);stroke-width:.8"/>`
  + `<rect x=".5" y=".5" width="${W - 1}" height="9" rx="3.6" style="fill:color-mix(in srgb, var(--hk-face) 80%, var(--hk-edge));stroke:var(--hk-edge);stroke-width:.8"/>`
  + `<rect x="4" y="13" width="${W - 8}" height="${SLAB - 17}" rx="2.4" style="fill:none;stroke:var(--hk-back-line);stroke-width:.8"/>`;
const back = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" style="fill:var(--hk-back);stroke:var(--hk-edge);stroke-width:.8"/><rect x="3.5" y="3.5" width="${W - 7}" height="${H - 9}" rx="2.4" style="fill:none;stroke:var(--hk-back-line);stroke-width:.8"/>`;

/** The symbols, as one hidden SVG to put in the page once. */
export const TILE_DEFS = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>
<symbol id="hk-blank" viewBox="0 0 ${W} ${H}">${blank}</symbol>
<symbol id="hk-back" viewBox="0 0 ${W} ${H}">${back}</symbol>
<symbol id="hk3-blank" viewBox="0 0 ${W} ${SLAB}">${slabBase}</symbol>
<symbol id="hk3-back" viewBox="0 0 ${W} ${SLAB}">${slabBack}</symbol>
${Array.from({ length: 42 }, (_, k) => `<symbol id="hk-f${k}" viewBox="0 0 ${W} ${H}">${face(k)}</symbol>
<symbol id="hk-${k}" viewBox="0 0 ${W} ${H}"><use href="#hk-blank"/><use href="#hk-f${k}" width="${W}" height="${H}"/></symbol>
<symbol id="hk3-${k}" viewBox="0 0 ${W} ${SLAB}"><use href="#hk3-blank"/><use href="#hk-f${k}" width="${W}" height="${H}"/></symbol>`).join("\n")}
</defs></svg>`;
let installed = false;
/** Puts the symbols in the page (once). */
export function installTiles() {
  if (installed) return;
  installed = true;
  document.body.insertAdjacentHTML("afterbegin", TILE_DEFS);
}
/** A tile as markup: an SVG using its symbol (k = -1 for a tile's back); slab: the 3D view's thicker build. */
export const tileSvg = (k, cls = "", slab = false) => `<svg class="hk-t${slab ? " slab" : ""}${cls ? ` ${cls}` : ""}" viewBox="0 0 ${W} ${slab ? SLAB : H}" role="img" aria-label="${k < 0 ? "a hidden tile" : tileName(k)}"><use href="#hk${slab ? "3" : ""}-${k < 0 ? "back" : k}"/></svg>`;
/** A slab for the 3D table's own elements (they carry their own labels). */
export const slabSvg = k => `<svg class="hk3-s" viewBox="0 0 ${W} ${SLAB}" aria-hidden="true"><use href="#hk3-${k < 0 ? "back" : k}"/></svg>`;
export const TILE_W = W, TILE_H = H, SLAB_H = SLAB;
