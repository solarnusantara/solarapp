// Pure keepout/walkway helpers used by the PV Layout 2D Keepouts workspace.
//
// The persisted model is intentionally unchanged:
//   walkways:  { id: string; x, y, w, h (mm); label?; visible? }
//   obstacles: { id: number; x, y, w, h (mm); label; heightM?; visible? }
// This module only builds a read-only unified view and immutable edit helpers. It never
// merges the two arrays and never changes the rectangle geometry model.

export type KeepoutKind = "walkway" | "obstacle";

export interface KeepoutRef {
  kind: KeepoutKind;
  id: string | number;
}

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WalkwayLike extends RectLike {
  id: string;
  label?: string;
  visible?: boolean;
}

export interface ObstacleLike extends RectLike {
  id: number;
  label: string;
  heightM?: number;
  visible?: boolean;
}

export interface KeepoutView extends KeepoutRef, RectLike {
  key: string;
  label: string;
  visible: boolean;
  heightM?: number;
}

export const keepoutKey = (ref: KeepoutRef): string => `${ref.kind}:${ref.id}`;
export const sameKeepout = (a: KeepoutRef | null | undefined, b: KeepoutRef | null | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && String(a.id) === String(b.id);

export const mmToM = (mm: number): number => Math.round((mm / 1000) * 1000) / 1000;
export const mToMm = (m: number): number => Math.round(m * 1000);

/** Unified list in render order: walkways first, then obstacles (obstacles are on top in the canvas). */
export function toKeepoutViews(walkways: readonly WalkwayLike[], obstacles: readonly ObstacleLike[]): KeepoutView[] {
  const views: KeepoutView[] = [];
  for (const w of walkways) {
    views.push({
      kind: "walkway",
      id: w.id,
      key: keepoutKey({ kind: "walkway", id: w.id }),
      label: w.label?.trim() || "Walkway",
      x: w.x, y: w.y, w: w.w, h: w.h,
      visible: w.visible !== false,
    });
  }
  for (const o of obstacles) {
    views.push({
      kind: "obstacle",
      id: o.id,
      key: keepoutKey({ kind: "obstacle", id: o.id }),
      label: o.label?.trim() || `Keepout ${o.id}`,
      x: o.x, y: o.y, w: o.w, h: o.h,
      visible: o.visible !== false,
      ...(typeof o.heightM === "number" && Number.isFinite(o.heightM) ? { heightM: o.heightM } : {}),
    });
  }
  return views;
}

export function findKeepoutView(views: readonly KeepoutView[], ref: KeepoutRef | null | undefined): KeepoutView | null {
  if (!ref) return null;
  return views.find((v) => sameKeepout(v, ref)) ?? null;
}

/** Topmost rectangle hit. `toleranceMm` makes thin/small objects easier to click. */
export function hitTestKeepout(
  point: { x: number; y: number },
  views: readonly KeepoutView[],
  toleranceMm = 0,
): KeepoutView | null {
  for (let i = views.length - 1; i >= 0; i--) {
    const v = views[i];
    if (
      point.x >= v.x - toleranceMm &&
      point.x <= v.x + v.w + toleranceMm &&
      point.y >= v.y - toleranceMm &&
      point.y <= v.y + v.h + toleranceMm
    ) return v;
  }
  return null;
}

export function moveRect<T extends RectLike>(rect: T, dxMm: number, dyMm: number): T {
  return { ...rect, x: Math.round(rect.x + dxMm), y: Math.round(rect.y + dyMm) };
}

export function updateWalkwayRect<T extends WalkwayLike>(
  walkways: readonly T[],
  id: string,
  patch: Partial<Pick<WalkwayLike, "x" | "y" | "w" | "h" | "label" | "visible">>,
): T[] {
  return walkways.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

export function updateObstacleRect<T extends ObstacleLike>(
  obstacles: readonly T[],
  id: number,
  patch: Partial<Pick<ObstacleLike, "x" | "y" | "w" | "h" | "label" | "heightM" | "visible">>,
): T[] {
  return obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o));
}

export function deleteWalkway(walkways: readonly WalkwayLike[], id: string): WalkwayLike[] {
  return walkways.filter((w) => w.id !== id);
}

export function deleteObstacle(obstacles: readonly ObstacleLike[], id: number): ObstacleLike[] {
  return obstacles.filter((o) => o.id !== id);
}

/** True when a rectangle has finite positive geometry. Used for validation before creation. */
export function isValidRect(rect: RectLike): boolean {
  return [rect.x, rect.y, rect.w, rect.h].every((n) => typeof n === "number" && Number.isFinite(n)) && rect.w > 0 && rect.h > 0;
}
