import { describe, expect, it } from "vitest";
import { buildMasSilueta744Layout } from "../engine/fixtures/masSilueta744";
import { buildIsoScene, makeProjector } from "./isoProjection";

describe("near-shading isometric scene", () => {
  const layout = buildMasSilueta744Layout();
  const s = buildIsoScene(layout)!;

  it("draws all 1,200 modules plus a flat slab, finite everywhere, no building volume", () => {
    expect(s.polys.filter((p) => p.kind === "module")).toHaveLength(1200);
    expect(s.moduleCount).toBe(1200);
    expect(s.polys.some((p) => p.kind === "slab")).toBe(true);
    expect(s.polys.some((p) => p.kind === "obstacle-side")).toBe(false);
    for (const p of s.polys) for (const q of p.pts) { expect(Number.isFinite(q[0])).toBe(true); expect(Number.isFinite(q[1])).toBe(true); }
    expect(s.viewBox.w).toBeGreaterThan(0);
    expect(s.viewBox.h).toBeGreaterThan(0);
  });

  it("labels North and East, with North behind (higher on the page than) East for a south-east camera", () => {
    const north = s.labels.find((l) => l.text === "North")!, east = s.labels.find((l) => l.text === "East")!;
    expect(north).toBeTruthy(); expect(east).toBeTruthy();
    expect(north.at[1]).toBeLessThan(east.at[1]); // SVG y grows downward
  });

  it("ground layers (site, slabs, walkways) are drawn before anything standing on them; far-to-near within a layer", () => {
    const rank = (k: string) => (k === "site" ? 0 : k === "slab" ? 1 : k === "walkway" ? 2 : 3);
    for (let i = 1; i < s.polys.length; i++) {
      const a = s.polys[i - 1], b = s.polys[i];
      expect(rank(b.kind)).toBeGreaterThanOrEqual(rank(a.kind));
      if (rank(a.kind) === rank(b.kind)) expect(b.depth).toBeGreaterThanOrEqual(a.depth);
    }
    expect(s.polys[0].kind).toBe("site");
    const lastSlab = s.polys.map((p) => p.kind).lastIndexOf("slab");
    expect(s.polys.findIndex((p) => p.kind === "module")).toBeGreaterThan(lastSlab);
  });

  it("every module lies inside the projected footprint of its segment slab (mapping check)", () => {
    // segment 1 in the fixture: modules fill the polygon rows x pitch
    const seg = layout.segments![0];
    const xs = seg.polygon.map((p) => p.x), ys = seg.polygon.map((p) => p.y);
    for (const p of seg.panels) {
      expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs)); expect(p.x + p.w).toBeLessThanOrEqual(Math.max(...xs));
      expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys)); expect(p.y + p.h).toBeLessThanOrEqual(Math.max(...ys));
    }
    const l1 = { ...layout, segments: [seg], panels: seg.panels };
    const r = buildIsoScene(l1)!;
    const slab = r.polys.find((p) => p.kind === "slab")!;
    const sx = slab.pts.map((q) => q[0]), sy = slab.pts.map((q) => q[1]);
    const tol = 0.5; // m of projected slack for the tilt lift
    for (const m of r.polys.filter((p) => p.kind === "module")) for (const q of m.pts) {
      expect(q[0]).toBeGreaterThanOrEqual(Math.min(...sx) - tol); expect(q[0]).toBeLessThanOrEqual(Math.max(...sx) + tol);
      expect(q[1]).toBeGreaterThanOrEqual(Math.min(...sy) - tol); expect(q[1]).toBeLessThanOrEqual(Math.max(...sy) + tol);
    }
    // and they spread over the whole slab, not just one corner
    const mx = r.polys.filter((p) => p.kind === "module").flatMap((p) => p.pts.map((q) => q[0]));
    expect(Math.max(...mx) - Math.min(...mx)).toBeGreaterThan(0.85 * (Math.max(...sx) - Math.min(...sx)));
  });

  it("obstacle with a height becomes top + visible sides; without a height stays flat (no invented height)", () => {
    const l = { ...layout, obstacles: [{ id: 1, x: 5000, y: 5000, w: 2000, h: 2000, label: "Tank", heightM: 3 }, { id: 2, x: 9000, y: 5000, w: 2000, h: 2000, label: "Vent" }] };
    const r = buildIsoScene(l)!;
    expect(r.polys.filter((p) => p.kind === "obstacle-top")).toHaveLength(1);
    expect(r.polys.filter((p) => p.kind === "obstacle-side").length).toBeGreaterThanOrEqual(2);
    expect(r.polys.filter((p) => p.kind === "obstacle-flat")).toHaveLength(1);
    expect(r.flatObstacles).toBe(1);
  });

  it("projector: higher points go up the page, farther points go up the page", () => {
    const pr = makeProjector(135, 35);
    expect(pr.project([0, 0, 5])[1]).toBeLessThan(pr.project([0, 0, 0])[1]);
    expect(pr.project([-10, 10, 0])[1]).toBeLessThan(pr.project([10, -10, 0])[1]); // NW is farther than SE
  });

  it("returns null without panels", () => {
    expect(buildIsoScene({ segments: [], panels: [] })).toBeNull();
    expect(buildIsoScene(null)).toBeNull();
  });
});
