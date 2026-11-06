// Joining a partner's board (docs/coop.md): the request, its answer, the party of two it opens, and leaving it. No page
// in it, so tests/coop-request.mjs plays it on the database in memory with several devices.
//
// You watch your partner's solo game (suite.js: watch) and press Request to join. That writes the request into the pair's
// room, crates/rooms/PAIR/join = { from: player id, device, name, game, at, answer?, by?, party?, playAt? }; their phone
// shows it wherever they are; Accept opens a party of two on their phone (the existing Party: crates/rooms/CODE/party, a
// table of two with the host and the guest seated, `coop` set) and the game's own request in it, carrying the host's board,
// then writes `party`, and both phones go to the game in that room. Every change of the request is a transaction on it
// (`step`), so only the first answer lands and nobody can part on it:
//
//   (asked) → accepting (a host device took it) → yes        (and the party is there before anyone is told yes)
//   (asked) → no (the host) | cancelled (the asker) | late (the asker's two minutes)
import { createRoom, branchPath } from "./rooms.js";
import { standUp } from "./table.js";
import { playHref } from "./party-href.js";

export const JOIN_FOR = 2 * 60 * 1000;                     // a request stands for two minutes
export const joinPath = pair => `crates/rooms/${pair}/join`;

const waiting = a => !!a && (!a.answer || a.answer === "accepting");
/** Whether a request is still open to answer: unanswered or being accepted, and not past its two minutes. */
export const open = (a, now = Date.now()) => waiting(a) && now - a.at < JOIN_FOR;

/**
 * The request after an event, or undefined if the event does not apply (someone answered first, it lapsed, it is not
 * the request the event is about). `cur` is the request as it stands (null: none).
 *   ask     { pid, uid, name, game }       a new request, unless the partner's own is waiting
 *   claim   { at, uid }                    a host device takes it, to open the party
 *   yes     { at, uid, party, playAt }     the party is open
 *   no      { at }                         the host declines
 *   cancel  { at }  late { at }            the asker withdraws, or gives up waiting
 */
export function step(cur, ev, now = Date.now()) {
  if (ev.type === "ask") {
    if (cur && open(cur, now) && cur.from !== ev.pid) return undefined;
    return { from: ev.pid, device: ev.uid, name: ev.name, game: ev.game, at: now };
  }
  if (!cur || cur.at !== ev.at) return undefined;
  switch (ev.type) {
    case "claim": return !cur.answer && now - cur.at < JOIN_FOR ? { ...cur, answer: "accepting", by: ev.uid } : undefined;
    case "yes": return cur.answer === "accepting" && cur.by === ev.uid ? { ...cur, answer: "yes", party: ev.party, playAt: ev.playAt } : undefined;
    case "no": return !cur.answer ? { ...cur, answer: "no" } : undefined;
    case "cancel": return waiting(cur) ? { ...cur, answer: "cancelled" } : undefined;
    case "late": return waiting(cur) ? { ...cur, answer: "late" } : undefined;
  }
  return undefined;
}

/** One event as a transaction on the pair's request: { node: the request now, mine: whether this event is the one that landed }. */
export async function transact(sync, pair, ev) {
  let node = null, mine = false;
  const r = await sync.tx(joinPath(pair), cur => {
    mine = false;
    if (cur === null && ev.type !== "ask") { node = null; return null; }       // a cold cache: null makes the database answer with the real one
    const next = step(cur, ev);
    if (next === undefined) { node = cur; return undefined; }
    node = next; mine = true;
    return next;
  });
  return { node: r.value ?? node, mine: mine && r.committed };
}

/** Asks to join the partner's board in `game`. Resolves { ok, at } or { ok: false } when their own request to you is waiting. */
export async function requestJoin(sync, pair, { pid, name, game }) {
  const r = await transact(sync, pair, { type: "ask", pid, uid: sync.uid, name, game });
  return r.mine ? { ok: true, at: r.node.at } : { ok: false };
}
export const cancelJoin = (sync, pair, at) => transact(sync, pair, { type: "cancel", at });
export const lapseJoin = (sync, pair, at) => transact(sync, pair, { type: "late", at });
export const declineJoin = (sync, pair, at) => transact(sync, pair, { type: "no", at });

/**
 * Opens the party of two for a request the host is accepting: the party (Party's table, `coop` marked, the host and the
 * guest seated, the guest away until their phone sits down) with the game as its choice, then the game's own request in
 * the party's room, already said yes to, carrying the host's board for whoever arrives first to deal from. The game's
 * table is dealt by the first of them to arrive, as for any duo match. Resolves { code, at, playing }.
 *   host, guest: { uid, pid, name }   game: { id, page }   board: the shared board to start from (null: a new puzzle)
 */
export async function openCoopParty(sync, { host, guest, game, board = null, now = Date.now() }) {
  const seat = (p, seat, online) => ({ name: p.name, ...(p.pid && p.pid !== p.uid ? { pid: p.pid } : {}), seat, joined: now, online });
  const playing = { id: game.id, kind: "duo", page: game.page, at: now, who: [host.uid, guest.uid], max: 2, coop: true };
  const party = { v: 1, app: 0, created: now, host: host.uid, rev: 0, coop: true, players: { [host.uid]: seat(host, 0, true), [guest.uid]: seat(guest, 1, false) }, playing };
  const code = await createRoom(sync, "party", party);
  if (!code) throw new Error("no room for the party");
  await sync.update(`crates/rooms/${code}`, { ask: { game: game.id, at: now, answer: "yes", from: host.pid, device: host.uid, people: 2, names: { host: host.name, guest: guest.name }, ...(board ? { board } : {}) } });
  return { code, at: now, playing };
}

/** Takes a whole room down. A transaction on the room's own path, where the database's rules grant the write (a cold cache's first try gives null, and answering null makes it ask the server). */
const removeRoom = (sync, code) => sync.tx(`crates/rooms/${code}`, () => null);

/**
 * The host accepts a request: claims it, opens the party, then tells the asker yes. Resolves { ok: true, code, at } or
 * { ok: false, why } ("taken": another device or an answer got there first; "lapsed": it ran out while the party opened,
 * which is then taken down again; "error").
 */
export async function acceptJoin(sync, pair, req, host, { game, board = null }) {
  const claim = await transact(sync, pair, { type: "claim", at: req.at, uid: host.uid });
  if (!claim.mine) return { ok: false, why: "taken" };
  let party;
  try { party = await openCoopParty(sync, { host, guest: { uid: req.device, pid: req.from, name: req.name || "Your partner" }, game, board }); }
  catch (e) { console.error(e); await transact(sync, pair, { type: "late", at: req.at }).catch(() => {}); return { ok: false, why: "error" }; }
  const said = await transact(sync, pair, { type: "yes", at: req.at, uid: host.uid, party: party.code, playAt: party.at });
  if (!said.mine) { await removeRoom(sync, party.code).catch(() => {}); return { ok: false, why: "lapsed" }; }
  return { ok: true, code: party.code, at: party.at };
}

/** Where a phone goes for a party of two: the game's page in the party's room (what Party's own phones follow, with `coop`). */
export const coopHref = (game, code, at) => playHref({ id: game.id, kind: "duo", page: game.page, at, coop: true }, code);

/**
 * Whether this device should go to the party for its own request, answered yes: the device that asked, within ten
 * minutes, and not gone yet (`followed`: the time of the request this device last went for).
 */
export const shouldFollow = (a, { uid, pid, followed, now = Date.now() }) =>
  !!a && a.answer === "yes" && !!a.party && a.from === pid && a.device === uid && now - a.at < 10 * 60 * 1000 && String(followed) !== String(a.at);

/**
 * Leaves the party of two. The host ends it: the room goes, and the guest's page finds the board gone. The guest says
 * so on the game's branch first (the host's page is watching it, and names who left), then frees the party seat.
 */
export async function leaveCoop(sync, { code, game, host, uid, pid, name }) {
  if (host) { await removeRoom(sync, code); return; }
  await sync.tx(branchPath(code, game), cur => {
    if (cur === null) return null;
    if (cur.left) return undefined;
    for (const [id, p] of Object.entries(cur.players || {})) if (id === uid || (pid && p?.pid === pid)) delete cur.players[id];
    cur.left = { name, pid, at: Date.now() };
    return cur;
  });
  await sync.tx(`crates/rooms/${code}/party`, cur => (cur === null ? null : standUp(cur, uid) ?? undefined));
}
