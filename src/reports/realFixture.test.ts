import { describe, expect, it } from "vitest";
import fx from "./fixtures/helioPvsystP90.json";
import { donutSlices, lossGroups, lossTree, weatherVariability } from "./model";
import { buildLossDiagram } from "./lossDiagram";
import { helioscopeStageLabel, LOSS_SLICES } from "./labels";
import { monthlyBalanceFromEngineering } from "./aggregate";
import { sigmaEnergy } from "./probability";

// Real helio response for the PVsyst-preset Mas Silueta run (p90_status = ready).
const result: any = { output: { loss_tree: fx.loss_tree, uncertainty: fx.uncertainty }, production: null };

describe("real helio response", () => {
  it("System Loss donut: only HelioScope's ten slices, never the GHI -> POA step", () => {
    const names = LOSS_SLICES.map((s) => s.name);
    const s = donutSlices(result);
    expect(s.length).toBeGreaterThan(5);
    for (const x of s) expect(names).toContain(x.label);
    expect(s.map((x) => x.label)).not.toContain("Transposition");
    expect(s.some((x) => /POA|GHI|Global/i.test(x.label))).toBe(false);
    const byName = Object.fromEntries(s.map((x) => [x.label, x.value]));
    expect(byName.Soiling).toBeCloseTo(3, 6);
    expect(byName.Temperature).toBeCloseTo(6.827, 3);
    expect(byName.Reflection).toBeCloseTo(1.634, 3);
    expect(byName.Inverter).toBeCloseTo(1.761, 3);
    // order follows the report
    expect(s.map((x) => names.indexOf(x.label))).toEqual([...s.map((x) => names.indexOf(x.label))].sort((a, b) => a - b));
  });

  it("Production Report rows use English helioscope labels; export stage is English; rear side hidden (monofacial)", () => {
    const rows = lossGroups(result).flatMap((g) => g.rows);
    expect(rows.find((r) => r.key === "effective_rear_irradiance")).toBeUndefined();
    expect(rows.find((r) => r.key === "optimizer_output_power")).toBeUndefined();
    expect(helioscopeStageLabel(lossTree(result).find((r) => r.key === "grid_power")!)).toBe("Export limitation (Permen ESDM 2/2024)");
    for (const r of rows) expect(helioscopeStageLabel(r)).not.toMatch(/Terkirim|Setelah|Output pada|Nameplate$.{1}/);
    expect(helioscopeStageLabel(lossTree(result).find((r) => r.key === "poa_irradiance")!)).toBe("POA Irradiance");
  });

  it("Engineering loss diagram: PVsyst labels, no Indonesian text, helio milestones", () => {
    const d = buildLossDiagram(lossTree(result), { moduleAreaM2: 3241, moduleEffPct: 22.97 });
    const labels = d.rows.map((r) => r.label);
    expect(labels).toContain("Night consumption");
    expect(labels).toContain("Far Shadings / Horizon");
    expect(labels).toContain("Export limitation (Permen ESDM 2/2024)");
    for (const l of labels) expect(l).not.toMatch(/Dipotong|Setelah|Rugi |Terkirim|Output pada/);
    const m = (k: string) => d.rows.find((r) => r.key === k)!;
    expect(m("energy_to_grid").value).toBe("1012945 kWh");
    expect(m("inverter_output").value).toBe("1053637 kWh");
    expect(d.rows.find((r) => r.key === "effective_rear_irradiance")).toBeUndefined();
  });

  it("P50-P90: horizon_1y carries the P values, sigma 5.79 %, P90/P50 = 0.9258", () => {
    const u = result.output.uncertainty;
    expect(u.p90_status).toBe("ready");
    const h = u.horizon_1y;
    expect(h.p90_kwh / h.p50_kwh).toBeCloseTo(0.9258, 3);
    expect(h.p95_kwh / h.p50_kwh).toBeCloseTo(0.9048, 3);
    expect(u.sigma_1y_pct).toBeCloseTo(5.788, 3);
    expect(sigmaEnergy(h.p50_kwh / 1000, h.sigma_pct, h.p90_kwh / 1000, h.p95_kwh / 1000)).toBeCloseTo(58.63, 1);
    expect(u.rows).toHaveLength(10);
    expect(weatherVariability(result).sigmaIavPct).toBeCloseTo(5.5, 6);
  });

  it("monthly balance from engineering keeps helio's GlobEff (after soiling)", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, glob_hor_kwh_m2: 150, diff_hor_kwh_m2: 70, t_amb_c: 28, glob_inc_kwh_m2: 150, glob_eff_kwh_m2: 141, e_array_kwh: 90000, e_grid_kwh: 88000, pr_pct: 78.8 }));
    const b = monthlyBalanceFromEngineering(rows, 744)!;
    expect(b.globEff).toEqual(Array(12).fill(141));
    expect(b.pr![0]).toBeCloseTo(0.788, 6);
    expect(monthlyBalanceFromEngineering(rows.slice(1), 744)).toBeNull();
  });
});
