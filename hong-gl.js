// Mahjong's third view (Menu, View: Table, Angled or 3D): the table as a real 3D scene, drawn with three.js (vendor/three-run.js,
// kept on the device, so it plays offline). The layout is the angled view's (hong-3d.js works it out in the plane's pixels and
// hands over each wall stack, discard, hand, set and flower as an item); this file stands those items on a mahogany table: tiles
// of ivory on mahogany (a bevelled slab, the face painted on its top, a polished back), the walls in stacks of two, your
// opponents' hands standing with their backs to you, and a plate inlaid in the middle. Everything is built in code (the wood and
// the ivory are painted on canvases), no model or texture files. The player turns the table by dragging and zooms by pinching
// or the wheel; the camera is kept as `suite:hong-view`. The scene holds only what a player may see: a hidden tile is drawn as
// a back whatever it is (the item says -1), so no angle shows another player's tiles.
// It draws only while something moves (a tile gliding, the camera turning, the offered discard pulsing).
import * as T from "./vendor/three-run.js";
import { faceMarkup } from "./hong-tiles.js";
import { IN_FRAME } from "./suite.js";

const TL = 4 / 3, THICK = 0.7, T_BLACK = 0.35, T_GOLD = 0.175, T_FACE = 0.175, BEVEL = 0.16;       // a tile in its widths: its length, its thickness (half black porcelain, a quarter gold, a quarter ivory), the edge's bevel
const KEY = "suite:hong-view";
const PCF_SOFT = 2, ACES = 4;                                    // THREE.PCFSoftShadowMap and ACESFilmicToneMapping (the bundle exports neither)
const FOV = 36, PITCH = [14, 88], DEFAULT_PITCH = 56;

// ---------- painting the wood and the ivory ----------
/** A small, repeatable value noise in 2D (a hash on the lattice, smoothly blended). */
function noise2(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
/**
 * Mahogany on a canvas: long grain along x with rings that wander, fine pores, a polished sheen. base/dark/high are [r, g, b].
 * Returns the canvas; the bump map is the same one.
 */
function mahogany(w, h, { base, dark, high, seed = 1, rings = 14, pores = 0.5, bookMatch = false, contrast = 1 }) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), n1 = noise2(seed), n2 = noise2(seed + 17), n3 = noise2(seed + 91);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const warp = 0.9 * n1(x * 0.0022, y * 0.006) + 0.25 * n1(x * 0.011 + 40, y * 0.02);
      const ring = (y / h) * rings + warp, f = ring - Math.floor(ring);
      const band = Math.pow(Math.abs(Math.sin(f * Math.PI)), 1.7);                  // dark late wood, lighter early wood
      const fine = n2(x * 0.5, y * 0.05) * pores + n3(x * 0.06, y * 0.9) * 0.35;      // pores and fibres, stretched along the grain
      const streak = 0;                // a figured streak
      let m = 0.5 + contrast * (0.06 * (band - 0.5) + 0.07 * (fine - 0.4)) + streak;
      m = Math.min(1, Math.max(0, m));
      const k = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = m < 0.5 ? dark[c] + (base[c] - dark[c]) * (m / 0.5) : base[c] + (high[c] - base[c]) * ((m - 0.5) / 0.5);
        img.data[k + c] = v;
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (bookMatch) {                                                // two leaves of one log opened like a book: the right is the left's mirror
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(cv, 0, 0, w / 2, h, 0, 0, w / 2, h); ctx.restore();
  }
  return cv;
}
const tex = (cv, repeat = null) => {
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = 1000; t.repeat.set(...repeat); }       // 1000: RepeatWrapping
  t.anisotropy = 4;
  return t;
};

/** The colours a tile's face uses (the page's CSS variables, as the 3D slab's SVG has them), for a standalone SVG. */
const INK = { ink: "#1E2730", red: "#B3302A", green: "#24734A", blue: "#244E8C", face: "#F3EBD3", edge: "#B9A47A", back: "#8F3D22", "back-line": "#C9A26A", num: "1" };
const FACE_W = 192, FACE_H = 256;
const IVORY = ["#F7F0DC", "#EBE0C0"];

// ---------- the pieces ----------
/** A tile's slab: a bevelled box `w` x `h` x `d` (x, y, z) in one colour, its top face's uv spread over the top. */
function slab(w, h, d, r, yBase) {
  const g = new T.BoxGeometry(w, h, d, 3, 3, 3), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const hw = w / 2, hh = h / 2, hd = d / 2, V = new T.Vector3(), Pc = new T.Vector3(), Nr = new T.Vector3();
  const ring = (v, half) => (Math.abs(Math.abs(v) - half) < 1e-6 ? v : Math.sign(v) * (half - r));    // the two inner columns go to the bevel's edge
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const nx = N.getX(i), ny = N.getY(i);
    x = ring(x, hw); y = ring(y, hh); z = ring(z, hd);
    // the uv of the big faces, from the flat position (a bevelled corner doesn't smear the face)
    if (ny > 0.5) U.setXY(i, (x + hw) / w, 1 - (z + hd) / d);
    else if (ny < -0.5) U.setXY(i, (x + hw) / w, (z + hd) / d);
    V.set(x, y, z);
    Pc.set(Math.max(-hw + r, Math.min(hw - r, x)), Math.max(-hh + r, Math.min(hh - r, y)), Math.max(-hd + r, Math.min(hd - r, z)));
    Nr.copy(V).sub(Pc);
    if (Nr.length() > 1e-6) { Nr.normalize(); V.copy(Pc).addScaledVector(Nr, r); N.setXYZ(i, Nr.x, Nr.y, Nr.z); }
    P.setXYZ(i, V.x, V.y + yBase, V.z);
  }
  return g;
}
/**
 * A tile's body: one rounded block (every edge a smooth arc of radius r), its surface in three bands from the foot up (heights
 * `bands`: black porcelain, gold, ivory) with no seam between them, every vertex's uv a plan view (so the face's picture on
 * the top, and the back's on the foot, run over the whole of it). One geometry, one material group a band.
 */
function roundBody(w, h, d, r, bands) {
  const g = new T.BoxGeometry(w, h, d, 8, 40, 10), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const hw = w / 2, hh = h / 2, hd = d / 2, V = new T.Vector3(), Pc = new T.Vector3(), Nr = new T.Vector3(), band = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    band[i] = y + hh < bands[0] - 1e-6 ? 0 : y + hh < bands[0] + bands[1] - 1e-6 ? 1 : 2;          // by the block's own height, a straight line round it
    V.set(x, y, z);
    Pc.set(Math.max(-hw + r, Math.min(hw - r, x)), Math.max(-hh + r, Math.min(hh - r, y)), Math.max(-hd + r, Math.min(hd - r, z)));
    Nr.copy(V).sub(Pc);
    if (Nr.length() > 1e-6) { Nr.normalize(); V.copy(Pc).addScaledVector(Nr, r); N.setXYZ(i, Nr.x, Nr.y, Nr.z); }
    P.setXYZ(i, V.x, V.y, V.z);
    U.setXY(i, (V.x + hw) / w, 1 - (V.z + hd) / d);
  }
  const src = g.index.array, lists = [[], [], []];
  for (let t = 0; t < src.length; t += 3) {
    // a triangle belongs to the band of its upper vertex, so each band's edge is the grid line (no sawtooth)
    const m = Math.max(band[src[t]], band[src[t + 1]], band[src[t + 2]]);
    lists[m].push(src[t], src[t + 1], src[t + 2]);
  }
  const idx = [];
  lists.forEach((l, m) => { g.addGroup(idx.length, l.length, m); idx.push(...l); });
  g.setIndex(idx);
  return g;
}

export function createGL({ host, onFrame = () => {} }) {
  let R = null, scene = null, cam = null, canvas = null, failed = false;
  const items = new Map();                                       // key -> { group, to: {pos, quat}, kind, sig }
  let W = 0, H = 0, sized = "", view = null, fit = 20, plateMesh = null, plateSig = "", tableGroup = null, tableSig = "", wanted = true;
  let labels = true, want = false, raf = 0, last = 0, clock = 0, pulse = false;
  const mats = {}, faceMats = new Map(), geos = {};

  // ---------- the camera: the table turned and zoomed about its middle ----------
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const keep = () => { if (IN_FRAME) return; try { localStorage.setItem(KEY, JSON.stringify({ yaw: +view.yaw.toFixed(3), pitch: +view.pitch.toFixed(3), zoom: +(view.dist / fit).toFixed(3) })); } catch { /* private mode */ } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function pose() {
    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    cam.position.set(view.dist * cp * Math.sin(view.yaw), view.dist * sp + 0.4, view.dist * cp * Math.cos(view.yaw));
    cam.lookAt(0, 0.4, 0);
    cam.near = Math.max(0.1, view.dist * 0.05); cam.far = view.dist * 6 + 60; cam.updateProjectionMatrix();
    redraw();
  }
  let FW = 0, FH = 0;                                            // the field the table is framed in; the canvas itself fills the screen behind it
  function fitDist() {
    const t = Math.tan((FOV * Math.PI) / 360), asp = (FW || W) / Math.max(1, FH || H), sp = Math.sin(((view?.pitch ?? DEFAULT_PITCH * Math.PI / 180)));
    return Math.max(tableW / 2 / (t * asp), (tableH * sp / 2 + 1.6) / t) * 1.14;
  }
  let tableW = 18, tableH = 30;
  function resetView() {
    const old = fit;
    view = { yaw: 0, pitch: (DEFAULT_PITCH * Math.PI) / 180, dist: 1 };
    fit = fitDist();
    view.dist = fit;
    void old;
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    pose();
  }
  function startView() {
    const s = saved();
    view = { yaw: Number.isFinite(s?.yaw) ? s.yaw : 0, pitch: clamp(Number.isFinite(s?.pitch) ? s.pitch : (DEFAULT_PITCH * Math.PI) / 180, (PITCH[0] * Math.PI) / 180, (PITCH[1] * Math.PI) / 180), dist: 1 };
    fit = fitDist();
    view.dist = fit * clamp(Number.isFinite(s?.zoom) ? s.zoom : 1, 0.3, 1.8);
  }
  // one finger or the mouse turns and tilts, two fingers or the wheel zoom, a double tap puts it back
  const pts = new Map();
  let pinch = 0, tapAt = 0;
  function bind(el) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", e => { el.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; el.style.cursor = "grabbing"; });
    el.addEventListener("pointermove", e => {
      const p = pts.get(e.pointerId);
      if (!p || !view) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        view.yaw -= dx * 0.0065;
        view.pitch = clamp(view.pitch + dy * 0.0055, (PITCH[0] * Math.PI) / 180, (PITCH[1] * Math.PI) / 180);
        pose();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) { view.dist = clamp(view.dist * (pinch / dist), fit * 0.3, fit * 1.8); pose(); }
        pinch = dist;
      }
    });
    const up = e => {
      const had = pts.delete(e.pointerId);
      pinch = 0;
      el.style.cursor = "grab";
      if (!had) return;
      if (!pts.size) {
        keep();
        const now = Date.now();
        if (now - tapAt < 320 && Math.hypot(e.movementX || 0, e.movementY || 0) < 4) { resetView(); tapAt = 0; } else tapAt = now;
      }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", e => {
      if (!view) return;
      e.preventDefault();
      view.dist = clamp(view.dist * Math.exp(e.deltaY * 0.0014), fit * 0.3, fit * 1.8);
      pose(); keep();
    }, { passive: false });
    el.addEventListener("dblclick", () => resetView());
    el.style.cursor = "grab";
  }

  // ---------- materials and geometry, made once ----------
  function build() {
    canvas = document.createElement("canvas");
    canvas.className = "hk3-gl";
    canvas.setAttribute("aria-label", "The table in 3D: drag to turn it, pinch or scroll to zoom, double tap to put it back");
    try { R = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "default" }); } catch (e) { console.error(e); failed = true; return false; }
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.toneMapping = ACES; R.toneMappingExposure = 1.4;
    R.shadowMap.enabled = true; R.shadowMap.type = PCF_SOFT;
    scene = new T.Scene();
    R.setClearColor(0x000000, 0);
    cam = new T.PerspectiveCamera(FOV, 1, 0.1, 200);
    // the light: a warm sky, a low sun from the upper left with soft shadows, and a little fill from the player's side
    scene.add(new T.HemisphereLight(0xfff0dc, 0x3a1a0e, 0.85));
    const sun = new T.DirectionalLight(0xffe9c9, 2.2);
    sun.position.set(-9, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 70 });
    scene.add(sun);
    const gleam = new T.DirectionalLight(0xfff4e0, 0.1);
    gleam.position.set(4, 14, -12);
    scene.add(gleam);
    const fill = new T.DirectionalLight(0xffd9b0, 0.55);
    fill.position.set(6, 9, 18);
    scene.add(fill);
    // wood
    const table = mahogany(2048, 2048, { base: [54, 31, 22], dark: [26, 14, 10], high: [88, 54, 37], seed: 3, rings: 22, pores: 0.4, contrast: 2.4 });
    mats.table = new T.MeshStandardMaterial({ map: tex(table), roughness: 0.34, metalness: 0.0 });
    const edge = mahogany(512, 512, { base: [58, 36, 28], dark: [50, 31, 24], high: [70, 45, 35], seed: 8, rings: 14, pores: 0.25 });
    mats.edge = new T.MeshStandardMaterial({ map: tex(edge), roughness: 0.14, metalness: 0.0 });
    // the tile in layers, from its back: black porcelain, a gold leaf, the ivory (the engraved face goes on its top)
    mats.black = new T.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.08, metalness: 0.15 });
    mats.gold = new T.MeshStandardMaterial({ color: 0xd9ab48, emissive: 0x4a3410, roughness: 0.26, metalness: 0.75 });
    mats.ivory = new T.MeshStandardMaterial({ color: 0xf0e6c9, roughness: 0.32, metalness: 0.0 });
    const back = document.createElement("canvas");
    back.width = 384; back.height = 512;
    const bc = back.getContext("2d"), bg = bc.createLinearGradient(0, 0, 384, 512);
    bg.addColorStop(0, "#1b1b22"); bg.addColorStop(0.5, "#0b0b0f"); bg.addColorStop(1, "#15151b");
    bc.fillStyle = bg; bc.fillRect(0, 0, 384, 512);
    bc.strokeStyle = "#d6a84a"; bc.lineWidth = 6;                // the inset rectangle on a tile's back
    bc.beginPath(); bc.roundRect(34, 34, 316, 444, 22); bc.stroke();
    mats.back = new T.MeshStandardMaterial({ map: tex(back), roughness: 0.1, metalness: 0.1 });
    mats.mark = new T.MeshBasicMaterial({ color: 0xd9ac5c, transparent: true, opacity: 0.85 });
    mats.glow = new T.MeshBasicMaterial({ color: 0xf1c564, transparent: true, opacity: 0.55, depthWrite: false });
    mats.pool = new T.MeshBasicMaterial({ color: 0x1a0905, transparent: true, opacity: 0.07, depthWrite: false });
    mats.poolOn = new T.MeshBasicMaterial({ color: 0xf1c564, transparent: true, opacity: 0.1, depthWrite: false });
    mats.headTail = new T.MeshBasicMaterial({ color: 0xf1c564, transparent: true, opacity: 0.7, depthWrite: false });
    // a tile: the mahogany body and its ivory plate as one bevelled solid, centred on its own middle
    const wd = 1;
    geos.body = roundBody(wd, THICK, TL, BEVEL, [T_BLACK, T_GOLD, T_FACE]);
    geos.decal = new T.PlaneGeometry(0.9, 0.9 * TL);
    geos.plate = new T.PlaneGeometry(1, 1);
    host.append(canvas);
    bind(canvas);
    return true;
  }
  /**
   * A tile's face: ivory with a faint grain, the symbol cut into it (a bump map for the groove, a rougher ivory round a
   * glossier, pigment-filled cut). The drawing is an SVG, put on when its image arrives. Kept by tile and by labels.
   */
  function faceMat(k) {
    const key = `${k}:${labels}`;
    if (faceMats.has(key)) return faceMats.get(key);
    const FW = FACE_W * 2, FH = FACE_H * 2, make = () => { const c = document.createElement("canvas"); c.width = FW; c.height = FH; return c; };
    const cv = make(), bump = make(), rough = make(), ctx = cv.getContext("2d"), bx = bump.getContext("2d"), rx = rough.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, FW, FH);
    grad.addColorStop(0, IVORY[0]); grad.addColorStop(1, IVORY[1]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, FW, FH);
    const n = noise2(k + 5);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(120,95,50,${(n(i * 3.1, i * 1.7) * 0.05).toFixed(3)})`; ctx.fillRect((n(i, 7) * 997 % 1) * FW, (n(3, i) * 991 % 1) * FH, 3 + n(i, i) * 5, 2 + n(i, 2) * 3); }
    bx.fillStyle = "#fff"; bx.fillRect(0, 0, FW, FH);
    rx.fillStyle = "#c2c2c2"; rx.fillRect(0, 0, FW, FH);
    const m = new T.MeshStandardMaterial({ map: tex(cv), bumpMap: tex(bump), bumpScale: 7, roughnessMap: tex(rough), roughness: 0.55, metalness: 0.0 });
    for (const t of [m.map, m.bumpMap, m.roughnessMap]) { t.wrapS = t.wrapT = 1001; }         // 1001: ClampToEdge
    m.bumpMap.colorSpace = m.roughnessMap.colorSpace = ""; 
    const ink = { ...INK, num: labels ? "1" : "0" };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40" width="${FW}" height="${FH}">${faceMarkup(k).replace(/var\(--hk-([a-z-]+)(?:,[^)]*)?\)/g, (_, v) => ink[v] ?? "#000")}</svg>`;
    const img = new Image();
    img.onload = () => {
      const x0 = FW * 0.05, y0 = FH * 0.05, w = FW * 0.9, h = FH * 0.9;
      // the groove: soft-edged, and deep (black), and its walls catch the light on the lower lip
      bx.filter = "blur(2.5px) brightness(0)";
      bx.drawImage(img, x0, y0, w, h);
      bx.filter = "none";
      rx.globalAlpha = 0.7; rx.filter = "blur(1.5px) brightness(0)"; rx.drawImage(img, x0, y0, w, h); rx.filter = "none"; rx.globalAlpha = 1;
      // the pigment: a shadow on the upper wall, the colour, and a hairline of light under the lower one
      ctx.save(); ctx.filter = "blur(1.5px) brightness(0)"; ctx.globalAlpha = 0.45; ctx.drawImage(img, x0 - 2.5, y0 - 3, w, h); ctx.restore();
      ctx.save(); ctx.filter = "brightness(2.6) saturate(0.2)"; ctx.globalAlpha = 0.55; ctx.drawImage(img, x0 + 2.5, y0 + 3, w, h); ctx.restore();
      ctx.drawImage(img, x0, y0, w, h);
      ctx.strokeStyle = "rgba(150,118,66,.55)"; ctx.lineWidth = 3;                                 // the border cut round the face
      ctx.beginPath(); ctx.roundRect(10, 10, FW - 20, FH - 20, 26); ctx.stroke();
      bx.strokeStyle = "#555"; bx.lineWidth = 4; bx.beginPath(); bx.roundRect(10, 10, FW - 20, FH - 20, 26); bx.stroke();
      for (const t of [m.map, m.bumpMap, m.roughnessMap]) t.needsUpdate = true;
      redraw();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    faceMats.set(key, m);
    return m;
  }

  // ---------- the table ----------
  function makeTable(wu, hu) {
    const sig = `${wu.toFixed(2)}x${hu.toFixed(2)}`;
    if (sig === tableSig) return;
    tableSig = sig;
    if (tableGroup) { scene.remove(tableGroup); tableGroup.traverse(o => o.geometry?.dispose()); }
    tableGroup = new T.Group();
    const m = 1.6, w = wu + 2 * m, h = hu + 2 * m;
    const top = new T.Mesh(slab(w, 1.4, h, 0.35, -0.7), mats.table);
    top.receiveShadow = true;
    // the slab's sides use the same top texture; its uv is the top's, so lay the grain across the whole top
    tableGroup.add(top);
    // a brass line inlaid just inside the edge, and the cloth's margin kept plain
    const line = (x, z, lw, lh) => { const l = new T.Mesh(geos.plate, mats.mark); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.012, z); l.scale.set(lw, lh, 1); tableGroup.add(l); };
    const ix = w / 2 - 0.55, iz = h / 2 - 0.55, t = 0.05;
    line(0, -iz, 2 * ix, t); line(0, iz, 2 * ix, t); line(-ix, 0, t, 2 * iz); line(ix, 0, t, 2 * iz);
    // the lacquer's reflection: a soft window and its mullions laid over the wood, added to it
    if (!mats.sheen) {
      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 512;
      const c = cv.getContext("2d"), g = c.createLinearGradient(0, 0, 512, 512);
      g.addColorStop(0, "rgba(255,236,205,0)"); g.addColorStop(0.28, "rgba(255,236,205,.55)"); g.addColorStop(0.52, "rgba(255,236,205,.08)"); g.addColorStop(0.7, "rgba(255,236,205,.3)"); g.addColorStop(1, "rgba(255,236,205,0)");
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.globalCompositeOperation = "destination-out";
      const v = c.createRadialGradient(256, 256, 120, 256, 256, 400);        // fades toward the edges
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,1)");
      c.fillStyle = v; c.fillRect(0, 0, 512, 512);
      mats.sheen = new T.MeshBasicMaterial({ map: tex(cv), transparent: true, opacity: 0.035, depthWrite: false, blending: 2 });
    }
    const sheen = new T.Mesh(geos.plate, mats.sheen);
    sheen.rotation.x = -Math.PI / 2; sheen.position.y = 0.004; sheen.scale.set(w * 0.96, h * 0.96, 1);
    tableGroup.add(sheen);
    scene.add(tableGroup);
    tableW = w; tableH = h;
  }

  // ---------- tiles ----------
  const UP = new T.Vector3(0, 1, 0);
  const basis = (f) => {                                          // a standing tile: its face toward f, its length up
    const w = new T.Vector3().crossVectors(f, UP), m = new T.Matrix4().makeBasis(w, f, UP.clone());
    return new T.Quaternion().setFromRotationMatrix(m);
  };
  const FACING = [null, new T.Vector3(1, 0, 0), new T.Vector3(0, 0, -1), new T.Vector3(-1, 0, 0)];   // toward the owner at rel 1, 2, 3
  /** A tile object for what it shows: the body, its face (k >= 0) and/or its polished back. */
  function makeTile(k) {
    const g = new T.Group(), body = new T.Mesh(geos.body, [mats.back, mats.gold, k >= 0 ? faceMat(k) : mats.ivory]);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    return g;
  }
  const ease = (a, b, f) => a + (b - a) * f;

  /**
   * The scene for these items. s = { items, plane: { w, h } (the plane's px), d (a discard's width in px: the unit), plate, me, quiet }.
   * Tiles are kept by key from one call to the next and glide to where they now belong.
   */
  function set(s) {
    if (failed) return false;
    if (!R && !build()) return false;
    const d = s.d, u = v => v / d, cx = s.plane.w / 2, cz = s.plane.h / 2;
    const X = px => u(px - cx), Z = py => u(py - cz);
    resize(s.box.w, s.box.h);
    makeTable(u(s.plane.w), u(s.plane.h));
    if (!view) { startView(); pose(); }
    labels = s.labels !== false;
    const seen = new Set(), snap = items.size === 0 || s.jump;
    // a side's strip laid out again along its length, in order: a standing tile takes its width (and a little for its turn), a set
    // or a pair of flowers lying flat its length, the sets a gap before them, the whole shrunk to the strip (the flat layout packs
    // the standing hand by its thickness, which runs the sets into it)
    const side = new Map();
    for (const r of [1, 3]) {
      const list = s.items.filter(i => i.g3?.kind === "strip" && i.g3.rel === r).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
      if (!list.length) continue;
      const cells = [];
      for (const it of list) {
        const cy = it.y + it.h / 2, last = cells.at(-1);
        if (last && Math.abs(last.cy - cy) < 0.5 && it.g3.small) { last.items.push(it); continue; }       // the second flower of a pair
        const hidden = it.g3.k < 0, len = hidden ? it.w * 1.25 : it.h * 0.98;
        cells.push({ cy, items: [it], len, gap: last && last.part !== it.g3.part ? it.w * 0.5 : 0, part: it.g3.part });
      }
      const strip = s.strips[r], total = cells.reduce((n, c) => n + c.len + c.gap, 0), f = Math.min(1, (strip.h * 0.97) / (total || 1));
      let at = strip.y + (strip.h - total * f) / 2;
      for (const c of cells) {
        at += c.gap * f;
        for (const it of c.items) side.set(it.key, { cy: at + (c.len * f) / 2, f });
        at += c.len * f;
      }
    }
    pulse = false;
    for (const it of s.items) {
      const g3 = it.g3;
      if (!g3) continue;
      seen.add(it.key);
      const sd = side.get(it.key), x = X(it.x + it.w / 2), z = Z(sd ? sd.cy : it.y + it.h / 2), wu = u(sd ? it.w * sd.f : it.w);
      let rec = items.get(it.key);
      if (g3.kind === "pool") continue;
      if (false) {
        const sig = `${g3.on}`;
        if (!rec) { const m = new T.Mesh(geos.plate, g3.on ? mats.poolOn : mats.pool); m.rotation.x = -Math.PI / 2; rec = { group: m, sig: "", flat: true }; items.set(it.key, rec); scene.add(m); }
        if (rec.sig !== sig) { rec.group.material = g3.on ? mats.poolOn : mats.pool; rec.sig = sig; }
        rec.group.position.set(x, 0.008, z); rec.group.scale.set(wu, u(it.h), 1);
        continue;
      }
      // what the tile shows: a wall tile's back up, a standing hand's back toward you, the rest face up
      let k = g3.k ?? -1, backUp = false, quat, pos = { x, y: THICK / 2, z }, scale = wu;
      if (g3.kind === "wall") {
        k = -1; backUp = true;
        const long = it.w > it.h, sc = Math.min(it.w, it.h) / d;
        scale = sc;
        quat = new T.Quaternion().setFromEuler(new T.Euler(0, long ? Math.PI / 2 : 0, Math.PI));   // upside down: the back is up
        for (let n = 0; n < g3.n; n++) {
          const key = `${it.key}#${n}`;
          seen.add(key);
          place(key, -1, true, { x, y: THICK * sc * (n + 0.5), z }, quat, sc, snap, "wall", g3, n);
        }
        continue;
      }
      if (g3.kind === "strip" && k < 0) {                                   // another player's tile: standing, back toward the middle
        // a side's hand is turned a little toward the player, so its backs can be seen and not just its edges
        const a = (42 * Math.PI) / 180, f = g3.rel === 2 ? FACING[2] : new T.Vector3(g3.rel === 1 ? Math.cos(a) : -Math.cos(a), 0, -Math.sin(a));
        quat = basis(f);
                pos = { x, y: (TL * scale) / 2, z };
      } else {
        quat = new T.Quaternion().setFromEuler(new T.Euler(0, -((it.rot || 0) * Math.PI) / 180, 0));
        if (g3.last) { glowAt(`${it.key}~`, x, z, wu, g3.offer, it.rot); seen.add(`${it.key}~`); }
        pos.y = (THICK * wu) / 2;
      }
      if (g3.offer) pulse = true;
      place(it.key, k, backUp, pos, quat, scale, snap, g3.kind, g3);
    }
    // the plate in the middle
    plate(s, X, Z, u);
    for (const [key, rec] of items) if (!seen.has(key)) { scene.remove(rec.group); items.delete(key); }
    redraw();
    return true;
  }
  /** The ring under the latest discard: a brass plate that shows round the tile, brighter while it can be claimed. */
  function glowAt(key, x, z, wu, offer, rot) {
    let rec = items.get(key);
    if (!rec) { const m = new T.Mesh(geos.plate, mats.glow); m.rotation.x = -Math.PI / 2; rec = { group: m, flat: true }; items.set(key, rec); scene.add(m); }
    rec.group.position.set(x, 0.01, z);
    rec.group.rotation.z = ((rot || 0) * Math.PI) / 180;
    rec.group.scale.set(wu * 1.22, wu * TL * 1.16, 1);
    rec.offer = !!offer;
  }
  function place(key, k, backUp, pos, quat, scale, snap, kind, g3, nth = 0) {
    let rec = items.get(key);
    const sig = `${k}${labels ? "n" : ""}`;
    if (!rec || rec.sig !== sig) {
      const was = rec;
      if (was) scene.remove(was.group);
      const group = makeTile(k);
      scene.add(group);
      rec = { group, sig, to: null, from: was?.to };
      items.set(key, rec);
      const born = !was && !snap && kind === "disc" ? 3 : 0;     // a new discard drops in from above
      group.position.set(pos.x, pos.y + born, pos.z);
      group.quaternion.copy(quat); group.scale.setScalar(scale);
    }
    rec.to = { x: pos.x, y: pos.y, z: pos.z, q: quat, s: scale };
    if (snap) { rec.group.position.set(pos.x, pos.y, pos.z); rec.group.quaternion.copy(quat); rec.group.scale.setScalar(scale); }
    // the next tile out of a wall stack and the last one in, marked by a gleam on its back
    const mark = kind === "wall" && nth === (g3.n - 1) && (g3.head || g3.tail);
    if (mark && !rec.mark) { const m = new T.Mesh(geos.plate, mats.headTail); m.rotation.x = Math.PI / 2; m.position.y = -THICK / 2 - 0.012; m.scale.set(0.9, 0.9 * TL, 1); rec.group.add(m); rec.mark = m; }
    if (!mark && rec.mark) { rec.group.remove(rec.mark); rec.mark = null; }
  }

  // ---------- the plate: the round's wind, the wall's count, who is to move, or the discard on offer ----------
  const SERIF = `'Songti TC','STSong','Noto Serif CJK TC','Noto Serif TC','Hiragino Mincho ProN','PMingLiU',serif`;
  function plate(s, X, Z, u) {
    const p = s.plate, q = s.centre;
    if (!p || !q) return;
    const wu = u(p.w), hu = u(p.h), sig = JSON.stringify([q, wu.toFixed(1), hu.toFixed(1)]);
    if (!plateMesh) {
      const cv = document.createElement("canvas");
      plateMesh = new T.Mesh(geos.plate, new T.MeshStandardMaterial({ map: tex(cv), roughness: 0.35, metalness: 0.1, transparent: true }));
      plateMesh.rotation.x = -Math.PI / 2;
      plateMesh.receiveShadow = true;
      scene.add(plateMesh);
    }
    plateMesh.position.set(X(p.x + p.w / 2), 0.014, Z(p.y + p.h / 2));
    plateMesh.scale.set(wu, hu, 1);
    if (sig === plateSig) return;
    plateSig = sig;
    // the texture's size is fixed (a GPU texture can't change size): the plate is drawn at its own proportions and squeezed in
    const cv = plateMesh.material.map.image, pxw = 640, pxh = Math.max(200, Math.round((640 * hu) / wu));
    if (cv.width !== 1024) { cv.width = 1024; cv.height = 512; }
    const c = cv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 1024, 512);
    c.scale(1024 / pxw, 512 / pxh);
    // an inlaid plate: dark wood, a brass line
    c.fillStyle = "#26100a"; c.beginPath(); c.roundRect(4, 4, pxw - 8, pxh - 8, 26); c.fill();
    c.strokeStyle = "#c9a26a"; c.lineWidth = 3; c.beginPath(); c.roundRect(12, 12, pxw - 24, pxh - 24, 20); c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle";
    // the four seats' winds at the plate's edges: yours below, the right's, across, the left's
    const bs = Math.min(pxh * 0.2, 70), at = [[pxw / 2, pxh - bs * 0.85], [pxw - bs * 0.85, pxh / 2], [pxw / 2, bs * 0.85], [bs * 0.85, pxh / 2]];
    q.badges.forEach((b, r) => {
      const [bx, by] = at[r];
      c.fillStyle = b.on ? "#f1c564" : b.dealer ? "#a8382b" : "#4a2616";
      c.beginPath(); c.arc(bx, by, bs * 0.5, 0, 7); c.fill();
      c.fillStyle = b.on ? "#2a120a" : "#f3e8cc"; c.font = `700 ${bs * 0.62}px ${SERIF}`; c.fillText(b.w, bx, by + 2);
    });
    if (q.offer) {
      c.fillStyle = "#f1c564"; c.font = `700 ${pxh * 0.17}px system-ui, sans-serif`; c.fillText(q.offer.tile, pxw / 2, pxh * 0.3);
      c.fillStyle = "#f3e8cc"; c.font = `600 ${pxh * 0.12}px system-ui, sans-serif`; c.fillText(q.offer.who, pxw / 2, pxh * 0.5);
      c.fillStyle = "#c9a26a"; c.font = `500 ${pxh * 0.085}px system-ui, sans-serif`; c.fillText(q.offer.how, pxw / 2, pxh * 0.66);
    } else {
      c.fillStyle = "#f3e8cc"; c.font = `700 ${pxh * 0.34}px ${SERIF}`; c.fillText(q.round, pxw * 0.32, pxh * 0.42);
      c.font = `700 ${pxh * 0.3}px system-ui, sans-serif`; c.fillStyle = "#f1c564"; c.fillText(String(q.left), pxw * 0.64, pxh * 0.38);
      c.font = `500 ${pxh * 0.085}px system-ui, sans-serif`; c.fillStyle = "#c9a26a"; c.fillText("in the wall", pxw * 0.64, pxh * 0.58);
    }
    plateMesh.material.map.needsUpdate = true;
  }

  // ---------- drawing, only while something moves ----------
  /** The canvas covers the whole screen (left of the field to the viewport's edge, top of the screen to the field's foot), the
   *  table framed in the field as if it were the canvas: a wider vertical view, the picture moved to the field's middle. */
  function resize(fw, fh) {
    if (!R) return;
    const r = host.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.round(vw), h = Math.max(Math.round(r.bottom), fh);
    const key = `${w}x${h}:${Math.round(r.left)},${Math.round(r.top)}:${fw}x${fh}`;
    if (key === sized) return;
    sized = key;
    FW = fw; FH = fh; W = w; H = h;
    R.setSize(w, h, false);
    Object.assign(canvas.style, { position: "fixed", left: "0", top: "0", width: `${w}px`, height: `${h}px` });
    cam.aspect = w / h;
    cam.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (h / fh)) * 180) / Math.PI;
    const dx = r.left + fw / 2 - w / 2, dy = r.top + fh / 2 - h / 2;
    cam.setViewOffset(w, h, -dx, -dy, w, h);
    if (view) { const z = view.dist / fit; fit = fitDist(); view.dist = fit * z; pose(); } else cam.updateProjectionMatrix();
  }
  function redraw() { want = true; if (!raf && wanted) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (!R || !wanted || document.hidden) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 0.016;
    last = now; clock += dt;
    let moving = false;
    const k = 1 - Math.exp(-dt * 13);
    for (const rec of items.values()) {
      if (rec.flat) { if (rec.offer) { rec.group.material.opacity = 0.6 + 0.3 * Math.sin(clock * 5); moving = true; } continue; }
      const to = rec.to;
      if (!to) continue;
      const g = rec.group, dx = to.x - g.position.x, dy = to.y - g.position.y, dz = to.z - g.position.z;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.004 || g.quaternion.angleTo(to.q) > 0.004) {
        g.position.x += dx * k; g.position.y += dy * k; g.position.z += dz * k;
        g.quaternion.slerp(to.q, k);
        g.scale.setScalar(ease(g.scale.x, to.s, k));
        moving = true;
      } else { g.position.set(to.x, to.y, to.z); g.quaternion.copy(to.q); g.scale.setScalar(to.s); }
    }
    R.render(scene, cam);
    onFrame();
    want = false;
    if (moving || pulse || want) raf = requestAnimationFrame(frame); else last = 0;
  }

  return {
    set,
    get failed() { return failed; },
    get canvas() { return canvas; },
    resetView: () => { if (view) resetView(); },
    pause(on) { wanted = !on; if (!on) redraw(); },
    show(on) { if (canvas) canvas.hidden = !on; wanted = on; if (on) redraw(); },
    dispose() {
      cancelAnimationFrame(raf); raf = 0;
      for (const rec of items.values()) scene?.remove(rec.group);
      items.clear();
      R?.dispose?.(); R?.forceContextLoss?.();
      canvas?.remove();
      R = null; scene = null; plateMesh = null; plateSig = ""; tableGroup = null; tableSig = ""; view = null;
    },
  };
}
