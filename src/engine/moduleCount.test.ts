import { describe, expect, it } from "vitest";
import { helioModuleCount, moduleCountMismatch } from "./moduleCount";

const r = (n: number) => ({ production: { design: { module_count: n } } }) as any;

describe("module count check", () => {
  it("reads production design count, falls back to stringing totals", () => {
    expect(helioModuleCount(r(1196))).toBe(1196);
    expect(helioModuleCount({ circuit_auto: { stringing: [{ total_module_count: 600 }, { total_module_count: 596 }] } } as any)).toBe(1196);
    expect(helioModuleCount(null)).toBeNull();
  });
  it("warns in Indonesian with both numbers, silent when equal", () => {
    const w = moduleCountMismatch(1200, r(1196));
    expect(w?.message.startsWith("Helio memakai 1.196 dari 1.200 modul")).toBe(true);
    expect(moduleCountMismatch(1200, r(1200))).toBeNull();
    expect(moduleCountMismatch(1200, null)).toBeNull();
  });
});
