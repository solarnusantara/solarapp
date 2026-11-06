/**
 * Layout adapter — reads the existing PV Layout payload and produces a typed,
 * normalised, fingerprinted snapshot for Electrical.
 *
 * This module is deliberately side-effect free except for the two storage
 * helpers at the bottom. It never writes to localStorage and never mutates
 * the payload it receives.
 */

import type {
  FieldSegmentSnapshot,
  GeometryPoint,
  LatLng,
  LayoutObstacle,
  LayoutPanel,
  LayoutSettings,
  LayoutSite,
  LayoutSnapshot,
  LayoutSnapshotSource,
  Orientation,
  StorageLike,
  SystemType
} from "./types";

export const LAYOUT_STORAGE_PREFIX = "solar-apps-pv-layout-v1";
export const IMPLICIT_SEGMENT_ID = "implicit-segment";

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  system: "Rooftop",
  areaWidth: 12000,
  areaHeight: 8000,
  moduleWidth: 2278,
  moduleHeight: 1134,
  gap: 20,
  rows: 4,
  cols: 8,
  watts: 580,
  tilt: 10,
  orientation: "landscape",
  setback: 300,
  obstacleWidth: 1000,
  obstacleHeight: 1000
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function toNonNegativeNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function pickNumber(
  record: UnknownRecord,
  keys: readonly string[],
  fallback: number,
  fixes: string[]
): number {
  for (const key of keys) {
    const parsed = toNonNegativeNumber(record[key]);
    if (parsed !== null) {
      if (key !== keys[0]) fixes.push(`${keys[0]} <- ${key}`);
      return parsed;
    }
  }
  return fallback;
}

function normalizeSystem(value: unknown, fallback: SystemType): SystemType {
  return value === "Rooftop" || value === "Ground-mounted" ? value : fallback;
}

function normalizeOrientation(value: unknown, fallback: Orientation): Orientation {
  return value === "landscape" || value === "portrait" ? value : fallback;
}

export function normalizeSettings(rawSettings: unknown, fixes: string[] = []): LayoutSettings {
  const raw = isRecord(rawSettings) ? rawSettings : {};
  const d = DEFAULT_LAYOUT_SETTINGS;

  return {
    system: normalizeSystem(raw.system, d.system),
    areaWidth: pickNumber(raw, ["areaWidth"], d.areaWidth, fixes),
    areaHeight: pickNumber(raw, ["areaHeight"], d.areaHeight, fixes),
    moduleWidth: pickNumber(raw, ["moduleWidth", "panelWidth"], d.moduleWidth, fixes),
    moduleHeight: pickNumber(raw, ["moduleHeight", "panelHeight"], d.moduleHeight, fixes),
    gap: pickNumber(raw, ["gap"], d.gap, fixes),
    rows: pickNumber(raw, ["rows"], d.rows, fixes),
    cols: pickNumber(raw, ["cols"], d.cols, fixes),
    watts: pickNumber(raw, ["watts", "panelWatts"], d.watts, fixes),
    tilt: pickNumber(raw, ["tilt"], d.tilt, fixes),
    orientation: normalizeOrientation(raw.orientation, d.orientation),
    setback: pickNumber(raw, ["setback"], d.setback, fixes),
    obstacleWidth: pickNumber(raw, ["obstacleWidth"], d.obstacleWidth, fixes),
    obstacleHeight: pickNumber(raw, ["obstacleHeight"], d.obstacleHeight, fixes)
  };
}

function normalizePanels(
  rawPanels: unknown,
  warnings: string[]
): LayoutPanel[] {
  if (rawPanels === undefined || rawPanels === null) return [];
  if (!Array.isArray(rawPanels)) {
    warnings.push("Panels: expected an array; no panels were read.");
    return [];
  }

  const panels: LayoutPanel[] = [];
  const seenIds = new Set<number>();
  let invalid = 0;
  let duplicates = 0;

  rawPanels.forEach((item) => {
    if (!isRecord(item)) {
      invalid += 1;
      return;
    }
    const x = toNonNegativeNumber(item.x);
    const y = toNonNegativeNumber(item.y);
    const w = toPositiveNumber(item.w);
    const h = toPositiveNumber(item.h);
    if (x === null || y === null || w === null || h === null) {
      invalid += 1;
      return;
    }

    const numericId = toFiniteNumber(item.id);
    const id = numericId === null ? panels.length + 1 : numericId;
    if (seenIds.has(id)) {
      duplicates += 1;
      return;
    }
    seenIds.add(id);

    const panel: LayoutPanel = { id, x, y, w, h };
    const segmentId = toText(item.segmentId);
    if (segmentId) panel.segmentId = segmentId;
    panels.push(panel);
  });

  if (invalid > 0) {
    warnings.push(`Panels: ${invalid} invalid entr${invalid === 1 ? "y was" : "ies were"} ignored (missing or non-numeric geometry).`);
  }
  if (duplicates > 0) {
    warnings.push(`Panels: ${duplicates} duplicate panel id${duplicates === 1 ? " was" : "s were"} ignored.`);
  }
  return panels;
}

function normalizeObstacles(rawObstacles: unknown, warnings: string[]): LayoutObstacle[] {
  if (rawObstacles === undefined || rawObstacles === null) return [];
  if (!Array.isArray(rawObstacles)) {
    warnings.push("Obstacles: expected an array; no obstacles were read.");
    return [];
  }

  const obstacles: LayoutObstacle[] = [];
  let invalid = 0;
  rawObstacles.forEach((item, index) => {
    if (!isRecord(item)) {
      invalid += 1;
      return;
    }
    const x = toNonNegativeNumber(item.x);
    const y = toNonNegativeNumber(item.y);
    const w = toPositiveNumber(item.w);
    const h = toPositiveNumber(item.h);
    if (x === null || y === null || w === null || h === null) {
      invalid += 1;
      return;
    }
    const obstacle: LayoutObstacle = {
      id: toFiniteNumber(item.id) ?? index + 1,
      x,
      y,
      w,
      h,
      label: toText(item.label) ?? `OBS-${String(index + 1).padStart(2, "0")}`
    };
    const heightM = toNonNegativeNumber(item.heightM);
    if (heightM !== null) obstacle.heightM = heightM;
    obstacles.push(obstacle);
  });

  if (invalid > 0) {
    warnings.push(`Obstacles: ${invalid} invalid entr${invalid === 1 ? "y was" : "ies were"} ignored.`);
  }
  return obstacles;
}

function normalizeLatLng(value: unknown): LatLng | null {
  if (!isRecord(value)) return null;
  const lat = toFiniteNumber(value.lat);
  const lng = toFiniteNumber(value.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function normalizePoint(value: unknown): GeometryPoint | null {
  if (!isRecord(value)) return null;
  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function normalizeSite(rawSite: unknown, warnings: string[]): LayoutSite | null {
  if (!isRecord(rawSite)) return null;

  const site: LayoutSite = {};
  const coordinates = normalizeLatLng(rawSite.coordinates);
  if (coordinates) site.coordinates = coordinates;

  const address = toText(rawSite.address);
  if (address) site.address = address;

  if (Array.isArray(rawSite.polygonPoints)) {
    const points = rawSite.polygonPoints.map(normalizeLatLng).filter((p): p is LatLng => p !== null);
    if (points.length >= 3) site.polygonPoints = points;
    else if (rawSite.polygonPoints.length > 0) warnings.push("Site: polygonPoints ignored (fewer than 3 valid vertices).");
  }

  if (Array.isArray(rawSite.polygonCorners)) {
    const corners = rawSite.polygonCorners.map(normalizePoint).filter((p): p is GeometryPoint => p !== null);
    if (corners.length >= 3) site.polygonCorners = corners;
    else if (rawSite.polygonCorners.length > 0) warnings.push("Site: polygonCorners ignored (fewer than 3 valid vertices).");
  }

  const rotationDeg = toFiniteNumber(rawSite.rotationDeg);
  if (rotationDeg !== null) site.rotationDeg = rotationDeg;
  const pitchDegrees = toFiniteNumber(rawSite.pitchDegrees);
  if (pitchDegrees !== null) site.pitchDegrees = pitchDegrees;
  const azimuthDegrees = toFiniteNumber(rawSite.azimuthDegrees);
  if (azimuthDegrees !== null) site.azimuthDegrees = azimuthDegrees;
  if (rawSite.googleSolarData !== undefined) site.googleSolarData = rawSite.googleSolarData;

  return Object.keys(site).length > 0 ? site : null;
}

function rectangleCorners(settings: LayoutSettings): GeometryPoint[] {
  return [
    { x: 0, y: 0 },
    { x: settings.areaWidth, y: 0 },
    { x: settings.areaWidth, y: settings.areaHeight },
    { x: 0, y: settings.areaHeight }
  ];
}

function siteCorners(site: LayoutSite | null, settings: LayoutSettings): GeometryPoint[] {
  return site?.polygonCorners && site.polygonCorners.length >= 3
    ? site.polygonCorners
    : rectangleCorners(settings);
}

function normalizeSegmentCorners(rawSegment: UnknownRecord, warnings: string[], segmentId: string): GeometryPoint[] {
  const boundary = isRecord(rawSegment.boundary) ? rawSegment.boundary : null;
  const candidates = [
    boundary?.corners,
    rawSegment.corners,
    rawSegment.polygonCorners,
    // Current PVLayout.tsx saves the segment ring as `polygon`.
    rawSegment.polygon
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const corners = candidate.map(normalizePoint).filter((p): p is GeometryPoint => p !== null);
    if (corners.length >= 3) return corners;
  }
  warnings.push(`Segment ${segmentId}: boundary corners are missing; geometry was not used.`);
  return [];
}

function segmentSettings(rawSegment: UnknownRecord, fallback: LayoutSettings): Partial<LayoutSettings> {
  const raw = isRecord(rawSegment.settings) ? rawSegment.settings : rawSegment;
  const result: Partial<LayoutSettings> = {};
  const mapping: Array<[keyof LayoutSettings, readonly string[]]> = [
    ["moduleWidth", ["moduleWidth", "panelWidth"]],
    ["moduleHeight", ["moduleHeight", "panelHeight"]],
    ["gap", ["gap"]],
    ["watts", ["watts", "panelWatts", "moduleWatts"]],
    ["tilt", ["tilt"]],
    ["setback", ["setback"]],
    ["rows", ["rows"]],
    ["cols", ["cols"]]
  ];
  for (const [key, keys] of mapping) {
    for (const candidate of keys) {
      const value = toNonNegativeNumber(raw[candidate]);
      if (value !== null) {
        (result as Record<string, unknown>)[key] = value;
        break;
      }
    }
    if (result[key] === undefined) {
      (result as Record<string, unknown>)[key] = fallback[key];
    }
  }
  const orientation = normalizeOrientation(raw.orientation, fallback.orientation);
  result.orientation = orientation;
  return result;
}

function buildSegments(
  rawSegments: unknown,
  panels: LayoutPanel[],
  site: LayoutSite | null,
  settings: LayoutSettings,
  warnings: string[]
): FieldSegmentSnapshot[] {
  const panelsBySegment = new Map<string, LayoutPanel[]>();
  const unassigned: LayoutPanel[] = [];
  for (const panel of panels) {
    if (panel.segmentId) {
      const list = panelsBySegment.get(panel.segmentId) ?? [];
      list.push(panel);
      panelsBySegment.set(panel.segmentId, list);
    } else {
      unassigned.push(panel);
    }
  }

  const buildSegment = (
    id: string,
    name: string,
    source: FieldSegmentSnapshot["source"],
    corners: GeometryPoint[],
    segmentPanels: LayoutPanel[],
    segSettings: Partial<LayoutSettings>,
    segmentWarnings: string[]
  ): FieldSegmentSnapshot => {
    const watts = segSettings.watts ?? settings.watts;
    return {
      id,
      name,
      source,
      corners,
      panelIds: segmentPanels.map(p => p.id),
      panelCount: segmentPanels.length,
      dcKwp: round6((segmentPanels.length * watts) / 1000),
      settings: segSettings,
      warnings: segmentWarnings
    };
  };

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    const result: FieldSegmentSnapshot[] = [];
    const knownIds = new Set<string>();

    rawSegments.forEach((item, index) => {
      if (!isRecord(item)) {
        warnings.push(`Segments: entry ${index + 1} is not an object and was ignored.`);
        return;
      }
      const id = toText(item.id) ?? `segment-${index + 1}`;
      if (knownIds.has(id)) {
        warnings.push(`Segments: duplicate id "${id}" was ignored.`);
        return;
      }
      knownIds.add(id);
      const segmentWarnings: string[] = [];
      const corners = normalizeSegmentCorners(item, segmentWarnings, id);
      const segSettings = segmentSettings(item, settings);
      const segmentPanels = panelsBySegment.get(id) ?? [];
      result.push(
        buildSegment(
          id,
          toText(item.name) ?? `Segment ${index + 1}`,
          "layout",
          corners,
          segmentPanels,
          segSettings,
          segmentWarnings
        )
      );
    });

    for (const [segmentId, list] of panelsBySegment) {
      if (!knownIds.has(segmentId)) {
        warnings.push(`Panels reference unknown segment "${segmentId}"; ${list.length} panel(s) were grouped as unassigned.`);
        panelsBySegment.delete(segmentId);
      }
    }

    // Rebuild in payload order so fallback segment panel ids stay stable.
    const unassignedPanels = panels.filter(
      item => !item.segmentId || !knownIds.has(item.segmentId)
    );

    if (unassignedPanels.length > 0) {
      const segmentWarnings = ["Panels without a segment boundary were grouped into an implicit segment."];
      result.push(
        buildSegment(
          `${IMPLICIT_SEGMENT_ID}-unassigned`,
          "Unassigned panels",
          "implicit",
          siteCorners(site, settings),
          unassignedPanels,
          segmentSettings({}, settings),
          segmentWarnings
        )
      );
    }

    return result;
  }

  if (panelsBySegment.size > 0) {
    // Future-proofing: panels already carry segment ids but the segment
    // definitions are not saved yet. Do not invent shared boundaries.
    const result: FieldSegmentSnapshot[] = [];
    for (const [segmentId, list] of panelsBySegment) {
      const segmentWarnings = ["Segment boundary is not saved in the layout payload; geometry is unavailable."];
      result.push(
        buildSegment(
          segmentId,
          segmentId,
          "implicit",
          [],
          list,
          segmentSettings({}, settings),
          segmentWarnings
        )
      );
    }
    if (unassigned.length > 0) {
      result.push(
        buildSegment(
          IMPLICIT_SEGMENT_ID,
          "Implicit segment",
          "implicit",
          siteCorners(site, settings),
          unassigned,
          segmentSettings({}, settings),
          ["Panels have no segment id and were grouped into the implicit segment."]
        )
      );
    }
    return result;
  }

  return [
    buildSegment(
      IMPLICIT_SEGMENT_ID,
      "Implicit segment (all panels)",
      "implicit",
      siteCorners(site, settings),
      panels,
      segmentSettings({}, settings),
      ["Field Segment model not saved yet; one implicit segment covers the full layout."]
    )
  ];
}

export function stableHash(input: string): string {
  const hash = (seed: number): string => {
    let value = seed >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      value ^= input.charCodeAt(i);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value.toString(16).padStart(8, "0");
  };
  return `${hash(0x811c9dc5)}${hash(0x7f4a7c15)}`;
}

export function computeLayoutFingerprint(
  snapshot: Omit<LayoutSnapshot, "fingerprint">
): string {
  const s = snapshot.settings;
  const settingsPart = [
    s.system, s.areaWidth, s.areaHeight, s.moduleWidth, s.moduleHeight,
    s.watts, s.gap, s.rows, s.cols, s.tilt, s.orientation, s.setback
  ].join("|");

  const panelsPart = [...snapshot.panels]
    .sort((a, b) => a.id - b.id)
    .map(p => [p.id, p.segmentId ?? "", p.x, p.y, p.w, p.h].join("|"))
    .join(";");

  const sitePart = snapshot.site
    ? [
        snapshot.site.coordinates?.lat ?? "",
        snapshot.site.coordinates?.lng ?? "",
        (snapshot.site.polygonCorners ?? []).map(p => `${p.x},${p.y}`).join(";"),
        (snapshot.site.polygonPoints ?? []).map(p => `${p.lat},${p.lng}`).join(";")
      ].join("|")
    : "none";

  const segmentsPart = [...snapshot.segments]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(segment => [
      segment.id,
      segment.settings.watts ?? "",
      segment.settings.moduleWidth ?? "",
      segment.corners.map(p => `${p.x},${p.y}`).join(";")
    ].join("|"))
    .join(";");

  return stableHash([
    `settings:${settingsPart}`,
    `panels:${panelsPart}`,
    `site:${sitePart}`,
    `segments:${segmentsPart}`
  ].join("~"));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function emptySnapshot(projectId: string | null, source: LayoutSnapshotSource, warning?: string): LayoutSnapshot {
  const settings = { ...DEFAULT_LAYOUT_SETTINGS };
  const segments: FieldSegmentSnapshot[] = [
    {
      id: IMPLICIT_SEGMENT_ID,
      name: "Implicit segment (all panels)",
      source: "implicit",
      corners: rectangleCorners(settings),
      panelIds: [],
      panelCount: 0,
      dcKwp: 0,
      settings: segmentSettings({}, settings),
      warnings: []
    }
  ];
  const base: Omit<LayoutSnapshot, "fingerprint"> = {
    projectId,
    source,
    settings,
    panels: [],
    obstacles: [],
    site: null,
    segments,
    panelCount: 0,
    dcKwp: 0,
    warnings: warning ? [warning] : ["No saved PV Layout was found for this project."],
    legacyKeysNormalized: []
  };
  return { ...base, fingerprint: computeLayoutFingerprint(base) };
}

export function emptyLayoutSnapshot(projectId: string | null = null, warning?: string): LayoutSnapshot {
  return emptySnapshot(projectId, "empty", warning);
}

function unwrapLayoutPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const inner = raw.layout_data;
  if (isRecord(inner) && inner.panels !== undefined) return inner;
  return raw;
}

/**
 * Parse a raw PV Layout payload (localStorage draft, REST response, or seed).
 * Returns an empty snapshot for `null`/invalid input, never throws.
 */
export function parseLayoutPayload(
  raw: unknown,
  options: { projectId?: string | null; source?: LayoutSnapshotSource } = {}
): LayoutSnapshot {
  const source = options.source ?? "local";
  const payload = unwrapLayoutPayload(raw);
  if (!isRecord(payload)) {
    return emptySnapshot(
      options.projectId ?? null,
      "empty",
      raw === null || raw === undefined
        ? undefined
        : "PV Layout payload is not an object; no layout was read."
    );
  }

  const warnings: string[] = [];
  const legacyKeysNormalized: string[] = [];
  const settings = normalizeSettings(payload.settings, legacyKeysNormalized);
  const panels = normalizePanels(payload.panels, warnings);
  const obstacles = normalizeObstacles(payload.obstacles, warnings);
  const site = normalizeSite(payload.site, warnings);
  const segments = buildSegments(payload.segments, panels, site, settings, warnings);

  const projectId = options.projectId !== undefined
    ? options.projectId
    : toText(payload.projectId) ?? null;

  const panelCount = panels.length;
  const dcKwp = round6((panelCount * settings.watts) / 1000);

  if (payload.panels === undefined) {
    warnings.push("Layout payload has no panels array.");
  }

  const base: Omit<LayoutSnapshot, "fingerprint"> = {
    projectId,
    source,
    settings,
    panels,
    obstacles,
    site,
    segments,
    panelCount,
    dcKwp,
    warnings,
    legacyKeysNormalized
  };

  return { ...base, fingerprint: computeLayoutFingerprint(base) };
}

export function layoutStorageKey(userId: string, projectId: string | null): string {
  return `${LAYOUT_STORAGE_PREFIX}:${userId}:${projectId ?? "unassigned"}`;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* storage can be blocked by browser policy */
  }
  return null;
}

/**
 * Read the browser draft for a project. Mirrors `PVLayout`'s key exactly.
 * Remote loading is intentionally left to the caller so this stays testable.
 */
export function loadLayoutSnapshot(input: {
  userId: string;
  projectId?: string | null;
  storage?: StorageLike | null;
}): LayoutSnapshot {
  const projectId = input.projectId ?? null;
  const storage = input.storage === undefined ? defaultStorage() : input.storage;
  if (!storage) {
    return emptyLayoutSnapshot(projectId, "Browser storage is unavailable; no PV Layout draft could be read.");
  }

  let parsed: unknown = null;
  try {
    const raw = storage.getItem(layoutStorageKey(input.userId, projectId));
    if (raw) parsed = JSON.parse(raw);
  } catch {
    return emptyLayoutSnapshot(projectId, "Saved PV Layout draft could not be parsed as JSON.");
  }

  return parseLayoutPayload(parsed, {
    projectId,
    source: parsed === null ? "empty" : "local"
  });
}

/**
 * Choose the layout source using the same precedence as `PVLayout`:
 * a remote payload with panels wins, then the local draft, then seed data.
 * Payloads without a revision timestamp cannot be ordered; this is explicit.
 */
export function resolveLayoutSnapshot(input: {
  projectId?: string | null;
  localRaw?: unknown;
  remoteRaw?: unknown;
  seedRaw?: unknown;
}): LayoutSnapshot {
  const projectId = input.projectId ?? null;
  const candidates: Array<{ raw: unknown; source: LayoutSnapshotSource }> = [];
  if (input.remoteRaw !== undefined) candidates.push({ raw: input.remoteRaw, source: "remote" });
  if (input.localRaw !== undefined) candidates.push({ raw: input.localRaw, source: "local" });
  if (input.seedRaw !== undefined) candidates.push({ raw: input.seedRaw, source: "seed" });

  const parsed = candidates.map(candidate =>
    parseLayoutPayload(candidate.raw, { projectId, source: candidate.source })
  );

  const withPanels = parsed.find(snapshot => snapshot.panelCount > 0);
  const chosen = withPanels ?? parsed.find(snapshot => snapshot.source !== "empty") ?? null;
  if (!chosen) return emptyLayoutSnapshot(projectId);

  if (chosen.panelCount === 0) {
    chosen.warnings.push("The selected layout source contains no panels.");
  }
  return chosen;
}
