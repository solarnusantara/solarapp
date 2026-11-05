import { describe, expect, it } from "vitest";
import { normalCurve, phi, sigmaEnergy, sigmaRelFromExceedance, Z } from "./probability";

describe("probability curve math", () => {
  it("uses helio z constants", () => {
    expect(Z).toEqual({ p75: 0.6745, p90: 1.2816, p95: 1.6449, p99: 2.3263 });
  });
  it("sigma from P90 and P95 agree for a consistent normal (PVsyst Mas Silueta numbers)", () => {
    const p50 = 1049.404, p90 = 971.519, p95 = 949.606;
    const s90 = sigmaRelFromExceedance(p50, p90, Z.p90)!, s95 = sigmaRelFromExceedance(p50, p95, Z.p95)!;
    expect(s90).toBeCloseTo((p50 - p90) / (1.2816 * p50), 12);
    expect(s90).toBeCloseTo(0.0579, 3);
    expect(Math.abs(s90 - s95)).toBeLessThan(0.002);
  });
  it("helio sigma% wins; falls back to P90 then P95; null without data", () => {
    expect(sigmaEnergy(1000, 5, 900, null)).toBeCloseTo(50, 9);
    expect(sigmaEnergy(1000, null, 1000 - 1.2816 * 50, null)).toBeCloseTo(50, 6);
    expect(sigmaEnergy(1000, null, null, 1000 - 1.6449 * 50)).toBeCloseTo(50, 6);
    expect(sigmaEnergy(1000, null, null, null)).toBeNull();
    expect(sigmaEnergy(null, 5, null, null)).toBeNull();
  });
  it("curve spans P50 +- 4 sigma, peaks at 0.3989 at P50 and P90 sits where z = -1.2816", () => {
    const c = normalCurve(1000, 50);
    expect(c.lo).toBe(800); expect(c.hi).toBe(1200);
    const peak = Math.max(...c.points.map((p) => p.y));
    expect(peak).toBeCloseTo(0.39894, 4);
    expect(phi(1000 - 1.2816 * 50, 1000, 50)).toBeCloseTo(0.17549, 3);
    expect(c.points[0].y).toBeCloseTo(phi(800, 1000, 50), 12);
  });
});
