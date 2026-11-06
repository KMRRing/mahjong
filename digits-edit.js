// The digit grid's entries, pure (no DOM): what a player has written in each cell, a digit or pencil marks, and the
// undo and redo of it, kept as plain JSON so a game saves it with its run (and a partner watching sees it). Every game
// on the digit grid (digits.js) uses it: Nonet, Calcudoku, Tally. A cell holds a value 1..k, 0 when it's empty (the
// board shows value v as its v-th digit, so a grid of 0..5 can have a 0 in it); its notes are a bit mask, bit v for
// value v.
//
//   const e = freshEntries(81);
//   write(e, cell, 5, { clear: peersOf(cell) });   // writes 5 (again on a 5 rubs it out); 5 leaves its peers' notes
//   pencil(e, cell, 3);                            // a pencil mark for 3, on or off
//   rub(e, cell);                                  // the digit goes, else the notes
//   undo(e); redo(e);                              // one move back, one on
// Each call is one move (a write and the notes it cleared undo together) and returns whether anything changed.

const KEEP = 300;                                    // moves kept for undo

export function freshEntries(cells) {
  return { v: new Array(cells).fill(0), n: new Array(cells).fill(0), past: [], future: [] };
}
/** Whether a saved set of entries is whole for a grid of `cells` (anything else is started afresh). */
export function validEntries(e, cells) {
  return !!e && Array.isArray(e.v) && Array.isArray(e.n) && e.v.length === cells && e.n.length === cells && Array.isArray(e.past) && Array.isArray(e.future)
    && e.v.every(Number.isInteger) && e.n.every(Number.isInteger);
}

/** Applies a move's cells (each [cell, v, n]) and records it, the old values kept to undo it with. */
function move(e, changes) {
  const rec = [];
  for (const [c, v, n] of changes) {
    if (e.v[c] === v && e.n[c] === n) continue;
    rec.push(c, e.v[c], e.n[c], v, n);
    e.v[c] = v; e.n[c] = n;
  }
  if (!rec.length) return false;
  e.past.push(rec);
  if (e.past.length > KEEP) e.past.splice(0, e.past.length - KEEP);
  e.future.length = 0;
  return true;
}

/** Writes digit d in a cell, or rubs it out if d is already there. clear: cells whose pencil mark for d goes with it. */
export function write(e, cell, d, { clear = [] } = {}) {
  if (e.v[cell] === d) return move(e, [[cell, 0, e.n[cell]]]);
  const b = 1 << d, changes = [[cell, d, e.n[cell]]];
  for (const c of clear) if (c !== cell && (e.n[c] & b)) changes.push([c, e.v[c], e.n[c] & ~b]);
  return move(e, changes);
}
/** A pencil mark for d in a cell, on or off; a cell with a digit in it takes none. */
export function pencil(e, cell, d) {
  if (e.v[cell]) return false;
  return move(e, [[cell, 0, e.n[cell] ^ (1 << d)]]);
}
/** Rubs out a cell: its digit, or if it has none, its pencil marks. */
export function rub(e, cell) {
  if (e.v[cell]) return move(e, [[cell, 0, e.n[cell]]]);
  return move(e, [[cell, 0, 0]]);
}
/** Pencil marks for many cells at once, as one move: notes is { cell: mask }. */
export function fill(e, notes) {
  return move(e, Object.entries(notes).map(([c, m]) => [Number(c), e.v[c], e.v[c] ? e.n[c] : m]));
}
/** Several cells set at once, as one move: [[cell, digit, notes]] (a hint's digit, a partner's, a restart). */
export function set(e, changes) { return move(e, changes); }

export function undo(e) {
  const rec = e.past.pop();
  if (!rec) return false;
  for (let i = rec.length - 5; i >= 0; i -= 5) { e.v[rec[i]] = rec[i + 1]; e.n[rec[i]] = rec[i + 2]; }
  e.future.push(rec);
  return true;
}
export function redo(e) {
  const rec = e.future.pop();
  if (!rec) return false;
  for (let i = 0; i < rec.length; i += 5) { e.v[rec[i]] = rec[i + 3]; e.n[rec[i]] = rec[i + 4]; }
  e.past.push(rec);
  return true;
}
/** The cells of the last move undo would take back (to show where it was), or []. */
export const lastMoved = e => { const rec = e.past.at(-1) || []; const out = []; for (let i = 0; i < rec.length; i += 5) out.push(rec[i]); return out; };

/** The cells whose digit is repeated in one of these units (each a list of cells): what a game marks as a conflict. */
export function repeats(values, units) {
  const out = new Set();
  for (const u of units) {
    const at = new Map();
    for (const c of u) {
      const d = values[c];
      if (!d) continue;
      if (at.has(d)) { out.add(c); out.add(at.get(d)); } else at.set(d, c);
    }
  }
  return out;
}
