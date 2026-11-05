import { describe, expect, it } from "vitest";
import { col, dailyInOut, monthlyEnergy, monthlyMean, powerHistogram, sum, toKwhFactor, type HourlyTable } from "./aggregate";
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
