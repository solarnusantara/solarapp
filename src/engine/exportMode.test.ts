import { describe, expect, it } from "vitest";
import { buildSimulationInput } from "./inputBuilder";
import { exportModeLabel, isExportMode, EXPORT_MODE_OPTIONS } from "./exportMode";
import { buildMasSilueta744Layout } from "./fixtures/masSilueta744";
import { layoutToScene } from "./sceneAdapter";

const base = (extra: object = {}) => buildSimulationInput({
  adapter: layoutToScene(buildMasSilueta744Layout()), projectName: "P", regionId: "r1",
  inputs: { inverter_ac_kw: 600, pln_tariff_code: "I-3", contracted_power_kva: 1000, monthly_consumption_kwh: 1, load_profile_type: "flat", capex_per_kwp_idr: 1, bess_cost_per_kwh_idr: 0, racking: "flush_mount", ...extra } as any,
} as any);

describe("export mode input", () => {
  it("options are exactly helio's two modes, with the agreed labels", () => {
    expect(EXPORT_MODE_OPTIONS.map((o) => o.value)).toEqual(["zero_export", "physical_export_zero_credit"]);
    expect(exportModeLabel("zero_export")).toBe("Zero export (Permen ESDM 2/2024)");
    expect(exportModeLabel("physical_export_zero_credit")).toBe("Ekspor fisik tanpa kredit");
    expect(exportModeLabel(undefined)).toBe("Ikuti aturan golongan (default helio)");
    expect(isExportMode("zero_export")).toBe(true);
    expect(isExportMode("")).toBe(false);
  });
  it("inputBuilder omits the field when unset or empty, sends it when set", () => {
    const none = base();
    expect(none.input && "export_limitation_mode" in none.input).toBe(false);
    expect(base({ export_limitation_mode: "" }).input && "export_limitation_mode" in base({ export_limitation_mode: "" }).input!).toBe(false);
    expect(base({ export_limitation_mode: "zero_export" }).input?.export_limitation_mode).toBe("zero_export");
    expect(base({ export_limitation_mode: "physical_export_zero_credit" }).input?.export_limitation_mode).toBe("physical_export_zero_credit");
  });
});
