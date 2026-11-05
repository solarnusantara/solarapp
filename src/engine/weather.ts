// Pure weather-source logic (no fetch, no React): which weather a run uses, how sources compare,
// and how a choice is printed in reports. Every number here is arithmetic over values helio
// returned (annual sums, differences in percent); nothing is estimated or defaulted.
import type {
  CsvMapping, MonthlyWeatherSummary, WeatherComparisonEntry, WeatherDatasetSummary, WeatherRef, WeatherSeriesSummary,
} from "./types";
import type { WeatherChoice } from "./types/local";

/** A source whose annual GHI differs from the selected one by more than this is flagged. */
export const WEATHER_SPREAD_WARN_PCT = 5;
export const WEATHER_SPREAD_MESSAGE = "Sumber cuaca berbeda >5% — angka energi sensitif terhadap pilihan ini";

// helio `valid_series_year_range` (routes/weather.rs): 1900..=2100, first <= last, span <= 40.
export const SERIES_MIN_YEAR = 1900;
export const SERIES_MAX_YEAR = 2100;
export const SERIES_MAX_SPAN = 40;

/** null = acceptable to helio; otherwise the reason (same rule helio applies, so we fail before a fetch). */
export function seriesYearRangeError(first: unknown, last: unknown): string | null {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return "Tahun awal dan akhir harus bilangan bulat.";
  const y0 = first as number, y1 = last as number;
  if (y0 < SERIES_MIN_YEAR || y1 > SERIES_MAX_YEAR || y0 > SERIES_MAX_YEAR || y1 < SERIES_MIN_YEAR) {
    return `Tahun harus antara ${SERIES_MIN_YEAR} dan ${SERIES_MAX_YEAR}.`;
  }
  if (y0 > y1) return "Tahun awal tidak boleh setelah tahun akhir.";
  if (y1 - y0 > SERIES_MAX_SPAN) return `Rentang maksimal ${SERIES_MAX_SPAN} tahun (selisih tahun akhir - awal).`;
  return null;
}

const SOURCE_NAMES: Record<string, string> = {
  pvgis_tmy: "PVGIS TMY",
  pvgis_seriescalc: "PVGIS seriescalc",
  nasa_power_hourly: "NASA POWER",
  solcast_upload: "Solcast",
  solargis_upload: "Solargis",
  meteonorm_upload: "Meteonorm",
  epw_upload: "Unggahan EPW",
  tmy3_upload: "Unggahan TMY3",
  csv_upload: "Unggahan CSV",
};
export const weatherSourceName = (source: string | null | undefined): string => (source ? SOURCE_NAMES[source] ?? source : "");

export const choiceFromDataset = (d: Pick<WeatherDatasetSummary, "id" | "name" | "source">): WeatherChoice =>
  ({ kind: "dataset", id: d.id, label: d.name, source: d.source });

export const choiceFromSeries = (s: Pick<WeatherSeriesSummary, "id" | "name" | "provider" | "year_first" | "year_last" | "members">): WeatherChoice =>
  ({ kind: "series", id: s.id, label: s.name, source: s.provider, year_first: s.year_first, year_last: s.year_last, year_count: s.members.length });

const validChoice = (c: WeatherChoice | null | undefined): c is WeatherChoice =>
  !!c && (c.kind === "dataset" || c.kind === "series") && typeof c.id === "string" && c.id.trim() !== "";

export function weatherRefOf(c: WeatherChoice | null | undefined): WeatherRef | null {
  if (!validChoice(c)) return null;
  return c.kind === "series" ? { kind: "series", series_id: c.id } : { kind: "dataset", dataset_id: c.id };
}

export interface WeatherPlan {
  /** series: multi-year; dataset: one file; auto: PVGIS TMY fetched by the run; reference: helio's labelled site. */
  mode: "series" | "dataset" | "auto" | "reference";
  /** What to write into the condition set's `weather` (null = leave the stored one untouched). */
  ref: WeatherRef | null;
  /** The `simulate` query form of the same choice (helio rejects it together with `condition_set_id`). */
  query: { weather_series_id?: string; weather_dataset_id?: string };
  /** What the cached result records as the weather actually used (null for the reference site). */
  used: WeatherChoice | null;
}

/**
 * Decides which weather a run uses. A chosen series/dataset always wins; only when nothing is chosen
 * does the run fall back to the PVGIS TMY it fetched itself (`auto`), and when that also failed
 * the stored condition set's own weather (helio's reference site) stands.
 */
export function planWeather(choice: WeatherChoice | null | undefined, auto: WeatherChoice | null | undefined): WeatherPlan {
  if (validChoice(choice)) {
    return {
      mode: choice.kind === "series" ? "series" : "dataset",
      ref: weatherRefOf(choice),
      query: choice.kind === "series" ? { weather_series_id: choice.id } : { weather_dataset_id: choice.id },
      used: choice,
    };
  }
  if (validChoice(auto)) return { mode: "auto", ref: weatherRefOf(auto), query: { weather_dataset_id: auto.id }, used: auto };
  return { mode: "reference", ref: null, query: {}, used: null };
}

/** Text for the report rows. `fallback` is the weather meta helio echoed in the output (old results). */
export function weatherLabel(used: WeatherChoice | null | undefined, fallback?: { name?: string | null; source?: string | null } | null): string {
  if (validChoice(used)) {
    const src = weatherSourceName(used.source);
    const label = used.label.trim();
    let s = src && !label.toLowerCase().includes(src.toLowerCase()) ? `${label} — ${src}` : label;
    if (used.kind === "series") {
      const range = used.year_first != null && used.year_last != null ? ` ${used.year_first}–${used.year_last}` : "";
      const count = used.year_count ? `, ${used.year_count} tahun` : "";
      s += ` (multi-tahun${range}${count})`;
    }
    return s;
  }
  return [fallback?.name, fallback?.source].filter(Boolean).join(", ") || "—";
}

// ---------------- comparison ----------------
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** (value / base - 1) * 100; null when either side is missing or the base is 0. */
export const pctDiff = (value: number | null | undefined, base: number | null | undefined): number | null =>
  fin(value) && fin(base) && base !== 0 ? (value / base - 1) * 100 : null;

/** Annual DNI/DHI (sum of months) and mean air temperature (day-weighted) from helio's 12 monthly rows. Null when any month lacks it. */
export function annualFromMonthly(monthly: MonthlyWeatherSummary[] | null | undefined): { dni: number | null; dhi: number | null; temp: number | null } {
  const none = { dni: null, dhi: null, temp: null };
  if (!monthly || monthly.length !== 12) return none;
  const byMonth = [...monthly].sort((a, b) => a.month - b.month);
  if (byMonth.some((m, i) => m.month !== i + 1)) return none;
  const sum = (pick: (m: MonthlyWeatherSummary) => number | null) => {
    const v = byMonth.map(pick);
    return v.every(fin) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const t = byMonth.map((m) => m.temp_air_mean_c);
  return {
    dni: sum((m) => m.dni_kwh_m2),
    dhi: sum((m) => m.dhi_kwh_m2),
    temp: t.every(fin) ? (t as number[]).reduce((a, v, i) => a + v * DAYS[i], 0) / 365 : null,
  };
}

/** Mean of a series' member-year annual GHI; null when it has no members. */
export function seriesMeanGhi(s: Pick<WeatherSeriesSummary, "members"> | null | undefined): number | null {
  const v = (s?.members ?? []).map((m) => m.annual_ghi_kwh_m2).filter(fin);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface CompareItem {
  id: string;
  kind: "dataset" | "series";
  label: string;
  source: string;
  ghi: number | null;
  dni: number | null;
  dhi: number | null;
  temp: number | null;
  synthetic?: boolean;
}
export interface CompareRow extends CompareItem {
  isBase: boolean;
  ghiDiffPct: number | null;
  dniDiffPct: number | null;
  dhiDiffPct: number | null;
  /** True when |GHI difference vs the selected source| is above the warning threshold. */
  exceeds: boolean;
}

/** Rows with % difference against `baseId` (the selected source). No base found: every diff is null. */
export function buildComparison(items: CompareItem[], baseId: string | null | undefined, thresholdPct = WEATHER_SPREAD_WARN_PCT): CompareRow[] {
  const base = items.find((i) => i.id === baseId) ?? null;
  return items.map((i) => {
    const isBase = !!base && i.id === base.id;
    const ghiDiffPct = isBase ? null : pctDiff(i.ghi, base?.ghi);
    return {
      ...i, isBase, ghiDiffPct,
      dniDiffPct: isBase ? null : pctDiff(i.dni, base?.dni),
      dhiDiffPct: isBase ? null : pctDiff(i.dhi, base?.dhi),
      // 6 decimals: 105/100-1 is 5.000000000000004 in floating point, and exactly 5% must not warn.
      exceeds: ghiDiffPct !== null && Math.round(Math.abs(ghiDiffPct) * 1e6) / 1e6 > thresholdPct,
    };
  });
}
export const spreadExceeds = (rows: CompareRow[]): boolean => rows.some((r) => r.exceeds);

/** GHI of one dataset, preferring helio's comparison figure over the list summary. */
export const ghiOf = (entry: Pick<WeatherComparisonEntry, "annual_ghi_kwh_m2"> | null | undefined, summary?: Pick<WeatherDatasetSummary, "annual_ghi_kwh_m2"> | null): number | null =>
  fin(entry?.annual_ghi_kwh_m2) ? entry!.annual_ghi_kwh_m2 : fin(summary?.annual_ghi_kwh_m2) ? summary!.annual_ghi_kwh_m2 : null;

// ---------------- CSV column mapping (helio `CsvMapping`, csv_mapped.rs) ----------------
export type CsvIrradianceUnit = "W/m2" | "Wh/m2";
export const CSV_TIME_FORMATS: Array<{ value: CsvMapping["time"]["format"]; label: string }> = [
  { value: "iso8601", label: "ISO 8601 (YYYY-MM-DD HH:MM)" },
  { value: "dmy_hm", label: "DD/MM/YYYY HH:MM" },
  { value: "mdy_hm", label: "MM/DD/YYYY HH:MM" },
];
export const CSV_TIME_LABELS: Array<{ value: CsvMapping["time"]["label"]; label: string }> = [
  { value: "interval_start", label: "awal interval" },
  { value: "interval_center", label: "tengah interval" },
  { value: "interval_end", label: "akhir interval" },
];
export interface CsvMappingForm {
  delimiter: "," | ";" | "\t";
  skip_lines: number | "";
  time_column: string;
  time_format: CsvMapping["time"]["format"];
  clock_utc_offset_h: number | "";
  time_label: CsvMapping["time"]["label"];
  ghi_column: string; ghi_unit: CsvIrradianceUnit;
  temp_column: string;
  wind_column: string;
  dni_column: string; dni_unit: CsvIrradianceUnit;
  dhi_column: string; dhi_unit: CsvIrradianceUnit;
  pressure_column: string; pressure_unit: "Pa" | "hPa" | "mbar";
  rh_column: string;
}
export const EMPTY_CSV_MAPPING_FORM: CsvMappingForm = {
  delimiter: ",", skip_lines: 0, time_column: "", time_format: "iso8601", clock_utc_offset_h: "", time_label: "interval_start",
  ghi_column: "", ghi_unit: "W/m2", temp_column: "", wind_column: "", dni_column: "", dni_unit: "W/m2", dhi_column: "", dhi_unit: "W/m2",
  pressure_column: "", pressure_unit: "hPa", rh_column: "",
};

/** Form -> helio `mapping` JSON. Required: time, GHI, air temperature and wind columns plus the clock offset. */
export function buildCsvMapping(f: CsvMappingForm): { mapping: CsvMapping | null; errors: string[] } {
  const errors: string[] = [];
  const need = (v: string, what: string) => { if (!v.trim()) errors.push(`Kolom ${what} wajib diisi.`); };
  need(f.time_column, "waktu"); need(f.ghi_column, "GHI"); need(f.temp_column, "suhu udara"); need(f.wind_column, "kecepatan angin");
  if (typeof f.clock_utc_offset_h !== "number" || !Number.isFinite(f.clock_utc_offset_h) || Math.abs(f.clock_utc_offset_h) > 14) {
    errors.push("Zona waktu stempel waktu (UTC offset jam) harus antara -14 dan 14.");
  }
  const skip = f.skip_lines === "" ? 0 : f.skip_lines;
  if (!Number.isInteger(skip) || skip < 0) errors.push("Jumlah baris sebelum header harus bilangan bulat >= 0.");
  if (errors.length) return { mapping: null, errors };
  const col = (column: string, unit: string) => (column.trim() ? { column: column.trim(), unit } : null);
  return {
    errors,
    mapping: {
      delimiter: f.delimiter, skip_lines: skip,
      time: { column: f.time_column.trim(), format: f.time_format, clock_utc_offset_h: f.clock_utc_offset_h as number, label: f.time_label },
      ghi: { column: f.ghi_column.trim(), unit: f.ghi_unit },
      temp_air: { column: f.temp_column.trim(), unit: "degC" },
      wind_speed: { column: f.wind_column.trim(), unit: "m/s" },
      dni: col(f.dni_column, f.dni_unit), dhi: col(f.dhi_column, f.dhi_unit),
      pressure: col(f.pressure_column, f.pressure_unit), relative_humidity: col(f.rh_column, "%"),
    },
  };
}
