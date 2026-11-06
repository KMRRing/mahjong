// Where a party's phones go (its own module, so a game's page in a party follows the host without loading Party's
// games): the lobby, or the game the host chose, { id, kind, page, at, who, max } in the party's branch as `playing`.
// A table game sits down at the table in the party's room; a duo match goes in as a request the two said yes to
// (?new=). Either carries the party's code and the choice's time (?party=CODE&at=…), which no page strips from its
// address, so the page knows whose choice it is and follows the host from there (party-link.js). A party of two opened
// to play one board together (coop-request.js, docs/coop.md) adds &coop=1: its game's page is the party, and ends it.

/** Who was in the party when the game started (the database may hand a list back as an object). */
export const whoOf = playing => Object.values(playing?.who || {});
/** Whether a phone goes to the game the host chose: everyone in the party when it started; one who came after only
 *  to a table game with a seat the computer has. */
export const joins = (playing, uid) => !!playing && (whoOf(playing).includes(uid)
  || (playing.kind === "table" && whoOf(playing).length < (playing.max || 0)));

/** The address of the party's choice (null: its lobby). */
export function playHref(playing, code) {
  if (!playing) return `party.html?table=${code}`;
  const party = `party=${code}&at=${playing.at}`;
  if (playing.kind === "duo") return `${playing.page}?room=${code}&new=${playing.at}&${party}${playing.coop ? "&coop=1" : ""}`;
  return `${playing.page}?table=${code}&${party}`;
}
