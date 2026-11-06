// Deck on the games screen (README, Deck, "Scope"): its plate in the banner beside Random's. Deck starts a review of
// what's due, across the games, in one tap (deck.html#review); the banner's Choose button (banner.js) opens the sheet
// where games and topics are left in or out, which Deck's own page opens too. The rules are deck-scope.js's; the choice is kept on this device
// (suite:deck, the games and topics taken out; suite: keys don't sync). Deck's own page asks the same scope for its
// review, so what the line counts is what the review deals.
//
// A topic is a subject of the knowledge base, whose index (kb-index.js, 118 KB) every page would otherwise carry just
// for this line: it's fetched only when a topic is out, or when the sheet lists them.
import { IN_FRAME } from "./suite.js";
import { lan } from "./net.js";
import { ticks, line, CLOSE } from "./menu.js";
import { waitMark } from "./loading.js";
import * as pile from "./pile.js";
import { GAMES } from "./pile.js";
import { scopeOf, keptScope, inScope, topicsOf, afterTicks, sayScope } from "./deck-scope.js";

const KEY = "suite:deck";
// a deck of cards, as Random's shuffle is drawn: a line icon in every theme
const CARDS = '<svg class="k-ico rd-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3.5" width="12" height="15" rx="2"/><path d="M4 7.5V19a2 2 0 0 0 2 2h9.5"/></svg>';

let index = null;                          // kb-index.js, once it's here: { SUBJECTS, SUBJECT }
const rows = new Set();                    // the games screen's Deck cells on this page, drawn again as things change

// ---------- what's kept ----------
export function scopeNow() { try { return scopeOf(JSON.parse(localStorage.getItem(KEY))); } catch { return scopeOf(null); } }
function keepScope(scope) {
  try {
    const kept = keptScope(scope);
    if (kept) localStorage.setItem(KEY, JSON.stringify(kept)); else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}
/** A subject's label for an entity of the knowledge base, from its index. */
export const labelOf = ({ SUBJECTS, SUBJECT }) => id => SUBJECTS[SUBJECT[id]]?.label;
/** The index, fetched once (null if it can't be: topics are then left out of the sums, and the games still count). */
function loadIndex() {
  if (index) return Promise.resolve(index);
  return import("./kb-index.js").then(m => (index = m), () => null);
}

/** What Deck covers now: its due cards in the order a review deals them, how many cards are in the piles, and how many
 *  of them the scope covers. `subjects` is the index when one is needed (a topic is out), else null. */
export function covered(scope, subjects) {
  const of = subjects ? labelOf(subjects) : null;
  const live = pile.all().filter(it => !it.learned);
  return { due: inScope(pile.due(), scope, of), cards: inScope(live, scope, of).length, total: live.length };
}

// ---------- the games screen's line ----------
const button = (cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.addEventListener("click", fn); return b; };
/** Starts a review: Deck's own page begins one where it stands, any other page goes there. */
function review(host) {
  if (location.pathname.endsWith("/deck.html")) {
    host.closest?.("dialog")?.close();
    location.hash = "#review";
  } else location.href = new URL("./deck.html#review", location.href).href;
}
/** Draws Deck's plate again in the banner: the cards due now, in the scope. */
export function redrawDeck() {
  const scope = scopeNow(), waiting = scope.subjects.length > 0 && !index;
  if (waiting) loadIndex().then(redrawDeck);
  const c = waiting ? null : covered(scope, scope.subjects.length ? index : null);
  for (const { row, host } of rows) {
    const go = button("btn primary rd-play rd-deck", () => review(host));
    if (waiting) go.append(waitMark(), "Deck");
    else {
      go.insertAdjacentHTML("beforeend", `${CARDS}<span class="rd-words"><b>Deck</b><small></small></span>`);
      go.querySelector("small").textContent = `${c.due.length} due`;
    }
    go.disabled = waiting || !c.due.length;
    row.replaceChildren(go);
  }
}
/** The games screen's Deck cell (apps.js's bindSwitcher), `row`; `host` is the dialog it's in. Not in a partner's
 *  watching frame or an offline party, as Random's isn't. */
export function bindDeckRow({ row, host }) {
  if (!row) return;
  row.hidden = IN_FRAME || !!lan;
  if (row.hidden) return;
  rows.add({ row, host: host || document.body });
  redrawDeck();
}
// the pile or the scope changed on another device while the screen is open
addEventListener("storage", e => { if (rows.size && (e.key === null || e.key === KEY || e.key === "pile:items")) redrawDeck(); });

// ---------- the sheet: which games and topics ----------
/**
 * The games and topics Deck covers, each ticked or not (all at first), with All and None, drawn into `body`: the pane of
 * the banner's Choose sheet and of Deck's own. `subjects` is the knowledge base's index when the caller has it (Deck's
 * page does), `onChange(scope)` after every tap. The topics are those the piles have something about, so the list is
 * the ones that matter; they come when the index has (it's fetched only now), if `body` is still on show.
 */
export function deckPane(body, { subjects = null, onChange = null } = {}) {
  if (subjects) index = subjects;
  const say = line("");
  let scope = scopeNow();
  const tell = () => { say.textContent = sayScope(scope); };
  const change = (kind, all) => ticked => { scope = afterTicks(scope, kind, all, ticked); keepScope(scope); tell(); onChange?.(scope); };
  const gameIds = Object.keys(GAMES);
  const games = ticks("Games", gameIds.map(id => [id, GAMES[id]]), gameIds.filter(id => !scope.games.includes(id)), change("games", gameIds), Infinity, { all: true });
  tell();
  const wait = line("");
  wait.prepend(waitMark());
  wait.append("Reading the topics");
  body.replaceChildren(say, games, ...(index ? [] : [wait]));
  const topics = () => {
    const labels = index.SUBJECTS.map(s => s.label), of = labelOf(index);
    const list = topicsOf(pile.all(), labels, scope, of);
    wait.remove();
    if (!list.length) { body.append(line("Topics appear here once the piles hold cards about them.")); return; }
    body.append(ticks("Topics", list.map(l => [l, l]), list.filter(l => !scope.subjects.includes(l)), change("subjects", list), Infinity, { all: true }));
  };
  if (index) topics(); else loadIndex().then(i => { if (i && body.closest("dialog")?.open) topics(); else wait.remove(); });
}
/** Deck's own sheet of the same (Deck's page: its menu and its overview), in `host`. */
export function openScope(host, options = {}) {
  let sheet = host.querySelector(":scope > dialog.rd-scope");
  if (!sheet) {
    sheet = document.createElement("dialog");
    sheet.className = "apps-pop rd-scope";
    sheet.setAttribute("aria-label", "What Deck covers");
    sheet.innerHTML = `<div class="pick-head"><h2>Deck</h2><button class="icon-btn" type="button" aria-label="Close">${CLOSE}</button></div><div class="rd-sheet-body"></div>`;
    sheet.querySelector(".pick-head button").addEventListener("click", () => sheet.close());
    sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
    sheet.addEventListener("close", redrawDeck);
    host.appendChild(sheet);
  }
  deckPane(sheet.querySelector(".rd-sheet-body"), options);
  sheet.showModal();
  return sheet;
}
