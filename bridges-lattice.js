// Where Bridges' islands can stand, pure (no page, no engine): the square board and the hex one (Korbi, 5 November 2026).
//
// Both boards are stored the same way: a grid string of `size * size` characters, one a lattice point, row by row. The square
// board uses every cell. The hex board is a triangular lattice in a hexagon, `size` points across its middle row (7, 9 or 11: radius
// 3, 4 or 5), laid in the same square array as a rhombus with its two corners cut: the cell (r, c) is on the board when
// max(|r - R|, |c - R|, |r + c - 2R|) <= R. A hex point has six neighbours; a bridge runs along one of three axes (a row, a slant
// down and to the right, a slant down and to the left), and two bridges can only cross at a lattice point (any two lattice lines
// of different axes meet at one), so the engine finds crossings from the points a bridge passes over.
export const H = Math.sqrt(3) / 2;
/** The axes a link runs along, as (rows, columns) from its first island: along the row, down the column, and (hex only) down and to the left. A link's first island is the earlier in reading order. */
export const AXES = [[0, 1], [1, 0], [1, -1]];
export const axesOf = hex => (hex ? AXES : AXES.slice(0, 2));
/** Every step to a neighbour: four on the square board, six on the hex one. */
export const STEPS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export const HEX_STEPS = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, -1], [-1, 1]];
export const stepsOf = hex => (hex ? HEX_STEPS : STEPS);
export const isHex = shape => shape === "hex";
/** The hex board's radius in steps from the middle, for a size across. */
export const radiusOf = size => (size - 1) >> 1;
/** Whether (r, c) is a point of the board. */
export const onBoard = (size, hex, r, c) => {
  if (r < 0 || r >= size || c < 0 || c >= size) return false;
  if (!hex) return true;
  const R = radiusOf(size);
  return Math.max(Math.abs(r - R), Math.abs(c - R), Math.abs(r + c - 2 * R)) <= R;
};
/** How many points a board has. */
export const pointsOf = (size, hex) => (hex ? 3 * radiusOf(size) * (radiusOf(size) + 1) + 1 : size * size);
/** The point's place on the chart, in lattice units from the top left of the board's box (a point is 0.5 in from it). */
export const xyOf = (size, hex, r, c) => (hex ? [c + (r - radiusOf(size)) / 2 + 0.5, r * H + 0.5] : [c + 0.5, r + 0.5]);
/** The width and height of the board's box in those units. */
export const boxOf = (size, hex) => (hex ? [size, 2 * radiusOf(size) * H + 1] : [size, size]);
/** The point's place in the 3D world: the same lattice units, the board's middle at the origin, x along a row, z down the board. */
export const worldXZ = (size, hex, r, c) => { const [x, y] = xyOf(size, hex, r, c), [w, h] = boxOf(size, hex); return [x - w / 2, y - h / 2]; };

// ---------- straits: lines across the sea ----------
// A strait is a gap between two neighbouring lines of the lattice, in one of its families: between rows (family 0), between columns
// (family 1) and, on the hex board, between the slants that run down and to the left (family 2). A bridge crosses a gap when its two
// islands are on its two sides. The straits string has `size - 1` characters a family, family 0 first.
export const familiesOf = hex => (hex ? 3 : 2);
export const gapsOf = (size, hex) => familiesOf(hex) * (size - 1);
/** The number of the line a point is on, in a family: rows count from the top, columns from the left, slants from the one through the top right corner. */
export const lineOf = (size, fam, r, c) => (fam === 0 ? r : fam === 1 ? c : r + c - radiusOf(size));
/** The family and the gap (between line `gap` and `gap + 1`) of character `g` of a straits string. */
export const gapAt = (size, g) => ({ fam: Math.floor(g / (size - 1)), gap: g % (size - 1) });
/**
 * Where a strait's line runs on the chart, from the end its number sits at to the other: [[x0, y0], [x1, y1]], the line
 * midway between the two lattice lines, cut to the board's box.
 */
export function straitLine(size, hex, fam, gap, reach = 0.25) {
  const [w, h] = boxOf(size, hex);
  if (!hex) return fam === 0 ? [[0.5 - reach, gap + 1], [w - 0.5 + reach, gap + 1]] : [[gap + 1, 0.5 - reach], [gap + 1, h - 0.5 + reach]];
  // in axial steps from the middle (q across, s down), the midway line runs through the hexagon |q|, |s|, |q + s| <= R
  const R = radiusOf(size), t = gap + 0.5 - R;
  const span = fam === 0 ? [Math.max(-R, -R - t), Math.min(R, R - t)] : fam === 1 ? [Math.max(-R, -R - t), Math.min(R, R - t)] : [Math.max(-R, t - R), Math.min(R, t + R)];
  const at = u => (fam === 0 ? [u, t] : fam === 1 ? [t, u] : [t - u, u]);
  const ends = span.map(u => { const [q, s] = at(u); return [q + s / 2 + R + 0.5, (s + R) * H + 0.5]; });
  if (fam === 2) ends.reverse();                                 // the slants' numbers sit at their lower ends, so no two families crowd one corner
  // cut a little past the outermost points, so it reads as a line across the sea
  const [a, b] = ends, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  return [[a[0] - ux * reach, a[1] - uy * reach], [b[0] + ux * reach, b[1] + uy * reach]];
}
