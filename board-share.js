// One board, two people editing it (docs/coop.md). No page in this file, so tests/board-share.mjs plays two editors
// against the database in memory.
//
// A shared board is what a game keeps in its room's branch (together.js, `board`):
//   { fixed: {…}, layers: { name: "one character a cell" }, tally?: { name: { id: 1 } }, once?: { name: value }, start?: {…}, rev }
//   fixed   what never changes while the board is shared (the puzzle); the game's own shape, JSON.
//   layers  the marks people make, one string a layer, a character a cell. Strings, since the database keeps no empty
//           list and reads a list back with holes; a string is whole or it is not there. Most classic boards are one layer
//           (Circuit's edges), some two (a cell's colour and its notes).
//   tally   counts that only grow (hints taken): a set of ids, so adding the same one twice counts once.
//   once    values the first writer sets and nobody changes (the time it was solved in).
//   rev     the number of edits applied: how an editor knows its own edit has come back to it.
//
// People change a board by edits, never by writing the board: a small list of operations applied inside the room's
// transaction on the board as it is then, so two edits at once to different cells both stand. An edit is a list of
//   { layer, i, from, to, weak? }   cell i of a layer was `from` where the editor made the change and is to be `to`
//   { add, id }                      the id added to a tally
//   { once, value }                  a value set if nobody has set it
// and the cell rule is `merge`, a three-way merge of one character: nobody else changed the cell, take the edit; the
// editor's change is already there, nothing to do; both changed it differently, the later edit wins (it is the one being
// applied) unless it is `weak`, an undo, which only puts back what it finds as it left it.
//
// A game may add rules (the `rules` argument everywhere): merge(layer, base, mine, theirs, weak) for a cell rule of its
// own, and frozen(board), true once cell edits no longer count (a solved board: a tap that was already on its way
// must not undo the solve).

/** One cell's three-way merge: `base` is what the editor saw, `mine` what they made it, `theirs` what is there now. */
export function merge(base, mine, theirs, prefer = "mine") {
  if (mine === base) return theirs;                         // the edit changes nothing here
  if (theirs === base || mine === theirs) return mine;      // nobody else touched it, or they made the same change
  return prefer === "theirs" ? theirs : mine;               // both changed it, differently
}

const at = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
/** The rule for one layer: the game's own (rules.merge(layer, base, mine, theirs, weak)) or `merge`. */
const cellRule = rules => (layer, base, mine, theirs, weak) => rules?.merge?.(layer, base, mine, theirs, weak) ?? merge(base, mine, theirs, weak ? "theirs" : "mine");

export const cellEdit = (layer, i, from, to, weak = false) => ({ layer, i, from, to, ...(weak ? { weak: true } : {}) });
export const tallyEdit = (add, id) => ({ add, id });
export const onceEdit = (once, value) => ({ once, value });

/** Whole layers merged cell by cell: a device back with its own copy of a board that moved on while it was away. */
export function mergeLayers(base, mine, theirs, rules = null) {
  const rule = cellRule(rules), out = {};
  for (const name of Object.keys(theirs || {})) {
    const t = theirs[name], b = base?.[name], m = mine?.[name];
    out[name] = typeof b === "string" && typeof m === "string" && b.length === t.length && m.length === t.length
      ? Array.from(t, (ch, i) => rule(name, b[i], m[i], ch, false)).join("") : t;   // a board of another shape is theirs
  }
  return out;
}

/** The cell edits that take the layers `base` to `mine` (what a device did while it could not send). */
export function diff(base, mine) {
  const edits = [];
  for (const name of Object.keys(mine || {})) {
    const b = base?.[name], m = mine[name];
    if (typeof b !== "string" || typeof m !== "string" || b.length !== m.length) continue;
    for (let i = 0; i < m.length; i++) if (b[i] !== m[i]) edits.push(cellEdit(name, i, b[i], m[i]));
  }
  return edits;
}

/** Applies edits to a board in place, by the rules above; true if anything changed. Unknown layers and cells outside a layer are passed over. */
export function apply(board, edits, rules = null) {
  const rule = cellRule(rules);
  let changed = false;
  for (const e of [].concat(edits)) {
    if (e.layer != null) {
      const s = board.layers?.[e.layer];
      if (rules?.frozen?.(board)) continue;
      if (typeof s !== "string" || !Number.isInteger(e.i) || e.i < 0 || e.i >= s.length) continue;
      const next = rule(e.layer, e.from, e.to, s[e.i], !!e.weak);
      if (next !== s[e.i]) { board.layers[e.layer] = at(s, e.i, next); changed = true; }
    } else if (e.add != null) {
      board.tally ||= {};
      board.tally[e.add] ||= {};
      if (!board.tally[e.add][e.id]) { board.tally[e.add][e.id] = 1; changed = true; }
    } else if (e.once != null) {
      board.once ||= {};
      if (!(e.once in board.once)) { board.once[e.once] = e.value; changed = true; }
    }
  }
  return changed;
}

/** The count of a tally. */
export const tallyOf = (board, name) => Object.keys(board?.tally?.[name] || {}).length;
/** A once-value, or undefined. */
export const onceOf = (board, name) => board?.once?.[name];
/** A board as a copy to change. */
export const copyBoard = board => structuredClone(board);

/**
 * Inside the room's transaction (`g` is the room's state, changed in place): the edit applied to its board, and its
 * revision up by one even when nothing changed, so the editor that sent it always hears it has come in. Returns the
 * revision, or null if the room has no board.
 */
export function commit(g, edits, rules = null) {
  if (!g?.board) return null;
  apply(g.board, edits, rules);
  g.board.rev = (g.board.rev || 0) + 1;
  return g.board.rev;
}

/** Whether a room state holds a board this module can work on. */
export const validBoard = g => !!g && g.v === 1 && !!g.board && typeof g.board === "object" && !!g.board.layers
  && Object.values(g.board.layers).every(s => typeof s === "string" && s.length > 0);

/** A shared board from the host's (`share`: { fixed, layers, start? }), its revision at nothing and its start marked with the time. */
export const boardOf = (share, now = Date.now()) => ({ fixed: share.fixed, layers: { ...share.layers }, start: { at: now, ...(share.start || {}) }, rev: 0 });

/**
 * A new room around a board: the host's board to start from, the players seated (together.js deals this when the first
 * of them arrives), the host's player id (who keeps the board afterwards), and whatever else the room should carry
 * (`extra`: the two names, for the bar before the second phone has sat down).
 */
export function newRoom(share, { players, host, app = 1, people = 2, now = Date.now(), extra = {} }) {
  return { v: 1, app, created: now, host, people, players, ...extra, board: boardOf(share, now) };
}

/**
 * A board two people edit from one device each, optimistically: an edit shows at once, goes to the room in a
 * transaction, and what shows is always the room's board with the edits not yet in it laid on top, so a partner's edit
 * arriving between your tap and its landing neither undoes yours nor is lost. Edits that could not be sent (the phone
 * dropped off) wait and go when it is back, merged with what happened meanwhile by the same rules.
 *
 *   send(edits)  puts a batch in the room's transaction; resolves the revision it became, or null if it did not go
 *   onView(board)  a new board to draw
 * hear(board) gives it the room's latest board; edit(edits) a change made here; retry() when the connection is back.
 */
export function createEditor({ board, send, rules = null, onView = () => {}, retryMs = 1500 }) {
  let room = board, view = board, pending = [], flight = null, landed = [], timer = null, down = false;
  const rev = () => room?.rev || 0;
  function lay() {
    view = copyBoard(room);
    for (const edits of [...landed.map(l => l.edits), ...(flight ? [flight] : []), pending]) apply(view, edits, rules);
    onView(view);
  }
  async function flush() {
    if (flight || !pending.length || down) return;
    flight = pending;
    pending = [];
    let got = null;
    try { got = await send(flight); } catch { got = null; }
    const sent = flight;
    flight = null;
    if (got == null || got === false) {                      // not sent: they wait, ahead of what came after
      pending = [...sent, ...pending];
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; flush(); }, retryMs);
    } else if (got > rev()) landed.push({ rev: got, edits: sent });   // landed, and the room's next board will say so
    lay();
    if (pending.length && got != null && got !== false) flush();
  }
  return {
    get view() { return view; },
    get room() { return room; },
    /** Edits made here and not yet in the room's board (sent or waiting). */
    get unsent() { return pending.length + (flight ? flight.length : 0); },
    hear(next) {
      if (!next) return;
      room = next;
      landed = landed.filter(l => l.rev > rev());
      lay();
      flush();
    },
    edit(edits) {
      const list = [].concat(edits);
      if (!list.length) return;
      pending.push(...list);
      lay();
      flush();
    },
    retry() { clearTimeout(timer); timer = null; flush(); },
    /** Settles when nothing is waiting or in flight (for tests). */
    async idle() { for (let i = 0; i < 200 && (flight || pending.length); i++) await new Promise(r => setTimeout(r, 5)); },
    /** Holds sending while the phone is known to be offline (edits keep showing and wait), and lets it go again. */
    pause(on) { down = !!on; if (!down) flush(); },
  };
}
