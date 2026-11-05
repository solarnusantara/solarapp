// Pure aggregation of helio hourly columns. Only sums / means / unit conversions of engine values:
// no physics. A column that is absent, non-numeric, or in an unknown unit gives null.
import type { HourlyColumnSpec, HourlyResponse } from "../engine/types/local";
import { isNum } from "./format";

export type HourlyTable = HourlyResponse["hourly"];
export const NONLEAP_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Numeric column by name (null when absent / not an all-numeric array). */
export function col(h: HourlyTable | null | undefined, name: string): number[] | null {
  const v = h ? (h as Record<string, unknown>)[name] : null;
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number") ? (v as number[]) : null;
}

export function unitOf(columns: HourlyColumnSpec[] | undefined, name: string): string | null {
  return columns?.find((c) => c.name === name)?.unit ?? null;
}

const normUnit = (u: string) => u.toLowerCase().replace(/\s/g, "").replace("²", "2").replace("^2", "2");

/** Hours covered by one row (8760 rows = 1 h). */
export const stepHours = (len: number) => (len > 0 && len % 8760 === 0 ? 8760 / len : 1);

/** Factor that turns one row of `unit` into kWh (power) or kWh/m2 (irradiance); null when unknown. */
export function toKwhFactor(unit: string | null, stepH = 1): number | null {
  if (!unit) return null;
  switch (normUnit(unit)) {
    case "kw": return stepH;
    case "w": return stepH / 1000;
    case "mw": return stepH * 1000;
    case "kwh": return 1;
    case "wh": return 1 / 1000;
    case "w/m2": return stepH / 1000;
    case "kw/m2": return stepH;
    case "kwh/m2": return 1;
    case "wh/m2": return 1 / 1000;
    default: return null;
  }
}

/** Per-month sum of an energy/irradiance column, in kWh or kWh/m2. */
export function monthlyEnergy(h: HourlyTable | null | undefined, columns: HourlyColumnSpec[] | undefined, name: string): number[] | null {
  const c = col(h, name);
  const months = col(h, "month");
  if (!c || !months || months.length !== c.length) return null;
  const f = toKwhFactor(unitOf(columns, name), stepHours(c.length));
  if (f === null) return null;
  const out = new Array(12).fill(0);
  for (let i = 0; i < c.length; i++) {
    const m = months[i] - 1;
    if (m >= 0 && m < 12) out[m] += c[i] * f;
  }
  return out;
}

/** Per-month plain mean of a column (temperatures). */
export function monthlyMean(h: HourlyTable | null | undefined, name: string): number[] | null {
  const c = col(h, name);
  const months = col(h, "month");
  if (!c || !months || months.length !== c.length) return null;
  const s = new Array(12).fill(0), cnt = new Array(12).fill(0);
  for (let i = 0; i < c.length; i++) {
    const m = months[i] - 1;
    if (m >= 0 && m < 12) { s[m] += c[i]; cnt[m]++; }
  }
  return s.map((x, i) => (cnt[i] ? x / cnt[i] : NaN));
}

/** Mean of `valueCol` over rows where `gateCol` > 0 (e.g. cell temperature while producing). */
export function producingMean(h: HourlyTable | null | undefined, valueCol: string, gateCol: string): number | null {
  const v = col(h, valueCol), g = col(h, gateCol);
  if (!v || !g || v.length !== g.length) return null;
  let s = 0, k = 0;
  for (let i = 0; i < v.length; i++) if (g[i] > 0) { s += v[i]; k++; }
  return k ? s / k : null;
}

export const sum = (a: number[] | null) => (a ? a.reduce((x, y) => x + y, 0) : null);

export interface DailyPoint { month: number; day: number; x: number; y: number }

/** Daily totals of an input (irradiance) column and an output (energy) column. */
export function dailyInOut(h: HourlyTable | null | undefined, columns: HourlyColumnSpec[] | undefined, inCol: string, outCol: string): DailyPoint[] | null {
  const a = col(h, inCol), b = col(h, outCol), mo = col(h, "month"), da = col(h, "day");
  if (!a || !b || !mo || !da || a.length !== b.length || mo.length !== a.length || da.length !== a.length) return null;
  const sh = stepHours(a.length);
  const fa = toKwhFactor(unitOf(columns, inCol), sh), fb = toKwhFactor(unitOf(columns, outCol), sh);
  if (fa === null || fb === null) return null;
  const map = new Map<number, DailyPoint>();
  for (let i = 0; i < a.length; i++) {
    const key = mo[i] * 100 + da[i];
    let p = map.get(key);
    if (!p) { p = { month: mo[i], day: da[i], x: 0, y: 0 }; map.set(key, p); }
    p.x += a[i] * fa;
    p.y += b[i] * fb;
  }
  return [...map.values()].sort((p, q) => p.month * 100 + p.day - (q.month * 100 + q.day));
}

export interface HistBin { from: number; to: number; energyKwh: number }

/** Energy delivered per power class (default 5 kW wide): sum of power*step for rows in each class. */
export function powerHistogram(h: HourlyTable | null | undefined, columns: HourlyColumnSpec[] | undefined, name: string, classKw = 5): HistBin[] | null {
  const c = col(h, name);
  if (!c) return null;
  const u = unitOf(columns, name);
  const kwPerUnit = u === null ? null : ({ kw: 1, w: 0.001, mw: 1000 } as Record<string, number>)[normUnit(u)] ?? null;
  if (kwPerUnit === null) return null;
  const sh = stepHours(c.length);
  const kw = c.map((x) => x * kwPerUnit);
  const max = Math.max(0, ...kw);
  const nBins = Math.max(1, Math.floor(max / classKw) + 1);
  const bins: HistBin[] = Array.from({ length: nBins }, (_, i) => ({ from: i * classKw, to: (i + 1) * classKw, energyKwh: 0 }));
  for (const p of kw) {
    if (p <= 0) continue;
    bins[Math.min(nBins - 1, Math.floor(p / classKw))].energyKwh += p * sh;
  }
  return bins;
}

/** Horizon points use azimuth 0=N clockwise. Integral mean of the cyclic piecewise-linear profile. */
export function horizonAverage(points: Array<{ azimuth_deg: number; elevation_deg: number }> | null | undefined): number | null {
  if (!points || points.length === 0 || !points.every((p) => isNum(p.azimuth_deg) && isNum(p.elevation_deg))) return null;
  const pts = points.map((p) => ({ a: ((p.azimuth_deg % 360) + 360) % 360, e: p.elevation_deg })).sort((x, y) => x.a - y.a);
  if (pts.length === 1) return pts[0].e;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const da = i === pts.length - 1 ? q.a + 360 - p.a : q.a - p.a;
    area += ((p.e + q.e) / 2) * da;
  }
  return area / 360;
}

/** helio azimuth (0 = N, 90 = E) to the plot axis used by the reference (0 = S, east negative). */
export const toSouthZeroAzimuth = (azHelio: number) => {
  let a = azHelio - 180;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  return a;
};

export interface MonthlyBalance {
  globHor: number[] | null; diffHor: number[] | null; tAmb: number[] | null; globInc: number[] | null;
  globEff: number[] | null; eArray: number[] | null; eGrid: number[] | null; pr: number[] | null;
  /** Normalized production per kWp per day: collection loss, system loss, useful yield. */
  lc: number[] | null; ls: number[] | null; yf: number[] | null;
}

/** PVsyst-style monthly balance table from hourly columns. PR and Lc/Ls/Yf only when every input exists. */
export function monthlyBalance(h: HourlyTable | null | undefined, columns: HourlyColumnSpec[] | undefined, dcKwp: number | null): MonthlyBalance {
  const globHor = monthlyEnergy(h, columns, "ghi");
  const diffHor = monthlyEnergy(h, columns, "dhi");
  const globInc = monthlyEnergy(h, columns, "poa_irradiance");
  const globEff = monthlyEnergy(h, columns, "effective_irradiance");
  const eArray = monthlyEnergy(h, columns, "optimal_dc_power") ?? monthlyEnergy(h, columns, "module_power");
  const eGrid = monthlyEnergy(h, columns, "grid_power");
  const tAmb = monthlyMean(h, "temp_air");
  const ok = isNum(dcKwp) && dcKwp > 0;
  const pr = ok && eGrid && globInc ? eGrid.map((e, i) => (globInc[i] > 0 ? e / (dcKwp! * globInc[i]) : NaN)) : null;
  const perDay = (a: number[]) => a.map((v, i) => v / dcKwp! / NONLEAP_DAYS[i]);
  const yf = ok && eGrid ? perDay(eGrid) : null;
  const ls = ok && eGrid && eArray ? perDay(eArray.map((v, i) => v - eGrid[i])) : null;
  const lc = ok && eGrid && eArray && globInc ? globInc.map((g, i) => (g - eArray[i] / dcKwp!) / NONLEAP_DAYS[i]) : null;
  return { globHor, diffHor, tAmb, globInc, globEff, eArray, eGrid, pr, lc, ls, yf };
}
