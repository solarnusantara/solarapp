// Pure adapter: solarapp PV layout (millimetre canvas, Y down, rotated by the first scanner box)
// -> helio `Scene` (local ENU metres, X east, Y north). It is the exact inverse of
// `GoogleMapsModal.handleApply`:
//   rx = (lng - lng0)*mLng*cosA + (lat - lat0)*mLat*sinA     (rotated, "along the building")
//   ry = -(lng - lng0)*mLng*sinA + (lat - lat0)*mLat*cosA
//   x_mm = (rx - minRx + padM)*1000 ;  y_mm = (maxRy - ry + padM)*1000
// so   rx = x/1000 + minRx - padM ;  ry = maxRy + padM - y/1000
//      dE = rx*cosA - ry*sinA   ;  dN = rx*sinA + ry*cosA
// with A = site.boxes[0].rotationAngle (the exact angle; `site.rotationDeg` is Math.round'ed and
// the user can edit it afterwards without moving the polygons), origin = site.coordinates and
// minRx/maxRy recomputed from site.polygonPoints. No physics here, geometry only.
import type { FieldSegment as HelioSegment, Keepout, ModuleInstance, Scene } from "./types";
import type { SavedLayout } from "./layoutStore";
import { isRacking } from "./racking";

const M_PER_DEG_LAT = 111319.49; // identical to GoogleMapsModal.tsx

export interface AdapterWarning { code: string; message: string }

export interface SceneAdapterResult {
  scene: Scene;
  warnings: AdapterWarning[];
  /** Warnings that must stop a run (user has to fix the layout first). */
  blocking: AdapterWarning[];
  /** Common module nameplate (Wp) of every visible segment, null when none / mixed. */
  moduleWp: number | null;
  moduleCount: number;
  /** Dominant (most modules) segment orientation; helio re-derives these from the scene. */
  tiltDeg: number;
  azimuthDeg: number;
  /** Sum of segment polygon areas, m2. */
  roofAreaM2: number;
  latitude: number | null;
  longitude: number | null;
}

export interface Frame {
  /** (x_mm, y_mm) -> [east_m, north_m] */
  toEnu: (xMm: number, yMm: number) => [number, number];
  approximate: boolean;
  angleDeg: number;
  rotationEdited: boolean;
}

export const normAzimuth = (a: number) => ((a % 360) + 360) % 360;

/** Builds the mm -> ENU transform for a layout; `approximate` when polygonPoints are missing. */
export function buildFrame(layout: SavedLayout): Frame {
  const site = layout.site;
  const boxAngle = site?.boxes?.[0]?.rotationAngle;
  const angleDeg = typeof boxAngle === "number" ? boxAngle : site?.rotationDeg ?? 0;
  const rotationEdited =
    typeof boxAngle === "number" && typeof site?.rotationDeg === "number" && Math.round(boxAngle) !== site.rotationDeg;
  const a = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const rot = (rx: number, ry: number): [number, number] => [rx * cosA - ry * sinA, rx * sinA + ry * cosA];

  const pts = site?.polygonPoints;
  const lat0 = site?.coordinates?.lat;
  const lng0 = site?.coordinates?.lng;
  const padM = site?.cropPaddingM;
  if (pts && pts.length > 0 && typeof lat0 === "number" && typeof lng0 === "number" && typeof padM === "number") {
    const mLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
    let minRx = Infinity;
    let maxRy = -Infinity;
    for (const p of pts) {
      const dE = (p.lng - lng0) * mLng;
      const dN = (p.lat - lat0) * M_PER_DEG_LAT;
      const rx = dE * cosA + dN * sinA;
      const ry = -dE * sinA + dN * cosA;
      if (rx < minRx) minRx = rx;
      if (ry > maxRy) maxRy = ry;
    }
    return {
      approximate: false, angleDeg, rotationEdited,
      toEnu: (x, y) => rot(x / 1000 + minRx - padM, maxRy + padM - y / 1000),
    };
  }
  // Fallback: canvas centre = origin (wrong by the rotated-bbox offset; flagged ORIGIN_APPROXIMATE).
  const w = Number(layout.settings?.areaWidth) || 0;
  const h = Number(layout.settings?.areaHeight) || 0;
  return {
    approximate: true, angleDeg, rotationEdited,
    toEnu: (x, y) => rot((x - w / 2) / 1000, (h / 2 - y) / 1000),
  };
}

const polyArea = (ring: Array<[number, number]>) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};

function inPoly(x: number, y: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const rectRing = (x: number, y: number, w: number, h: number) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

/** Row/col from the canvas grid: rows cluster on panel centre Y (top first), cols on X. */
function assignRowCol(panels: Array<{ cx: number; cy: number; h: number }>): Array<{ row: number; col: number }> {
  const order = panels.map((_, i) => i).sort((a, b) => panels[a].cy - panels[b].cy);
  const out = new Array<{ row: number; col: number }>(panels.length);
  const rows: number[][] = [];
  let curY = -Infinity;
  for (const i of order) {
    const tol = panels[i].h / 2;
    if (rows.length === 0 || panels[i].cy - curY > tol) {
      rows.push([i]);
      curY = panels[i].cy;
    } else {
      rows[rows.length - 1].push(i);
    }
  }
  rows.forEach((members, r) => {
    members.sort((a, b) => panels[a].cx - panels[b].cx).forEach((i, c) => { out[i] = { row: r, col: c }; });
  });
  return out;
}

export function layoutToScene(layout: SavedLayout): SceneAdapterResult {
  const warnings: AdapterWarning[] = [];
  const blocking: AdapterWarning[] = [];
  const frame = buildFrame(layout);
  if (frame.approximate) {
    warnings.push({ code: "ORIGIN_APPROXIMATE", message: "Data kotak GIS (polygonPoints/cropPaddingM) tidak lengkap: titik asal diperkirakan di tengah kanvas, posisi absolut dan bayangan bisa meleset beberapa meter." });
  }
  if (frame.rotationEdited) {
    warnings.push({ code: "ROTATION_EDITED", message: `Rotasi kanvas diubah setelah Apply GIS (kotak ${layout.site?.boxes?.[0]?.rotationAngle}° vs ${layout.site?.rotationDeg}°). Engine memakai sudut kotak GIS saat Apply.` });
  }
  if (!layout.site?.coordinates) {
    blocking.push({ code: "NO_SITE", message: "Lokasi proyek belum ditentukan: ambil lokasi dari peta (Site GIS) dulu." });
  }

  const segments = (layout.segments ?? []).filter((s) => s.visible !== false);
  const fieldSegments: HelioSegment[] = [];
  const keepouts: Keepout[] = [];
  const modules: ModuleInstance[] = [];
  const wattSet = new Set<number>();
  let roofAreaM2 = 0;
  let unassigned = 0;
  let dominant: { n: number; tilt: number; az: number } = { n: -1, tilt: 0, az: 0 };

  for (const seg of segments) {
    const ring = (seg.polygon ?? []).map((p) => frame.toEnu(p.x, p.y));
    if (ring.length < 3) {
      warnings.push({ code: "SEGMENT_NO_POLYGON", message: `Segmen "${seg.name}" tidak punya poligon dan dilewati.` });
      continue;
    }
    const az = normAzimuth(Number(seg.azimuth) || 0);
    // Every helio Racking value except `ground_mount`/`tracker` has the same name in RackingType.
    const racking = layout.engine_inputs?.racking;
    fieldSegments.push({
      id: seg.id,
      ...(isRacking(racking) ? { racking_type: racking } : {}),
      polygon_enu: ring,
      tilt_deg: Number(seg.tilt) || 0,
      azimuth_deg: az,
      setback_m: (Number(seg.setback) || 0) / 1000,
    });
    roofAreaM2 += polyArea(ring);
  }
  const segIds = new Set(fieldSegments.map((s) => s.id));
  const segById = new Map(segments.map((s) => [s.id, s]));

  // Panels: the segment's own list first (carries segmentId), fallback point-in-polygon.
  const perSeg = new Map<string, Array<{ id: number; x: number; y: number; w: number; h: number }>>();
  for (const seg of segments) {
    if (!segIds.has(seg.id)) continue;
    for (const p of seg.panels ?? []) {
      let owner = p.segmentId && segIds.has(p.segmentId) ? p.segmentId : seg.id;
      if (p.segmentId && !segIds.has(p.segmentId)) {
        const hit = segments.find((s) => segIds.has(s.id) && inPoly(p.x + p.w / 2, p.y + p.h / 2, s.polygon));
        if (!hit) { unassigned++; continue; }
        owner = hit.id;
      }
      if (!perSeg.has(owner)) perSeg.set(owner, []);
      perSeg.get(owner)!.push(p);
    }
  }
  if (unassigned > 0) {
    warnings.push({ code: "PANELS_OUTSIDE_SEGMENT", message: `${unassigned} panel tidak berada di segmen yang terlihat dan tidak dikirim.` });
  }

  for (const [segId, panels] of perSeg) {
    const seg = segById.get(segId)!;
    const rc = assignRowCol(panels.map((p) => ({ cx: p.x + p.w / 2, cy: p.y + p.h / 2, h: p.h })));
    const az = normAzimuth(Number(seg.azimuth) || 0);
    const tilt = Number(seg.tilt) || 0;
    if (panels.length > 0) wattSet.add(Number(seg.moduleWatts));
    if (panels.length > dominant.n) dominant = { n: panels.length, tilt, az };
    panels.forEach((p, i) => {
      const [e, n] = frame.toEnu(p.x + p.w / 2, p.y + p.h / 2);
      modules.push({
        id: `${segId}-m${p.id}`,
        field_segment_id: segId,
        center_enu: [e, n, 0], // racking height is not in the layout: not invented
        tilt_deg: tilt,
        azimuth_deg: az,
        orientation: p.h >= p.w ? "portrait" : "landscape",
        frame: 0,
        row: rc[i].row,
        col: rc[i].col,
        status: "manual",
      });
    });
  }

  for (const o of layout.obstacles ?? []) {
    const hasH = typeof o.heightM === "number" && o.heightM >= 0;
    if (!hasH) {
      warnings.push({ code: "OBSTACLE_NO_HEIGHT", message: `Rintangan "${o.label}" tidak punya tinggi: dikirim tinggi 0 (tidak membayangi). Isi tinggi agar bayangannya dihitung.` });
    }
    keepouts.push({
      id: `obs-${o.id}`,
      kind: "polygon",
      polygon_enu: rectRing(o.x, o.y, o.w, o.h).map((p) => frame.toEnu(p.x, p.y)),
      height_m: hasH ? (o.heightM as number) : 0,
      label: o.label,
    });
  }
  for (const w of layout.walkways ?? []) {
    keepouts.push({
      id: `walk-${w.id}`,
      kind: "polygon",
      polygon_enu: rectRing(w.x, w.y, w.w, w.h).map((p) => frame.toEnu(p.x, p.y)),
      height_m: 0,
      label: w.label ?? "Walkway",
    });
  }

  if (modules.length === 0) {
    blocking.push({ code: "NO_SEGMENTS", message: "Belum ada panel di layout: buat segmen dan isi panel dulu." });
  }
  if (wattSet.size > 1) {
    blocking.push({ code: "MIXED_MODULE_POWER", message: `Segmen memakai daya modul berbeda (${[...wattSet].sort((a, b) => a - b).join(", ")} Wp). Satu simulasi hanya menerima satu jenis modul.` });
  }
  if (fieldSegments.length > 1 && fieldSegments.every((s) => s.azimuth_deg === 0)) {
    warnings.push({ code: "AZIMUTH_ALL_ZERO", message: "Semua segmen berazimut 0° (menghadap utara, nilai bawaan). Pastikan azimut sudah diisi: kompas, 0=utara, 180=selatan." });
  }

  const scene: Scene = { scene_version: 1, field_segments: fieldSegments, keepouts, modules, equipment: [] };
  return {
    scene, warnings, blocking,
    moduleWp: wattSet.size === 1 ? [...wattSet][0] : null,
    moduleCount: modules.length,
    tiltDeg: dominant.n >= 0 ? dominant.tilt : 0,
    azimuthDeg: dominant.n >= 0 ? dominant.az : 0,
    roofAreaM2,
    latitude: layout.site?.coordinates?.lat ?? null,
    longitude: layout.site?.coordinates?.lng ?? null,
  };
}
