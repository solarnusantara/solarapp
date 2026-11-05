// Normal-distribution helpers for the P50-P90 page. z constants are helio's own (UncertaintyReport.z).
import { isNum } from "./format";

export const Z = { p75: 0.6745, p90: 1.2816, p95: 1.6449, p99: 2.3263 } as const;

/** Relative sigma (fraction of P50) implied by an exceedance value: sigma = (P50 - Px) / (z * P50). */
export function sigmaRelFromExceedance(p50: number, px: number, z: number): number | null {
  if (!(p50 > 0) || !isNum(px) || !(z > 0)) return null;
  const s = (p50 - px) / (z * p50);
  return s > 0 ? s : null;
}

/** Sigma in energy units. Prefers helio's sigma (% of P50), else derives it from P90 then P95. */
export function sigmaEnergy(p50: number | null, sigmaPct: number | null | undefined, p90: number | null, p95: number | null, z: { p90: number; p95: number } = Z): number | null {
  if (!isNum(p50) || !(p50 > 0)) return null;
  if (isNum(sigmaPct) && sigmaPct > 0) return (p50 * sigmaPct) / 100;
  const r = (isNum(p90) ? sigmaRelFromExceedance(p50, p90, z.p90) : null) ?? (isNum(p95) ? sigmaRelFromExceedance(p50, p95, z.p95) : null);
  return r === null ? null : r * p50;
}

export const SPAN_SIGMA = 4;
/** Standard normal density phi((x - mu)/sigma): peak 0.3989, drawn on PVsyst's 0..0.5 axis. */
export const phi = (x: number, mu: number, sigma: number) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / Math.sqrt(2 * Math.PI);

export function normalCurve(p50: number, sigma: number, count = 161) {
  const lo = p50 - SPAN_SIGMA * sigma, hi = p50 + SPAN_SIGMA * sigma;
  return { lo, hi, points: Array.from({ length: count }, (_, i) => { const x = lo + ((hi - lo) * i) / (count - 1); return { x, y: phi(x, p50, sigma) }; }) };
}
