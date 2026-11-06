import { describe, expect, it } from "vitest";
import { layoutToScene } from "../sceneAdapter";
import { buildMasSilueta744Layout } from "./masSilueta744";

describe("Mas Silueta 744 kWp fixture", () => {
  const layout = buildMasSilueta744Layout();
  const res = layoutToScene(layout);

  it("has 1,200 modules and 744 kWp", () => {
    expect(res.moduleCount).toBe(1200);
    expect(res.scene.modules).toHaveLength(1200);
    expect(res.moduleWp).toBe(620);
    expect((res.moduleCount * (res.moduleWp as number)) / 1000).toBeCloseTo(744, 6);
    expect(layout.panels).toHaveLength(1200);
  });

  it("carries the HelioScope racking (Flush Mount) into every field segment", () => {
    expect(layout.engine_inputs?.racking).toBe("flush_mount");
    expect(res.scene.field_segments.every((s) => s.racking_type === "flush_mount")).toBe(true);
  });

  it("has no blocking warnings and no adapter warnings", () => {
    expect(res.blocking).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("segments: tilt 10 and azimuths in the two report bands", () => {
    expect(res.scene.field_segments.length).toBeGreaterThanOrEqual(20);
    for (const s of res.scene.field_segments) {
      expect(s.tilt_deg).toBe(10);
      const ssw = s.azimuth_deg >= 196.3 && s.azimuth_deg <= 196.8;
      const nne = s.azimuth_deg >= 16.4 && s.azimuth_deg <= 16.8;
      expect(ssw || nne).toBe(true);
    }
    for (const m of res.scene.modules) {
      expect(m.orientation).toBe("portrait");
      expect(m.tilt_deg).toBe(10);
    }
  });

  it("rows run along the ridge: in-row bearing is 106.7 deg (perpendicular to the SSW azimuth)", () => {
    const first = res.scene.modules.filter((m) => m.field_segment_id === "seg-01");
    const a = first.find((m) => m.row === 0 && m.col === 0)!;
    const b = first.find((m) => m.row === 0 && m.col === 1)!;
    const bearing = ((Math.atan2(b.center_enu[0] - a.center_enu[0], b.center_enu[1] - a.center_enu[1]) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(bearing - 106.7)).toBeLessThan(0.5);
  });

  it("no two modules overlap in the canvas and all sit inside their segment polygon", () => {
    const panels = layout.segments!.flatMap((s) => s.panels);
    const sorted = [...panels].sort((p, q) => p.x - q.x);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].x < sorted[i].x + sorted[i].w; j++) {
        const p = sorted[i], q = sorted[j];
        expect(p.y < q.y + q.h && q.y < p.y + p.h).toBe(false);
      }
    }
    for (const s of layout.segments!) {
      const xs = s.polygon.map((p) => p.x), ys = s.polygon.map((p) => p.y);
      for (const p of s.panels) {
        expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs));
        expect(p.x + p.w).toBeLessThanOrEqual(Math.max(...xs));
        expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys));
        expect(p.y + p.h).toBeLessThanOrEqual(Math.max(...ys));
      }
    }
  });

  it("module centres within a segment are at least one module width apart (ENU metres)", () => {
    const bySeg = new Map<string, Array<[number, number]>>();
    for (const m of res.scene.modules) {
      if (!bySeg.has(m.field_segment_id)) bySeg.set(m.field_segment_id, []);
      bySeg.get(m.field_segment_id)!.push([m.center_enu[0], m.center_enu[1]]);
    }
    for (const pts of bySeg.values()) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThanOrEqual(1.134 - 1e-6);
        }
      }
    }
  });

  it("engine inputs carry only report numbers; economics and temperatures stay empty", () => {
    const e = layout.engine_inputs!;
    expect(e.inverter_ac_kw).toBe(600);
    expect(e.inverter_count).toBe(4);
    expect(e.capex_per_kwp_idr).toBe("");
    expect(e.t_min_c).toBe("");
    expect(e.t_amb_max_c).toBe("");
    expect(layout.settings!.watts).toBe(620);
    expect(res.roofAreaM2).toBeGreaterThan(0);
  });
});
