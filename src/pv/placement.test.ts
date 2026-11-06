import { describe, expect, it } from "vitest";
import { generatePanelsForSegment, type FieldSegment, type Obstacle, type Walkway } from "../PVLayout";

const segment = (): FieldSegment => ({
  id: "seg-test",
  name: "Segment Test",
  color: "#3b82f6",
  polygon: [
    { x: 0, y: 0 },
    { x: 12000, y: 0 },
    { x: 12000, y: 6000 },
    { x: 0, y: 6000 },
  ],
  orientation: "landscape",
  tilt: 10,
  azimuth: 0,
  gap: 20,
  setback: 0,
  moduleWatts: 580,
  moduleWidth: 2000,
  moduleHeight: 1000,
  panels: [],
  visible: true,
});

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("PV module generation excludes walkways and keepouts", () => {
  const baseline = generatePanelsForSegment(segment(), [], []);
  const walkway: Walkway = { id: "w-1", x: 4000, y: 0, w: 2000, h: 6000, label: "Walkway" };
  const obstacle: Obstacle = { id: 99, x: 8000, y: 2000, w: 2000, h: 2000, label: "Skylight" };

  it("baseline generates modules", () => {
    expect(baseline.length).toBeGreaterThan(0);
  });

  it("removes every module that would overlap a walkway", () => {
    const withWalkway = generatePanelsForSegment(segment(), [], [walkway]);
    expect(withWalkway.length).toBeLessThan(baseline.length);
    expect(withWalkway.some((p) => overlaps(p, walkway))).toBe(false);
  });

  it("removes every module that would overlap a keepout", () => {
    const withObstacle = generatePanelsForSegment(segment(), [obstacle], []);
    expect(withObstacle.length).toBeLessThan(baseline.length);
    expect(withObstacle.some((p) => overlaps(p, obstacle))).toBe(false);
  });

  it("applies both exclusions together", () => {
    const both = generatePanelsForSegment(segment(), [obstacle], [walkway]);
    expect(both.length).toBeLessThanOrEqual(Math.min(
      generatePanelsForSegment(segment(), [], [walkway]).length,
      generatePanelsForSegment(segment(), [obstacle], []).length,
    ));
    expect(both.some((p) => overlaps(p, walkway) || overlaps(p, obstacle))).toBe(false);
  });

  it("still excludes hidden objects (visibility is display-only)", () => {
    const hiddenWalkway: Walkway = { ...walkway, visible: false };
    const hiddenObstacle: Obstacle = { ...obstacle, visible: false };
    const withHidden = generatePanelsForSegment(segment(), [hiddenObstacle], [hiddenWalkway]);
    expect(withHidden.some((p) => overlaps(p, hiddenWalkway) || overlaps(p, hiddenObstacle))).toBe(false);
  });
});
