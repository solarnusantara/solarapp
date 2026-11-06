import { getProjectDefaultLayout } from "./defaultProjectsData";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Grid2X2,
  MousePointer2,
  RotateCcw,
  Trash2,
  WandSparkles,
  ImagePlus,
  X,
  Globe,
  MapPin,
  Undo2,
  Redo2,
  Copy,
  RotateCw,
  CheckSquare,
  Zap,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Hand,
  Plus,
  Eye,
  EyeOff,
  Layers,
  Ban,
  Square,
  Sliders,
  Check,
  Compass,
  Table,
  Activity,
  CheckCircle2,
  Save,
  Share2
} from "lucide-react";
import GoogleMapsModal from "./GoogleMapsModal";
import * as api from "./api";
import EngineRunPanel from "./engine/EngineRunPanel";
import AdvancedPanel from "./engine/AdvancedPanel";
import KeepoutsPanel, { type KeepoutPatch, type KeepoutTool } from "./pv/KeepoutsPanel";
import { pushSnapshot, redoIndex, undoIndex } from "./pv/history";
import {
  deleteObstacle, deleteWalkway, sameKeepout, toKeepoutViews,
  updateObstacleRect, updateWalkwayRect, isValidRect,
  type KeepoutRef,
} from "./pv/keepoutModel";
import { normalizeOverlay, type Overlay } from "./pv/overlayModel";
import { EMPTY_ENGINE_INPUTS, type EngineInputs } from "./engine/types/local";

type Lang = "en" | "id";
export type Panel = { id: number; x: number; y: number; w: number; h: number; segmentId?: string };
export type SystemType = "Rooftop" | "Ground-mounted";
export type Obstacle = { id: number; x: number; y: number; w: number; h: number; label: string; heightM?: number; visible?: boolean };

export interface FieldSegment {
  id: string;
  name: string;
  color: string;
  polygon: Array<{ x: number; y: number }>;
  orientation: "landscape" | "portrait";
  tilt: number;
  azimuth: number;
  gap: number; // mm
  setback: number; // mm
  moduleWatts: number;
  moduleWidth: number; // mm
  moduleHeight: number; // mm
  panels: Panel[];
  visible: boolean;
}

export interface Walkway {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  visible?: boolean;
}

export interface LayerState {
  siteBoundary: boolean;
  fieldSegments: boolean;
  pvModules: boolean;
  keepouts: boolean;
  walkway: boolean;
  roofBuilding: boolean;
  satellite: boolean;
  segmentLabels?: boolean;
}

export type Site = {
  coordinates: { lat: number; lng: number };
  address: string;
  polygonPoints?: Array<{ lat: number; lng: number }>;
  polygonCorners?: Array<{ x: number; y: number }>;
  rotationDeg?: number;
  imageSpanM?: number;
  pitchDegrees?: number;
  azimuthDegrees?: number;
  googleSolarData?: any;
  boxes?: Array<{
    id: string;
    name: string;
    color: string;
    center: { lat: number; lng: number };
    widthM: number;
    heightM: number;
    rotationAngle: number;
  }>;
  cropPaddingM?: number;
  imageCenterMm?: { x: number; y: number };
};

const STORAGE_KEY = "solar-apps-pv-layout-v1";
const defaults = {
  system: "Rooftop" as SystemType,
  areaWidth: 65000,
  areaHeight: 34000,
  moduleWidth: 2278,
  moduleHeight: 1134,
  gap: 20,
  rows: 4,
  cols: 8,
  watts: 580,
  tilt: 10,
  orientation: "landscape" as "landscape" | "portrait",
  setback: 300,
  obstacleWidth: 3000,
  obstacleHeight: 3000,
};

function storageKey(userId: string, projectId: string | null) {
  return `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`;
}

function projectStorageKey(projectId: string | null) {
  return `${STORAGE_KEY}:project:${projectId ?? "unassigned"}`;
}

function countLayoutPanels(data: any): number {
  if (!data || typeof data !== "object") return 0;
  if (Array.isArray(data.panels) && data.panels.length > 0) return data.panels.length;
  if (Array.isArray(data.segments)) {
    return data.segments.reduce((acc: number, s: any) => acc + (Array.isArray(s?.panels) ? s.panels.length : 0), 0);
  }
  return 0;
}

function isLayoutRicher(candidate: any, baseline: any): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  if (!baseline || typeof baseline !== "object") return true;

  const countC = countLayoutPanels(candidate);
  const countB = countLayoutPanels(baseline);

  if (countC > countB) return true;
  if (countC < countB) return false;

  if (candidate.backgroundImage && !baseline.backgroundImage) return true;
  if (!candidate.backgroundImage && baseline.backgroundImage) return false;

  const segsC = Array.isArray(candidate.segments) ? candidate.segments.length : 0;
  const segsB = Array.isArray(baseline.segments) ? baseline.segments.length : 0;
  if (segsC > segsB) return true;

  const overlaysC = Array.isArray(candidate.overlays) ? candidate.overlays.length : 0;
  const overlaysB = Array.isArray(baseline.overlays) ? baseline.overlays.length : 0;
  if (overlaysC > overlaysB) return true;

  return false;
}

const SEGMENT_PALETTE = ["#3b82f6", "#8b5cf6", "#f97316", "#10b981", "#f43f5e", "#06b6d4", "#eab308"];

/**
 * Insets a polygon by setback distance. Works for convex polygons in mm
 */
function computeInsetPolygon(
  corners: Array<{ x: number; y: number }>,
  setback: number
): Array<{ x: number; y: number }> {
  if (!corners || corners.length < 3 || setback <= 0) return corners;
  const n = corners.length;

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += corners[i].x * corners[j].y - corners[j].x * corners[i].y;
  }
  const isClockwiseScreen = signedArea > 0;

  type Line = { a: number; b: number; c: number };
  const offsetLines: Line[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const nx = isClockwiseScreen ? -dy / len : dy / len;
    const ny = isClockwiseScreen ? dx / len : -dx / len;

    const px = p1.x + setback * nx;
    const py = p1.y + setback * ny;

    offsetLines.push({
      a: nx,
      b: ny,
      c: -(nx * px + ny * py),
    });
  }

  const insetVertices: Array<{ x: number; y: number }> = [];
  const m = offsetLines.length;
  for (let i = 0; i < m; i++) {
    const l1 = offsetLines[(i - 1 + m) % m];
    const l2 = offsetLines[i];
    const det = l1.a * l2.b - l1.b * l2.a;
    if (Math.abs(det) < 1e-6) {
      insetVertices.push(corners[i]);
    } else {
      const x = (-l1.c * l2.b - l1.b * (-l2.c)) / det;
      const y = (l1.a * (-l2.c) - (-l1.c) * l2.a) / det;
      insetVertices.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  return insetVertices.length >= 3 ? insetVertices : corners;
}

function isPointInPolygon(
  x: number,
  y: number,
  poly: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Tolerance (mm) for a module that fits the setback polygon exactly. */
const FIT_EPS_MM = 0.5;

function isPanelInsidePolygon(
  p: Pick<Panel, "x" | "y" | "w" | "h">,
  poly: Array<{ x: number; y: number }>
): boolean {
  // A module that fits the inset polygon exactly has its corners ON the edge, where even-odd
  // ray casting is unreliable (float noise decides). Test the rectangle shrunk by FIT_EPS_MM so an
  // exact fit counts as inside; 0.5 mm is far below any real clearance.
  const e = FIT_EPS_MM;
  const corners = [
    { x: p.x + e, y: p.y + e },
    { x: p.x + p.w - e, y: p.y + e },
    { x: p.x + p.w - e, y: p.y + p.h - e },
    { x: p.x + e, y: p.y + p.h - e },
  ];
  return corners.every(c => isPointInPolygon(c.x, c.y, poly));
}

export function generatePanelsForSegment(
  seg: FieldSegment,
  obstacles: Obstacle[] = [],
  walkways: Walkway[] = []
): Panel[] {
  const boundary = seg.polygon && seg.polygon.length >= 3 ? seg.polygon : [
    { x: 0, y: 0 },
    { x: 20000, y: 0 },
    { x: 20000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  const setbackPoly = computeInsetPolygon(boundary, seg.setback);

  const isLandscape = seg.orientation === "landscape";
  const modW = isLandscape ? Math.max(seg.moduleWidth, seg.moduleHeight) : Math.min(seg.moduleWidth, seg.moduleHeight);
  const modH = isLandscape ? Math.min(seg.moduleWidth, seg.moduleHeight) : Math.max(seg.moduleWidth, seg.moduleHeight);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of setbackPoly) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const stepX = modW + seg.gap;
  const stepY = modH + seg.gap;
  const result: Panel[] = [];
  let idCounter = Date.now() + Math.floor(Math.random() * 50000);

  const collidesWithObsOrWalk = (p: { x: number; y: number; w: number; h: number }) => {
    for (const obs of obstacles) {
      if (p.x < obs.x + obs.w && p.x + p.w > obs.x && p.y < obs.y + obs.h && p.y + p.h > obs.y) return true;
    }
    for (const w of walkways) {
      if (p.x < w.x + w.w && p.x + p.w > w.x && p.y < w.y + w.h && p.y + p.h > w.y) return true;
    }
    return false;
  };

  for (let y = minY; y <= maxY - modH + FIT_EPS_MM; y += stepY) {
    for (let x = minX; x <= maxX - modW + FIT_EPS_MM; x += stepX) {
      const candidate: Panel = { id: ++idCounter, x, y, w: modW, h: modH, segmentId: seg.id };
      if (isPanelInsidePolygon(candidate, setbackPoly) && !collidesWithObsOrWalk(candidate)) {
        result.push(candidate);
      }
    }
  }
  return result;
}

function loadSaved(userId: string, projectId: string | null): any {
  try {
    // 1. Try project-scoped shared key first
    if (projectId) {
      const projRaw = localStorage.getItem(projectStorageKey(projectId));
      if (projRaw) {
        const parsed = JSON.parse(projRaw);
        if (parsed?.settings || parsed?.segments || (Array.isArray(parsed?.panels) && parsed.panels.length > 0)) {
          return parsed;
        }
      }
    }
    // 2. Try current user scoped key
    const raw = localStorage.getItem(storageKey(userId, projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.settings || parsed?.segments || (Array.isArray(parsed?.panels) && parsed.panels.length > 0)) {
        return parsed;
      }
    }
    // 3. Scan localStorage for ANY user draft for this project
    if (projectId) {
      let richest: any = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${STORAGE_KEY}:`) && k.endsWith(`:${projectId}`)) {
          const itemRaw = localStorage.getItem(k);
          if (itemRaw) {
            try {
              const parsed = JSON.parse(itemRaw);
              if (isLayoutRicher(parsed, richest)) {
                richest = parsed;
              }
            } catch {}
          }
        }
      }
      if (richest) return richest;
    }
  } catch { /* ignore */ }
  const defaultData = getProjectDefaultLayout(projectId);
  if (defaultData) return defaultData as any;
  return null;
}

interface HistoryEntry {
  segments: FieldSegment[];
  obstacles: Obstacle[];
  walkways: Walkway[];
}

export default function PVLayout({
  lang,
  userId,
  projectId = null,
  projectName = null,
  projectType = null
}: {
  lang: Lang;
  userId: string;
  projectId?: string | null;
  projectName?: string | null;
  projectType?: SystemType | null;
}) {
  const saved = useMemo(() => loadSaved(userId, projectId), [userId, projectId]);
  const isId = lang === "id";
  const [engineInputs, setEngineInputsState] = useState<EngineInputs>({ ...EMPTY_ENGINE_INPUTS, ...(saved?.engine_inputs ?? {}) });
  const engineInputsRef = useRef<EngineInputs>(engineInputs);
  const setEngineInputs = (next: EngineInputs) => {
    engineInputsRef.current = next;
    setEngineInputsState(next);
    saveDraftRef.current?.();
  };
  const saveDraftRef = useRef<(() => void) | null>(null);

    const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSynced, setCloudSynced] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>("");

  // Helper to apply loaded layout from server or local store
  const applyLayoutData = (data: any) => {
    if (!data || typeof data !== "object") return;
    if (data.engine_inputs && typeof data.engine_inputs === "object") {
      engineInputsRef.current = { ...EMPTY_ENGINE_INPUTS, ...data.engine_inputs };
      setEngineInputsState(engineInputsRef.current);
    }

    if (data.settings) {
      setSettings((prev: any) => ({
        ...prev,
        ...data.settings,
        system: projectType ?? data.settings.system ?? prev.system
      }));
    }

    if (Array.isArray(data.segments) && data.segments.length > 0) {
      setSegments(data.segments);
      setActiveSegmentId((prev: string) => (data.segments.some((s: FieldSegment) => s.id === prev) ? prev : data.segments[0].id));
    } else if (Array.isArray(data.panels) && data.panels.length > 0) {
      const fallbackSeg: FieldSegment = {
        id: "seg-a",
        name: "Segment A",
        color: "#3b82f6",
        polygon: data.site?.polygonCorners ?? [
          { x: 0, y: 0 },
          { x: data.settings?.areaWidth ?? defaults.areaWidth, y: 0 },
          { x: data.settings?.areaWidth ?? defaults.areaWidth, y: data.settings?.areaHeight ?? defaults.areaHeight },
          { x: 0, y: data.settings?.areaHeight ?? defaults.areaHeight },
        ],
        orientation: (data.settings?.orientation ?? defaults.orientation) as "landscape" | "portrait",
        tilt: data.settings?.tilt ?? defaults.tilt,
        azimuth: data.settings?.azimuth ?? 0,
        gap: data.settings?.gap ?? defaults.gap,
        setback: data.settings?.setback ?? defaults.setback,
        moduleWatts: data.settings?.panelWatts ?? data.settings?.watts ?? defaults.watts,
        moduleWidth: data.settings?.panelWidth ?? data.settings?.moduleWidth ?? defaults.moduleWidth,
        moduleHeight: data.settings?.panelHeight ?? data.settings?.moduleHeight ?? defaults.moduleHeight,
        panels: data.panels,
        visible: true,
      };
      setSegments([fallbackSeg]);
      setActiveSegmentId("seg-a");
    }

    if (Array.isArray(data.walkways)) setWalkways(data.walkways);
    if (Array.isArray(data.obstacles)) setObstacles(data.obstacles);
    if (data.site) setSite(data.site);
    if (typeof data.backgroundImage === "string") setBackgroundImage(data.backgroundImage);
    if (typeof data.backgroundOpacity === "number") setBackgroundOpacity(data.backgroundOpacity);
    if (Array.isArray(data.overlays)) {
      setOverlays(data.overlays.map(normalizeOverlay).filter((o: Overlay | null): o is Overlay => !!o));
    }
    if (data.layers) setLayers(prev => ({ ...prev, ...data.layers }));
  };

  // Remote Cloud Sync on Mount & Project Switch
  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;
    setIsSyncing(true);

    api.fetchProjectLayout(projectId).then(async (remoteLayout) => {
      if (!isMounted) return;
      setIsSyncing(false);

      const localCandidate = saved;

      if (remoteLayout && isLayoutRicher(remoteLayout, localCandidate)) {
        // Server has richer layout (e.g. team member worked on it from another device)
        applyLayoutData(remoteLayout);
        setCloudSynced(true);
        if (remoteLayout.savedAt) setLastSavedTime(remoteLayout.savedAt);
        try {
          localStorage.setItem(storageKey(userId, projectId), JSON.stringify(remoteLayout));
          localStorage.setItem(projectStorageKey(projectId), JSON.stringify(remoteLayout));
        } catch {}
        setNotice(isId ? "✅ Desain terbaru berhasil disinkronkan dari Cloud Server Sonus." : "Latest layout synced from Sonus Cloud Server.");
      } else if (localCandidate && isLayoutRicher(localCandidate, remoteLayout)) {
        // Local machine has richer work than server (e.g. local draft had panels before server had it)
        // Automatically sync UP to server so the whole team can see it!
        setNotice(isId ? "🔄 Memulihkan data desain lengkap ke Cloud Server agar bisa dilihat tim..." : "Restoring rich local layout to Cloud Server for team access...");
        const ok = await api.saveProjectLayout(projectId, localCandidate);
        if (ok && isMounted) {
          setCloudSynced(true);
          const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setLastSavedTime(nowStr);
          setNotice(isId ? `✅ Desain lengkap berhasil disinkronkan ke Cloud Server (${nowStr})!` : `Complete design synced to Cloud Server (${nowStr})!`);
        }
      } else if (remoteLayout) {
        applyLayoutData(remoteLayout);
        setCloudSynced(true);
        if (remoteLayout.savedAt) setLastSavedTime(remoteLayout.savedAt);
      }
    }).catch(err => {
      console.warn("Could not sync remote layout:", err);
      if (isMounted) setIsSyncing(false);
    });

    return () => { isMounted = false; };
  }, [projectId]);

  const handleManualSave = async () => {
    setIsSaving(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const ok = await saveDraft(segments, obstacles, walkways, site, backgroundImage, backgroundOpacity);
    setIsSaving(false);
    setLastSavedTime(timeStr);
    if (ok) {
      setCloudSynced(true);
      setNotice(isId ? `✅ Desain berhasil disimpan ke Cloud Server & Komputer (${timeStr})!` : `Layout saved to Cloud Server & Local Storage (${timeStr})!`);
    } else {
      setNotice(isId ? `💾 Desain tersimpan di komputer (${timeStr}). Sinkronisasi cloud gagal.` : `Saved locally (${timeStr}). Cloud sync failed.`);
    }
  };

  const [settings, setSettings] = useState({
    ...defaults,
    system: projectType ?? defaults.system,
    ...(saved?.settings ?? {})
  });

  // Multi-segment state
  const initialSegments = useMemo<FieldSegment[]>(() => {
    if (saved?.segments && Array.isArray(saved.segments) && saved.segments.length > 0) {
      return saved.segments;
    }
    // If legacy panels exist without segments, create default Segment A
    if (saved?.panels && Array.isArray(saved.panels) && saved.panels.length > 0) {
      return [{
        id: "seg-a",
        name: "Segment A",
        color: "#3b82f6",
        polygon: saved?.site?.polygonCorners ?? [
          { x: 0, y: 0 },
          { x: saved.settings?.areaWidth ?? defaults.areaWidth, y: 0 },
          { x: saved.settings?.areaWidth ?? defaults.areaWidth, y: saved.settings?.areaHeight ?? defaults.areaHeight },
          { x: 0, y: saved.settings?.areaHeight ?? defaults.areaHeight },
        ],
        orientation: (saved.settings?.orientation ?? defaults.orientation) as "landscape" | "portrait",
        tilt: saved.settings?.tilt ?? defaults.tilt,
        azimuth: saved.settings?.azimuth ?? 0,
        gap: saved.settings?.gap ?? defaults.gap,
        setback: saved.settings?.setback ?? defaults.setback,
        moduleWatts: saved.settings?.panelWatts ?? saved.settings?.watts ?? defaults.watts,
        moduleWidth: saved.settings?.panelWidth ?? saved.settings?.moduleWidth ?? defaults.moduleWidth,
        moduleHeight: saved.settings?.panelHeight ?? saved.settings?.moduleHeight ?? defaults.moduleHeight,
        panels: saved.panels,
        visible: true,
      }];
    }
    // Default 3 segments if fresh Mas Silueta project
    if (projectId === "proj-mas-silueta-224kwp" || projectId?.includes("mas-silueta")) {
      const defaultLayout = getProjectDefaultLayout(projectId) as any;
      if (defaultLayout?.segments) return defaultLayout.segments;
    }
    // Standard fresh single segment
    return [{
      id: "seg-a",
      name: "Segment A",
      color: "#3b82f6",
      polygon: [
        { x: 2000, y: 2000 },
        { x: (settings.areaWidth || defaults.areaWidth) - 2000, y: 2000 },
        { x: (settings.areaWidth || defaults.areaWidth) - 2000, y: (settings.areaHeight || defaults.areaHeight) - 2000 },
        { x: 2000, y: (settings.areaHeight || defaults.areaHeight) - 2000 },
      ],
      orientation: "landscape",
      tilt: 10,
      azimuth: 0,
      gap: 20,
      setback: 300,
      moduleWatts: 580,
      moduleWidth: 2278,
      moduleHeight: 1134,
      panels: [],
      visible: true,
    }];
  }, [saved, projectId, settings.areaWidth, settings.areaHeight]);

  const [segments, setSegments] = useState<FieldSegment[]>(initialSegments);
  const [activeSegmentId, setActiveSegmentId] = useState<string>(initialSegments[0]?.id || "seg-a");
  const [walkways, setWalkways] = useState<Walkway[]>(saved?.walkways ?? []);
  const [obstacles, setObstacles] = useState<Obstacle[]>(saved?.obstacles ?? []);
  const [backgroundImage, setBackgroundImage] = useState<string>(saved?.backgroundImage ?? "");
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(saved?.backgroundOpacity ?? 0.85);
  const [overlays, setOverlays] = useState<Overlay[]>(() =>
    Array.isArray(saved?.overlays) ? (saved.overlays as unknown[]).map((raw: unknown) => normalizeOverlay(raw)).filter((o: Overlay | null): o is Overlay => !!o) : []
  );
  // Live refs keep pointer-up persistence independent of the last pointer-move render (the segment
  // drag handler has a known stale-state issue; new keepout drags do not copy that pattern).
  const walkwaysRef = useRef<Walkway[]>(walkways);
  walkwaysRef.current = walkways;
  const obstaclesRef = useRef<Obstacle[]>(obstacles);
  obstaclesRef.current = obstacles;
  const [site, setSite] = useState<Site | null>(saved?.site ?? {
    coordinates: { lat: -6.9616, lng: 110.3333 },
    address: projectName || "PT Mas Silueta Indonesia, Jawa Tengah",
    polygonCorners: [
      { x: 0, y: 0 },
      { x: 65000, y: 0 },
      { x: 65000, y: 34000 },
      { x: 0, y: 34000 },
    ],
  });

  // UI state
  const [activeStep, setActiveStep] = useState<number>(2); // 1: Site GIS, 2: Mechanical, 3: Keepouts, 4: Electrical, 5: Advanced
  const [activeLeftTab, setActiveLeftTab] = useState<"segment" | "module">("segment");
  const [toolMode, setToolMode] = useState<"select" | "pan" | "polygon" | "rectangle" | "keepout" | "walkway" | "autoarray">("select");
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Layers Visibility
  const [layers, setLayers] = useState<LayerState>({
    siteBoundary: true,
    fieldSegments: true,
    pvModules: true,
    keepouts: true,
    walkway: true,
    roofBuilding: true,
    satellite: true,
  });

  // Selection & drag state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedKeepout, setSelectedKeepout] = useState<KeepoutRef | null>(null);
  const [draggingKeepout, setDraggingKeepout] = useState<KeepoutRef | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const keepoutDragStartRef = useRef<{
    ref: KeepoutRef;
    mouseX: number;
    mouseY: number;
    initial: { x: number; y: number; w: number; h: number };
    moved: boolean;
  } | null>(null);

  // Dragging segments & corners state
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);
  const dragSegmentStartRef = useRef<{ mouseX: number; mouseY: number; initialPoly: Array<{ x: number; y: number }> }>({
    mouseX: 0,
    mouseY: 0,
    initialPoly: [],
  });
  const [draggingCorner, setDraggingCorner] = useState<{ segId: string; cornerIndex: number } | null>(null);
  const dragCornerStartRef = useRef<{ mouseX: number; mouseY: number; initialPt: { x: number; y: number } }>({
    mouseX: 0,
    mouseY: 0,
    initialPt: { x: 0, y: 0 },
  });
  const [drawingRect, setDrawingRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [drawingKind, setDrawingKind] = useState<"segment" | "keepout" | "walkway" | null>(null);

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const isSpacePressedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // History for Undo/Redo
  const [history, setHistory] = useState<HistoryEntry[]>([{
    segments: initialSegments,
    obstacles: saved?.obstacles ?? [],
    walkways: saved?.walkways ?? [],
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const activeSegment = useMemo(() => {
    return segments.find(s => s.id === activeSegmentId) || segments[0] || null;
  }, [segments, activeSegmentId]);

  // Flattened panels for backwards compatibility & 3D Twin sync
  const allPanels = useMemo<Panel[]>(() => {
    return segments.filter(s => s.visible).flatMap(s => s.panels);
  }, [segments]);

  // Aggregate Key Metrics
  const totalModul = allPanels.length;
  const totalCapacityKwp = useMemo(() => {
    return segments.filter(s => s.visible).reduce((sum, s) => {
      return sum + (s.panels.length * (s.moduleWatts || 580)) / 1000;
    }, 0);
  }, [segments]);

  const totalModuleArea = useMemo(() => {
    return segments.filter(s => s.visible).reduce((sum, s) => {
      const areaPerMod = ((s.moduleWidth || 2278) * (s.moduleHeight || 1134)) / 1e6;
      return sum + s.panels.length * areaPerMod;
    }, 0);
  }, [segments]);

  const totalRoofArea = useMemo(() => {
    return Math.max(1, (settings.areaWidth * settings.areaHeight) / 1e6);
  }, [settings.areaWidth, settings.areaHeight]);

  const areaUtilizationPct = useMemo(() => {
    return Math.min(100, (totalModuleArea / totalRoofArea) * 100);
  }, [totalModuleArea, totalRoofArea]);

  // Auto-save layout with LocalStorage + Server Cloud Persistence
  const saveDraft = async (
    nextSegments: FieldSegment[] = segments,
    nextObstacles: Obstacle[] = obstacles,
    nextWalkways: Walkway[] = walkways,
    nextSite: Site | null = site,
    nextBg: string = backgroundImage,
    nextBgOpacity: number = backgroundOpacity,
    nextOverlays: Overlay[] = overlays
  ): Promise<boolean> => {
    const flattened = nextSegments.filter(s => s.visible).flatMap(s => s.panels);
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const payload = {
      projectId,
      settings,
      segments: nextSegments,
      walkways: nextWalkways,
      obstacles: nextObstacles,
      panels: flattened,
      site: nextSite,
      backgroundImage: nextBg,
      backgroundOpacity: nextBgOpacity,
      overlays: nextOverlays,
      layers,
      savedAt: nowStr,
      engine_inputs: engineInputsRef.current,
    };
    try {
      localStorage.setItem(storageKey(userId, projectId), JSON.stringify(payload));
      if (projectId) {
        localStorage.setItem(projectStorageKey(projectId), JSON.stringify(payload));
      }
    } catch { /* ignore storage error */ }
    if (projectId) {
      const ok = await api.saveProjectLayout(projectId, payload);
      if (ok) setCloudSynced(true);
      return ok;
    }
    return true;
  };

  saveDraftRef.current = () => saveDraft();


  const pushHistory = (nextSegs: FieldSegment[], nextObs: Obstacle[], nextWalks: Walkway[]) => {
    const nextEntry: HistoryEntry = { segments: nextSegs, obstacles: nextObs, walkways: nextWalks };
    const next = pushSnapshot(history, historyIndex, nextEntry);
    setHistory(next.entries);
    setHistoryIndex(next.index);
  };

  const restoreHistoryEntry = (target: HistoryEntry) => {
    setSegments(target.segments);
    setObstacles(target.obstacles);
    setWalkways(target.walkways);
    setSelectedKeepout((prev) => {
      if (!prev) return null;
      const exists = prev.kind === "walkway"
        ? target.walkways.some((w) => w.id === prev.id)
        : target.obstacles.some((o) => o.id === prev.id);
      return exists ? prev : null;
    });
    saveDraft(target.segments, target.obstacles, target.walkways);
  };

  const handleUndo = () => {
    const targetIndex = undoIndex(history, historyIndex);
    if (targetIndex === null) return;
    restoreHistoryEntry(history[targetIndex]);
    setHistoryIndex(targetIndex);
  };

  const handleRedo = () => {
    const targetIndex = redoIndex(history, historyIndex);
    if (targetIndex === null) return;
    restoreHistoryEntry(history[targetIndex]);
    setHistoryIndex(targetIndex);
  };

  const applyOverlays = (next: Overlay[]) => {
    setOverlays(next);
    saveDraft(segments, obstacles, walkways, site, backgroundImage, backgroundOpacity, next);
  };

  // --- Keepouts / Walkways ---
  const keepoutViews = useMemo(() => toKeepoutViews(walkways, obstacles), [walkways, obstacles]);

  const focusKeepout = (ref: KeepoutRef) => {
    setSelectedKeepout(ref);
    setSelectedIds(new Set());
    setToolMode("select");
  };

  const deleteKeepout = (ref: KeepoutRef) => {
    if (ref.kind === "walkway") {
      const nextWalkways = deleteWalkway(walkways, String(ref.id));
      setWalkways(nextWalkways);
      setSelectedKeepout(null);
      pushHistory(segments, obstacles, nextWalkways);
      saveDraft(segments, obstacles, nextWalkways);
    } else {
      const nextObstacles = deleteObstacle(obstacles, Number(ref.id));
      setObstacles(nextObstacles);
      setSelectedKeepout(null);
      pushHistory(segments, nextObstacles, walkways);
      saveDraft(segments, nextObstacles, walkways);
    }
    setNotice(isId ? "Objek keepout berhasil dihapus." : "Keepout object deleted.");
  };

  const patchKeepout = (ref: KeepoutRef, patch: KeepoutPatch) => {
    if (ref.kind === "walkway") {
      const { heightM: _heightM, ...walkwayPatch } = patch;
      void _heightM;
      const next = updateWalkwayRect(walkwaysRef.current, String(ref.id), walkwayPatch);
      walkwaysRef.current = next;
      setWalkways(next);
    } else {
      const next = updateObstacleRect(obstaclesRef.current, Number(ref.id), patch);
      obstaclesRef.current = next;
      setObstacles(next);
    }
  };

  const commitKeepoutEdit = () => {
    const liveWalkways = walkwaysRef.current;
    const liveObstacles = obstaclesRef.current;
    pushHistory(segments, liveObstacles, liveWalkways);
    saveDraft(segments, liveObstacles, liveWalkways);
  };

  const toggleKeepoutVisibility = (ref: KeepoutRef) => {
    const current = keepoutViews.find((v) => sameKeepout(v, ref));
    if (!current) return;
    const nextVisible = !current.visible;
    if (ref.kind === "walkway") {
      const nextWalkways = updateWalkwayRect(walkways, String(ref.id), { visible: nextVisible });
      setWalkways(nextWalkways);
      pushHistory(segments, obstacles, nextWalkways);
      saveDraft(segments, obstacles, nextWalkways);
    } else {
      const nextObstacles = updateObstacleRect(obstacles, Number(ref.id), { visible: nextVisible });
      setObstacles(nextObstacles);
      pushHistory(segments, nextObstacles, walkways);
      saveDraft(segments, nextObstacles, walkways);
    }
  };

  const createKeepoutFromRect = (kind: "keepout" | "walkway", x: number, y: number, w: number, h: number) => {
    if (kind === "walkway") {
      const newWalkway: Walkway = {
        id: `w-${Date.now()}`,
        x, y, w, h,
        label: `Walkway ${walkways.length + 1}`,
      };
      const nextWalkways = [...walkways, newWalkway];
      setWalkways(nextWalkways);
      setSelectedKeepout({ kind: "walkway", id: newWalkway.id });
      pushHistory(segments, obstacles, nextWalkways);
      saveDraft(segments, obstacles, nextWalkways);
      setNotice(isId ? "Walkway baru berhasil digambar. Geser atau edit di panel Keepouts." : "New walkway drawn.");
    } else {
      const newObstacle: Obstacle = {
        id: Date.now(),
        x, y, w, h,
        label: `Keepout ${obstacles.length + 1}`,
      };
      const nextObstacles = [...obstacles, newObstacle];
      setObstacles(nextObstacles);
      setSelectedKeepout({ kind: "obstacle", id: newObstacle.id });
      pushHistory(segments, nextObstacles, walkways);
      saveDraft(segments, nextObstacles, walkways);
      setNotice(isId ? "Keepout baru berhasil digambar." : "New keepout drawn.");
    }
    setSelectedIds(new Set());
    setToolMode("select");
  };

  const beginKeepoutDrag = (e: React.PointerEvent, view: { kind: "walkway" | "obstacle"; id: string | number; x: number; y: number; w: number; h: number }) => {
    const ref: KeepoutRef = { kind: view.kind, id: view.id };
    setSelectedKeepout(ref);
    setSelectedIds(new Set());
    setDraggingKeepout(ref);
    keepoutDragStartRef.current = {
      ref,
      mouseX: e.clientX,
      mouseY: e.clientY,
      initial: { x: view.x, y: view.y, w: view.w, h: view.h },
      moved: false,
    };
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  };

  // --- Segment Management ---
  const handleAddSegment = () => {
    const letter = String.fromCharCode(65 + segments.length);
    const color = SEGMENT_PALETTE[segments.length % SEGMENT_PALETTE.length];
    const newId = `seg-${Date.now()}`;
    const offset = (segments.length * 8000) % Math.max(10000, settings.areaHeight - 10000);
    const newSeg: FieldSegment = {
      id: newId,
      name: `Segment ${letter}`,
      color,
      polygon: [
        { x: 3000, y: 2000 + offset },
        { x: Math.max(10000, settings.areaWidth - 3000), y: 2000 + offset },
        { x: Math.max(10000, settings.areaWidth - 3000), y: Math.min(settings.areaHeight - 2000, 8000 + offset) },
        { x: 3000, y: Math.min(settings.areaHeight - 2000, 8000 + offset) },
      ],
      orientation: "landscape",
      tilt: 10,
      azimuth: 0,
      gap: 20,
      setback: 300,
      moduleWatts: 580,
      moduleWidth: 2278,
      moduleHeight: 1134,
      panels: [],
      visible: true,
    };
    const next = [...segments, newSeg];
    setSegments(next);
    setActiveSegmentId(newId);
    pushHistory(next, obstacles, walkways);
    saveDraft(next);
    setNotice(isId ? `Segmen baru (${newSeg.name}) berhasil ditambahkan.` : `New segment (${newSeg.name}) added.`);
  };

  const handleUpdateActiveSegment = (key: keyof FieldSegment, value: any) => {
    if (!activeSegment) return;
    const next = segments.map(s => s.id === activeSegment.id ? { ...s, [key]: value } : s);
    setSegments(next);
    saveDraft(next);
  };

  const segBounds = useMemo(() => {
    if (!activeSegment?.polygon || activeSegment.polygon.length < 3) return { x: 3000, y: 2000, w: 20000, h: 10000 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of activeSegment.polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return {
      x: minX,
      y: minY,
      w: Math.max(0, maxX - minX),
      h: Math.max(0, maxY - minY),
    };
  }, [activeSegment?.polygon]);

  const handleUpdateSegmentGeometry = (newXm: number, newYm: number, newWm: number, newHm: number) => {
    if (!activeSegment) return;
    const x = Math.round(newXm * 1000);
    const y = Math.round(newYm * 1000);
    const w = Math.max(0, Math.round(newWm * 1000));
    const h = Math.max(0, Math.round(newHm * 1000));
    const newPoly = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const next = segments.map(s => s.id === activeSegment.id ? { ...s, polygon: newPoly } : s);
    setSegments(next);
    saveDraft(next);
  };

  const handleDeleteSegment = (segId: string) => {
    if (segments.length <= 1) {
      setNotice(isId ? "Minimal harus ada 1 segmen field." : "At least one segment must exist.");
      return;
    }
    const next = segments.filter(s => s.id !== segId);
    setSegments(next);
    if (activeSegmentId === segId) {
      setActiveSegmentId(next[0]?.id || "");
    }
    pushHistory(next, obstacles, walkways);
    saveDraft(next);
    setNotice(isId ? "Segmen berhasil dihapus." : "Segment deleted.");
  };

  const handleToggleSegmentVisibility = (segId: string) => {
    const next = segments.map(s => s.id === segId ? { ...s, visible: !s.visible } : s);
    setSegments(next);
    saveDraft(next);
  };

  const handleGenerateSegmentPanels = (segId: string) => {
    const target = segments.find(s => s.id === segId);
    if (!target) return;
    const generated = generatePanelsForSegment(target, obstacles, walkways);
    const next = segments.map(s => s.id === segId ? { ...s, panels: generated } : s);
    setSegments(next);
    pushHistory(next, obstacles, walkways);
    saveDraft(next);
    setNotice(isId ? `⚡ ${generated.length} modul berhasil digenerate untuk ${target.name}.` : `⚡ ${generated.length} modules generated for ${target.name}.`);
  };

  const handleClearSegmentPanels = (segId: string) => {
    const target = segments.find(s => s.id === segId);
    if (!target) return;
    const next = segments.map(s => s.id === segId ? { ...s, panels: [] } : s);
    setSegments(next);
    pushHistory(next, obstacles, walkways);
    saveDraft(next);
    setNotice(isId ? `Panel pada ${target.name} telah dikosongkan.` : `Panels in ${target.name} cleared.`);
  };

  // Google Maps scanner callback
  const handleGoogleMapsApply = (data: {
    widthMm: number;
    heightMm: number;
    imageSrc: string;
    imageSpanM?: number;
    coordinates: { lat: number; lng: number };
    address: string;
    polygonPoints?: Array<{ lat: number; lng: number }>;
    polygonCornersMm?: Array<{ x: number; y: number }>;
    rotationDeg?: number;
    pitchDegrees?: number;
    azimuthDegrees?: number;
    googleSolarData?: any;
    segmentsData?: Array<{
      id: string;
      name: string;
      color: string;
      polygonCornersMm: Array<{ x: number; y: number }>;
      widthM: number;
      heightM: number;
      areaM2: number;
      rotationDeg: number;
    }>;
  }) => {
    const nextSettings = { ...settings, areaWidth: data.widthMm, areaHeight: data.heightMm };
    const nextSite: Site = {
      coordinates: data.coordinates,
      address: data.address,
      polygonPoints: data.polygonPoints,
      polygonCorners: data.polygonCornersMm,
      rotationDeg: data.rotationDeg || 0,
      imageSpanM: data.imageSpanM,
      pitchDegrees: data.pitchDegrees,
      azimuthDegrees: data.azimuthDegrees,
      googleSolarData: data.googleSolarData,
      boxes: (data as any).boxes,
      cropPaddingM: (data as any).cropPaddingM,
      imageCenterMm: (data as any).imageCenterMm,
    };
    setSettings(nextSettings);
    setSite(nextSite);
    if (data.imageSrc) {
      setBackgroundImage(data.imageSrc);
    }

    let nextSegments = segments;
    if (data.segmentsData && data.segmentsData.length > 0) {
      nextSegments = data.segmentsData.map(sd => ({
        id: sd.id,
        name: sd.name,
        color: sd.color,
        polygon: sd.polygonCornersMm,
        orientation: "landscape",
        tilt: 10,
        azimuth: 0,
        gap: 20,
        setback: 300,
        moduleWatts: 580,
        moduleWidth: 2278,
        moduleHeight: 1134,
        panels: [],
        visible: true,
      }));
      setSegments(nextSegments);
      setActiveSegmentId(nextSegments[0]?.id || "");
    }

    pushHistory(nextSegments, obstacles, walkways);
    saveDraft(nextSegments, obstacles, walkways, nextSite, data.imageSrc);
    setNotice(isId ? `Peta satelit Google & ${nextSegments.length} box atap (90° presisi) berhasil diterapkan!` : `Applied satellite map with ${nextSegments.length} 90° roof boxes!`);
  };

  // Keyboard listeners (Space to pan, Ctrl+Z, Ctrl+Y, Ctrl+A, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "SELECT" || activeEl.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSave();
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        isSpacePressedRef.current = true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(allPanels.map(p => p.id)));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedKeepout) {
          e.preventDefault();
          if (selectedKeepout.kind === "walkway") {
            const nextWalkways = deleteWalkway(walkways, String(selectedKeepout.id));
            setWalkways(nextWalkways);
            pushHistory(segments, obstacles, nextWalkways);
            saveDraft(segments, obstacles, nextWalkways);
          } else {
            const nextObstacles = deleteObstacle(obstacles, Number(selectedKeepout.id));
            setObstacles(nextObstacles);
            pushHistory(segments, nextObstacles, walkways);
            saveDraft(segments, nextObstacles, walkways);
          }
          setSelectedKeepout(null);
          return;
        }
        if (selectedIds.size > 0) {
          e.preventDefault();
          const next = segments.map(s => ({
            ...s,
            panels: s.panels.filter(p => !selectedIds.has(p.id))
          }));
          setSegments(next);
          setSelectedIds(new Set());
          pushHistory(next, obstacles, walkways);
          saveDraft(next);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") isSpacePressedRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [segments, obstacles, walkways, selectedIds, selectedKeepout, historyIndex, history]);

  // Export CAD DXF
  const handleExportDxf = () => {
    let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    // Site boundary
    dxf += `0\nPOLYLINE\n8\nSITE_BOUNDARY\n66\n1\n70\n1\n`;
    const corners = site?.polygonCorners || [
      { x: 0, y: 0 }, { x: settings.areaWidth, y: 0 }, { x: settings.areaWidth, y: settings.areaHeight }, { x: 0, y: settings.areaHeight }
    ];
    corners.forEach(c => {
      dxf += `0\nVERTEX\n8\nSITE_BOUNDARY\n10\n${c.x}\n20\n${c.y}\n30\n0.0\n`;
    });
    dxf += "0\nSEQEND\n";

    // Panels
    allPanels.forEach(p => {
      dxf += `0\nPOLYLINE\n8\nPV_PANELS\n66\n1\n70\n1\n`;
      const pts = [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }];
      pts.forEach(pt => {
        dxf += `0\nVERTEX\n8\nPV_PANELS\n10\n${pt.x}\n20\n${pt.y}\n30\n0.0\n`;
      });
      dxf += "0\nSEQEND\n";
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SolarApp-2D-Layout-${projectId || "CAD"}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(isId ? "File DXF (AutoCAD) berhasil diunduh!" : "DXF file downloaded!");
  };

  // Export CSV BoQ
  const handleExportCsv = () => {
    let csv = "Segment,Modul ID,X (mm),Y (mm),Lebar (mm),Panjang (mm),Watt (Wp)\n";
    segments.forEach(seg => {
      seg.panels.forEach(p => {
        csv += `"${seg.name}",${p.id},${p.x},${p.y},${p.w},${p.h},${seg.moduleWatts}\n`;
      });
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SolarApp-BoQ-Modules-${projectId || "Layout"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(isId ? "Daftar modul CSV BoQ berhasil diunduh!" : "Module CSV BoQ downloaded!");
  };

  // Canvas Geometry calculations
  const viewBoxW = 1000;
  const viewBoxH = 600;
  const siteW = settings.areaWidth || 65000;
  const siteH = settings.areaHeight || 34000;
  const scale = useMemo(() => {
    return Math.min((viewBoxW * 0.88) / siteW, (viewBoxH * 0.82) / siteH);
  }, [siteW, siteH]);

  const originX = (viewBoxW - siteW * scale) / 2;
  const originY = (viewBoxH - siteH * scale) / 2;

  // Background image upload
  const handleBackgroundUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target?.result as string;
      setBackgroundImage(src);
      saveDraft(segments, obstacles, walkways, site, src);
      setNotice(isId ? "Citra latar satelit berhasil diunggah." : "Satellite background uploaded.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="pv-studio-wrap">
      {/* ─── TOP APP BAR / HEADER & STATS ─── */}
      <div className="pv-studio-topbar">
        <div className="pv-studio-title-area">
          <div className="pv-studio-tag">
            <span className="dot" />
            <span>PV LAYOUT 2D STUDIO</span>
          </div>
          <h1 className="pv-studio-project-name">
            {projectName ? `Project: ${projectName}` : "Project: Mas Silueta Indonesia"}
          </h1>
        </div>

        {/* 4 Key Stat Badges */}
        <div className="pv-studio-kpis">
          <div className="pv-kpi-badge">
            <div className="icon-wrap"><Grid2X2 size={16} /></div>
            <div className="kpi-info">
              <span className="kpi-label">Total Modul</span>
              <strong className="kpi-val">{totalModul} modul</strong>
            </div>
          </div>

          <div className="pv-kpi-badge">
            <div className="icon-wrap"><Zap size={16} /></div>
            <div className="kpi-info">
              <span className="kpi-label">Kapasitas DC</span>
              <strong className="kpi-val" style={{ color: "var(--green, #b8f36b)" }}>
                {totalCapacityKwp.toFixed(2)} kWp
              </strong>
            </div>
          </div>

          <div className="pv-kpi-badge">
            <div className="icon-wrap"><Maximize2 size={16} /></div>
            <div className="kpi-info">
              <span className="kpi-label">Luas Modul</span>
              <strong className="kpi-val" style={{ color: "#38bdf8" }}>
                {totalModuleArea.toFixed(2)} m²
              </strong>
            </div>
          </div>

          <div className="pv-kpi-badge">
            <div className="icon-wrap"><Activity size={16} /></div>
            <div className="kpi-info">
              <span className="kpi-label">Utilisasi Area</span>
              <strong className="kpi-val" style={{ color: areaUtilizationPct > 70 ? "#10b981" : "#f59e0b" }}>
                {areaUtilizationPct.toFixed(1)} %
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 5-STEP WORKFLOW RIBBON ─── */}
      <nav className="pv-step-ribbon">
        <button
          type="button"
          className={`pv-step-btn ${activeStep === 1 ? "is-active" : ""}`}
          onClick={() => {
            setActiveStep(1);
            setIsMapsModalOpen(true);
          }}
        >
          <span className="pv-step-num">1</span>
          <MapPin size={14} />
          <span>Site (GIS)</span>
        </button>

        <button
          type="button"
          className={`pv-step-btn ${activeStep === 2 ? "is-active" : ""}`}
          onClick={() => setActiveStep(2)}
        >
          <span className="pv-step-num">2</span>
          <Grid2X2 size={14} />
          <span>Mechanical</span>
        </button>

        <button
          type="button"
          className={`pv-step-btn ${activeStep === 3 ? "is-active" : ""}`}
          onClick={() => {
            setActiveStep(3);
            setToolMode("keepout");
            setNotice(isId ? "Mode Rintangan / Keepout aktif. Klik kanvas untuk menandai rintangan." : "Keepout mode active.");
          }}
        >
          <span className="pv-step-num">3</span>
          <Ban size={14} />
          <span>Keepouts</span>
        </button>

        <button
          type="button"
          className={`pv-step-btn ${activeStep === 4 ? "is-active" : ""}`}
          onClick={() => {
            setActiveStep(4);
            setNotice(isId ? "Electrical Stringing: 16-18 modul/string terkonfigurasi otomatis." : "Electrical stringing view.");
          }}
        >
          <span className="pv-step-num">4</span>
          <Share2 size={14} />
          <span>Electrical</span>
        </button>

        <button
          type="button"
          className={`pv-step-btn ${activeStep === 5 ? "is-active" : ""}`}
          onClick={() => {
            setActiveStep(5);
            setNotice(isId ? "Pengaturan Lanjutan: Koefisien Shading, Derating, & LCOE." : "Advanced settings.");
          }}
        >
          <span className="pv-step-num">5</span>
          <Sliders size={14} />
          <span>Advanced</span>
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {isSyncing ? (
            <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5 }}>
              <RotateCw size={12} className="animate-spin" />
              Sinkronisasi Cloud...
            </span>
          ) : cloudSynced ? (
            <span
              style={{
                fontSize: 10,
                color: "#6ee7b7",
                background: "#064e3b44",
                border: "1px solid #05966955",
                padding: "3px 8px",
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontWeight: 700,
              }}
              title="Tersinkronisasi dengan Cloud Server Sonus (Semua anggota tim dapat melihat hasil ini)"
            >
              <Globe size={11} />
              Cloud Synced
            </span>
          ) : null}
          {lastSavedTime && (
            <span style={{ fontSize: 11, color: "var(--green, #b8f36b)", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
              <Check size={13} />
              Tersimpan {lastSavedTime}
            </span>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={handleManualSave}
            disabled={isSaving}
            style={{
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 800,
              background: "var(--green, #b8f36b)",
              color: "#09140c",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 6,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(184, 243, 107, 0.25)",
            }}
            title="Simpan desain ke Cloud Server Sonus & Komputer (Ctrl+S)"
          >
            <Save size={13} />
            {isSaving ? "Menyimpan..." : "Simpan Desain"}
          </button>
        </div>
      </nav>

      {/* ─── 3-COLUMN STUDIO WORKSPACE ─── */}
      <div className="pv-studio-grid">
        {/* ════ LEFT COLUMN: MULTI-SEGMENT & MODULE MANAGER ════ */}
        <aside className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {activeStep === 3 ? (
            <KeepoutsPanel
              walkways={walkways}
              obstacles={obstacles}
              selected={selectedKeepout}
              toolMode={toolMode}
              onTool={(tool: KeepoutTool) => setToolMode(tool)}
              onFocus={focusKeepout}
              onToggleVisibility={toggleKeepoutVisibility}
              onDelete={deleteKeepout}
              onUpdate={patchKeepout}
              onCommit={commitKeepoutEdit}
            />
          ) : (
          <>
          {/* Top Tab Bar: [ Field Segment ] [ PV Module ] */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "#0b120d", padding: 3, borderRadius: 8, border: "1px solid #1a2a1f" }}>
            <button
              type="button"
              style={{
                background: activeLeftTab === "segment" ? "var(--green, #b8f36b)" : "transparent",
                color: activeLeftTab === "segment" ? "#0a130c" : "#8da092",
                fontWeight: activeLeftTab === "segment" ? 800 : 600,
                border: "none",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 11.5,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => setActiveLeftTab("segment")}
            >
              Field Segment
            </button>
            <button
              type="button"
              style={{
                background: activeLeftTab === "module" ? "var(--green, #b8f36b)" : "transparent",
                color: activeLeftTab === "module" ? "#0a130c" : "#8da092",
                fontWeight: activeLeftTab === "module" ? 800 : 600,
                border: "none",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 11.5,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => setActiveLeftTab("module")}
            >
              PV Module
            </button>
          </div>

          {activeLeftTab === "segment" ? (
            <>
              {/* Field Segments List Header & Add Button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#edf5ef" }}>
                  Field Segments ({segments.length})
                </span>
                <button
                  type="button"
                  style={{
                    background: "rgba(184, 243, 107, 0.15)",
                    border: "1px solid var(--green, #b8f36b)",
                    color: "var(--green, #b8f36b)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={handleAddSegment}
                >
                  <Plus size={13} /> Add Segment
                </button>
              </div>

              {/* Segment Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>
                {segments.map(seg => {
                  const isActive = seg.id === activeSegment?.id;
                  const kwp = ((seg.panels.length * (seg.moduleWatts || 580)) / 1000).toFixed(2);
                  return (
                    <div
                      key={seg.id}
                      className={`pv-segment-card ${isActive ? "is-active" : ""}`}
                      onClick={() => setActiveSegmentId(seg.id)}
                    >
                      <div className="pv-segment-info">
                        <div className="pv-segment-color-tag" style={{ background: seg.color }} />
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#edf5ef" }}>{seg.name}</div>
                          <div style={{ fontSize: 10, color: "#8ca293", marginTop: 2 }}>
                            {seg.panels.length} modul · {kwp} kWp
                          </div>
                        </div>
                      </div>

                      <div className="pv-segment-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="pv-icon-btn"
                          title={seg.visible ? "Sembunyikan Segmen" : "Tampilkan Segmen"}
                          onClick={() => handleToggleSegmentVisibility(seg.id)}
                        >
                          {seg.visible ? <Eye size={13} /> : <EyeOff size={13} style={{ color: "#ef4444" }} />}
                        </button>
                        <button
                          type="button"
                          className="pv-icon-btn"
                          title="Hapus Segmen"
                          onClick={() => handleDeleteSegment(seg.id)}
                        >
                          <Trash2 size={13} style={{ color: "#f87171" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Segment Parameters */}
              {activeSegment && (
                <div style={{ background: "#0e1611", border: "1.5px solid #233728", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--green, #b8f36b)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Pengaturan Segment ({activeSegment.name})</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeSegment.color }} />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 4 }}>Nama Segment</label>
                    <input
                      type="text"
                      value={activeSegment.name}
                      onChange={e => handleUpdateActiveSegment("name", e.target.value)}
                      style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "6px 9px", color: "#edf5ef", fontSize: 11 }}
                    />
                  </div>

                  {/* Orientation Toggle: Portrait vs Landscape */}
                  <div>
                    <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 4 }}>Orientasi Modul</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <button
                        type="button"
                        style={{
                          background: activeSegment.orientation === "portrait" ? "var(--green, #b8f36b)" : "#131f16",
                          color: activeSegment.orientation === "portrait" ? "#071109" : "#8ea394",
                          fontWeight: 700,
                          border: "1px solid #2a4531",
                          borderRadius: 6,
                          padding: "6px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                        onClick={() => handleUpdateActiveSegment("orientation", "portrait")}
                      >
                        Portrait
                      </button>
                      <button
                        type="button"
                        style={{
                          background: activeSegment.orientation === "landscape" ? "var(--green, #b8f36b)" : "#131f16",
                          color: activeSegment.orientation === "landscape" ? "#071109" : "#8ea394",
                          fontWeight: 700,
                          border: "1px solid #2a4531",
                          borderRadius: 6,
                          padding: "6px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                        onClick={() => handleUpdateActiveSegment("orientation", "landscape")}
                      >
                        Landscape
                      </button>
                    </div>
                  </div>

                  {/* Tilt & Azimuth */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Tilt (°)</label>
                      <input
                        type="number"
                        value={activeSegment.tilt}
                        onChange={e => handleUpdateActiveSegment("tilt", Number(e.target.value))}
                        style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Azimuth (°)</label>
                      <input
                        type="number"
                        value={activeSegment.azimuth}
                        onChange={e => handleUpdateActiveSegment("azimuth", Number(e.target.value))}
                        style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                      />
                    </div>
                  </div>

                  {/* Spacing & Setback */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Jarak antar modul (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={(activeSegment.gap / 1000).toFixed(2)}
                        onChange={e => handleUpdateActiveSegment("gap", Math.round(Number(e.target.value) * 1000))}
                        style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Setback tepi (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={(activeSegment.setback / 1000).toFixed(2)}
                        onChange={e => handleUpdateActiveSegment("setback", Math.round(Number(e.target.value) * 1000))}
                        style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                      />
                    </div>
                  </div>

                  {/* Dimensi & Posisi Box Area Segmen (m) */}
                  <div style={{ borderTop: "1px solid #1f3325", paddingTop: 8, marginTop: 2 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green, #b8f36b)", marginBottom: 6 }}>
                      Dimensi & Posisi Box Area (m)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                      <div>
                        <label style={{ fontSize: 9.5, color: "#8aa092", display: "block", marginBottom: 2 }}>Panjang / X (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={(segBounds.w / 1000).toFixed(1)}
                          onChange={e => handleUpdateSegmentGeometry(segBounds.x / 1000, segBounds.y / 1000, Number(e.target.value), segBounds.h / 1000)}
                          style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "4px 7px", color: "#edf5ef", fontSize: 11 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 9.5, color: "#8aa092", display: "block", marginBottom: 2 }}>Lebar / Y (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={(segBounds.h / 1000).toFixed(1)}
                          onChange={e => handleUpdateSegmentGeometry(segBounds.x / 1000, segBounds.y / 1000, segBounds.w / 1000, Number(e.target.value))}
                          style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "4px 7px", color: "#edf5ef", fontSize: 11 }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 9.5, color: "#8aa092", display: "block", marginBottom: 2 }}>Posisi X (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(segBounds.x / 1000).toFixed(1)}
                          onChange={e => handleUpdateSegmentGeometry(Number(e.target.value), segBounds.y / 1000, segBounds.w / 1000, segBounds.h / 1000)}
                          style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "4px 7px", color: "#edf5ef", fontSize: 11 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 9.5, color: "#8aa092", display: "block", marginBottom: 2 }}>Posisi Y (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={(segBounds.y / 1000).toFixed(1)}
                          onChange={e => handleUpdateSegmentGeometry(segBounds.x / 1000, Number(e.target.value), segBounds.w / 1000, segBounds.h / 1000)}
                          style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "4px 7px", color: "#edf5ef", fontSize: 11 }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      style={{
                        background: "var(--green, #b8f36b)",
                        color: "#0a150d",
                        border: "none",
                        borderRadius: 7,
                        padding: "9px 12px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        boxShadow: "0 2px 10px rgba(184, 243, 107, 0.3)",
                      }}
                      onClick={() => handleGenerateSegmentPanels(activeSegment.id)}
                    >
                      <Zap size={14} /> Generate Panel ({activeSegment.name})
                    </button>

                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        color: "#f87171",
                        border: "1px solid #4a2222",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                      onClick={() => handleClearSegmentPanels(activeSegment.id)}
                    >
                      <Trash2 size={13} /> Hapus Panel Segment
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Tab 2: PV Module Specifications */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#edf5ef" }}>Katalog Modul Surya</span>
                <span className="pv-badge" style={{ background: "#152a1c", color: "#b8f36b", fontSize: 10 }}>.PAN Verified</span>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 4 }}>Pilih Model Presets</label>
                <select
                  style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "7px 9px", color: "#edf5ef", fontSize: 11 }}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "longi-620") {
                      handleUpdateActiveSegment("moduleWidth", 2382);
                      handleUpdateActiveSegment("moduleHeight", 1134);
                      handleUpdateActiveSegment("moduleWatts", 620);
                    } else if (val === "longi-580") {
                      handleUpdateActiveSegment("moduleWidth", 2278);
                      handleUpdateActiveSegment("moduleHeight", 1134);
                      handleUpdateActiveSegment("moduleWatts", 580);
                    } else if (val === "jinko-620") {
                      handleUpdateActiveSegment("moduleWidth", 2382);
                      handleUpdateActiveSegment("moduleHeight", 1134);
                      handleUpdateActiveSegment("moduleWatts", 620);
                    } else if (val === "trina-660") {
                      handleUpdateActiveSegment("moduleWidth", 2384);
                      handleUpdateActiveSegment("moduleHeight", 1303);
                      handleUpdateActiveSegment("moduleWatts", 660);
                    } else if (val === "canadian-600") {
                      handleUpdateActiveSegment("moduleWidth", 2278);
                      handleUpdateActiveSegment("moduleHeight", 1134);
                      handleUpdateActiveSegment("moduleWatts", 600);
                    } else if (val === "ja-585") {
                      handleUpdateActiveSegment("moduleWidth", 2278);
                      handleUpdateActiveSegment("moduleHeight", 1134);
                      handleUpdateActiveSegment("moduleWatts", 585);
                    }
                  }}
                >
                  <option value="longi-620">⭐ Longi LR8-66HGD-620 Wp (620W · 2382×1134 mm) — Standar Mas Silueta 744 kWp</option>
                  <option value="longi-580">LONGi Hi-MO 6 Explorer (580W · 2278×1134 mm)</option>
                  <option value="jinko-620">Jinko Tiger Neo N-Type (620W · 2382×1134 mm)</option>
                  <option value="trina-660">Trina Solar Vertex Ultra (660W · 2384×1303 mm)</option>
                  <option value="canadian-600">Canadian Solar TOPHiKu6 (600W · 2278×1134 mm)</option>
                  <option value="ja-585">JA Solar DeepBlue 4.0 Pro (585W · 2278×1134 mm)</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Panjang (mm)</label>
                  <input
                    type="number"
                    value={activeSegment?.moduleWidth || 2382}
                    onChange={e => handleUpdateActiveSegment("moduleWidth", Number(e.target.value))}
                    style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Lebar (mm)</label>
                  <input
                    type="number"
                    value={activeSegment?.moduleHeight || 1134}
                    onChange={e => handleUpdateActiveSegment("moduleHeight", Number(e.target.value))}
                    style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, color: "#8aa092", display: "block", marginBottom: 3 }}>Daya Nominal (Wp)</label>
                <input
                  type="number"
                  value={activeSegment?.moduleWatts || 620}
                  onChange={e => handleUpdateActiveSegment("moduleWatts", Number(e.target.value))}
                  style={{ width: "100%", background: "#080d09", border: "1px solid #1f3325", borderRadius: 6, padding: "5px 8px", color: "#edf5ef", fontSize: 11 }}
                />
              </div>

              {/* Apply to All Segments Button */}
              <button
                type="button"
                className="secondary-button"
                style={{ width: "100%", fontSize: 11, padding: "8px 10px", background: "#132719", border: "1px solid #23472d", color: "#b8f36b", fontWeight: 700, borderRadius: 6 }}
                onClick={() => {
                  const targetW = activeSegment?.moduleWidth || 2382;
                  const targetH = activeSegment?.moduleHeight || 1134;
                  const targetWatts = activeSegment?.moduleWatts || 620;
                  setSegments(prev => prev.map(s => ({
                    ...s,
                    moduleWidth: targetW,
                    moduleHeight: targetH,
                    moduleWatts: targetWatts,
                  })));
                  setNotice(isId ? `✅ Modul ${targetWatts} Wp diterapkan ke semua ${segments.length} segmen!` : `✅ Module ${targetWatts} Wp applied to all ${segments.length} segments!`);
                  setTimeout(() => setNotice(""), 4000);
                }}
              >
                🚀 Terapkan Spesifikasi ke Semua Segmen ({segments.length})
              </button>

              <div style={{ background: "#111a14", border: "1px solid #1f3024", borderRadius: 6, padding: "10px", fontSize: 11, color: "#8ca093", lineHeight: 1.4 }}>
                💡 Menggunakan modul <strong>Longi 620 Wp</strong> (2.382 × 1.134 mm) sesuai laporan resmi PVSyst & Helio untuk Mas Silueta (1.200 unit = 744 kWp).
              </div>
            </div>
          )}
          </>
          )}
        </aside>

        {/* ════ CENTER COLUMN: CANVAS & TOOLBAR ════ */}
        <div className="panel pv-canvas-panel" style={{ display: "flex", flexDirection: "column" }}>
          {/* Top Canvas Toolbar */}
          <div className="pv-canvas-toolbar" style={{ flexWrap: "wrap", padding: "8px 12px", background: "#0a110c", borderBottom: "1.5px solid #1d2e22" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              {/* Tool Mode Buttons */}
              <div style={{ display: "flex", background: "#111a14", padding: 2, borderRadius: 6, border: "1px solid #233527" }}>
                <button
                  type="button"
                  title="Pointer / Seleksi & Geser"
                  onClick={() => setToolMode("select")}
                  style={{
                    background: toolMode === "select" ? "var(--green, #b8f36b)" : "transparent",
                    color: toolMode === "select" ? "#0b140e" : "#8da294",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <MousePointer2 size={14} />
                </button>

                <button
                  type="button"
                  title="Poligon Segmen (Bentuk Bebas)"
                  onClick={() => setToolMode("polygon")}
                  style={{
                    background: toolMode === "polygon" ? "var(--green, #b8f36b)" : "transparent",
                    color: toolMode === "polygon" ? "#0b140e" : "#8da294",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <Square size={14} style={{ transform: "rotate(45deg)" }} />
                </button>

                <button
                  type="button"
                  title="Kotak Segmen (Rectangle Atap)"
                  onClick={() => setToolMode("rectangle")}
                  style={{
                    background: toolMode === "rectangle" ? "var(--green, #b8f36b)" : "transparent",
                    color: toolMode === "rectangle" ? "#0b140e" : "#8da294",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <Square size={14} />
                </button>

                <button
                  type="button"
                  title="Keepout / Rintangan (Skylight, Chiller)"
                  onClick={() => setToolMode("keepout")}
                  style={{
                    background: toolMode === "keepout" ? "#ef4444" : "transparent",
                    color: toolMode === "keepout" ? "#ffffff" : "#8da294",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <Ban size={14} />
                </button>

                <button
                  type="button"
                  title="Walkway (Jalur Inspeksi / Damkar)"
                  onClick={() => {
                    setToolMode("walkway");
                    setActiveStep(3);
                    setNotice(isId ? "Mode Walkway aktif. Seret kotak di kanvas untuk menggambar jalur." : "Walkway mode active. Drag a box on the canvas.");
                  }}
                  style={{
                    background: toolMode === "walkway" ? "#ea580c" : "transparent",
                    color: toolMode === "walkway" ? "#ffffff" : "#8da294",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <Table size={14} />
                </button>

                <button
                  type="button"
                  title="Auto-Populate / Generate Semua Segmen"
                  onClick={() => {
                    const next = segments.map(seg => ({
                      ...seg,
                      panels: generatePanelsForSegment(seg, obstacles, walkways),
                    }));
                    setSegments(next);
                    pushHistory(next, obstacles, walkways);
                    saveDraft(next);
                    setNotice("⚡ Seluruh segmen berhasil di-generate secara otomatis!");
                  }}
                  style={{
                    background: "transparent",
                    color: "var(--green, #b8f36b)",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <WandSparkles size={14} />
                </button>
              </div>

              {/* Zoom Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#111a14", padding: "2px 4px", borderRadius: 6, border: "1px solid #233527" }}>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(0.4, Number((prev - 0.15).toFixed(2))))}
                  style={{ background: "transparent", border: "none", color: "#a5b8ad", padding: 3, cursor: "pointer" }}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "#edf5ef", minWidth: 38, textAlign: "center" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(3.5, Number((prev + 0.15).toFixed(2))))}
                  style={{ background: "transparent", border: "none", color: "#a5b8ad", padding: 3, cursor: "pointer" }}
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  style={{ background: "transparent", border: "none", color: "#8da294", padding: 3, cursor: "pointer", borderLeft: "1px solid #233527", marginLeft: 2 }}
                  title="Fit to Screen"
                >
                  <Maximize2 size={12} />
                </button>
              </div>

              {/* Undo / Redo */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, borderLeft: "1px solid #233527", paddingLeft: 6 }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  style={{ background: "transparent", border: "none", color: historyIndex > 0 ? "#edf5ef" : "#445548", cursor: historyIndex > 0 ? "pointer" : "default", padding: 3 }}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  style={{ background: "transparent", border: "none", color: historyIndex < history.length - 1 ? "#edf5ef" : "#445548", cursor: historyIndex < history.length - 1 ? "pointer" : "default", padding: 3 }}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={13} />
                </button>
              </div>
            </div>

            {/* GPS Coordinates Pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "#142419",
                border: "1px solid #2b4733",
                padding: "3px 9px",
                borderRadius: 20,
                fontSize: 10,
                color: "var(--green, #b8f36b)",
                fontFamily: "monospace",
                fontWeight: 700,
              }}>
                <MapPin size={11} />
                <span>Koordinat ({site?.coordinates.lat.toFixed(4)}, {site?.coordinates.lng.toFixed(4)})</span>
              </div>
            </div>
          </div>

          {/* SVG Canvas Viewport */}
          <div
            className="pv-canvas-wrap"
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              minHeight: 480,
              background: "#080e0a",
              cursor: toolMode === "pan" ? "grab" : "default",
            }}
            onPointerDown={e => {
              if (toolMode === "pan" || isSpacePressedRef.current || e.button === 1) {
                isPanningRef.current = true;
                panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              } else if (toolMode === "keepout" || toolMode === "walkway") {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  const mouseSvgX = (e.clientX - rect.left - pan.x) / zoom;
                  const mouseSvgY = (e.clientY - rect.top - pan.y) / zoom;
                  const metricX = Math.round((mouseSvgX - originX) / scale);
                  const metricY = Math.round((mouseSvgY - originY) / scale);
                  setDrawingRect({ startX: metricX, startY: metricY, currentX: metricX, currentY: metricY });
                  setDrawingKind(toolMode);
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                }
              } else if (toolMode === "rectangle" || toolMode === "polygon") {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  const mouseSvgX = (e.clientX - rect.left - pan.x) / zoom;
                  const mouseSvgY = (e.clientY - rect.top - pan.y) / zoom;
                  const metricX = Math.round((mouseSvgX - originX) / scale);
                  const metricY = Math.round((mouseSvgY - originY) / scale);
                  setDrawingRect({ startX: metricX, startY: metricY, currentX: metricX, currentY: metricY });
                  setDrawingKind("segment");
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                }
              } else if (toolMode === "select") {
                setSelectedKeepout(null);
              }
            }}
            onPointerMove={e => {
              if (isPanningRef.current) {
                setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
              } else if (drawingRect) {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  const mouseSvgX = (e.clientX - rect.left - pan.x) / zoom;
                  const mouseSvgY = (e.clientY - rect.top - pan.y) / zoom;
                  const metricX = Math.round((mouseSvgX - originX) / scale);
                  const metricY = Math.round((mouseSvgY - originY) / scale);
                  setDrawingRect(prev => prev ? { ...prev, currentX: metricX, currentY: metricY } : null);
                }
              } else if (draggingKeepout && keepoutDragStartRef.current) {
                const dx = (e.clientX - keepoutDragStartRef.current.mouseX) / (scale * zoom);
                const dy = (e.clientY - keepoutDragStartRef.current.mouseY) / (scale * zoom);
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) keepoutDragStartRef.current.moved = true;
                const nextRect = {
                  x: Math.round(keepoutDragStartRef.current.initial.x + dx),
                  y: Math.round(keepoutDragStartRef.current.initial.y + dy),
                };
                if (draggingKeepout.kind === "walkway") {
                  setWalkways(prev => updateWalkwayRect(prev, String(draggingKeepout.id), nextRect));
                } else {
                  setObstacles(prev => updateObstacleRect(prev, Number(draggingKeepout.id), nextRect));
                }
              } else if (draggingSegmentId) {
                const dx = (e.clientX - dragSegmentStartRef.current.mouseX) / (scale * zoom);
                const dy = (e.clientY - dragSegmentStartRef.current.mouseY) / (scale * zoom);
                const updatedPoly = dragSegmentStartRef.current.initialPoly.map(p => ({
                  x: Math.round(p.x + dx),
                  y: Math.round(p.y + dy),
                }));
                setSegments(prev => prev.map(s => s.id === draggingSegmentId ? { ...s, polygon: updatedPoly } : s));
              } else if (draggingCorner) {
                const dx = (e.clientX - dragCornerStartRef.current.mouseX) / (scale * zoom);
                const dy = (e.clientY - dragCornerStartRef.current.mouseY) / (scale * zoom);
                setSegments(prev => prev.map(s => {
                  if (s.id !== draggingCorner.segId) return s;
                  const newPoly = [...s.polygon];
                  newPoly[draggingCorner.cornerIndex] = {
                    x: Math.round(dragCornerStartRef.current.initialPt.x + dx),
                    y: Math.round(dragCornerStartRef.current.initialPt.y + dy),
                  };
                  return { ...s, polygon: newPoly };
                }));
              }
            }}
            onPointerUp={e => {
              if (drawingRect) {
                const x1 = Math.min(drawingRect.startX, drawingRect.currentX);
                const y1 = Math.min(drawingRect.startY, drawingRect.currentY);
                const w = Math.abs(drawingRect.currentX - drawingRect.startX);
                const h = Math.abs(drawingRect.currentY - drawingRect.startY);
                const kind = drawingKind;
                setDrawingRect(null);
                setDrawingKind(null);
                if (kind === "keepout" || kind === "walkway") {
                  if (isValidRect({ x: x1, y: y1, w, h }) && w > 200 && h > 200) {
                    createKeepoutFromRect(kind, x1, y1, w, h);
                  }
                } else if (w > 2000 && h > 2000) {
                  const letter = String.fromCharCode(65 + segments.length);
                  const color = SEGMENT_PALETTE[segments.length % SEGMENT_PALETTE.length];
                  const newId = `seg-${Date.now()}`;
                  const newSeg: FieldSegment = {
                    id: newId,
                    name: `Segment ${letter}`,
                    color,
                    polygon: [
                      { x: x1, y: y1 },
                      { x: x1 + w, y: y1 },
                      { x: x1 + w, y: y1 + h },
                      { x: x1, y: y1 + h },
                    ],
                    orientation: "landscape",
                    tilt: 10,
                    azimuth: 0,
                    gap: 20,
                    setback: 300,
                    moduleWatts: 580,
                    moduleWidth: 2278,
                    moduleHeight: 1134,
                    panels: [],
                    visible: true,
                  };
                  const next = [...segments, newSeg];
                  setSegments(next);
                  setActiveSegmentId(newId);
                  pushHistory(next, obstacles, walkways);
                  saveDraft(next);
                  setNotice(isId ? `Segmen baru (${newSeg.name}) berhasil digambar.` : `New segment (${newSeg.name}) created.`);
                  setToolMode("select");
                }
              }
              if (draggingKeepout) {
                const start = keepoutDragStartRef.current;
                if (start?.moved) {
                  // Recompute the final rectangle from the pointer-up coordinates and commit against
                  // the live refs, so the last pointer-move render cannot leave stale geometry saved.
                  const dx = (e.clientX - start.mouseX) / (scale * zoom);
                  const dy = (e.clientY - start.mouseY) / (scale * zoom);
                  const finalRect = {
                    x: Math.round(start.initial.x + dx),
                    y: Math.round(start.initial.y + dy),
                  };
                  const liveWalkways = start.ref.kind === "walkway"
                    ? updateWalkwayRect(walkwaysRef.current, String(start.ref.id), finalRect)
                    : walkwaysRef.current;
                  const liveObstacles = start.ref.kind === "obstacle"
                    ? updateObstacleRect(obstaclesRef.current, Number(start.ref.id), finalRect)
                    : obstaclesRef.current;
                  if (start.ref.kind === "walkway") setWalkways(liveWalkways);
                  else setObstacles(liveObstacles);
                  pushHistory(segments, liveObstacles, liveWalkways);
                  saveDraft(segments, liveObstacles, liveWalkways);
                }
                setDraggingKeepout(null);
                keepoutDragStartRef.current = null;
              }
              if (draggingSegmentId || draggingCorner) {
                setDraggingSegmentId(null);
                setDraggingCorner(null);
                saveDraft(segments, obstacles, walkways);
                pushHistory(segments, obstacles, walkways);
              }
              isPanningRef.current = false;
              try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            }}
            onWheel={e => {
              if (e.shiftKey) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                setZoom(prev => Math.min(3.5, Math.max(0.4, Number((prev + delta).toFixed(2)))));
              }
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
              style={{ width: "100%", height: "100%", display: "block" }}
            >
              <defs>
                <clipPath id="site-boundary-clip">
                  <rect
                    x={originX}
                    y={originY}
                    width={siteW * scale}
                    height={siteH * scale}
                    rx="4"
                  />
                </clipPath>
              </defs>
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} transform-origin="center">
                {/* 1. Cropped Satellite Map Background (Rotated to align roof horizontally) */}
                {layers.satellite && backgroundImage && (() => {
                  const rotDeg = site?.rotationDeg || 0;
                  const centerX = site?.imageCenterMm ? originX + site.imageCenterMm.x * scale : originX + (siteW * scale) / 2;
                  const centerY = site?.imageCenterMm ? originY + site.imageCenterMm.y * scale : originY + (siteH * scale) / 2;
                  const spanM = site?.imageSpanM || (Math.hypot(siteW, siteH) / 1000);
                  const imgPixelSize = spanM * 1000 * scale;

                  // Normalize angle to [-180, 180]: e.g. 334° becomes -26° (counter-clockwise up to level)
                  const normalizedAngle = ((rotDeg % 360) + 360) % 360;
                  const svgRotateAngle = normalizedAngle > 180 ? normalizedAngle - 360 : normalizedAngle;

                  return (
                    <g clipPath="url(#site-boundary-clip)">
                      <g transform={`rotate(${svgRotateAngle}, ${centerX}, ${centerY})`}>
                        <image
                          href={backgroundImage}
                          x={centerX - imgPixelSize / 2}
                          y={centerY - imgPixelSize / 2}
                          width={imgPixelSize}
                          height={imgPixelSize}
                          preserveAspectRatio="xMidYMid meet"
                          opacity={backgroundOpacity}
                          pointerEvents="none"
                        />
                      </g>
                    </g>
                  );
                })()}

                {/* 1b. Image overlays (manual placement, additive to the satellite background) */}
                {overlays.filter(o => o.visible).map(o => (
                  <image
                    key={o.id}
                    href={o.dataUrl}
                    x={originX + o.x * scale}
                    y={originY + o.y * scale}
                    width={Math.max(1, o.w * scale)}
                    height={Math.max(1, o.h * scale)}
                    opacity={o.opacity}
                    preserveAspectRatio="none"
                    pointerEvents="none"
                  />
                ))}

                {/* 2. Site Boundary Polygon */}
                {layers.siteBoundary && (
                  <rect
                    x={originX}
                    y={originY}
                    width={siteW * scale}
                    height={siteH * scale}
                    fill={backgroundImage ? "#0f171220" : "#0d1a12"}
                    stroke="#22c55e"
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    rx="4"
                  />
                )}

                {/* 3. Walkways (Orange Corridors) */}
                {layers.walkway && walkways.filter(w => w.visible !== false).map(w => {
                  const isSel = sameKeepout(selectedKeepout, { kind: "walkway", id: w.id });
                  return (
                  <g key={w.id}>
                    <rect
                      x={originX + w.x * scale}
                      y={originY + w.y * scale}
                      width={w.w * scale}
                      height={w.h * scale}
                      fill="#ea580c"
                      fillOpacity="0.45"
                      stroke={isSel ? "#b8f36b" : "#f97316"}
                      strokeWidth={isSel ? 3 : 1.5}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={originX + (w.x + w.w / 2) * scale}
                      y={originY + (w.y + w.h / 2) * scale}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fed7aa"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {w.label || "WALKWAY"}
                    </text>
                  </g>
                  );
                })}

                {/* 4. Keepouts / Obstacles */}
                {layers.keepouts && obstacles.filter(obs => obs.visible !== false).map(obs => {
                  const isSel = sameKeepout(selectedKeepout, { kind: "obstacle", id: obs.id });
                  return (
                  <g key={obs.id}>
                    <rect
                      x={originX + obs.x * scale}
                      y={originY + obs.y * scale}
                      width={obs.w * scale}
                      height={obs.h * scale}
                      fill="#ef4444"
                      fillOpacity="0.4"
                      stroke={isSel ? "#b8f36b" : "#f87171"}
                      strokeWidth={isSel ? 3 : 2}
                      strokeDasharray="5 3"
                    />
                    <text
                      x={originX + (obs.x + obs.w / 2) * scale}
                      y={originY + (obs.y + obs.h / 2) * scale}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="800"
                    >
                      {obs.label}
                    </text>
                  </g>
                  );
                })}

                {/* 5. Field Segments Outlines & Tags */}
                {layers.fieldSegments && segments.map(seg => {
                  if (!seg.visible || !seg.polygon || seg.polygon.length < 3) return null;
                  const ptsStr = seg.polygon.map(p => `${originX + p.x * scale},${originY + p.y * scale}`).join(" ");
                  const isActive = seg.id === activeSegment?.id;

                  // Center position for segment badge
                  const avgX = seg.polygon.reduce((acc, p) => acc + p.x, 0) / seg.polygon.length;
                  const minX = Math.min(...seg.polygon.map(p => p.x));
                  const minY = Math.min(...seg.polygon.map(p => p.y));

                  return (
                    <g key={seg.id}>
                      <polygon
                        points={ptsStr}
                        fill={seg.color}
                        fillOpacity={isActive ? "0.18" : "0.08"}
                        stroke={seg.color}
                        strokeWidth={isActive ? "3" : "1.8"}
                        strokeDasharray={isActive ? "none" : "6 4"}
                        style={{ cursor: "move" }}
                        onPointerDown={e => {
                          e.stopPropagation();
                          setActiveSegmentId(seg.id);
                          setDraggingSegmentId(seg.id);
                          dragSegmentStartRef.current = {
                            mouseX: e.clientX,
                            mouseY: e.clientY,
                            initialPoly: seg.polygon.map(p => ({ ...p })),
                          };
                          (e.currentTarget as any).setPointerCapture(e.pointerId);
                        }}
                      />
                      {/* Clean Non-Intrusive Segment Badge (Doesn't cover PV panels) */}
                      {layers.segmentLabels !== false && (
                        isActive ? (
                          <g
                            transform={`translate(${originX + avgX * scale - 45}, ${originY + minY * scale - 26})`}
                            style={{ cursor: "pointer", zIndex: 30 }}
                            onClick={() => setActiveSegmentId(seg.id)}
                          >
                            <rect
                              width="90"
                              height="22"
                              rx="5"
                              fill="#0b1322f5"
                              stroke={seg.color}
                              strokeWidth="2"
                              filter="drop-shadow(0 3px 6px rgba(0,0,0,0.6))"
                            />
                            <text
                              x="45"
                              y="15"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="10.5"
                              fontWeight="800"
                            >
                              {seg.name.replace(/Segment\s+/i, "Seg ")}
                            </text>
                          </g>
                        ) : (
                          <g
                            transform={`translate(${originX + minX * scale + 10}, ${originY + minY * scale + 10})`}
                            style={{ cursor: "pointer", opacity: 0.9 }}
                            onClick={() => setActiveSegmentId(seg.id)}
                            
                          >
                            <circle
                              r="8.5"
                              fill="#0f172af5"
                              stroke={seg.color}
                              strokeWidth="1.8"
                            />
                            <text
                              y="3"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="800"
                            >
                              {seg.name.replace(/[^A-Za-z0-9]/g, "").slice(-1) || "•"}
                            </text>
                          </g>
                        )
                      )}

                      {/* 4 Draggable Corner Handles for Active Segment */}
                      {isActive && seg.polygon.map((pt, idx) => (
                        <circle
                          key={idx}
                          cx={originX + pt.x * scale}
                          cy={originY + pt.y * scale}
                          r={6}
                          fill="#ffffff"
                          stroke={seg.color}
                          strokeWidth={2.5}
                          style={{ cursor: "crosshair" }}
                          onPointerDown={e => {
                            e.stopPropagation();
                            setDraggingCorner({ segId: seg.id, cornerIndex: idx });
                            dragCornerStartRef.current = {
                              mouseX: e.clientX,
                              mouseY: e.clientY,
                              initialPt: { ...pt },
                            };
                            (e.currentTarget as any).setPointerCapture(e.pointerId);
                          }}
                        />
                      ))}
                    </g>
                  );
                })}

                {/* 5b. Interactive Drawing Box Preview */}
                {drawingRect && (() => {
                  const isWalkway = drawingKind === "walkway";
                  const isKeepout = drawingKind === "keepout";
                  return (
                    <rect
                      x={originX + Math.min(drawingRect.startX, drawingRect.currentX) * scale}
                      y={originY + Math.min(drawingRect.startY, drawingRect.currentY) * scale}
                      width={Math.abs(drawingRect.currentX - drawingRect.startX) * scale}
                      height={Math.abs(drawingRect.currentY - drawingRect.startY) * scale}
                      fill={isWalkway ? "#ea580c30" : isKeepout ? "#ef444430" : "#b8f36b25"}
                      stroke={isWalkway ? "#f97316" : isKeepout ? "#ef4444" : "#b8f36b"}
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  );
                })()}

                {/* 6. PV Modules: Authentic Crystalline Solar Cells */}
                {layers.pvModules && segments.map(seg => {
                  if (!seg.visible) return null;
                  return seg.panels.map(panel => {
                    const isSelected = selectedIds.has(panel.id);
                    const px = originX + panel.x * scale;
                    const py = originY + panel.y * scale;
                    const pw = Math.max(1, panel.w * scale);
                    const ph = Math.max(1, panel.h * scale);

                    return (
                      <g
                        key={panel.id}
                        onClick={e => {
                          e.stopPropagation();
                          if (e.shiftKey) {
                            const next = new Set(selectedIds);
                            if (next.has(panel.id)) next.delete(panel.id);
                            else next.add(panel.id);
                            setSelectedIds(next);
                          } else {
                            setSelectedIds(new Set([panel.id]));
                          }
                        }}
                      >
                        {/* Outer Aluminum Frame */}
                        <rect
                          x={px}
                          y={py}
                          width={pw}
                          height={ph}
                          rx="1"
                          fill="#0f172a"
                          stroke={isSelected ? "#b8f36b" : (seg.color || "#38bdf8")}
                          strokeWidth={isSelected ? 2 : 0.8}
                        />
                        {/* Photovoltaic Deep Blue Cell Surface */}
                        <rect
                          x={px + 0.8}
                          y={py + 0.8}
                          width={Math.max(1, pw - 1.6)}
                          height={Math.max(1, ph - 1.6)}
                          fill={isSelected ? "#1d4ed8" : "#1e3a8a"}
                          opacity="0.94"
                        />
                        {/* Silver Busbars & Grid Texture */}
                        {pw > 16 && ph > 10 && (
                          <>
                            <line
                              x1={px + pw / 2}
                              y1={py + 1}
                              x2={px + pw / 2}
                              y2={py + ph - 1}
                              stroke="#93c5fd"
                              strokeWidth="0.6"
                              strokeOpacity="0.75"
                            />
                            <line
                              x1={px + 1}
                              y1={py + ph / 2}
                              x2={px + pw - 1}
                              y2={py + ph / 2}
                              stroke="#93c5fd"
                              strokeWidth="0.5"
                              strokeOpacity="0.6"
                            />
                          </>
                        )}
                      </g>
                    );
                  });
                })}

                {/* 7. Keepout hit layer — above modules so small walkways/obstacles stay selectable */}
                {toolMode === "select" && keepoutViews
                  .filter(v => v.visible && ((v.kind === "walkway" && layers.walkway) || (v.kind === "obstacle" && layers.keepouts)))
                  .map(v => (
                    <rect
                      key={`keepout-hit-${v.key}`}
                      x={originX + v.x * scale}
                      y={originY + v.y * scale}
                      width={Math.max(2, v.w * scale)}
                      height={Math.max(2, v.h * scale)}
                      fill="transparent"
                      pointerEvents="all"
                      style={{ cursor: "move" }}
                      onPointerDown={e => {
                        e.stopPropagation();
                        beginKeepoutDrag(e, v);
                      }}
                    />
                  ))}
              </g>

              {/* ── Overlays: Scale Bar & North Compass ── */}
              {/* Compass Rose */}
              <g transform={`translate(${viewBoxW - 55}, ${viewBoxH - 85})`}>
                <circle cx="20" cy="20" r="18" fill="#0f172af0" stroke="#38bdf8" strokeWidth="1.5" />
                <path d="M 20 6 L 25 20 L 20 17 L 15 20 Z" fill="#ef4444" />
                <path d="M 20 34 L 25 20 L 20 17 L 15 20 Z" fill="#94a3b8" />
                <text x="20" y="5" textAnchor="middle" fill="#38bdf8" fontSize="8" fontWeight="800">N</text>
              </g>

              {/* Metric Scale Bar */}
              <g transform={`translate(${viewBoxW - 140}, ${viewBoxH - 30})`}>
                <rect width="125" height="18" rx="3" fill="#0f172af0" stroke="#334155" strokeWidth="1" />
                <line x1="12" y1="12" x2="112" y2="12" stroke="#ffffff" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="14" stroke="#ffffff" strokeWidth="2" />
                <line x1="45" y1="9" x2="45" y2="13" stroke="#ffffff" strokeWidth="1.5" />
                <line x1="78" y1="9" x2="78" y2="13" stroke="#ffffff" strokeWidth="1.5" />
                <line x1="112" y1="8" x2="112" y2="14" stroke="#ffffff" strokeWidth="2" />
                <text x="12" y="7" fill="#cbd5e1" fontSize="7" fontWeight="700">0</text>
                <text x="45" y="7" fill="#cbd5e1" fontSize="7" fontWeight="700">10</text>
                <text x="78" y="7" fill="#cbd5e1" fontSize="7" fontWeight="700">20</text>
                <text x="112" y="7" fill="#cbd5e1" fontSize="7" fontWeight="700">30 m</text>
              </g>
            </svg>
          </div>

          {/* Canvas Footer Bar */}
          <div className="pv-canvas-footer" style={{ background: "#0a110c", borderTop: "1.5px solid #1c2b20" }}>
            <span>
              <i className="pv-legend-dot" /> {totalModul} modules ({totalCapacityKwp.toFixed(2)} kWp) across {segments.length} segments
            </span>
            <span>
              {isId ? "Klik segmen untuk edit · Seret untuk geser kanvas · Shift + Scroll untuk zoom kanvas" : "Click segment to edit · Drag to pan · Scroll to zoom"}
            </span>
          </div>
          {notice && <div className="pv-notice">{notice}</div>}
          {activeStep === 4 && (
            <EngineRunPanel
              projectId={projectId}
              projectName={projectName ?? ""}
              layout={{ settings, segments, walkways, obstacles, site, backgroundImage, overlays }}
              inputs={engineInputs}
              onInputs={setEngineInputs}
              section="electrical"
            />
          )}
          {activeStep === 5 && (
            <AdvancedPanel
              projectId={projectId}
              layout={{ settings, segments, walkways, obstacles, site, backgroundImage, overlays }}
              inputs={engineInputs}
              onInputs={setEngineInputs}
              overlays={overlays}
              onOverlays={applyOverlays}
            />
          )}
        </div>

        {/* ════ RIGHT COLUMN: LAYERS & DESIGN SUMMARY ════ */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Card 1: Layers Controller */}
          <div className="panel" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <Layers size={16} style={{ color: "var(--green, #b8f36b)" }} />
              <span>Layers</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, siteBoundary: !prev.siteBoundary }))}>
                <label>
                  <input type="checkbox" checked={layers.siteBoundary} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#22c55e" }} />
                  <span>Boundary Site</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, fieldSegments: !prev.fieldSegments }))}>
                <label>
                  <input type="checkbox" checked={layers.fieldSegments} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#8b5cf6" }} />
                  <span>Field Segments</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, pvModules: !prev.pvModules }))}>
                <label>
                  <input type="checkbox" checked={layers.pvModules} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#3b82f6" }} />
                  <span>PV Modules</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, keepouts: !prev.keepouts }))}>
                <label>
                  <input type="checkbox" checked={layers.keepouts} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#ef4444" }} />
                  <span>Keepouts / Obstacle</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, walkway: !prev.walkway }))}>
                <label>
                  <input type="checkbox" checked={layers.walkway} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#f97316" }} />
                  <span>Walkway</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, roofBuilding: !prev.roofBuilding }))}>
                <label>
                  <input type="checkbox" checked={layers.roofBuilding} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#64748b" }} />
                  <span>Roof / Building</span>
                </label>
              </div>

              <div className="pv-layer-row" onClick={() => setLayers(prev => ({ ...prev, satellite: !prev.satellite }))}>
                <label>
                  <input type="checkbox" checked={layers.satellite} onChange={() => {}} />
                  <span className="pv-layer-dot" style={{ background: "#06b6d4" }} />
                  <span>Citra Satelit</span>
                </label>
              </div>
            </div>

            {/* Satellite Background Upload / Remove */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #1a2a1f", display: "flex", flexDirection: "column", gap: 8 }}>
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleBackgroundUpload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              <button
                type="button"
                className="secondary-button"
                style={{ width: "100%", fontSize: 11, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={14} /> {isId ? "Unggah Screenshot Atap" : "Upload Satellite Image"}
              </button>

              {backgroundImage && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 10, color: "#8da294", flex: 1 }}>
                      Opacity: {Math.round(backgroundOpacity * 100)}%
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={backgroundOpacity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setBackgroundOpacity(val);
                          saveDraft(segments, obstacles, walkways, site, backgroundImage, val);
                        }}
                        style={{ width: "100%", marginTop: 2, accentColor: "var(--green, #b8f36b)" }}
                      />
                    </label>
                    <button
                      type="button"
                      className="pv-icon-btn"
                      title="Hapus Citra"
                      onClick={() => {
                        setBackgroundImage("");
                        saveDraft(segments, obstacles, walkways, site, "");
                      }}
                    >
                      <X size={14} style={{ color: "#ef4444" }} />
                    </button>
                  </div>

                  {/* Fine-tune Satellite Map Rotation Live */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0c140f", padding: "4px 8px", borderRadius: 5, border: "1px solid #1f3022" }}>
                    <span style={{ fontSize: 10, color: "#8da294" }}>Rotasi Satelit:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = site?.rotationDeg || 0;
                          const nextSite = site ? { ...site, rotationDeg: (cur - 1 + 360) % 360 } : null;
                          setSite(nextSite);
                          saveDraft(segments, obstacles, walkways, nextSite);
                        }}
                        style={{ background: "#162319", border: "1px solid #233527", color: "#edf5ef", fontSize: 10, padding: "1px 5px", borderRadius: 3, cursor: "pointer" }}
                        title="Putar -1°"
                      >
                        -1°
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="360"
                        value={site?.rotationDeg || 0}
                        onChange={e => {
                          const deg = Number(e.target.value);
                          const nextSite = site ? { ...site, rotationDeg: deg } : null;
                          setSite(nextSite);
                          saveDraft(segments, obstacles, walkways, nextSite);
                        }}
                        style={{ width: 44, background: "#162319", border: "1px solid #2b4432", color: "var(--green, #b8f36b)", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "1px 3px", borderRadius: 4 }}
                      />
                      <span style={{ fontSize: 10, color: "var(--green, #b8f36b)", fontWeight: 700 }}>°</span>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = site?.rotationDeg || 0;
                          const nextSite = site ? { ...site, rotationDeg: (cur + 1) % 360 } : null;
                          setSite(nextSite);
                          saveDraft(segments, obstacles, walkways, nextSite);
                        }}
                        style={{ background: "#162319", border: "1px solid #233527", color: "#edf5ef", fontSize: 10, padding: "1px 5px", borderRadius: 3, cursor: "pointer" }}
                        title="Putar +1°"
                      >
                        +1°
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Ringkasan Desain (Design Summary Table) */}
          <div className="panel" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <Table size={16} style={{ color: "var(--green, #b8f36b)" }} />
              <span>Ringkasan Desain</span>
            </div>

            <table className="pv-summary-table">
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Modul</th>
                  <th>Kapasitas (kWp)</th>
                  <th>Luas (m²)</th>
                </tr>
              </thead>
              <tbody>
                {segments.map(seg => {
                  const kwp = ((seg.panels.length * (seg.moduleWatts || 580)) / 1000).toFixed(2);
                  const areaM2 = (seg.panels.length * ((seg.moduleWidth || 2278) * (seg.moduleHeight || 1134)) / 1e6).toFixed(1);
                  return (
                    <tr key={seg.id}>
                      <td style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color }} />
                        <span style={{ fontWeight: 700 }}>{seg.name}</span>
                      </td>
                      <td>{seg.panels.length}</td>
                      <td style={{ color: "var(--green, #b8f36b)", fontWeight: 700 }}>{kwp}</td>
                      <td>{areaM2}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{totalModul}</td>
                  <td>{totalCapacityKwp.toFixed(2)}</td>
                  <td>{totalModuleArea.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Ekspor Button */}
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                style={{
                  width: "100%",
                  marginBottom: 8,
                  background: "#1a3221",
                  color: "var(--green, #b8f36b)",
                  border: "1.5px solid #2f5637",
                  borderRadius: 7,
                  padding: "9px 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
                onClick={handleManualSave}
                disabled={isSaving}
              >
                <Save size={14} /> {isSaving ? "Menyimpan Desain..." : "Simpan Desain (Ctrl+S)"}
              </button>

              <button
                type="button"
                style={{
                  width: "100%",
                  background: "var(--green, #b8f36b)",
                  color: "#08120a",
                  border: "none",
                  borderRadius: 7,
                  padding: "9px 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  boxShadow: "0 2px 10px rgba(184, 243, 107, 0.3)",
                }}
                onClick={handleExportDxf}
              >
                <Download size={15} /> Ekspor CAD (DXF)
              </button>

              <button
                type="button"
                style={{
                  width: "100%",
                  marginTop: 6,
                  background: "#121d15",
                  color: "#edf5ef",
                  border: "1px solid #233527",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
                onClick={handleExportCsv}
              >
                <Download size={13} /> Ekspor CSV (BoQ)
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Google Maps Scanner Modal */}
      <GoogleMapsModal
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
        onApply={handleGoogleMapsApply}
        initialWidthMm={site?.boxes?.[0]?.widthM ? site.boxes[0].widthM * 1000 : settings.areaWidth}
        initialHeightMm={site?.boxes?.[0]?.heightM ? site.boxes[0].heightM * 1000 : settings.areaHeight}
        initialPolygonPoints={site?.polygonPoints}
        initialRotationDeg={site?.rotationDeg}
        initialCenter={site?.coordinates}
        initialBoxes={site?.boxes}
        initialCropPaddingM={site?.cropPaddingM}
      />
    </section>
  );
}
