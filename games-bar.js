// The games screen's finding (docs/the-games-screen.md; games-find.js has the rules): a star on every tile, and a search and
// a filter that come down above the list when you pull it down from its very top, stay when you let go, and go away when you
// scroll down. The bar sits above the list's own scroller, not in it: it takes its room by shrinking the list, so the
// page never scrolls and closing it moves nothing under your finger (an iPhone has no scroll anchoring: a bar in the
// list's content that collapsed while you were lower down would jump the tiles).
import { favourites, setFavourite, listing, FAV, FAVOURITES, PLAYERS, searchable, shows, nothing, pulls } from "./games-find.js";

const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.3l2.6 5.5 6 .8-4.4 4.2 1.1 5.9L12 16.8l-5.3 2.9 1.1-5.9-4.4-4.2 6-.8z"/></svg>`;
/** A tile's star: beside the tile's link, not in it (a button can't be inside a link). */
export const starButton = app => `<button class="app-star" type="button" data-star="${app.id}" aria-pressed="false" aria-label="Favourite ${app.name}">${STAR}</button>`;

const ICON = {
  find: `<svg class="find-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>`,
  chev: `<svg class="find-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 4.4 6 7.8l3.4-3.4"/></svg>`,
};
const option = ([value, text]) => `<option value="${value}">${text}</option>`;
const HIDE_AFTER = 400;      // ms a bar that has just come down ignores "scrolled down": the end of the pull's own bounce

/**
 * Draws the stars and the Favourites they make, and the search and the filter, on the games screen `dlg` (apps.js builds the
 * tiles: `li.app-tile` in `ul.apps-grid` in `li.apps-group[data-sec]`, each with its star button; the Favourites group is
 * made here, above the sections). A starred tile is moved into it from its section, so it is on the screen once.
 */
export function bindFind({ dlg, list, apps, sections }) {
  const tileApps = apps.filter(a => a.sec), ids = tileApps.map(a => a.id), byId = new Map(tileApps.map(a => [a.id, a]));
  const found = new Map(tileApps.map(a => [a.id, searchable(a, sections)]));
  const items = new Map([...list.querySelectorAll(".app-tile")].map(li => [li.dataset.id, li]));
  const favGroup = document.createElement("li");
  favGroup.className = "apps-group apps-favs";
  favGroup.dataset.sec = FAVOURITES;
  favGroup.hidden = true;                 // there is no Favourites while nothing is starred
  favGroup.innerHTML = `<h3 class="apps-sec">${STAR.replace("<svg", '<svg class="apps-sec-star"')}Favourites</h3><ul class="apps-grid"></ul>`;
  list.prepend(favGroup);
  const groups = new Map([...list.querySelectorAll(".apps-group")].map(g => [g.dataset.sec, g]));
  const inner = dlg.querySelector(".apps-inner");
  let want = { query: "", section: "", count: "" }, open = false, shownAt = 0, settling = false;

  const bar = document.createElement("div");
  bar.className = "apps-find";
  bar.setAttribute("role", "search");
  bar.inert = true;                       // out of sight, out of the tab order and the reading order until it's down
  bar.innerHTML = `<div class="apps-find-in"><div class="find-body">
      <label class="find-field">${ICON.find}<input type="search" placeholder="Search games" aria-label="Search games" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="find-x" type="button" aria-label="Clear the search" hidden>${ICON.clear}</button></label>
      <span class="find-pick"><select aria-label="Section">${[["", "All sections"], ...sections.filter(([id]) => tileApps.some(a => a.sec === id))].map(option).join("")}</select>${ICON.chev}</span>
      <span class="find-pick"><select aria-label="Players">${PLAYERS.map(option).join("")}</select>${ICON.chev}</span>
    </div></div>`;
  list.before(bar);
  const input = bar.querySelector("input"), clear = bar.querySelector(".find-x"), [bySection, byCount] = bar.querySelectorAll("select");
  const none = document.createElement("li");
  none.className = "apps-none";
  none.setAttribute("role", "status");
  none.hidden = true;
  none.innerHTML = `<p></p><button class="link" type="button">Clear the search and filters</button>`;
  list.append(none);

  /** The tiles as the stars, the search and the filter leave them: the starred in Favourites, the rest in their sections, those
   *  the search and filter don't match hidden (a filter by section means a game's own section, wherever the game shows). */
  function draw() {
    const favs = favourites(ids);
    let any = false;
    favGroup.hidden = true;               // until its list below has a game to show
    for (const { id: sec, apps: games } of listing(tileApps, sections, favs)) {
      const group = groups.get(sec), grid = group.querySelector(".apps-grid"), ordered = games.map(a => items.get(a.id));
      if (grid.children.length !== ordered.length || ordered.some((li, i) => grid.children[i] !== li)) grid.append(...ordered);   // moved only when something changed
      let shown = 0;
      for (const li of ordered) {
        const id = li.dataset.id, show = shows(byId.get(id), found.get(id), want);
        li.hidden = !show;
        li.querySelector(".app-star").setAttribute("aria-pressed", String(favs.has(id)));
        if (show) shown++;
      }
      group.hidden = !shown;
      any ||= !!shown;
    }
    none.hidden = any;
    if (!any) none.firstElementChild.textContent = nothing(want, sections);
    clear.hidden = !input.value;
    input.parentElement.classList.toggle("set", !!want.query.trim());
    bySection.parentElement.classList.toggle("set", !!want.section);
    byCount.parentElement.classList.toggle("set", !!want.count);
  }
  const filtered = () => !!(want.query.trim() || want.section || want.count);
  function change() {
    want = { query: input.value, section: bySection.value, count: byCount.value };
    draw();
    list.scrollTop = 0;                  // new results are read from their top
  }
  function reset() {
    input.value = ""; bySection.value = ""; byCount.value = "";
    want = { query: "", section: "", count: "" };
    draw();
  }

  // ---- the bar: down on a pull from the top, away on a scroll down (a search or filter in force keeps it) ----
  function show({ focus = false } = {}) {
    if (!open) { open = true; shownAt = performance.now(); bar.inert = false; bar.classList.add("on"); }
    if (focus || matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });   // a phone's keyboard waits for a tap
  }
  function hide() {
    if (!open) return;
    open = false;
    bar.inert = true;
    bar.classList.remove("on");
    if (bar.contains(document.activeElement)) document.activeElement.blur();
  }
  const act = kind => {
    if (kind === "pull") show();
    else if (kind === "push" && open && !filtered() && performance.now() - shownAt > HIDE_AFTER) hide();
  };
  const pull = pulls();
  inner.addEventListener("wheel", e => act(pull.wheel(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? inner.clientHeight : 1), list.scrollTop, e.timeStamp)), { passive: true });   // lines and pages as pixels
  inner.addEventListener("touchstart", e => {
    if (e.touches.length === 1 && !bar.contains(e.target)) pull.touchStart(e.touches[0].clientY, list.scrollTop); else pull.touchEnd();
  }, { passive: true });
  inner.addEventListener("touchmove", e => { if (e.touches.length === 1) act(pull.touchMove(e.touches[0].clientY, list.scrollTop)); }, { passive: true });
  for (const end of ["touchend", "touchcancel"]) inner.addEventListener(end, () => pull.touchEnd(), { passive: true });
  list.addEventListener("scroll", () => { if (list.scrollTop > 12 && !settling) act("push"); }, { passive: true });   // the keyboard, a scroll bar
  dlg.addEventListener("keydown", e => {                // a keyboard has no pull: "/" brings the bar down
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); show({ focus: true }); }
  });

  input.addEventListener("input", change);
  bySection.addEventListener("change", change);
  byCount.addEventListener("change", change);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") input.blur();
    else if (e.key === "Escape" && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; change(); }   // the first Escape clears, it doesn't close the screen
  });
  clear.addEventListener("click", () => { input.value = ""; change(); input.focus({ preventScroll: true }); });
  none.querySelector("button").addEventListener("click", () => { reset(); list.scrollTop = 0; });
  dlg.addEventListener("close", () => { reset(); hide(); });     // the next visit starts with the whole list

  // ---- stars: the tile slides into Favourites, or back to its section ----
  const rects = () => new Map([...list.querySelectorAll(".app-tile:not([hidden])")].map(li => [li, li.getBoundingClientRect()]));
  const within = (r, box) => r.bottom > box.top && r.top < box.bottom;
  list.addEventListener("click", e => {
    const star = e.target.closest(".app-star");
    if (!star) return;
    e.preventDefault();
    e.stopPropagation();
    const box = list.getBoundingClientRect(), before = rects(), moving = items.get(star.dataset.star);
    // The place you are reading stays put: a tile in view other than the one that moves holds still on the screen while the
    // Favourites group above grows or goes. At the very top there is nothing to hold still against: the group opens there.
    const anchor = [...before].find(([li, r]) => li !== moving && within(r, box));
    setFavourite(star.dataset.star, star.getAttribute("aria-pressed") !== "true");
    draw();
    if (anchor && list.scrollTop > 0) {
      settling = true;
      list.scrollTop += anchor[0].getBoundingClientRect().top - anchor[1].top;
      setTimeout(() => { settling = false; }, 150);                    // that scroll isn't the person's: it doesn't put the bar away
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      for (const [tile, was] of before) {
        const now = tile.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
        if ((dx || dy) && (within(now, box) || within(was, box))) tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 220, easing: "ease-out" });
      }
    star.focus({ preventScroll: true });                               // the node moved: the focus follows it
  });
  // the stars from another device (suite.js pulls them in), another tab, or a page that comes back from the cache
  addEventListener("suite:pulled", draw);
  addEventListener("storage", e => { if (!e.key || e.key.startsWith(FAV)) draw(); });
  addEventListener("pageshow", draw);
  draw();
  return { show, hide, reset };
}
