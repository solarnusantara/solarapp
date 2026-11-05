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
