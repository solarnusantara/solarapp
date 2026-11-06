import { describe, expect, it } from "vitest";
import type { MonthlyWeatherSummary } from "./types";
import type { EngineResultSummary, WeatherChoice } from "./types/local";
import {
  annualFromMonthly, buildComparison, buildCsvMapping, choiceFromSeries, EMPTY_CSV_MAPPING_FORM, pctDiff, planWeather, seriesMeanGhi,
  seriesYearRangeError, spreadExceeds, weatherLabel, type CompareItem,
} from "./weather";
import { sourceLabel, weatherVariability } from "../reports/model";

const ds: WeatherChoice = { kind: "dataset", id: "d1", label: "NASA POWER Semarang", source: "nasa_power_hourly" };
const sr: WeatherChoice = { kind: "series", id: "s1", label: "PVGIS SARAH3", source: "pvgis_seriescalc", year_first: 2005, year_last: 2023, year_count: 19 };
const auto: WeatherChoice = { kind: "dataset", id: "auto1", label: "Mas Silueta", source: "pvgis_tmy" };

describe("planWeather (which weather run() uses)", () => {
  it("a chosen series goes through weather_series_id / WeatherRef.series", () => {
    const p = planWeather(sr, auto);
    expect(p.mode).toBe("series");
    expect(p.ref).toEqual({ kind: "series", series_id: "s1" });
    expect(p.query).toEqual({ weather_series_id: "s1" });
    expect(p.used).toBe(sr);
  });
  it("a chosen dataset goes through weather_dataset_id and ignores the auto fetch", () => {
    const p = planWeather(ds, auto);
    expect(p.mode).toBe("dataset");
    expect(p.ref).toEqual({ kind: "dataset", dataset_id: "d1" });
    expect(p.query).toEqual({ weather_dataset_id: "d1" });
  });
  it("nothing chosen: falls back to the PVGIS TMY the run fetched", () => {
    const p = planWeather(null, auto);
    expect(p.mode).toBe("auto");
    expect(p.ref).toEqual({ kind: "dataset", dataset_id: "auto1" });
    expect(p.used).toBe(auto);
  });
  it("nothing chosen and the fetch failed: reference site, condition set untouched, nothing recorded", () => {
    expect(planWeather(undefined, null)).toEqual({ mode: "reference", ref: null, query: {}, used: null });
  });
  it("a choice with an empty id counts as no choice", () => {
    expect(planWeather({ ...ds, id: " " }, auto).mode).toBe("auto");
  });
});

describe("comparison", () => {
  const item = (id: string, ghi: number | null, over: Partial<CompareItem> = {}): CompareItem =>
    ({ id, kind: "dataset", label: id, source: "pvgis_tmy", ghi, dni: null, dhi: null, temp: null, ...over });

  it("pctDiff is (v/base-1)*100 and null for missing or zero base", () => {
    expect(pctDiff(1928.6, 1787.6)).toBeCloseTo(7.888, 2);
    expect(pctDiff(null, 1)).toBeNull();
    expect(pctDiff(1, 0)).toBeNull();
    expect(pctDiff(1, undefined)).toBeNull();
  });
  it("flags only differences above 5% against the selected source", () => {
    const rows = buildComparison([item("base", 1787.6), item("near", 1850), item("far", 1928.6)], "base");
    expect(rows.map((r) => r.isBase)).toEqual([true, false, false]);
    expect(rows[0].ghiDiffPct).toBeNull();
    expect(rows[1].ghiDiffPct).toBeCloseTo(3.49, 1);
    expect(rows.map((r) => r.exceeds)).toEqual([false, false, true]);
    expect(spreadExceeds(rows)).toBe(true);
    expect(spreadExceeds(rows.slice(0, 2))).toBe(false);
  });
  it("exactly 5% is not flagged; negative spreads count", () => {
    expect(buildComparison([item("a", 100), item("b", 105)], "a")[1].exceeds).toBe(false);
    expect(buildComparison([item("a", 100), item("b", 94)], "a")[1].exceeds).toBe(true);
  });
  it("no selected source: no diffs, no flag", () => {
    const rows = buildComparison([item("a", 100), item("b", 200)], null);
    expect(rows.every((r) => r.ghiDiffPct === null && !r.exceeds)).toBe(true);
  });
  it("annualFromMonthly sums DNI/DHI and day-weights temperature; null when a month lacks data", () => {
    const m = (i: number, dni: number | null): MonthlyWeatherSummary =>
      ({ month: i, ghi_kwh_m2: 100, dni_kwh_m2: dni, dhi_kwh_m2: 50, temp_air_mean_c: 27, wind_speed_mean_m_s: 2 });
    const full = Array.from({ length: 12 }, (_, i) => m(i + 1, 80));
    const a = annualFromMonthly(full);
    expect(a.dni).toBe(960);
    expect(a.dhi).toBe(600);
    expect(a.temp).toBeCloseTo(27, 9);
    const gap = full.map((x, i) => (i === 3 ? { ...x, dni_kwh_m2: null } : x));
    expect(annualFromMonthly(gap).dni).toBeNull();
    expect(annualFromMonthly(gap).dhi).toBe(600);
    expect(annualFromMonthly(full.slice(0, 11))).toEqual({ dni: null, dhi: null, temp: null });
  });
  it("seriesMeanGhi averages member years", () => {
    expect(seriesMeanGhi({ members: [{ year: 1, dataset_id: "a", annual_ghi_kwh_m2: 1800 }, { year: 2, dataset_id: "b", annual_ghi_kwh_m2: 2000 }] })).toBe(1900);
    expect(seriesMeanGhi({ members: [] })).toBeNull();
  });
});

describe("seriesYearRangeError mirrors helio valid_series_year_range", () => {
  it("accepts 2005-2023 and a 40-year span", () => {
    expect(seriesYearRangeError(2005, 2023)).toBeNull();
    expect(seriesYearRangeError(1990, 2030)).toBeNull();
    expect(seriesYearRangeError(2005, 2005)).toBeNull();
  });
  it("rejects span > 40, reversed, out of 1900..2100, non-integers", () => {
    expect(seriesYearRangeError(2005, 2046)).not.toBeNull();
    expect(seriesYearRangeError(2023, 2005)).not.toBeNull();
    expect(seriesYearRangeError(1899, 1900)).not.toBeNull();
    expect(seriesYearRangeError(2100, 2101)).not.toBeNull();
    expect(seriesYearRangeError(null, 2020)).not.toBeNull();
    expect(seriesYearRangeError(2005.5, 2020)).not.toBeNull();
  });
});

describe("report labels", () => {
  const result = (extra: Partial<EngineResultSummary>, output: unknown = {}) => ({ output, ...extra }) as unknown as EngineResultSummary;

  it("series: source name, years and count", () => {
    expect(weatherLabel(sr)).toBe("PVGIS SARAH3 — PVGIS seriescalc (multi-tahun 2005–2023, 19 tahun)");
  });
  it("does not repeat the source when the helio name already carries it", () => {
    expect(weatherLabel({ ...ds, label: "NASA POWER -6.9, 110.4" })).toBe("NASA POWER -6.9, 110.4");
  });
  it("upload shows the file/dataset name", () => {
    expect(weatherLabel({ kind: "dataset", id: "x", label: "semarang_meteonorm.epw", source: "epw_upload" })).toBe("semarang_meteonorm.epw — Unggahan EPW");
  });
  it("falls back to the echoed weather meta, then to a dash; never invents", () => {
    expect(weatherLabel(null, { name: "Semarang", source: "pvgis_tmy" })).toBe("Semarang, pvgis_tmy");
    expect(weatherLabel(undefined, null)).toBe("—");
    expect(weatherLabel(undefined, {})).toBe("—");
  });
  it("choiceFromSeries carries helio's years", () => {
    const c = choiceFromSeries({ id: "s", name: "n", provider: "pvgis_seriescalc", year_first: 2010, year_last: 2020, members: [] });
    expect(c).toMatchObject({ kind: "series", year_first: 2010, year_last: 2020, year_count: 0 });
  });
  it("sourceLabel prefers weather_used over the echoed meta", () => {
    expect(sourceLabel(result({ weather_used: sr }, { weather: { name: "ref", source: "reference_site" } }))).toContain("multi-tahun");
    expect(sourceLabel(result({}, { weather: { name: "ref", source: "reference_site" } }))).toBe("ref, reference_site");
    expect(sourceLabel(null)).toBe("—");
  });
  it("weatherVariability reads helio's IAV figures and is null when absent", () => {
    const v = weatherVariability(result({}, { uncertainty: { sigma_iav_pct: 3.2, iav_source: "multi_year_series", iav_from_user: false, years: [{}, {}, {}], p50_multiyear_median_kwh: 1000, p50_multiyear_delta_pct: -1.5 } }));
    expect(v).toEqual({ sigmaIavPct: 3.2, fromSeries: true, fromUser: false, yearCount: 3, medianKwh: 1000, medianDeltaPct: -1.5 });
    expect(weatherVariability(result({}, {}))).toEqual({ sigmaIavPct: null, fromSeries: false, fromUser: false, yearCount: null, medianKwh: null, medianDeltaPct: null });
  });
});

describe("buildCsvMapping", () => {
  const ok = { ...EMPTY_CSV_MAPPING_FORM, time_column: "period_end", clock_utc_offset_h: 7, ghi_column: "ghi", temp_column: "air_temp", wind_column: "wind", dni_column: "dni" };
  it("builds helio's CsvMapping with optional columns null", () => {
    const { mapping, errors } = buildCsvMapping(ok);
    expect(errors).toEqual([]);
    expect(mapping).toMatchObject({
      delimiter: ",", skip_lines: 0, time: { column: "period_end", format: "iso8601", clock_utc_offset_h: 7, label: "interval_start" },
      ghi: { column: "ghi", unit: "W/m2" }, temp_air: { unit: "degC" }, wind_speed: { unit: "m/s" },
      dni: { column: "dni", unit: "W/m2" }, dhi: null, pressure: null, relative_humidity: null,
    });
  });
  it("lists every missing required field instead of guessing", () => {
    const { mapping, errors } = buildCsvMapping(EMPTY_CSV_MAPPING_FORM);
    expect(mapping).toBeNull();
    expect(errors.length).toBe(5);
  });
});
