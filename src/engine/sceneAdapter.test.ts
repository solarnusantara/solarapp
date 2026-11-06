import { describe, expect, it } from "vitest";
import { buildFrame, layoutToScene, normAzimuth } from "./sceneAdapter";
import type { SavedLayout } from "./layoutStore";

const M_LAT = 111319.49;

/** Forward-applies GoogleMapsModal.handleApply to a known rotated 20 x 10 m box. */
function makeLayout(angleDeg: number): { layout: SavedLayout; truth: (xMm: number, yMm: number) => [number, number] } {
  const lat0 = -6.96, lng0 = 110.33, pad = 5;
  const a = (angleDeg * Math.PI) / 180, cosA = Math.cos(a), sinA = Math.sin(a);
  const mLng = M_LAT * Math.cos((lat0 * Math.PI) / 180);
  const W = 20, H = 10;
  const local = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
  const corners = local.map(([rx, ry]) => {
    const dE = rx * cosA - ry * sinA, dN = rx * sinA + ry * cosA;
    return { lat: lat0 + dN / M_LAT, lng: lng0 + dE / mLng };
  });
  let minRx = Infinity, maxRy = -Infinity;
  for (const c of corners) {
    const dE = (c.lng - lng0) * mLng, dN = (c.lat - lat0) * M_LAT;
    minRx = Math.min(minRx, dE * cosA + dN * sinA);
    maxRy = Math.max(maxRy, -dE * sinA + dN * cosA);
  }
  const toMm = (rx: number, ry: number) => ({ x: Math.round((rx - minRx + pad) * 1000), y: Math.round((maxRy - ry + pad) * 1000) });
  const poly = local.map(([rx, ry]) => toMm(rx, ry));
  const truth = (x: number, y: number): [number, number] => {
    const rx = x / 1000 + minRx - pad, ry = maxRy + pad - y / 1000;
    return [rx * cosA - ry * sinA, rx * sinA + ry * cosA];
  };
  const layout: SavedLayout = {
    settings: { areaWidth: 30000, areaHeight: 20000 },
    site: {
      coordinates: { lat: lat0, lng: lng0 }, address: "", polygonPoints: corners, cropPaddingM: pad, rotationDeg: Math.round(angleDeg),
      boxes: [{ id: "b", name: "b", color: "#fff", center: { lat: lat0, lng: lng0 }, widthM: W, heightM: H, rotationAngle: angleDeg }],
    },
    segments: [{
      id: "s1", name: "S1", color: "#fff", polygon: poly, orientation: "portrait", tilt: 10, azimuth: 190, gap: 20, setback: 300,
      moduleWatts: 620, moduleWidth: 1134, moduleHeight: 2278, visible: true,
      panels: [{ id: 1, x: poly[0].x + 1000, y: poly[0].y + 1000, w: 1134, h: 2278, segmentId: "s1" }],
    }],
    obstacles: [], walkways: [],
  };
  return { layout, truth };
}

describe("sceneAdapter", () => {
  for (const angle of [0, 24]) {
    it(`polygon is 20 x 10 m and centred on the origin at ${angle} deg`, () => {
      const { scene } = layoutToScene(makeLayout(angle).layout);
      const ring = scene.field_segments[0].polygon_enu;
      const d = (i: number, j: number) => Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
      expect(Math.abs(d(0, 1) - 20)).toBeLessThan(0.01);
      expect(Math.abs(d(1, 2) - 10)).toBeLessThan(0.01);
      const cx = ring.reduce((s, p) => s + p[0], 0) / 4, cy = ring.reduce((s, p) => s + p[1], 0) / 4;
      expect(Math.hypot(cx, cy)).toBeLessThan(0.01);
    });
  }

  it("matches the analytic inverse within 1 cm", () => {
    const { layout, truth } = makeLayout(24);
    const f = buildFrame(layout);
    for (const [x, y] of [[0, 0], [5000, 7000], [25000, 15000]]) {
      const [e, n] = f.toEnu(x, y), [te, tn] = truth(x, y);
      expect(Math.hypot(e - te, n - tn)).toBeLessThan(0.01);
    }
  });

  it("canvas Y-down becomes north-up when the box is unrotated", () => {
    const f = buildFrame(makeLayout(0).layout);
    expect(f.toEnu(1000, 1000)[1]).toBeGreaterThan(f.toEnu(1000, 9000)[1]);
    expect(f.toEnu(9000, 1000)[0]).toBeGreaterThan(f.toEnu(1000, 1000)[0]);
  });

  it("normalises azimuth to 0-360 and keeps south = 180", () => {
    expect(normAzimuth(-10)).toBe(350);
    expect(normAzimuth(370)).toBe(10);
    const { scene } = layoutToScene(makeLayout(0).layout);
    expect(scene.field_segments[0].azimuth_deg).toBe(190);
    expect(scene.modules[0].azimuth_deg).toBe(190);
    expect(scene.modules[0].orientation).toBe("portrait");
  });

  it("warns when the canvas rotation was edited after Apply", () => {
    const { layout } = makeLayout(24);
    layout.site!.rotationDeg = 30;
    expect(layoutToScene(layout).warnings.map((w) => w.code)).toContain("ROTATION_EDITED");
  });

  it("obstacle without height warns and sends height 0; walkway is a height-0 keepout", () => {
    const { layout } = makeLayout(0);
    layout.obstacles = [{ id: 1, x: 3000, y: 3000, w: 1000, h: 1000, label: "AC unit" }];
    layout.walkways = [{ id: "w1", x: 0, y: 0, w: 500, h: 5000 }];
    const r = layoutToScene(layout);
    expect(r.warnings.map((w) => w.code)).toContain("OBSTACLE_NO_HEIGHT");
    expect(r.scene.keepouts.map((k) => k.height_m)).toEqual([0, 0]);
  });

  it("mixed module power is blocking", () => {
    const { layout } = makeLayout(0);
    const s0 = layout.segments![0];
    layout.segments!.push({ ...s0, id: "s2", moduleWatts: 580, panels: [{ ...s0.panels[0], id: 2, segmentId: "s2" }] });
    const r = layoutToScene(layout);
    expect(r.blocking.map((b) => b.code)).toContain("MIXED_MODULE_POWER");
    expect(r.moduleWp).toBeNull();
  });

  it("falls back with ORIGIN_APPROXIMATE when GIS corners are missing", () => {
    const { layout } = makeLayout(0);
    delete layout.site!.polygonPoints;
    expect(layoutToScene(layout).warnings.map((w) => w.code)).toContain("ORIGIN_APPROXIMATE");
  });
});
