// Flags as flags everywhere. A country's flag is written as an emoji (🇮🇪, two "regional indicator" letters), and
// some systems (Windows above all) have no flag pictures and show the letters instead: "IE". Where that's so, a small
// font of just the flags (Twemoji Country Flags, MIT, from country-flag-emoji-polyfill; 78 KB, fonts/twemoji-flags.woff2)
// goes in front of the page's own font, for the flag letters only. Systems that draw flags keep their own.
// Loaded by every page through pwa.js.
function drawsFlags() {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 20;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.font = "16px sans-serif";
    x.textBaseline = "top";
    x.fillText("\u{1F1EE}\u{1F1EA}", 0, 0);                      // Ireland: green, white, orange if drawn as a flag
    const d = x.getImageData(0, 0, 20, 20).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && (Math.abs(d[i] - d[i + 1]) > 30 || Math.abs(d[i + 1] - d[i + 2]) > 30)) return true;
    return false;
  } catch { return true; }                                        // can't tell: leave the system's own
}
if (!drawsFlags()) {
  const face = document.createElement("style");
  face.textContent = `@font-face { font-family: "Twemoji Country Flags"; src: url("fonts/twemoji-flags.woff2") format("woff2");
    unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F; font-display: swap; }`;
  document.head.appendChild(face);
  const root = document.documentElement, font = getComputedStyle(root).getPropertyValue("--font").trim() || "sans-serif";
  root.style.setProperty("--font", `"Twemoji Country Flags", ${font}`);   // the flag letters only (unicode-range)
  root.classList.add("flag-font");
}
