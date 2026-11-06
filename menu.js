// Every game's menu, the same everywhere. A game still fills its menu (#menuBody) as it always has; this module
// shapes what it puts there each time it opens:
//  - the sheet: a title, an × at the top right, a tap outside closes it; it rises from the bottom on a phone and
//    stands as a card on a wide screen (style.css)
//  - the order: a game that marks its parts with data-part (or uses part() below) has them laid out as Play, Content,
//    Together, Settings, About, whatever order it added them in, each under the same small heading
//  - the clutter: a long explanation (more than a sentence or two) goes into one closed "How it works" at the
//    bottom, so the menu shows choices and buttons, and the reading is there for whoever opens it
//  - full screen (#app.full, CLAUDE.md "Full screen"): the page has no header, only the mark in the top right, and this
//    menu's first entry is "Back to menu" (the games screen), then the header's other buttons (Rules, Learn…) and the
//    partner's line, everything the header used to carry
// Loaded by every page through pwa.js.

import { MARK } from "./mark.js";
import { IN_FRAME, markOf } from "./suite.js";
import { sure } from "./sure.js";
import { todayState } from "./today-core.js";

export const PARTS = ["play", "content", "together", "settings", "about"];
const LABEL = { play: "", content: "Content", together: "Together", settings: "Settings", about: "About" };
const LONG = 120;                           // characters: longer than this, an explanation folds away

/** A part of the menu, made in `body` and laid out in its place: part(body, "settings").append(...). */
export function part(body, name) {
  let box = body.querySelector(`:scope > [data-part="${name}"]`);
  if (!box) { box = document.createElement("section"); box.dataset.part = name; box.className = "menu-part"; body.appendChild(box); }
  return box;
}

// ---------- the controls, the same in every game ----------
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
/**
 * One of: a label and its options; onChange(value) when another is tapped. options: [[value, text], …]. A few short
 * options sit in a segmented row beside the label; more, or longer ones, in a grid of buttons under it (a segmented
 * row that wraps onto a second line breaks its own borders).
 */
export function choice(label, options, value, onChange) {
  const compact = options.length <= 3 && options.reduce((n, [, t]) => n + String(t).length, 0) <= 20;
  const dense = options.every(([, t]) => String(t).length <= 3);
  const row = el("div", compact ? "menu-row" : "menu-grid-wrap"), set = el("div", compact ? "menu-seg" : dense ? "menu-grid dense" : "menu-grid");
  set.setAttribute("role", "radiogroup");
  set.setAttribute("aria-label", label);
  for (const [v, text] of options) {
    const b = el("button", null, text);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(v === value));
    b.addEventListener("click", () => {
      if (v === value) return;
      value = v;
      for (const x of set.children) x.setAttribute("aria-checked", String(x === b));
      onChange(v);
    });
    set.appendChild(b);
  }
  row.append(el("span", "menu-label", label), set);
  return row;
}
/**
 * Some of: a label and a grid of options to tick; onChange(values) with the ticked values, in the options' order. With
 * max, ticking one more lets go of the one ticked longest ago. With all (the include kind), All and None beside the
 * label tick every option or none.
 */
export function ticks(label, options, values, onChange, max = Infinity, { all = false } = {}) {
  const wrap = el("div", "menu-grid-wrap"), grid = el("div", options.every(([, t]) => String(t).length <= 3) ? "menu-grid dense" : "menu-grid");
  if (grid.classList.contains("dense")) grid.style.gridTemplateColumns = `repeat(${Math.min(options.length, 10)}, minmax(0, 1fr))`;   // 1–10 in one row
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", label);
  const order = [...values], buttons = new Map();               // order: ticked values, oldest first
  const show = () => { for (const [v, b] of buttons) b.setAttribute("aria-pressed", String(order.includes(v))); };
  const changed = () => { show(); onChange(options.map(([x]) => x).filter(x => order.includes(x))); };
  for (const [v, text] of options) {
    const b = el("button", null, text);
    b.type = "button";
    b.addEventListener("click", () => {
      const at = order.indexOf(v);
      if (at >= 0) order.splice(at, 1); else { order.push(v); if (order.length > max) order.shift(); }
      changed();
    });
    buttons.set(v, b);
    grid.appendChild(b);
  }
  show();
  const name = el("span", "menu-label", label);
  if (!all) { wrap.append(name, grid); return wrap; }
  const head = el("div", "menu-ticks-head"), both = el("span", "menu-allnone");
  for (const [text, keep] of [["All", true], ["None", false]]) {
    const b = el("button", "link", text);
    b.type = "button";
    b.setAttribute("aria-label", `${text}: ${label}`);
    b.addEventListener("click", () => { order.splice(0, order.length, ...(keep ? options.map(([x]) => x).slice(0, max) : [])); changed(); });
    both.append(b);
  }
  both.insertBefore(document.createTextNode(" · "), both.lastChild);
  head.append(name, both);
  wrap.append(head, grid);
  return wrap;
}
/** A switch: a label and on or off; onChange(on). */
export function toggle(label, on, onChange) {
  const row = el("div", "menu-row"), sw = el("button", "menu-switch");
  sw.type = "button";
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", String(!!on));
  sw.setAttribute("aria-label", label);
  sw.addEventListener("click", () => { on = !on; sw.setAttribute("aria-checked", String(on)); onChange(on); });
  row.append(el("span", "menu-label", label), sw);
  return row;
}
/** A button: the menu closes, then fn runs. kind: "primary" (the one to press), "" (plain) or "link" (quiet). */
export function action(text, fn, kind = "") {
  const b = el("button", kind === "link" ? "link menu-link" : `btn wide${kind === "primary" ? " primary" : ""}`, text);
  b.type = "button";
  b.addEventListener("click", () => { document.getElementById("menuDlg")?.close(); fn(); });
  return b;
}
/**
 * The header's dropdown, in the menu too: the same choice, from the same <select> (a game's quick switch stays in its
 * header), laid out like any choice; picking one closes the menu and changes the select, so
 * the game answers exactly as it does to the header.
 */
export function mirror(label, select) {
  const options = [...select.options].filter(o => !o.disabled).map(o => [o.value, o.label]);
  return choice(label, options, select.value, v => { document.getElementById("menuDlg")?.close(); select.value = v; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
/** A short status line (a best, where you are). */
export const line = text => el("p", "menu-line", text);

/**
 * Today's daily, as a button and not a mode (Korbi, 4 November 2026): put at the top of the Play part.
 *  - still to play: a primary "Play today's" (asks first when `busy`, a run you've started that it would leave);
 *  - being played: a line "Today's: playing", and `back` (a function, or { text, fn }) to the run you left, if the game kept one;
 *  - done: no button, one line "Today's: done" and the game's own `result` ("9 of 12", a time, a score).
 * `done` is the game's own record; give `app` instead and it is read as the games screen's tile reads it (`markOf`), with a time
 * or a score for the result. `play` starts today's (the menu has closed by then). Returns the elements it put there.
 */
export function todayPart(body, { app, done, result, play, playing = false, busy = false, back = null } = {}) {
  const st = todayState({ done, result, playing, back, mark: app ? markOf(app) : null });
  const items = [];
  if (st.kind === "done") items.push(line(st.line));
  else if (st.kind === "playing") {
    items.push(line(st.line));
    if (st.back) items.push(action(st.back.text, st.back.fn, "link"));
  } else {
    items.push(action(st.button, async () => {
      if (busy && !(await sure("Today's is waiting. Leave the one you've started?", { yes: "Today's", no: "Keep mine" }))) return;
      play();
    }, "primary"));
  }
  part(body, "play").prepend(...items);
  return items;
}

export const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
// Office's menu button: three rules
const OFFICE_MENU = '<svg class="k-menu" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h10"/></svg>';
// the menu button: the Codex mark standing still (mark.js; style.css turns its movement while the menu is open)
/** Draws `btn` as the games' menu button (the mark; three rules in Office), turning while `dlg` is open. A page with a second menu button (Almanac's, over the star chart) calls this for it too. */
export function markButton(btn, dlg) {
  const look = document.documentElement.dataset.theme;
  if (!btn || !dlg) return;
  btn.classList.add("cx-btn");
  btn.setAttribute("aria-label", "Menu");
  btn.innerHTML = look === "office" ? OFFICE_MENU : MARK;   // Office: three rules, rounded in themes.css
  new MutationObserver(() => btn.classList.toggle("turning", dlg.open)).observe(dlg, { attributes: true, attributeFilter: ["open"] });
}
// a game played by a party (?party=CODE in its address): the party's part heads its menu (party-link.js, loaded only
// then: it connects to the party to follow the host). Not a party of two sharing a board (&coop=1, docs/coop.md): its
// game has no host choosing games, and carries the way out in its own menu.
let partyPart = null;
const IN_PARTY = /[?&]party=[A-Za-z]{4}\b/.test(location.search) && !/[?&]coop=1\b/.test(location.search);
// Modules that lead back to apps.js (which imports this one) are fetched only once the page has loaded: imported while
// apps.js is still being evaluated, Safari runs the page's own module before apps.js finishes, and every game that reads
// APPS at start-up stopped with "Cannot access 'APPS' before initialization" (5 November 2026, Korbi's iPhone; Chrome is fine).
const afterLoad = fn => (document.readyState === "complete" ? setTimeout(fn) : addEventListener("load", () => setTimeout(fn), { once: true }));
if (IN_PARTY) afterLoad(() => import("./party-link.js").then(m => { partyPart = m.menuPart; }).catch(e => console.error(e)));
// parts that head every game's menu while something of the suite's is under way (random mode's Next and Stop:
// random.js), by name, each made afresh when the game fills its menu
const heads = new Map();
/** Puts the part make() returns at the head of the page's menu (a menu filled once, not at every opening, too), until
 *  dropMenuHead(name). */
export function menuHead(name, make) {
  heads.set(name, make);
  const body = document.getElementById("menuBody");
  if (body?.children.length) shape(body);
}
/** Takes a part menuHead put there out of the menu, at once and from then on. */
export function dropMenuHead(name) {
  heads.delete(name);
  document.querySelector(`#menuBody > [data-head="${name}"]`)?.remove();
}

/**
 * A full-screen page's way round: Back to menu first (the games screen, which the hidden title button opens; not in a
 * party's game, whose own part has the way out, nor in a frame that only watches), then the buttons the header carried
 * (Rules, Learn, Help…) unless the game's menu has one of that name, then your partner's line (the hidden pill's
 * words). Made afresh at every opening, so a button hidden or disabled since leaves out.
 */
function fullHead(body) {
  const app = document.querySelector("#app.full");
  if (!app) return null;
  const box = el("div", "menu-full"), games = document.getElementById("appsBtn");
  box.dataset.full = "1";
  // "Rules" and "The rules on one page" are one button, and so are "Learn" and "Learn Big Two, from the rules"
  const same = t => { t = t.trim().toLowerCase(); return /^learn\b/.test(t) ? "learn" : /^(the )?rules\b/.test(t) ? "rules" : t; };
  const have = new Set([...body.querySelectorAll("button")].map(b => same(b.textContent)));
  // (a standalone game has no games screen to go back to: no Back to menu)
  const row = el("div", "menu-full-row");
  for (const b of app.querySelectorAll(":scope > .top .top-right > button:not(#menuBtn, .dd)")) {   // .dd: a header dropdown, which the menu has as its own choice
    const text = (b.textContent || b.getAttribute("aria-label") || "").trim();
    if (!text || b.hidden || b.disabled || have.has(same(text))) continue;
    row.append(action(text, () => b.click()));
  }
  if (row.children.length) box.append(row);
  return box.children.length ? box : null;
}

/** A standalone game's way to get the newest copy: the version running, and a button that empties the offline copy and fetches afresh. */
async function updatePart(body) {
  if (body.querySelector(":scope > [data-refresh]")) return;
  const box = el("div", "menu-refresh"), keys = await (window.caches ? caches.keys().catch(() => []) : []);
  box.dataset.refresh = "1"; box.dataset.part = "about";
  const v = keys.find(k => k.startsWith("crates-"))?.slice(7);
  box.append(line(`Version ${v || "not stored on this device"}`), action("Refresh game", async () => {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* none */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* none */ }
    location.replace(`${location.pathname}?fresh=${Date.now()}`);
  }, "link"));
  if (!body.querySelector(":scope > [data-refresh]")) body.append(box);
}

let shaping = false;
/** Lays out what the game just put in the menu: parts in order, under their headings; long explanations folded away. */
function shape(body) {
  if (shaping) return;
  shaping = true;
  try {
    for (const [name, make] of [...heads].reverse()) {
      if (body.querySelector(`:scope > [data-head="${name}"]`)) continue;
      const part = make();
      if (part) { part.dataset.head = name; body.prepend(part); }
    }
    if (partyPart && !body.querySelector(":scope > [data-party]")) body.prepend(partyPart());
    if (body.id === "menuBody") updatePart(body);   // (its append sets shape off once more, which finds it there)
    if (!body.querySelector(":scope > [data-full]")) { const head = fullHead(body); if (head) body.prepend(head); }   // first of all
    // parts in the standard order, each with its heading (Play needs none: it's the top), after anything unmarked
    for (const box of body.querySelectorAll(":scope > [data-part]")) {
      const name = box.dataset.part;
      if (LABEL[name] && !box.querySelector(":scope > .menu-h")) { const h = document.createElement("h4"); h.className = "menu-h"; h.textContent = LABEL[name]; box.prepend(h); }
      box.hidden = ![...box.children].some(c => !c.classList.contains("menu-h"));   // a part with nothing in it stays out of sight
    }
    // long explanations, wherever they are, into one closed "How it works" at the very bottom
    let about = body.querySelector(":scope > details.menu-how");
    const long = [...body.querySelectorAll("p.stats, p.set-note, p.note")].filter(p => !p.closest("details.menu-how") && !p.dataset.keep && p.textContent.trim().length > LONG);
    if (long.length) {
      if (!about) { about = document.createElement("details"); about.className = "menu-how"; about.innerHTML = "<summary>How it works</summary>"; }
      for (const p of long) about.appendChild(p);
    }
    // the order: unmarked things as the game added them, then the parts in standard order, then How it works; nodes
    // are only moved when the order is wrong, so laying it out doesn't set itself off again
    const kids = [...body.children];
    const want = [...kids.filter(k => !k.dataset.part && k !== about), ...PARTS.map(p => kids.find(k => k.dataset.part === p)).filter(Boolean), ...(about ? [about] : [])];
    if (want.some((k, i) => kids[i] !== k)) for (const k of want) body.appendChild(k);
    // headings left with nothing under them (their only line folded away) go too
    for (const h of body.querySelectorAll(":scope > h3, :scope > h4:not(.menu-h)")) { const next = h.nextElementSibling; if (!next || /^H[34]$/.test(next.tagName) || next === about) h.remove(); }
  } finally { shaping = false; }
}

// ---------- the pause: a game stands still while its menu, its rules, or the games screen is open ----------
// Games listen with onPause(pause, resume): pause() when it should stop, resume(ms) when it may go on, ms being how
// long it stood (to move a deadline or a start on by). A duo match's shared clock doesn't stop; the games see to that.
// (a game's own sheet that should stop it too, River's course say, carries the class pauses)
export const PAUSERS = "#menuDlg[open], #helpDlg[open], #rulesDlg[open], dialog.apps[open], dialog.apps-pop[open], dialog.sure[open], dialog.pauses[open]";
let pausedAt = null;
export const isPaused = () => pausedAt !== null;
export function onPause(pause, resume) {
  addEventListener("suite:pause", () => pause());
  addEventListener("suite:resume", e => resume(e.detail.ms));
}
function settlePause() {
  const on = !!document.querySelector(PAUSERS);
  if (on === isPaused()) return;
  if (on) { pausedAt = performance.now(); dispatchEvent(new CustomEvent("suite:pause")); }
  else { const ms = performance.now() - pausedAt; pausedAt = null; dispatchEvent(new CustomEvent("suite:resume", { detail: { ms } })); }
}
new MutationObserver(settlePause).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });

/** Gives the page's menu its shape: the × at the top right, a tap outside closes, and the contents laid out on each open. */
function upgrade() {
  const dlg = document.getElementById("menuDlg");
  if (!dlg || dlg.dataset.shaped) return;
  dlg.dataset.shaped = "1";
  dlg.classList.add("menu-sheet");
  const close = document.getElementById("menuClose") || dlg.querySelector(".pick-head .btn");
  if (close) {                                                   // the game's own Close button, as an ×: its listener stays
    close.className = "icon-btn menu-x";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = CLOSE;
  }
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // the backdrop: outside the sheet
  markButton(document.getElementById("menuBtn"), dlg);
  const body = document.getElementById("menuBody") || dlg;
  new MutationObserver(() => queueMicrotask(() => shape(body))).observe(body, { childList: true });
  if (IN_FRAME) document.documentElement.classList.add("watching-frame");   // a frame that only shows a partner's game: no button
  if (document.querySelector("#app.full")) {
    if (body.children.length) shape(body);
    // each opening makes the head afresh, after the game has filled the menu (its own click listener runs first)
    new MutationObserver(() => { if (!dlg.open) return; body.querySelector(":scope > [data-full]")?.remove(); queueMicrotask(() => shape(body)); })
      .observe(dlg, { attributes: true, attributeFilter: ["open"] });
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", upgrade); else upgrade();

// ---------- the title's logo (Korbi, 4 November 2026: "add the logo to the top left above where the title of the game is ...
// clicking the logo takes you to the menu") ----------
// A `full titled` page shows its game's own logo (the one its tile has on the games screen, in the theme's version) above
// its name; a tap is Back to menu (clicks the hidden #appsBtn), so where the menu has no such entry (a party's game, a frame
// that only watches) there is no logo either. Pages without a title get none. style.css, "Full screen", the title's logo.
function titleLogo() {
  const app = document.querySelector("#app.full"), top = app?.querySelector(":scope > .top"), games = document.getElementById("appsBtn");
  return;   // a standalone game has no games screen for the logo to open
  // eslint-disable-next-line no-unreachable
  if (!app || !top || !games || IN_PARTY || IN_FRAME) return;
  let btn = null, apps = null;
  const drop = () => { btn?.remove(); btn = null; top.classList.remove("has-logo"); };
  const sync = () => {
    if (!app.classList.contains("titled")) return drop();
    const svg = app.querySelector(".pa-mark")?.innerHTML.trim()   // Party's own mark follows the game on its table
      || apps?.find(a => a.href.split("/").pop() === (location.pathname.split("/").pop() || "index.html"))?.logo;
    if (!svg) return drop();
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "home-logo"; btn.setAttribute("aria-label", "Back to the games");
      btn.addEventListener("click", () => games.click());
      top.prepend(btn);
    }
    if (btn.innerHTML !== svg) btn.innerHTML = svg;
    top.classList.add("has-logo");
  };
  afterLoad(() => import("./apps.js").then(m => { apps = m.APPS; sync(); }).catch(e => console.error(e)));
  new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ["class"] });
  const pa = app.querySelector(".pa-mark");
  if (pa) new MutationObserver(sync).observe(pa, { childList: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", titleLogo); else titleLogo();
