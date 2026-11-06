// The games screen's Choose button (README, Random mode and Deck, "Scope"): the banner under its head is Deck, Random
// and this, one line of three, and this opens the one sheet where they are set: Random's games, Deck's games and
// topics, and the learning modes (docs/learning-modes.md). The rules and the choices are random.js's and deck-row.js's own; this is only the sheet round them.
import { IN_FRAME } from "./suite.js";
import { lan } from "./net.js";
import { choice, CLOSE } from "./menu.js";
import { randomPane, redrawRandom } from "./random.js";
import { deckPane, redrawDeck } from "./deck-row.js";
import { learningPane } from "./learning-mode.js";

let tab = "random";                      // the side the sheet last showed, for as long as the page lasts

/** The Choose button, in `cell` (the banner's third); `host` is the games screen it opens its sheet in. Not in a
 *  partner's watching frame or an offline party, where Random and Deck aren't either. */
export function bindChoose({ cell, host }) {
  if (!cell) return;
  cell.hidden = IN_FRAME || !!lan;
  if (cell.hidden) return;
  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "btn rd-choose";
  pick.textContent = "Choose";
  pick.setAttribute("aria-haspopup", "dialog");
  pick.setAttribute("aria-label", "Choose what Random and Deck cover, and the learning modes");
  pick.addEventListener("click", () => open(host));
  cell.replaceChildren(pick);
}

/** The sheet is made afresh each time it opens: the choices may have changed on another device since. */
function open(host) {
  host.querySelector(":scope > dialog.rd-sheet")?.remove();
  build(host).showModal();
}
function build(host) {
  const sheet = document.createElement("dialog");
  sheet.className = "apps-pop rd-sheet";
  sheet.setAttribute("aria-label", "What Random and Deck cover");
  sheet.innerHTML = `<div class="pick-head"><h2>Choose</h2><button class="icon-btn" type="button" aria-label="Close">${CLOSE}</button></div>
    <div class="rd-sheet-body"><div class="rd-pane rd-pane-random"></div><div class="rd-pane rd-pane-deck"></div><div class="rd-pane rd-pane-learning"></div></div>`;
  const body = sheet.querySelector(".rd-sheet-body"), panes = { random: body.children[0], deck: body.children[1], learning: body.children[2] };
  // Deck's topics are read from the knowledge base's index only when its side is looked at
  const show = which => {
    tab = which;
    for (const [name, pane] of Object.entries(panes)) pane.hidden = name !== which;
    if (which === "random" && !panes.random.firstChild) panes.random.replaceChildren(...randomPane());
    if (which === "deck" && !panes.deck.firstChild) deckPane(panes.deck);
    if (which === "learning" && !panes.learning.firstChild) learningPane(panes.learning);
  };
  body.prepend(choice("Choose for", [["random", "Random"], ["deck", "Deck"], ["learning", "Learning"]], tab, show));
  sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
  sheet.querySelector(".pick-head button").addEventListener("click", () => sheet.close());
  sheet.addEventListener("close", () => { redrawRandom(); redrawDeck(); });
  host.appendChild(sheet);
  show(tab);
  return sheet;
}
