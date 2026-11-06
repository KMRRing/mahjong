// The topics control: one preset row and a Choose grid of every subject, each on or off (topics.js: SUBJECTS; topics-on.js
// keeps them). Settings (apps.js) has it in its sheet; a game's menu has a line saying where the topics stand and a link
// that opens the same control in a sheet of its own, so a game never has a topics control of its own.
import { choice, ticks, line, action, CLOSE } from "./menu.js";
import { SUBJECTS, SUBJECT_LIST, SUBJECT_PRESETS, subjectPreset, subjectsIn, subjectsSay } from "./topics.js";
import { subjectsOn, setSubjects, markedIn, setMarkedIn } from "./topics-on.js";

/** The control, as an element. onChange(on) after every change (the sheet and Settings need nothing more: games read the
 *  subjects when they deal). */
export function topicsControls({ onChange } = {}) {
  const box = document.createElement("div");
  box.className = "menu-mix topics-set";
  let on = subjectsOn(), presets = null, said = null;
  const sayNow = () => {
    said.textContent = !subjectsIn(on).length ? "Nothing is on, so every topic is dealt." : "Each game deals what it has on these topics; a game with nothing on them deals everything.";
  };
  const presetRow = () => {
    const p = subjectPreset(on);
    return choice("Preset", [...Object.entries(SUBJECT_PRESETS).map(([k, x]) => [k, x.label]), ...(p === "custom" ? [["custom", "Your own"]] : [])], p, k => {
      if (k === "custom") return;
      on = setSubjects(SUBJECT_PRESETS[k].topics);
      onChange?.(on);
      draw();
    });
  };
  const draw = () => {
    presets = presetRow();
    said = line("");
    sayNow();
    const pick = ticks("Choose", SUBJECT_LIST, subjectsIn(on), ids => {
      on = setSubjects(Object.fromEntries(SUBJECTS.map(s => [s.id, ids.includes(s.id) ? 1 : 0])));
      onChange?.(on);
      const fresh = presetRow();
      presets.replaceWith(fresh);
      presets = fresh;
      sayNow();
    }, Infinity, { all: true });
    // Content marked for removal (topics.js): kept in the knowledge base until release; a dealt question carries a star
    const marked = choice("Content marked for removal", [["exclude", "Exclude"], ["include", "Include"]], markedIn() ? "include" : "exclude", v => { setMarkedIn(v === "include"); onChange?.(on); });
    box.replaceChildren(presets, pick, said, marked);
  };
  draw();
  return box;
}

let sheet = null;
/** Opens the control in a sheet over the page (the games' menus close first, so the sheet is all there is). */
export function openTopics() {
  if (!sheet) {
    sheet = document.createElement("dialog");
    sheet.className = "apps-pop apps-settings topics-sheet";
    sheet.setAttribute("aria-label", "Topics");
    sheet.innerHTML = `<div class="pick-head"><h2>Topics</h2><button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE}</button></div><div class="settings-body"></div>`;
    sheet.querySelector("[data-close]").addEventListener("click", () => sheet.close());
    sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
    document.body.appendChild(sheet);
  }
  sheet.querySelector(".settings-body").replaceChildren(topicsControls());
  sheet.showModal();
}

/** What a game's menu shows in place of a topics control: where the topics stand, and a link to change them. Put it in
 *  the `content` part. `say` may add what it means for this game ("Today's board deals every topic"). */
export function topicsPart(body, extra = "") {
  const on = subjectsOn();
  return [line(`${subjectsSay(on)}${extra ? `. ${extra}` : ""}${markedIn() ? ". Marked content is in" : ""}`), action("Change topics", openTopics, "link")];
}
