// Static isometric (orthographic) scene for the "Near shadings parameter" print page. Pure: layout in,
// projected polygons out. Geometry only: no building volume is drawn (the layout has none and no height
// is invented); the site is a flat slab, obstacles are boxes only when they carry a height.
import { buildFrame } from "../engine/sceneAdapter";
import type { SavedLayout } from "../engine/layoutStore";
import { isNum } from "./format";

export type Pt = [number, number];
export type IsoKind = "grid" | "site" | "slab" | "walkway" | "module" | "obstacle-top" | "obstacle-side" | "obstacle-flat";
export interface IsoPoly { kind: IsoKind; pts: Pt[]; depth: number }
export interface IsoLabel { text: string; at: Pt; anchor: "start" | "middle" | "end" }
export interface IsoScene {
  polys: IsoPoly[];
  gridLines: Array<[Pt, Pt]>;
  axisLines: Array<{ kind: "east" | "north"; a: Pt; b: Pt }>;
  labels: IsoLabel[];
  viewBox: { x: number; y: number; w: number; h: number };
  moduleCount: number;
  /** Obstacles drawn flat because the layout gives them no height. */
  flatObstacles: number;
}

export interface IsoOptions {
  /** Compass bearing of the camera position seen from the scene centre (135 = south-east). */
  cameraAzimuthDeg?: number;
  elevationDeg?: number;
}

type V3 = [number, number, number]; // east, north, up (m)

export function makeProjector(azDeg: number, elDeg: number) {
  const th = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  const sx = -Math.cos(th), sy = Math.sin(th);
  // screen x grows to the right, screen y grows DOWN (SVG)
  return {
    project: ([e, n, z]: V3): Pt => [e * sx + n * sy, -(z * Math.cos(el) - (e * Math.sin(th) + n * Math.cos(th)) * Math.sin(el))],
    /** Larger = nearer the camera. */
    near: ([e, n, z]: V3) => e * Math.sin(th) + n * Math.cos(th) + z * Math.tan(el),
    camDir: [Math.sin(th), Math.cos(th)] as [number, number],
  };
}

const niceStep = (span: number) => {
  const raw = span / 12;
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};

export function buildIsoScene(layout: SavedLayout | null | undefined, opts: IsoOptions = {}): IsoScene | null {
  if (!layout) return null;
  const segs = (layout.segments ?? []).filter((s) => s.visible !== false);
  const panels = segs.length
    ? segs.flatMap((s) => s.panels.map((p) => ({ p, tilt: Number(s.tilt) || 0, az: Number(s.azimuth) || 0 })))
    : (layout.panels ?? []).map((p) => ({ p, tilt: Number(layout.settings?.tilt) || 0, az: Number(layout.settings?.azimuth) || 0 }));
  if (!panels.length) return null;
  const frame = buildFrame(layout);
  const toE = (x: number, y: number): Pt => frame.toEnu(x, y);
  const cam = makeProjector(opts.cameraAzimuthDeg ?? 135, opts.elevationDeg ?? 35);
  const polys: IsoPoly[] = [];
  const add = (kind: IsoKind, pts3: V3[]) => {
    const c = pts3.reduce((a, q) => [a[0] + q[0] / pts3.length, a[1] + q[1] / pts3.length, a[2] + q[2] / pts3.length] as V3, [0, 0, 0] as V3);
    polys.push({ kind, pts: pts3.map(cam.project), depth: cam.near(c) });
  };
  const ring3 = (ring: Pt[], z = 0): V3[] => ring.map(([e, n]) => [e, n, z]);
  const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => toE(a, b));

  // site slab: the site boundary when the layout has one, plus each segment polygon
  const site = layout.site?.polygonCorners;
  if (site && site.length >= 3) add("site", ring3(site.map((q) => toE(q.x, q.y)), -0.01));
  else {
    // no site boundary saved: the roof plate is the bounding box of the segments (+1 m), flat, no height
    const sp = segs.flatMap((s) => s.polygon ?? []);
    if (sp.length >= 3) {
      const x0 = Math.min(...sp.map((q) => q.x)) - 1000, x1 = Math.max(...sp.map((q) => q.x)) + 1000;
      const y0 = Math.min(...sp.map((q) => q.y)) - 1000, y1 = Math.max(...sp.map((q) => q.y)) + 1000;
      add("site", ring3(rect(x0, y0, x1 - x0, y1 - y0), -0.01));
    }
  }
  for (const s of segs) if ((s.polygon?.length ?? 0) >= 3) add("slab", ring3(s.polygon.map((q) => toE(q.x, q.y)), 0.005));
  for (const w of layout.walkways ?? []) add("walkway", ring3(rect(w.x, w.y, w.w, w.h), 0.01));

  // modules: canvas footprint in true ENU, raised on the up-slope side by the segment tilt
  for (const { p, tilt, az } of panels) {
    const ring = rect(p.x, p.y, p.w, p.h);
    const cE = ring.reduce((a, q) => a + q[0] / 4, 0), cN = ring.reduce((a, q) => a + q[1] / 4, 0);
    const fz: Pt = [Math.sin((az * Math.PI) / 180), Math.cos((az * Math.PI) / 180)];
    const s = ring.map(([e, n]) => (e - cE) * fz[0] + (n - cN) * fz[1]);
    const L = Math.max(...s.map(Math.abs));
    const t = Math.tan((tilt * Math.PI) / 180);
    add("module", ring.map(([e, n], i): V3 => [e, n, 0.02 + (L - s[i]) * t]));
  }

  // obstacles: boxes only with a real height
  let flatObstacles = 0;
  for (const o of layout.obstacles ?? []) {
    const ring = rect(o.x, o.y, o.w, o.h);
    const h = o.heightM;
    if (!isNum(h) || h <= 0) { flatObstacles++; add("obstacle-flat", ring3(ring, 0.02)); continue; }
    add("obstacle-top", ring3(ring, h));
    const cE = ring.reduce((q, r) => q + r[0] / 4, 0), cN = ring.reduce((q, r) => q + r[1] / 4, 0);
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      if ((a[0] - cE) * nx + (a[1] - cN) * ny < 0) { nx = -nx; ny = -ny; }
      if (nx * cam.camDir[0] + ny * cam.camDir[1] <= 0) continue; // faces away from the camera
      add("obstacle-side", [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h], [a[0], a[1], h]]);
    }
  }

  // ground grid + North/East axes around the scene bounds
  const enus: Pt[] = [];
  for (const { p } of panels) enus.push(toE(p.x, p.y), toE(p.x + p.w, p.y + p.h));
  for (const s of segs) for (const q of s.polygon ?? []) enus.push(toE(q.x, q.y));
  for (const q of site ?? []) enus.push(toE(q.x, q.y));
  const minE = Math.min(...enus.map((q) => q[0])), maxE = Math.max(...enus.map((q) => q[0]));
  const minN = Math.min(...enus.map((q) => q[1])), maxN = Math.max(...enus.map((q) => q[1]));
  const step = niceStep(Math.max(maxE - minE, maxN - minN));
  const g0E = Math.floor((minE - step) / step) * step, g1E = Math.ceil((maxE + step) / step) * step;
  const g0N = Math.floor((minN - step) / step) * step, g1N = Math.ceil((maxN + step) / step) * step;
  const gridLines: IsoScene["gridLines"] = [];
  for (let e = g0E; e <= g1E + 1e-6; e += step) gridLines.push([cam.project([e, g0N, 0]), cam.project([e, g1N, 0])]);
  for (let n = g0N; n <= g1N + 1e-6; n += step) gridLines.push([cam.project([g0E, n, 0]), cam.project([g1E, n, 0])]);
  const axisLines: IsoScene["axisLines"] = [
    { kind: "east", a: cam.project([g0E, g0N, 0]), b: cam.project([g1E, g0N, 0]) },
    { kind: "north", a: cam.project([g0E, g0N, 0]), b: cam.project([g0E, g1N, 0]) },
  ];
  const labels: IsoLabel[] = [
    { text: "East", at: cam.project([g1E, g0N, 0]), anchor: "middle" },
    { text: "North", at: cam.project([g0E, g1N, 0]), anchor: "middle" },
  ];

  const xs = [...gridLines.flat().map((q) => q[0]), ...polys.flatMap((q) => q.pts.map((r) => r[0]))];
  const ys = [...gridLines.flat().map((q) => q[1]), ...polys.flatMap((q) => q.pts.map((r) => r[1]))];
  const pad = step * 0.35;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad * 1.6;
  // Flat ground layers always go under everything standing on them (a big slab's centroid depth must not
  // decide the order against its own modules); then far-to-near within each layer.
  const layer = (k: IsoKind) => (k === "site" ? 0 : k === "slab" ? 1 : k === "walkway" ? 2 : 3);
  polys.sort((a, b) => layer(a.kind) - layer(b.kind) || a.depth - b.depth);
  return { polys, gridLines, axisLines, labels, viewBox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, moduleCount: panels.length, flatObstacles };
}
