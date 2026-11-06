// Pure helpers for the Advanced → Module Shading Optimization card.
// Every value shown by the UI comes from the real Helio iso-shading response; nothing is estimated.

import type { IsoShadingResult } from "./types";
import type { WeatherChoice } from "./types/local";
import type { SavedLayout } from "./layoutStore";
import { layoutToScene } from "./sceneAdapter";

export interface ShadingOrientationSummary {
  tiltDeg: number;
  azimuthDeg: number;
  moduleCount: number;
  contourCount: number;
  /** (1 - helio attenuation) * 100; helio returns the remaining fraction. */
  diffuseLossPct: number | null;
  albedoLossPct: number | null;
}

export interface ShadingSummary {
  orientationCount: number;
  moduleCount: number;
  levels: number[];
  warnings: string[];
  orientations: ShadingOrientationSummary[];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function summarizeIsoShading(result: IsoShadingResult | null | undefined): ShadingSummary | null {
  if (!result || !Array.isArray(result.orientations) || result.orientations.length === 0) return null;
  const levels = new Set<number>();
  const orientations: ShadingOrientationSummary[] = result.orientations.map((o) => {
    for (const c of o.contours ?? []) {
      if (finite(c.level)) levels.add(c.level);
    }
    return {
      tiltDeg: finite(o.orientation?.tilt_deg) ? o.orientation.tilt_deg : 0,
      azimuthDeg: finite(o.orientation?.azimuth_deg) ? o.orientation.azimuth_deg : 0,
      moduleCount: finite(o.module_count) ? o.module_count : 0,
      contourCount: Array.isArray(o.contours) ? o.contours.length : 0,
      diffuseLossPct: finite(o.diffuse_attenuation) ? (1 - o.diffuse_attenuation) * 100 : null,
      albedoLossPct: finite(o.albedo_attenuation) ? (1 - o.albedo_attenuation) * 100 : null,
    };
  });
  return {
    orientationCount: orientations.length,
    moduleCount: orientations.reduce((n, o) => n + o.moduleCount, 0),
    levels: [...levels].sort((a, b) => a - b),
    warnings: Array.isArray(result.warnings) ? [...result.warnings] : [],
    orientations,
  };
}

/** Stable FNV-1a hash over the scene and assumptions that affect the iso-shading result. */
export function shadingFingerprint(
  layout: SavedLayout,
  weather: WeatherChoice | null | undefined,
  ignoreRowToRow: boolean,
): string {
  const scene = layoutToScene(layout).scene;
  const payload = JSON.stringify({
    scene,
    weather: weather ? { id: weather.id, kind: weather.kind, label: weather.label } : null,
    ignoreRowToRow,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
