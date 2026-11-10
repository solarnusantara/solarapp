// Geometry helpers that read the saved PV layout (mm canvas space, Y down) for the reports.
// Mirrors how PVLayout.tsx draws the satellite crop and how EngineeringReport feeds Report3DViewport.
import type { SavedLayout } from "../engine/layoutStore";
import { isNum } from "./format";

export interface RenderRect { x: number; y: number; w: number; h: number; color: string }
export interface RenderSegment {
  id: string;
  name: string;
  color: string;
  polygon?: Array<{ x: number; y: number }>;
  panels: Array<{ x: number; y: number; w: number; h: number; color: string }>;
}
export interface RenderModel {
  w: number; h: number;
  bg: { href: string; cx: number; cy: number; size: number; rotate: number } | null;
  rects: RenderRect[];
  segments: RenderSegment[];
  obstacles: Array<{ id?: string; x: number; y: number; w: number; h: number; label?: string }>;
  walkways: Array<{ id?: string; x: number; y: number; w: number; h: number; label?: string }>;
  siteBoundary: { x: number; y: number; w: number; h: number } | null;
  moduleCount: number;
}

const allPanels = (l: SavedLayout) => {
  const fromSeg = (l.segments ?? []).filter((s) => s.visible !== false).flatMap((s) => s.panels.map((p) => ({ ...p, color: s.color || "#2f2fe0" })));
  if (fromSeg.length) return fromSeg;
  return (l.panels ?? []).map((p) => ({ ...p, color: "#2f2fe0" }));
};

export function bboxOfPanels(l: SavedLayout) {
  const ps = allPanels(l);
  if (!ps.length) return null;
  const minX = Math.min(...ps.map((p) => p.x)), minY = Math.min(...ps.map((p) => p.y));
  const maxX = Math.max(...ps.map((p) => p.x + p.w)), maxY = Math.max(...ps.map((p) => p.y + p.h));
  return { minX, minY, maxX, maxY };
}

/** Canvas size in mm: the layout's area settings, else the panel bounding box (no invented area). */
export function canvasSize(l: SavedLayout): { w: number; h: number } | null {
  const s = l.settings ?? {};
  if (isNum(Number(s.areaWidth)) && Number(s.areaWidth) > 0 && Number(s.areaHeight) > 0) return { w: Number(s.areaWidth), h: Number(s.areaHeight) };
  const b = bboxOfPanels(l);
  return b ? { w: b.maxX + b.minX, h: b.maxY + b.minY } : null;
}

export function renderModel(l: SavedLayout | null | undefined): RenderModel | null {
  if (!l) return null;
  const size = canvasSize(l);
  if (!size) return null;

  const rawSegs = ((l.segments ?? []) as any[]).filter((s) => s.visible !== false);
  const segments: RenderSegment[] = rawSegs.map((s) => ({
    id: s.id,
    name: s.name || "Segment",
    color: s.color || "#38bdf8",
    polygon: s.polygon,
    panels: (s.panels ?? []).map((p: any) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      color: s.color || "#38bdf8",
    })),
  }));

  const rects: RenderRect[] = segments.length > 0
    ? segments.flatMap((s) => s.panels)
    : allPanels(l).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, color: p.color }));

  let bg: RenderModel["bg"] = null;
  if (l.backgroundImage) {
    const rot = l.site?.rotationDeg || 0;
    const norm = ((rot % 360) + 360) % 360;
    const spanM = l.site?.imageSpanM ? l.site.imageSpanM * 1.25 : (Math.hypot(size.w, size.h) / 1000) * 1.35;
    bg = { href: l.backgroundImage, cx: size.w / 2, cy: size.h / 2, size: spanM * 1000, rotate: norm > 180 ? norm - 360 : norm };
  }

  return {
    ...size,
    bg,
    rects,
    segments,
    obstacles: (l.obstacles ?? []).map((o: any) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, label: o.label })),
    walkways: (l.walkways ?? []).map((w: any) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, label: w.label || "Walkway 2m" })),
    siteBoundary: { x: 0, y: 0, w: size.w, h: size.h },
    moduleCount: rects.length,
  };
}

/** Props for EngineeringReport's Report3DViewport, built the same way EngineeringReport does. */
export function viewport3DProps(l: SavedLayout | null | undefined, projectId: string | null | undefined) {
  if (!l) return null;
  const size = canvasSize(l);
  const panels = allPanels(l);
  if (!size || !panels.length) return null;
  const s = l.settings ?? {};
  const coords = l.site?.coordinates && isNum(Number(l.site.coordinates.lat)) ? { lat: Number(l.site.coordinates.lat), lng: Number(l.site.coordinates.lng) } : undefined;
  let camera: { position: [number, number, number]; target: [number, number, number] } | null = null;
  try {
    const raw = localStorage.getItem(`solar-apps-3d-cam:${projectId ?? "default"}`);
    if (raw) camera = JSON.parse(raw);
  } catch { /* no saved camera */ }
  return {
    panels,
    obstacles: l.obstacles ?? [],
    areaW: size.w,
    areaH: size.h,
    moduleW: Number(s.moduleWidth) || l.segments?.[0]?.moduleWidth || 2278,
    moduleH: Number(s.moduleHeight) || l.segments?.[0]?.moduleHeight || 1134,
    tilt: Number(s.tilt) || l.segments?.[0]?.tilt || 10,
    siteCorners: l.site?.polygonCorners,
    coords,
    camera,
  };
}

/**
 * Collector area of the layout: sum of every visible panel's footprint (mm canvas -> m2).
 * Efficiency at STC = module nameplate / (module area x 1000 W/m2), from the PAN Pnom the caller passes.
 */
export function moduleAreaStats(l: SavedLayout | null | undefined, nameplateW: number | null | undefined): { areaM2: number | null; effPct: number | null } {
  if (!l) return { areaM2: null, effPct: null };
  const panels = allPanels(l);
  if (!panels.length) return { areaM2: null, effPct: null };
  const areaM2 = panels.reduce((a, p) => a + (p.w * p.h) / 1e6, 0);
  const per = areaM2 / panels.length;
  const effPct = isNum(nameplateW) && nameplateW > 0 && per > 0 ? (nameplateW / (per * 1000)) * 100 : null;
  return { areaM2, effPct };
}
