import { describe, expect, it } from "vitest";
import { generatePanelsForSegment } from "../../PVLayout";
import { buildMasSilueta744Layout } from "./masSilueta744";

// Root cause of "Field 11 = 76 modules / 742 kWp": the fixture segments are modules + 2 x setback
// exactly, so regenerating them (Generate button) lost the last column per row to float noise at the
// polygon edge (80 -> 76, 20 -> 0). The layout, not helio, shed the modules; helio counts the scene.
describe("regenerating a tight segment keeps every module", () => {
  const l = buildMasSilueta744Layout();
  it("returns the original count for all 24 segments (1,200 total)", () => {
    let total = 0;
    for (const s of l.segments!) {
      const n = generatePanelsForSegment(s, l.obstacles ?? [], l.walkways ?? []).length;
      expect(n, s.id).toBe(s.panels.length);
      total += n;
    }
    expect(total).toBe(1200);
  });
});
