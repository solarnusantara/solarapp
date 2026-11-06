import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fx from "./fixtures/masSilueta744.json";
import { col, powerHistogram, type HourlyTable } from "./aggregate";
import { IsoShadingChart, SunPathChart } from "./charts";
import { mountingPhrase, normalizeRacking, rackingLabel, thermalRows, usersNeedsLabel } from "./labels";
import { conditionSet, inverterRatings, sourceLabel } from "./model";

// Real helio response of the Mas Silueta 744 kWp run (trimmed: hourly keeps the 9 columns the reports read).
const result: any = fx.result;
const hourly: any = fx.hourly;

describe("System Output Power Distribution reads the real hourly shape", () => {
  it("hourly response: parallel arrays keyed by column name + columns[{name, unit}] -> histogram", () => {
    const h = hourly.hourly as unknown as HourlyTable;
    expect(col(h, "ac_power")?.length).toBe(8760);
    const bins = powerHistogram(h, hourly.columns, "ac_power", 5)!;
    expect(bins.length).toBeGreaterThan(100);
    const sumMwh = bins.reduce((a, b) => a + b.energyMwh, 0);
    const expected = (hourly.hourly.ac_power as number[]).reduce((a, b) => a + (b > 0 ? b : 0), 0) / 1000;
    expect(sumMwh).toBeCloseTo(expected, 6);
  });
});

describe("Engineering Calculation wording", () => {
  it("racking: helio spells it flush_mount and flushmount; both read 'Flush mount'", () => {
    expect(result.production.design.racking).toBe("flushmount");
    expect(normalizeRacking("flushmount")).toBe("flush_mount");
    expect(rackingLabel("flushmount")).toBe("Flush mount");
    expect(rackingLabel("flush_mount")).toBe("Flush mount");
    expect(mountingPhrase("flushmount")).toBe("Tables on a building (flush mount)");
    expect(mountingPhrase(null)).toBeNull();
  });

  it("User's needs: physical export or no consumption limit = Unlimited load (grid)", () => {
    expect(usersNeedsLabel(result.input.export_limitation_mode, result.output.consumption_source)).toBe("Unlimited load (grid)");
    expect(usersNeedsLabel(undefined, undefined)).toBe("Unlimited load (grid)");
    expect(usersNeedsLabel("zero_export", "profile")).toMatch(/load profile/i);
  });

  it("thermal block uses PVsyst wording, never raw field names", () => {
    const t = thermalRows(conditionSet(result)!.temperature_model)!;
    expect(t.heading).toBe("Module temperature according to irradiance");
    expect(Object.fromEntries(t.rows)).toEqual({
      "Uc (const)": "20.0 W/m²K", "Uv (wind)": "0.0 W/m²K/m/s", "Absorption coef.": "0.90", "Module efficiency": "22.97 %",
    });
    expect(JSON.stringify(t)).not.toMatch(/alpha_absorption|u_c|u_v|module_efficiency/);
  });

  it("inverter: Unit Nom. Power is the nominal 150 kWac, p_max is 165 kW, MPPT window 200-1000 V from the circuit node", () => {
    const r = inverterRatings(result);
    expect(r.nomAcKw).toBe(150);
    expect(r.pMaxAcKw).toBe(165);
    expect(r.mpptWindow("inv-1")).toEqual({ minV: 200, maxV: 1000 });
    expect(r.mpptWindow("nope")).toBeNull();
  });

  it("weather source names the provider and coordinates, not the dataset (= project) name", () => {
    expect(result.weather_used.label).toContain("Mas Silueta");
    const s = sourceLabel(result);
    expect(s).toContain("PVGIS TMY");
    expect(s).toContain("-6.9606");
    expect(s).toContain("110.3342");
    expect(s).not.toContain("Mas Silueta");
  });
});

describe("sun path / iso charts keep text clear of the plot", () => {
  const curves = [{ label: "22 June", num: "1", segments: [[[90, 10], [0, 60], [-90, 10]] as Array<[number, number]>] }, { label: "22 December", num: "7", segments: [[[90, 5], [0, 40], [-90, 5]] as Array<[number, number]>] }];
  const base = { curves, horizon: null, title: "Orientation #1" };

  it("iso attenuation title is printed above the plot, not inside the svg", () => {
    const html = renderToStaticMarkup(createElement(IsoShadingChart, { ...base, contours: [], attenuation: "Attenuation for diffuse: 0.000 and albedo: 0.020", w: 560, h: 330 }));
    const svgStart = html.indexOf("<svg");
    expect(html.indexOf("Attenuation for diffuse")).toBeGreaterThan(-1);
    expect(html.indexOf("Attenuation for diffuse")).toBeLessThan(svgStart);
    expect(html.slice(svgStart)).not.toContain("Attenuation");
    expect(html.slice(svgStart)).toContain('data-testid="iso-legend"');
  });

  it("date legend: inside the arch with a white backing on wide plots, below the plot on narrow ones", () => {
    const wide = renderToStaticMarkup(createElement(SunPathChart, { ...base, w: 560, h: 330 }));
    expect(wide.slice(wide.indexOf("<svg"))).toContain('data-testid="sun-date-legend"');
    const narrow = renderToStaticMarkup(createElement(SunPathChart, base));
    const end = narrow.indexOf("</svg>");
    expect(narrow.indexOf('data-testid="sun-date-legend"')).toBeGreaterThan(end);
  });
});
