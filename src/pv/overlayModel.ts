// Image-only overlays for the Advanced workspace. Overlays are additive data stored beside the
// existing satellite background; they never modify site/HM geometry, Field Segments, modules,
// walkways or obstacles.
//
// Coordinates are millimetres on the same canvas as the rest of PV Layout 2D. There is no
// georeferencing step: the user places the image explicitly with X/Y/W/H in metres, and the UI says
// so. KML/KMZ and ZIP parsing are intentionally unsupported.

export type OverlayMime = "image/jpeg" | "image/png";

export interface Overlay {
  id: string;
  name: string;
  mime: OverlayMime;
  /** Data URL, persisted with the existing layout payload. */
  dataUrl: string;
  /** Canvas placement, millimetres. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 */
  opacity: number;
  visible: boolean;
}

export interface OverlayFileLike {
  name: string;
  type: string;
  size: number;
}

/** 2 MB keeps the data URL small enough for the existing localStorage/cloud payload. */
export const MAX_OVERLAY_BYTES = 2 * 1024 * 1024;
export const SUPPORTED_OVERLAY_MIME: readonly OverlayMime[] = ["image/jpeg", "image/png"];

const extensionOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
};

export function overlayMimeOf(file: OverlayFileLike): OverlayMime | null {
  if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
  // Some browsers/OSes leave `type` empty for drag-and-drop files.
  const ext = extensionOf(file.name);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return null;
}

/** null = valid; otherwise a user-facing reason. KML/KMZ get an explicit unsupported message. */
export function validateOverlayFile(file: OverlayFileLike): string | null {
  const ext = extensionOf(file.name);
  if (ext === "kml" || ext === "kmz" || file.type.includes("kml") || file.type.includes("kmz")) {
    return "KML/KMZ tidak didukung pada build ini. Gunakan JPG, JPEG, atau PNG.";
  }
  if (!overlayMimeOf(file)) return "Format tidak didukung. Gunakan JPG, JPEG, atau PNG.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "File kosong atau tidak terbaca.";
  if (file.size > MAX_OVERLAY_BYTES) {
    return `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum ${MAX_OVERLAY_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/** Default placement covers the editable canvas; the user can move/resize it explicitly. */
export function overlayFromData(args: {
  id: string;
  file: OverlayFileLike;
  dataUrl: string;
  areaWidthMm: number;
  areaHeightMm: number;
}): Overlay {
  const mime = overlayMimeOf(args.file);
  if (!mime) throw new Error("Unsupported overlay MIME type");
  return {
    id: args.id,
    name: args.file.name,
    mime,
    dataUrl: args.dataUrl,
    x: 0,
    y: 0,
    w: Math.max(1, Math.round(args.areaWidthMm)),
    h: Math.max(1, Math.round(args.areaHeightMm)),
    opacity: 0.6,
    visible: true,
  };
}

export function updateOverlay(overlays: readonly Overlay[], id: string, patch: Partial<Omit<Overlay, "id">>): Overlay[] {
  return overlays.map((o) => (o.id === id ? { ...o, ...patch } : o));
}

export function removeOverlay(overlays: readonly Overlay[], id: string): Overlay[] {
  return overlays.filter((o) => o.id !== id);
}

/** Rejects malformed legacy/additive payload entries instead of rendering unbounded data. */
export function normalizeOverlay(raw: unknown): Overlay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<Overlay>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.dataUrl !== "string" || !o.dataUrl.startsWith("data:image/")) return null;
  if (o.mime !== "image/jpeg" && o.mime !== "image/png") return null;
  if (
    typeof o.x !== "number" || !Number.isFinite(o.x) ||
    typeof o.y !== "number" || !Number.isFinite(o.y) ||
    typeof o.w !== "number" || !Number.isFinite(o.w) ||
    typeof o.h !== "number" || !Number.isFinite(o.h)
  ) return null;
  if (o.w <= 0 || o.h <= 0) return null;
  const opacity = typeof o.opacity === "number" && Number.isFinite(o.opacity) ? Math.min(1, Math.max(0, o.opacity)) : 0.6;
  return {
    id: o.id,
    name: typeof o.name === "string" && o.name ? o.name : "Overlay",
    mime: o.mime,
    dataUrl: o.dataUrl,
    x: o.x as number,
    y: o.y as number,
    w: o.w as number,
    h: o.h as number,
    opacity,
    visible: o.visible !== false,
  };
}
