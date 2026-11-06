import { describe, expect, it } from "vitest";
import type { StageSummary } from "../engine/types";
import { buildLossDiagram, fmtSigned, pvsystOrder } from "./lossDiagram";

const st = (key: string, section: "irradiance" | "energy", annual: number | null, delta: number | null, extra: Partial<StageSummary> = {}): StageSummary => ({
  key, label: key, section, helioscope_label: null, helioscope_column: null, pvsyst_label: null, pvwatts_category: null,
  unit: section === "energy" ? "kWh" : "kWh/m2", status: annual === null ? "not_modeled" : "modeled", pending_issue: null, note: "",
  derate_pct: null, derate_monthly_pct: null, derate_source: null, annual, monthly: null, delta_pct: delta, monthly_delta_pct: null, breakdown: [], ...extra,
}) as StageSummary;
const sub = (key: string, label: string, pct: number | null) => ({ key, label, helioscope_column: null, pvsyst_label: label, status: pct === null ? "not_modeled" : "modeled", pending_issue: null, note: "", annual: null, monthly: null, pct_of_input: pct }) as any;

const tree: StageSummary[] = [
  st("ghi", "irradiance", 1929, null, { pvsyst_label: "Global horizontal irradiation" }),
  st("poa_irradiance", "irradiance", 1918, -0.55, { pvsyst_label: "Global incident in coll. plane" }),
  st("shaded_irradiance", "irradiance", 1914, -0.22, { pvsyst_label: "Near Shadings: irradiance loss", breakdown: [sub("shading_horizon_loss", "Horizon loss", 0.07)] }),
  st("soiled_irradiance", "irradiance", 1811, -3, { pvsyst_label: "Soiling loss factor" }),
  st("total_irradiance", "irradiance", 1811, 0, { pvsyst_label: "Effective irradiation on collectors" }),
  st("nameplate_power", "energy", 1348518, null),
  st("module_mpp_power", "energy", 1245000, -7.68, { pvsyst_label: "PV loss due to temperature" }),
  st("optimal_dc_power", "energy", 1088205, -1.98, { pvsyst_label: "Ohmic wiring loss" }),
  st("actual_dc_power", "energy", 1080000, -0.25, { breakdown: [sub("inverter_overpower_loss", "Inverter Loss over nominal inv. power", 0.25), sub("inverter_overvoltage_loss", "Inverter Loss over nominal inv. voltage", 0), sub("inverter_undervoltage_loss", "Inverter Loss due to voltage threshold", null)] }),
  st("ac_power", "energy", 1066995, -1.69, { pvsyst_label: "Inverter Loss during operation (efficiency)", breakdown: [sub("inverter_night_tare_loss", "Night Loss", 0.01)] }),
  st("transformer_power", "energy", null, 0, { pvsyst_label: "Transformer loss" }),
  st("availability_derated_power", "energy", 1049404, -1.48, { pvsyst_label: "System unavailability" }),
];

describe("buildLossDiagram", () => {
  const d = buildLossDiagram(tree, { moduleAreaM2: 3241.4, moduleEffPct: 22.97 });
  const byKey = (k: string) => d.rows.find((r) => r.key === k)!;
  it("keeps every helio stage and sub-loss, including zero and not-modeled ones", () => {
    for (const k of ["poa_irradiance", "shaded_irradiance", "shading_horizon_loss", "soiled_irradiance", "module_mpp_power", "optimal_dc_power", "inverter_overpower_loss", "inverter_overvoltage_loss", "inverter_undervoltage_loss", "ac_power", "inverter_night_tare_loss", "transformer_power", "availability_derated_power"]) {
      expect(byKey(k), k).toBeTruthy();
    }
    expect(byKey("inverter_overvoltage_loss").pct).toBe("0.00%");
    expect(byKey("inverter_undervoltage_loss").notModeled).toBe(true);
    expect(byKey("transformer_power").notModeled).toBe(true);
    expect(byKey("transformer_power").pct).toBe("tidak dimodelkan");
  });
  it("milestones carry helio absolutes and the collector text", () => {
    expect(byKey("ghi").value).toBe("1929 kWh/m²");
    expect(byKey("total_irradiance").value).toBe("1811 kWh/m² * 3241 m² coll.");
    expect(byKey("efficiency_stc").value).toBe("efficiency at STC = 22.97%");
    expect(byKey("nameplate_power").value).toBe("1348518 kWh");
    expect(byKey("virtual_energy_mpp").value).toBe("1088205 kWh");
    expect(byKey("inverter_output").value).toBe("1066995 kWh");
    expect(byKey("energy_to_grid").value).toBe("1049404 kWh");
  });
  it("orders efficiency row before the constrained-DC limits, milestone after both", () => {
    const keys = d.rows.map((r) => r.key);
    expect(keys.indexOf("ac_power")).toBeLessThan(keys.indexOf("inverter_overpower_loss"));
    expect(keys.indexOf("inverter_output")).toBeGreaterThan(keys.indexOf("inverter_undervoltage_loss"));
    expect(keys.indexOf("virtual_energy_mpp")).toBe(keys.indexOf("optimal_dc_power") + 1);
    expect(pvsystOrder(tree).map((s) => s.key).indexOf("ac_power")).toBeLessThan(pvsystOrder(tree).map((s) => s.key).indexOf("actual_dc_power"));
  });
  it("funnel narrows with remaining energy and rows are strictly increasing in y", () => {
    expect(byKey("nameplate_power").frac).toBe(1);
    expect(byKey("energy_to_grid").frac).toBeCloseTo(1049404 / 1348518, 6);
    for (let i = 1; i < d.rows.length; i++) expect(d.rows[i].y).toBeGreaterThan(d.rows[i - 1].y);
    expect(d.funnels).toHaveLength(2);
  });
  it("signs: gain positive points inward, loss negative", () => {
    const g = buildLossDiagram([st("ghi", "irradiance", 100, null), st("poa_irradiance", "irradiance", 110, 10, { pvsyst_label: "Global incident in coll. plane" })], { moduleAreaM2: null, moduleEffPct: null });
    expect(g.rows.find((r) => r.key === "poa_irradiance")!.pct).toBe("+10.00%");
    expect(fmtSigned(-0.554)).toBe("-0.55%");
  });
});
