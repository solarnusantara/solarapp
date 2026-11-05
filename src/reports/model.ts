// Defensive readers over the cached engine result. Nothing here computes physics: it only picks
// fields helio produced (several candidate names where helio may still be adding one) and groups them.
import type { ConditionSet, StageSummary, StringingReport } from "../engine/types";
import type { EngineResultSummary } from "../engine/types/local";
import type { SolarYieldResult } from "../gisSolarService";
import type { SavedLayout } from "../engine/layoutStore";
import { weatherLabel, weatherSourceName } from "../engine/weather";
import { firstOf, isNum, pick } from "./format";
import { LOSS_SLICES, helioscopeStageLabel } from "./labels";

export const out = (r: EngineResultSummary | null | undefined): any => r?.output ?? null;
export const prod = (r: EngineResultSummary | null | undefined): any => r?.production ?? null;

export function conditionSet(r: EngineResultSummary | null | undefined): ConditionSet | null {
  return (prod(r)?.condition_set ?? out(r)?.condition_set ?? null) as ConditionSet | null;
}

export function lossTree(r: EngineResultSummary | null | undefined): StageSummary[] {
  const t = out(r)?.loss_tree ?? prod(r)?.loss_tree;
  return Array.isArray(t) ? (t as StageSummary[]) : [];
}

export interface LossGroup {
  section: "irradiance" | "energy";
  rows: StageSummary[];
}

/** Stages that exist only for designs that use them; hidden when not modelled (monofacial / no optimizer). */
const OPTIONAL_STAGES = new Set(["effective_rear_irradiance", "optimizer_output_power"]);

/**
 * Rows of the Annual Production table grouped by section in engine order. Stages with a value are shown;
 * a stage HelioScope always lists (it has a `helioscope_label`) is kept even when not modelled, so it
 * prints "-" instead of vanishing; optional stages (rear side, optimizer) and anything else unmodelled are dropped.
 */
export function lossGroups(r: EngineResultSummary | null | undefined, onlyShown = true): LossGroup[] {
  const groups: LossGroup[] = [];
  for (const s of ["irradiance", "energy"] as const) {
    const rows = lossTree(r).filter((x) => {
      if (x.section !== s) return false;
      if (!onlyShown) return true;
      if (OPTIONAL_STAGES.has(x.key)) return x.status !== "not_modeled" && isNum(x.annual) && x.annual !== 0; // monofacial / no optimizer: absent
      if (x.status !== "not_modeled" && isNum(x.annual)) return true;
      return !!x.helioscope_label && !OPTIONAL_STAGES.has(x.key);
    });
    if (rows.length) groups.push({ section: s, rows });
  }
  return groups;
}

/** The last row of each section is the section total (Total Collector Irradiance / Energy to Grid). */
export const isTotalRow = (g: LossGroup, i: number) => i === g.rows.length - 1;

export interface DonutSlice { label: string; value: number; color: string }
/**
 * System-loss donut: exactly HelioScope's ten slices (Shading, Reflection, Soiling, Irradiance, Temperature,
 * Mismatch, Wiring, Clipping, Inverter, AC System), each |delta_pct| of its own stage (% of the previous
 * stage). The GHI -> POA transposition step is never a slice. Stages without a loss are left out.
 */
export function donutSlices(r: EngineResultSummary | null | undefined): DonutSlice[] {
  const tree = lossTree(r);
  const out: DonutSlice[] = [];
  for (const sl of LOSS_SLICES) {
    const st = tree.find((x) => x.key === sl.key);
    if (!st || st.status === "not_modeled" || !isNum(st.delta_pct) || st.delta_pct >= 0 || Math.abs(st.delta_pct) < 0.05) continue; // a slice below the printed 0.1 % precision is not drawn
    out.push({ label: sl.name, value: Math.abs(st.delta_pct), color: sl.color });
  }
  return out;
}

export const stringingReports = (r: EngineResultSummary | null | undefined): StringingReport[] => {
  const a = r?.circuit_auto?.stringing ?? out(r)?.stringing ?? prod(r)?.stringing?.reports;
  return Array.isArray(a) ? (a as StringingReport[]) : [];
};

export interface Orientation { id: string; tilt: number | null; azimuth: number | null; modules: number | null; dcKwp: number | null }

const rnd = (v: unknown) => (isNum(v) ? Math.round(v * 10) / 10 : null);

/** Distinct (tilt, azimuth) planes: engine plane_yields, else design.arrays, else layout segments. */
export function orientations(r: EngineResultSummary | null | undefined, layout: SavedLayout | null | undefined): Orientation[] {
  const planes: any[] | undefined = out(r)?.plane_yields;
  const arrays: any[] | undefined = prod(r)?.design?.arrays;
  const src = Array.isArray(planes) && planes.length ? planes : Array.isArray(arrays) && arrays.length ? arrays : null;
  const raw: Orientation[] = src
    ? src.map((p, i) => ({ id: String(p.id ?? i + 1), tilt: rnd(p.tilt_deg), azimuth: rnd(p.azimuth_deg), modules: isNum(p.module_count) ? p.module_count : null, dcKwp: isNum(p.dc_kwp) ? p.dc_kwp : null }))
    : (layout?.segments ?? []).filter((s) => s.visible !== false).map((s) => ({
        id: s.id, tilt: rnd(s.tilt), azimuth: rnd(s.azimuth), modules: s.panels?.length ?? null,
        dcKwp: s.panels?.length && isNum(s.moduleWatts) ? (s.panels.length * s.moduleWatts) / 1000 : null,
      }));
  const merged = new Map<string, Orientation>();
  for (const o of raw) {
    const k = `${o.tilt}/${o.azimuth}`;
    const m = merged.get(k);
    if (!m) merged.set(k, { ...o });
    else {
      m.modules = isNum(m.modules) && isNum(o.modules) ? m.modules + o.modules : null;
      m.dcKwp = isNum(m.dcKwp) && isNum(o.dcKwp) ? m.dcKwp + o.dcKwp : null;
    }
  }
  return [...merged.values()].map((o, i) => ({ ...o, id: String(i + 1) }));
}

export function horizonPoints(r: EngineResultSummary | null | undefined, layout: SavedLayout | null | undefined) {
  const h = (r?.input as any)?.horizon ?? layout?.engine_inputs?.horizon;
  const pts = h?.points;
  return Array.isArray(pts) ? (pts as Array<{ azimuth_deg: number; elevation_deg: number }>) : null;
}

/**
 * Weather source as printed in reports: the source the run recorded (`weather_used`, incl. series years),
 * else the weather meta helio echoed in the output (results from before the weather panel). "—" if neither.
 */
export function sourceLabel(r: EngineResultSummary | null | undefined): string {
  const used: any = r?.weather_used, w = out(r)?.weather;
  // A single dataset is named after the project, so print what it is (provider / source) and where, not its name.
  if (used?.kind === "dataset" && typeof used.id === "string" && used.id.trim()) {
    const provider = (typeof w?.source === "string" && w.source.trim()) || weatherSourceName(used.source);
    if (provider) {
      const where = isNum(w?.latitude) && isNum(w?.longitude) ? ` · lat ${w.latitude.toFixed(4)}°, lon ${w.longitude.toFixed(4)}°` : "";
      return provider + where;
    }
  }
  return weatherLabel(r?.weather_used, w);
}

/** Inter-annual variability helio returned in `output.uncertainty`; every field null when absent. */
export function weatherVariability(r: EngineResultSummary | null | undefined) {
  const u = out(r)?.uncertainty;
  const num = (v: unknown): number | null => (isNum(v) ? v : null);
  return {
    sigmaIavPct: num(u?.sigma_iav_pct),
    fromSeries: u?.iav_source === "multi_year_series",
    fromUser: u?.iav_from_user === true,
    yearCount: Array.isArray(u?.years) && u.years.length ? (u.years.length as number) : null,
    medianKwh: num(u?.p50_multiyear_median_kwh),
    medianDeltaPct: num(u?.p50_multiyear_delta_pct),
  };
}

/** Total wire length of string conductors from the engine wire schedule (sum of engine entries). */
export function wireSummary(r: EngineResultSummary | null | undefined) {
  const entries: any[] | undefined = out(r)?.wire_schedule?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const str = entries.filter((e) => e.conductor_type === "string");
  const use = str.length ? str : entries;
  const lengthM = use.reduce((a, e) => a + (isNum(e.one_way_length_m) ? e.one_way_length_m * (isNum(e.num_conductors) ? e.num_conductors : 1) : 0), 0);
  const first = use[0];
  return { count: use.length, lengthM, label: `${first.conductor_label ?? "—"}` + (first.material ? ` (${String(first.material)[0].toUpperCase()}${String(first.material).slice(1)})` : "") };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Maps the engine result onto the shape EngineeringReport's existing yield widgets render. */
export function engineYield(r: EngineResultSummary | null | undefined, coords: { lat: number; lng: number }): SolarYieldResult | null {
  const o = out(r);
  if (!o || !isNum(o.annual_p50_kwh) || !Array.isArray(o.monthly_summary)) return null;
  const monthly = (o.monthly_summary as any[]).map((m, i) => {
    const idx = (isNum(m.month) ? m.month : i + 1) - 1;
    return {
      month: MONTH_NAMES[idx] ?? String(idx + 1),
      monthIndex: idx,
      ghi: isNum(m.ghi_kwh_m2) ? m.ghi_kwh_m2 / DAYS[idx] : NaN,
      temp: isNum(m.avg_temp_c) ? m.avg_temp_c : NaN,
      dailyEnergyKwh: isNum(m.solar_gen_kwh) ? Math.round(m.solar_gen_kwh / DAYS[idx]) : NaN,
      monthlyEnergyKwh: isNum(m.solar_gen_kwh) ? m.solar_gen_kwh : 0,
      savingsIdr: NaN,
    };
  });
  const temps = monthly.map((m) => m.temp).filter(isNum);
  return {
    coordinates: coords,
    capacityKwp: o.dc_capacity_kwp,
    annualGhi: isNum(o.annual_poa_kwh_m2) ? o.annual_poa_kwh_m2 / 365 : NaN,
    annualTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : NaN,
    pr: isNum(o.performance_ratio_pct) ? o.performance_ratio_pct / 100 : NaN,
    specificYield: o.specific_yield_kwh_kwp,
    annualEnergyMwh: Math.round(o.annual_p50_kwh / 100) / 10,
    carbonOffsetTons: o.co2_abated_tons_yr,
    annualSavingsIdr: o.annual_savings_idr,
    monthly,
    losses: { soiling: NaN, temperature: NaN, mismatch: NaN, inverter: NaN, cabling: NaN, shading: NaN, totalLossPct: NaN },
    source: `Helio engine v${r?.engine_version ?? "?"} — ${sourceLabel(r)}`,
    fetchedAt: r?.ran_at ?? "",
  };
}

export interface LossLine { label: string; pct: number }
/** Loss rows (negative delta) for the small loss lists in EngineeringReport; engine order, engine labels. */
export function lossLines(r: EngineResultSummary | null | undefined): LossLine[] {
  const lines: LossLine[] = [];
  for (const g of lossGroups(r)) {
    g.rows.forEach((row, i) => {
      if (isTotalRow(g, i) || !isNum(row.delta_pct) || row.delta_pct === 0) return;
      lines.push({ label: helioscopeStageLabel(row), pct: row.delta_pct });
    });
  }
  return lines;
}

/** Uncertainty report rows if the engine returned them. */
export function uncertaintyRows(r: EngineResultSummary | null | undefined): Array<{ key: string; label: string; sigma_pct?: number | null; source?: string | null }> {
  const rows = out(r)?.uncertainty?.rows;
  return Array.isArray(rows) ? rows : [];
}

/** IAM table [{angle_deg, value}] if present under any of the names the engine may use. */
export function iamTable(r: EngineResultSummary | null | undefined): Array<{ angle: number; value: number }> | null {
  const eng = prod(r)?.engineering?.iam_table?.rows;
  if (Array.isArray(eng) && eng.length) {
    const rows = eng.map((x: any) => ({ angle: x?.aoi_deg, value: x?.factor })).filter((x: any) => isNum(x.angle) && isNum(x.value));
    if (rows.length) return rows;
  }
  const t = firstOf(out(r), "iam_table", "iam_profile", "module_model.iam_table") ?? firstOf(prod(r), "iam_table", "iam_profile", "design.iam_table");
  if (!Array.isArray(t)) return null;
  const rows = t.map((x: any) => (Array.isArray(x) ? { angle: x[0], value: x[1] } : { angle: x?.angle_deg ?? x?.angle, value: x?.value ?? x?.iam ?? x?.factor }))
    .filter((x) => isNum(x.angle) && isNum(x.value));
  return rows.length ? rows : null;
}

/** production.engineering (helio >= 9fd4da8) or null. */
export const engineering = (r: EngineResultSummary | null | undefined) => (prod(r)?.engineering ?? null) as import("../engine/types/local").EngineeringCalc | null;

/**
 * Inverter ratings for the PV Array pages. Nominal AC (e.g. 150 kWac) is not p_max_ac (the 30 degC maximum, 165 kW);
 * the MPPT window comes from the circuit's inverter node (built from the characterization) per inverter id.
 */
export function inverterRatings(r: EngineResultSummary | null | undefined) {
  const inv: any = r?.components?.inverter;
  const first = (...v: unknown[]): number | null => (v.find(isNum) as number | undefined) ?? null;
  const nomW = first(inv?.ratings?.p_nom_ac_w, inv?.p_nom_ac_w, inv?.nameplate_w);
  const summary: any[] = Array.isArray(out(r)?.inverters_summary) ? out(r).inverters_summary : [];
  const nodes: any[] = ((r?.circuit_auto as any)?.circuit?.nodes ?? []).filter((x: any) => x?.type === "inverter");
  const pMaxW = first(inv?.ratings?.p_max_ac_w, inv?.p_max_ac_w);
  return {
    nomAcKw: nomW !== null ? nomW / 1000 : first(summary[0]?.nominal_ac_kw),
    pMaxAcKw: pMaxW !== null ? pMaxW / 1000 : null,
    mpptWindow(inverterId: string): { minV: number; maxV: number } | null {
      const nd = nodes.find((x) => x.id === inverterId);
      const lo = first(nd?.v_mppt_min_v, inv?.ratings?.v_mppt_min_v), hi = first(nd?.v_mppt_max_v, inv?.ratings?.v_mppt_max_v);
      return lo !== null && hi !== null ? { minV: lo, maxV: hi } : null;
    },
  };
}

export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const pickNum = (o: unknown, ...p: Array<string | number>) => { const v = pick(o, ...p); return isNum(v) ? v : null; };
