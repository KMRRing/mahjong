// Tables: one game, several people in the same place, each on their own phone. The host opens a table (the game's
// menu, Invite players) and shows a QR code; the others scan it and join in their own browser with just a name, no
// app to install and no codes to pair. A table is a room of its own (crates/rooms/CODE/<game>, a four-letter code like
// a pair's room, so it needs no new database rules), and seats belong to players, not devices: a player's other
// device, or the same phone after a reload, sits back down in their seat. Computer players take the seats nobody has
// (the game decides); one device runs them, the table's clock and its narrator, the host's while it's here, else
// whoever sits lowest of those here.
//
//   crates/rooms/CODE/<game> = { v: 1, app, created, host, rev,
//                                players: { uid: { name, pid, seat, joined, online } },
//                                game: <the game's own state>, inputs: { uid: … }, say: { n, text, lang, at } }
//
// Moves are transactions on the whole branch (act), each one numbered (rev), so a move worked out on a table that has
// moved on since can be turned down; what everyone does at once (a vote, a clue) is written each to its own place
// (send), with nothing to collide, for the driving device to gather. This module has no page of its own (table-ui.js
// draws the invitation and asks names), so the tests can seat a whole party in Node (tests/fake-db.mjs).
import { createRoom, branchPath } from "./rooms.js";

const BACKUP_MS = 4000;              // how long the next in line waits for the driving device before doing its work
export const MAX_SEATS = 24;         // a party's limit; a card table gives its own

// a player entry with a seat (a device that lost its connection just as it left can leave its "offline" mark behind)
const sits = p => !!p && Number.isInteger(p.seat);
/** The players at a table in seat order: [{ uid, name, pid, seat, online, joined }]. */
export function seated(branch) {
  return Object.entries(branch?.players || {}).filter(([, p]) => sits(p))
    .map(([uid, p]) => ({ uid, ...p })).sort((a, b) => a.seat - b.seat);
}

/**
 * Which device runs the table now: the host while it's online, else the lowest-seated player online, else the host
 * (nobody's here; whoever comes back first takes it up). null for a table with nobody at it.
 */
export function driverOf(branch) {
  const all = seated(branch);
  if (!all.length) return null;
  const host = all.find(p => p.uid === branch.host);
  if (host && host.online !== false) return host.uid;
  return (all.find(p => p.online !== false) || host || all[0]).uid;
}
/** The device next in line, which steps in when the driving one has gone quiet: the next online player after it. */
export function backupOf(branch) {
  const lead = driverOf(branch);
  return seated(branch).find(p => p.uid !== lead && p.online !== false)?.uid ?? null;
}

/** A state with one player's id swapped for another's everywhere (inputs, a game's own records): a seat moving device. */
const reseat = (state, from, to) => JSON.parse(JSON.stringify(state).split(JSON.stringify(from)).join(JSON.stringify(to)));

/**
 * Sitting down, inside the joining transaction: the branch to write, or undefined to leave it (full, or not a
 * table). Your own seat by this device's id, then by your player id (your other device, or a new id after the browser
 * forgot it), then the lowest free seat below `max`.
 */
export function sitAt(cur, { uid, pid = null, name }, { max = MAX_SEATS, now = Date.now() } = {}) {
  if (!cur || cur.v !== 1 || !cur.players) return undefined;
  const mine = sits(cur.players[uid]) ? uid : seated(cur).find(p => pid && p.pid === pid)?.uid;
  if (mine) {
    const next = mine === uid ? cur : reseat(cur, mine, uid);
    next.players[uid] = { ...next.players[uid], name, ...(pid ? { pid } : {}), online: true };
    return next;
  }
  const taken = new Set(seated(cur).map(p => p.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  if (seat >= max) return undefined;
  cur.players[uid] = { name, ...(pid ? { pid } : {}), seat, joined: now, online: true };
  return cur;
}

/** The branch without a player: their seat freed, the host's role passed to the lowest seat left if it was theirs. */
export function standUp(cur, uid) {
  if (!sits(cur?.players?.[uid])) return undefined;
  delete cur.players[uid];
  if (cur.inputs) delete cur.inputs[uid];
  if (cur.host === uid) cur.host = seated(cur)[0]?.uid ?? null;
  return cur;
}

/** Sets the narrator's next line in a branch being changed (inside act): every page shows it, the driving one speaks it. */
export function narrate(branch, text, lang = "en-GB") {
  branch.say = { n: (branch.say?.n || 0) + 1, text, lang, at: Date.now() };
}

/**
 * A state as the database will take it: it refuses a whole write for one undefined or NaN anywhere in it, so any a
 * game leaves are dropped here (with a warning) rather than the move lost. A gap the database left in a list is null.
 */
export function storable(state, game = "table") {
  let odd = null;
  const json = JSON.stringify(state, function (k, v) {
    if (v === undefined && Array.isArray(this) && !Object.hasOwn(this, k)) return null;
    if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) { odd ||= k; return v === undefined ? undefined : null; }
    return v;
  });
  if (odd) console.warn(`${game}: dropped ${odd} (undefined or not a number) from the table before saving it`);
  return JSON.parse(json);
}

/**
 * A table for one game. game: the branch's name (the game's id); app: this code's version (a device running older
 * code is asked to update, onNewer); max: seats for people; sync: the database connection, or connect() to get one
 * when it's first needed; onState(branch, me): draw it (me: { uid, seat, name, host, driver, backup }); onLeave(why):
 * the table is behind this page ("left", "removed", "gone"); onNewer(): another device runs newer code; onError(e);
 * backupMs: how long the next in line waits (the tests shorten it); onStep(stage): each stage of opening or joining as
 * it begins ("open": the table being opened; "find": the table being read; "seat": the seat being taken; "in": sat
 * down, its first state on the way), for the page to say where it has got to.
 */
export function createTable({ game, app = 1, max = 4, sync: given = null, connect = null, onState = () => {}, onLeave = () => {}, onNewer = () => {}, onError = e => console.error(e), backupMs = BACKUP_MS, onStep = () => {} }) {
  let t = null;   // { code, sync, uid, data, offset, online, stop: [], unwatch }
  const path = code => branchPath(code, game);

  async function link() {
    if (given) return given;
    given = await connect();
    return given;
  }
  function me() {
    if (!t?.data) return null;
    const p = t.data.players?.[t.uid];
    if (!sits(p)) return null;
    const driver = driverOf(t.data) === t.uid;
    return { uid: t.uid, seat: p.seat, name: p.name, pid: p.pid || null, host: t.data.host === t.uid, driver, backup: !driver && backupOf(t.data) === t.uid };
  }

  /** Opens a new table with this device as its host, in seat 0; resolves with its code, or null if it couldn't. */
  async function open({ name, pid = null, extra = {} }) {
    const sync = await link();
    onStep("open");
    const now = Date.now();
    const branch = storable({ v: 1, app, created: now, host: sync.uid, rev: 0, players: { [sync.uid]: { name, ...(pid ? { pid } : {}), seat: 0, joined: now, online: true } }, ...extra }, game);
    const code = await createRoom(sync, game, branch);
    if (code) enter(code, sync);
    return code;
  }

  /**
   * Sits down at a table by its code. Resolves "ok", "none" (no such table), "full" or "newer" (update first). The
   * table is read first and held while joining: a player already in their seat (back from another page of a party, a
   * reload, a party's phones arriving at the table their host dealt with everyone in it) sits straight down, presence
   * marking them here, one round trip to the database in all; anyone else sits down by a transaction on the table
   * already read, which then takes one round trip (on a cold cache it sends a blind first try the database turns down).
   */
  async function join(code, { name, pid = null }) {
    const sync = await link();
    onStep("find");
    let hold = null;
    const first = await new Promise((resolve, reject) => { hold = sync.watch(path(code), resolve, reject); });
    try {
      if (!first || first.v !== 1) return "none";
      if ((first.app || 0) > app) { onNewer(); return "newer"; }
      const mine = first.players?.[sync.uid];
      if (sits(mine)) {
        if (mine.name !== name || (pid && mine.pid !== pid)) sync.update(`${path(code)}/players/${sync.uid}`, { name, ...(pid ? { pid } : {}) }).catch(onError);
        enter(code, sync);
        return "ok";
      }
      let newer = false, full = false;
      onStep("seat");
      const r = await sync.tx(path(code), cur => {
        newer = full = false;
        if (cur === null) return null;                     // a cold cache: null makes the database answer with the real one
        if ((cur.app || 0) > app) { newer = true; return undefined; }
        const next = sitAt(cur, { uid: sync.uid, pid, name }, { max });
        if (next === undefined) { full = cur.v === 1; return undefined; }
        return storable(next, game);
      });
      if (newer) { onNewer(); return "newer"; }
      if (!r.value || r.value.v !== 1) return "none";
      if (!r.committed) return full ? "full" : "none";
      enter(code, sync);
      return "ok";
    } finally { setTimeout(() => hold?.(), 0); }          // once the table's own watch (enter) has it
  }

  function enter(code, sync) {
    onStep("in");
    leaveQuietly();
    t = { code, sync, uid: sync.uid, data: null, offset: 0, online: true, stop: [], unwatch: null };
    watch();
    t.stop.push(
      sync.presence?.(`${path(code)}/players/${sync.uid}`),
      sync.connection?.(ok => { if (t) { t.online = ok; if (t.data) onState(t.data, me()); } }),
      sync.serverOffset?.(ms => { if (t) t.offset = ms || 0; }),
    );
  }
  function watch() {
    t.unwatch?.();
    const here = t;
    t.unwatch = t.sync.watch(path(t.code), val => { if (t === here) onBranch(val); }, onError);
  }
  function onBranch(val) {
    if (!val || val.v !== 1) { const was = t; leaveQuietly(); if (was) onLeave("gone"); return; }
    if ((val.app || 0) > app) { onNewer(); return; }
    if (!sits(val.players?.[t.uid])) { leaveQuietly(); onLeave("removed"); return; }
    t.data = val;
    try { onState(val, me()); } catch (e) { onError(e); }
  }
  function leaveQuietly() {
    if (!t) return;
    t.unwatch?.();
    t.stop.forEach(stop => { try { stop?.(); } catch { /* already gone */ } });
    t = null;
  }

  /**
   * Changes the table in one transaction: change(branch) edits it in place, or returns false to change nothing. With
   * `rev`, only if the table is still at that move (a computer player's move worked out on what was on the table).
   * Resolves whether it was saved.
   */
  async function act(change, { rev = null } = {}) {
    if (!t) return false;
    const here = t;
    let newer = false;
    try {
      const r = await here.sync.tx(path(here.code), cur => {
        newer = false;
        if (cur === null) return null;
        if (cur.v !== 1 || !sits(cur.players?.[here.uid])) return undefined;
        if ((cur.app || 0) > app) { newer = true; return undefined; }
        if (rev !== null && (cur.rev || 0) !== rev) return undefined;
        if (change(cur) === false) return undefined;
        cur.app = app;
        cur.rev = (cur.rev || 0) + 1;
        return storable(cur, game);
      });
      if (newer) { onNewer(); return false; }
      return !!(r.committed && r.value);
    } catch (e) { onError(e); return false; }
  }

  /** This player's input for what everyone does at once, kept at inputs/<uid> until the game gathers it. */
  async function send(value) {
    if (!t) return false;
    try { await t.sync.update(`${path(t.code)}/inputs`, { [t.uid]: storable({ ...value, at: now() }, game) }); return true; }
    catch (e) { onError(e); return false; }
  }

  /** Leaves the table for good: your seat is freed (a game in progress plays it as it decides). */
  async function leave() {
    if (!t) return;
    const { sync, code, uid } = t;
    leaveQuietly();
    try { await sync.tx(path(code), cur => (cur === null ? null : standUp(cur, uid) ?? undefined)); } catch (e) { onError(e); }
    onLeave("left");
  }
  /** The host asks someone to leave (joined by mistake, or gone home). */
  const remove = uid => act(cur => uid !== t?.uid && standUp(cur, uid) !== undefined);

  /** The database's time, the same on every device to a few milliseconds: what a table's clock counts by. */
  const now = () => Date.now() + (t?.offset || 0);

  /**
   * Does the table's own work (a computer player's move, a clock run out): at once on the driving device; on the next
   * in line only if nothing has moved for a few seconds (the driving phone asleep, or gone without a goodbye). A
   * later call replaces a wait still pending, so calling it on every state is safe.
   */
  let waiting = null;
  function drive(work) {
    clearTimeout(waiting);
    const m = me();
    if (!m || (!m.driver && !m.backup)) return;
    if (m.driver) { work(); return; }
    const rev = t.data.rev, here = t;
    waiting = setTimeout(() => { if (t === here && t.data?.rev === rev) work(); }, backupMs);
  }

  /** Back from the background (Safari may have frozen the page): reconnect and read the table afresh. */
  function resync() {
    if (!t) return;
    t.sync.reconnect?.();
    watch();
  }

  return {
    get code() { return t?.code || null; },
    get data() { return t?.data || null; },
    get uid() { return t?.uid || null; },
    get online() { return t ? t.online : true; },
    get me() { return me(); },
    get players() { return seated(t?.data); },
    open, join, act, send, leave, remove, drive, now, resync,
  };
}
