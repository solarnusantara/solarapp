// English labels for the printed reports. helio's own `label` is Indonesian by design, so the reports
// read `helioscope_label` (Production Report) or `pvsyst_label` (Engineering Calculation) and fall back
// to the fixed English names below only for stages that carry none.
import type { StageSummary } from "../engine/types";

/** Stages that have no helioscope_label / pvsyst_label in helio. Keyed by loss_tree key. */
const STAGE_EN: Record<string, { hs?: string; pv?: string }> = {
  adjusted_ghi: { hs: "GHI after spectral correction", pv: "GHI after spectral correction" },
  optimizer_output_power: { hs: "Optimizer Output", pv: "Optimizer Output" },
  actual_dc_power: { hs: "Constrained DC Output", pv: "Inverter Loss (DC limits)" },
  transformer_power: { hs: "Transformer loss", pv: "Transformer loss" },
  lid_derated_power: { hs: "LID - Light induced degradation", pv: "LID - Light induced degradation" },
  availability_derated_power: { hs: "System unavailability", pv: "System unavailability" },
  grid_power: { hs: "Export limitation (Permen ESDM 2/2024)", pv: "Export limitation (Permen ESDM 2/2024)" },
};

/** Sub-loss labels in the PVsyst wording where helio's differs or is Indonesian. */
const SUB_EN: Record<string, string> = {
  inverter_night_tare_loss: "Night consumption",
  shading_horizon_loss: "Far Shadings / Horizon",
  curtailed_limiter_power: "Export limitation (Permen ESDM 2/2024)",
  battery_charge_loss_power: "Battery charge DC/DC loss",
  battery_discharge_conversion_loss_power: "Battery discharge conversion loss",
  rsd_loss_power: "RSD standby loss",
};

type Named = { key: string; pvsyst_label: string | null; helioscope_label?: string | null; label: string };

/** Production Report: HelioScope wording. */
export const helioscopeStageLabel = (s: StageSummary): string => s.helioscope_label ?? STAGE_EN[s.key]?.hs ?? s.pvsyst_label ?? STAGE_EN[s.key]?.pv ?? s.label;
/** Engineering Calculation: PVsyst wording. */
export const pvsystStageLabel = (s: StageSummary): string => s.pvsyst_label ?? STAGE_EN[s.key]?.pv ?? s.helioscope_label ?? STAGE_EN[s.key]?.hs ?? s.label;
export const pvsystSubLabel = (b: Named): string => SUB_EN[b.key] ?? b.pvsyst_label ?? b.label;

/** The ten HelioScope System Loss slices, in report order, bound to the loss_tree stage that produces each. */
export const LOSS_SLICES: ReadonlyArray<{ key: string; name: string; color: string }> = [
  { key: "shaded_irradiance", name: "Shading", color: "#0e7490" },
  { key: "effective_irradiance", name: "Reflection", color: "#b45309" },
  { key: "soiled_irradiance", name: "Soiling", color: "#16a34a" },
  { key: "module_irradiance_derated_power", name: "Irradiance", color: "#6d28d9" },
  { key: "module_mpp_power", name: "Temperature", color: "#ea580c" },
  { key: "module_power", name: "Mismatch", color: "#2563eb" },
  { key: "optimal_dc_power", name: "Wiring", color: "#9ca3af" },
  { key: "actual_dc_power", name: "Clipping", color: "#be185d" },
  { key: "ac_power", name: "Inverter", color: "#ec4899" },
  { key: "energy_to_grid_power", name: "AC System", color: "#0f766e" },
];

// ---------------- Engineering Calculation wording (PVsyst) ----------------
const RACKING_EN: Record<string, string> = { fixed_tilt: "Fixed tilt", flush_mount: "Flush mount", east_west: "East-West", carport: "Carport", ground_mount: "Ground mount", tracker: "Tracker" };
const RACKING_KEYS: Record<string, string> = { fixedtilt: "fixed_tilt", flushmount: "flush_mount", eastwest: "east_west", carport: "carport", groundmount: "ground_mount", tracker: "tracker" };

/** helio spells the racking differently per endpoint (`flush_mount` in the input, `flushmount` in production.design): one key. */
export function normalizeRacking(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const squashed = v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return RACKING_KEYS[squashed] ?? v.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
/** "Flush mount" etc. null when there is no racking. */
export function rackingLabel(v: unknown): string | null {
  const k = normalizeRacking(v);
  return k ? RACKING_EN[k] ?? k.replace(/_/g, " ") : null;
}
/** PVsyst "System type" phrase per racking. */
export function mountingPhrase(v: unknown): string | null {
  const k = normalizeRacking(v);
  if (!k) return null;
  return ({ fixed_tilt: "Tables on a building", flush_mount: "Tables on a building (flush mount)", east_west: "East-West tables on a building", carport: "Carport (shed) structure", ground_mount: "Tables on the ground", tracker: "Trackers on the ground" } as Record<string, string>)[k] ?? rackingLabel(v);
}

/** PVsyst "User's needs": unlimited grid load when the site may export physically or no consumption limit exists, else the load profile in words. */
export function usersNeedsLabel(exportMode: unknown, consumptionSource: unknown): string {
  const src = typeof consumptionSource === "string" ? consumptionSource.trim() : "";
  if (typeof exportMode === "string" && exportMode.startsWith("physical_export")) return "Unlimited load (grid)";
  if (!src) return "Unlimited load (grid)";
  if (src === "profile") return "Hourly load profile (typical day x monthly consumption)";
  const words = src.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const f1 = (v: unknown, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
/** Thermal loss factor block in PVsyst wording: heading plus [label, value] rows, never raw field names. */
export function thermalRows(tm: unknown): { heading: string; rows: Array<[string, string]> } | null {
  const t = tm as Record<string, unknown> | null | undefined;
  if (!t || typeof t.model !== "string") return null;
  const eff = typeof t.module_efficiency === "number" ? (t.module_efficiency <= 1 ? t.module_efficiency * 100 : t.module_efficiency) : null;
  switch (t.model) {
    case "pvsyst": return { heading: "Module temperature according to irradiance", rows: [
      ["Uc (const)", `${f1(t.u_c)} W/m²K`], ["Uv (wind)", `${f1(t.u_v)} W/m²K/m/s`],
      ["Absorption coef.", f1(t.alpha_absorption, 2)], ["Module efficiency", `${f1(eff, 2)} %`]] };
    case "faiman": return { heading: "Module temperature: Faiman model", rows: [["U0 (const)", `${f1(t.u0)} W/m²K`], ["U1 (wind)", `${f1(t.u1)} W/m²K/m/s`]] };
    case "sapm": return { heading: "Module temperature: Sandia (SAPM) model", rows: [["a", f1(t.a, 2)], ["b", f1(t.b, 4)], ["Delta T (cell-module)", `${f1(t.delta_t)} °C`]] };
    case "noct_sam": return { heading: "Module temperature: NOCT (SAM) model", rows: [
      ["NOCT", `${f1(t.noct_c)} °C`], ["Module efficiency", `${f1(eff, 2)} %`], ["Transmittance-absorptance", f1(t.transmittance_absorptance, 2)],
      ["Array height", f1(t.array_height, 0)], ["Mount standoff", `${f1(t.mount_standoff_in)} in`]] };
    default: return { heading: `Module temperature: ${t.model}`, rows: [] };
  }
}
