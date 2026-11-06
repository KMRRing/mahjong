// Offline play and updates. sw.js keeps every file of every game on the device, so the games open and play
// without a connection (playing together still needs one). sw.js is published by the workflow only when every
// game's test passes, so a broken push never reaches an installed copy. A new version is fetched in the background and waits:
// it takes over when the app goes off screen, and the page reloads onto it when it comes back. Taking over in the
// middle of a game could mix old code with new.
//
// Update (the games screen's button) and reloadFresh (another device is already on a newer version) don't wait for
// that: they compare this device's version with the site's and, when they differ, have the service worker fetch only
// the files that changed (tools/service-worker.js), saying at every stage how far it has got. No wait lasts for ever:
// one that runs out falls back to the full refresh (the stored copy emptied and fetched afresh), and nothing is
// emptied unless the site has just answered.
import "./suite.js";   // the solo code's sync runs on every page
import "./menu.js";    // every game's menu: one popup, laid out the same
import "./flags.js";   // flags drawn as flags where the system shows only their letters
import { busy, progress } from "./loading.js";

// The page is drawn: the mark style.css shows while a page loads (html:not(.ready)) goes. Module scripts have all
// run by DOMContentLoaded, so the game's first render is in.
const drawn = () => document.documentElement.classList.add("ready");
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", drawn, { once: true }); else drawn();
const supported = "serviceWorker" in navigator;
if (supported) navigator.serviceWorker.register("./sw.js").catch(() => {});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** A promise's value, or `late` if it hasn't settled within `ms`. */
const within = (ms, promise, late = null) => Promise.race([promise, sleep(ms).then(() => late)]);
/**
 * The app's service worker registration, or null. Asked of the browser, not awaited from register(): the browser
 * runs a registration's jobs one at a time, so register(), update() and unregister() all wait behind an update
 * installing in the background, which takes minutes on a slow connection, and for ever if a file never comes.
 * That was Update stuck on "Starting the new version": its unregister() waiting on the download it had come to replace.
 */
const registration = () => (supported ? within(3000, navigator.serviceWorker.getRegistration().catch(() => null)).then(r => r || null) : Promise.resolve(null));

let swapped = false;   // a newer version has taken over since this page opened: the page still runs the code it opened with
if (supported) {
  navigator.serviceWorker.addEventListener("controllerchange", () => { swapped = true; });
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) (await registration())?.waiting?.postMessage("take-over");
    else if (swapped) location.reload();
  });
}

const short = version => version.slice(0, 7);
const reason = e => String(e?.message || e);
const STALL = 30000;   // a copy filling with nothing come in for this long has stalled: the connection's gone, or the worker's stuck
let running = false;   // an update under way: a second one asked for meanwhile waits for its reload
let at = 0, said = ""; // how far the update under the mark has got (0 to 1; a fallback carries on from it) and its words
/** Says what the update under the mark is doing; the bar only ever moves on. */
function say(words, to = at) {
  if (words === said && to <= at) return;
  said = words;
  at = Math.max(at, to);
  progress(words, at);
}

/**
 * The site's newest version, read from its sw.js past every cache: { version, files }, or null when the site doesn't
 * answer within 10 s (offline, or something that isn't a sw.js). sw.js is never kept, so this proves the site answers.
 */
async function siteVersion() {
  if (!navigator.onLine) return null;
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 10000);
  try {
    const res = await fetch(`./sw.js?check=${Date.now()}`, { cache: "no-store", signal: stop.signal });
    const text = res.ok ? await res.text() : "";
    const version = text.match(/const VERSION = "(\w+)";/)?.[1], files = text.match(/const FILES = (\{[\s\S]*?\});/)?.[1];
    return version && files ? { version, files: JSON.parse(files) } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
/**
 * A worker's answer (tools/service-worker.js): to "version", { version, files, whole }; to "fill", { ok, error } once
 * its copy is whole. Null if none comes within `ms`: a worker from before it could answer, or one that's stuck.
 */
function ask(worker, type = "version", ms = 3000) {
  if (!worker) return Promise.resolve(null);
  const line = new MessageChannel();
  const answer = new Promise(resolve => { line.port1.onmessage = e => resolve(e.data); });
  try { worker.postMessage({ type }, [line.port2]); } catch { return Promise.resolve(null); }
  return within(ms, answer);
}
/** What the site and this device have: the site's version (null if it doesn't answer), the registration (null with
 *  no service worker), and what the worker in use says of its copy (null if it says nothing). */
async function compare() {
  const device = registration().then(async reg => ({ reg, here: await ask(reg?.active) }));
  const [site, { reg, here }] = await Promise.all([siteVersion(), device]);
  return { site, reg, here };
}

/** The words for a copy filling, from the worker's counts: the files looked for on the device, then the ones
 *  downloading, `missing` when the version in use is made whole (a worker from before those counts says only how
 *  many files are in). */
function filling(m, voice, missing) {
  if (m.checked == null) return voice(`Downloading ${m.done} of ${m.total} files`, 0.1 + 0.8 * m.done / m.total);
  if (m.checked < m.total) return voice(`Looking for files already on this device: ${m.checked} of ${m.total}`, 0.1 + 0.3 * m.checked / m.total);
  const what = `${missing ? "missing " : m.copied ? "changed " : ""}file${m.fetch === 1 ? "" : "s"}`, kept = m.copied ? ` (${m.copied} already on this device)` : "";
  if (m.fetched < m.fetch) {
    const size = m.bytes >= 1e5 ? `, ${(m.bytes / 1e6).toFixed(1)} MB in` : "";
    return voice(`Downloading ${m.fetched} of ${m.fetch} ${what}${size}${kept}`, 0.4 + 0.5 * m.fetched / m.fetch);
  }
  if (missing) return voice(`All ${m.fetch} ${what} downloaded`, 0.9);
  voice(m.fetch ? `All ${m.fetch} ${what} downloaded${kept}: installing` : `All ${m.total} files were already on this device: installing`, 0.9);
}
/**
 * Follows a worker making its copy whole, saying how far it has got from what it tells the pages, until `finished`
 * settles: resolves { ok: true }, or { ok: false, why } when it failed or stalled (nothing in for STALL ms), refused
 * when the site answered a file of its own version with an error.
 */
function watch(finished, voice, missing = false) {
  return new Promise(resolve => {
    let heard = Date.now(), last = null, failure = null, over = false;
    const hear = e => {
      const m = e.data;
      if (m?.type === "failed") failure = m.error;
      if (m?.type !== "filling") return;
      heard = Date.now();
      last = m;
      filling(m, voice, missing);
    };
    const tick = setInterval(() => {
      if (document.hidden) { heard = Date.now(); return; }   // put away mid-download: its time away isn't a stall
      const quiet = Math.round((Date.now() - heard) / 1000), file = last?.pending?.[0];
      if (quiet * 1000 >= STALL) end({ ok: false, why: `The download stalled: nothing came in for ${quiet} seconds` });
      else if (quiet >= 8) voice(`Nothing has come in for ${quiet} seconds${file ? `: still waiting for ${file}` : ""}`);
    }, 1000);
    const end = result => {
      if (over) return;
      over = true;
      clearInterval(tick);
      navigator.serviceWorker.removeEventListener("message", hear);
      resolve(result);
    };
    navigator.serviceWorker.addEventListener("message", hear);
    const what = missing ? "The missing files" : "The new version";
    finished.then(async ok => {
      if (!ok) await sleep(300);                          // the worker's reason can come a moment after its state
      end(ok ? { ok: true } : { ok: false, refused: /: HTTP \d+$/.test(failure || ""),
        why: failure ? `${what} didn't download (${failure})` : `${what} didn't ${missing ? "download" : "install"}` });
    }, e => end({ ok: false, why: reason(e) }));
  });
}
/** True once a worker is installed (or past it), false if it fails. */
const installed = worker => new Promise(resolve => {
  const settle = () => { if (worker.state === "redundant") resolve(false); else if (worker.state !== "installing") resolve(true); };
  worker.addEventListener("statechange", settle);
  settle();
});
/**
 * The worker bringing the site's version: one already waiting with it (downloaded in the background), one installing,
 * or the one the browser starts when asked to look (update()). Why not, in words, if it starts none within 20 s.
 */
async function nextWorker(reg, version) {
  if (reg.waiting && (await ask(reg.waiting))?.version === version) return reg.waiting;
  if (reg.installing) return reg.installing;
  let settled = 0, refused = null;
  reg.update().then(() => { settled = Date.now(); }, e => { settled = Date.now(); refused = e; });
  for (const start = Date.now(); Date.now() - start < 20000; await sleep(100)) {
    if (reg.installing) return reg.installing;
    // the browser found nothing newer than the newest it has: that's the site's version, waiting
    if (settled && Date.now() - settled > 500) return reg.waiting || (refused ? `The browser couldn't fetch the new version (${reason(refused)})` : "The browser found no new version to install");
    const s = Math.floor((Date.now() - start) / 1000);
    if (s >= 3) say(`Waiting for the browser to fetch the new version: ${s} seconds`, 0.08);
  }
  return "The browser didn't start the new version within 20 seconds";
}
/**
 * Under the mark: the site's version through the service worker's own update, which fetches only the files that
 * changed, then a reload onto it; the full refresh if that fails or stalls. Resolves "reloading", or why nothing changed.
 */
async function upgrade({ site, reg, here }, games) {
  const v = short(site.version), total = Object.keys(site.files).length;
  if (!reg) return refresh("This device keeps no offline copy", games, true);
  if (here) {
    const changed = Object.keys(site.files).filter(f => here.files?.[f] !== site.files[f]).length;
    say(`Version ${v} is on the site, this device has ${short(here.version)}: ${changed} of ${total} files changed`, 0.06);
  } else say(`Version ${v} is on the site`, 0.06);
  await sleep(1000);                                      // the stages after it can pass in a blink: this one is read
  for (let round = 1; ; round++) {
    const next = await nextWorker(reg, site.version);
    if (typeof next === "string") return refresh(next, games);
    if (next.state === "installing") {
      const r = await watch(installed(next), say);
      // the site refusing a file of its own version (a push under way, an outage): the full refresh couldn't install
      // that version either, and would leave this device with no offline copy until the site is whole again
      if (r.refused) return `${r.why}, so this device stays on ${here ? `version ${short(here.version)}` : "the version it has"}`;
      if (!r.ok) return refresh(r.why, games);
    } else say(`Version ${v} had already downloaded in the background`, 0.9);
    const got = (await ask(next))?.version;
    // a version pushed earlier can be the one that was installing: the site's comes after it
    if (!got || got === site.version || round === 3) return switchTo(next, got || site.version, games);
    say(`That was version ${short(got)}, from before ${v}: fetching ${v} too`);
  }
}
/** Lets the new version take over, and reloads onto it. */
async function switchTo(worker, version, games) {
  say(`Switching to version ${short(version)}`, 0.95);
  if (worker.state === "installed") {
    const taken = new Promise(resolve => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(true), { once: true });
      worker.addEventListener("statechange", () => { if (worker.state === "activated") resolve(true); });
    });
    worker.postMessage("take-over");
    if (!await within(8000, taken, false)) say("The new version hasn't said it has taken over: reloading anyway");
  }
  return reload(games);
}
/** Reloads the page (onto the games screen, when Update was pressed there). */
function reload(games) {
  say("Reloading", 0.99);
  if (games) try { sessionStorage.setItem("crates:games", "1"); } catch { /* private mode */ }
  location.reload();
  return "reloading";
}
/**
 * The full refresh, when the service worker's own update fails or stalls: the stored copy emptied (not Wikipedia's
 * pictures: they aren't the app, and may have been kept offline on purpose), the service worker removed, this page's
 * own files fetched past the browser's cache, and a reload, so the page comes up from the site and installs the
 * newest version from scratch. Nothing is emptied unless the site answers right then, or the device could be left
 * with no app at all; and no stage waits on the browser for more than a few seconds. Resolves "reloading", or why
 * nothing changed.
 */
async function refresh(why, games, checked = false) {
  say(`${why}: refreshing everything instead`);
  await sleep(1500);                                        // long enough to read why
  if (!checked) {
    say("Checking the site still answers");
    if (!await siteVersion()) return "The site stopped answering, so nothing changed";
  }
  const stored = "caches" in window ? (await within(3000, caches.keys().catch(() => []), [])).filter(k => !k.startsWith("crates-pics")) : [];
  if (stored.length) {
    say("Clearing the stored copy", at + 0.02);
    for (const key of stored) await within(3000, caches.delete(key).catch(() => false));
  }
  const regs = supported ? await within(3000, navigator.serviceWorker.getRegistrations().catch(() => []), []) : [];
  if (regs.length) {
    say("Removing the old version", at + 0.02);
    // an unregister waits behind an install still running; the reload needn't, since with the copy gone the old
    // version can only pass the page's requests on to the site
    if (!await within(3000, Promise.all(regs.map(r => r.unregister())).catch(() => []), false)) say("The old version is still busy: carrying on without it");
  }
  const own = performance.getEntriesByType("resource").map(e => e.name).filter(u => u.startsWith(location.origin) && !u.includes("/sw.js"));
  await fetchAll([...new Set([location.href.split("#")[0], ...own])]);
  return reload(games);
}
/** Runs `job` on each of `items`, six at a time. */
async function lanes(items, job) {
  let next = 0;
  const lane = async () => { while (next < items.length) await job(items[next++]); };
  await Promise.all(Array.from({ length: 6 }, lane));
}
/** Fetches this page's files past the browser's own copies, saying how many are in; one that takes more than 15 s
 *  is left to the reload, which asks for it again. */
async function fetchAll(urls) {
  const from = at;
  let n = 0;
  await lanes(urls, async u => {
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 15000);
    await fetch(u, { cache: "reload", signal: stop.signal }).then(r => r.arrayBuffer()).catch(() => null);
    clearTimeout(timer);
    say(`Downloading ${++n} of ${urls.length} files`, from + (0.97 - from) * n / urls.length);
  });
}

/**
 * The Update button. Compares this device's version with the site's, saying what it finds through `tell(words,
 * waiting)` (a line on the games screen): up to date or offline, nothing changes. A newer version downloads under
 * the mark (`before` runs first: the games screen closes, so the mark shows over the page), only the files that
 * changed, and the page reloads onto it: resolves true. Resolves false when nothing changed, `tell` having said why.
 * Saves, stats, settings and Wikipedia's pictures are never touched.
 */
export async function hardUpdate({ before = () => {}, tell = () => {} } = {}) {
  if (running) return false;
  running = true;
  let done = null;
  try {
    tell("Checking the site for a new version", true);
    const now = await compare(), { site, reg, here } = now;
    if (!site) {
      tell(navigator.onLine ? "The site didn't answer, so nothing changed. Try again in a moment." : "No connection, so nothing changed.");
      return false;
    }
    const v = short(site.version);
    let broken = null;
    if (here?.version === site.version) {
      if (here.whole && swapped) { tell(`Version ${v} took over since this page opened: reloading onto it`, true); reload(true); return true; }
      if (here.whole) { tell(`Codex is up to date: version ${v}.`); return false; }
      // the site's version, missing files here (it took over offline): only those are fetched, and nothing reloads
      tell(`Version ${v} is missing files on this device: fetching them`, true);
      const r = await watch(ask(reg.active, "fill", 30 * 60000).then(a => !!a?.ok), words => tell(words, true), true);
      if (r.ok) { tell(`Codex is up to date: version ${v}, its missing files fetched.`); return false; }
      if (r.refused) { tell(`${r.why}, so nothing changed.`); return false; }   // as for a new version (upgrade)
      broken = r.why;
    }
    before();
    done = busy("Updating Codex", { delay: 0 });          // until the reload replaces the page
    at = 0; said = "";
    const outcome = broken ? await refresh(broken, true) : await upgrade(now, true);
    if (outcome === "reloading") return true;
    done();
    tell(`${outcome}.`);
    return false;
  } catch (e) {
    console.error(e);
    done?.();
    tell(`The update went wrong (${reason(e)}), so nothing changed.`);
    return false;
  } finally { running = false; }
}

/**
 * Loads the newest version right away (another device is already on it): Update's comparison and download, under the
 * mark from the start, always ending in a reload (onto the same version when there's nothing newer to be had).
 */
export async function reloadFresh() {
  if (running) return;
  running = true;
  busy("Updating Codex", { delay: 0 });                   // until the reload replaces the page
  at = 0; said = "";
  say("Checking the site for a new version", 0.02);
  let outcome;
  try {
    const now = await compare();
    outcome = !now.site ? "Couldn't reach the site" : now.here?.version === now.site.version ? "This device has the newest version" : await upgrade(now, false);
  } catch (e) { console.error(e); outcome = "The update went wrong"; }
  if (outcome !== "reloading") { say(`${outcome}: reloading`, 0.98); location.reload(); }
}

// A double tap must never zoom the page: the viewport is capped at scale 1 and every element is touch-action:
// manipulation, and this catches whatever is left (a double tap that reaches the document as a dblclick).
document.addEventListener("dblclick", e => { if (!e.target.closest("input, textarea, select, [contenteditable]")) e.preventDefault(); }, { passive: false });
