// Loading, in the instruments' style. A page or a long task (dealing a board, fetching a run, updating) shows the
// Codex mark, large in the middle of the screen, its movement turning; a short wait inside a line or a box (a lookup, a
// reconnect, a partner on their way) shows the tiny mark, before its words (`waitMark()`, loader-small.svg). The large
// one is nine stacked pictures that theme.js puts in every page and style.css turns on the GPU (mark/*.svg), over the
// overlay style.css draws (html.busy body::after), so a page needs nothing in its markup.
//
// A task with stages (connecting, finding a table, taking a seat, downloading an update) also says where it has got
// to: progress(words, at) puts the stage's words under the mark's and a bar filling under them (body::before), so a
// wait of several seconds never looks stuck. Whatever does the stage says it (net.js and sync.js while the game
// server connects, together.js and table-ui.js while a table is joined, pwa.js while an update downloads), so every
// game's joining shows it without code of its own; with no task under way it says nothing.

let held = 0;
let step = { text: "", at: 0 };       // the stage the task under way is on, and how far along it is (0 to 1)
let reader = null;                    // a line only a screen reader sees, read out as the stages change

/**
 * Shows the mark over the page, with `label` under it, until the returned function is called; `delay` (ms) keeps a
 * task that finishes quickly from flashing it (0 shows it at once). Calls nest: the mark goes when the last one is
 * done, whichever put it up. A task that takes the mark over from another starts its stages afresh (an update taking
 * over from a join counts its own); one that shows after its delay keeps what it said meanwhile.
 */
export function busy(label = "", { delay = 120 } = {}) {
  held++;
  let done = false;
  const root = document.documentElement;
  const show = () => {
    if (done) return;
    if (root.classList.contains("busy")) step = { text: "", at: 0 };
    document.body.dataset.busy = label;
    root.classList.add("busy");
    draw();
    say(step.text ? `${label}: ${step.text}` : label);
  };
  // a page opened to join others shows the mark from its first moment (theme.js: html.joining); a wait it puts up
  // before it's drawn takes over at once, or the mark would go as the page became ready and come back a moment later
  const joining = root.classList.contains("joining") && !root.classList.contains("ready");
  const timer = delay > 0 && !joining ? setTimeout(show, delay) : null;
  if (!timer) show();
  return () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (--held > 0) return;
    root.classList.remove("busy");
    delete document.body.dataset.busy;
    step = { text: "", at: 0 };
    draw();
  };
}
/**
 * The stage a task under way is on: words for it, and how far along the whole task is (0 to 1; the bar only ever
 * moves on, so a stage that comes round again can't set it back). Nothing while no task is under way.
 */
export function progress(text, at = null) {
  if (!held) return;
  if (text != null) step.text = text;
  if (at != null) step.at = Math.max(step.at, Math.min(1, Math.max(0, at)));
  if (!document.documentElement.classList.contains("busy")) return;     // shown once the mark is (after its delay)
  draw();
  if (text) say(text);
}
function draw() {
  const b = document.body;
  if (!b) return;
  if (step.text) b.dataset.busyStep = step.text; else delete b.dataset.busyStep;
  if (step.text || step.at) b.style.setProperty("--busy-at", `${Math.round(step.at * 1000) / 10}%`);
  else b.style.removeProperty("--busy-at");
}
function say(text) {
  if (!reader) {
    reader = document.createElement("p");
    reader.setAttribute("role", "status");
    reader.setAttribute("aria-live", "polite");
    reader.style.cssText = "position:fixed;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    document.body.append(reader);
  }
  reader.textContent = text;
}
/** Runs `task` (a promise or a function returning one) with the mark showing; resolves with its result. */
export async function whileBusy(label, task) {
  const done = busy(label);
  try { return await (typeof task === "function" ? task() : task); } finally { done(); }
}
/** The tiny turning mark, to put before a line's words while it waits. */
export function waitMark() {
  const i = document.createElement("i");
  i.className = "ld";
  i.setAttribute("aria-hidden", "true");
  return i;
}
/** The old name, kept until branches written before the rename have merged. */
export const sextant = waitMark;
