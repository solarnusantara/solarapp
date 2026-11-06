// Racking choice shared by the input form, the SimulationInput builder and the scene adapter.
// helio `Racking` (ENG-10) has exactly these four values; there is deliberately no default.
import type { Racking } from "./types/Racking";

export const RACKING_OPTIONS: ReadonlyArray<{ value: Racking; label: string }> = [
  { value: "fixed_tilt", label: "Fixed tilt" },
  { value: "flush_mount", label: "Flush mount (menempel atap)" },
  { value: "east_west", label: "East-West" },
  { value: "carport", label: "Carport" },
];

export const isRacking = (v: unknown): v is Racking => RACKING_OPTIONS.some((o) => o.value === v);
