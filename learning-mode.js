// The learning modes' one home: the games screen's Choose sheet (docs/learning-modes.md). No game's own menu sets one.
// Two kinds: the piles' mode (pile.js, one for Chart, Crossword, Deck, Nexus, Nonogram, Punt and Quote: it sets what they
// deal from the review piles) and Crates' own (learn.js: its cards and the clues it has seen live in its run).
// Kept free of the clue bank, so the games screen can show it without loading Crates (crates-mode.js has Crates' key).
import { choice, line } from "./menu.js";
import * as pile from "./pile.js";
import { CRATES_MODES, cratesMode, setCratesMode } from "./crates-mode.js";

/** The sheet's Learning side: `into` is the pane's element. Both choices write as they're tapped. */
export function learningPane(into) {
  into.replaceChildren(
    choice("Most games", pile.MODES, pile.mode(), pile.setMode),
    line("Chart, Crossword, Deck, Nexus, Nonogram, Punt, Quote"),
    choice("Crates", CRATES_MODES, cratesMode(), setCratesMode),
    line("Crates keeps its own cards. A change starts with its next board."));
}
