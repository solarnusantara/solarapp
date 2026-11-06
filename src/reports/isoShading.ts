// Iso-shadings diagram helpers (pure). helio returns contours with the NORTHERN-hemisphere PVsyst
// azimuth (south = 0, east negative), but the report's sun-path chart measures azimuth from the
// EQUATOR (`pvsystAzimuth`: southern hemisphere 0 = north). Contours are converted into the
// sun-path convention here so both layers share one x axis.
import type { IsoContour, IsoShadingResult } from "../engine/types";
import { pvsystAzimuth, splitAtAzimuthWrap } from "./aggregate";
import { DASH, isNum } from "./format";

type XY = [number, number];

/**
 * Response azimuth (south = 0, east negative) -> sun-path azimuth for this latitude.
 * response azimuth = helio azimuth - 180, so helio = response + 180 and the chart value is
 * `pvsystAzimuth(response + 180, lat)`: identity for lat >= 0 (or unknown), `-(response + 180)`
 * normalised to (-180, 180] for lat < 0 (a mirror: east stays negative, south lands on +-180).
 */
export function isoAzimuth(azResponse: number, latDeg?: number | null): number {
  if (!(isNum(latDeg) && latDeg < 0)) return azResponse;
  return pvsystAzimuth(azResponse + 180, latDeg);
}

/** One contour level -> polylines in sun-path coordinates, cut where they cross the +-180 edge. */
export function isoContourSegments(c: IsoContour, latDeg?: number | null): XY[][] {
  return c.polylines.flatMap((pl) => splitAtAzimuthWrap(pl.map(([a, e]): XY => [isoAzimuth(a, latDeg), e])));
}

export interface IsoLineStyle { level: number; label: string; dash: string | undefined; width: number }

/** PVsyst line styles: 1% dotted, 5% short dash, 10% long dash, 20% dash-dot, 40% long dash-dot (thick). */
export const ISO_LEVEL_STYLES: IsoLineStyle[] = [
  { level: 0.01, label: "Shading loss: 1%", dash: "1.2 2", width: 1.1 },
  { level: 0.05, label: "Shading loss: 5%", dash: "4 2.5", width: 1.1 },
  { level: 0.1, label: "Shading loss: 10%", dash: "9 3", width: 1.1 },
  { level: 0.2, label: "Shading loss: 20%", dash: "9 3 2 3", width: 1.1 },
  { level: 0.4, label: "Shading loss: 40%", dash: "14 3 2 3", width: 1.9 },
];

export function isoLevelStyle(level: number): IsoLineStyle {
  return ISO_LEVEL_STYLES.find((s) => Math.abs(s.level - level) < 1e-9)
    ?? { level, label: `Shading loss: ${Math.round(level * 100)}%`, dash: undefined, width: 1.1 };
}

export const ISO_ALBEDO_WARNING = "ISO_ALBEDO_NOT_MODELLED";

/** PVsyst prints the LOSS fraction; helio returns the remaining fraction, so print 1 - value. */
export function isoAttenuationText(o: { diffuse_attenuation: number; albedo_attenuation: number }, warnings: string[] = []): string {
  const loss = (v: number) => (isNum(v) ? (1 - v).toFixed(3) : DASH);
  const albedo = warnings.includes(ISO_ALBEDO_WARNING) ? `${DASH} (tidak dimodelkan engine)` : loss(o.albedo_attenuation);
  return `Attenuation for diffuse: ${loss(o.diffuse_attenuation)} and albedo: ${albedo}`;
}

/** The note shown when the engine has no iso-shading data (helio error code verbatim when there is one). */
export function isoMissingNote(res: { status: string; code?: string | null } | null | undefined): string {
  const base = "Diagram iso-shading belum disediakan engine.";
  return res?.code ? `${base} (${res.code})` : base;
}

export const hasIsoData = (r: IsoShadingResult | null | undefined): r is IsoShadingResult => !!r && Array.isArray(r.orientations) && r.orientations.length > 0;
