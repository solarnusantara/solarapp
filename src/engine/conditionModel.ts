// Pure model behind ConditionForm: required-key validation (helio rejects a ConditionSet with a
// missing field), the Sonus PVsyst preset and its honest mapping. No physics, no defaults invented:
// a PVsyst value with no engine field is returned in `unsupported`, a value the PDF does not give
// but the engine needs is returned in `needsInput`.
import type { ConditionSet, UncertaintyInput } from "./types";

type Months = ConditionSet["albedo"];
const m12 = (v: number): Months => Array(12).fill(v) as Months;

/** Every non-optional key of ConditionSet (ts-rs marks optional ones with `?`). */
export const REQUIRED_KEYS: Array<keyof ConditionSet> = [
  "schema_version", "weather", "solar_angle_location", "transposition", "decomposition", "iam",
  "iam_b0", "iam_a_r", "pan_iam_profile", "iam_diffuse", "albedo", "albedo_use_weather",
  "spectral_enabled", "spectral_technology", "spectral_pw_from_weather", "soiling_pct", "mismatch",
  "dc_wiring", "inverter_efficiency_pct", "ac_loss", "lid", "degradation", "availability",
  "custom_losses", "temperature_model", "module_temp_coeff_p_max_pct_per_c",
  "module_characterization_id", "inverter_characterization_id", "power_factor",
  "inverter_temp_offset_c", "bifacial",
];

export const MAX_CUSTOM_LOSSES = 5;

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

function checkNumbers(path: string, v: unknown, errors: string[]) {
  if (typeof v === "number") { if (!Number.isFinite(v)) errors.push(`${path} harus berupa angka.`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => checkNumbers(`${path}[${i}]`, x, errors)); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) checkNumbers(`${path}.${k}`, x, errors);
}

/** Validates and returns the JSON to PUT. `undefined` optional fields are dropped. */
export function serializeConditionSet(cs: ConditionSet): { params: ConditionSet; errors: string[] } {
  const errors: string[] = [];
  const rec = cs as unknown as Record<string, unknown>;
  for (const k of REQUIRED_KEYS) if (rec[k as string] === undefined) errors.push(`Field wajib "${k}" kosong.`);
  checkNumbers("", cs, errors);
  if (cs.albedo?.some((a) => !(a >= 0 && a <= 1))) errors.push("Albedo tiap bulan harus 0 sampai 1.");
  if (cs.custom_losses?.length > MAX_CUSTOM_LOSSES) errors.push(`Maksimal ${MAX_CUSTOM_LOSSES} loss kustom.`);
  if (!(cs.inverter_efficiency_pct > 0 && cs.inverter_efficiency_pct <= 100)) errors.push("Efisiensi inverter harus di (0, 100].");
  if (!(cs.power_factor > 0 && cs.power_factor <= 1)) errors.push("Faktor daya harus 0 < pf <= 1.");
  const clean = JSON.parse(JSON.stringify(cs, (_k, v) => (v === undefined ? undefined : v))) as ConditionSet;
  return { params: clean, errors };
}

export interface UnsupportedItem { label: string; value: string; reason: string }
export interface PresetResult {
  params: ConditionSet;
  uncertainty: UncertaintyInput;
  unsupported: UnsupportedItem[];
  needsInput: string[];
  source: string;
}

/** The ten rows helio needs before it reports P90 (UncertaintyRow keys, helio order). */
export const UNCERTAINTY_ROWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "resource_long_term", label: "Resource jangka panjang" },
  { key: "iav", label: "Variabilitas antar-tahun (IAV)" },
  { key: "transposition", label: "Transposisi" },
  { key: "module_model", label: "Model modul" },
  { key: "temperature", label: "Suhu" },
  { key: "soiling", label: "Soiling" },
  { key: "mismatch", label: "Mismatch" },
  { key: "inverter", label: "Inverter" },
  { key: "degradation", label: "Degradasi" },
  { key: "availability", label: "Ketersediaan" },
];

export const PVSYST_PRESET_SOURCE = "PLTS-MAS-E-CS-001-00 Rev.00";
export const PVSYST_PRESET_LABEL = `Sonus PVsyst — sumber: ${PVSYST_PRESET_SOURCE}`;

/** Applies the PVsyst report values onto `base` (a loaded ConditionSet: weather/characterizations are kept). */
export function applyPvsystPreset(base: ConditionSet): PresetResult {
  const src = `PVsyst ${PVSYST_PRESET_SOURCE}`;
  const needsInput: string[] = [];
  const unsupported: UnsupportedItem[] = [
    { label: "IAM Fresnel, lapisan AR: n(glass)=1.526, n(AR)=1.290", value: "n_glass 1.526 / n_AR 1.290", reason: "tidak didukung engine: model IAM 'physical' tidak punya parameter n_glass/n_AR; model dipilih, parameter tidak diterapkan" },
    { label: "Mismatch akibat degradasi (Imp/Vmp RMS dispersion)", value: "0.4 %/tahun", reason: "tidak didukung engine" },
    { label: "Hambatan array global (106 mΩ, 27 mΩ)", value: "106 mΩ / 27 mΩ", reason: "tidak didukung engine: DC wiring hanya berupa persen pada STC (3.0%)" },
    { label: "Perubahan iklim (Specified Deviation)", value: "0.0 %", reason: "tidak didukung engine; bernilai 0 sehingga tidak berpengaruh" },
    { label: "Soiling + mismatch uncertainty (1.0%, satu nilai gabungan)", value: "1.0 %", reason: "engine memisah soiling dan mismatch; nilai gabungan diisikan ke komponen 'soiling' saja" },
  ];

  const tm = base.temperature_model;
  const thermal: ConditionSet["temperature_model"] = {
    model: "pvsyst", u_c: 20, u_v: 0,
    alpha_absorption: tm.model === "pvsyst" ? tm.alpha_absorption : NaN,
    module_efficiency: tm.model === "pvsyst" ? tm.module_efficiency : NaN,
  };
  if (tm.model !== "pvsyst") {
    needsInput.push("temperature_model.alpha_absorption (absorptansi, tidak tertera di PDF PVsyst)");
    needsInput.push("temperature_model.module_efficiency (efisiensi modul, tidak tertera di PDF PVsyst)");
  }

  const params: ConditionSet = {
    ...base,
    iam: "physical",
    albedo: m12(0.2),
    albedo_use_weather: false,
    soiling_pct: m12(3),
    mismatch: { ...base.mismatch, pct: 3 },
    dc_wiring: { mode: "pct", pct: 3, basis: "stc" },
    ac_loss: { mode: "pct", pct: 0.36, basis: "stc" },
    lid: { mode: "pct", pct: 2 },
    degradation: { ...base.degradation, annual_rate_pct: 0.4 },
    availability: { mode: "annual", pct: 1.9 },
    temperature_model: thermal,
    custom_losses: [
      { name: "Module quality", description: `Module Quality Loss 4.0% (${src})`, stage: "dc", monthly_pct: m12(4) },
      { name: "String mismatch", description: `Strings Mismatch loss 1.5% (${src})`, stage: "dc", monthly_pct: m12(1.5) },
    ],
  };
  const absent = "tidak dicantumkan di PLTS-MAS-E-CS-001-00 (PVsyst hanya memakai 5 komponen)";
  const given: Record<string, { sigma_pct: number; source: string }> = {
    iav: { sigma_pct: 5.5, source: `${src}: year-to-year variability` },
    module_model: { sigma_pct: 1, source: `${src}: PV module modelling/parameters` },
    inverter: { sigma_pct: 0.5, source: `${src}: inverter efficiency uncertainty` },
    soiling: { sigma_pct: 1, source: `${src}: soiling and mismatch uncertainties (gabungan)` },
    degradation: { sigma_pct: 1, source: `${src}: degradation uncertainty` },
  };
  // helio returns no P90 (p90_status = needs_uncertainty_inputs) unless ALL 10 rows carry a sigma, so the
  // five components PVsyst does not list are sent explicitly as 0 with that stated as the source.
  const uncertainty: UncertaintyInput = {
    horizon_years: 1,
    combination: "rss",
    components: UNCERTAINTY_ROWS.map((r) => ({ key: r.key, ...(given[r.key] ?? { sigma_pct: 0, source: absent }) })),
  };
  return { params, uncertainty, unsupported, needsInput, source: PVSYST_PRESET_LABEL };
}

export { finite };
