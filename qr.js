// A QR code drawn as SVG, for a table's invitation: the host's phone shows it and the others scan it with their
// camera. The code itself is vendor/uqr.js's (MIT); this draws it as one path, each row's dark runs joined into one
// rectangle, so a code is a few kilobytes and stays sharp at any size. Dark on white whatever the theme: a phone's
// camera reads light-on-dark codes poorly, so the code keeps its own white margin (two modules each side; readers want
// some quiet space round the finder squares) inside whatever frame the page gives it.
import { encode } from "./vendor/uqr.js";

/** The QR code for `text` as an SVG string (its viewBox in modules), error correction M (a smudge or glare is lost). */
export function qrSvg(text, { label = "QR code" } = {}) {
  const qr = encode(text, { ecc: "M", border: 2 });
  const n = qr.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.data[y][x]) continue;
      let run = 1;
      while (x + run < n && qr.data[y][x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** The modules of the code for `text` (rows of booleans, margin included): for the tests, which read it back. */
export const qrModules = text => encode(text, { ecc: "M", border: 2 }).data;
