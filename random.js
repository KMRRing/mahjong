// Random mode (README, Random mode): a game from the ones you choose, and when its round is over, straight on to the
// next. The games screen starts it (Random, under its head) and keeps the choice of games on this device (suite:random:
// { out }, the ones taken out; suite: keys don't sync). The run lives in the session (sessionStorage suite:random-run:
// the game it sent you to), so closing the app ends it, and so does opening any other page yourself. Every game says
// the moment its round is over (roundOver, below); a banner then names the next game and goes to it three seconds
// later, unless you Stay. While it's on, the game's title wears RANDOM and its menu opens on Next game and Stop, as the
// games screen does. Solo only: never in a partner's watching frame, a duo match, a table, a party or an offline party.
// The rules (which games, what a round of each is, the pick) are random-core.js's.
import { IN_FRAME, dailyDue, notePlayed } from "./suite.js";
import { lan } from "./net.js";
import { ticks, line, menuHead, dropMenuHead, PAUSERS } from "./menu.js";
import { ELIGIBLE, chosenFrom, keptFrom, canStart, pickNext, soloAddress, runOf, endsRound } from "./random-core.js";

const CHOICE = "suite:random", RUN = "suite:random-run";
const LEAD = 600, COUNT = 3000;          // ms: the round's result shows a moment before the banner, which counts three seconds
const ALIAS = { slate: "glyph" };        // Slate's page and keys say slate, the games screen glyph
// two arrows crossing, as a shuffle is drawn: a line icon in every theme (Office's title hides any other drawing)
const SHUFFLE = '<svg class="k-ico rd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h3.2c2.6 0 4.1 1.5 5.8 5.5s3.2 5.5 5.8 5.5H21M3 17.5h3.2c1.4 0 2.4-.5 3.3-1.4M14.7 7.9c.9-.9 1.9-1.4 3.1-1.4H21M18.5 4l2.5 2.5-2.5 2.5M18.5 15l2.5 2.5-2.5 2.5"/></svg>';

let games = [], sections = [];           // the games screen's games and its sections (apps.js hands them over)
let here = null;                         // the game this page is, while random mode plays it: { id, button, tag, fitting }
let acted = false, fired = false;        // a tap or a key on this page since it opened; this page's round announced
let banner = null;                       // the banner naming the next game, while it counts
const rows = new Set();                  // the games screen's Random cells on this page, drawn again as things change

// ---------- what's kept ----------
const appOf = id => games.find(a => a.id === id) || null;
function chosenNow() { try { return chosenFrom(JSON.parse(localStorage.getItem(CHOICE))); } catch { return chosenFrom(null); } }
function keepChoice(chosen) { try { localStorage.setItem(CHOICE, JSON.stringify(keptFrom(chosen))); } catch { /* private mode */ } }
function runNow() { try { return runOf(sessionStorage.getItem(RUN)); } catch { return null; } }
function keepRun(id) { try { sessionStorage.setItem(RUN, JSON.stringify({ game: id, at: Date.now() })); } catch { /* private mode */ } }
function endRun() { try { sessionStorage.removeItem(RUN); } catch { /* private mode */ } }
/** Random mode can run on this page: solo, here and now (a page can sit down at a table without reloading). */
const soloNow = () => !IN_FRAME && !lan && soloAddress(location.search);

// ---------- going on ----------
/** To a game, as its tile opens it (today's, while it's still to play), random mode going with it. */
function go(id) {
  const app = appOf(id);
  if (!app) return;
  keepRun(id);
  const to = new URL(dailyDue(id) ? `${app.href}#today` : app.href, location.href);
  // this same page again (the only game chosen): an address that differs only after # wouldn't open it afresh
  if (to.pathname === location.pathname && to.search === location.search) {
    history.replaceState(history.state, "", to.href);
    location.reload();
  } else location.href = to.href;
}
/** Another game from the choice, never this one unless it's the only one chosen. */
const next = () => { const id = pickNext(chosenNow(), here?.id ?? null); if (id) go(id); };
/** Random mode ends: this game stays as it is. */
function stop() {
  endRun();
  banner?.remove();
  banner = null;
  here?.fitting?.disconnect();
  here?.tag?.remove();
  here = null;
  dropMenuHead("random");
  redrawRandom();
}

/**
 * The games screen's part in random mode, from apps.js's bindSwitcher: `games` and `sections` (apps.js), its Random
 * cell (`row`, in the banner under the screen's head), the page's title button (`title`) and the game it is (`current`,
 * null at home).
 * A run that sent you here plays on; any other page you open yourself (home too) ends it.
 */
export function bindRandom({ games: list, sections: groups, row, title, current }) {
  games = list; sections = groups;
  if (row) { row.hidden = IN_FRAME || !!lan; rows.add({ row, current }); }
  if (!IN_FRAME) {
    const run = runNow();
    if (run && run.game === current && soloNow() && title) arm(current, title);
    else if (run) endRun();
  }
  redrawRandom();
}

/** Random mode plays this game: RANDOM in its title, Next game and Stop at the head of its menu. */
function arm(id, button) {
  here = { id, button, tag: null, fitting: null };
  for (const kind of ["pointerdown", "keydown", "click"]) addEventListener(kind, () => { acted = true; }, { capture: true, passive: true });
  drawTag();
  menuHead("random", menuPart);
  // back to this page from the browser's memory of it (bfcache): random mode may have gone elsewhere since
  addEventListener("pageshow", e => { if (e.persisted && here && runNow()?.game !== here.id) stop(); });
}

// ---------- a round over ----------
/**
 * Every game in random mode calls this the moment its round's result is final (a puzzle solved or failed, a hand or a
 * deal settled, a run's last answer, a game over), with its id on the games screen. In random mode the next game is
 * named in a banner over this one and opened three seconds later, unless you Stay; otherwise it does nothing. Never
 * at a table, in a match or a partner's view, and not for a round only drawn again as it was left (nothing tapped on
 * this page yet). Returns whether the next game is on its way.
 */
export function roundOver(app) {
  try {
    if (!IN_FRAME) notePlayed(app === "glyph" ? "slate" : app);      // a round counted is a day played (ledger:played), Random or not
    if (!here || fired || (ALIAS[app] || app) !== here.id) return false;
    if (!soloNow()) { stop(); return false; }
    if (!acted) return false;
    const id = pickNext(chosenNow(), here.id);
    if (!id || !appOf(id)) { stop(); return false; }        // every game taken out of the choice meanwhile
    fired = true;
    // the game's own result, already up in one of the dialogs that stop a game, isn't a pause: one you open after is
    const open = new Set(document.querySelectorAll(PAUSERS));
    setTimeout(() => announce(id, open), LEAD);
    return true;
  } catch (e) { console.error(e); return false; }
}
/**
 * For a game on seats.js (README, Seats): a function to give every view of the table, which ends a round (roundOver)
 * when a game of yours alone comes to its end, or to one of `steps` (a hand or a deal shown or scored, where the game
 * is dealt hand by hand). Only a change counts: the first view notes where the table stands, so a page opened on a
 * hand already over doesn't end it again.
 */
export function seatRounds(app, steps = []) {
  let was = null;
  return v => {
    const now = !v?.G ? null : v.over ? "over" : v.state?.step ?? "play", seen = was;
    was = now;
    if (v.mode === "solo" && endsRound(seen, now, steps)) roundOver(app);
  };
}
/** The banner: the next game's logo and name, the seconds left, and Stay. It stands still while the page is hidden or
 *  you've opened the games screen or a menu, and goes on when you're back. */
function announce(id, open) {
  if (!here) return;                                         // stopped meanwhile
  const app = appOf(id), bar = document.createElement("div");
  bar.className = "rd-next";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span class="rd-next-logo" aria-hidden="true">${app.logo}</span><span class="rd-next-words"><small>Next</small><b></b></span>
    <span class="rd-next-count" aria-hidden="true">${COUNT / 1000}</span><button class="btn" type="button">Stay</button><i class="rd-next-fuse" aria-hidden="true"></i>`;
  bar.querySelector("b").textContent = app.name;
  bar.querySelector("button").addEventListener("click", stop);
  banner = bar;
  const count = bar.querySelector(".rd-next-count"), fuse = bar.querySelector(".rd-next-fuse");
  let left = COUNT, last = performance.now();
  const frame = now => {
    if (banner !== bar) return;                              // stayed, or stopped
    const held = document.hidden || [...document.querySelectorAll(PAUSERS)].some(d => !open.has(d));
    if (!held) left -= Math.min(now - last, 100);            // time away (the phone locked) never counts
    last = now;
    bar.hidden = held;
    if (!held) {
      onTop(bar);
      count.textContent = String(Math.max(1, Math.ceil(left / 1000)));
      fuse.style.transform = `scaleX(${Math.max(0, left / COUNT)})`;
    }
    if (left <= 0) { go(id); return; }
    requestAnimationFrame(frame);
  };
  onTop(bar);
  requestAnimationFrame(frame);
}
/** Keeps an element in the topmost open modal dialog, else the page: a modal dialog (a game's result) puts everything
 *  outside it out of sight and out of reach. */
function onTop(el) {
  const modal = [...document.querySelectorAll("dialog[open]")].filter(d => { try { return d.matches(":modal"); } catch { return true; } }).pop();
  const home = modal || document.body;
  if (el.parentNode !== home) home.append(el);
}

// ---------- the game's page: its title and its menu ----------
const button = (text, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.addEventListener("click", fn); return b; };
/** RANDOM in the game's title, beside its name. It takes only the room the header has left, as your partner's pill does,
 *  so it never moves the header's buttons or changes its height; in that room it's whole, its mark alone where there's
 *  only a little, or nothing (a long name with buttons of its own beside it), chosen again whenever the room changes
 *  (the font arriving, the screen turning, a button added). */
function drawTag() {
  const tag = document.createElement("small"), chip = document.createElement("span");
  tag.className = "rd-tag";
  chip.className = "rd-chip";
  chip.innerHTML = `${SHUFFLE}<span class="rd-word">Random</span>`;
  tag.append(chip);
  here.button.insertBefore(tag, here.button.querySelector(".partner-pill"));
  here.tag = tag;
  const fit = () => {
    tag.classList.remove("rd-short", "rd-none");
    const room = tag.clientWidth;
    if (chip.offsetWidth <= room) return;
    tag.classList.add("rd-short");
    if (chip.offsetWidth > room) tag.classList.add("rd-none");
  };
  here.fitting = new ResizeObserver(fit);   // the tag's own width is the room, whatever is in it: no loop
  here.fitting.observe(tag);
}
/** The head of the game's menu while random mode plays it: Next game and Stop. */
function menuPart() {
  if (!here) return null;
  if (!soloNow()) { stop(); return null; }                   // the page sat down at a table without reloading
  const box = document.createElement("section"), acts = document.createElement("div");
  box.className = "menu-part rd-part";
  box.innerHTML = '<h4 class="menu-h">Random</h4>';
  acts.className = "rd-acts";
  const close = () => document.getElementById("menuDlg")?.close();
  const skip = button("Next game", "btn primary", () => { close(); next(); });
  skip.disabled = !canStart(chosenNow());
  acts.append(skip, button("Stop", "btn", () => { close(); stop(); }));
  box.append(line("A new game when this round is over."), acts);
  return box;
}

// ---------- the games screen: Random, and the games it may deal ----------
/** Draws Random again in the banner: its plate (and Stop, while random mode plays this game) says what it may do now. */
export function redrawRandom() {
  for (const r of rows) drawRow(r);
}
function drawRow({ row, current }) {
  if (row.hidden) return;
  const chosen = chosenNow(), on = !!here && here.id === current;
  const play = button("", "btn primary rd-play", () => { const id = pickNext(chosenNow(), current); if (id) go(id); });
  play.innerHTML = `${SHUFFLE}<span></span>`;
  play.lastChild.textContent = on ? "Next" : "Random";             // beside Stop, in a third of the row
  if (on) play.setAttribute("aria-label", "Next game");
  play.disabled = !canStart(chosen);
  row.replaceChildren(play, ...(on ? [button("Stop", "btn rd-stop", stop)] : []));
}
/** The games Random may deal, by the games screen's sections, each ticked or not (all at first), with All and None:
 *  the nodes for the banner's Choose sheet (banner.js). */
export function randomPane() {
  const on = new Set(chosenNow()), say = line(""), root = document.createElement("div");
  root.className = "rd-random-pane";
  const tell = () => { say.textContent = on.size ? `${on.size} of ${ELIGIBLE.length} games: one of them at random, and the next when its round is over.` : "Tick a game or more for Random to deal."; };
  // All and None for every game at the very top: None, then one section's All, leaves just that section
  const everyone = () => {
    const head = document.createElement("div"), both = document.createElement("span"), name = document.createElement("span");
    head.className = "menu-ticks-head";
    both.className = "menu-allnone";
    name.className = "menu-label";
    name.textContent = "All games";
    for (const [text, keep] of [["All", true], ["None", false]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = text;
      b.setAttribute("aria-label", `${text}: every game`);
      b.addEventListener("click", () => { on.clear(); if (keep) for (const id of ELIGIBLE) on.add(id); keepChoice([...on]); draw(); });
      if (!keep) both.append(document.createTextNode(" · "));
      both.append(b);
    }
    head.append(name, both);
    return head;
  };
  const draw = () => {                     // drawn again after the top All or None, so each section's ticks follow
    const parts = sections.map(([sec, title]) => {
      const list = ELIGIBLE.map(appOf).filter(a => a?.sec === sec);
      if (!list.length) return null;
      return ticks(title, list.map(a => [a.id, a.name]), list.filter(a => on.has(a.id)).map(a => a.id), ticked => {
        for (const a of list) on.delete(a.id);
        for (const id of ticked) on.add(id);
        keepChoice([...on]);
        tell();
      }, Infinity, { all: true });
    }).filter(Boolean);
    tell();
    root.replaceChildren(everyone(), say, ...parts);
  };
  draw();
  return [root];
}
