// Loads the Firebase connection once, on first need (together mode, or a synced solo run). A page in an offline party
// (lan.html: no internet) runs in a frame of the page that holds the phones' links, and gets its database from there
// instead: the host phone's, answering the same calls the same way (lan.js). While the connection is being made it says
// how far it has got (loading.js: progress), so a page joining a game shows it under the mark; a page that asks while
// the connection is already on its way (theme.js starts it early on a page opened to join others) picks it up there.
import { progress } from "./loading.js";

let promise = null;
let stage = null;            // where the connection has got to while it's being made ({ text, at }); null once made
/** The offline party round this page, or null: what lan.html offers its frame (connect, invite, leave, host). */
export const lan = (() => { try { return window.parent !== window ? window.parent.__lan || null : null; } catch { return null; } })();
/** The connection's stage (sync.js says each as it gets there); nothing once it's made. */
export function connecting(text, at) {
  stage = text ? { text, at } : null;
  if (stage) progress(text, at);
}
export function getSync() {
  if (window.__cratesSync) return Promise.resolve(window.__cratesSync);   // test harness
  if (!promise) {
    connecting(lan ? "Reaching the host's phone" : "Connecting to the game server", 0.15);
    promise = (lan ? lan.connect(window) : import("./sync.js").then(m => m.connect()))
      .then(sync => { connecting(null); return sync; }, e => { connecting(null); throw e; });
  } else if (stage) progress(stage.text, stage.at);
  return promise;
}
