import { describe, expect, it } from "vitest";
import { pvsystAzimuth } from "./aggregate";
import { isoAttenuationText, isoAzimuth, isoContourSegments, isoLevelStyle, isoMissingNote, hasIsoData, ISO_LEVEL_STYLES } from "./isoShading";

const LAT_S = -6.96, LAT_N = 40;

describe("isoAzimuth", () => {
  it("northern hemisphere: response convention (south = 0, east negative) is unchanged", () => {
    expect(isoAzimuth(0, LAT_N)).toBe(0);
    expect(isoAzimuth(-90, LAT_N)).toBe(-90);
    expect(isoAzimuth(135, LAT_N)).toBe(135);
    expect(isoAzimuth(-180, LAT_N)).toBe(-180);
    expect(isoAzimuth(-50, null)).toBe(-50);
  });
  it("southern hemisphere: lands where pvsystAzimuth puts the same helio azimuth", () => {
    for (const helio of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const response = pvsystAzimuth(helio, 1); // northern form = helio - 180
      expect(isoAzimuth(response, LAT_S)).toBeCloseTo(pvsystAzimuth(helio, LAT_S), 9);
    }
  });
  it("helio south (180) maps to the same x position in both conventions", () => {
    const x = (az: number) => (180 - az) / 360;
    const response = 0; // south in the response
    expect(x(isoAzimuth(response, LAT_N))).toBeCloseTo(x(pvsystAzimuth(180, LAT_N)), 9);
    expect(x(isoAzimuth(response, LAT_S))).toBeCloseTo(x(pvsystAzimuth(180, LAT_S)), 9); // both land on the +-180 edge
    expect(Math.abs(isoAzimuth(response, LAT_S))).toBe(180);
  });
  it("southern: east stays negative, north is the centre", () => {
    expect(isoAzimuth(-90, LAT_S)).toBeCloseTo(-90, 9); // east
    expect(isoAzimuth(90, LAT_S)).toBeCloseTo(90, 9); // west
    expect(Math.abs(isoAzimuth(180, LAT_S))).toBeCloseTo(0, 9); // north
    expect(Math.abs(isoAzimuth(-180, LAT_S))).toBeCloseTo(0, 9);
  });
});

describe("isoContourSegments", () => {
  it("northern: identity, a closed polyline keeps its closing point", () => {
    const pl: Array<[number, number]> = [[-10, 2], [10, 2], [10, 8], [-10, 8], [-10, 2]];
    const segs = isoContourSegments({ level: 0.05, polylines: [pl] }, LAT_N);
    expect(segs).toEqual([pl]);
  });
  it("southern: a polyline around south is cut at the +-180 edge, nothing crosses the chart", () => {
    const pl: Array<[number, number]> = [[-20, 3], [20, 3], [20, 9], [-20, 9], [-20, 3]];
    const segs = isoContourSegments({ level: 0.1, polylines: [pl] }, LAT_S);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const s of segs) for (let i = 1; i < s.length; i++) expect(Math.abs(s[i][0] - s[i - 1][0])).toBeLessThan(180);
    const xs = segs.flat().map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-180, 9);
    expect(Math.max(...xs)).toBeCloseTo(180, 9);
  });
  it("southern: a polyline around north stays in one piece near the centre", () => {
    const pl: Array<[number, number]> = [[160, 3], [-160, 3], [-160, 9], [160, 9], [160, 3]];
    const segs = isoContourSegments({ level: 0.1, polylines: [pl] }, LAT_S);
    expect(segs).toHaveLength(1);
    for (const p of segs[0]) expect(Math.abs(p[0])).toBeLessThanOrEqual(20.0001);
  });
});

describe("level styles", () => {
  it("maps the five PVsyst levels to distinct dash patterns, 40% thickest", () => {
    expect(ISO_LEVEL_STYLES.map((s) => s.label)).toEqual(["Shading loss: 1%", "Shading loss: 5%", "Shading loss: 10%", "Shading loss: 20%", "Shading loss: 40%"]);
    expect(new Set(ISO_LEVEL_STYLES.map((s) => s.dash)).size).toBe(5);
    expect(isoLevelStyle(0.01).dash).toBe("1.2 2"); // dotted
    expect(isoLevelStyle(0.4).width).toBeGreaterThan(isoLevelStyle(0.2).width);
    expect(isoLevelStyle(0.4).dash!.split(" ")).toHaveLength(4); // dash-dot
  });
  it("tolerates float noise and unknown levels", () => {
    expect(isoLevelStyle(0.1 + 1e-12).label).toBe("Shading loss: 10%");
    expect(isoLevelStyle(0.3)).toMatchObject({ label: "Shading loss: 30%", dash: undefined });
  });
});

describe("isoAttenuationText", () => {
  it("prints the loss fraction (1 - remaining) with 3 decimals", () => {
    expect(isoAttenuationText({ diffuse_attenuation: 0.994, albedo_attenuation: 0.435 })).toBe("Attenuation for diffuse: 0.006 and albedo: 0.565");
    expect(isoAttenuationText({ diffuse_attenuation: 1, albedo_attenuation: 1 })).toBe("Attenuation for diffuse: 0.000 and albedo: 0.000");
  });
  it("never prints a number for albedo when the engine did not model it", () => {
    expect(isoAttenuationText({ diffuse_attenuation: 0.973, albedo_attenuation: 1 }, ["ISO_ALBEDO_NOT_MODELLED"]))
      .toBe("Attenuation for diffuse: 0.027 and albedo: — (tidak dimodelkan engine)");
  });
  it("dash for non-finite values", () => {
    expect(isoAttenuationText({ diffuse_attenuation: NaN, albedo_attenuation: 0.5 })).toBe("Attenuation for diffuse: — and albedo: 0.500");
  });
});

describe("missing data", () => {
  it("note keeps the original sentence and appends helio's code verbatim", () => {
    expect(isoMissingNote(null)).toBe("Diagram iso-shading belum disediakan engine.");
    expect(isoMissingNote({ status: "unavailable" })).toBe("Diagram iso-shading belum disediakan engine.");
    expect(isoMissingNote({ status: "error", code: "scene_missing" })).toBe("Diagram iso-shading belum disediakan engine. (scene_missing)");
  });
  it("hasIsoData is false for null, empty and malformed results", () => {
    expect(hasIsoData(null)).toBe(false);
    expect(hasIsoData({ orientations: [], warnings: [] })).toBe(false);
    expect(hasIsoData({} as never)).toBe(false);
  });
});
