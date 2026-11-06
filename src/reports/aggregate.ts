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

export interface HistBin { from: number; to: number; energyKwh: number; energyMwh: number }

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
  const bins: HistBin[] = Array.from({ length: nBins }, (_, i) => ({ from: i * classKw, to: (i + 1) * classKw, energyKwh: 0, energyMwh: 0 }));
  for (const p of kw) {
    if (p <= 0) continue;
    // A value exactly at the maximum belongs to the last bin (min() also guards float edges).
    bins[Math.min(nBins - 1, Math.floor(p / classKw))].energyKwh += p * sh;
  }
  for (const b of bins) b.energyMwh = b.energyKwh / 1000;
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

const norm180 = (a: number) => {
  let x = a;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x === 0 ? 0 : x; // no -0
};

/**
 * helio azimuth (0 = N, 90 = E) to the PVsyst plot axis, which is measured from the direction of the
 * EQUATOR, east negative, west positive: northern hemisphere 0 = south, southern hemisphere 0 = north.
 * Range (-180, 180]. Unknown latitude is treated as northern.
 */
export const pvsystAzimuth = (azHelio: number, latDeg?: number | null) => (isNum(latDeg) && latDeg < 0 ? norm180(-azHelio) : norm180(azHelio - 180));

/** Northern-hemisphere form of {@link pvsystAzimuth} (0 = south). */
export const toSouthZeroAzimuth = (azHelio: number) => pvsystAzimuth(azHelio, 1);

type XY = [number, number];

/**
 * Sun samples of one day -> polylines in the PVsyst plot (azimuth, height), time ordered.
 * Samples at or below the horizon are dropped. The azimuth axis wraps at +-180 (north), so a path
 * that crosses it is cut there (end point interpolated onto the edge) instead of being drawn as
 * one line across the whole chart.
 */
export function sunPathSegments(samples: Array<{ azimuth_deg: number; elevation_deg: number; minute_of_day?: number }> | null | undefined, latDeg?: number | null): XY[][] {
  const pts = (samples ?? [])
    .filter((s) => isNum(s.azimuth_deg) && isNum(s.elevation_deg) && s.elevation_deg > 0)
    .sort((a, b) => (a.minute_of_day ?? 0) - (b.minute_of_day ?? 0))
    .map((s): XY => [pvsystAzimuth(s.azimuth_deg, latDeg), s.elevation_deg]);
  return splitAtAzimuthWrap(pts);
}

/** Cuts a time-ordered (azimuth, height) path where it crosses the +-180 edge. */
export function splitAtAzimuthWrap(pts: XY[]): XY[][] {
  const segs: XY[][] = [];
  let cur: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = i > 0 ? pts[i - 1] : null;
    if (q && Math.abs(p[0] - q[0]) > 180) {
      if (q[0] > p[0]) { // 170 -> -170: leaves through +180, re-enters at -180
        const t = (180 - q[0]) / (p[0] + 360 - q[0]);
        const e = q[1] + t * (p[1] - q[1]);
        cur.push([180, e]); segs.push(cur); cur = [[-180, e]];
      } else { // -170 -> 170
        const t = (q[0] + 180) / (q[0] + 360 - p[0]);
        const e = q[1] + t * (p[1] - q[1]);
        cur.push([-180, e]); segs.push(cur); cur = [[180, e]];
      }
    }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs.filter((s) => s.length > 1);
}

/**
 * Sun height below which the sun is behind a plane (angle of incidence > 90 deg):
 * tan(h) = -tan(tilt) * cos(sunAz - planeAz), only where that cosine is negative. Azimuths here
 * are on the PVsyst axis (0 = south). Returns polylines ordered from +180 to -180.
 */
export function behindPlaneSegments(tiltDeg: number, planeAzSouth0: number, stepDeg = 2): XY[][] {
  if (!isNum(tiltDeg) || !isNum(planeAzSouth0) || tiltDeg <= 0) return [];
  const t = Math.tan((tiltDeg * Math.PI) / 180);
  const segs: XY[][] = [];
  let cur: XY[] = [];
  for (let az = 180; az >= -180; az -= stepDeg) {
    const c = Math.cos(((az - planeAzSouth0) * Math.PI) / 180);
    if (c < -1e-9) cur.push([az, (Math.atan(-t * c) * 180) / Math.PI]);
    else { if (cur.length > 1) segs.push(cur); cur = []; }
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

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
  // PVsyst GlobEff = effective global corrected for IAM, shadings AND soiling: the after-soiling column.
  const globEff = monthlyEnergy(h, columns, "soiled_irradiance");
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

type SunSample = { azimuth_deg: number; elevation_deg: number; minute_of_day?: number };

/**
 * Yellow region of the sun-path chart: the area swept by the daily paths. `days` are the sun-position
 * samples of consecutive dates ordered from one solstice to the other. For every pair of neighbouring
 * dates and every pair of consecutive same-minute samples (all four above the horizon) one quad is
 * produced; the union of those quads is the swept region, so there is no polygon between two curves
 * that could self-intersect. A quad that straddles the +-180 azimuth edge is unwrapped (its points are
 * made continuous) and the chart draws it again shifted by +-360, clipped to the plot.
 */
export function sunBandQuads(days: Array<SunSample[] | null | undefined>, latDeg?: number | null): XY[][] {
  const usable = days.filter((d): d is SunSample[] => !!d && d.length > 0);
  if (usable.length < 2) return [];
  const maps = usable.map((d) => { const m = new Map<number, SunSample>(); for (const x of d) if (isNum(x.minute_of_day)) m.set(x.minute_of_day, x); return m; });
  const minutes = [...maps[0].keys()].sort((a, b) => a - b);
  const pt = (x: SunSample): XY => [pvsystAzimuth(x.azimuth_deg, latDeg), x.elevation_deg];
  const quads: XY[][] = [];
  for (let k = 0; k + 1 < maps.length; k++) {
    for (let i = 0; i + 1 < minutes.length; i++) {
      const m0 = minutes[i], m1 = minutes[i + 1];
      if (m1 - m0 > 60) continue;
      const c = [maps[k].get(m0), maps[k].get(m1), maps[k + 1].get(m1), maps[k + 1].get(m0)];
      if (c.some((x) => !x || !(x.elevation_deg > 0))) continue;
      const q = (c as SunSample[]).map(pt);
      // unwrap relative to the first corner so the quad is continuous
      for (let j = 1; j < 4; j++) { while (q[j][0] - q[0][0] > 180) q[j][0] -= 360; while (q[j][0] - q[0][0] < -180) q[j][0] += 360; }
      quads.push(q);
    }
  }
  return quads;
}

/**
 * Sky-view (diffuse) factor of a horizon profile for a horizontal plane under an isotropic sky:
 * 1 - mean over azimuth of sin^2(height). Pure geometry on the profile the engine used; no profile -> null.
 */
export function horizonDiffuseFactor(points: Array<{ azimuth_deg: number; elevation_deg: number }> | null | undefined): number | null {
  if (!points || points.length === 0 || !points.every((p) => isNum(p.azimuth_deg) && isNum(p.elevation_deg))) return null;
  const pts = points.map((p) => ({ a: ((p.azimuth_deg % 360) + 360) % 360, e: Math.max(0, p.elevation_deg) })).sort((x, y) => x.a - y.a);
  const at = (az: number) => {
    if (pts.length === 1) return pts[0].e;
    let i = pts.findIndex((p) => p.a > az);
    if (i === -1) i = 0;
    const q = pts[i], p = pts[(i - 1 + pts.length) % pts.length];
    const pa = p.a > az ? p.a - 360 : p.a, qa = q.a < az ? q.a + 360 : q.a;
    return qa === pa ? q.e : p.e + ((az - pa) / (qa - pa)) * (q.e - p.e);
  };
  let acc = 0;
  for (let az = 0; az < 360; az += 0.5) { const h = (at(az) * Math.PI) / 180; acc += Math.sin(h) ** 2; }
  return 1 - acc / 720;
}

/** Monthly balance straight from helio's production.engineering.monthly_balance (same numbers the engine computed). */
export function monthlyBalanceFromEngineering(rows: Array<{ month: number; glob_hor_kwh_m2: number; diff_hor_kwh_m2: number | null; t_amb_c: number; glob_inc_kwh_m2: number; glob_eff_kwh_m2: number; e_array_kwh: number | null; e_grid_kwh: number; pr_pct: number | null }> | null | undefined, dcKwp: number | null): MonthlyBalance | null {
  if (!rows || rows.length !== 12) return null;
  const by = [...rows].sort((a, b) => a.month - b.month);
  const all = <T,>(f: (r: (typeof by)[number]) => T | null): T[] | null => { const v = by.map(f); return v.every((x) => x !== null && (typeof x !== "number" || Number.isFinite(x))) ? (v as T[]) : null; };
  const ok = isNum(dcKwp) && dcKwp > 0;
  const eGrid = by.map((r) => r.e_grid_kwh), globInc = by.map((r) => r.glob_inc_kwh_m2);
  const eArray = all((r) => r.e_array_kwh);
  const perDay = (a: number[]) => a.map((v, i) => v / dcKwp! / NONLEAP_DAYS[i]);
  return {
    globHor: by.map((r) => r.glob_hor_kwh_m2), diffHor: all((r) => r.diff_hor_kwh_m2), tAmb: by.map((r) => r.t_amb_c), globInc,
    globEff: by.map((r) => r.glob_eff_kwh_m2), eArray, eGrid, pr: all((r) => (r.pr_pct === null ? null : r.pr_pct / 100)),
    yf: ok ? perDay(eGrid) : null,
    ls: ok && eArray ? perDay(eArray.map((v, i) => v - eGrid[i])) : null,
    lc: ok && eArray ? globInc.map((g, i) => (g - eArray[i] / dcKwp!) / NONLEAP_DAYS[i]) : null,
  };
}
