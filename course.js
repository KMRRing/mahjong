// A game's course on a sheet over the game (Learn, in its header): the map of its chapters and lessons, and a lesson's
// steps, each words over a stage the game draws (its cards, its dice), a choice, or an exercise the stage takes the
// answer to. River's course (river-learn.js, on its board) was the first; this is the same sheet for the games that
// aren't played on a board (Landlord, Big Two, Boast). Where you've got to is kept (<game>:course), so the course opens
// where you left it and the map ticks what you've done.
//
// A course: { title ("Learn Landlord"), zh ("斗地主"), chapters: [{ id, title, zh, lessons: [{ id, title, zh, steps }] }] }.
// A step: { say } words; { say, quiz: [options], answer, why } a choice; { say, play: true } the last step, a game against
// the computer; any step the stage says is its own (stage.task) an exercise on the stage. Every step may carry what the
// stage shows with it.
//
// The stage: mount(box, { changed, answer }) once; draw(step, st) for each change (st: the step's state, which the stage
// may keep its own fields in); task(step): whether the step asks for an answer on the stage; and either submit(step, st)
// → { ok, msg | why } with ready(step, st) and label(step, st) for the button that submits (cards: pick, then play; a
// bid set on the dice), or the stage judging as the reader taps and calling answer({ ok, msg, done }) (dice: tap each
// one that counts), submits(step) saying which a step is when a stage has both; hint(step, st) shows the answer.
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Every lesson in order, with its chapter and place: [{ chapter, lesson, index }]. */
export const lessonsOf = course => course.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ chapter, lesson }))).map((x, index) => ({ ...x, index }));

/** How far through a course the reader is: { done, of, next (the first lesson not done) }. */
export function progressOf(id, course) {
  const pr = readProgress(id), all = lessonsOf(course), done = all.filter(x => pr.done[x.lesson.id]).length;
  return { done, of: all.length, next: all.find(x => !pr.done[x.lesson.id]) || null };
}
function readProgress(id) {
  try { return { done: {}, at: null, ...JSON.parse(localStorage.getItem(`${id}:course`) || "{}") }; } catch { return { done: {}, at: null }; }
}

/**
 * The course's sheet, made once. id: the game's (its progress is kept under `${id}:course`); stage: as above;
 * onPlay(step): a lesson's game (the step, which may say more: Bones' says how strong a computer to play); onRules():
 * the rules on one page, from the map; inFrame: a partner watching, so nothing is kept; cls: the game's class on the
 * sheet, for its colours. Returns { open(lessonId?), isOpen }.
 */
export function createCourse({ id, course, stage, onPlay = () => {}, onRules = null, inFrame = false, cls = "" }) {
  const LESSONS = lessonsOf(course), byId = lid => LESSONS.find(x => x.lesson.id === lid) || null;
  const dlg = document.createElement("dialog");
  dlg.className = `ln-sheet pauses map${cls ? ` ${cls}` : ""}`;          // pauses: the game stands still (menu.js)
  dlg.setAttribute("aria-label", course.title);
  dlg.innerHTML = `<div class="ln-in">
    <header class="ln-head"><button class="icon-btn" type="button" data-back aria-label="All the lessons">${BACK}</button>
      <div class="ln-title"><b></b><small></small></div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE}</button></header>
    <div class="ln-map"></div>
    <div class="ln-lesson"><div class="ln-stage"></div>
      <div class="ln-side"><div class="ln-text" aria-live="polite"></div>
        <div class="ln-bar"><button class="ln-go quiet" type="button" data-hint>Hint</button><button class="ln-go" type="button" data-act></button><button class="ln-go" type="button" data-next>Next</button></div></div></div>
  </div>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  let pr = readProgress(id);
  const save = () => { if (!inFrame) try { localStorage.setItem(`${id}:course`, JSON.stringify(pr)); } catch { /* private mode */ } };

  // ---------- a lesson's step ----------
  let L = null;                                            // { entry, i (the step), st (the step's state) }
  const step = () => L.entry.lesson.steps[L.i];
  const isTask = s => !!stage.task(s);
  const viaButton = s => !!stage.submit && (stage.submits ? stage.submits(s) : true);
  stage.mount($(".ln-stage"), {
    changed: () => draw(),
    answer: res => { if (L && !L.st.done) settle(res); },
  });

  function startStep(i) {
    L.i = i;
    const s = step();
    L.st = { done: !isTask(s) && !s.quiz, tries: 0, hint: false, msg: "", picked: null };
    pr.at = { id: L.entry.lesson.id, step: i };
    save();
    draw();
  }
  /** An answer judged: right ends the step; wrong says why, and after two misses the stage shows the answer. */
  function settle(res) {
    if (res.ok) { L.st.done = res.done !== false; L.st.msg = res.msg || (L.st.done ? "Right." : ""); }
    else {
      L.st.tries++;
      L.st.msg = res.why || "Not that.";
      if (L.st.tries >= 2 && !L.st.hint) { L.st.hint = true; stage.hint(step(), L.st); }
    }
    draw();
  }

  function draw() {
    if (!L) return;
    const s = step(), lesson = L.entry.lesson, n = lesson.steps.length, task = isTask(s) && !L.st.done;
    $(".ln-title b").textContent = lesson.title;
    $(".ln-title small").textContent = `${lesson.zh ? `${lesson.zh} · ` : ""}${L.i + 1} of ${n}`;
    // the words first: the stage takes the room they leave, and draws to it
    const parts = [`<p class="ln-say">${esc(s.say)}</p>`];
    if (s.quiz) parts.push(quizHtml(s));
    if (L.st.msg) parts.push(`<p class="ln-msg${L.st.done ? " ok" : " no"}">${esc(L.st.msg)}</p>`);
    $(".ln-text").innerHTML = parts.join("");
    $(".ln-text").scrollTop = $(".ln-text").scrollHeight;
    // the buttons: Hint and the stage's own (Play these) while an exercise is on; Next once a step is done
    const act = $("[data-act]"), next = $("[data-next]"), hint = $("[data-hint]");
    hint.hidden = !task;
    hint.disabled = L.st.hint;
    act.hidden = !(task && viaButton(s));
    if (!act.hidden) { act.textContent = stage.label(s, L.st); act.disabled = !stage.ready(s, L.st); }
    next.hidden = task && viaButton(s);
    next.disabled = !L.st.done;
    const last = L.i === n - 1;
    next.textContent = s.play ? "Play a game" : last ? (LESSONS[L.entry.index + 1] ? "Next lesson" : "Finish") : "Next";
    stage.draw(s, L.st);
  }
  // short options (numbers, a word each) side by side: the words above them keep their room on a short phone
  function quizHtml(s) {
    const row = s.quiz.length <= 4 && s.quiz.every(o => String(o).length <= 9);
    return `<div class="ln-quiz${row ? " row" : ""}">${s.quiz.map((o, i) => {
      const cls = L.st.done ? (i === s.answer ? " ok" : L.st.picked === i ? " no" : "") : L.st.picked === i ? " no" : "";
      return `<button type="button" class="ln-opt${cls}" data-opt="${i}" ${L.st.done ? "disabled" : ""}>${esc(o)}</button>`;
    }).join("")}</div>`;
  }
  $(".ln-text").addEventListener("click", e => {
    const b = e.target.closest("[data-opt]");
    if (!b || !L || L.st.done) return;
    const s = step(), i = Number(b.dataset.opt);
    L.st.picked = i;
    if (i === s.answer) { L.st.done = true; L.st.msg = s.why || "Right."; }
    else L.st.msg = "Not quite: try again.";
    draw();
  });
  $("[data-hint]").addEventListener("click", () => {
    if (!L || L.st.done || L.st.hint) return;
    L.st.hint = true;
    stage.hint(step(), L.st);
    draw();
  });
  $("[data-act]").addEventListener("click", () => {
    if (!L || L.st.done || !viaButton(step())) return;
    const s = step();
    if (!stage.ready(s, L.st)) return;
    settle(stage.submit(s, L.st));
  });
  $("[data-next]").addEventListener("click", () => {
    if (!L || !L.st.done) return;
    const s = step();
    if (s.play) { finish(); dlg.close(); onPlay(s); return; }
    if (L.i < L.entry.lesson.steps.length - 1) { startStep(L.i + 1); return; }
    finish();
    const after = LESSONS[L.entry.index + 1];
    if (after) openLesson(after.lesson.id); else showMap();
  });
  function finish() {
    pr.done[L.entry.lesson.id] = Date.now();
    pr.at = null;
    save();
  }

  // ---------- the map ----------
  function showMap() {
    L = null;
    dlg.classList.add("map");
    const done = LESSONS.filter(x => pr.done[x.lesson.id]).length, next = LESSONS.find(x => !pr.done[x.lesson.id]) || null;
    $(".ln-title b").textContent = course.title;
    $(".ln-title small").textContent = `${course.zh ? `${course.zh} · ` : ""}${done} of ${LESSONS.length} lessons`;
    const cont = pr.at && byId(pr.at.id) ? byId(pr.at.id) : next;
    $(".ln-map").innerHTML = (cont ? `<button type="button" class="ln-go ln-start" data-lesson="${cont.lesson.id}">${done || pr.at ? "Continue" : "Start"}: ${esc(cont.lesson.title)}</button>`
      : `<p class="ln-all">Every lesson done. Play a game, or go over any lesson again.</p>`)
      + course.chapters.map(c => `<section class="ln-ch"><h3>${esc(c.title)}${c.zh ? ` <span>${esc(c.zh)}</span>` : ""}</h3><ol>${c.lessons.map(l => {
        const ok = !!pr.done[l.id], here = cont?.lesson.id === l.id;
        return `<li><button type="button" data-lesson="${l.id}" class="${ok ? "done" : ""}${here ? " here" : ""}"><span class="tick" aria-hidden="true">${ok ? "✓" : here ? "●" : ""}</span><span class="t">${esc(l.title)}</span><span class="zh">${esc(l.zh || "")}</span></button></li>`;
      }).join("")}</ol></section>`).join("")
      + (onRules ? `<button type="button" class="ln-go quiet ln-rules" data-rules>The rules on one page</button>` : "");
  }
  $(".ln-map").addEventListener("click", e => {
    if (e.target.closest("[data-rules]")) { onRules?.(); return; }
    const b = e.target.closest("[data-lesson]");
    if (b) openLesson(b.dataset.lesson, pr.at?.id === b.dataset.lesson ? pr.at.step : 0);
  });
  function openLesson(lid, at = 0) {
    const entry = byId(lid);
    if (!entry) { showMap(); return; }
    dlg.classList.remove("map");
    L = { entry, i: 0, st: null };
    startStep(Math.min(at, entry.lesson.steps.length - 1));
  }
  $("[data-back]").addEventListener("click", () => { if (L) showMap(); else dlg.close(); });
  $("[data-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => { L = null; });
  addEventListener("resize", () => { if (dlg.open && L) draw(); });

  return {
    /** Opens the course on the map, or on a lesson. */
    open(lid = null) {
      pr = readProgress(id);
      if (!dlg.open) dlg.showModal();
      if (lid) openLesson(lid); else showMap();
    },
    get isOpen() { return dlg.open; },
  };
}
