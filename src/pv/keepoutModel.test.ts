import { describe, expect, it } from "vitest";
import {
  deleteObstacle, deleteWalkway, findKeepoutView, hitTestKeepout, isValidRect, keepoutKey,
  mToMm, mmToM, moveRect, sameKeepout, toKeepoutViews, updateObstacleRect, updateWalkwayRect,
  type ObstacleLike, type WalkwayLike,
} from "./keepoutModel";

const walkways: WalkwayLike[] = [
  { id: "w-1", x: 1000, y: 2000, w: 3000, h: 2000, label: "Walkway 2m" },
  { id: "w-2", x: 0, y: 0, w: 1000, h: 1000, visible: false },
];
const obstacles: ObstacleLike[] = [
  { id: 7, x: 5000, y: 5000, w: 1000, h: 1000, label: "Skylight", heightM: 1.4 },
];

describe("keepout unified view", () => {
  it("lists walkways first, then obstacles, without merging the arrays", () => {
    const views = toKeepoutViews(walkways, obstacles);
    expect(views.map((v) => v.key)).toEqual(["walkway:w-1", "walkway:w-2", "obstacle:7"]);
    expect(views[0].label).toBe("Walkway 2m");
    expect(views[1].visible).toBe(false);
    expect(views[2].heightM).toBe(1.4);
    expect(walkways).toHaveLength(2);
    expect(obstacles).toHaveLength(1);
  });

  it("falls back to a readable label for unlabelled walkways", () => {
    const views = toKeepoutViews([{ id: "w-x", x: 0, y: 0, w: 1, h: 1 }], []);
    expect(views[0].label).toBe("Walkway");
  });

  it("finds a view by kind and id and compares refs across number/string ids", () => {
    const views = toKeepoutViews(walkways, obstacles);
    expect(findKeepoutView(views, { kind: "obstacle", id: 7 })?.label).toBe("Skylight");
    expect(findKeepoutView(views, { kind: "walkway", id: "missing" })).toBeNull();
    expect(sameKeepout({ kind: "obstacle", id: 7 }, { kind: "obstacle", id: "7" })).toBe(true);
    expect(sameKeepout({ kind: "obstacle", id: 7 }, { kind: "walkway", id: 7 })).toBe(false);
  });
});

describe("keepout hit testing", () => {
  const views = toKeepoutViews(walkways, obstacles);

  it("returns the topmost rectangle", () => {
    expect(hitTestKeepout({ x: 5200, y: 5200 }, views)?.key).toBe("obstacle:7");
    expect(hitTestKeepout({ x: 1500, y: 2500 }, views)?.key).toBe("walkway:w-1");
  });

  it("honours the click tolerance and misses empty space", () => {
    expect(hitTestKeepout({ x: 950, y: 2500 }, views)).toBeNull();
    expect(hitTestKeepout({ x: 950, y: 2500 }, views, 100)?.key).toBe("walkway:w-1");
    expect(hitTestKeepout({ x: -500, y: -500 }, views)).toBeNull();
  });
});

describe("immutable keepout edits", () => {
  it("updates only the requested walkway", () => {
    const next = updateWalkwayRect(walkways, "w-1", { x: 5000, visible: false });
    expect(next[0]).toMatchObject({ id: "w-1", x: 5000, visible: false });
    expect(next[1]).toBe(walkways[1]);
    expect(walkways[0].x).toBe(1000);
  });

  it("updates obstacles and keeps height", () => {
    const next = updateObstacleRect(obstacles, 7, { label: "Chiller", h: 2000 });
    expect(next[0]).toMatchObject({ id: 7, label: "Chiller", h: 2000, heightM: 1.4 });
    expect(obstacles[0].label).toBe("Skylight");
  });

  it("deletes by kind without touching the other array", () => {
    expect(deleteWalkway(walkways, "w-1").map((w) => w.id)).toEqual(["w-2"]);
    expect(deleteObstacle(obstacles, 7)).toEqual([]);
    expect(walkways).toHaveLength(2);
  });

  it("moves a rectangle by a delta and rounds millimetres", () => {
    expect(moveRect({ x: 10.4, y: 20.6, w: 1, h: 1 }, 0.7, -0.7)).toMatchObject({ x: 11, y: 20 });
  });
});

describe("keepout units and validation", () => {
  it("converts between metres and millimetres", () => {
    expect(mmToM(12345)).toBe(12.345);
    expect(mToMm(12.3456)).toBe(12346);
  });

  it("rejects zero, negative or non-finite rectangles", () => {
    expect(isValidRect({ x: 0, y: 0, w: 100, h: 100 })).toBe(true);
    expect(isValidRect({ x: 0, y: 0, w: 0, h: 100 })).toBe(false);
    expect(isValidRect({ x: 0, y: 0, w: 100, h: -1 })).toBe(false);
    expect(isValidRect({ x: Number.NaN, y: 0, w: 100, h: 100 })).toBe(false);
  });

  it("builds stable keys", () => {
    expect(keepoutKey({ kind: "walkway", id: "w-1" })).toBe("walkway:w-1");
    expect(keepoutKey({ kind: "obstacle", id: 3 })).toBe("obstacle:3");
  });
});
