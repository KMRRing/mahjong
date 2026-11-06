// What Deck covers (README, Deck, "Scope"): the games and the topics a review draws from. The games screen's Deck button and
// Deck's own review both ask it, so a card out of scope is neither counted as due nor dealt. Pure rules, tested in Node
// (tests/deck-scope.mjs); deck-row.js is the page's side and keeps the choice on this device (suite:deck).
//
// The choice is kept as what's taken OUT, as Random's is: a game or a topic that arrives later is covered, as everything is
// at first. A topic is a subject of the knowledge base (kb-index.js: Countries, Paintings, Law…), named by its label, which
// outlives a rebuild of the base where its number does not.
//
// A card is covered when its game is in and, if it is about things the knowledge base knows, at least one of them has a
// subject that is in. One of a card's subjects being out doesn't take it out while another is in: Mona Lisa is a Painting
// and Leonardo a Painter, and a card about both is still asked when only one of those is covered. A card about nothing in
// the base (a word, a puzzle, a number) follows its game alone.

/** A game or a topic, as kept: the ones taken out, by id (a game) or label (a topic), without duplicates. */
const idsOf = v => [...new Set((Array.isArray(v) ? v : []).filter(x => typeof x === "string" && x))];

/** The scope a device kept (anything unreadable is the whole deck): { games: [out ids], subjects: [out labels] }. */
export function scopeOf(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { games: idsOf(r.games), subjects: idsOf(r.subjects) };
}
/** What to keep: null when everything is covered (the key goes, so the device is as a new one). */
export function keptScope(scope) {
  const s = scopeOf(scope);
  return s.games.length || s.subjects.length ? s : null;
}
/** Everything covered. */
export const whole = scope => !scopeOf(scope).games.length && !scopeOf(scope).subjects.length;

/**
 * Whether a pile item is covered. `subjectOf(entity)` gives an entity's subject label or undefined; it can be left out
 * (null) when no topic is out, and an item is then judged by its game alone.
 */
export function covers(scope, item, subjectOf = null) {
  const s = scopeOf(scope);
  if (s.games.includes(item.game)) return false;
  if (!s.subjects.length || !subjectOf || !item.about?.length) return true;
  const labels = item.about.map(subjectOf).filter(Boolean);
  return !labels.length || labels.some(l => !s.subjects.includes(l));
}
/** The items a scope covers, in their order. */
export const inScope = (items, scope, subjectOf = null) => items.filter(it => covers(scope, it, subjectOf));

/**
 * A review under way after the scope changed (Deck's page, with the sheet opened from its menu): what was answered stays,
 * since it's counted; the card on show goes if it's out and not yet answered; every card still to come that the scope no
 * longer covers goes. `at` is the card on show, `answered` whether it has been. Its index doesn't move: what leaves is
 * the card on show (the next one slides into its place, `replaced`) or lies after it. `dropped` is how many went.
 */
export function revised(items, at, answered, scope, subjectOf = null) {
  const shown = items[at], keepShown = !shown || answered || covers(scope, shown, subjectOf);
  const out = [...items.slice(0, at), ...(shown && keepShown ? [shown] : []), ...inScope(items.slice(at + 1), scope, subjectOf)];
  return { items: out, at, dropped: items.length - out.length, replaced: !!shown && !keepShown };
}

/** The topics a scope can be set on: those the pile has something about, and any already out (so none is stuck out
 *  unseen), in the order of `labels` (the base's own). */
export function topicsOf(items, labels, scope, subjectOf) {
  const seen = new Set(scopeOf(scope).subjects);
  for (const it of items) for (const id of it.about || []) { const l = subjectOf(id); if (l) seen.add(l); }
  return labels.filter(l => seen.has(l));
}
/** A game or topic taken out or put back: the scope with `out` of `kind` ("games" | "subjects") now the given list. */
export function withOut(scope, kind, out) {
  return { ...scopeOf(scope), [kind]: idsOf(out) };
}
/** The scope after the ticks of one kind change: `all` is every id on offer for the kind, `ticked` the ones covered.
 *  Ids not on offer (a game that has left the list) keep whatever they were. */
export function afterTicks(scope, kind, all, ticked) {
  const kept = scopeOf(scope)[kind].filter(x => !all.includes(x));
  return withOut(scope, kind, [...kept, ...all.filter(x => !ticked.includes(x))]);
}
/** In words, for the sheet's status line. */
export function sayScope(scope) {
  const s = scopeOf(scope), n = (k, one, many) => k ? `${k} ${k === 1 ? one : many}` : "";
  const out = [n(s.games.length, "game", "games"), n(s.subjects.length, "topic", "topics")].filter(Boolean);
  return out.length ? `Left out: ${out.join(" and ")}.` : "Everything: every game and every topic.";
}

/**
 * A review asked for by the address (the games screen's Deck button: #review; the Ledger's "Review this": #review&topic=Law,
 * or #topic=Law): { review, topic }. A topic, by its label, is a one-off scope for that review only: every game, just the
 * cards about that topic. It is never kept (suite:deck is the device's own choice) and a card about nothing in the base is out of it.
 */
export function asked(hash) {
  const parts = String(hash || "").replace(/^#/, "").split("&");
  let topic = null;
  for (const p of parts) if (p.startsWith("topic=")) { try { topic = decodeURIComponent(p.slice(6)) || null; } catch { /* a broken escape names no topic */ } }
  return { review: topic != null || parts.includes("review"), topic };
}
/** The address that asks for a review of a topic: what the Ledger links to. */
export const topicAddress = label => `#review&topic=${encodeURIComponent(label)}`;
/** The items about a topic (by label): any of their entities has that subject. */
export const aboutTopic = (items, label, subjectOf) => items.filter(it => it.about?.some(id => subjectOf(id) === label));
