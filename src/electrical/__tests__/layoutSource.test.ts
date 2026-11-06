import { describe, expect, it } from "vitest";

import {
  IMPLICIT_SEGMENT_ID,
  LAYOUT_STORAGE_PREFIX,
  computeLayoutFingerprint,
  emptyLayoutSnapshot,
  layoutStorageKey,
  loadLayoutSnapshot,
  normalizeSettings,
  parseLayoutPayload,
  resolveLayoutSnapshot,
  stableHash
} from "../layoutSource";
import type { StorageLike } from "../types";
import { CIKARANG_LAYOUT } from "../../defaultProjectsData";

function panel(id: number, x = 0, y = 0, w = 1000, h = 500) {
  return { id, x, y, w, h };
}

function basicPayload(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "proj-test",
    settings: {
      areaWidth: 10000,
      areaHeight: 5000,
      moduleWidth: 2000,
      moduleHeight: 1000,
      gap: 20,
      rows: 2,
      cols: 2,
      watts: 550,
      tilt: 10,
      orientation: "landscape",
      setback: 0,
      obstacleWidth: 1000,
      obstacleHeight: 1000,
      system: "Rooftop"
    },
    panels: [panel(1), panel(2, 1200)],
    obstacles: [],
    site: null,
    ...overrides
  };
}

function memoryStorage(entries: Record<string, string>): StorageLike {
  return {
    getItem(key: string) {
      return entries[key] ?? null;
    }
  };
}

describe("layoutSource — payload normalisation", () => {
  it("remaps legacy panel* keys to module* and reports the fixes", () => {
    const snapshot = parseLayoutPayload({
      projectId: "legacy",
      settings: { panelWidth: 2000, panelHeight: 1000, panelWatts: 550 },
      panels: [panel(1), panel(2, 1200)]
    });

    expect(snapshot.settings.moduleWidth).toBe(2000);
    expect(snapshot.settings.moduleHeight).toBe(1000);
    expect(snapshot.settings.watts).toBe(550);
    expect(snapshot.legacyKeysNormalized).toEqual([
      "moduleWidth <- panelWidth",
      "moduleHeight <- panelHeight",
      "watts <- panelWatts"
    ]);
  });

  it("prefers runtime module* keys over legacy panel* keys", () => {
    const snapshot = parseLayoutPayload({
      settings: { moduleWidth: 2278, panelWidth: 999, watts: 580, panelWatts: 100 },
      panels: [panel(1)]
    });

    expect(snapshot.settings.moduleWidth).toBe(2278);
    expect(snapshot.settings.watts).toBe(580);
    expect(snapshot.legacyKeysNormalized).toEqual([]);
  });

  it("normalises the real seeded Cikarang layout without inventing values", () => {
    const snapshot = parseLayoutPayload(CIKARANG_LAYOUT);

    expect(snapshot.panelCount).toBe(CIKARANG_LAYOUT.panels.length);
    expect(snapshot.settings.watts).toBe(550);
    expect(snapshot.settings.moduleWidth).toBe(2278);
    expect(snapshot.dcKwp).toBeCloseTo((snapshot.panelCount * 550) / 1000, 6);
    expect(snapshot.legacyKeysNormalized).toContain("watts <- panelWatts");
  });

  it("ignores invalid and duplicate panels with explicit warnings", () => {
    const snapshot = parseLayoutPayload({
      settings: { watts: 550 },
      panels: [
        panel(1),
        { id: 2, x: 0, y: 0, w: -5, h: 100 },
        { id: 1, x: 10, y: 10, w: 100, h: 100 }
      ]
    });

    expect(snapshot.panels).toHaveLength(1);
    expect(snapshot.panelCount).toBe(1);
    expect(snapshot.warnings).toContain("Panels: 1 invalid entry was ignored (missing or non-numeric geometry).");
    expect(snapshot.warnings).toContain("Panels: 1 duplicate panel id was ignored.");
  });

  it("returns an empty snapshot instead of throwing for invalid input", () => {
    const snapshot = parseLayoutPayload("not-a-layout", { projectId: "p1" });

    expect(snapshot.source).toBe("empty");
    expect(snapshot.projectId).toBe("p1");
    expect(snapshot.panelCount).toBe(0);
    expect(snapshot.dcKwp).toBe(0);
    expect(snapshot.warnings.join(" ")).toContain("is not an object");
    expect(snapshot.segments).toHaveLength(1);
  });

  it("warns when the payload has no panels array", () => {
    const snapshot = parseLayoutPayload({ settings: { watts: 550 } });

    expect(snapshot.panelCount).toBe(0);
    expect(snapshot.warnings).toContain("Layout payload has no panels array.");
  });

  it("unwraps the REST layout_data envelope", () => {
    const snapshot = parseLayoutPayload({
      layout_data: basicPayload({ projectId: "rest-1" })
    });

    expect(snapshot.projectId).toBe("rest-1");
    expect(snapshot.panelCount).toBe(2);
  });

  it("normalises site coordinates, polygon and obstacles", () => {
    const snapshot = parseLayoutPayload(
      basicPayload({
        site: {
          coordinates: { lat: -6.36, lng: 107.16 },
          address: "Cikarang",
          polygonCorners: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 }
          ],
          polygonPoints: [
            { lat: -6.36, lng: 107.16 },
            { lat: -6.361, lng: 107.16 },
            { lat: -6.361, lng: 107.161 }
          ]
        },
        obstacles: [
          { id: 7, x: 0, y: 0, w: 500, h: 500, label: "HVAC", heightM: 3.2 },
          { id: 8, x: 10, y: 10, w: 100, h: 100 }
        ]
      })
    );

    expect(snapshot.site?.coordinates).toEqual({ lat: -6.36, lng: 107.16 });
    expect(snapshot.site?.polygonCorners).toHaveLength(3);
    expect(snapshot.site?.polygonPoints).toHaveLength(3);
    expect(snapshot.obstacles).toHaveLength(2);
    expect(snapshot.obstacles[0].heightM).toBe(3.2);
    expect(snapshot.obstacles[1].label).toBe("OBS-02");
  });
});

describe("layoutSource — segments", () => {
  it("creates one implicit segment covering every panel when the layout has no segments", () => {
    const snapshot = parseLayoutPayload(basicPayload());

    expect(snapshot.segments).toHaveLength(1);
    const segment = snapshot.segments[0];
    expect(segment.id).toBe(IMPLICIT_SEGMENT_ID);
    expect(segment.source).toBe("implicit");
    expect(segment.panelCount).toBe(2);
    expect(segment.panelIds).toEqual([1, 2]);
    expect(segment.dcKwp).toBeCloseTo(1.1, 6);
    expect(segment.corners).toEqual([
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 5000 },
      { x: 0, y: 5000 }
    ]);
    expect(segment.warnings[0]).toContain("Field Segment model not saved yet");
  });

  it("uses the site polygon for the implicit segment when one exists", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 400 }
    ];
    const snapshot = parseLayoutPayload(basicPayload({ site: { polygonCorners: corners } }));

    expect(snapshot.segments[0].corners).toEqual(corners);
  });

  it("builds per-segment snapshots when a segment-aware payload exists", () => {
    const snapshot = parseLayoutPayload({
      settings: { watts: 580 },
      panels: [
        { ...panel(1), segmentId: "seg-a" },
        { ...panel(2), segmentId: "seg-a" },
        { ...panel(3), segmentId: "seg-b" },
        { ...panel(4), segmentId: "seg-b" },
        { ...panel(5), segmentId: "seg-b" }
      ],
      segments: [
        {
          id: "seg-a",
          name: "Roof A",
          boundary: {
            corners: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 }
            ]
          },
          settings: { watts: 600, panelWidth: 2100 }
        },
        {
          id: "seg-b",
          name: "Roof B",
          corners: [
            { x: 200, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 100 }
          ]
        }
      ]
    });

    expect(snapshot.segments).toHaveLength(2);
    const [a, b] = snapshot.segments;
    expect(a.id).toBe("seg-a");
    expect(a.name).toBe("Roof A");
    expect(a.source).toBe("layout");
    expect(a.panelCount).toBe(2);
    expect(a.panelIds).toEqual([1, 2]);
    expect(a.dcKwp).toBeCloseTo(1.2, 6);
    expect(a.settings.moduleWidth).toBe(2100);
    expect(a.corners).toHaveLength(3);
    expect(b.panelCount).toBe(3);
    expect(b.settings.watts).toBe(580);
  });

  it("groups unassigned and unknown-segment panels into an implicit fallback segment", () => {
    const snapshot = parseLayoutPayload({
      settings: { watts: 550 },
      panels: [
        { ...panel(1), segmentId: "seg-a" },
        { ...panel(2), segmentId: "unknown-seg" },
        panel(3)
      ],
      segments: [
        {
          id: "seg-a",
          name: "Roof A",
          corners: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 }
          ]
        }
      ]
    });

    expect(snapshot.segments).toHaveLength(2);
    const fallback = snapshot.segments.find(segment => segment.source === "implicit");
    expect(fallback?.panelIds).toEqual([2, 3]);
    expect(fallback?.panelCount).toBe(2);
    expect(snapshot.warnings.join(" ")).toContain('unknown segment "unknown-seg"');
  });

  it("does not invent segment boundaries when only panel segment ids exist", () => {
    const snapshot = parseLayoutPayload({
      settings: { watts: 550 },
      panels: [
        { ...panel(1), segmentId: "seg-a" },
        { ...panel(2), segmentId: "seg-b" }
      ]
    });

    expect(snapshot.segments).toHaveLength(2);
    for (const segment of snapshot.segments) {
      expect(segment.corners).toEqual([]);
      expect(segment.warnings.join(" ")).toContain("geometry is unavailable");
    }
  });

  it("ignores duplicate segment ids", () => {
    const snapshot = parseLayoutPayload({
      panels: [{ ...panel(1), segmentId: "seg-a" }],
      segments: [
        { id: "seg-a", name: "First" },
        { id: "seg-a", name: "Second" }
      ]
    });

    expect(snapshot.segments.filter(segment => segment.id === "seg-a")).toHaveLength(1);
    expect(snapshot.warnings.join(" ")).toContain('duplicate id "seg-a"');
  });
});

describe("layoutSource — fingerprint", () => {
  it("is stable for identical payloads and independent of panel/key order", () => {
    const first = parseLayoutPayload(basicPayload());
    const second = parseLayoutPayload(basicPayload());

    const reordered = basicPayload({
      panels: [panel(2, 1200), panel(1)],
      settings: {
        system: "Rooftop",
        obstacleHeight: 1000,
        obstacleWidth: 1000,
        setback: 0,
        orientation: "landscape",
        tilt: 10,
        watts: 550,
        cols: 2,
        rows: 2,
        gap: 20,
        moduleHeight: 1000,
        moduleWidth: 2000,
        areaHeight: 5000,
        areaWidth: 10000
      }
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).toBe(parseLayoutPayload(reordered).fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when module power, panel geometry or panel count changes", () => {
    const base = parseLayoutPayload(basicPayload());
    const changedWatts = parseLayoutPayload(
      basicPayload({ settings: { ...basicPayload().settings, watts: 600 } })
    );
    const movedPanel = parseLayoutPayload(
      basicPayload({ panels: [panel(1, 5), panel(2, 1200)] })
    );
    const extraPanel = parseLayoutPayload(
      basicPayload({ panels: [panel(1), panel(2, 1200), panel(3, 2400)] })
    );

    expect(changedWatts.fingerprint).not.toBe(base.fingerprint);
    expect(movedPanel.fingerprint).not.toBe(base.fingerprint);
    expect(extraPanel.fingerprint).not.toBe(base.fingerprint);
    expect(extraPanel.dcKwp).toBeCloseTo(1.65, 6);
  });

  it("computes a deterministic hash helper", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
    const snapshot = emptyLayoutSnapshot("p1");
    expect(snapshot.fingerprint).toBe(computeLayoutFingerprint(snapshot));
  });
});

describe("layoutSource — source resolution", () => {
  it("prefers a remote payload with panels over local and seed data", () => {
    const snapshot = resolveLayoutSnapshot({
      projectId: "p1",
      remoteRaw: basicPayload({ panels: [panel(1), panel(2), panel(3)] }),
      localRaw: basicPayload({ panels: [panel(1)] }),
      seedRaw: basicPayload({
        panels: [panel(1), panel(2), panel(3), panel(4), panel(5)]
      })
    });

    expect(snapshot.source).toBe("remote");
    expect(snapshot.panelCount).toBe(3);
  });

  it("falls back to the local draft when the remote payload has no panels", () => {
    const snapshot = resolveLayoutSnapshot({
      projectId: "p1",
      remoteRaw: basicPayload({ panels: [] }),
      localRaw: basicPayload({ panels: [panel(1)] }),
      seedRaw: basicPayload({ panels: [panel(1), panel(2)] })
    });

    expect(snapshot.source).toBe("local");
    expect(snapshot.panelCount).toBe(1);
  });

  it("falls back to seed data when remote and local are absent", () => {
    const snapshot = resolveLayoutSnapshot({
      projectId: "p1",
      seedRaw: basicPayload({ panels: [panel(1), panel(2)] })
    });

    expect(snapshot.source).toBe("seed");
    expect(snapshot.panelCount).toBe(2);
  });

  it("returns an empty snapshot when no source is supplied", () => {
    const snapshot = resolveLayoutSnapshot({ projectId: "p1" });

    expect(snapshot.source).toBe("empty");
    expect(snapshot.projectId).toBe("p1");
    expect(snapshot.panelCount).toBe(0);
  });
});

describe("layoutSource — storage", () => {
  it("mirrors the PV Layout storage key", () => {
    expect(layoutStorageKey("user-1", "proj-1")).toBe(
      `${LAYOUT_STORAGE_PREFIX}:user-1:proj-1`
    );
    expect(layoutStorageKey("user-1", null)).toBe(
      `${LAYOUT_STORAGE_PREFIX}:user-1:unassigned`
    );
  });

  it("loads and parses a draft from injected storage", () => {
    const storage = memoryStorage({
      [layoutStorageKey("user-1", "proj-1")]: JSON.stringify(
        basicPayload({ projectId: "proj-1" })
      )
    });

    const snapshot = loadLayoutSnapshot({
      userId: "user-1",
      projectId: "proj-1",
      storage
    });

    expect(snapshot.source).toBe("local");
    expect(snapshot.projectId).toBe("proj-1");
    expect(snapshot.panelCount).toBe(2);
  });

  it("reports unavailable storage instead of touching window", () => {
    const snapshot = loadLayoutSnapshot({
      userId: "user-1",
      projectId: "proj-1",
      storage: null
    });

    expect(snapshot.source).toBe("empty");
    expect(snapshot.warnings.join(" ")).toContain("Browser storage is unavailable");
  });

  it("reports invalid JSON without throwing", () => {
    const storage = memoryStorage({
      [layoutStorageKey("user-1", "proj-1")]: "{not-json"
    });

    const snapshot = loadLayoutSnapshot({
      userId: "user-1",
      projectId: "proj-1",
      storage
    });

    expect(snapshot.source).toBe("empty");
    expect(snapshot.warnings.join(" ")).toContain("could not be parsed as JSON");
  });

  it("returns an empty snapshot when the draft key is absent", () => {
    const snapshot = loadLayoutSnapshot({
      userId: "user-1",
      projectId: "proj-1",
      storage: memoryStorage({})
    });

    expect(snapshot.source).toBe("empty");
    expect(snapshot.panelCount).toBe(0);
    expect(snapshot.warnings.join(" ")).toContain("No saved PV Layout");
  });
});

describe("layoutSource — settings defaults", () => {
  it("never returns NaN for missing settings", () => {
    const settings = normalizeSettings(undefined);

    for (const value of Object.values(settings)) {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
    expect(settings.system).toBe("Rooftop");
    expect(settings.orientation).toBe("landscape");
  });
});
