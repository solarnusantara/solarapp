import { describe, expect, it } from "vitest";
import { buildSimulationInput, nearestRegion } from "./inputBuilder";
import { layoutToScene } from "./sceneAdapter";
import type { SceneAdapterResult } from "./sceneAdapter";

const adapter = (over: Partial<SceneAdapterResult> = {}): SceneAdapterResult => ({
  ...layoutToScene({ site: null, segments: [] }),
  moduleWp: 620, moduleCount: 1200, tiltDeg: 10, azimuthDeg: 190, roofAreaM2: 3000, latitude: -6.96, longitude: 110.33, blocking: [], ...over,
});
const full = {
  racking: "flush_mount" as const, inverter_ac_kw: 600, pln_tariff_code: "I-3", contracted_power_kva: 1000, monthly_consumption_kwh: 90000,
  load_profile_type: "industri", capex_per_kwp_idr: 9000000, bess_cost_per_kwh_idr: "" as const,
};

describe("inputBuilder", () => {
  it("lists every missing economic input", () => {
    const r = buildSimulationInput({ projectName: "P", adapter: adapter(), inputs: {}, regionId: "semarang" });
    expect(r.input).toBeUndefined();
    const text = r.errors!.join("|");
    for (const k of ["Jenis racking wajib dipilih.", "AC inverter", "tarif PLN", "kVA", "Konsumsi", "profil beban", "Capex"]) expect(text).toContain(k);
  });
  it("reports blocking adapter warnings and a missing region", () => {
    const r = buildSimulationInput({ projectName: "P", adapter: adapter({ blocking: [{ code: "MIXED_MODULE_POWER", message: "campur" }] }), inputs: full, regionId: null });
    expect(r.errors).toContain("campur");
    expect(r.errors!.some((e) => e.includes("Site referensi"))).toBe(true);
  });
  it("builds a complete input with explicit empty arrays and zero BESS", () => {
    const r = buildSimulationInput({ projectName: "P", adapter: adapter(), inputs: full, regionId: "semarang" });
    expect(r.errors).toBeUndefined();
    expect(r.input).toMatchObject({ obstacles: [], bom_items: [], bess_capacity_kwh: 0, bess_power_kw: 0, bess_cost_per_kwh_idr: 0, module_power_wp: 620, module_count: 1200 });
  });
  it("rejects an empty racking and sends the chosen one", () => {
    const empty = buildSimulationInput({ projectName: "P", adapter: adapter(), inputs: { ...full, racking: "" }, regionId: "semarang" });
    expect(empty.errors).toContain("Jenis racking wajib dipilih.");
    const ok = buildSimulationInput({ projectName: "P", adapter: adapter(), inputs: { ...full, racking: "east_west" }, regionId: "semarang" });
    expect(ok.input?.racking).toBe("east_west");
  });
  it("nearestRegion picks the closest site", () => {
    expect(nearestRegion(-6.9, 110.4, [{ id: "a", latitude: -6.2, longitude: 106.8 }, { id: "b", latitude: -7, longitude: 110.4 }])).toBe("b");
  });
});
