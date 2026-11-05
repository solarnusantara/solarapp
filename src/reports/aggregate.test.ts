import { describe, expect, it } from "vitest";
import { behindPlaneSegments, col, dailyInOut, monthlyEnergy, monthlyMean, powerHistogram, splitAtAzimuthWrap, sum, sunPathSegments, toKwhFactor, toSouthZeroAzimuth, type HourlyTable } from "./aggregate";
import { DASH, monthlyUniform, n, pct, withUnit } from "./format";

const columns = [
  { name: "grid_power", unit: "kW", status: "modeled" },
  { name: "poa_irradiance", unit: "W/m2", status: "modeled" },
  { name: "temp_air", unit: "C", status: "weather" },
];
// 4 rows: two in January day 1, two in February day 1.
const h = {
  month: [1, 1, 2, 2], day: [1, 1, 1, 1], hour: [10, 11, 10, 11],
  grid_power: [10, 20, 5, 0], poa_irradiance: [500, 1000, 250, 0], temp_air: [20, 30, 25, 25],
} as unknown as HourlyTable;

describe("aggregate", () => {
  it("sums power columns to monthly kWh using the column unit", () => {
    const m = monthlyEnergy(h, columns, "grid_power")!;
    expect(m[0]).toBe(30);
    expect(m[1]).toBe(5);
    expect(sum(m)).toBe(35);
  });
  it("converts W/m2 rows to kWh/m2", () => {
    expect(monthlyEnergy(h, columns, "poa_irradiance")![0]).toBeCloseTo(1.5, 9);
    expect(toKwhFactor("Wh/m2")).toBe(0.001);
  });
  it("returns null for missing columns or unknown units, never zeros", () => {
    expect(monthlyEnergy(h, columns, "nope")).toBeNull();
    expect(monthlyEnergy(h, [{ name: "grid_power", unit: "furlong", status: "modeled" }], "grid_power")).toBeNull();
    expect(col(null, "x")).toBeNull();
    expect(monthlyEnergy(null, columns, "grid_power")).toBeNull();
  });
  it("monthly mean for temperatures", () => {
    const m = monthlyMean(h, "temp_air")!;
    expect(m[0]).toBe(25);
    expect(m[1]).toBe(25);
  });
  it("daily input/output points per calendar day", () => {
    const d = dailyInOut(h, columns, "poa_irradiance", "grid_power")!;
    expect(d.length).toBe(2);
    expect(d[0].y).toBe(30);
    expect(d[0].x).toBeCloseTo(1.5, 9);
  });
  it("histogram bins energy into 5 kW classes", () => {
    const b = powerHistogram(h, columns, "grid_power", 5)!;
    expect(b[0].from).toBe(0);
    expect(b[1].energyKwh).toBe(5);   // 5 kW
    expect(b[2].energyKwh).toBe(10);  // 10 kW
    expect(b[4].energyKwh).toBe(20);  // 20 kW
    expect(powerHistogram(h, columns, "nope")).toBeNull();
  });
});

describe("power histogram (MWh per 5 kW class)", () => {
  const kwCols = [{ name: "ac_power", unit: "kW", status: "modeled" }];
  it("reports MWh = sum of hourly kWh / 1000 and conserves total energy", () => {
    const hh = { ac_power: [0, 100, 102, 600, 600, 12] } as unknown as HourlyTable;
    const b = powerHistogram(hh, kwCols, "ac_power", 5)!;
    expect(b.reduce((a, x) => a + x.energyMwh, 0)).toBeCloseTo((100 + 102 + 600 + 600 + 12) / 1000, 12);
    expect(b[20].energyMwh).toBeCloseTo(0.202, 12); // 100 + 102 kW -> class [100,105)
    expect(b[20].energyMwh).toBeCloseTo(b[20].energyKwh / 1000, 12);
  });
  it("puts values exactly at the maximum in the last bin and nowhere else", () => {
    const hh = { ac_power: [5, 600, 600] } as unknown as HourlyTable;
    const b = powerHistogram(hh, kwCols, "ac_power", 5)!;
    expect(b).toHaveLength(121);
    expect(b[120].from).toBe(600);
    expect(b[120].energyKwh).toBe(1200);
    expect(b.slice(0, 120).reduce((a, x) => a + x.energyKwh, 0)).toBe(5);
  });
});

describe("sun path (PVsyst axis)", () => {
  it("converts helio azimuth (0 = N, 90 = E) to south = 0, east negative", () => {
    expect(toSouthZeroAzimuth(180)).toBe(0);
    expect(toSouthZeroAzimuth(90)).toBe(-90);
    expect(toSouthZeroAzimuth(270)).toBe(90);
    expect(toSouthZeroAzimuth(0)).toBe(180);
    expect(toSouthZeroAzimuth(359)).toBe(179);
    expect(toSouthZeroAzimuth(1)).toBe(-179);
  });
  it("drops samples at or below the horizon and keeps time order for a southern pass", () => {
    const segs = sunPathSegments([
      { azimuth_deg: 270, elevation_deg: 20, minute_of_day: 900 },
      { azimuth_deg: 100, elevation_deg: 10, minute_of_day: 400 },
      { azimuth_deg: 180, elevation_deg: 70, minute_of_day: 720 },
      { azimuth_deg: 80, elevation_deg: -5, minute_of_day: 300 },
    ]);
    expect(segs).toEqual([[[-80, 10], [0, 70], [90, 20]]]);
  });
  it("cuts a northern pass at the +-180 edge instead of drawing a line across the chart", () => {
    const segs = sunPathSegments([
      { azimuth_deg: 70, elevation_deg: 10, minute_of_day: 400 },
      { azimuth_deg: 2, elevation_deg: 60, minute_of_day: 700 },
      { azimuth_deg: 358, elevation_deg: 60, minute_of_day: 740 },
      { azimuth_deg: 290, elevation_deg: 10, minute_of_day: 1000 },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0][segs[0].length - 1][0]).toBe(-180);
    expect(segs[1][0][0]).toBe(180);
    for (const s of segs) for (const [a] of s) expect(Math.abs(a)).toBeLessThanOrEqual(180);
    expect(splitAtAzimuthWrap([[10, 1], [20, 2]])).toEqual([[[10, 1], [20, 2]]]);
  });
  it("behind-the-plane height equals the tilt where the sun is opposite the plane", () => {
    const segs = behindPlaneSegments(10, 0); // plane faces south, tilt 10
    const north = segs.flat().find(([az]) => az === 180)!;
    expect(north[1]).toBeCloseTo(10, 9);
    expect(segs.flat().every(([az]) => Math.abs(az) > 90 - 1e-9)).toBe(true);
    expect(behindPlaneSegments(0, 0)).toEqual([]);
  });
});

describe("format", () => {
  it("renders a dash for every missing or non-finite value", () => {
    expect(n(undefined)).toBe(DASH);
    expect(n(NaN)).toBe(DASH);
    expect(pct(null)).toBe(DASH);
    expect(withUnit(undefined, "kWh")).toBe(DASH);
    expect(monthlyUniform(null)).toBe(DASH);
  });
  it("formats real numbers", () => {
    expect(pct(79.14, 1)).toBe("79.1%");
    expect(withUnit(744, "kW", 0)).toContain("744");
  });
});
