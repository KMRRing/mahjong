// Playing one board together in the app's shared rooms (rooms.js). This handles everything that isn't the game:
// starting a room, joining one (your own seat from any of your devices, a new table for each request you two said
// yes to, taking over a seat when both are taken), keeping this game's branch in step, moves as transactions, who's
// where, reconnecting after the phone sleeps, updating a device running older code, and leaving. A game supplies its
// fresh state and draws whatever state arrives.
import { getSync } from "./net.js";
import { branchPath, openBranch, createRoom, enterRoom, leaveRoom, pickSeat, otherHere, seatsOf, sitDown, seatOfSlot, peopleSeats, runsElsewhere } from "./rooms.js";
import { reloadFresh } from "./pwa.js";
import { reportDuo, playerId, sayWhere } from "./suite.js";
import { progress } from "./loading.js";

export { seatsOf, seatOfSlot, peopleSeats, runsElsewhere };

/**
 * game: the room branch ("delta"); app: this code's version for together games of this kind;
 * fresh(players, { ask }): a new game state (or a promise of one; ask: the request it's dealt for, if any);
 * valid(state): whether a state is this game's; onState(state): draw it; onPresence(): redraw who's where; onLeave():
 * back to solo; toast(msg); askName(): the player's name; result(state): once a match is over, { match, score, won,
 * coop, lower } as this player saw it (else null), recorded for the pair's duo record; slots: the seats people have,
 * two, or a function of the state (sitDown in rooms.js); onGone(lastState): the room is gone while you were in it (a
 * party of two whose host ended it: coop-page.js says so and goes on) instead of the toast and onLeave.
 */
export function createTogether({ game, app, fresh, valid, onState, onPresence, onLeave, onGone, toast, askName, result, slots = 2 }) {
  const cap = state => (typeof slots === "function" ? slots(state) : slots);
  const reported = new Set();
  let room = null;   // { code, sync, uid, name, data, here, online, stop: [] }
  const path = code => branchPath(code, game);

  async function connect() {
    try { return await getSync(); }
    catch (e) { console.error(e); toast("Couldn't reach the game server"); return null; }
  }
  function explain(e) {
    console.error(e);
    toast(/permission/i.test(String(e?.message || e)) ? "Together mode isn't switched on in Firebase yet" : "Couldn't reach the game server");
  }
  function setRoomParam(code) {
    const u = new URL(location.href);
    if (code) u.searchParams.set("room", code); else u.searchParams.delete("room");
    u.searchParams.delete("new");           // the request's table is dealt: a reload sits down at it again
    history.replaceState(null, "", u);
    sayWhere();                             // your partner sees you at the table, or back in solo
  }
  /** The request this page was opened for (?new=, its time), while it's the room's latest and was said yes to; else null. */
  function askedFor(shared) {
    const at = Number(new URLSearchParams(location.search).get("new")) || 0, a = shared.ask;
    return at && a?.at === at && a.game === game && a.answer === "yes" ? at : null;
  }

  /**
   * A state as the database will take it. It refuses a whole write for one undefined (or NaN) anywhere in it, and
   * every move after would fail the same way (Tribute's first lead of every duo hand once did): any a game leaves are
   * dropped here, with a warning in the console, rather than the move lost.
   */
  function storable(state) {
    let odd = null;
    const json = JSON.stringify(state, function (k, v) {
      if (v === undefined && Array.isArray(this) && !Object.hasOwn(this, k)) return null;   // a gap the database left in a list
      if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) { odd ||= k; return v === undefined ? undefined : null; }
      return v;
    });
    if (odd) console.warn(`${game}: dropped ${odd} (undefined or not a number) from the state before saving it`);
    return JSON.parse(json);
  }

  /** Starts a new room with a fresh game in it. Says its stages to the mark's bar (loading.js), as joining does. */
  async function start() {
    const name = await askName();
    if (!name) return false;
    const sync = await connect();
    if (!sync) return false;
    try {
      const pid = playerId();
      progress("Dealing a new game", 0.6);
      const state = storable(await fresh({ [sync.uid]: { name, slot: 0, pid, online: true } }));
      progress("Opening a room", 0.72);
      const code = await createRoom(sync, game, state);
      if (!code) { toast("Couldn't start a game, try again"); return false; }
      enter(code, sync, name, pid);
      return true;
    } catch (e) { explain(e); return false; }
  }

  /**
   * Joins a room. If it began in another game, this game starts its side of it. Opened from a request the two of
   * you said yes to (?new=), it's a new table: whichever of you arrives first deals it and the other sits down at it
   * (your solo game stays where it was: it was never in the room). You get your own seat back on any of your
   * devices (sitDown in rooms.js); when both seats are someone else's, you can carry on as either player (say after
   * moving from laptop to phone without a solo code); their other device leaves. A join that doesn't come off leaves
   * the room out of the address, so the page is solo for your partner too (except while updating to newer code,
   * which reloads into the room).
   */
  async function join(code) {
    const solo = msg => { if (msg) toast(msg); setRoomParam(null); return false; };
    const sync = await connect();
    if (!sync) return solo();
    // the branch held in this page's cache while joining, so the joining transaction takes one round trip, not two
    const warm = sync.watch(path(code), () => {}, () => {});
    try {
      // each stage said to the mark's bar as it begins (loading.js): every game's joining shows them
      progress("Finding the game", 0.55);
      const shared = await openBranch(sync, code, game);
      if (!shared) return solo("No game with that code");
      const before = shared[game] || null, seats = seatsOf(before), pid = playerId(), asked = askedFor(shared);
      if ((before?.app || 0) > app) { updateApp(); return false; }
      const anew = !before || !valid(before) || (!!asked && before.asked !== asked);
      let takeover = null;
      if (!anew && seats.length >= cap(before) && !seats.some(([id, p]) => id === sync.uid || (p.pid && p.pid === pid))) {
        takeover = await pickSeat(seats);
        if (!takeover) return solo();
      }
      const name = takeover ? seats.find(([id]) => id === takeover)[1].name : await askName();
      if (!name) return solo();
      // a new table is dealt before the transaction (dealing can take a moment), marked with the request it's for
      if (anew) progress("Dealing a new game", 0.65);
      const initial = anew ? { ...(await fresh({ [sync.uid]: { name, slot: 0, pid, online: true } }, { ask: asked ? shared.ask : null })), ...(asked ? { asked } : {}) } : null;
      progress("Taking your seat", 0.75);
      let newer = false;
      const r = await sync.tx(path(code), cur => {
        newer = !!cur && (cur.app || 0) > app;
        const next = newer ? undefined : sitDown(cur, { uid: sync.uid, pid, name }, { initial, asked, takeover, valid, slots });
        return next ? storable(next) : next;
      });
      if (newer) { updateApp(); return false; }
      if (!r.committed || !r.value) return solo(r.value && valid(r.value) && seatsOf(r.value).length >= cap(r.value) ? "Someone else just took the free seat" : "No game with that code");
      enter(code, sync, name, pid);
      return true;
    } catch (e) { explain(e); return solo(); }
    finally { setTimeout(() => warm?.(), 0); }                 // once the room's own watch has it
  }

  function enter(code, sync, name, pid) {
    progress("Setting out the game", 0.88);           // until the game draws the first state and takes the mark down
    room = { code, sync, uid: sync.uid, pid, name, data: null, here: {}, online: true, stop: [] };
    setRoomParam(code);
    watch();
    room.stop.push(
      sync.presence?.(`${path(code)}/players/${sync.uid}`),
      sync.connection?.(ok => { if (room) { room.online = ok; onPresence(); } }),
      enterRoom(sync, code, game, name, here => { if (room) { room.here = here; onPresence(); } }, pid),
    );
  }
  function watch() {
    room.unwatch?.();
    room.unwatch = room.sync.watch(path(room.code), onRoom, explain);
  }
  function onRoom(val) {
    if (!room) return;
    if ((val?.app || 0) > app) { updateApp(); return; }
    if (!valid(val)) {
      if (onGone && !val && room.data) { const last = room.data; leave(true); onGone(last); return; }
      toast("That game has ended"); leave(); return;
    }
    if (!seatsOf(val).some(([id]) => id === room.uid)) {
      // your seat went to another device, or a new table was dealt for a new request (the device that asked is on its way)
      const moved = val.asked === room.data?.asked || seatsOf(val).some(([, p]) => room.pid && p.pid === room.pid);
      toast(moved ? "This game continued on another device" : "A new game started at the table");
      leave();
      return;
    }
    room.data = val;
    try { onState(val); }
    catch (e) { console.error(e); toast("Something went wrong showing the last move; it's still saved"); }   // never freeze
    try {
      const r = result?.(val);
      if (r && !reported.has(r.match)) { reported.add(r.match); reportDuo(game, r.match, r).catch(e => console.error(e)); }
    } catch (e) { console.error(e); }
  }

  /** Back from the background (Safari may have frozen the page): reconnect and fetch the room afresh. */
  function resync() {
    if (!room || document.hidden) return;
    room.sync.reconnect?.();
    watch();
  }

  /**
   * Changes the game state in one transaction; change(state) returns false to do nothing. Resolves to whether
   * it saved. (Firebase may first offer an empty cached value; answering null makes it check the server.)
   */
  async function act(change) {
    if (!room) return false;
    let newer = false;
    try {
      const r = await room.sync.tx(path(room.code), cur => {
        if (cur === null) return null;
        if (!valid(cur)) return undefined;
        if ((cur.app || 0) > app) { newer = true; return undefined; }
        cur.app = app;
        return change(cur) === false ? undefined : storable(cur);
      });
      if (newer) { updateApp(); return false; }
      return !!(r.committed && r.value && valid(r.value));
    } catch (e) {
      console.error(e);
      toast("Couldn't save that: check your connection and try again");
      return false;
    }
  }

  /** Another device runs newer code: switch to the newest version, once per session. */
  async function updateApp() {
    const flag = `${game}:updated`;
    try {
      if (sessionStorage.getItem(flag)) { toast("Your partner has a newer version: close and reopen the game"); return; }
      sessionStorage.setItem(flag, "1");
    } catch { /* private mode */ }
    toast("Updating to the newest version…");
    await reloadFresh();
  }

  /** Leaves the room for good (every game); quietly, it is already gone (onGone) and the game says so itself. */
  function leave(gone = false) {
    if (!room) return;
    room.unwatch?.();
    room.stop.forEach(stop => stop?.());
    leaveRoom(room.sync, room.code);
    room = null;
    setRoomParam(null);
    if (!gone) onLeave();
  }

  /**
   * Everyone else seated at the table, by the order they sat down: [{ id, slot, name, here }] (here: this game open on
   * a device that's online). A party's table seats more than two; partner() is the other one of a pair.
   */
  function others() {
    if (!room) return [];
    return seatsOf(room.data).filter(([id, p]) => id !== room.uid && !(room.pid && p.pid === room.pid))
      .sort((a, b) => a[1].slot - b[1].slot)
      .map(([id, p]) => ({ id, slot: p.slot, name: p.name || "Player", here: room.here?.[id]?.game === game && room.here[id].online !== false && p.online !== false }));
  }

  /** Who else is here: { name, online, game } (game is set when they have another game of the room open), or null. */
  function partner() {
    if (!room) return null;
    const seated = seatsOf(room.data).find(([id, p]) => id !== room.uid && !(room.pid && p.pid === room.pid));
    const there = otherHere(room.here, room.uid, room.pid, game);
    if (there && there.game !== game) return { name: there.name, online: there.online, game: there.game };
    if (!seated && !there) return null;
    return { name: seated?.[1].name || there.name, online: there ? there.online : seated[1].online !== false, game: null };
  }

  return {
    get room() { return room; },
    get online() { return room ? room.online : true; },
    /** This device's seat at the table (0 for the first to sit down), or null when not at one. */
    get slot() { return room?.data?.players?.[room.uid]?.slot ?? null; },
    start, join, act, leave: () => leave(), resync, partner, others,
  };
}
