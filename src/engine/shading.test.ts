import { describe, expect, it } from "vitest";
import { shadingFingerprint, summarizeIsoShading } from "./shading";
import type { IsoShadingResult } from "./types";
import type { SavedLayout } from "./layoutStore";

const result: IsoShadingResult = {
  orientations: [
    {
      orientation: { tilt_deg: 10, azimuth_deg: 180, azimuth_pvsyst_deg: 0 },
      array_ids: ["arr-1"],
      module_count: 24,
      grid: { az_deg: [0], el_deg: [30], loss: [[0.2]] },
      contours: [{ level: 0.2, polylines: [] }],
      diffuse_attenuation: 0.91,
      albedo_attenuation: 0.97,
    },
    {
      orientation: { tilt_deg: 15, azimuth_deg: 90, azimuth_pvsyst_deg: -90 },
      array_ids: ["arr-2"],
      module_count: 6,
      grid: { az_deg: [0], el_deg: [30], loss: [[0.1]] },
      contours: [{ level: 0.1, polylines: [] }, { level: 0.2, polylines: [] }],
      diffuse_attenuation: 0.95,
      albedo_attenuation: 0.99,
    },
  ],
  warnings: ["geometry approximated"],
};

const layout = (): SavedLayout => ({
  settings: { areaWidth: 20000, areaHeight: 10000 },
  segments: [{
    id: "seg-a",
    name: "Segment A",
    color: "#3b82f6",
    polygon: [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 5000 },
      { x: 0, y: 5000 },
    ],
    orientation: "landscape",
    tilt: 10,
    azimuth: 0,
    gap: 20,
    setback: 0,
    moduleWatts: 580,
    moduleWidth: 2000,
    moduleHeight: 1000,
    panels: [],
    visible: true,
  }],
  walkways: [],
  obstacles: [],
  site: null,
});

describe("iso-shading summary", () => {
  it("returns null when Helio returned no orientations", () => {
    expect(summarizeIsoShading(null)).toBeNull();
    expect(summarizeIsoShading({ orientations: [], warnings: [] })).toBeNull();
  });

  it("summarises real values without inventing figures", () => {
    const summary = summarizeIsoShading(result)!;
    expect(summary.orientationCount).toBe(2);
    expect(summary.moduleCount).toBe(30);
    expect(summary.levels).toEqual([0.1, 0.2]);
    expect(summary.warnings).toEqual(["geometry approximated"]);
    expect(summary.orientations[0]).toMatchObject({
      tiltDeg: 10,
      azimuthDeg: 180,
      moduleCount: 24,
      contourCount: 1,
    });
    expect(summary.orientations[0].diffuseLossPct).toBeCloseTo(9, 6);
    expect(summary.orientations[0].albedoLossPct).toBeCloseTo(3, 6);
  });

  it("keeps missing attenuation as null instead of defaulting to zero", () => {
    const partial = {
      orientations: [{
        orientation: { tilt_deg: 5, azimuth_deg: 0, azimuth_pvsyst_deg: 180 },
        array_ids: [],
        module_count: 1,
        grid: { az_deg: [], el_deg: [], loss: [] },
        contours: [],
      }],
      warnings: [],
    } as unknown as IsoShadingResult;
    const summary = summarizeIsoShading(partial)!;
    expect(summary.orientations[0].diffuseLossPct).toBeNull();
    expect(summary.orientations[0].albedoLossPct).toBeNull();
  });
});

describe("shading fingerprint", () => {
  it("is stable for identical layout/weather/assumption", () => {
    expect(shadingFingerprint(layout(), null, false)).toBe(shadingFingerprint(layout(), null, false));
  });

  it("changes when the row-to-row assumption changes", () => {
    expect(shadingFingerprint(layout(), null, false)).not.toBe(shadingFingerprint(layout(), null, true));
  });

  it("changes when the weather choice changes", () => {
    const a = shadingFingerprint(layout(), null, false);
    const b = shadingFingerprint(layout(), { kind: "dataset", id: "ds-1", label: "NASA POWER" } as any, false);
    expect(a).not.toBe(b);
  });

  it("changes when the layout changes", () => {
    const a = shadingFingerprint(layout(), null, false);
    const changed = layout();
    changed.walkways = [{ id: "w-1", x: 0, y: 0, w: 2000, h: 2000 }];
    expect(a).not.toBe(shadingFingerprint(changed, null, false));
  });
});
