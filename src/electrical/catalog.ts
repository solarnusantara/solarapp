/**
 * Equipment catalog — Phase 1
 *
 * Only values that can be traced to this repository are seeded. Nothing is
 * inferred from a model name and no datasheet value is invented: every field
 * that is not stated in the repository is `null`, and every seeded entry is
 * marked `unverified` until a real datasheet has been checked.
 *
 * Sources used for the seeds:
 * - `src/BOQ.tsx` marketCatalog (indicative price list; brand + power text)
 * - `src/defaultProjectsData.ts` seeded BOQ text (demo data)
 *
 * Neither source is a datasheet. Readiness is therefore expected to be `false`
 * for all seeds; the UI must ask for the missing values or a custom entry.
 */

import type {
  InverterSpec,
  ModuleSpec,
  ReadinessResult,
  VerificationState
} from "./types";

const MODULE_SOURCE_BOQ = "src/BOQ.tsx marketCatalog (indicative price list; not a datasheet)";
const INVERTER_SOURCE_BOQ = "src/BOQ.tsx marketCatalog (indicative price list; not a datasheet)";
const INVERTER_SOURCE_SEED = "src/defaultProjectsData.ts seeded BOQ text (demo data; not a datasheet)";
const CUSTOM_SOURCE = "Custom entry (user provided; not datasheet-verified)";

/**
 * Seeded PV modules. Only nameplate power and identity come from the repo.
 * Voc/Vmp/Isc/Imp/coefficients/protection limits are all `null` because the
 * repository does not contain them.
 */
export const MODULE_CATALOG: readonly ModuleSpec[] = [
  {
    id: "module-ja-solar-550",
    manufacturer: "JA Solar",
    model: "550 Wp Mono PERC",
    pmaxWp: 550,
    vocV: null,
    vmpV: null,
    iscA: null,
    impA: null,
    betaVocPctPerC: null,
    betaVmpPctPerC: null,
    alphaIscPctPerC: null,
    referenceTempC: null,
    maxSystemVoltageV: null,
    maxSeriesFuseA: null,
    tempMinC: null,
    tempMaxC: null,
    source: MODULE_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact model, datasheet and warranty still require verification."
  },
  {
    id: "module-trina-vertex-575",
    manufacturer: "Trina Solar",
    model: "Vertex 575 Wp",
    pmaxWp: 575,
    vocV: null,
    vmpV: null,
    iscA: null,
    impA: null,
    betaVocPctPerC: null,
    betaVmpPctPerC: null,
    alphaIscPctPerC: null,
    referenceTempC: null,
    maxSystemVoltageV: null,
    maxSeriesFuseA: null,
    tempMinC: null,
    tempMaxC: null,
    source: MODULE_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact model, datasheet and warranty still require verification."
  },
  {
    id: "module-longi-hi-mo-650",
    manufacturer: "LONGi",
    model: "Hi-MO 650 Wp",
    pmaxWp: 650,
    vocV: null,
    vmpV: null,
    iscA: null,
    impA: null,
    betaVocPctPerC: null,
    betaVmpPctPerC: null,
    alphaIscPctPerC: null,
    referenceTempC: null,
    maxSystemVoltageV: null,
    maxSeriesFuseA: null,
    tempMinC: null,
    tempMaxC: null,
    source: MODULE_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact series, datasheet and warranty still require verification."
  },
  {
    id: "module-aiko-abc-650",
    manufacturer: "AIKO",
    model: "ABC 650 Wp",
    pmaxWp: 650,
    vocV: null,
    vmpV: null,
    iscA: null,
    impA: null,
    betaVocPctPerC: null,
    betaVmpPctPerC: null,
    alphaIscPctPerC: null,
    referenceTempC: null,
    maxSystemVoltageV: null,
    maxSeriesFuseA: null,
    tempMinC: null,
    tempMaxC: null,
    source: MODULE_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact series, datasheet and warranty still require verification."
  }
];

/**
 * Seeded inverters. The repository states AC power (and, for the seeded
 * Huawei 100 kW text, phase count/MPPT count/efficiency); everything else is
 * `null`. Those few values are demo text, not a datasheet, so the entries stay
 * `unverified`.
 */
export const INVERTER_CATALOG: readonly InverterSpec[] = [
  {
    id: "inverter-solis-10k-3p",
    manufacturer: "Solis",
    model: "On-grid 10 kW 3-phase",
    ratedAcPowerW: 10000,
    maxDcVoltageV: null,
    mpptMinV: null,
    mpptMaxV: null,
    startupV: null,
    mpptCount: null,
    inputsPerMppt: null,
    maxMpptCurrentA: null,
    maxMpptIscA: null,
    maxUsableDcPowerW: null,
    ratedAcVoltageV: null,
    phases: 3,
    frequencyHz: null,
    powerFactorMin: null,
    powerFactorMax: null,
    efficiencyPct: null,
    source: INVERTER_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact model, datasheet and warranty still require verification."
  },
  {
    id: "inverter-growatt-10k-3p",
    manufacturer: "Growatt",
    model: "On-grid 10 kW 3-phase",
    ratedAcPowerW: 10000,
    maxDcVoltageV: null,
    mpptMinV: null,
    mpptMaxV: null,
    startupV: null,
    mpptCount: null,
    inputsPerMppt: null,
    maxMpptCurrentA: null,
    maxMpptIscA: null,
    maxUsableDcPowerW: null,
    ratedAcVoltageV: null,
    phases: 3,
    frequencyHz: null,
    powerFactorMin: null,
    powerFactorMax: null,
    efficiencyPct: null,
    source: INVERTER_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact model, datasheet and warranty still require verification."
  },
  {
    id: "inverter-huawei-sun2000-10k",
    manufacturer: "Huawei",
    model: "SUN2000 10 kW",
    ratedAcPowerW: 10000,
    maxDcVoltageV: null,
    mpptMinV: null,
    mpptMaxV: null,
    startupV: null,
    mpptCount: null,
    inputsPerMppt: null,
    maxMpptCurrentA: null,
    maxMpptIscA: null,
    maxUsableDcPowerW: null,
    ratedAcVoltageV: null,
    phases: null,
    frequencyHz: null,
    powerFactorMin: null,
    powerFactorMax: null,
    efficiencyPct: null,
    source: INVERTER_SOURCE_BOQ,
    verification: "unverified",
    notes: "Phase count is not stated in the price list; verify the datasheet."
  },
  {
    id: "inverter-sungrow-10k-3p",
    manufacturer: "Sungrow",
    model: "On-grid 10 kW 3-phase",
    ratedAcPowerW: 10000,
    maxDcVoltageV: null,
    mpptMinV: null,
    mpptMaxV: null,
    startupV: null,
    mpptCount: null,
    inputsPerMppt: null,
    maxMpptCurrentA: null,
    maxMpptIscA: null,
    maxUsableDcPowerW: null,
    ratedAcVoltageV: null,
    phases: 3,
    frequencyHz: null,
    powerFactorMin: null,
    powerFactorMax: null,
    efficiencyPct: null,
    source: INVERTER_SOURCE_BOQ,
    verification: "unverified",
    notes: "Exact model, datasheet and warranty still require verification."
  },
  {
    id: "inverter-huawei-sun2000-100k",
    manufacturer: "Huawei",
    model: "SUN2000 100 kW",
    ratedAcPowerW: 100000,
    maxDcVoltageV: null,
    mpptMinV: null,
    mpptMaxV: null,
    startupV: null,
    mpptCount: 10,
    inputsPerMppt: null,
    maxMpptCurrentA: null,
    maxMpptIscA: null,
    maxUsableDcPowerW: null,
    ratedAcVoltageV: null,
    phases: 3,
    frequencyHz: null,
    powerFactorMin: null,
    powerFactorMax: null,
    efficiencyPct: 98.8,
    source: INVERTER_SOURCE_SEED,
    verification: "unverified",
    notes:
      "MPPT count and efficiency come from seeded demo text, not a datasheet; confirm the exact model and the remaining limits."
  }
];

export function findModuleById(id: string): ModuleSpec | undefined {
  return MODULE_CATALOG.find(module => module.id === id);
}

export function findInverterById(id: string): InverterSpec | undefined {
  return INVERTER_CATALOG.find(inverter => inverter.id === id);
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

interface RequiredField<T> {
  key: keyof T & string;
  label: string;
  /** Values that are allowed to be zero or negative. */
  allowNonPositive?: boolean;
}

const MODULE_REQUIRED_FIELDS: ReadonlyArray<RequiredField<ModuleSpec>> = [
  { key: "pmaxWp", label: "Maximum power (Pmax)" },
  { key: "vocV", label: "Open-circuit voltage (Voc)" },
  { key: "vmpV", label: "Voltage at maximum power (Vmp)" },
  { key: "iscA", label: "Short-circuit current (Isc)" },
  { key: "impA", label: "Current at maximum power (Imp)" },
  { key: "betaVocPctPerC", label: "Voc temperature coefficient", allowNonPositive: true },
  { key: "referenceTempC", label: "Reference temperature" },
  { key: "maxSystemVoltageV", label: "Maximum system voltage" },
  { key: "maxSeriesFuseA", label: "Maximum series fuse rating" }
];

const INVERTER_REQUIRED_FIELDS: ReadonlyArray<RequiredField<InverterSpec>> = [
  { key: "ratedAcPowerW", label: "Rated AC power" },
  { key: "maxDcVoltageV", label: "Maximum DC voltage" },
  { key: "mpptMinV", label: "MPPT minimum voltage" },
  { key: "mpptMaxV", label: "MPPT maximum voltage" },
  { key: "mpptCount", label: "MPPT count" },
  { key: "inputsPerMppt", label: "String inputs per MPPT" },
  { key: "maxMpptCurrentA", label: "Maximum MPPT current" },
  { key: "maxMpptIscA", label: "Maximum MPPT Isc" },
  { key: "ratedAcVoltageV", label: "Rated AC voltage" },
  { key: "phases", label: "Phase count" },
  { key: "frequencyHz", label: "Frequency" },
  { key: "efficiencyPct", label: "Efficiency" }
];

function readNumeric<T>(spec: T, key: keyof T & string): number | null {
  const value = (spec as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function checkRequired<T>(
  spec: T,
  fields: ReadonlyArray<RequiredField<T>>,
  missing: string[],
  errors: string[]
): void {
  for (const field of fields) {
    const value = readNumeric(spec, field.key);
    if (value === null) {
      missing.push(field.key);
      continue;
    }
    if (!field.allowNonPositive && value <= 0) {
      errors.push(`${field.key} must be greater than zero (${field.label}).`);
    }
  }
}

function resolveVerification(
  spec: { source: string; verifiedAt?: string; verification: VerificationState },
  errors: string[],
  warnings: string[]
): VerificationState {
  if (spec.verification === "verified") {
    if (!spec.source || spec.source.trim() === "") {
      errors.push("A verified specification requires a source.");
      return "unverified";
    }
    if (!spec.verifiedAt) {
      errors.push("A verified specification requires verifiedAt (ISO date of the datasheet check).");
      return "unverified";
    }
    return "verified";
  }
  if (spec.verification === "missing") {
    warnings.push("Specification is missing; no calculation may rely on this item.");
    return "missing";
  }
  warnings.push("Specification is unverified; results are preliminary and cannot be approved.");
  return "unverified";
}

export function moduleReadiness(spec: ModuleSpec): ReadinessResult {
  const missing: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  checkRequired(spec, MODULE_REQUIRED_FIELDS, missing, errors);

  const voc = readNumeric(spec, "vocV");
  const vmp = readNumeric(spec, "vmpV");
  const isc = readNumeric(spec, "iscA");
  const imp = readNumeric(spec, "impA");
  const betaVoc = readNumeric(spec, "betaVocPctPerC");
  const referenceTemp = readNumeric(spec, "referenceTempC");

  if (voc !== null && vmp !== null && voc < vmp) {
    errors.push("Voc is lower than Vmp; check the datasheet values.");
  }
  if (isc !== null && imp !== null && isc < imp) {
    errors.push("Isc is lower than Imp; check the datasheet values.");
  }
  if (betaVoc !== null && betaVoc >= 0) {
    warnings.push("Voc temperature coefficient is not negative; confirm it against the datasheet.");
  }
  if (referenceTemp !== null && referenceTemp !== 25) {
    warnings.push(`Reference temperature is ${referenceTemp} °C, not the STC 25 °C.`);
  }

  const verification = resolveVerification(spec, errors, warnings);

  return {
    ready: missing.length === 0 && errors.length === 0 && verification !== "missing",
    verification,
    missing,
    errors,
    warnings
  };
}

export function inverterReadiness(spec: InverterSpec): ReadinessResult {
  const missing: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  checkRequired(spec, INVERTER_REQUIRED_FIELDS, missing, errors);

  const mpptMin = readNumeric(spec, "mpptMinV");
  const mpptMax = readNumeric(spec, "mpptMaxV");
  const maxDc = readNumeric(spec, "maxDcVoltageV");
  const mpptCount = readNumeric(spec, "mpptCount");
  const inputsPerMppt = readNumeric(spec, "inputsPerMppt");
  const efficiency = readNumeric(spec, "efficiencyPct");
  const pfMin = readNumeric(spec, "powerFactorMin");
  const pfMax = readNumeric(spec, "powerFactorMax");

  if (mpptMin !== null && mpptMax !== null && mpptMin >= mpptMax) {
    errors.push("MPPT minimum voltage must be lower than the MPPT maximum voltage.");
  }
  if (maxDc !== null && mpptMax !== null && mpptMax > maxDc) {
    errors.push("MPPT maximum voltage is above the inverter maximum DC voltage.");
  }
  // `checkRequired` already rejects non-positive values; these checks cover
  // positive but fractional counts.
  for (const [key, value] of [
    ["mpptCount", mpptCount],
    ["inputsPerMppt", inputsPerMppt]
  ] as const) {
    if (value !== null && value > 0 && !Number.isInteger(value)) {
      errors.push(`${key} must be a whole number.`);
    }
  }
  if (efficiency !== null && (efficiency <= 0 || efficiency > 100)) {
    errors.push("Efficiency must be greater than 0 and at most 100 %.");
  }
  if (spec.phases !== null && spec.phases !== 1 && spec.phases !== 3) {
    errors.push("Phase count must be 1 or 3.");
  }
  if (spec.frequencyHz !== null && spec.frequencyHz !== 50 && spec.frequencyHz !== 60) {
    errors.push("Frequency must be 50 or 60 Hz.");
  }
  if (pfMin !== null && pfMax !== null && pfMin > pfMax) {
    errors.push("Power factor minimum is above the power factor maximum.");
  }

  const verification = resolveVerification(spec, errors, warnings);

  return {
    ready: missing.length === 0 && errors.length === 0 && verification !== "missing",
    verification,
    missing,
    errors,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Custom equipment
// ---------------------------------------------------------------------------

export function slugifyId(...parts: string[]): string {
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function uniqueId(base: string, existingIds: readonly string[] = []): string {
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

type CustomModuleInput = Partial<Omit<ModuleSpec, "id" | "verification">>;

/**
 * Build a user-supplied module. Custom entries are always `unverified`: a
 * reviewer (or a later datasheet import) must promote them explicitly.
 */
export function createCustomModuleSpec(
  input: CustomModuleInput,
  options: { existingIds?: readonly string[] } = {}
): ModuleSpec {
  const manufacturer = cleanText(input.manufacturer, "Custom");
  const model = cleanText(input.model, "Unnamed module");
  const id = uniqueId(
    slugifyId("module", manufacturer, model),
    options.existingIds ?? []
  );

  return {
    id,
    manufacturer,
    model,
    pmaxWp: input.pmaxWp ?? null,
    vocV: input.vocV ?? null,
    vmpV: input.vmpV ?? null,
    iscA: input.iscA ?? null,
    impA: input.impA ?? null,
    betaVocPctPerC: input.betaVocPctPerC ?? null,
    betaVmpPctPerC: input.betaVmpPctPerC ?? null,
    alphaIscPctPerC: input.alphaIscPctPerC ?? null,
    referenceTempC: input.referenceTempC ?? null,
    maxSystemVoltageV: input.maxSystemVoltageV ?? null,
    maxSeriesFuseA: input.maxSeriesFuseA ?? null,
    tempMinC: input.tempMinC ?? null,
    tempMaxC: input.tempMaxC ?? null,
    source: cleanText(input.source, CUSTOM_SOURCE),
    verifiedAt: input.verifiedAt,
    verification: "unverified",
    notes: input.notes ?? "Custom entry; verify every value against the datasheet before approval."
  };
}

type CustomInverterInput = Partial<Omit<InverterSpec, "id" | "verification">>;

/**
 * Build a user-supplied inverter. Custom entries are always `unverified`.
 */
export function createCustomInverterSpec(
  input: CustomInverterInput,
  options: { existingIds?: readonly string[] } = {}
): InverterSpec {
  const manufacturer = cleanText(input.manufacturer, "Custom");
  const model = cleanText(input.model, "Unnamed inverter");
  const id = uniqueId(
    slugifyId("inverter", manufacturer, model),
    options.existingIds ?? []
  );

  return {
    id,
    manufacturer,
    model,
    ratedAcPowerW: input.ratedAcPowerW ?? null,
    maxDcVoltageV: input.maxDcVoltageV ?? null,
    mpptMinV: input.mpptMinV ?? null,
    mpptMaxV: input.mpptMaxV ?? null,
    startupV: input.startupV ?? null,
    mpptCount: input.mpptCount ?? null,
    inputsPerMppt: input.inputsPerMppt ?? null,
    maxMpptCurrentA: input.maxMpptCurrentA ?? null,
    maxMpptIscA: input.maxMpptIscA ?? null,
    maxUsableDcPowerW: input.maxUsableDcPowerW ?? null,
    ratedAcVoltageV: input.ratedAcVoltageV ?? null,
    phases: input.phases ?? null,
    frequencyHz: input.frequencyHz ?? null,
    powerFactorMin: input.powerFactorMin ?? null,
    powerFactorMax: input.powerFactorMax ?? null,
    efficiencyPct: input.efficiencyPct ?? null,
    source: cleanText(input.source, CUSTOM_SOURCE),
    verifiedAt: input.verifiedAt,
    verification: "unverified",
    notes: input.notes ?? "Custom entry; verify every value against the datasheet before approval."
  };
}
