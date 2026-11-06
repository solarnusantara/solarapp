// Export limitation mode (helio ExportLimitationMode). Absent = helio follows the tariff-class rule.
import type { ExportLimitationMode } from "./types/ExportLimitationMode";

export const EXPORT_MODE_OPTIONS: ReadonlyArray<{ value: ExportLimitationMode; label: string }> = [
  { value: "zero_export", label: "Zero export (Permen ESDM 2/2024)" },
  { value: "physical_export_zero_credit", label: "Ekspor fisik tanpa kredit" },
];
/** Label of the empty choice: the field is omitted from the SimulationInput. */
export const EXPORT_MODE_DEFAULT_LABEL = "Ikuti aturan golongan (default helio)";

export const isExportMode = (v: unknown): v is ExportLimitationMode => EXPORT_MODE_OPTIONS.some((o) => o.value === v);

/** Printed label; the default (absent) mode reads as the helio default. */
export const exportModeLabel = (v: unknown): string => EXPORT_MODE_OPTIONS.find((o) => o.value === v)?.label ?? EXPORT_MODE_DEFAULT_LABEL;
