// What a page shows around joining a partner's board (coop-request.js is the machinery, docs/coop.md): the Request to
// join button in the watching bar, the host's prompt wherever the host is, and the small bar a game puts over its board
// while the two of you share it. Loaded by suite.js only when it is wanted, so it takes what it needs from there as
// arguments rather than importing it (suite.js does not finish loading on a watching page, and a module waiting on it
// would never run).
import { coopGame, coopAdapter } from "./coop-games.js";
import { requestJoin, cancelJoin, lapseJoin, declineJoin, acceptJoin, coopHref, shouldFollow, open, JOIN_FOR } from "./coop-request.js";

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export const firstName = name => String(name || "your partner").trim().split(/\s+/)[0] || "your partner";

// ---------- the joiner: the watching bar ----------
/**
 * The Request to join button in the watching bar, and what the request is doing: asking, declined, lapsed, accepted
 * (the phone then goes to the party). Only for a game that can be shared (COOP_GAMES) and while the partner is playing it
 * on their own (`partner(p)` tells it who they are and where). ctx: { bar (the watching bar), sync, pair, me, name(),
 * game, who() (the partner's name), go(href, at) }.
 */
export function watchJoin(ctx) {
  const entry = coopGame(ctx.game);
  if (!entry) return { partner() {} };
  const stop = ctx.bar.querySelector("button"), say = el("small", "coop-say");
  ctx.bar.append(say);
  ctx.bar.classList.add("joinable");
  const ask = el("button", "btn primary", "Request to join");
  ask.type = "button";
  ask.dataset.join = "1";
  ctx.bar.insertBefore(ask, stop);
  let here = null, mine = null, timer = null, said = "", clear = null;       // mine: { at } while a request of this page's is out
  const who = () => firstName(ctx.who() || here?.name);
  const words = text => { said = text; draw(); };
  function draw() {
    const live = !!here && here.game === ctx.game && here.mode === "solo" && here.online !== false;
    ask.disabled = !!mine?.answered || (!mine && !live);
    ask.className = mine ? "btn" : "btn primary";
    ask.textContent = mine ? (mine.answered ? "Opening…" : "Cancel request") : "Request to join";
    const text = said || (mine ? `Asking ${who()}…` : !live ? `${who()} isn't playing ${entry.name} on their own now` : "");
    say.textContent = text;
    say.hidden = !text;
    ctx.bar.classList.toggle("asking", !!mine);
  }
  function finish(text, ms = 4000) {
    mine = null;
    clearTimeout(timer);
    words(text);
    clearTimeout(clear);
    clear = setTimeout(() => words(""), ms);
  }
  ask.addEventListener("click", async () => {
    if (mine) {                                                      // withdraw
      const at = mine.at;
      finish("");
      cancelJoin(ctx.sync, ctx.pair, at).catch(e => console.error(e));
      return;
    }
    ask.disabled = true;
    clearTimeout(clear);
    words("");
    let r;
    try { r = await requestJoin(ctx.sync, ctx.pair, { pid: ctx.me, name: ctx.name(), game: ctx.game }); }
    catch (e) { console.error(e); finish("Couldn't reach the game server: try again"); return; }
    if (!r.ok) { finish(`${who()} has asked you to join already: look for the request`, 5000); return; }
    mine = { at: r.at };
    draw();
    timer = setTimeout(() => lapseJoin(ctx.sync, ctx.pair, r.at).catch(e => console.error(e)), JOIN_FOR);
  });
  // the request's answers, from the pair's room
  ctx.sync.watch(`crates/rooms/${ctx.pair}/join`, a => {
    if (!mine || !a || a.at !== mine.at) {
      if (mine && a && a.at !== mine.at && a.from !== ctx.me) finish(`${who()} asked you to join them instead`);
      return;
    }
    if (a.answer === "yes" && a.party) { mine.answered = true; draw(); ctx.go(coopHref(entry, a.party, a.playAt), a.at); }
    else if (a.answer === "no") finish(`${who()} said not now`);
    else if (a.answer === "late") finish(`No answer from ${who()}`);
    else if (a.answer === "cancelled") finish("");
    else if (a.answer === "accepting") words(`${who()} is opening the co-op…`);
  }, e => console.error(e));
  draw();
  return { partner(p) { here = p; draw(); } };
}

// ---------- the host: the prompt, wherever they are ----------
let hosting = null;      // { at, busy } while a request's prompt is up on this page
/**
 * Called with every change of the request in the pair's room, on any page of the pair. A request from the partner
 * shows a prompt (Accept opens the party of two with this phone's board, Not now declines); your own request answered
 * yes takes this device to the party. ctx: { sync, pair, me, name(), banner(bar|null, slot), saved(keys) → { key: text },
 * followed() → the last request gone to, go(href, at) }.
 */
export function onJoinNode(a, ctx) {
  if (a && a.from === ctx.me) {
    const game = coopGame(a.game);
    if (game && shouldFollow(a, { uid: ctx.sync.uid, pid: ctx.me, followed: ctx.followed() })) ctx.go(coopHref(game, a.party, a.playAt), a.at);
    return;
  }
  const entry = a && coopGame(a.game);
  if (hosting?.busy && a?.at === hosting.at) return;                 // opening the party: the prompt says so until it is done
  if (!entry || a.answer || !open(a)) { hosting = null; ctx.banner(null, "join"); return; }
  const bar = el("div", "pair-ask join");
  bar.setAttribute("role", "alertdialog");
  bar.innerHTML = '<span><b></b> wants to join your <i></i></span><button class="btn primary" type="button" data-yes>Accept</button><button class="btn" type="button" data-no>Not now</button>';
  bar.querySelector("b").textContent = firstName(a.name);
  bar.querySelector("i").textContent = entry.name;
  const say = text => { bar.querySelector("span").textContent = text; for (const b of bar.querySelectorAll("button")) b.remove(); ctx.banner(bar, "join"); };
  bar.querySelector("[data-yes]").addEventListener("click", async () => {
    for (const b of bar.querySelectorAll("button")) b.disabled = true;
    hosting = { at: a.at, busy: true };
    bar.querySelector("span").textContent = "Opening the co-op…";
    let r;
    try {
      const adapter = await coopAdapter(entry.id);                  // the game's engine comes in now, not before anyone asked
      r = await acceptJoin(ctx.sync, ctx.pair, a, { uid: ctx.sync.uid, pid: ctx.me, name: ctx.name() }, { game: entry, board: adapter.share(ctx.saved(entry.keys)) });
    }
    catch (e) { console.error(e); r = { ok: false, why: "error" }; }
    hosting = null;
    if (r.ok) { say("Opening the co-op…"); ctx.go(coopHref(entry, r.code, r.at), a.at); return; }
    say(r.why === "taken" ? "Your other device is on its way" : r.why === "lapsed" ? "That request lapsed: ask them to try again" : "Couldn't open the co-op: try again");
    setTimeout(() => ctx.banner(null, "join"), 3000);
  });
  bar.querySelector("[data-no]").addEventListener("click", () => { declineJoin(ctx.sync, ctx.pair, a.at).catch(e => console.error(e)); ctx.banner(null, "join"); });
  ctx.banner(bar, "join");
  hosting = { at: a.at, busy: false };
  const left = JOIN_FOR - (Date.now() - a.at);
  setTimeout(() => { if (hosting?.at === a.at && !hosting.busy) { hosting = null; ctx.banner(null, "join"); } }, left);
}

// ---------- the game: the bar over a shared board ----------
/**
 * The line a game puts over its board while the two of you share it: who you are playing with, whether they are here,
 * and the way out. set({ name, here, host }) redraws it; onLeave() is called when Leave (End, for the host) is pressed.
 * The game places `el` where it has room, and styles come from style.css (.coop-bar).
 */
export function createCoopBar({ onLeave }) {
  const bar = el("div", "coop-bar");
  bar.setAttribute("role", "status");
  bar.hidden = true;                                       // until set() says who it is with
  bar.innerHTML = '<i class="coop-dot" aria-hidden="true"></i><span class="coop-who"></span><button class="coop-leave" type="button"></button>';
  const who = bar.querySelector(".coop-who"), leave = bar.querySelector(".coop-leave");
  leave.addEventListener("click", () => onLeave());
  return {
    el: bar,
    set({ name, here = true, host = false }) {
      who.replaceChildren("Co-op with ", Object.assign(el("b"), { textContent: firstName(name) }), here ? "" : " (away)");
      leave.textContent = host ? "End" : "Leave";
      leave.setAttribute("aria-label", host ? "End the co-op" : "Leave the co-op");
      bar.classList.toggle("away", !here);
      bar.hidden = false;
    },
    hide() { bar.hidden = true; },
  };
}
