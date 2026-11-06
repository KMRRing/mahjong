// Bigger screens, for the sizes a game sets in script (style.css, "Bigger screens", does the rest). A phone held upright
// is the design; a tablet held upright draws it larger by growing the root's font size, and a screen held sideways
// puts a game's parts beside its board (#app.beside). A board sized in script needs both to know.

/** The query every stylesheet uses for the side-by-side layout: kept in one place so script and styles agree. */
export const SIDEWAYS = "(orientation: landscape) and (min-width: 700px)";
/** True while the page is laid out side by side. */
export const sideways = () => matchMedia(SIDEWAYS).matches;
/** How large the page is drawn: a rem's pixels over the 16 a phone has (1 on a phone, about 1.46 on an upright iPad).
 *  A size set in script in pixels is multiplied by it, so it grows with everything around it. */
export const scale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
