// The table's narrator, the spoken half (the written line is the page's). table-ui.js re-exports it.

/** The games whose narrator may speak: where people say aloud what they play (Korbi, 4 November 2026: "switch off and
 *  remove everywhere except for the Chinese games"). Every other game's narrator only writes its line. Hong and
 *  Tribute have no narrator of their own; they're here so one is silent only by being left out. */
export const SPOKEN_TABLES = ["bigtwo", "landlord", "boast", "banquet", "hong", "tribute"];

/**
 * The table's narrator: each new line (branch.say, written by narrate() in table.js) is shown by the page and spoken
 * here when this device runs the table (one voice in the room, from the phone in the middle), or on every device
 * with `everywhere`, if `game` is one of SPOKEN_TABLES (else it never speaks). A page that opens on a line already
 * said stays quiet about it.
 */
export function createNarrator({ game = "", everywhere = false, rate = 1 } = {}) {
  let heard = null, muted = !SPOKEN_TABLES.includes(game);
  const voices = () => window.speechSynthesis?.getVoices?.() || [];
  return {
    get muted() { return muted; },
    set muted(m) { muted = !!m || !SPOKEN_TABLES.includes(game); if (muted) window.speechSynthesis?.cancel(); },
    /** Called with each state: speaks a line not heard yet. Returns the line to show, or "". */
    hear(branch, me) {
      const say = branch?.say;
      if (!say?.n) return "";
      const fresh = heard !== null && say.n > heard;
      heard = say.n;
      if (fresh && !muted && (everywhere || me?.driver) && window.speechSynthesis) {
        try {
          const u = new SpeechSynthesisUtterance(say.text);
          u.lang = say.lang || "en-GB";
          u.rate = rate;
          const v = voices().find(x => x.lang === u.lang) || voices().find(x => x.lang.startsWith(u.lang.slice(0, 2)));
          if (v) u.voice = v;
          window.speechSynthesis.speak(u);                     // queued after a line still being said
        } catch { /* no voice on this device */ }
      }
      return say.text;
    },
  };
}
