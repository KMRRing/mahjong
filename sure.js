// The suite's own pop-ups, in place of the browser's confirm(), prompt() and alert() (2 November 2026, Korbi: "don't use
// alerts. just do in-app pop ups. feels budget."). Each returns a promise, so the caller awaits it:
//   if (!(await sure("Start a new puzzle? This one isn't solved."))) return;
//   const code = await typed("Type 8 letters:", { value: now });      // the text, or null when cancelled
//   await notice("A solo code is 8 letters.");
// Escape, a tap outside and Cancel all answer no. A game with a clock stops while one is open (PAUSERS in menu.js).

function popup({ message, input, buttons }) {
  const body = document.body;
  if (!body || typeof HTMLDialogElement === "undefined") return Promise.resolve(null);   // no page (a Node test): the caller's default
  return new Promise(resolve => {
    const dlg = document.createElement("dialog");
    dlg.className = "sure";
    dlg.setAttribute("aria-label", message);
    const form = document.createElement("form");
    form.method = "dialog";
    const p = document.createElement("p");
    p.textContent = message;
    form.append(p);
    let field = null;
    if (input) {
      field = document.createElement("input");
      Object.assign(field, { type: "text", value: input.value || "", autocomplete: "off", spellcheck: false });
      if (input.placeholder) field.placeholder = input.placeholder;
      form.append(field);
    }
    const row = document.createElement("div");
    row.className = "sure-row";
    let focus = null;
    for (const [text, answer, primary, first] of buttons) {
      const b = document.createElement("button");
      b.type = answer ? "submit" : "button";
      b.className = primary ? "btn primary" : "btn";
      b.textContent = text;
      b.value = answer ? "yes" : "no";
      if (!answer) b.addEventListener("click", () => dlg.close("no"));
      if (first) focus = b;
      row.append(b);
    }
    form.append(row);
    dlg.append(form);
    let done = false;
    const finish = answer => { if (done) return; done = true; dlg.remove(); resolve(answer); };
    dlg.addEventListener("close", () => finish(dlg.returnValue === "yes" ? (field ? field.value : true) : (field ? null : false)));
    dlg.addEventListener("cancel", () => { dlg.returnValue = "no"; });                  // Escape
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close("no"); });      // a tap on the backdrop (the dialog has no padding of its own)
    body.append(dlg);
    dlg.showModal();
    (field || focus)?.focus();
    field?.select();
  });
}

/** A yes/no question. Resolves true on yes; the safe answer (Cancel) is the one with focus. */
export async function sure(message, { yes = "Yes", no = "Cancel" } = {}) {
  const answer = await popup({ message, buttons: [[no, false, false, true], [yes, true, true]] });
  return answer === null ? true : answer;
}

/** Asks for a line of text. Resolves to the text on OK, null when cancelled. */
export function typed(message, { value = "", placeholder = "", yes = "OK", no = "Cancel" } = {}) {
  return popup({ message, input: { value, placeholder }, buttons: [[no, false, false], [yes, true, true]] });
}

/** Says something and waits for OK. */
export async function notice(message, { ok = "OK" } = {}) {
  await popup({ message, buttons: [[ok, true, true, true]] });
}
