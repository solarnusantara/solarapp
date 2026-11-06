// Test layout: PT Mas Silueta Indonesia, 744 kWp rooftop (Semarang). Pure, deterministic, no IO.
//
// SOURCES (ground truth): HelioScope "Production Report - MAS SILUETA INDONESIA (Layout Updated -
// Juli 2026)" and PVsyst report PLTS-MAS-E-CS-001-00. Longi LR8-66HGD-620 (620 Wp, 1.134 x 2.382 m),
// 1,200 modules = 744.00 kWp, 4 x Huawei SUN2000-150K-MG0 = 600 kWac, 60 strings x 20.
// All field segments: flush mount, portrait, tilt 10 deg, intrarow spacing 0.5 m.
//
// ASSUMPTIONS (read before trusting any number that is not in the reports):
//  1. The HelioScope segment table in the report is cut off at the page bottom. The 18 visible
//     segments sum to 900 modules (not 1,000 as first assumed); the missing 300 are NOT in the
//     source. Pattern: block 1 = SSW 300 + NNE 200, block 2 lists SSW 300 + only NNE 100. We
//     model 6 extra segments continuing it: NNE 80 + NNE 20 (completes block 2, azimuths 16.782 /
//     16.474 reused), then SSW 80, SSW 20, NNE 80, NNE 20 (block 3, azimuths 196.5 / 16.6, inside
//     the observed 196.3-196.8 / 16.4-16.8 bands). Total 24 segments, exactly 1,200 modules.
//     Azimuth, size and order of these 6 are an assumption, not report data.
//  2. Roof geometry is synthetic. The report only shows a large rectangular industrial roof. We use
//     one 150 m x 110 m box centred on the site coordinates, rotated so the box X axis runs along
//     the ridge (bearing 106.7 deg, perpendicular to the SSW face azimuth 196.7). Segment positions
//     are a simple 3-column grid; the exact positions do not affect energy for a flush mount on
//     an open roof, but module count, tilt, azimuth and non-overlap are real.
//  3. Frame sizes (2x1 / 1x1) are not modelled: each segment is a rows x cols grid of modules.
//     80-module segments are 4 rows x 20 columns, 20-module segments are 1 row x 20 columns
//     (one string of 20 per row). Row pitch = module height + 0.5 m intrarow spacing.
//  4. Segment azimuths differ by up to ~0.3 deg while the grid is axis-aligned in the box frame;
//     that sub-degree skew is ignored.
//  5. Module racking height, temperatures, tariff, capex and consumption are NOT in the reports and
//     are left empty (engine_inputs economic/temperature fields stay "").
import type { FieldSegment, Panel, Site } from "../../PVLayout";
import type { SavedLayout } from "../layoutStore";

export const MAS_SILUETA = {
  lat: -6.960606499999993,
  lng: 110.3341742,
  address: "28PM+36R, Jl. Tugu Wijaya VIII No.1, Randu Garut, Kec. Tugu, Kota Semarang, Jawa Tengah 50181",
  client: "PT Mas Silueta Indonesia",
  moduleWp: 620,
  moduleWidthMm: 1134,
  moduleHeightMm: 2382,
  tiltDeg: 10,
  intrarowMm: 500,
  inverterAcKw: 600,
  inverterCount: 4,
} as const;

const M_PER_DEG_LAT = 111319.49; // identical to GoogleMapsModal.tsx / sceneAdapter.ts
const BOX_W_M = 150;
const BOX_H_M = 110;
const PAD_M = 5;
/** Box X axis bearing (compass) = 90 - rotationAngle. Ridge bearing 106.7 => angle -16.7. */
const ROTATION_DEG = -16.7;
const GAP_MM = 20; // between modules in a row
const SETBACK_MM = 300;
const COLS = 20; // one string per row

// [azimuth, frames, frameSize, modules] -- first 18 rows are the HelioScope table, last 4 are assumed.
const SEGMENT_TABLE: Array<[number, number, string, number]> = [
  [196.722, 40, "2x1", 80], [196.722, 20, "1x1", 20], [196.722, 20, "1x1", 20],
  [196.722, 40, "2x1", 80], [196.722, 40, "2x1", 80], [196.722, 20, "1x1", 20],
  [16.782, 40, "2x1", 80], [16.474, 20, "1x1", 20], [16.782, 40, "2x1", 80], [16.474, 20, "1x1", 20],
  [196.435, 40, "2x1", 80], [196.322, 20, "1x1", 20], [196.322, 20, "1x1", 20],
  [196.435, 40, "2x1", 80], [196.435, 40, "2x1", 80], [196.322, 20, "1x1", 20],
  [16.782, 40, "2x1", 80], [16.474, 20, "1x1", 20],
  // ASSUMED remainder (report truncated): 300 modules. First 100 complete block 2's NNE group
  // (block 1 is SSW 300 + NNE 200; block 2 lists SSW 300 + only NNE 100), last 200 form block 3.
  [16.782, 40, "2x1", 80], [16.474, 20, "1x1", 20],
  [196.5, 40, "2x1", 80], [196.5, 20, "1x1", 20], [16.6, 40, "2x1", 80], [16.6, 20, "1x1", 20],
];
/** Segments per column of the 3-column grid (blocks of the report order). */
const COLUMN_SPLIT = [10, 10, 4];

export function buildMasSilueta744Layout(): SavedLayout & { site: Site } {
  const a = (ROTATION_DEG * Math.PI) / 180;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const mLng = M_PER_DEG_LAT * Math.cos((MAS_SILUETA.lat * Math.PI) / 180);
  const corners = [[-BOX_W_M / 2, -BOX_H_M / 2], [BOX_W_M / 2, -BOX_H_M / 2], [BOX_W_M / 2, BOX_H_M / 2], [-BOX_W_M / 2, BOX_H_M / 2]]
    .map(([rx, ry]) => ({
      lat: MAS_SILUETA.lat + (rx * sinA + ry * cosA) / M_PER_DEG_LAT,
      lng: MAS_SILUETA.lng + (rx * cosA - ry * sinA) / mLng,
    }));

  const site: Site = {
    coordinates: { lat: MAS_SILUETA.lat, lng: MAS_SILUETA.lng },
    address: MAS_SILUETA.address,
    polygonPoints: corners,
    rotationDeg: Math.round(ROTATION_DEG),
    cropPaddingM: PAD_M,
    boxes: [{
      id: "box-1", name: "Atap Pabrik", color: "#22c55e",
      center: { lat: MAS_SILUETA.lat, lng: MAS_SILUETA.lng },
      widthM: BOX_W_M, heightM: BOX_H_M, rotationAngle: ROTATION_DEG,
    }],
  };

  const mw = MAS_SILUETA.moduleWidthMm, mh = MAS_SILUETA.moduleHeightMm;
  const rowPitch = mh + MAS_SILUETA.intrarowMm;
  const colPitch = mw + GAP_MM;
  const segW = (COLS - 1) * colPitch + mw + 2 * SETBACK_MM;
  const GRID_GAP = 1500;
  const COL_W = (BOX_W_M * 1000) / 3;

  const segments: FieldSegment[] = [];
  const allPanels: Panel[] = [];
  let panelId = 1;
  let segIdx = 0;
  COLUMN_SPLIT.forEach((count, col) => {
    const colX0 = PAD_M * 1000 + col * COL_W + 1000;
    let shelfY = PAD_M * 1000 + 1000;
    let shelfH = 0;
    let slot = 0;
    for (let k = 0; k < count; k++, segIdx++) {
      const [az, , , modules] = SEGMENT_TABLE[segIdx];
      const rows = modules / COLS;
      const segH = (rows - 1) * rowPitch + mh + 2 * SETBACK_MM;
      if (slot === 2) { shelfY += shelfH + GRID_GAP; shelfH = 0; slot = 0; }
      const x0 = colX0 + slot * (segW + GRID_GAP);
      const y0 = shelfY;
      slot++;
      shelfH = Math.max(shelfH, segH);
      const id = `seg-${String(segIdx + 1).padStart(2, "0")}`;
      const panels: Panel[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          panels.push({ id: panelId++, x: x0 + SETBACK_MM + c * colPitch, y: y0 + SETBACK_MM + r * rowPitch, w: mw, h: mh, segmentId: id });
        }
      }
      allPanels.push(...panels);
      segments.push({
        id,
        name: `Field ${String(segIdx + 1).padStart(2, "0")} (${az >= 90 ? "SSW" : "NNE"} ${az}°, ${modules} modul)`,
        color: az >= 90 ? "#22c55e" : "#38bdf8",
        polygon: [{ x: x0, y: y0 }, { x: x0 + segW, y: y0 }, { x: x0 + segW, y: y0 + segH }, { x: x0, y: y0 + segH }],
        orientation: "portrait",
        tilt: MAS_SILUETA.tiltDeg,
        azimuth: az,
        gap: GAP_MM,
        setback: SETBACK_MM,
        moduleWatts: MAS_SILUETA.moduleWp,
        moduleWidth: mw,
        moduleHeight: mh,
        panels,
        visible: true,
      });
    }
    // sanity: two segments per shelf must fit inside this column's third of the roof
    if (colX0 + 2 * segW + GRID_GAP > PAD_M * 1000 + (col + 1) * COL_W) {
      throw new Error("masSilueta744: segment grid does not fit the column width");
    }
    if (shelfY + shelfH > (BOX_H_M + PAD_M) * 1000) {
      throw new Error("masSilueta744: segment grid does not fit the roof height");
    }
  });

  const areaWidth = (BOX_W_M + 2 * PAD_M) * 1000;
  const areaHeight = (BOX_H_M + 2 * PAD_M) * 1000;
  const settings = {
    system: "Rooftop",
    areaWidth, areaHeight,
    moduleWidth: mw, moduleHeight: mh,
    gap: GAP_MM, rows: 4, cols: COLS,
    watts: MAS_SILUETA.moduleWp,
    tilt: MAS_SILUETA.tiltDeg,
    orientation: "portrait",
    setback: SETBACK_MM,
    obstacleWidth: 3000, obstacleHeight: 3000,
  };

  return {
    projectId: null,
    settings,
    segments,
    walkways: [],
    obstacles: [],
    panels: allPanels,
    site,
    backgroundImage: "",
    backgroundOpacity: 0.5,
    layers: { siteBoundary: true, fieldSegments: true, pvModules: true, keepouts: true, walkway: true, roofBuilding: true, satellite: false },
    // PVLayout's saveDraft writes a locale time string; fixed here for reproducibility.
    savedAt: "00:00:00",
    engine_inputs: {
      inverter_ac_kw: MAS_SILUETA.inverterAcKw,
      racking: "flush_mount", // HelioScope report: "Racking: Flush Mount"
      pln_tariff_code: "", contracted_power_kva: "", monthly_consumption_kwh: "",
      load_profile_type: "", capex_per_kwp_idr: "", bess_cost_per_kwh_idr: "",
      inverter_count: MAS_SILUETA.inverterCount,
      t_min_c: "", t_amb_max_c: "", noct_c: "", ac_voltage_v: "",
      client_name: MAS_SILUETA.client,
    },
  } as SavedLayout & { site: Site };
}
