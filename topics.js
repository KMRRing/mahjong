// A mix of topics, as every game that deals from the knowledge base deals it: each of the game's own topics 0 (out), 1
// (in) or 2 (more), kept as a mix. Since 2 November 2026 no game has a control for it: Settings holds one set of subjects,
// each on or off (SUBJECTS, below), a game maps its topics to them (TOPIC_OF) and derives its mix when it deals
// (mixFromSubjects); the 0, 1, 2 mixes are what old links and saved runs still carry. These are the pieces the games share,
// pure: a mix made whole, which preset it is, and a seeded draw by weight. A game's topics are a list of [id, label];
// its presets { id: { label, topics } }.

/** A mix as kept (anything: an old save, a link), made whole for a list of topics: each 0, 1 or 2 (one it doesn't
 *  know, in). */
export function cleanMix(list, saved) {
  const out = {};
  for (const [id] of list) { const w = Number(saved?.[id]); out[id] = w === 0 || w === 1 || w === 2 ? w : 1; }
  return out;
}
/** The preset a mix is (its id), or "custom": your own. */
export const presetOf = (list, presets, w) =>
  Object.keys(presets).find(k => list.every(([id]) => (w?.[id] ?? 1) === (presets[k].topics[id] ?? 1))) || "custom";
/** Whether a mix has every topic of a list in, and none more: the game deals as it did before it had topics. */
export const even = (list, w) => !w || list.every(([id]) => (w[id] ?? 1) === 1);
/** Whether a mix has any topic in at all (a link's, mistyped, may have none; the menu always keeps one). */
export const anyIn = (list, w) => list.some(([id]) => (w?.[id] ?? 1) > 0);
/** k of the items drawn by weight from a seeded r(), none put back: a weight of 2 twice as likely as 1, 0 never. */
export function drawWeighted(r, items, weightOf, k = items.length) {
  const left = items.map(x => ({ x, w: weightOf(x) })).filter(o => o.w > 0), out = [];
  while (out.length < k && left.length) {
    let t = r() * left.reduce((a, o) => a + o.w, 0), i = 0;
    while (i < left.length - 1 && (t -= left[i].w) >= 0) i++;
    out.push(left.splice(i, 1)[0].x);
  }
  return out;
}
/** A mix as a link carries it, the topics in with their weights ("trade.2,art.1"), and back (a topic not named, out). */
export const mixParam = (list, w) => list.filter(([id]) => (w?.[id] ?? 1) > 0).map(([id]) => `${id}.${w?.[id] ?? 1}`).join(",");
export const mixFromParam = (list, text) => cleanMix(list, Object.fromEntries([
  ...list.map(([id]) => [id, 0]),
  ...String(text || "").split(",").map(x => x.split(".")).filter(([id]) => list.some(([t]) => t === id)).map(([id, w]) => [id, Number(w)]),
]));

// ---------- the knowledge base's topics ----------
/** A clue link's aspects (kb/links.js), which belong to the link, not the thing: a country clue's and a commodity clue's
 *  ask different things. Crates weights them in its settings (core.js takes them from here), Origin deals its clues by
 *  the country ones. */
export const KB_TOPICS = {
  country: [
    ["geo", "Geography"], ["nat", "Nature"], ["nrg", "Energy"], ["met", "Metals & mining"],
    ["agr", "Agriculture"], ["food", "Food & drink"], ["mkt", "Money & economy"], ["fin", "Finance"], ["trade", "Trade & shipping"],
    ["co", "Companies & brands"], ["pol", "Policy & institutions"], ["hist", "History"], ["cult", "Culture & arts"],
    ["screen", "Film, TV & games"], ["style", "Craft & style"],
    ["sport", "Sport"], ["ppl", "People"], ["sci", "Science & tech"], ["lang", "Language & names"],
  ],
  commodity: [
    ["orig", "Origins"], ["prod", "Production"], ["uses", "Uses"], ["spec", "Specs & science"],
    ["mkts", "Markets"], ["logi", "Trade & logistics"], ["reg", "Policy"], ["firm", "Companies"],
    ["past", "History"], ["life", "Culture & language"],
  ],
};
const allKb = w => Object.fromEntries([...KB_TOPICS.country, ...KB_TOPICS.commodity].map(([k]) => [k, w]));
/** Crates' presets for them: Trader weights what a country makes, sells and moves; Culture night its arts and people. */
export const KB_PRESETS = {
  trader: { label: "Trader", topics: { ...allKb(1), nrg: 2, met: 2, agr: 2, mkt: 2, fin: 2, trade: 2, co: 2, pol: 1, sci: 1, geo: 1, lang: 1,
    mkts: 2, logi: 2, reg: 2, firm: 2, orig: 1, prod: 1, uses: 1, spec: 1 } },
  balanced: { label: "Balanced", topics: allKb(1) },
  culture: { label: "Culture night", topics: { ...allKb(1), cult: 2, screen: 2, style: 2, food: 2, sport: 2, ppl: 2, hist: 2, nat: 2, mkt: 1, fin: 1, nrg: 1, met: 1, trade: 1, sci: 1, pol: 1,
    life: 2, past: 2, uses: 2, spec: 1, mkts: 1, logi: 1, reg: 1 } },
};


// ---------- one set of topics for every game (2 November 2026) ----------
// Korbi: "the topics should be set in settings in the main menu, not for each knowledge game independently"; "remove the
// more/less thing, on/off is the only needed"; presets all on, all off, culture and stem. A subject is on or off; each game
// keeps its own topics (a clue's aspect, a bank, a category) and says which subject each belongs to (TOPIC_OF below), so a
// game's mix is made from what's on: a topic is in, at the weight its game has always dealt it at, when its subject is on,
// and out when it isn't. With every subject on that is each game's old Balanced, seed for seed.
/** The subjects, in the order Settings shows them. `group` says which preset leans on it. */
export const SUBJECTS = [
  ["geo", "Geography", ""], ["cities", "Cities", ""], ["nat", "Nature", "stem"],
  ["mkt", "Money & economy", "trade"], ["fin", "Finance", "trade"], ["trade", "Trade & shipping", "trade"], ["co", "Companies & brands", "trade"],
  ["nrg", "Energy", "stem trade"], ["met", "Metals & mining", "stem trade"], ["agr", "Agriculture", "trade"],
  ["pol", "Policy & law", "trade"], ["hist", "History", "culture"], ["ppl", "People", "culture"], ["lang", "Language & words", "culture"], ["rel", "Religion & philosophy", "culture"],
  ["art", "Art & architecture", "culture"], ["cult", "Literature, music & myth", "culture"], ["screen", "Film, TV & games", "culture"],
  ["style", "Craft & style", "culture"], ["food", "Food & drink", "culture"], ["sport", "Sport", "culture"],
  ["sci", "Science & tech", "stem"], ["math", "Maths & logic", "stem"],
].map(([id, label, group]) => ({ id, label, group }));
export const SUBJECT_LIST = SUBJECTS.map(s => [s.id, s.label]);
const ofGroup = g => Object.fromEntries(SUBJECTS.map(s => [s.id, s.group.split(" ").includes(g) ? 1 : 0]));
const every = v => Object.fromEntries(SUBJECTS.map(s => [s.id, v]));
/** Presets of the subjects: all on (what the games dealt before topics, so "Balanced" to every game), all off (a place to
 *  start choosing from), culture, stem, and trade (the markets side). */
export const SUBJECT_PRESETS = {
  all: { label: "All on", topics: every(1) },
  culture: { label: "Culture", topics: ofGroup("culture") },
  stem: { label: "STEM", topics: ofGroup("stem") },
  trade: { label: "Trade", topics: ofGroup("trade") },
  none: { label: "All off", topics: every(0) },
};
/** A set of subjects as kept (anything: an old save, a link), made whole: each 0 or 1, one it doesn't know left out, and
 *  one missing on (a subject added later starts on). */
export function cleanSubjects(saved) {
  const out = {};
  for (const s of SUBJECTS) { const v = saved?.[s.id]; out[s.id] = v === 0 || v === false ? 0 : 1; }
  return out;
}
/** The preset a set of subjects is (its id), or "custom". */
export const subjectPreset = on => Object.keys(SUBJECT_PRESETS).find(k => SUBJECTS.every(s => (on?.[s.id] ?? 1) === SUBJECT_PRESETS[k].topics[s.id])) || "custom";
/** The subjects that are on, as a list of ids. */
export const subjectsIn = on => SUBJECTS.filter(s => (on?.[s.id] ?? 1) > 0).map(s => s.id);
/** Whether every subject is on: every game deals as it did before it had topics. */
export const allSubjects = on => SUBJECTS.every(s => (on?.[s.id] ?? 1) > 0);
/** A line saying where the subjects stand, for a game's menu. */
export function subjectsSay(on) {
  const p = subjectPreset(on), n = subjectsIn(on).length;
  return p === "all" ? "Topics: all on" : p === "none" ? "Topics: all off, so every topic is dealt" : p !== "custom" ? `Topics: ${SUBJECT_PRESETS[p].label} (${n} of ${SUBJECTS.length} on)` : `Topics: ${n} of ${SUBJECTS.length} on`;
}

/** Which subject each game's own topics belong to. A game's topic list is [id, label] pairs; every id must be here
 *  (tests/topics-global.mjs). kb: the clue links' aspects (Crates, Origin, Nexus, Crossword, Isomer, Lode), country ones
 *  then commodity ones. */
export const TOPIC_OF = {
  kb: {
    geo: "geo", nat: "nat", nrg: "nrg", met: "met", agr: "agr", food: "food", mkt: "mkt", fin: "fin", trade: "trade", co: "co", pol: "pol",
    hist: "hist", cult: "cult", screen: "screen", style: "style", sport: "sport", ppl: "ppl", sci: "sci", lang: "lang",
    orig: "geo", prod: "trade", uses: "sci", spec: "sci", mkts: "fin", logi: "trade", reg: "pol", firm: "co", past: "hist", life: "lang",
  },
  quote: { trade: "trade", cities: "cities", wine: "food", art: "art", people: "ppl", geo: "geo", markets: "fin", refining: "nrg", scale: "sci" },
  chart: { cities: "cities", countries: "geo", trade: "trade", geo: "geo", physical: "nat", art: "art", museums: "art", architecture: "art", myth: "cult",
    history: "hist", people: "ppl", wine: "food", local: "geo" },
  nonogram: { countries: "geo", flags: "geo", lakes: "nat", regions: "geo" },
  lots: { wp: "lang", ph: "lang", mn: "lang", th: "lang", mk: "fin", sc: "sci", pl: "geo", cu: "cult", sp: "sport", fd: "food" },
  punt: { countries: "geo", commodities: "trade", maths: "math", refining: "nrg", reasoning: "math", words: "lang", cities: "cities", flags: "geo", patterns: "math",
    wine: "food", art: "art", economics: "mkt", physics: "sci", chemistry: "sci", code: "sci", philosophy: "rel", religion: "rel", watches: "style", skiing: "sport",
    china: "geo", britain: "geo", bavaria: "geo", swiss: "geo", artmarket: "art", titles: "hist", lit: "cult", sayings: "lang", law: "pol", merchants: "trade",
    mythology: "cult", architecture: "art" },
};
/** A game's mix of its own topics, from the subjects that are on: each topic of `list` ([id, label]) in at its `base`
 *  weight (1 where the game says nothing) when its subject is on, out when it isn't. `map` is the game's TOPIC_OF. */
export function mixFromSubjects(list, map, on, base = {}) {
  const out = {};
  for (const [id] of list) out[id] = (on?.[map[id]] ?? 1) > 0 ? (base[id] ?? 1) : 0;
  return out;
}

// ---- content marked for removal (docs/the-knowledge-base.md, "Who the games ask about") ----------------------------------
// Every item the banks hold carries its mark when it is marked for removal: `mk` "s" (specialist) or "p" (personal), or "l"
// (a living person, in the one list that must keep it: Crates'). Unmarked is kept (universal, regional, theme). Settings has one
// choice, Exclude (the default) or Include (topics-on.js); a game forms its pool with `dealable`, next to where it applies the
// subjects. Living is never dealt.
/** Whether an item (or a bare mark letter) is marked for removal. */
export const isMarked = x => { const m = typeof x === "string" ? x : x?.mk; return m === "s" || m === "p"; };
/** What a game may deal from `list` (items with `mk`): without what is marked for removal unless `include`; the living never. */
export const dealable = (list, include = false) => list.filter(x => !x.mk || (include && x.mk !== "l"));
/** The star a marked item carries wherever its prompt is drawn (style.css `.marked-star`), as markup. */
export const STAR = '<span class="marked-star" role="img" aria-label="Marked for removal" title="Marked for removal">★</span>';
export const starOf = x => (isMarked(x) ? STAR : "");
/** Puts the star in a card's corner for `x` (an item or a mark), or takes it away: call it after the card is drawn. */
export function showStar(el, x) {
  if (!el) return;
  el.classList.add("has-star");
  for (const s of el.querySelectorAll(":scope > .marked-star")) s.remove();
  if (isMarked(x)) el.insertAdjacentHTML("beforeend", STAR);
}
