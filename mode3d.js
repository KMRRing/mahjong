// The suite's 2D / 3D default (Korbi, 4 November 2026: a main-menu setting "2D mode (battery saver)" sets the default for
// every game; a choice made inside one game is still remembered for that game). Settings key: `settings:flat`.
// A game keeps its own view choice under its own `<game>:` key and writes it ONLY when the player picks one; with none stored it
// asks defaultIs3D() for the default. Never write the default into the game's key, or the setting stops reaching it.
const KEY = "settings:flat";
export const flatMode = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setFlatMode = on => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ } dispatchEvent(new Event("settings:flat")); };
// a partner's watching frame (suite.js's IN_FRAME: ?watch and ?frame) draws flat whatever the setting: many small copies of a page
const watchingFrame = () => { try { const q = new URLSearchParams(location.search); return q.has("watch") && q.has("frame"); } catch { return false; } };
export const defaultIs3D = () => !flatMode() && !watchingFrame();
/** Whether a game draws 3D: the player's own choice if one is kept (`kept` is the stored text, `yes` the value(s) meaning 3D), else the suite's default. */
export const wants3D = (kept, ...yes) => (kept == null || kept === "" ? defaultIs3D() : yes.includes(kept));
/** `fn(is3D)` when the setting changes, so a game open under the Settings dialog follows it live (call only for a game with no choice of its own kept). Returns the stop. */
export const onDefaultChange = fn => { const h = () => fn(defaultIs3D()); addEventListener("settings:flat", h); return () => removeEventListener("settings:flat", h); };
