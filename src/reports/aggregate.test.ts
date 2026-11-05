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

import { horizonDiffuseFactor, pvsystAzimuth, sunBandQuads } from "./aggregate";
describe("horizon diffuse factor and sun band", () => {
  it("flat horizon -> 1; constant 30 deg horizon -> 1 - sin^2(30) = 0.75", () => {
    expect(horizonDiffuseFactor([{ azimuth_deg: 0, elevation_deg: 0 }, { azimuth_deg: 180, elevation_deg: 0 }])).toBeCloseTo(1, 9);
    expect(horizonDiffuseFactor([{ azimuth_deg: 0, elevation_deg: 30 }, { azimuth_deg: 180, elevation_deg: 30 }])).toBeCloseTo(0.75, 6);
    expect(horizonDiffuseFactor([])).toBeNull();
  });
  it("band is built from quads between neighbouring dates and consecutive times, unwrapped across +-180", () => {
    const mk = (m: number, az: number, el: number) => ({ minute_of_day: m, azimuth_deg: az, elevation_deg: el });
    const d1 = [mk(420, 60, 10), mk(430, 62, 12), mk(440, 64, 14)];
    const d2 = [mk(420, 70, 10), mk(430, 72, 12), mk(440, 74, 14)];
    const d3 = [mk(420, 80, 10), mk(430, 82, 12), mk(440, 84, 14)];
    expect(sunBandQuads([d1, d2, d3], 1)).toHaveLength(4); // 2 date pairs x 2 time steps
    const wrap = sunBandQuads([[mk(420, 170, 10), mk(430, 190, 12)], [mk(420, 175, 10), mk(430, 195, 12)]], 1);
    expect(wrap).toHaveLength(1);
    for (const q of wrap) for (const p of q) expect(Math.abs(p[0] - q[0][0])).toBeLessThan(180);
    expect(sunBandQuads([d1], 1)).toEqual([]);
    expect(sunBandQuads([null, d1], 1)).toEqual([]);
  });
});

// Reference sun position (helio convention: azimuth 0 = N, 90 = E) to test the hemisphere axis.
function sunAt(latDeg: number, month: number, day: number, solarHour: number) {
  const n = Math.floor(30.4 * (month - 1)) + day;
  const dec = (23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + n)) * Math.PI) / 180;
  const ha = ((solarHour - 12) * 15 * Math.PI) / 180, lat = (latDeg * Math.PI) / 180;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(ha), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(ha) * Math.sin(lat));
  return { azimuth_deg: (((az * 180) / Math.PI) + 360) % 360, elevation_deg: (el * 180) / Math.PI };
}

describe("PVsyst azimuth axis follows the hemisphere", () => {
  it("formulas: south = -a, north = a - 180, range (-180, 180]", () => {
    expect(pvsystAzimuth(90, -7)).toBe(-90);   // east negative
    expect(pvsystAzimuth(270, -7)).toBe(90);   // west positive
    expect(pvsystAzimuth(0, -7)).toBe(0);      // north = 0 in the south
    expect(pvsystAzimuth(180, -7)).toBe(180);  // south = +-180
    expect(pvsystAzimuth(180, 7)).toBe(0);     // north hemisphere: south = 0
    expect(pvsystAzimuth(90, 7)).toBe(-90);
    expect(pvsystAzimuth(0, 7)).toBe(180);
    expect(pvsystAzimuth(196.7, -7)).toBeCloseTo(163.3, 9);
  });
  it("lat -6.96: Dec-22 noon is at +-180 near 73.6 deg, Jun-22 noon at 0 near 59.6 deg, mornings negative", () => {
    const lat = -6.96;
    const dec = sunAt(lat, 12, 22, 12), jun = sunAt(lat, 6, 22, 12);
    expect(Math.abs(pvsystAzimuth(dec.azimuth_deg, lat))).toBeGreaterThan(179);
    expect(dec.elevation_deg).toBeCloseTo(73.6, 0);
    expect(Math.abs(pvsystAzimuth(jun.azimuth_deg, lat))).toBeLessThan(1);
    expect(jun.elevation_deg).toBeCloseTo(59.6, 0);
    for (const m of [[12, 22], [6, 22], [3, 20]]) {
      expect(pvsystAzimuth(sunAt(lat, m[0], m[1], 8).azimuth_deg, lat)).toBeLessThan(0); // 08:00 = east = negative
      expect(pvsystAzimuth(sunAt(lat, m[0], m[1], 16).azimuth_deg, lat)).toBeGreaterThan(0);
    }
  });
  it("northern site: noon is at 0 (south) and mornings are negative", () => {
    const lat = 40, s = sunAt(lat, 3, 20, 12);
    expect(Math.abs(pvsystAzimuth(s.azimuth_deg, lat))).toBeLessThan(1);
    expect(pvsystAzimuth(sunAt(lat, 3, 20, 8).azimuth_deg, lat)).toBeLessThan(0);
  });
});
