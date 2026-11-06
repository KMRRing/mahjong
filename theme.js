// Codex's look, chosen on the games screen (More, Settings): Codex (the default; day or night, following the phone unless
// set) or Office (night only, whatever the phone says). A plain script in every page's head, so the look is set before the
// page draws and never flashes the wrong one; and, being the first thing every page runs, where a page that plays with
// others starts connecting.
(function () {
  try {
    var t = localStorage.getItem("suite:theme"), m = localStorage.getItem("suite:mode");
    // Modern and Kontor are gone: a device that still has one saved becomes Codex
    if (t && t !== "office") { try { localStorage.removeItem("suite:theme"); } catch (e) { /* ignore */ } t = null; }
    if (t === "office") { document.documentElement.dataset.theme = "office"; document.documentElement.dataset.mode = "night"; }
    else if (m === "day" || m === "night") document.documentElement.dataset.mode = m;
  } catch (e) { /* private mode: Codex, following the phone */ }
})();
// The loader's mark, large (style.css, .cx-load): nine pictures stacked, each moving part its own layer, put in here so it
// is there from the page's first moment and turns on the GPU, whatever the page's own thread is busy with. It shows
// (style.css) only while a page loads or a task runs, and only once every picture has come, so it never draws half a mark.
(function () {
  // The layers turn by CSS (style.css), and CSS has left them still three ways: Reduce Motion, or a stylesheet from before
  // the mark was exempted from it, switches CSS animation off; and on an iPhone a layer in a box that is shown, hidden and
  // shown again sometimes stays still (seen opening Party, and not every time). So the page turns each layer itself as
  // well, by script (Web Animations: on the GPU too, at the same speeds, and what is painted is this one, which no style
  // rule reaches), starting it afresh each time the box comes into view, the page returns from the back/forward cache or
  // the app from the background. Seconds a turn as in style.css, and the direction (tests/mark.mjs checks they agree).
  var TURN = { a: [3000, "normal"], r: [6000, "reverse"], b: [1500, "reverse"], d: [1500, "reverse"] };
  function keepTurning(box) {
    var imgs = Array.prototype.slice.call(box.querySelectorAll("img.m")), shown = false;
    function start() {
      if (!box.offsetWidth) return;                       // hidden: nothing to turn
      imgs.forEach(function (img) {
        if (!img.animate) return;
        if (img.turn) img.turn.cancel();
        var t = TURN[img.className.split(" ")[1]];
        img.turn = img.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: t[0], iterations: Infinity, direction: t[1] });
      });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { var now = box.offsetWidth > 0; if (now && !shown) start(); shown = now; }).observe(box);
    addEventListener("pageshow", start);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    start();
  }
  // [file, what turns it: a the great wheel, r the ring, b and d the pinions, "" nothing]; the order is the stacking.
  var layers = [["mark/base.svg", ""], ["mark/bar-ring.svg", "r"], ["mark/ring.svg", "r"], ["mark/pin-b.svg", "b"], ["mark/pin-d.svg", "d"], ["mark/great.svg", "a"], ["mark/fixed.svg", ""], ["mark/top.svg", ""], ["mark/bar-great.svg", "a"]];
  var box = document.createElement("div"), left = layers.length;
  box.className = "cx-load"; box.setAttribute("aria-hidden", "true");
  layers.forEach(function (l) {
    var img = new Image();
    img.alt = ""; img.draggable = false; if (l[1]) img.className = "m " + l[1];
    img.onload = img.onerror = function () { if (--left === 0) { box.className += " on"; keepTurning(box); } };
    img.src = l[0];
    box.appendChild(img);
  });
  document.documentElement.appendChild(box);
})();
// A page opened to play with others (a table, a room or a party in its address) starts reaching the game server here,
// in its first moment, while the rest of the page loads, rather than once the game asks: connecting is most of the
// wait to sit down, and from far away (Asia to the database in Belgium) each of its round trips is a quarter second.
// The page's own modules get the same connection (net.js keeps it). Not in the frames that watch a partner's game.
if (/[?&](?:table|room|party)=/.test(location.search) && !/[?&]frame\b/.test(location.search)) {
  import("./net.js").then(function (m) { return m.getSync(); }).catch(function () { /* the game reports it when it asks */ });
  // and it says what it's doing from its first moment, while its own files load, before anything of it has run: the
  // mark's words and a bar (style.css, html.joining), the page's own words taking over once it runs (loading.js)
  (function () {
    var root = document.documentElement, q = location.search, page = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
    var say = page === "party" ? "Joining the party" : /[?&]party=/.test(q) ? "Joining the table" : "Joining your partner";
    root.classList.add("joining");
    root.style.setProperty("--busy-say", JSON.stringify(say));
    root.style.setProperty("--busy-step", JSON.stringify(page === "party" ? "Loading the party" : "Loading the game"));
  })();
}
// What went wrong, on the screen (5 November 2026: on Korbi's iPhone many games opened to an empty board and froze, and
// nothing of it showed in a desktop browser). A script that fails to load or throws is written in a small box at the foot of
// the page, and kept in suite:fault; a page that never reached its fifth second (frozen, then closed) is named on the next
// page opened. suite: keys stay on the device. Harmless errors (ResizeObserver's loop notice, a cancelled fetch) are skipped.
(function () {
  var KEY = "suite:fault", OPEN = "suite:opening", page = (location.pathname.split("/").pop() || "index.html") + location.search;
  if (/[?&]frame\b/.test(location.search)) return;                       // a partner's watching frame: its own page says it
  var box = null;
  function show(text) {
    try {
      if (!document.body) { addEventListener("DOMContentLoaded", function () { show(text); }); return; }
      if (!box) {
        box = document.createElement("div");
        box.setAttribute("role", "alert");
        box.style.cssText = "position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:2147483647;max-height:40vh;overflow:auto;" +
          "background:#2a1412;color:#f6e7df;border:1px solid #E8806F;border-radius:6px;padding:8px 10px;font:12px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word";
        box.addEventListener("click", function () { box.remove(); box = null; });
        document.body.appendChild(box);
      }
      box.textContent += (box.textContent ? "\n" : "") + text;
    } catch (e) { /* nowhere to say it */ }
  }
  function keep(text) {
    try { localStorage.setItem(KEY, JSON.stringify({ page: page, at: Date.now(), text: String(text).slice(0, 600) })); } catch (e) { /* private mode */ }
    show(text + "  (tap to close)");
  }
  var harmless = /ResizeObserver loop|AbortError|The operation was aborted|Load failed$/;
  addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {                         // a script, stylesheet or module that didn't load
      if (t.tagName === "SCRIPT" || (t.tagName === "LINK" && t.rel === "modulepreload")) keep("Didn't load: " + (t.src || t.href).split("/").pop());
      return;
    }
    var msg = e.message || (e.error && e.error.message) || "error";
    if (harmless.test(msg)) return;
    keep(msg + (e.filename ? "\n  at " + e.filename.split("/").pop() + ":" + e.lineno + ":" + e.colno : ""));
  }, true);
  addEventListener("unhandledrejection", function (e) {
    var r = e.reason, msg = r && (r.message || String(r)) || "rejected";
    if (harmless.test(msg)) return;
    var at = r && r.stack ? String(r.stack).split("\n").filter(function (l) { return /\.js/.test(l); })[0] || "" : "";
    keep("Unhandled: " + msg + (at ? "\n  at " + at.replace(/^.*\//, "").replace(/\)$/, "") : ""));
  });
  try {
    var was = JSON.parse(localStorage.getItem(OPEN) || "null");
    if (was && Date.now() - was.at < 864e5) {
      var f = JSON.parse(localStorage.getItem(KEY) || "null");
      show("Last time, " + was.page + " never finished opening (frozen?)." + (f && f.page === was.page ? "\nIts error: " + f.text : "") + "  (tap to close)");
    }
    localStorage.setItem(OPEN, JSON.stringify({ page: page, at: Date.now() }));
    var done = function () { try { localStorage.removeItem(OPEN); } catch (e) { /* ignore */ } };
    setTimeout(done, 5000);
    addEventListener("pagehide", done);                                  // left in time: not a freeze
  } catch (e) { /* private mode */ }
})();
