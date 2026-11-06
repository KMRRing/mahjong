// The logos of Jass, Belote and Schafkopf on the games screen, in the three houses' drawings (apps.js takes them in).
// Each is two cards fanned, one carrying its country's suit marks: the Swiss rose and the shield with the white cross
// (Jass), the spade and the heart under a crown, the king and queen of trumps (Belote), the acorn and the leaf of the
// Bavarian pack (Schafkopf), the club and the diamond (Coinche, Belote's auction). No gradient ids and no clip paths: a logo is drawn in several places at once.
const INK = "#1C2A34";
const SHADOW = `<ellipse cx="50" cy="93" rx="36" ry="3" fill="${INK}" opacity=".22"/>`;
const card = (rot, x, body) => `<g transform="rotate(${rot} 50 80)"><rect x="${x}" y="20" width="38" height="56" rx="5" fill="#FBF4E4" stroke="${INK}" style="stroke-width: calc(2.8 * var(--wire, 1))"/>${body}</g>`;
const codex = (a, b) => `<svg viewBox="0 0 100 100" aria-hidden="true">${SHADOW}${a}${b}</svg>`;

/** Five petals round a gilt heart: the Swiss rose, the Rosen suit; centred on (cx, cy). */
const rose = (cx, cy) => [0, 1, 2, 3, 4].map(i => {
  const a = (i * 72 - 90) * Math.PI / 180;
  return `<circle cx="${+(cx + 7.2 * Math.cos(a)).toFixed(1)}" cy="${+(cy + 7.2 * Math.sin(a)).toFixed(1)}" r="5" fill="#C2312A" stroke="#6E1610" stroke-width="1.2"/>`;
}).join("") + `<circle cx="${cx}" cy="${cy}" r="4" fill="#E8B84A" stroke="#6E4A12" stroke-width="1.1"/>`;
const SHIELD = `<path d="M38 30H62V48C62 57 56 62 50 65C44 62 38 57 38 48Z" fill="#C2312A" stroke="#6E1610" stroke-width="1.6"/><path d="M50 36V58M42 46H58" stroke="#FBF4E4" stroke-width="5"/>`;
const SPADE = `<path d="M50 28C61 38 66 45 59 51C56 53 52 52 51 50C51 54 52 57 54 60H46C48 57 49 54 49 50C48 52 44 53 41 51C34 45 39 38 50 28Z" fill="${INK}"/>`;
const HEART = `<path d="M50 66C34 55 36 40 44.5 40C48 40 50 43 50 46C50 43 52 40 55.5 40C64 40 66 55 50 66Z" fill="#C2312A" stroke="#6E1610" stroke-width="1.5"/><path d="M40 36L42 27L46 32L50 25L54 32L58 27L60 36Z" fill="#E8B84A" stroke="#6E4A12" stroke-width="1.3" stroke-linejoin="round"/>`;
const ACORN = `<path d="M39 42H61C61 53 56 61 50 64C44 61 39 53 39 42Z" fill="#D9A441" stroke="#5A3A12" stroke-width="1.5"/><path d="M37 43C37 35 43 31 50 31S63 35 63 43Z" fill="#7A5226" stroke="#3A2410" stroke-width="1.5"/><path d="M50 31V26" stroke="#3A2410" stroke-width="2" stroke-linecap="round"/>`;
const LEAF = `<path d="M50 28C38 38 36 52 50 66C64 52 62 38 50 28Z" fill="#3E8E3A" stroke="#1E4A1C" stroke-width="1.5" stroke-linejoin="round"/><path d="M50 36V64M50 46L44 41M50 52L57 46" stroke="#1E4A1C" stroke-width="1.3" stroke-linecap="round" fill="none"/>`;

const CLUB = `<g fill="${INK}"><circle cx="50" cy="38" r="6"/><circle cx="43" cy="49" r="6"/><circle cx="57" cy="49" r="6"/><path d="M48 50H52L54 63H46Z"/></g>`;
const DIAMOND = `<path d="M50 28L62 47L50 66L38 47Z" fill="#C2312A" stroke="#6E1610" stroke-width="1.5" stroke-linejoin="round"/>`;
export const JASS_CODEX = codex(card(-16, 30, rose(49, 48)), card(12, 32, SHIELD));
export const BELOTE_CODEX = codex(card(-16, 30, SPADE), card(12, 32, HEART));
export const SCHAFKOPF_CODEX = codex(card(-16, 30, ACORN), card(12, 32, LEAF));
export const COINCHE_CODEX = codex(card(-16, 30, CLUB), card(12, 32, DIAMOND));

// Office's: a line drawing on a 24 square, `.a` the accent line
const office = (a, b) => `<svg class="k-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="9" height="14" rx="1.5" transform="rotate(-12 7.5 12)"/><rect x="11" y="4" width="9.5" height="14.5" rx="1.5" transform="rotate(10 15.7 11.2)"/>${a}${b}</svg>`;
const k = {
  rose: `<circle cx="7.4" cy="12.2" r="1.2"/><path class="a" d="M7.4 9.1a1.6 1.6 0 1 1 1.5 2M9.9 11.3a1.6 1.6 0 1 1-.6 2.4M8.3 15.6a1.6 1.6 0 1 1-2.8-.2M5 13.8a1.6 1.6 0 1 1 .4-2.6"/>`,
  shield: `<path d="M13 8.2H18.4V12.4C18.4 14.6 17 15.8 15.7 16.4 14.4 15.8 13 14.6 13 12.4Z"/><path class="a" d="M15.7 9.2V15M14 11.8H17.4"/>`,
  spade: `<path d="M7.4 8.2C10 10.4 10.6 12 9.2 13.2 8.6 13.7 7.9 13.4 7.7 12.9 7.7 13.9 8 14.6 8.4 15.2H6.4C6.8 14.6 7.1 13.9 7.1 12.9 6.9 13.4 6.2 13.7 5.6 13.2 4.2 12 4.8 10.4 7.4 8.2Z"/>`,
  heart: `<path class="a" d="M15.8 16.4C12.2 14 12.6 10.8 14.4 10.8C15.2 10.8 15.8 11.4 15.8 12 15.8 11.4 16.4 10.8 17.2 10.8 19 10.8 19.4 14 15.8 16.4Z"/><path d="M14 9.6L14.3 7.6L15.1 8.6L15.8 7.4L16.5 8.6L17.3 7.6L17.6 9.6Z"/>`,
  acorn: `<path d="M5.4 11.2H9.4C9.4 13.9 8.4 15.4 7.4 15.9 6.4 15.4 5.4 13.9 5.4 11.2Z"/><path class="a" d="M5.1 11.2C5.1 9.4 6.2 8.5 7.4 8.5S9.7 9.4 9.7 11.2Z"/>`,
  club: `<circle cx="7.4" cy="9.4" r="1.3"/><circle cx="6" cy="11.8" r="1.3"/><circle cx="8.8" cy="11.8" r="1.3"/><path d="M7 12H7.8L8.1 15H6.7Z"/>`,
  diamond: `<path class="a" d="M15.8 7.6L18 11.8L15.8 16L13.6 11.8Z"/>`,
  leaf: `<path class="a" d="M15.8 7.6C13 9.8 12.8 13 15.8 16.4 18.8 13 18.6 9.8 15.8 7.6Z"/><path d="M15.8 9.4V15.2"/>`,
};
export const TRUMPS_OFFICE = { jass: office(k.rose, k.shield), belote: office(k.spade, k.heart), schafkopf: office(k.acorn, k.leaf), coinche: office(k.club, k.diamond) };
