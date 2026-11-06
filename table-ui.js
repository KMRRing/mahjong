// A table's pages (table.js is the table itself): the name a guest goes by, the invitation with its QR code, the
// table's code in the address, the screen kept awake on the device that runs the table, and the narrator's voice.
// A game wires them with openTable() and draws its own table; its menu offers Invite players and Leave the table.
import { createTable } from "./table.js";
import { getSync, lan } from "./net.js";
import { reloadFresh } from "./pwa.js";
import { progress } from "./loading.js";
import { playerId } from "./suite.js";
import { qrSvg } from "./qr.js";
import "./voice.js";             // the first touch anywhere lets the page speak (a browser speaks only after one)

// the table's styles, linked once by whichever page first needs them (a literal name, so tools/offline.mjs keeps it)
if (!document.querySelector('link[href="table.css"]')) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "table.css";
  document.head.appendChild(l);
}

const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/** The table's code in this page's address (?table=CODE), or null. */
export function tableInAddress() {
  const c = (new URLSearchParams(location.search).get("table") || "").toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 4 ? c : null;
}
/** Puts the table's code in the address (or takes it out), so a reload sits down at the same table. */
export function setTableParam(code) {
  const u = new URL(location.href);
  if (code) u.searchParams.set("table", code); else u.searchParams.delete("table");
  history.replaceState(null, "", u);
}
/** The link that sits a guest down at this table: this page with the table's code. */
export const joinLink = code => `${location.origin}${location.pathname}?table=${code}`;

/** The name this device goes by (the suite's, kept from any table or duo match before), or "". */
export function savedName() {
  try { return (localStorage.getItem("crates:name") || "").trim(); } catch { return ""; }
}
/** Asks the name you go by at the table (kept on this device for next time); resolves with it, or null. */
export function askName({ title = "Your name", note = "", button = "Join" } = {}) {
  let saved = "";
  try { saved = localStorage.getItem("crates:name") || ""; } catch { /* private mode */ }
  const dlg = el("dialog", "sheet tb-name");
  dlg.setAttribute("aria-label", title);
  dlg.innerHTML = `<form method="dialog"><div class="pick-head"><h2></h2><button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE}</button></div>
    <p class="tb-note"></p><label for="tbName">The name the others see</label>
    <input id="tbName" maxlength="16" autocomplete="nickname" autocapitalize="words" required>
    <button class="btn primary wide" type="submit"></button></form>`;
  dlg.querySelector("h2").textContent = title;
  dlg.querySelector(".tb-note").textContent = note;
  dlg.querySelector(".tb-note").hidden = !note;
  dlg.querySelector("[type=submit]").textContent = button;
  const input = dlg.querySelector("input");
  input.value = saved;
  document.body.appendChild(dlg);
  return new Promise(resolve => {
    let name = null;
    dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
    dlg.querySelector("form").addEventListener("submit", () => { name = input.value.trim().slice(0, 16) || null; });
    dlg.addEventListener("close", () => {
      dlg.remove();
      if (name) try { localStorage.setItem("crates:name", name); } catch { /* private mode */ }
      resolve(name);
    }, { once: true });
    dlg.showModal();
    if (!saved) input.focus();
  });
}

// ---------- the screen kept awake ----------
// The device that runs the table keeps its screen on: a phone that dims and locks stops running the computer players
// and the clock (the next in line steps in after a few seconds, but the narrator's voice goes with it).
let lock = null, wanted = false;
async function wake() {
  if (!wanted || lock || document.hidden || !navigator.wakeLock) return;
  try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } catch { /* refused: battery saver */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
/** Keeps the screen on while `on`. */
export function keepAwake(on) {
  wanted = !!on;
  if (wanted) wake();
  else { lock?.release?.().catch(() => {}); lock = null; }
}

// ---------- the narrator ----------
export { createNarrator, SPOKEN_TABLES } from "./narrator.js";   // its own module, so Node tests can load it

// ---------- the invitation ----------
/**
 * The invitation, opened from the menu: the QR code to scan, the code and link, who's at the table (the host can ask
 * someone to leave), and the game's own button to start (deal = { label, run, ready(players) }). update() redraws it
 * as people sit down; it stays open until closed or the game starts.
 */
export function inviteSheet(table, { title = "Invite players", note = "", deal = null } = {}) {
  const dlg = el("dialog", "sheet tb-invite");
  dlg.setAttribute("aria-label", title);
  dlg.innerHTML = `<div class="pick-head"><h2></h2><button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE}</button></div>
    <div class="tb-scan"><div class="tb-qr"></div><div class="tb-how"><p class="tb-note"></p><p class="tb-code" aria-label="The table's code"></p>
    <div class="tb-links"><button class="btn" type="button" data-copy>Copy link</button><button class="btn" type="button" data-share hidden>Share</button></div></div></div>
    <h4>At the table</h4><ol class="tb-players"></ol><p class="tb-status"></p>
    <button class="btn primary wide" type="button" data-deal hidden></button>`;
  dlg.querySelector("h2").textContent = title;
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  const copy = dlg.querySelector("[data-copy]"), share = dlg.querySelector("[data-share]"), dealBtn = dlg.querySelector("[data-deal]");
  let drawnFor = null;
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(joinLink(table.code)); copy.textContent = "Copied"; }
    catch { copy.textContent = "Copy: hold the link"; }
    setTimeout(() => { copy.textContent = "Copy link"; }, 1600);
  });
  share.hidden = !navigator.share;
  share.addEventListener("click", () => navigator.share?.({ title: document.title, url: joinLink(table.code) }).catch(() => {}));
  if (deal) {
    dealBtn.textContent = deal.label || "Start";
    dealBtn.addEventListener("click", () => { dlg.close(); deal.run(); });
  }
  function update() {
    if (!dlg.isConnected) return;
    const code = table.code, me = table.me;
    if (code && drawnFor !== code) {
      drawnFor = code;
      dlg.querySelector(".tb-qr").innerHTML = qrSvg(joinLink(code), { label: `QR code to join the table ${code}` });
      dlg.querySelector(".tb-code").textContent = code;
    }
    dlg.querySelector(".tb-note").textContent = note || "Scan with the camera, or open the link: no app needed.";
    const list = dlg.querySelector(".tb-players");
    list.replaceChildren(...table.players.map(p => {
      const li = el("li", p.online === false ? "away" : "");
      li.append(el("span", "tb-dot"), el("span", "tb-who", p.name + (p.uid === table.uid ? " (you)" : "")));
      if (me?.host && p.uid !== table.uid) {
        const x = el("button", "icon-btn tb-remove");
        x.type = "button";
        x.setAttribute("aria-label", `Ask ${p.name} to leave`);
        x.innerHTML = CLOSE;
        x.addEventListener("click", () => table.remove(p.uid));
        li.append(x);
      }
      return li;
    }));
    const ready = deal && me?.driver ? (deal.ready?.(table.players) ?? true) : false;
    dealBtn.hidden = !deal || !me?.driver;
    dealBtn.disabled = ready !== true;
    dlg.querySelector(".tb-status").textContent = typeof ready === "string" ? ready
      : deal && !me?.driver ? `Waiting for ${table.players.find(p => p.uid === table.data?.host)?.name || "the host"} to start` : "";
  }
  return {
    // an offline party's guests join by scanning codes both ways, on the page round this one (lan.html), not by a link
    open() { if (lan) { lan.invite(); return; } if (!dlg.isConnected) document.body.appendChild(dlg); update(); if (!dlg.open) dlg.showModal(); },
    close() { if (dlg.open) dlg.close(); },
    get isOpen() { return dlg.open; },
    update,
  };
}

// ---------- a game's table, wired ----------
/**
 * A table for this page's game, with the suite's habits: the database connected when first needed, the table's code
 * in the address, a newer version fetched when another device runs one, the connection picked up again when the page
 * comes back from the background, the screen kept on while this device runs the table. opts are createTable's
 * (game, app, max, onState, onLeave) plus toast(msg). Returns the table with two more: start() opens a new table
 * (asking your name the first time), and joinAddress() sits down at the table in the address, if there is one.
 */
export function openTable({ game, app, max, onState, onLeave = () => {}, toast = () => {} }) {
  let updating = false;
  // what each stage of opening or joining says under the mark (loading.js), and how far along it puts the bar
  const what = game === "party" ? "the party" : "the table";
  const STAGES = { open: ["Reserving a room for it", 0.6], find: [`Finding ${what}`, 0.55], seat: ["Taking your seat", 0.75], in: [`Setting out ${what}`, 0.88] };
  const table = createTable({
    game, app, max,
    connect: getSync,
    onStep: stage => { const [words, at] = STAGES[stage] || []; if (words) progress(words, at); },
    onState: (branch, me) => { keepAwake(me?.driver); onState(branch, me); },
    onLeave: why => {
      keepAwake(false);
      setTableParam(null);
      if (why === "removed") toast("You've left the table");
      if (why === "gone") toast("That table has closed");
      onLeave(why);
    },
    onNewer: async () => {
      if (updating) return;
      updating = true;
      const flag = `${game}:updated`;
      try {
        if (sessionStorage.getItem(flag)) { toast("Someone has a newer version: close and reopen the game"); return; }
        sessionStorage.setItem(flag, "1");
      } catch { /* private mode */ }
      toast("Updating to the newest version…");
      await reloadFresh();
    },
    onError: e => { console.error(e); toast(/permission/i.test(String(e?.message || e)) ? "The game server turned that down" : "Couldn't reach the game server"); },
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) table.resync(); });
  window.addEventListener("pageshow", e => { if (e.persisted) table.resync(); });
  return Object.assign(table, {
    /** Opens a new table with this device as host (extra: the game's own fields to start it with); resolves with its
     *  code, or null. */
    async start(extra = {}) {
      if (table.code) return table.code;
      const name = savedName() || await askName({ title: "Your name", note: "So the others know whose table it is.", button: "Open the table" });
      if (!name) return null;
      try {
        const code = await table.open({ name, pid: playerId(), extra });
        if (!code) { toast("Couldn't open a table, try again"); return null; }
        setTableParam(code);
        return code;
      } catch (e) { console.error(e); toast("Couldn't reach the game server"); return null; }
    },
    /** Sits down at the table in the address, if any: resolves true once seated. */
    async joinAddress() {
      const code = tableInAddress();
      if (!code) return false;
      // a name this device already goes by sits down at once (a reload, or a guest back for another evening)
      const name = savedName() || await askName({ title: "Join the table", note: `Table ${code}: the name the others will see.`, button: "Sit down" });
      if (!name) { setTableParam(null); return false; }
      try {
        const r = await table.join(code, { name, pid: playerId() });
        if (r === "ok") return true;
        if (r !== "newer") { setTableParam(null); toast(r === "full" ? "That table is full" : "No table with that code"); }
        return false;
      } catch (e) { console.error(e); setTableParam(null); toast("Couldn't reach the game server"); return false; }
    },
  });
}
