// Crates' learning mode as the games screen's Choose sheet keeps it (learning-mode.js). No imports: solo.js and the sheet
// both read it, and a test loads it in Node.
/** Crates' modes, in the order the sheet shows them (learn.js's MODES, labelled). */
export const CRATES_MODES = [["off", "Off"], ["learn", "Learn"], ["norepeat", "No repeats"], ["clues", "Clue learn"]];
/** Where Crates' mode is kept. Its run (crates:v2) holds it too, but that key isn't synced between devices on its own and
 *  isn't Crates' to write from the games screen; solo.js takes this one over when it starts or a newer run arrives. */
export const CRATES_KEY = "crates:mode";

const valid = m => CRATES_MODES.some(([k]) => k === m);

/** Crates' mode now: the key, else what its run on this device has, else Off. */
export function cratesMode() {
  try {
    const kept = localStorage.getItem(CRATES_KEY);
    if (valid(kept)) return kept;
    const run = JSON.parse(localStorage.getItem("crates:v2"));
    if (valid(run?.mode)) return run.mode;
  } catch { /* private mode, or no run yet */ }
  return "off";
}
export function setCratesMode(m) {
  if (!valid(m)) return;
  try { localStorage.setItem(CRATES_KEY, m); } catch { /* private mode */ }
}
