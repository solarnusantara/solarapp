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
  Hand
} from "lucide-react";
import GoogleMapsModal from "./GoogleMapsModal";
import * as api from "./api";

type Lang = "en" | "id";
type Panel = { id: number; x: number; y: number; w: number; h: number };
type SystemType = "Rooftop" | "Ground-mounted";
type Obstacle = { id: number; x: number; y: number; w: number; h: number; label: string };
type Site = {
  coordinates: { lat: number; lng: number };
  address: string;
  polygonPoints?: Array<{ lat: number; lng: number }>;
  polygonCorners?: Array<{ x: number; y: number }>;
  rotationDeg?: number;
  pitchDegrees?: number;
  azimuthDegrees?: number;
  googleSolarData?: any;
};

const STORAGE_KEY = "solar-apps-pv-layout-v1";
const defaults = {
  system: "Rooftop" as SystemType,
  areaWidth: 12000,
  areaHeight: 8000,
  moduleWidth: 2278,
  moduleHeight: 1134,
  gap: 20,
  rows: 4,
  cols: 8,
  watts: 580,
  tilt: 10,
  orientation: "landscape" as "landscape" | "portrait",
  setback: 300,
  obstacleWidth: 1000,
  obstacleHeight: 1000,
};

function storageKey(userId: string, projectId: string | null) {
  return `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`;
}

/**
 * Insets a polygon by setback distance. Works for convex quadrilaterals (trapezoids,
 * parallelograms, rectangles) in screen coordinates (where Y grows downwards).
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

  return insetVertices;
}

/**
 * Standard ray-casting point-in-polygon algorithm
 */
function isPointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPanelInsidePolygon(
  p: Pick<Panel, "x" | "y" | "w" | "h">,
  poly: Array<{ x: number; y: number }>
): boolean {
  const corners = [
    { x: p.x, y: p.y },
    { x: p.x + p.w, y: p.y },
    { x: p.x + p.w, y: p.y + p.h },
    { x: p.x, y: p.y + p.h },
  ];
  return corners.every(c => isPointInPolygon(c.x, c.y, poly));
}

function loadSaved(userId: string, projectId: string | null): {
  settings: typeof defaults;
  panels: Panel[];
  obstacles?: Obstacle[];
  backgroundImage?: string;
  backgroundOpacity?: number;
  site?: Site | null;
} | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.settings && Array.isArray(parsed?.panels) && parsed.panels.length > 0) return parsed;
    }
  } catch { /* ignore invalid local draft */ }
  const defaultData = getProjectDefaultLayout(projectId);
  if (defaultData) return defaultData as any;
  return null;
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
  const [settings, setSettings] = useState({
    ...defaults,
    system: projectType ?? defaults.system,
    ...(saved?.settings ?? {})
  });
  const [panels, setPanels] = useState<Panel[]>(saved?.panels ?? []);
  const [obstacles, setObstacles] = useState<Obstacle[]>(saved?.obstacles ?? []);
  const [backgroundImage, setBackgroundImage] = useState<string>(saved?.backgroundImage ?? "");
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(saved?.backgroundOpacity ?? 0.8);
  const [site, setSite] = useState<Site | null>(saved?.site ?? null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedObstacleId, setSelectedObstacleId] = useState<number | null>(null);

  // Dragging state
  const [draggingObstacleId, setDraggingObstacleId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<"select" | "pan">("select");
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startPanX: number; startPanY: number }>({ clientX: 0, clientY: 0, startPanX: 0, startPanY: 0 });
  const isSpacePressedRef = useRef(false);

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isMarqueeDraggingRef = useRef(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  const zoomHintTimeoutRef = useRef<number | null>(null);

  const [notice, setNotice] = useState("");
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const id = lang === "id";

  // History stack for Undo / Redo (HelioScope / PVsyst CAD standard)
  type HistoryEntry = { panels: Panel[]; obstacles: Obstacle[] };
  const [history, setHistory] = useState<HistoryEntry[]>([{
    panels: saved?.panels ?? [],
    obstacles: saved?.obstacles ?? []
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  function pushHistory(newPanels: Panel[], newObstacles: Obstacle[] = obstacles) {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      if (trimmed.length >= 50) trimmed.shift();
      return [...trimmed, { panels: newPanels, obstacles: newObstacles }];
    });
    setHistoryIndex(prev => Math.min(49, prev + 1));
  }

  function handleUndo() {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const prev = history[prevIdx];
      setHistoryIndex(prevIdx);
      setPanels(prev.panels);
      setObstacles(prev.obstacles);
      setSelectedIds(new Set());
      saveDraft(prev.panels, settings, prev.obstacles);
      setNotice(id ? "↩ Undo: Aksi sebelumnya dibatalkan." : "↩ Undo: Action undone.");
    }
  }

  function handleRedo() {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const next = history[nextIdx];
      setHistoryIndex(nextIdx);
      setPanels(next.panels);
      setObstacles(next.obstacles);
      setSelectedIds(new Set());
      saveDraft(next.panels, settings, next.obstacles);
      setNotice(id ? "↪ Redo: Aksi diterapkan kembali." : "↪ Redo: Action redone.");
    }
  }

  function handleResetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNotice(id ? "🔍 Tampilan kanvas di-reset ke 100%." : "🔍 Canvas view reset to 100%.");
  }

  useEffect(() => {
    if (!projectId) return;
    const targetId = projectId;
    let isCancelled = false;
    async function loadRemoteLayout() {
      const remote = await api.fetchProjectLayout(targetId);
      if (remote && !isCancelled) {
        if (remote.settings) setSettings(prev => ({ ...prev, ...remote.settings }));
        if (Array.isArray(remote.panels) && remote.panels.length > 0) {
          setPanels(remote.panels);
          setHistory([{ panels: remote.panels, obstacles: remote.obstacles ?? [] }]);
          setHistoryIndex(0);
        }
        if (Array.isArray(remote.obstacles)) setObstacles(remote.obstacles);
        if (remote.site) setSite(remote.site);
        if (remote.backgroundImage) setBackgroundImage(remote.backgroundImage);
        if (remote.backgroundOpacity !== undefined) setBackgroundOpacity(remote.backgroundOpacity);
      }
    }
    loadRemoteLayout();
    return () => { isCancelled = true; };
  }, [projectId]);

  const copy = id ? {
    eyebrow: "EDITOR LAYOUT PV", title: "PV Layout 2D", subtitle: "Generate susunan modul otomatis, lalu rapikan secara manual di kanvas.",
    system: "Jenis sistem", roof: "Rooftop / Atap", ground: "Ground-mounted / Lahan", area: "Batas area (mm)", width: "Lebar", height: "Panjang", module: "Spesifikasi modul", mw: "Lebar modul", mh: "Tinggi modul", gap: "Jarak antarmodul", watts: "Daya modul (Wp)", layout: "Susunan", rows: "Baris", cols: "Kolom", tilt: "Kemiringan (°)", orientation: "Orientasi modul", landscape: "Landscape", portrait: "Portrait", generate: "Grid Teratur", fillArea: "Penuhi Atap (Max Pack)", reset: "Reset layout", selected: "Panel dipilih", delete: "Hapus panel", hint: "Klik area kosong untuk menambah panel. Seret panel atau obstacle untuk memindahkannya.", capacity: "Kapasitas DC", count: "Jumlah modul", used: "Area modul (perkiraan)", fit: "Status batas area", fits: "Layout masuk batas area", overflow: "Sebagian modul di luar batas", export: "Ekspor CSV", exportDxf: "Ekspor DXF", exportedDxf: "DXF layout diunduh.", saved: "Draft tersimpan di browser", empty: "Belum ada panel. Klik Penuhi Atap atau Grid Teratur untuk mulai.", canvas: "Kanvas desain", snap: "Koordinat dalam mm", confirmReset: "Layout direset.", generated: "Layout otomatis dibuat.", exported: "CSV layout diunduh.", manual: "Panel ditambahkan.", obstacles: "Obstacle / area terlarang", satellite: "Citra lokasi / satelit", uploadImage: "Unggah citra", removeImage: "Hapus citra", imageOpacity: "Transparansi citra", imageHelp: "Unggah screenshot Google Earth atau citra lokasi. Atur lebar/panjang area agar sesuai ukuran bangunan yang diketahui.", setback: "Jarak bebas tepi (mm)", obstacleWidth: "Lebar obstacle", obstacleHeight: "Panjang obstacle", addObstacle: "Tambah obstacle tengah", deleteObstacle: "Hapus obstacle dipilih", obstacleAdded: "Obstacle ditambahkan.", obstacleDeleted: "Obstacle dihapus.", obstacleOverlap: "Panel tidak boleh menutupi obstacle atau setback."
  } : {
    eyebrow: "PV LAYOUT EDITOR", title: "PV Layout 2D", subtitle: "Generate a module arrangement, then refine it manually on the canvas.",
    system: "System type", roof: "Rooftop", ground: "Ground-mounted", area: "Site boundary (mm)", width: "Width", height: "Length", module: "Module specification", mw: "Module width", mh: "Module height", gap: "Module gap", watts: "Module power (Wp)", layout: "Array arrangement", rows: "Rows", cols: "Columns", tilt: "Tilt (°)", orientation: "Module orientation", landscape: "Landscape", portrait: "Portrait", generate: "Generate Grid", fillArea: "Fill Area (Max Pack)", reset: "Reset layout", selected: "Selected panel", delete: "Delete panel", hint: "Click empty space to add a panel. Drag panels or obstacles to move them.", capacity: "DC capacity", count: "Module count", used: "Approx. module area", fit: "Boundary check", fits: "Layout fits boundary", overflow: "Some modules are outside boundary", export: "Export CSV", exportDxf: "Export DXF", exportedDxf: "DXF layout downloaded.", saved: "Draft saved in this browser", empty: "No panels yet. Select Fill Area or Generate Grid to start.", canvas: "Design canvas", snap: "Coordinates in mm", confirmReset: "Layout reset.", generated: "Automatic layout generated.", exported: "Layout CSV downloaded.", manual: "Panel added.", obstacles: "Obstacles / exclusion zones", satellite: "Site / satellite image", uploadImage: "Upload image", removeImage: "Remove image", imageOpacity: "Image opacity", imageHelp: "Upload a Google Earth screenshot or site image. Set area width/length to match a known building dimension.", setback: "Edge setback (mm)", obstacleWidth: "Obstacle width", obstacleHeight: "Obstacle length", addObstacle: "Add centered obstacle", deleteObstacle: "Delete selected obstacle", obstacleAdded: "Obstacle added.", obstacleDeleted: "Obstacle deleted.", obstacleOverlap: "Panels cannot overlap obstacles or the edge setback."
  };

  const moduleW = settings.orientation === "landscape" ? settings.moduleWidth : settings.moduleHeight;
  const moduleH = settings.orientation === "landscape" ? settings.moduleHeight : settings.moduleWidth;
  const capacity = (panels.length * settings.watts) / 1000;
  const moduleArea = (panels.reduce((sum, p) => sum + p.w * p.h, 0)) / 1_000_000;

  // Active polygon corners in mm: use custom polygon if available (e.g. Trapezoid from Google Maps Satellite Scanner)
  const activeCorners = useMemo<Array<{ x: number; y: number }>>(() => {
    if (site?.polygonCorners && Array.isArray(site.polygonCorners) && site.polygonCorners.length >= 3) {
      return site.polygonCorners;
    }
    return [
      { x: 0, y: 0 },
      { x: settings.areaWidth, y: 0 },
      { x: settings.areaWidth, y: settings.areaHeight },
      { x: 0, y: settings.areaHeight },
    ];
  }, [site?.polygonCorners, settings.areaWidth, settings.areaHeight]);

  const setbackPolygon = useMemo<Array<{ x: number; y: number }>>(() => {
    return computeInsetPolygon(activeCorners, settings.setback);
  }, [activeCorners, settings.setback]);

  const isCustomPolygon = Boolean(site?.polygonCorners && Array.isArray(site.polygonCorners) && site.polygonCorners.length >= 3);
  const selectedObstacle = obstacles.find(o => o.id === selectedObstacleId) ?? null;

  const withinSetback = (p: Pick<Panel, "x" | "y" | "w" | "h">) => {
    const boundary = setbackPolygon.length >= 3 ? setbackPolygon : activeCorners;
    return isPanelInsidePolygon(p, boundary);
  };

  const intersectsObstacle = (p: Pick<Panel, "x" | "y" | "w" | "h">, o: Obstacle) =>
    p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y;

  const isPlacementValid = (p: Pick<Panel, "x" | "y" | "w" | "h">, list: Obstacle[] = obstacles) =>
    withinSetback(p) && !list.some(o => intersectsObstacle(p, o));

  const overflow = panels.some(p => !isPlacementValid(p, obstacles));

  function handleGoogleMapsApply(data: {
    widthMm: number;
    heightMm: number;
    imageSrc: string;
    coordinates: { lat: number; lng: number };
    address: string;
    polygonPoints?: Array<{ lat: number; lng: number }>;
    polygonCornersMm?: Array<{ x: number; y: number }>;
    rotationDeg?: number;
    pitchDegrees?: number;
    azimuthDegrees?: number;
    googleSolarData?: any;
  }) {
    const nextSettings = { ...settings, areaWidth: data.widthMm, areaHeight: data.heightMm };
    const nextSite: Site = {
      coordinates: data.coordinates,
      address: data.address,
      polygonPoints: data.polygonPoints,
      polygonCorners: data.polygonCornersMm,
      rotationDeg: data.rotationDeg,
      pitchDegrees: data.pitchDegrees,
      azimuthDegrees: data.azimuthDegrees,
      googleSolarData: data.googleSolarData,
    };
    setSite(nextSite);
    setSettings(nextSettings);
    if (data.imageSrc) {
      setBackgroundImage(data.imageSrc);
    }
    const safePanels = panels.filter(p => isPlacementValid(p, obstacles));
    setPanels(safePanels);
    pushHistory(safePanels, obstacles);
    saveDraft(safePanels, nextSettings, obstacles, nextSite, data.imageSrc || backgroundImage);
    const solarInfo = data.pitchDegrees !== undefined ? ` [Google Solar Pitch: ${data.pitchDegrees}°, Azimuth: ${data.azimuthDegrees}°]` : "";
    const rotInfo = data.rotationDeg ? ` [Rotasi: ${data.rotationDeg}°]` : "";
    const polyInfo = data.polygonCornersMm && data.polygonCornersMm.length >= 3 ? " [Bentuk Trapesium/Poligon Kustom Diterapkan]" : "";
    setNotice(id ? `Dimensi & batas area diperbarui: ${data.widthMm.toLocaleString()} × ${data.heightMm.toLocaleString()} mm.${polyInfo}${rotInfo}${solarInfo}` : `Area dimensions & boundary updated: ${data.widthMm.toLocaleString()} × ${data.heightMm.toLocaleString()} mm.${polyInfo}${rotInfo}${solarInfo}`);
  }

  function handleBackgroundUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice(id ? "Pilih file gambar yang valid." : "Choose a valid image file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1600;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) { setNotice(id ? "Gagal memproses gambar." : "Could not process image."); return; }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        setBackgroundImage(dataUrl);
        try {
          localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ projectId, settings, panels, obstacles, site, backgroundImage: dataUrl, backgroundOpacity }));
          setNotice(id ? "Citra lokasi ditambahkan dan draft disimpan." : "Site image added and draft saved.");
        } catch {
          setNotice(id ? "Citra ditambahkan, tetapi terlalu besar untuk disimpan di browser. Gunakan gambar lebih kecil." : "Image added, but too large for browser storage. Try a smaller image.");
        }
      };
      image.onerror = () => setNotice(id ? "Gambar tidak dapat dibaca." : "Could not read the image.");
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  }

  function removeBackgroundImage() {
    setBackgroundImage("");
    try { localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ projectId, settings, panels, obstacles, site, backgroundImage: "", backgroundOpacity })); } catch { /* ignore storage errors */ }
    setNotice(id ? "Citra lokasi dihapus." : "Site image removed.");
  }

  function update<K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    saveDraft(panels, nextSettings, obstacles);
  }

  function saveDraft(
    nextPanels = panels,
    nextSettings = settings,
    nextObstacles = obstacles,
    nextSite = site,
    nextBgImage = backgroundImage,
    nextBgOpacity = backgroundOpacity
  ) {
    const payload = {
      projectId,
      settings: nextSettings,
      panels: nextPanels,
      obstacles: nextObstacles,
      site: nextSite,
      backgroundImage: nextBgImage,
      backgroundOpacity: nextBgOpacity,
    };
    try {
      localStorage.setItem(storageKey(userId, projectId), JSON.stringify(payload));
    } catch { /* image or draft may exceed browser storage quota */ }

    if (projectId) {
      api.saveProjectLayout(projectId, payload);
    }
  }

  // --- Grid Generation ---
  function generate() {
    const rows = Math.max(1, Math.min(100, Math.floor(Number(settings.rows) || 1)));
    const cols = Math.max(1, Math.min(100, Math.floor(Number(settings.cols) || 1)));
    const totalW = cols * moduleW + (cols - 1) * settings.gap;
    const totalH = rows * moduleH + (rows - 1) * settings.gap;
    const startX = Math.max(0, (settings.areaWidth - totalW) / 2);
    const startY = Math.max(0, (settings.areaHeight - totalH) / 2);
    const next: Panel[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const candidate = {
        id: Date.now() + r * cols + c,
        x: startX + c * (moduleW + settings.gap),
        y: startY + r * (moduleH + settings.gap),
        w: moduleW,
        h: moduleH
      };
      if (isPlacementValid(candidate)) next.push(candidate);
    }
    setPanels(next);
    setSelectedIds(new Set());
    pushHistory(next, obstacles);
    saveDraft(next);
    setNotice(copy.generated);
  }

  // --- HelioScope Max Pack / Auto-Fill Boundary ---
  function autoFillArea() {
    const boundary = setbackPolygon.length >= 3 ? setbackPolygon : activeCorners;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of boundary) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(settings.areaWidth, maxX);
    maxY = Math.min(settings.areaHeight, maxY);

    const stepX = moduleW + settings.gap;
    const stepY = moduleH + settings.gap;

    const next: Panel[] = [];
    let idCounter = Date.now();

    for (let y = minY; y <= maxY - moduleH; y += stepY) {
      for (let x = minX; x <= maxX - moduleW; x += stepX) {
        const candidate: Panel = { id: ++idCounter, x, y, w: moduleW, h: moduleH };
        if (isPlacementValid(candidate, obstacles)) {
          next.push(candidate);
        }
      }
    }

    if (next.length > 0) {
      setPanels(next);
      setSelectedIds(new Set());
      pushHistory(next, obstacles);
      saveDraft(next);
      const kwp = (next.length * settings.watts / 1000).toFixed(2);
      setNotice(id ? `⚡ Penuhi Atap: ${next.length} modul (${kwp} kWp) tersusun optimal.` : `⚡ Auto-Fill: ${next.length} modules (${kwp} kWp) placed.`);
    } else {
      setNotice(id ? "Area atap terlalu sempit untuk modul ini." : "Area is too small to fit modules.");
    }
  }

  function reset() {
    setPanels([]);
    setSelectedIds(new Set());
    pushHistory([], obstacles);
    saveDraft([]);
    setNotice(copy.confirmReset);
  }

  // --- Obstacle Management ---
  function addObstacle() {
    const w = Math.max(100, Math.min(settings.obstacleWidth, settings.areaWidth));
    const h = Math.max(100, Math.min(settings.obstacleHeight, settings.areaHeight));
    const next = [
      ...obstacles,
      {
        id: Date.now(),
        x: Math.max(0, (settings.areaWidth - w) / 2),
        y: Math.max(0, (settings.areaHeight - h) / 2),
        w,
        h,
        label: `OBS-${String(obstacles.length + 1).padStart(2, "0")}`
      }
    ];
    setObstacles(next);
    setSelectedObstacleId(next[next.length - 1].id);
    const safePanels = panels.filter(p => isPlacementValid(p, next));
    setPanels(safePanels);
    pushHistory(safePanels, next);
    saveDraft(safePanels, settings, next);
    setNotice(copy.obstacleAdded);
  }

  function deleteSelectedObstacle() {
    if (selectedObstacleId === null) return;
    const next = obstacles.filter(o => o.id !== selectedObstacleId);
    setObstacles(next);
    setSelectedObstacleId(null);
    pushHistory(panels, next);
    saveDraft(panels, settings, next);
    setNotice(copy.obstacleDeleted);
  }

  // --- Multi-Select & Bulk Operations ---
  function handleSelectAll() {
    setSelectedIds(new Set(panels.map(p => p.id)));
    setSelectedObstacleId(null);
    setNotice(id ? `${panels.length} panel dipilih.` : `${panels.length} panels selected.`);
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
    setSelectedObstacleId(null);
  }

  function deleteSelectedPanels() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const next = panels.filter(p => !selectedIds.has(p.id));
    setPanels(next);
    setSelectedIds(new Set());
    pushHistory(next, obstacles);
    saveDraft(next);
    setNotice(id ? `🗑️ ${count} panel dihapus.` : `🗑️ ${count} panels deleted.`);
  }

  function rotateSelectedPanels() {
    if (selectedIds.size === 0) return;
    let rotatedCount = 0;
    const next = panels.map(p => {
      if (!selectedIds.has(p.id)) return p;
      const candidate = { ...p, w: p.h, h: p.w };
      if (isPlacementValid(candidate, obstacles)) {
        rotatedCount++;
        return candidate;
      }
      return p;
    });
    if (rotatedCount > 0) {
      setPanels(next);
      pushHistory(next, obstacles);
      saveDraft(next);
      setNotice(id ? `🔄 ${rotatedCount} panel diputar (Landscape ⇄ Portrait).` : `🔄 ${rotatedCount} panels rotated.`);
    } else {
      setNotice(id ? "Panel yang dipilih tidak muat jika diputar di posisinya." : "Selected panels do not fit when rotated.");
    }
  }

  function duplicateSelectedPanels() {
    if (selectedIds.size === 0) return;
    const selectedList = panels.filter(p => selectedIds.has(p.id));
    const newPanels: Panel[] = [];
    const offset = moduleW + settings.gap;
    const offsetY = moduleH + settings.gap;

    let baseId = Date.now();
    for (const p of selectedList) {
      let candidate = { ...p, id: ++baseId, x: p.x + offset };
      if (!isPlacementValid(candidate, obstacles)) {
        candidate = { ...p, id: ++baseId, y: p.y + offsetY };
      }
      if (isPlacementValid(candidate, obstacles)) {
        newPanels.push(candidate);
      }
    }

    if (newPanels.length > 0) {
      const next = [...panels, ...newPanels];
      setPanels(next);
      setSelectedIds(new Set(newPanels.map(p => p.id)));
      pushHistory(next, obstacles);
      saveDraft(next);
      setNotice(id ? `📋 ${newPanels.length} panel diduplikat.` : `📋 ${newPanels.length} panels duplicated.`);
    } else {
      setNotice(id ? "Ruang atap tidak cukup untuk menduplikat panel yang dipilih." : "Not enough space to duplicate selected panels.");
    }
  }

  // Keyboard Shortcuts (Undo, Redo, Delete, Select All, Zoom, Pan, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space") {
        isSpacePressedRef.current = true;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedObstacleId !== null) {
          e.preventDefault();
          deleteSelectedObstacle();
        } else if (selectedIds.size > 0) {
          e.preventDefault();
          deleteSelectedPanels();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClearSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom(prev => Math.min(3.5, Number((prev + 0.2).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setZoom(prev => Math.max(0.4, Number((prev - 0.2).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleResetView();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [historyIndex, history, selectedIds, selectedObstacleId, panels, obstacles, settings, zoom]);

  // Coordinate transforms with Zoom and Pan
  function pointFromEvent(event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) {
    const svg = (event.currentTarget as SVGElement).ownerSVGElement || (event.currentTarget as SVGSVGElement);
    const rect = (svg || event.currentTarget).getBoundingClientRect();
    const sx = ((event.clientX - rect.left) / rect.width) * 1000;
    const sy = ((event.clientY - rect.top) / rect.height) * 600;
    // Invert zoom & pan around center (500, 300)
    const contentSx = (sx - 500 - pan.x) / zoom + 500;
    const contentSy = (sy - 300 - pan.y) / zoom + 300;
    return { x: (contentSx - originX) / scale, y: (contentSy - originY) / scale };
  }

  const scale = Math.min(840 / Math.max(settings.areaWidth, 1), 430 / Math.max(settings.areaHeight, 1));
  const originX = (1000 - settings.areaWidth * scale) / 2;
  const originY = (600 - settings.areaHeight * scale) / 2;

  const svgPolygonPoints = useMemo(() => {
    return activeCorners.map(p => `${originX + p.x * scale},${originY + p.y * scale}`).join(" ");
  }, [activeCorners, originX, originY, scale]);

  const svgSetbackPolygonPoints = useMemo(() => {
    return setbackPolygon.map(p => `${originX + p.x * scale},${originY + p.y * scale}`).join(" ");
  }, [setbackPolygon, originX, originY, scale]);

  function handleWheel(e: React.WheelEvent<HTMLElement>) {
    // Only zoom when Ctrl or Cmd key is pressed (Google Maps & Figma CAD standard)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      setZoom(prev => Math.max(0.4, Math.min(3.5, Number((prev + delta).toFixed(2)))));
    } else {
      // Show helpful overlay without trapping page scroll
      setShowZoomHint(true);
      if (zoomHintTimeoutRef.current) clearTimeout(zoomHintTimeoutRef.current);
      zoomHintTimeoutRef.current = window.setTimeout(() => {
        setShowZoomHint(false);
      }, 1400);
      // Let standard page scrolling proceed naturally!
    }
  }

  // Pointer interactions
  function canvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-panel]")) return;
    if ((event.target as Element).closest("[data-obstacle]")) return;

    // Pan mode or middle-click or Space held
    if (event.button === 1 || toolMode === "pan" || isSpacePressedRef.current) {
      isPanningRef.current = true;
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        startPanX: pan.x,
        startPanY: pan.y
      };
      (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
      return;
    }

    // Select mode: start potential marquee or click
    const p = pointFromEvent(event);
    marqueeStartRef.current = p;
    isMarqueeDraggingRef.current = false;
    setMarquee(null);
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  }

  function handlePanelPointerDown(e: React.PointerEvent<SVGGElement>, panel: Panel) {
    e.stopPropagation();

    if (toolMode === "pan" || isSpacePressedRef.current) {
      isPanningRef.current = true;
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y
      };
      (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
      return;
    }

    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;

    let currentSelected = selectedIds;
    if (isMulti) {
      currentSelected = new Set(selectedIds);
      if (currentSelected.has(panel.id)) {
        currentSelected.delete(panel.id);
      } else {
        currentSelected.add(panel.id);
      }
      setSelectedIds(currentSelected);
    } else {
      if (!selectedIds.has(panel.id)) {
        currentSelected = new Set([panel.id]);
        setSelectedIds(currentSelected);
      }
    }

    setSelectedObstacleId(null);
    setDraggingId(panel.id);
    setHasMovedDuringDrag(false);

    const pt = pointFromEvent(e);
    dragStartMouseRef.current = { x: pt.x, y: pt.y };

    const movingIds = currentSelected.has(panel.id) ? Array.from(currentSelected) : [panel.id];
    const posMap = new Map<number, { x: number; y: number }>();
    for (const p of panels) {
      if (movingIds.includes(p.id)) {
        posMap.set(p.id, { x: p.x, y: p.y });
      }
    }
    dragStartPositionsRef.current = posMap;
    (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
  }

  function canvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (isPanningRef.current) {
      const dx = event.clientX - panStartRef.current.clientX;
      const dy = event.clientY - panStartRef.current.clientY;
      const rect = event.currentTarget.getBoundingClientRect();
      const scaleX = 1000 / Math.max(rect.width, 1);
      const scaleY = 600 / Math.max(rect.height, 1);
      setPan({
        x: Math.round(panStartRef.current.startPanX + dx * scaleX),
        y: Math.round(panStartRef.current.startPanY + dy * scaleY)
      });
      return;
    }

    if (draggingObstacleId !== null) {
      const p = pointFromEvent(event);
      const moving = obstacles.find(o => o.id === draggingObstacleId);
      if (!moving) return;
      const candidate = {
        ...moving,
        x: Math.max(0, Math.min(settings.areaWidth - moving.w, Math.round((p.x - moving.w / 2) / 50) * 50)),
        y: Math.max(0, Math.min(settings.areaHeight - moving.h, Math.round((p.y - moving.h / 2) / 50) * 50)),
      };
      const nextObstacles = obstacles.map(o => o.id === draggingObstacleId ? candidate : o);
      const nextPanels = panels.filter(panel => isPlacementValid(panel, nextObstacles));
      setObstacles(nextObstacles);
      setPanels(nextPanels);
      setHasMovedDuringDrag(true);
      return;
    }

    if (draggingId !== null) {
      const p = pointFromEvent(event);
      const dx = Math.round((p.x - dragStartMouseRef.current.x) / 50) * 50;
      const dy = Math.round((p.y - dragStartMouseRef.current.y) / 50) * 50;
      if (dx === 0 && dy === 0) return;

      const posMap = dragStartPositionsRef.current;
      if (!posMap || posMap.size === 0) return;

      const proposedPanels = panels.map(panel => {
        const startPos = posMap.get(panel.id);
        if (!startPos) return panel;
        const nextX = Math.max(0, Math.min(settings.areaWidth - panel.w, startPos.x + dx));
        const nextY = Math.max(0, Math.min(settings.areaHeight - panel.h, startPos.y + dy));
        return { ...panel, x: nextX, y: nextY };
      });

      const allValid = proposedPanels.every(panel => {
        if (!posMap.has(panel.id)) return true;
        return isPlacementValid(panel, obstacles);
      });

      if (allValid) {
        setPanels(proposedPanels);
        setHasMovedDuringDrag(true);
      }
      return;
    }

    if (marqueeStartRef.current !== null) {
      const p = pointFromEvent(event);
      const dist = Math.hypot(p.x - marqueeStartRef.current.x, p.y - marqueeStartRef.current.y);
      if (dist > 80 || isMarqueeDraggingRef.current) {
        isMarqueeDraggingRef.current = true;
        setMarquee({
          startX: marqueeStartRef.current.x,
          startY: marqueeStartRef.current.y,
          currentX: p.x,
          currentY: p.y
        });
      }
    }
  }

  function finishDrag(event?: React.PointerEvent<SVGSVGElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isMarqueeDraggingRef.current && marquee) {
      const minX = Math.min(marquee.startX, marquee.currentX);
      const maxX = Math.max(marquee.startX, marquee.currentX);
      const minY = Math.min(marquee.startY, marquee.currentY);
      const maxY = Math.max(marquee.startY, marquee.currentY);

      const hitPanels = panels.filter(p =>
        p.x < maxX && p.x + p.w > minX &&
        p.y < maxY && p.y + p.h > minY
      );

      const isAdditive = event?.shiftKey || event?.ctrlKey || event?.metaKey;
      if (isAdditive) {
        setSelectedIds(prev => new Set([...prev, ...hitPanels.map(p => p.id)]));
      } else {
        setSelectedIds(new Set(hitPanels.map(p => p.id)));
      }

      if (hitPanels.length > 0) {
        const kwp = (hitPanels.length * settings.watts / 1000).toFixed(2);
        setNotice(id ? `🟦 ${hitPanels.length} panel dipilih dengan kotak seleksi (${kwp} kWp).` : `🟦 ${hitPanels.length} panels selected (${kwp} kWp).`);
      } else if (!isAdditive) {
        setSelectedIds(new Set());
      }

      setMarquee(null);
      marqueeStartRef.current = null;
      isMarqueeDraggingRef.current = false;
      return;
    }

    if (marqueeStartRef.current && !isMarqueeDraggingRef.current) {
      const clickP = marqueeStartRef.current;
      marqueeStartRef.current = null;
      setMarquee(null);

      if (!event?.shiftKey && !event?.ctrlKey && !event?.metaKey) {
        setSelectedIds(new Set());
        setSelectedObstacleId(null);
      }

      if (clickP.x >= 0 && clickP.y >= 0 && clickP.x <= settings.areaWidth && clickP.y <= settings.areaHeight) {
        const x = Math.max(0, Math.min(settings.areaWidth - moduleW, Math.round((clickP.x - moduleW / 2) / 50) * 50));
        const y = Math.max(0, Math.min(settings.areaHeight - moduleH, Math.round((clickP.y - moduleH / 2) / 50) * 50));
        const candidate = { id: Date.now(), x, y, w: moduleW, h: moduleH };

        if (isPlacementValid(candidate)) {
          const next = [...panels, candidate];
          setPanels(next);
          setSelectedIds(new Set([candidate.id]));
          pushHistory(next, obstacles);
          saveDraft(next);
          setNotice(copy.manual);
        }
      }
    }

    if (hasMovedDuringDrag) {
      pushHistory(panels, obstacles);
      saveDraft(panels, settings, obstacles);
      setHasMovedDuringDrag(false);
    }
    setDraggingId(null);
    setDraggingObstacleId(null);
    dragStartPositionsRef.current.clear();
  }

  function exportCsv() {
    const lines = [
      ["Panel ID", "X (mm)", "Y (mm)", "Width (mm)", "Height (mm)", "Power (Wp)"],
      ...panels.map((p, i) => [`PV-${String(i + 1).padStart(3, "0")}`, p.x, p.y, p.w, p.h, settings.watts])
    ];
    const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solar-apps-pv-layout.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(copy.exported);
  }

  function exportDxf() {
    const pair = (code: number | string, value: number | string) => `${code}\r\n${value}\r\n`;
    const entities: string[] = [];
    const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
      entities.push(pair(0, "LINE"), pair(8, layer), pair(10, x1), pair(20, y1), pair(30, 0), pair(11, x2), pair(21, y2), pair(31, 0));
    };
    const addRect = (x: number, y: number, w: number, h: number, layer: string) => {
      addLine(x, y, x + w, y, layer);
      addLine(x + w, y, x + w, y + h, layer);
      addLine(x + w, y + h, x, y + h, layer);
      addLine(x, y + h, x, y, layer);
    };

    if (activeCorners && activeCorners.length >= 3) {
      for (let i = 0; i < activeCorners.length; i++) {
        const nextI = (i + 1) % activeCorners.length;
        const p1 = activeCorners[i];
        const p2 = activeCorners[nextI];
        addLine(p1.x, settings.areaHeight - p1.y, p2.x, settings.areaHeight - p2.y, "SITE_BOUNDARY");
      }
    } else {
      addRect(0, 0, settings.areaWidth, settings.areaHeight, "SITE_BOUNDARY");
    }

    obstacles.forEach(obstacle => {
      const y = settings.areaHeight - obstacle.y - obstacle.h;
      addRect(obstacle.x, y, obstacle.w, obstacle.h, "OBSTACLES");
    });

    panels.forEach((panel, index) => {
      const x = panel.x;
      const y = settings.areaHeight - panel.y - panel.h;
      addRect(x, y, panel.w, panel.h, "PV_MODULES");
      const textHeight = Math.max(40, Math.min(120, Math.min(panel.w, panel.h) / 8));
      if (panel.w > textHeight * 2 && panel.h > textHeight * 1.5) {
        entities.push(pair(0, "TEXT"), pair(8, "PANEL_ID"), pair(10, x + panel.w / 2 - textHeight), pair(20, y + panel.h / 2), pair(30, 0), pair(40, textHeight), pair(1, `PV-${String(index + 1).padStart(3, "0")}`), pair(50, 0));
      }
    });

    const header = [
      pair(0, "SECTION"), pair(2, "HEADER"),
      pair(9, "$ACADVER"), pair(1, "AC1009"),
      pair(9, "$INSBASE"), pair(10, 0), pair(20, 0), pair(30, 0),
      pair(9, "$INSUNITS"), pair(70, 4),
      pair(0, "ENDSEC"),
      pair(0, "SECTION"), pair(2, "TABLES"),
      pair(0, "TABLE"), pair(2, "LAYER"), pair(70, 4),
      pair(0, "LAYER"), pair(2, "SITE_BOUNDARY"), pair(70, 0), pair(62, 3), pair(6, "CONTINUOUS"),
      pair(0, "LAYER"), pair(2, "PV_MODULES"), pair(70, 0), pair(62, 4), pair(6, "CONTINUOUS"),
      pair(0, "LAYER"), pair(2, "PANEL_ID"), pair(70, 0), pair(62, 7), pair(6, "CONTINUOUS"),
      pair(0, "LAYER"), pair(2, "OBSTACLES"), pair(70, 0), pair(62, 1), pair(6, "CONTINUOUS"),
      pair(0, "ENDTAB"), pair(0, "ENDSEC"),
      pair(0, "SECTION"), pair(2, "ENTITIES")
    ].join("");
    const footer = [pair(0, "ENDSEC"), pair(0, "EOF")].join("");
    const dxf = header + entities.join("") + footer;
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solar-apps-pv-layout.dxf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNotice(copy.exportedDxf);
  }

  return (
    <section className="pv-layout-page">
      <div className="pv-layout-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" />{copy.eyebrow}</div>
          <div style={{ marginBottom: 10, color: "var(--muted, #9aa9a0)" }}>
            {projectName ? <>Project aktif: <strong style={{ color: "var(--text, #edf5ef)" }}>{projectName}</strong></> : "Belum ada project aktif — draft pribadi."}
          </div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="pv-heading-actions">
          <button className="secondary-button" onClick={reset}><RotateCcw size={15} />{copy.reset}</button>
          <button className="secondary-button" onClick={exportCsv} disabled={!panels.length}><Download size={15} />{copy.export}</button>
          <button className="primary-button" onClick={exportDxf} disabled={!panels.length}><Download size={15} />{copy.exportDxf}</button>
        </div>
      </div>

      <div className="pv-stat-grid">
        <div className="pv-stat">
          <span>{copy.count}</span>
          <strong>{panels.length.toLocaleString()}</strong>
          <small>PV modules</small>
        </div>
        <div className="pv-stat">
          <span>{copy.capacity}</span>
          <strong>{capacity.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>kWp</small></strong>
          <small>{settings.watts} Wp × {panels.length}</small>
        </div>
        <div className="pv-stat">
          <span>{copy.used}</span>
          <strong>{moduleArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>m²</small></strong>
          <small>Panel area only</small>
        </div>
        <div className="pv-stat">
          <span>{copy.fit}</span>
          <strong className={overflow ? "pv-warning" : "pv-good"}>
            {overflow ? "!" : "✓"} <small>{overflow ? copy.overflow : copy.fits}</small>
          </strong>
          <small>Geometric check only</small>
        </div>
      </div>

      <div className="pv-workspace-grid">
        <aside className="panel pv-controls">
          <div className="pv-section-title"><Grid2X2 size={16} /><strong>{copy.system}</strong></div>
          <select value={settings.system} onChange={e => update("system", e.target.value as SystemType)}>
            <option value="Rooftop">{copy.roof}</option>
            <option value="Ground-mounted">{copy.ground}</option>
          </select>

          <div className="pv-section-title"><strong>{copy.area}</strong></div>
          <div className="pv-input-grid">
            <NumberField label={copy.width} value={settings.areaWidth} min={1000} step={100} onChange={v => update("areaWidth", v)} />
            <NumberField label={copy.height} value={settings.areaHeight} min={1000} step={100} onChange={v => update("areaHeight", v)} />
            <NumberField label={copy.setback} value={settings.setback} min={0} step={50} onChange={v => update("setback", v)} />
          </div>

          {isCustomPolygon && (
            <div style={{
              background: "#16251b",
              border: "1px solid #2e4a36",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11,
              color: "#b8f36b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
              marginBottom: 8,
            }}>
              <span>📐 Bentuk: Trapesium / Poligon 4-Sudut</span>
              <button
                type="button"
                className="secondary-button"
                style={{ fontSize: 10, padding: "3px 8px", height: "auto" }}
                onClick={() => {
                  if (!site) return;
                  const nextSite: Site = { ...site, polygonCorners: undefined };
                  setSite(nextSite);
                  saveDraft(panels, settings, obstacles, nextSite);
                  setNotice(id ? "Bentuk atap dikembalikan ke persegi panjang standar." : "Roof shape reset to standard rectangle.");
                }}
              >
                {id ? "Reset Kotak" : "Reset Rect"}
              </button>
            </div>
          )}

          <div className="pv-section-title"><ImagePlus size={16} /><strong>{copy.satellite}</strong></div>

          {site?.coordinates && (
            <div style={{
              background: "#131d16",
              border: "1px solid #28422d",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 11,
              color: "#d0ded4",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--green, #b8f36b)", fontWeight: 700, fontSize: 11 }}>
                  <MapPin size={13} /> {id ? "Geolokasi Terhubung" : "Linked Geolocation"}
                </span>
                {site.rotationDeg !== undefined && (
                  <span style={{ fontSize: 10, color: "#93a69a", background: "#1c2a1f", padding: "1px 6px", borderRadius: 4, border: "1px solid #2e4734" }}>
                    ↻ {site.rotationDeg}°
                  </span>
                )}
              </div>

              {site.address && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "#edf5ef", lineHeight: 1.4, wordBreak: "break-word" }}>
                  📍 {site.address}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#93a69a", fontSize: 10, borderTop: "1px solid #1f2e22", paddingTop: 5 }}>
                <span>Koordinat (GPS):</span>
                <strong style={{ color: "var(--green, #b8f36b)", fontFamily: "monospace" }}>
                  {site.coordinates.lat.toFixed(5)}, {site.coordinates.lng.toFixed(5)}
                </strong>
              </div>

              {site.pitchDegrees !== undefined && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#93a69a", fontSize: 10 }}>
                  <span>Google Solar:</span>
                  <strong style={{ color: "#edf5ef" }}>
                    Pitch {site.pitchDegrees}° · Azimuth {site.azimuthDegrees}°
                  </strong>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            style={{
              width: "100%",
              marginBottom: 8,
              background: "linear-gradient(135deg, #1e3825 0%, #132418 100%)",
              border: "1px solid #3d6e44",
              color: "#edf5ef",
              borderRadius: 7,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }}
            onClick={() => setIsMapsModalOpen(true)}
          >
            <Globe size={16} style={{ color: "var(--green, #b8f36b)" }} />
            <span style={{ color: "#edf5ef", fontWeight: 700 }}>{id ? "🛰️ Cari di Peta Satelit Google" : "🛰️ Scan with Google Maps"}</span>
          </button>

          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleBackgroundUpload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary-button" type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} />{copy.uploadImage}</button>
            {backgroundImage && <button className="secondary-button" type="button" onClick={removeBackgroundImage}><X size={15} />{copy.removeImage}</button>}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted, #93a69a)", lineHeight: 1.5 }}>{copy.imageHelp}</div>
          {backgroundImage && (
            <label className="pv-field">
              <span>{copy.imageOpacity} ({Math.round(backgroundOpacity * 100)}%)</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={backgroundOpacity}
                onChange={e => {
                  const value = Number(e.target.value);
                  setBackgroundOpacity(value);
                  try {
                    localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ projectId, settings, panels, obstacles, site, backgroundImage, backgroundOpacity: value }));
                  } catch { /* ignore storage errors */ }
                }}
              />
            </label>
          )}

          <div className="pv-section-title"><strong>{copy.obstacles}</strong></div>
          <div className="pv-input-grid">
            <NumberField label={copy.obstacleWidth} value={settings.obstacleWidth} min={100} step={100} onChange={v => update("obstacleWidth", v)} />
            <NumberField label={copy.obstacleHeight} value={settings.obstacleHeight} min={100} step={100} onChange={v => update("obstacleHeight", v)} />
          </div>
          <button className="secondary-button pv-generate" onClick={addObstacle}><Grid2X2 size={15} />{copy.addObstacle}</button>
          <div className="pv-selected-box">
            <span>{copy.obstacles}</span>
            <strong>{selectedObstacle?.label ?? `${obstacles.length} total`}</strong>
            <button className="secondary-button" disabled={!selectedObstacle} onClick={deleteSelectedObstacle}><Trash2 size={14} />{copy.deleteObstacle}</button>
          </div>

          <div className="pv-section-title"><strong>{copy.module}</strong></div>
          <div className="pv-input-grid">
            <NumberField label={copy.mw} value={settings.moduleWidth} min={100} step={1} onChange={v => update("moduleWidth", v)} />
            <NumberField label={copy.mh} value={settings.moduleHeight} min={100} step={1} onChange={v => update("moduleHeight", v)} />
            <NumberField label={copy.gap} value={settings.gap} min={0} step={5} onChange={v => update("gap", v)} />
            <NumberField label={copy.watts} value={settings.watts} min={1} step={5} onChange={v => update("watts", v)} />
          </div>

          <div className="pv-section-title"><strong>{copy.layout}</strong></div>
          <div className="pv-input-grid">
            <NumberField label={copy.rows} value={settings.rows} min={1} max={100} step={1} onChange={v => update("rows", v)} />
            <NumberField label={copy.cols} value={settings.cols} min={1} max={100} step={1} onChange={v => update("cols", v)} />
            <NumberField label={copy.tilt} value={settings.tilt} min={0} max={60} step={1} onChange={v => update("tilt", v)} />
          </div>
          <label className="pv-field">
            <span>{copy.orientation}</span>
            <select value={settings.orientation} onChange={e => update("orientation", e.target.value as "landscape" | "portrait")}>
              <option value="landscape">{copy.landscape}</option>
              <option value="portrait">{copy.portrait}</option>
            </select>
          </label>

          {/* HelioScope Auto-Pack & Grid Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <button
              className="primary-button pv-generate"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                borderColor: "#34d399",
                color: "#ffffff",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
              }}
              onClick={autoFillArea}
            >
              <Zap size={16} />{copy.fillArea}
            </button>
            <button className="secondary-button pv-generate" onClick={generate}>
              <WandSparkles size={15} />{copy.generate}
            </button>
          </div>

          {/* Bulk & Selection Card */}
          <div style={{
            marginTop: 10,
            padding: "12px",
            background: selectedIds.size > 0 ? "#14251a" : "#0f1712",
            border: selectedIds.size > 0 ? "1px solid #325a3d" : "1px solid #1e2d23",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedIds.size > 0 ? "var(--green, #b8f36b)" : "var(--muted, #93a69a)", display: "flex", alignItems: "center", gap: 5 }}>
                <CheckSquare size={13} />
                {selectedIds.size > 0
                  ? (id ? `${selectedIds.size} Panel Terpilih` : `${selectedIds.size} Panels Selected`)
                  : (id ? "Tidak ada panel dipilih" : "No panels selected")}
              </span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 10, color: "#edf5ef", fontFamily: "monospace" }}>
                  {(selectedIds.size * settings.watts / 1000).toFixed(2)} kWp
                </span>
              )}
            </div>

            {selectedIds.size > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: 11, padding: "6px 8px", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 5 }}
                  onClick={rotateSelectedPanels}
                  title={id ? "Putar Landscape ⇄ Portrait" : "Rotate Landscape ⇄ Portrait"}
                >
                  <RotateCw size={12} />
                  <span>{id ? "Putar" : "Rotate"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: 11, padding: "6px 8px", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 5 }}
                  onClick={duplicateSelectedPanels}
                  title={id ? "Duplikat panel terpilih" : "Duplicate selected panels"}
                >
                  <Copy size={12} />
                  <span>{id ? "Duplikat" : "Duplicate"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: 11, padding: "6px 8px", color: "#ff8b8b", borderColor: "#552828", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 5 }}
                  onClick={deleteSelectedPanels}
                >
                  <Trash2 size={12} />
                  <span>{id ? `Hapus (${selectedIds.size})` : `Delete (${selectedIds.size})`}</span>
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: 11, padding: "6px 8px", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 5 }}
                  onClick={handleClearSelection}
                >
                  <X size={12} />
                  <span>{id ? "Batal" : "Deselect"}</span>
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
                <span style={{ fontSize: 10, color: "#829588" }}>
                  {id ? "Tarik kotak seleksi di kanvas" : "Drag selection box on canvas"}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: 10, padding: "3px 8px", height: "auto" }}
                  onClick={handleSelectAll}
                  disabled={panels.length === 0}
                >
                  {id ? "Pilih Semua (Ctrl+A)" : "Select All (Ctrl+A)"}
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="panel pv-canvas-panel">
          <div className="pv-canvas-toolbar" style={{ flexWrap: "wrap", gap: 8, padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Tool Mode: Select or Pan */}
              <div style={{ display: "flex", background: "#0e1511", padding: 2, borderRadius: 5, border: "1px solid #233528" }}>
                <button
                  type="button"
                  title={id ? "Mode Seleksi (Tarik kotak untuk memilih banyak)" : "Select Mode (Drag box to select)"}
                  onClick={() => setToolMode("select")}
                  style={{
                    background: toolMode === "select" ? "#1e3525" : "transparent",
                    color: toolMode === "select" ? "#b8f36b" : "#7a8f81",
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: toolMode === "select" ? 700 : 400
                  }}
                >
                  <MousePointer2 size={13} />
                  <span>{id ? "Seleksi" : "Select"}</span>
                </button>

                <button
                  type="button"
                  title={id ? "Mode Geser / Pan (Bisa juga tahan tombol Spasi + drag)" : "Pan Mode (Or hold Space + drag)"}
                  onClick={() => setToolMode("pan")}
                  style={{
                    background: toolMode === "pan" ? "#1e3525" : "transparent",
                    color: toolMode === "pan" ? "#b8f36b" : "#7a8f81",
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: toolMode === "pan" ? 700 : 400
                  }}
                >
                  <Hand size={13} />
                  <span>{id ? "Geser" : "Pan"}</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#0e1511", padding: "2px 4px", borderRadius: 5, border: "1px solid #233528" }}>
                <button
                  type="button"
                  title={id ? "Perkecil (Zoom Out / Ctrl+-)" : "Zoom Out (Ctrl+-)"}
                  onClick={() => setZoom(prev => Math.max(0.4, Number((prev - 0.15).toFixed(2))))}
                  style={{ background: "transparent", border: "none", color: "#a5b8ad", padding: 3, cursor: "pointer", display: "inline-flex" }}
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  title={id ? "Klik untuk reset zoom ke 100%" : "Click to reset zoom to 100%"}
                  onClick={handleResetView}
                  style={{ background: "transparent", border: "none", color: "#edf5ef", fontSize: 10, fontFamily: "monospace", padding: "2px 4px", cursor: "pointer", minWidth: 42, textAlign: "center" }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  title={id ? "Perbesar (Zoom In / Ctrl++)" : "Zoom In (Ctrl++)"}
                  onClick={() => setZoom(prev => Math.min(3.5, Number((prev + 0.15).toFixed(2))))}
                  style={{ background: "transparent", border: "none", color: "#a5b8ad", padding: 3, cursor: "pointer", display: "inline-flex" }}
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  title={id ? "Reset Tampilan Penuh" : "Fit / Reset View"}
                  onClick={handleResetView}
                  style={{ background: "transparent", border: "none", color: "#7a8f81", padding: 3, cursor: "pointer", display: "inline-flex", borderLeft: "1px solid #233528", marginLeft: 2 }}
                >
                  <Maximize2 size={12} />
                </button>
              </div>

              {/* Undo / Redo toolbar buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, borderLeft: "1px solid #233528", paddingLeft: 8 }}>
                <button
                  type="button"
                  title="Undo (Ctrl+Z)"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  style={{
                    background: historyIndex > 0 ? "#1c2a1f" : "transparent",
                    border: "1px solid",
                    borderColor: historyIndex > 0 ? "#2e4a36" : "#1f2a22",
                    color: historyIndex > 0 ? "#edf5ef" : "#4e6154",
                    borderRadius: 4,
                    padding: "3px 6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    cursor: historyIndex > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  <Undo2 size={12} />
                  <span>Undo</span>
                </button>

                <button
                  type="button"
                  title="Redo (Ctrl+Y)"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  style={{
                    background: historyIndex < history.length - 1 ? "#1c2a1f" : "transparent",
                    border: "1px solid",
                    borderColor: historyIndex < history.length - 1 ? "#2e4a36" : "#1f2a22",
                    color: historyIndex < history.length - 1 ? "#edf5ef" : "#4e6154",
                    borderRadius: 4,
                    padding: "3px 6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    cursor: historyIndex < history.length - 1 ? "pointer" : "not-allowed",
                  }}
                >
                  <Redo2 size={12} />
                  <span>Redo</span>
                </button>
              </div>

              {/* Quick selection pill if items are selected */}
              {selectedIds.size > 0 && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "#193522",
                  border: "1px solid #386b45",
                  padding: "2px 7px",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#b8f36b",
                }}>
                  <CheckSquare size={11} />
                  <span>{selectedIds.size} {id ? "terpilih" : "selected"}</span>
                  <button
                    type="button"
                    onClick={deleteSelectedPanels}
                    title={id ? "Hapus modul terpilih" : "Delete selected modules"}
                    style={{ background: "transparent", border: "none", color: "#ff8b8b", cursor: "pointer", display: "inline-flex", padding: 0 }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
              {site?.coordinates && (
                <span style={{ fontSize: 10, color: "var(--green, #b8f36b)", display: "inline-flex", alignItems: "center", gap: 4, background: "#152419", padding: "2px 8px", borderRadius: 4, border: "1px solid #2e4a35" }}>
                  <MapPin size={11} />
                  <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {site.address || `${site.coordinates.lat.toFixed(4)}, ${site.coordinates.lng.toFixed(4)}`}
                  </span>
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--muted, #93a69a)" }}>{settings.areaWidth.toLocaleString()} × {settings.areaHeight.toLocaleString()} mm</span>
            </div>
          </div>

          <div className="pv-canvas-wrap" onWheel={handleWheel} style={{ position: "relative" }}>
            {showZoomHint && (
              <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "rgba(10, 16, 12, 0.88)",
                border: "1px solid #386b45",
                color: "#edf5ef",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                pointerEvents: "none",
                zIndex: 20,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(4px)",
              }}>
                <span style={{ color: "var(--green, #b8f36b)", fontSize: 13 }}>💡</span>
                <span>{id ? "Tahan tombol Ctrl + Scroll untuk Zoom kanvas" : "Hold Ctrl + scroll to zoom canvas"}</span>
              </div>
            )}
            <svg
              className="pv-canvas"
              viewBox="0 0 1000 600"
              role="img"
              aria-label="Interactive photovoltaic panel layout canvas"
              onPointerDown={canvasPointerDown}
              onPointerMove={canvasPointerMove}
              onPointerUp={finishDrag}
              onPointerLeave={finishDrag}
              style={{
                cursor: isPanningRef.current ? "grabbing" : (toolMode === "pan" || isSpacePressedRef.current ? "grab" : "crosshair")
              }}
            >
              <defs>
                <pattern id="pv-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#25322b" strokeWidth="0.7" />
                </pattern>
                <pattern id="pv-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                  <rect width="100" height="100" fill="url(#pv-grid-small)" />
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#34463a" strokeWidth="1" />
                </pattern>
                <clipPath id="polygon-boundary-clip">
                  <polygon points={svgPolygonPoints} />
                </clipPath>
              </defs>
              <rect width="1000" height="600" fill="url(#pv-grid-large)" />

              {/* Master transformed group for Zoom & Pan */}
              <g transform={`translate(${500 + pan.x}, ${300 + pan.y}) scale(${zoom}) translate(-500, -300)`}>
                {backgroundImage && (
                  <g clipPath="url(#polygon-boundary-clip)">
                    <image
                      href={backgroundImage}
                      x={originX}
                      y={originY}
                      width={settings.areaWidth * scale}
                      height={settings.areaHeight * scale}
                      preserveAspectRatio="none"
                      opacity={backgroundOpacity}
                      pointerEvents="none"
                    />
                  </g>
                )}

                {/* Site boundary polygon (Trapezoid / Custom Quad / Rect) */}
                <polygon
                  points={svgPolygonPoints}
                  fill="#14221a"
                  fillOpacity={backgroundImage ? ".15" : ".65"}
                  stroke="#b8f36b"
                  strokeWidth="2"
                  strokeDasharray="8 4"
                />

                {/* Obstacles */}
                {obstacles.map(obstacle => (
                  <g
                    key={obstacle.id}
                    data-obstacle="true"
                    onPointerDown={e => {
                      if (toolMode === "pan" || isSpacePressedRef.current) return;
                      e.stopPropagation();
                      setSelectedObstacleId(obstacle.id);
                      setSelectedIds(new Set());
                      setDraggingObstacleId(obstacle.id);
                      (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
                    }}
                    style={{ cursor: "move" }}
                  >
                    <rect
                      x={originX + obstacle.x * scale}
                      y={originY + obstacle.y * scale}
                      width={Math.max(1, obstacle.w * scale)}
                      height={Math.max(1, obstacle.h * scale)}
                      fill={selectedObstacleId === obstacle.id ? "#ff9f9f" : "#d45d5d"}
                      fillOpacity=".38"
                      stroke={selectedObstacleId === obstacle.id ? "#ffd0d0" : "#ff7777"}
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                    <text
                      x={originX + (obstacle.x + obstacle.w / 2) * scale}
                      y={originY + (obstacle.y + obstacle.h / 2) * scale}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffe2e2"
                      fontSize="11"
                    >
                      {obstacle.label}
                    </text>
                  </g>
                ))}

                {/* Inset setback boundary polygon */}
                <polygon
                  points={svgSetbackPolygonPoints}
                  fill="none"
                  stroke="#e8b86b"
                  strokeWidth="1.5"
                  strokeDasharray="3 5"
                />

                {/* Vertex handles if custom polygon */}
                {isCustomPolygon && activeCorners.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={originX + pt.x * scale}
                    cy={originY + pt.y * scale}
                    r="4"
                    fill="#b8f36b"
                    stroke="#111713"
                    strokeWidth="1.5"
                  />
                ))}

                {/* PV Modules */}
                {panels.map((panel, index) => {
                  const isSelected = selectedIds.has(panel.id);
                  return (
                    <g
                      key={panel.id}
                      data-panel="true"
                      onPointerDown={e => handlePanelPointerDown(e, panel)}
                      style={{ cursor: "move" }}
                    >
                      <rect
                        x={originX + panel.x * scale}
                        y={originY + panel.y * scale}
                        width={Math.max(1, panel.w * scale)}
                        height={Math.max(1, panel.h * scale)}
                        rx="2"
                        fill={isSelected ? "#4fa672" : "#387a55"}
                        fillOpacity={isSelected ? ".96" : ".86"}
                        stroke={isSelected ? "#b8f36b" : "#7ec696"}
                        strokeWidth={isSelected ? 2.5 : 1}
                      />
                      {isSelected && (
                        <rect
                          x={originX + panel.x * scale - 1}
                          y={originY + panel.y * scale - 1}
                          width={Math.max(1, panel.w * scale) + 2}
                          height={Math.max(1, panel.h * scale) + 2}
                          fill="none"
                          stroke="#b8f36b"
                          strokeWidth="0.8"
                          strokeDasharray="3 2"
                          pointerEvents="none"
                        />
                      )}
                      <path
                        d={`M ${originX + panel.x * scale + panel.w * scale / 2} ${originY + panel.y * scale} V ${originY + (panel.y + panel.h) * scale}`}
                        stroke="#10251b"
                        strokeWidth="1"
                      />
                      <path
                        d={`M ${originX + panel.x * scale} ${originY + panel.y * scale + panel.h * scale / 2} H ${originX + (panel.x + panel.w) * scale}`}
                        stroke="#10251b"
                        strokeWidth="1"
                      />
                      {panel.w * scale > 26 && panel.h * scale > 16 && (
                        <text
                          x={originX + (panel.x + panel.w / 2) * scale}
                          y={originY + (panel.y + panel.h / 2) * scale + 3}
                          textAnchor="middle"
                          fontSize="9"
                          fill={isSelected ? "#b8f36b" : "#e2f3e8"}
                          fontWeight="700"
                        >
                          {String(index + 1).padStart(2, "0")}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Marquee Box Selection Overlay */}
                {marquee && (
                  <rect
                    x={originX + Math.min(marquee.startX, marquee.currentX) * scale}
                    y={originY + Math.min(marquee.startY, marquee.currentY) * scale}
                    width={Math.max(1, Math.abs(marquee.currentX - marquee.startX) * scale)}
                    height={Math.max(1, Math.abs(marquee.currentY - marquee.startY) * scale)}
                    fill="rgba(184, 243, 107, 0.22)"
                    stroke="#b8f36b"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${6 / zoom} ${3 / zoom}`}
                    pointerEvents="none"
                  />
                )}

                <text x={originX} y={Math.max(18, originY - 12)} fill="#b8f36b" fontSize="12">
                  SITE BOUNDARY · {settings.system.toUpperCase()}{isCustomPolygon ? " (TRAPEZIUM / POLIGON)" : ""}
                </text>
              </g>
            </svg>
          </div>

          <div className="pv-canvas-footer">
            <span><i className="pv-legend-dot" /> {panels.length} modules</span>
            <span>
              {copy.hint} · <strong style={{ color: "#b8f36b" }}>Tarik Kotak</strong> Seleksi Bulk · <strong style={{ color: "#b8f36b" }}>Scroll</strong> Zoom · <strong style={{ color: "#b8f36b" }}>Space+Drag</strong> Geser · <strong style={{ color: "#b8f36b" }}>Ctrl+Z</strong> Undo
            </span>
          </div>

          {notice && <div className="pv-notice">{notice}</div>}
          {!panels.length && <div className="pv-empty-note">{copy.empty}</div>}
        </div>
      </div>

      <div className="pv-disclaimer">
        MVP geometry only: obstacle movement removes panels that would overlap the moved obstacle. This layout does not account for row-to-row shading, wind/seismic loads, structural checks, electrical string limits, or code compliance. Validate designs with project-specific engineering requirements.
      </div>

      <GoogleMapsModal
        isOpen={isMapsModalOpen}
        onClose={() => setIsMapsModalOpen(false)}
        onApply={handleGoogleMapsApply}
        initialWidthMm={settings.areaWidth}
        initialHeightMm={settings.areaHeight}
        initialPolygonPoints={site?.polygonPoints}
      />
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="pv-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  );
}
