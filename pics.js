// Pictures for the banks: a painting, a landmark, a person, named by its English Wikipedia page title. The page's
// lead image comes from Wikipedia at display time (the app stays small and offline-capable; the service worker keeps
// every picture it has fetched). Nothing is stored here but the mapping of titles to URLs.
//
// Wikimedia only serves thumbnails at a fixed ladder of widths (since 2026; a URL built by hand with any other width
// is refused with HTTP 400, which is how every picture here once went blank). So the width asked for is rounded up to
// the next step, and the URL comes from Wikipedia's own API rather than being built by hand; if a thumbnail is
// refused anyway, the original file is the fallback, and only then does the picture hide.
const STEPS = [120, 250, 330, 500, 960, 1280, 1920];
const step = width => STEPS.find(s => s >= width) ?? STEPS[STEPS.length - 1];
// pageimages gives a page's lead image as its thumbnail at the size asked (rounded up to a step) and its original;
// pilicense=any includes images Wikipedia uses under fair use (most 20th-century paintings); origin=* allows the call
const API = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=pageimages&piprop=thumbnail|original&pilicense=any";
// a picture can also be named by its file ("File:Kirchner - Mountain Landscape from Clavadel.jpg"), for one whose page
// has no image of it, or none PageImages will pick (it skips one wider than 3:1, and takes a museum's logo when it comes
// first): imageinfo gives that file's thumbnail at the width asked, and its original
const FILE_API = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=imageinfo&iiprop=url";
const KEY = "pics:v2";                 // { "title@width": { t: thumbnail, o: original } | null (the page has no image) }
// Settings' "Keep pictures offline" keeps every picture the games show at this width, in the service worker's cache
// of pictures (sw.js names it the same): a quarter of the bytes of the 960 pixels Punt and Quote ask for, and offline
// a game asking for any width gets this copy
export const OFFLINE_WIDTH = 500;
const CACHE = "crates-pics-2";
/** The copy kept for offline play: the picture's addresses at OFFLINE_WIDTH, if they're known. */
const keptCopy = title => load()[`${title}@${OFFLINE_WIDTH}`] ?? null;
let urls = null;
function load() { if (!urls) { try { urls = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { urls = {}; } } return urls; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(urls)); } catch { /* private mode */ } }
try { if (localStorage.getItem("pics:urls") !== null) localStorage.removeItem("pics:urls"); } catch { /* private mode */ }   // the old cache held refused widths and failures

// A weak connection can leave a request hanging for a minute, the question beside it asking about "this" with nothing
// there. So once the address of the size asked for hasn't come in LOOKUP_MS, the 500-pixel copy's is used if it's known
// (Settings keeps that copy on the device; it's smaller to fetch if not), as is that copy itself once the image asked
// for hasn't come in LOAD_MS, if it's on the device; with neither, the picture is given up after GIVE_UP_MS and the
// question names the thing instead (askedWith). A lookup given up on carries on, and its answer is remembered.
const LOOKUP_MS = 2500, LOAD_MS = 4000, GIVE_UP_MS = 10000;
const later = ms => new Promise(resolve => setTimeout(resolve, ms));
const lookups = new Map();             // "title@width" -> its lookup, while it's on its way
/** A page's lead image at about `width` px: { t, o } (thumbnail and original), or null if it has none or can't be reached. */
export async function pictureUrls(title, width = 640) {
  const all = load(), w = step(width), key = `${title}@${w}`;
  if (all[key] !== undefined) return all[key];
  if (all[`${title}@${OFFLINE_WIDTH}`] === null) return null;  // a page without an image has none at any size: no wait
  const kept = keptCopy(title);
  if (navigator.onLine === false) return kept;                 // offline: the copy kept for offline play, if there is one
  if (!lookups.has(key)) lookups.set(key, ask(title, w).finally(() => lookups.delete(key)));
  const answer = lookups.get(key).then(urls => (urls === undefined ? kept : urls));
  return Promise.race([answer, later(kept ? LOOKUP_MS : GIVE_UP_MS).then(() => kept)]);
}
/** Wikipedia's answer for one picture at one width, remembered: { t, o }, or null for a page without an image (or a
 *  file that doesn't exist); undefined when no answer came, so it's asked again next time. */
async function ask(title, w) {
  try {
    const file = title.startsWith("File:");
    const res = await fetch(file ? `${FILE_API}&iiurlwidth=${w}&titles=${encodeURIComponent(title)}` : `${API}&pithumbsize=${w}&titles=${encodeURIComponent(title)}`);
    if (!res.ok) return undefined;
    const page = (await res.json())?.query?.pages?.[0];
    if (!page) return undefined;
    const info = page.imageinfo?.[0];
    const t = (file ? info?.thumburl : page.thumbnail?.source) || null, o = (file ? info?.url : page.original?.source) || null;
    const all = load();
    all[`${title}@${w}`] = t || o ? { t: t || o, o: o || t } : null;
    save();
    return all[`${title}@${w}`];
  } catch { return undefined; }
}
const asked = new WeakMap();           // node -> the latest call that asked it for a picture
let calls = 0;
const unshown = new Set();             // titles whose picture couldn't be shown this session
/**
 * Puts the picture for `title` into `node` (an empty element), with a caption if given; a title of null empties it.
 * Resolves true once the picture shows, false when there's none to show (Wikipedia has no image for the page, or none
 * of its addresses loads: askedWith then names the thing in its question), null when a later call has taken the node
 * over. Only the latest call touches the node: an earlier one still waiting for its address, or its image failing
 * late, once hid the picture the next question had just shown, or put the last one back.
 */
export async function showPicture(node, title, { width = 640, caption = null, alt = "" } = {}) {
  const me = ++calls, mine = () => asked.get(node) === me;
  asked.set(node, me);
  node.hidden = true;
  node.replaceChildren();
  if (!title) return null;
  const urls = await pictureUrls(title, width);
  if (!mine()) return null;
  if (!urls) { unshown.add(title); return false; }
  const img = document.createElement("img");
  img.alt = alt; img.loading = "lazy"; img.decoding = "async"; img.className = "pic";
  // a thumbnail that won't load (refused, or offline and not kept) gives way to the copy kept for offline play, as does
  // one that's slow when that copy is on the device (Settings keeps them all), then to the original file; then the
  // picture hides
  const kept = keptCopy(title)?.t, onDevice = keepingPictures();
  const tries = [...new Set([urls.t, kept, urls.o].filter(Boolean))];
  let at = 0, slow = 0;
  const shown = new Promise(resolve => {
    const wait = () => { if (onDevice && tries[at + 1] === kept) slow = setTimeout(next, LOAD_MS); };
    function next() {
      clearTimeout(slow);
      if (!mine()) return resolve(null);
      if (++at < tries.length) { img.src = tries[at]; wait(); return; }
      node.hidden = true;
      unshown.add(title);
      resolve(false);
    }
    img.addEventListener("load", () => {
      clearTimeout(slow);
      if (!mine()) return resolve(null);
      unshown.delete(title);
      resolve(true);
    });
    img.addEventListener("error", next);
    img.src = tries[0];
    wait();
  });
  node.appendChild(img);
  if (caption) { const c = document.createElement("small"); c.className = "pic-caption"; c.textContent = caption; node.appendChild(c); }
  node.hidden = false;
  return shown;
}
/** The name a picture goes by where its question has none of its own (the build gives most a `title`): its page or
 *  file without "File:", the extension or a disambiguation in brackets ("The Kiss (Klimt)" → "The Kiss"). */
export const pictureName = title => title.replace(/^File:/, "").replace(/\.(jpe?g|png|svg|gif|tiff?|webp)$/i, "").replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, "");
/** A question about "this" picture with the thing named in its place: "The year this was painted" → "The year The
 *  Kiss was painted"; "This building's height, to its tip" → "The Seagram Building's height, to its tip" (a name
 *  that opens the sentence takes a capital: a building's goes "the Seagram Building" mid-sentence). */
export function nameIn(text, name) {
  const opening = name.charAt(0).toUpperCase() + name.slice(1);
  if (/^This \w+'s/i.test(text)) return text.replace(/^This \w+'s/i, `${opening}'s`);
  return text.replace(/\bthis\b/i, m => (m === "This" ? opening : name));
}
/**
 * A question as it's asked beside its picture `pic`: as written while the picture shows (or may yet), naming the thing
 * (`name`, else the picture's own) in place of "this" once it couldn't be shown, so the question can still be
 * answered; but not when the name is among the `answers` offered, which naming it would give away.
 */
export function askedWith(text, pic, name, answers = []) {
  if (!pic || !unshown.has(pic) || !/\bthis\b/i.test(text)) return text;
  const n = (name || pictureName(pic)).trim(), low = n.toLowerCase();
  if (answers.some(a => { const o = String(a).toLowerCase(); return o.length > 3 && (o.includes(low) || low.includes(o)); })) return text;
  return nameIn(text, n);
}
/** Wikipedia's attribution: each picture's file page gives its licence (some Wikipedia uses under fair use). */
export const credit = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

// ---------- every picture, kept offline (Settings) ----------
// The games show a few hundred pictures (pics-list.js, written by the build from kb/): Settings' "Keep pictures offline"
// downloads them all at OFFLINE_WIDTH, straight from Wikipedia to this device (they aren't the app's to hand out: many
// 20th-century paintings are on Wikipedia under fair use). Their addresses are asked fifty at a time and remembered with
// the rest; the images come down four at a time into the service worker's picture cache. What's kept already is
// skipped, so a download cut short (offline, the page closed) carries on where it stopped, and pictures added to the
// games later come down the next time a page opens with it on.
const KEEPING = "suite:pics";          // "on" while this device keeps every picture (a suite: key: this device only)
export const keepingPictures = () => { try { return localStorage.getItem(KEEPING) === "on"; } catch { return false; } };
export function setKeepingPictures(on) { try { if (on) localStorage.setItem(KEEPING, "on"); else localStorage.removeItem(KEEPING); } catch { /* private mode */ } }
const listeners = new Set();
/** Calls f({ kept, total, missing, none, done, offline }) as a download goes (none: pages Wikipedia has no image for);
 *  returns a function that stops listening. */
export const onPictures = f => { listeners.add(f); return () => listeners.delete(f); };
let running = null;
/** Keeps every picture offline (or checks they are): one download at a time, however often it's asked for. */
export const keepPicturesOffline = () => (running ||= keepAll().finally(() => { running = null; }));

/** The addresses of up to fifty pictures at OFFLINE_WIDTH: { title: { t, o } | null (no image) }; throws offline. */
async function lookUp(titles) {
  const found = {};
  for (const file of [false, true]) {
    const list = titles.filter(t => t.startsWith("File:") === file);
    if (!list.length) continue;
    const names = encodeURIComponent(list.join("|"));
    const res = await fetch(file ? `${FILE_API}&iiurlwidth=${OFFLINE_WIDTH}&titles=${names}` : `${API}&pithumbsize=${OFFLINE_WIDTH}&pilimit=50&titles=${names}`);
    if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
    const q = (await res.json())?.query || {};
    // a title as asked may be normalised (an underscore, a first letter) and redirected before it names its page
    const hop = new Map([...(q.normalized || []), ...(q.redirects || [])].map(r => [r.from, r.to]));
    const pages = new Map((q.pages || []).map(p => [p.title, p]));
    for (const title of list) {
      let name = title;
      for (let i = 0; i < 4 && hop.has(name); i++) name = hop.get(name);
      const page = pages.get(name);
      if (!page) continue;                                     // not in the answer: asked again next time
      const info = page.imageinfo?.[0];
      const t = (file ? info?.thumburl : page.thumbnail?.source) || null, o = (file ? info?.url : page.original?.source) || null;
      found[title] = t || o ? { t: t || o, o: o || t } : null;
    }
  }
  return found;
}
/** One image into the cache: asked for with CORS, so it's kept at its own size (an opaque copy, as an <img> fetches it,
 *  counts against the device's storage as if it were megabytes); a host that won't allow that is kept opaque. */
async function fetchInto(cache, url) {
  let res;
  try { res = await fetch(url, { mode: "cors", credentials: "omit" }); }
  catch { res = await fetch(url, { mode: "no-cors", credentials: "omit" }); }
  if (res.type !== "opaque" && !res.ok) return false;
  await cache.put(url, res);
  return true;
}
async function keepAll() {
  if (!keepingPictures()) return { kept: 0, total: 0, missing: 0, none: 0, done: true, offline: false };
  const { PICTURES } = await import("./pics-list.js");
  const all = load(), cache = await caches.open(CACHE), total = PICTURES.length;
  let kept = 0, missing = 0, none = 0;
  const tell = extra => { const p = { kept, total, missing, none, done: false, offline: false, ...extra }; for (const f of listeners) f(p); return p; };
  try {
    // pages and files are different questions to Wikipedia: each kind fifty to a question
    const unknown = PICTURES.filter(t => all[`${t}@${OFFLINE_WIDTH}`] === undefined);
    for (const list of [unknown.filter(t => !t.startsWith("File:")), unknown.filter(t => t.startsWith("File:"))])
      for (let i = 0; i < list.length; i += 50) { Object.assign(all, Object.fromEntries(Object.entries(await lookUp(list.slice(i, i + 50))).map(([t, u]) => [`${t}@${OFFLINE_WIDTH}`, u]))); save(); }
    const queue = [...PICTURES];
    let cut = false;                                             // the connection went: every lane stops
    const lane = async () => {
      while (queue.length && !cut && keepingPictures()) {        // turned off in Settings: it stops
        const urls = all[`${queue.shift()}@${OFFLINE_WIDTH}`];
        try {
          if (urls === undefined) missing++;                     // its address didn't come: next time
          else if (urls === null) none++;                        // Wikipedia has no image for the page: Settings says so
          else if (await cache.match(urls.t, { ignoreVary: true }) || await fetchInto(cache, urls.t)) kept++;
          else missing++;                                        // refused: tried again next time
        } catch { cut = true; return; }
        tell();
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]);
    return tell({ done: true, offline: cut });
  } catch {
    return tell({ done: true, offline: true });                  // offline before the addresses came: next time
  }
}
