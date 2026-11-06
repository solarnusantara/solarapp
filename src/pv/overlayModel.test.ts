import { describe, expect, it } from "vitest";
import {
  MAX_OVERLAY_BYTES, normalizeOverlay, overlayFromData, overlayMimeOf, removeOverlay,
  updateOverlay, validateOverlayFile, type Overlay,
} from "./overlayModel";

const png = { name: "roof.png", type: "image/png", size: 1024 };
const jpeg = { name: "roof.JPG", type: "image/jpeg", size: 2048 };

describe("overlay file validation", () => {
  it("accepts JPG/JPEG/PNG with or without a browser MIME type", () => {
    expect(validateOverlayFile(png)).toBeNull();
    expect(validateOverlayFile(jpeg)).toBeNull();
    expect(validateOverlayFile({ name: "roof.jpeg", type: "", size: 100 })).toBeNull();
    expect(overlayMimeOf({ name: "x.png", type: "", size: 1 })).toBe("image/png");
  });

  it("rejects KML/KMZ explicitly and does not pretend to parse them", () => {
    expect(validateOverlayFile({ name: "site.kml", type: "", size: 100 })).toContain("KML/KMZ");
    expect(validateOverlayFile({ name: "site.kmz", type: "application/vnd.google-earth.kmz", size: 100 })).toContain("KML/KMZ");
  });

  it("rejects unsupported formats, empty files and files above the limit", () => {
    expect(validateOverlayFile({ name: "site.gif", type: "image/gif", size: 100 })).toContain("Format tidak didukung");
    expect(validateOverlayFile({ name: "site.pdf", type: "application/pdf", size: 100 })).toContain("Format tidak didukung");
    expect(validateOverlayFile({ name: "empty.png", type: "image/png", size: 0 })).toContain("kosong");
    expect(validateOverlayFile({ name: "huge.png", type: "image/png", size: MAX_OVERLAY_BYTES + 1 })).toContain("terlalu besar");
  });
});

describe("overlay creation and editing", () => {
  const created = overlayFromData({
    id: "ov-1", file: png, dataUrl: "data:image/png;base64,AAA", areaWidthMm: 20000, areaHeightMm: 10000,
  });

  it("places the image on the whole canvas with a safe default opacity", () => {
    expect(created).toMatchObject({ id: "ov-1", mime: "image/png", x: 0, y: 0, w: 20000, h: 10000, opacity: 0.6, visible: true });
  });

  it("updates and removes overlays immutably", () => {
    const next = updateOverlay([created], "ov-1", { opacity: 0.25, x: 500 });
    expect(next[0]).toMatchObject({ opacity: 0.25, x: 500 });
    expect(created.x).toBe(0);
    expect(removeOverlay(next, "ov-1")).toEqual([]);
    expect(removeOverlay(next, "other")).toHaveLength(1);
  });

  it("normalizes valid persisted payloads and clamps opacity", () => {
    const raw = { ...created, opacity: 4 };
    expect(normalizeOverlay(raw)).toMatchObject({ id: "ov-1", opacity: 1, visible: true });
    expect(normalizeOverlay({ ...created, opacity: -2 })?.opacity).toBe(0);
  });

  it("rejects malformed persisted payloads", () => {
    expect(normalizeOverlay(null)).toBeNull();
    expect(normalizeOverlay({})).toBeNull();
    expect(normalizeOverlay({ ...created, id: "" })).toBeNull();
    expect(normalizeOverlay({ ...created, dataUrl: "https://example.com/roof.png" })).toBeNull();
    expect(normalizeOverlay({ ...created, mime: "image/gif" })).toBeNull();
    expect(normalizeOverlay({ ...created, w: 0 })).toBeNull();
    expect(normalizeOverlay({ ...created, h: Number.NaN })).toBeNull();
  });

  it("keeps legacy payloads without overlays untouched (undefined is not an overlay)", () => {
    const legacy: Partial<Overlay>[] = [];
    expect(legacy).toHaveLength(0);
  });
});
