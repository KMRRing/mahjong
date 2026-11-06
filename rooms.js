// Rooms shared by every game in the app. A room is one four-letter code for two people. Each game keeps its
// own state in its own branch (crates/rooms/CODE/crates, crates/rooms/CODE/glyph), so switching games keeps
// you in the room and every game's progress stays where it was. "here" records which game each person has
// open, so a game can say "Sarah is in Slate".
//
//   crates/rooms/CODE = { suite: 1, created, owner, here: { uid: { game, name, pid, sessions } }, crates: {…}, glyph: {…} }
//
// Rooms from before this layout kept one game's state at the top; they're lifted into a branch when opened.

export const GAMES = {
  crates: { name: "Crates", page: "./crates.html" },
  glyph: { name: "Slate", page: "./slate.html" },    // id kept from its first name, Glyph
  delta: { name: "Delta", page: "./delta.html" },
  punt: { name: "Punt", page: "./punt.html" },
  cartel: { name: "Cartel", page: "./cartel.html" },
  spot: { name: "Spot", page: "./spot.html" },
  quote: { name: "Quote", page: "./quote.html" },
  origin: { name: "Origin", page: "./origin.html" },
  order: { name: "Order", page: "./order.html" },
  nexus: { name: "Nexus", page: "./nexus.html" },
  calibre: { name: "Calibre", page: "./calibre.html" },
  manifest: { name: "Manifest", page: "./manifest.html" },
  chart: { name: "Chart", page: "./chart.html" },
  survey: { name: "Survey", page: "./survey.html" },
  blend: { name: "Blend", page: "./blend.html" },
  refinery: { name: "Refinery", page: "./refinery.html" },
  rush: { name: "Puzzle rush", page: "./rush.html" },     // Gambit's, on a page of its own (no tile: Gambit's menu opens it)
  deck: { name: "Deck", page: "./deck.html" },
  parley: { name: "Parley", page: "./parley.html" },
  stow: { name: "Stow", page: "./stow.html" },
  hong: { name: "Mahjong", page: "./hong.html" },
  tribute: { name: "Guandan", page: "./tribute.html" },
  party: { name: "Party", page: "./party.html" },
  river: { name: "Xiangqi", page: "./river.html" },
  gambit: { name: "Chess", page: "./gambit.html" },
  boast: { name: "Liar's dice", page: "./boast.html" },
  yacht: { name: "Yacht", page: "./yacht.html" },
  bigtwo: { name: "Big Two", page: "./bigtwo.html" },
  carrack: { name: "Carrack", page: "./carrack.html" },
  hearts: { name: "Hearts", page: "./hearts.html" },
  meld: { name: "Gin rummy", page: "./meld.html" },
  rack: { name: "Rack", page: "./rack.html" },
  pegs: { name: "Cribbage", page: "./pegs.html" },
  landlord: { name: "Dou Dizhu", page: "./landlord.html" },
  holdem: { name: "Texas Hold'em", page: "./holdem.html" },
  factor: { name: "Hanse", page: "./factor.html" },
  banquet: { name: "Banquet", page: "./banquet.html" },
  gammon: { name: "Backgammon", page: "./gammon.html" },
  silo: { name: "Four in a row", page: "./silo.html" },
  carrom: { name: "Carrom", page: "./carrom.html" },
  crown: { name: "Draughts", page: "./crown.html" },
  jass: { name: "Jass", page: "./trumps.html" },
  belote: { name: "Belote", page: "./trumps.html" },
  schafkopf: { name: "Schafkopf", page: "./trumps.html" },
  quest: { name: "Company", page: "./quest.html" },
  bones: { name: "Dominoes", page: "./bones.html" },
  sudoku: { name: "Nonet", page: "./sudoku.html" },
  mines: { name: "Mines", page: "./mines.html" },
  nonogram: { name: "Nonogram", page: "./nonogram.html" },
  hitori: { name: "Cull", page: "./hitori.html" },
  slitherlink: { name: "Portolan", page: "./slitherlink.html" },
  masyu: { name: "Pearl", page: "./masyu.html" },
  nurikabe: { name: "Dujiang", page: "./nurikabe.html" },
  asterism: { name: "Asterism", page: "./asterism.html" },
  lanterns: { name: "Lanterns", page: "./lanterns.html" },
  moor: { name: "Moor", page: "./moor.html" },
  bridges: { name: "Bridges", page: "./bridges.html" },
  bulls: { name: "Conjunction", page: "./bulls.html" },
  assay: { name: "Assay", page: "./assay.html" },
  yield: { name: "Fathom", page: "./yield.html" },
  speedmaths: { name: "Speed maths", page: "./speedmaths.html" },
  isomer: { name: "Isomer", page: "./isomer.html" },
  ladder: { name: "Ladder", page: "./ladder.html" },
  lode: { name: "Lode", page: "./lode.html" },
  lots: { name: "Lots", page: "./lots.html" },
  codeword: { name: "Codeword", page: "./codeword.html" },
  "codeword-split": { name: "Codeword", page: "./codeword.html" },   // its split key's table, on a branch of its own
  crossword: { name: "Crossword", page: "./crossword.html" },
  acrostic: { name: "Acrostic", page: "./acrostic.html" },
  calcudoku: { name: "Calcudoku", page: "./calcudoku.html" },
  kakuro: { name: "Tally", page: "./kakuro.html" },
};

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I or O, so codes can't be misread as 1 or 0
const newCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
const rootPath = code => `crates/rooms/${code}`;
export const branchPath = (code, game) => `${rootPath(code)}/${game}`;

/** The room code in this page's address, if any (games keep ?room=CODE there while you're in a room). */
export const roomInAddress = () => {
  const c = (new URLSearchParams(location.search).get("room") || "").toUpperCase().replace(/[^A-Z]/g, "");
  return c.length === 4 ? c : null;
};
/** The mark's words while the room in the address is joined: a party's table, or the pair's match. */
export const joiningWords = () => (new URLSearchParams(location.search).has("party") ? "Joining the table" : "Joining your partner");

/** An older room in the shared layout, or null if it isn't a room we know. */
function lift(cur) {
  if (cur.suite) return cur;
  if (cur.game === "glyph") {
    const { game, ...glyph } = cur;
    return { suite: 1, created: cur.created || Date.now(), owner: cur.owner || null, glyph };
  }
  if (cur.v === 3) return { suite: 1, created: cur.created || Date.now(), owner: cur.owner || null, crates: cur };
  // A pair's room (suite.js) is in this layout from the start, though nothing marks it: a partner code is just a code
  // until the pair's pages fill it (live, ask…). Asking for "suite" alone turned away a new pair's every first match.
  if (["live", "ask", "best", "watch", "duo", "here"].some(k => k in cur)) return cur;
  return null;
}

/** The value at a path, read once: a listener's first answer (the server's, unless this page holds it already). */
function readOnce(sync, path) {
  return new Promise((resolve, reject) => {
    let done = false;
    const stop = sync.watch(path, v => {
      if (done) return;
      done = true;
      resolve(v ?? null);
      setTimeout(() => stop?.(), 0);             // not from inside its own callback
    }, e => { if (!done) { done = true; reject(e); } });
  });
}

/**
 * Opens a room by code: its contents (lifted into the shared layout if older), or null if there's none. It's read,
 * not run as a transaction: a transaction on the whole room took two round trips at least, and was run again for every
 * write anywhere in it meanwhile (each page saying where it is), which on a slow connection made joining slow. Only an
 * older room is written, lifted in a transaction so two devices can't both lift it.
 */
export async function openRoom(sync, code) {
  const cur = await readOnce(sync, rootPath(code));
  if (cur === null) return null;
  const found = lift(cur);
  if (!found || found === cur) return found;
  let lifted = null;
  await sync.tx(rootPath(code), c => {
    lifted = null;
    if (c === null) return null;                 // cache cold: let the server hand us the real room
    lifted = lift(c);
    return lifted && lifted !== c ? lifted : undefined;
  });
  return lifted;
}

/**
 * What a game needs of a room to sit down in it, { suite, ask, [game] }, read as those three alone: the whole room
 * holds every game's branch and what each of you has open (mirrored for watching), far more than a join needs. A room
 * with none of them is an older one, or none: that's opened whole (openRoom).
 */
export async function openBranch(sync, code, game) {
  const [suite, ask, branch] = await Promise.all([readOnce(sync, `${rootPath(code)}/suite`), readOnce(sync, `${rootPath(code)}/ask`), readOnce(sync, branchPath(code, game))]);
  if (suite === null && ask === null && branch === null) return openRoom(sync, code);
  return { ...(suite !== null ? { suite } : {}), ...(ask !== null ? { ask } : {}), ...(branch !== null ? { [game]: branch } : {}) };
}

/** Starts a new room holding this game's state; returns its code, or null if no free code turned up. */
export async function createRoom(sync, game, state) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const r = await sync.tx(rootPath(code), cur => (cur === null
      ? { suite: 1, created: Date.now(), owner: sync.uid, [game]: state } : undefined));
    if (r.committed) return code;
  }
  return null;
}

/**
 * Marks this person as here, in this game, and follows where everyone is: onHere gets
 * { uid: { game, name, online, pid } }. Each page holds its own session, so switching games can't leave you
 * marked offline by the page you just closed. pid, the player's id (playerId in suite.js), tells your other
 * devices from your partner. Returns a stop function.
 */
export function enterRoom(sync, code, game, name, onHere, pid = null) {
  const me = `${rootPath(code)}/here/${sync.uid}`;
  sync.update(me, pid ? { game, name, pid } : { game, name });
  const sid = Math.random().toString(36).slice(2, 10);
  const stopSession = sync.session?.(`${me}/sessions/${sid}`);
  const unwatch = sync.watch(`${rootPath(code)}/here`, val => {
    const out = {};
    for (const [id, h] of Object.entries(val || {})) {
      // online while any page of theirs holds a session: the database drops the empty list a sleeping phone leaves,
      // so no sessions at all is away (it read as online, and a table waited for a phone that had gone to sleep)
      if (h?.game) out[id] = { game: h.game, name: h.name, online: Object.keys(h.sessions || {}).length > 0, pid: h.pid || null };
    }
    onHere(out);
  }, () => {});
  return () => { unwatch?.(); stopSession?.(); };
}

/** Leaves the room for good (every game): you're no longer shown as here. */
export function leaveRoom(sync, code) {
  return sync.update(`${rootPath(code)}/here/${sync.uid}`, { game: null, name: null });
}

/** The address of a game, carrying the room code when you're in one. */
export function gameHref(game) {
  const code = roomInAddress();
  return GAMES[game].page + (code ? `?room=${code}` : "");
}

/**
 * Someone else in the room, as far as "here" knows: { id, name, game, online } or null. Given your player id, your
 * own other devices aren't someone else; a page open now comes before one left open, and one in `game` (yours)
 * before one elsewhere, so a page your partner left open in another game doesn't hide them sitting across from you.
 */
export function otherHere(here, uid, pid = null, game = null) {
  const others = Object.entries(here || {}).filter(([id, h]) => h && id !== uid && !(pid && h.pid === pid));
  others.sort(([, a], [, b]) => (b.online === true) - (a.online === true) || (game ? (b.game === game) - (a.game === game) : 0));
  return others.length ? { id: others[0][0], ...others[0][1] } : null;
}

/** The seated players in a game's state: [id, player] (leftovers from devices that handed a seat over are skipped). */
export const seatsOf = data => Object.entries(data?.players || {}).filter(([, p]) => p && p.slot != null);

// ---------- a table of four (Tribute, Hong): the pair across from each other, a party's others between them ----------
const FOUR = [0, 2, 1, 3];
/** The seat of whoever sat down slot-th (their slot): the first two across from each other, the next two between. */
export const seatOfSlot = slot => FOUR[slot] ?? 0;
/** The seats kept for people at a table dealt for so many: a pair's two, a party's three or four. */
export const peopleSeats = people => FOUR.slice(0, Math.min(4, Math.max(2, Number(people) || 2)));
/** Whether another device moves the computer players: one whose player sat down before this one's, and is here. */
export function runsElsewhere(state, uid) {
  const here = seatsOf(state).filter(([, p]) => p.online !== false).sort((a, b) => a[1].slot - b[1].slot);
  return here.length > 0 && here[0][0] !== uid;
}

/**
 * A game's state with one player's id swapped for another's, everywhere it appears (seat, log entries,
 * who named or opened what): carrying on as that player on a new device.
 */
export function reseat(state, from, to) {
  return JSON.parse(JSON.stringify(state).split(JSON.stringify(from)).join(JSON.stringify(to)));
}

/**
 * Sitting down in a game's state, inside the joining transaction: the state to write, or undefined to leave it as
 * it is (it isn't this game's, or every seat is someone else's). A seat belongs to a device (its id, uid) and to the
 * player on it (pid, the player's id, the same on all their devices), so a player always gets their own seat back,
 * moves and all, on whichever device they come in on; then the lowest free seat; then `takeover`, the seat chosen
 * when all were taken (pickSeat). `initial` is a new table: there's none yet, or it's for `asked` (the request the
 * pair just said yes to) and the table here is older (whichever of you arrives first deals it, the others sit down at
 * it), or the state here isn't one this game can read. `slots`: how many seats people have, two for a pair; or a
 * function of the state (Tribute and Hong seat up to four, as many as the party that asked).
 */
export function sitDown(cur, { uid, pid = null, name }, { initial = null, asked = null, takeover = null, valid = () => true, slots = 2 } = {}) {
  if (cur === null) return initial;          // none yet; without a table to deal, null makes Firebase ask the server
  if (initial && ((asked && cur.asked !== asked) || !valid(cur))) return initial;
  if (!valid(cur)) return undefined;
  const players = Object.fromEntries(seatsOf(cur));
  const mine = players[uid] ? uid
    : Object.keys(players).find(id => pid && players[id].pid === pid) ?? (takeover && players[takeover] ? takeover : null);
  const me = { name, ...(pid ? { pid } : {}), online: true };
  if (mine) {
    const next = mine === uid ? { ...cur, players } : reseat({ ...cur, players }, mine, uid);
    next.players[uid] = { ...next.players[uid], ...me };
    return next;
  }
  const taken = Object.values(players).map(p => p.slot);
  if (taken.length >= (typeof slots === "function" ? slots(cur) : slots)) return undefined;
  let slot = 0;
  while (taken.includes(slot)) slot++;
  return { ...cur, players: { ...players, [uid]: { ...me, slot } } };
}

/**
 * When every seat is taken: asks which player to carry on as (for example after moving from laptop to
 * phone). seats is [[id, { name, online }]]. Resolves to the chosen id, or null.
 */
export function pickSeat(seats) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-label", "Take over a seat");
  dlg.innerHTML = `<div class="pick-head"><h2>${["Two", "Three", "Four", "Five", "Six"][seats.length - 2] ?? seats.length} players already</h2><button class="btn" type="button" data-cancel>Cancel</button></div>
    <p class="stats">Carry on as one of them, for example after switching from your laptop to your phone. Their other device leaves the game.</p>
    <div class="seat-list"></div>`;
  const list = dlg.querySelector(".seat-list");
  let chosen = null;
  for (const [id, p] of seats) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn wide";
    b.textContent = `Continue as ${p.name}${p.online === false ? " (away)" : ""}`;
    b.addEventListener("click", () => { chosen = id; dlg.close(); });
    list.appendChild(b);
  }
  document.body.appendChild(dlg);
  return new Promise(resolve => {
    dlg.querySelector("[data-cancel]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { dlg.remove(); resolve(chosen); }, { once: true });
    dlg.showModal();
  });
}
