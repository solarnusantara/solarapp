import { describe, expect, it } from "vitest";
import { applyPvsystPreset, REQUIRED_KEYS, serializeConditionSet } from "./conditionModel";
import type { ConditionSet } from "./types";

const m = (v: number) => Array(12).fill(v) as ConditionSet["albedo"];
const base = {
  schema_version: 1, weather: { kind: "reference_site", site_id: "x" }, solar_angle_location: "weather", transposition: "perez", decomposition: "dirint",
  iam: "physical", iam_b0: null, iam_a_r: null, pan_iam_profile: null, iam_diffuse: "no_loss", albedo: m(0.25), albedo_use_weather: false,
  spectral_enabled: false, spectral_technology: "mono_si", spectral_pw_from_weather: false, soiling_pct: m(2),
  mismatch: { pct: 2, sigma_irradiance_pct: null, temp_spread_c: null, module_tolerance_min_pct: null, module_tolerance_max_pct: null },
  dc_wiring: { mode: "not_applied" }, inverter_efficiency_pct: 98, ac_loss: { mode: "not_applied" }, lid: { mode: "not_applied" },
  degradation: { first_year_pct: 1, annual_rate_pct: 0.5, mode: "linear", voltage_share_pct: 50 }, availability: { mode: "not_applied" },
  custom_losses: [], temperature_model: { model: "sapm", a: -3.56, b: -0.075, delta_t: 3 }, module_temp_coeff_p_max_pct_per_c: null,
  module_characterization_id: null, inverter_characterization_id: null, power_factor: 1, inverter_temp_offset_c: 0,
  bifacial: { enabled: false },
} as unknown as ConditionSet;

describe("conditionModel", () => {
  it("a complete set serialises without errors and keeps every required key", () => {
    const { params, errors } = serializeConditionSet(base);
    expect(errors).toEqual([]);
    for (const k of REQUIRED_KEYS) expect(k in params).toBe(true);
  });
  it("flags a missing required key and non-finite numbers", () => {
    const bad = { ...base } as unknown as Record<string, unknown>;
    delete bad.lid;
    expect(serializeConditionSet(bad as unknown as ConditionSet).errors.join()).toContain('"lid"');
    expect(serializeConditionSet({ ...base, inverter_efficiency_pct: NaN }).errors.length).toBeGreaterThan(0);
  });
  it("PVsyst preset maps the PDF values onto real fields", () => {
    const r = applyPvsystPreset(base);
    expect(r.params.soiling_pct).toEqual(m(3));
    expect(r.params.lid).toEqual({ mode: "pct", pct: 2 });
    expect(r.params.dc_wiring).toEqual({ mode: "pct", pct: 3, basis: "stc" });
    expect(r.params.ac_loss).toEqual({ mode: "pct", pct: 0.36, basis: "stc" });
    expect(r.params.availability).toEqual({ mode: "annual", pct: 1.9 });
    expect(r.params.mismatch.pct).toBe(3);
    expect(r.params.albedo).toEqual(m(0.2));
    expect(r.params.degradation.annual_rate_pct).toBe(0.4);
    expect(r.params.temperature_model).toMatchObject({ model: "pvsyst", u_c: 20, u_v: 0 });
    expect(r.params.custom_losses.map((c) => [c.name, c.monthly_pct[0]])).toEqual([["Module quality", 4], ["String mismatch", 1.5]]);
    expect(r.uncertainty.components.map((c) => [c.key, c.sigma_pct])).toEqual([
      ["resource_long_term", 0], ["iav", 5.5], ["transposition", 0], ["module_model", 1], ["temperature", 0],
      ["soiling", 1], ["mismatch", 0], ["inverter", 0.5], ["degradation", 1], ["availability", 0],
    ]);
    // every one of the 10 rows has a value AND a source, so helio never answers needs_uncertainty_inputs
    expect(r.uncertainty.components).toHaveLength(10);
    expect(r.uncertainty.components.every((c) => typeof c.sigma_pct === "number" && !!c.source)).toBe(true);
    expect(r.uncertainty.components.find((c) => c.key === "temperature")?.source).toBe("tidak dicantumkan di PLTS-MAS-E-CS-001-00 (PVsyst hanya memakai 5 komponen)");
    // RSS of the ten = 5.79 % (PVsyst 5.8 %)
    expect(Math.sqrt(r.uncertainty.components.reduce((a, c) => a + (c.sigma_pct as number) ** 2, 0))).toBeCloseTo(5.788, 3);
    expect(r.unsupported.some((u) => u.label.includes("Fresnel"))).toBe(true);
    expect(r.needsInput.length).toBe(2);
    expect(serializeConditionSet(r.params).errors.length).toBeGreaterThan(0);
  });
});

describe("wiring basis (helio#380)", () => {
  it("preset sets stc basis on DC and AC wiring", () => {
    const r = applyPvsystPreset(base);
    expect(r.params.dc_wiring).toEqual({ mode: "pct", pct: 3, basis: "stc" });
    expect(r.params.ac_loss).toEqual({ mode: "pct", pct: 0.36, basis: "stc" });
  });
  it("legacy ConditionSet without basis round-trips unchanged; basis round-trips when present", () => {
    const legacy = { ...base, dc_wiring: { mode: "pct", pct: 1.5 } } as ConditionSet;
    const back = JSON.parse(JSON.stringify(serializeConditionSet(legacy).params));
    expect(back.dc_wiring).toEqual({ mode: "pct", pct: 1.5 });
    expect("basis" in back.dc_wiring).toBe(false);
    const stc = { ...base, ac_loss: { mode: "pct", pct: 0.36, basis: "stc" } } as ConditionSet;
    expect(JSON.parse(JSON.stringify(serializeConditionSet(stc).params)).ac_loss).toEqual({ mode: "pct", pct: 0.36, basis: "stc" });
  });
});
