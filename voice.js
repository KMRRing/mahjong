// The phone's own voice, for words in another language: Parley's cards, and Deck when it reviews them. It speaks with
// the device's speech engine in the language asked for, preferring a voice of exactly that language, then any of its
// family (fr-CA will do for fr-FR). Browsers let a page speak only once someone has touched it, so the first touch
// anywhere speaks a silent word; after that a card can speak as it appears, and its speaker button works throughout.
let voices = [];
const load = () => { voices = window.speechSynthesis?.getVoices?.() || []; };
if (window.speechSynthesis) {
  load();
  window.speechSynthesis.addEventListener?.("voiceschanged", load);
  addEventListener("pointerdown", () => {
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* no engine */ }
  }, { once: true, capture: true });
}

/** Speaks text in a language (a tag like fr-FR); false if this device can't. */
export function speak(text, lang, rate = 0.9) {
  if (!window.speechSynthesis || !text) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

/** Whether this device has a voice for a language (one of its family counts). */
export const hasVoice = lang => voices.some(v => v.lang.startsWith(lang.slice(0, 2)));
