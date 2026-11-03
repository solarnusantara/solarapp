import { getProjectDefaultLayout } from "./defaultProjectsData";
import { useMemo, useRef, useState } from "react";
import { Download, Grid2X2, MousePointer2, RotateCcw, Trash2, WandSparkles, ImagePlus, X, Globe } from "lucide-react";
import GoogleMapsModal from "./GoogleMapsModal";

type Lang = "en" | "id";
type Panel = { id: number; x: number; y: number; w: number; h: number };
type SystemType = "Rooftop" | "Ground-mounted";
type Obstacle = { id: number; x: number; y: number; w: number; h: number; label: string };

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

function storageKey(userId: string, projectId: string | null) { return `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`; }

function loadSaved(userId: string, projectId: string | null): { settings: typeof defaults; panels: Panel[]; obstacles?: Obstacle[]; backgroundImage?: string; backgroundOpacity?: number; site?: { coordinates: { lat: number; lng: number }; address: string } } | null {
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

export default function PVLayout({ lang, userId, projectId = null, projectName = null, projectType = null }: { lang: Lang; userId: string; projectId?: string | null; projectName?: string | null; projectType?: SystemType | null }) {
  const saved = useMemo(() => loadSaved(userId, projectId), [userId, projectId]);
  const [settings, setSettings] = useState({ ...defaults, system: projectType ?? defaults.system, ...(saved?.settings ?? {}) });
  const [panels, setPanels] = useState<Panel[]>(saved?.panels ?? []);
  const [obstacles, setObstacles] = useState<Obstacle[]>(saved?.obstacles ?? []);
  const [backgroundImage, setBackgroundImage] = useState<string>(saved?.backgroundImage ?? "");
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(saved?.backgroundOpacity ?? 0.8);
  const [site, setSite] = useState(saved?.site ?? null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedObstacleId, setSelectedObstacleId] = useState<number | null>(null);
  const [draggingObstacleId, setDraggingObstacleId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [isMapsModalOpen, setIsMapsModalOpen] = useState(false);
  const id = lang === "id";

  const copy = id ? {
    eyebrow: "EDITOR LAYOUT PV", title: "PV Layout 2D", subtitle: "Generate susunan modul otomatis, lalu rapikan secara manual di kanvas.",
    system: "Jenis sistem", roof: "Rooftop / Atap", ground: "Ground-mounted / Lahan", area: "Batas area (mm)", width: "Lebar", height: "Panjang", module: "Spesifikasi modul", mw: "Lebar modul", mh: "Tinggi modul", gap: "Jarak antarmodul", watts: "Daya modul (Wp)", layout: "Susunan", rows: "Baris", cols: "Kolom", tilt: "Kemiringan (°)", orientation: "Orientasi modul", landscape: "Landscape", portrait: "Portrait", generate: "Generate otomatis", reset: "Reset layout", selected: "Panel dipilih", delete: "Hapus panel", hint: "Klik area kosong untuk menambah panel. Seret panel atau obstacle untuk memindahkannya.", capacity: "Kapasitas DC", count: "Jumlah modul", used: "Area modul (perkiraan)", fit: "Status batas area", fits: "Layout masuk batas area", overflow: "Sebagian modul di luar batas", export: "Ekspor CSV", exportDxf: "Ekspor DXF", exportedDxf: "DXF layout diunduh.", saved: "Draft tersimpan di browser", empty: "Belum ada panel. Klik Generate otomatis untuk mulai.", canvas: "Kanvas desain", snap: "Koordinat dalam mm", confirmReset: "Layout direset.", generated: "Layout otomatis dibuat.", exported: "CSV layout diunduh.", manual: "Panel ditambahkan.", obstacles: "Obstacle / area terlarang", satellite: "Citra lokasi / satelit", uploadImage: "Unggah citra", removeImage: "Hapus citra", imageOpacity: "Transparansi citra", imageHelp: "Unggah screenshot Google Earth atau citra lokasi. Atur lebar/panjang area agar sesuai ukuran bangunan yang diketahui.", setback: "Jarak bebas tepi (mm)", obstacleWidth: "Lebar obstacle", obstacleHeight: "Panjang obstacle", addObstacle: "Tambah obstacle tengah", deleteObstacle: "Hapus obstacle dipilih", obstacleAdded: "Obstacle ditambahkan.", obstacleDeleted: "Obstacle dihapus.", obstacleOverlap: "Panel tidak boleh menutupi obstacle atau setback."
  } : {
    eyebrow: "PV LAYOUT EDITOR", title: "PV Layout 2D", subtitle: "Generate a module arrangement, then refine it manually on the canvas.",
    system: "System type", roof: "Rooftop", ground: "Ground-mounted", area: "Site boundary (mm)", width: "Width", height: "Length", module: "Module specification", mw: "Module width", mh: "Module height", gap: "Module gap", watts: "Module power (Wp)", layout: "Array arrangement", rows: "Rows", cols: "Columns", tilt: "Tilt (°)", orientation: "Module orientation", landscape: "Landscape", portrait: "Portrait", generate: "Auto-generate", reset: "Reset layout", selected: "Selected panel", delete: "Delete panel", hint: "Click empty space to add a panel. Drag panels or obstacles to move them.", capacity: "DC capacity", count: "Module count", used: "Approx. module area", fit: "Boundary check", fits: "Layout fits boundary", overflow: "Some modules are outside boundary", export: "Export CSV", exportDxf: "Export DXF", exportedDxf: "DXF layout downloaded.", saved: "Draft saved in this browser", empty: "No panels yet. Select Auto-generate to start.", canvas: "Design canvas", snap: "Coordinates in mm", confirmReset: "Layout reset.", generated: "Automatic layout generated.", exported: "Layout CSV downloaded.", manual: "Panel added.", obstacles: "Obstacles / exclusion zones", satellite: "Site / satellite image", uploadImage: "Upload image", removeImage: "Remove image", imageOpacity: "Image opacity", imageHelp: "Upload a Google Earth screenshot or site image. Set area width/length to match a known building dimension.", setback: "Edge setback (mm)", obstacleWidth: "Obstacle width", obstacleHeight: "Obstacle length", addObstacle: "Add centered obstacle", deleteObstacle: "Delete selected obstacle", obstacleAdded: "Obstacle added.", obstacleDeleted: "Obstacle deleted.", obstacleOverlap: "Panels cannot overlap obstacles or the edge setback."
  };

  const moduleW = settings.orientation === "landscape" ? settings.moduleWidth : settings.moduleHeight;
  const moduleH = settings.orientation === "landscape" ? settings.moduleHeight : settings.moduleWidth;
  const capacity = panels.length * settings.watts / 1000;
  const moduleArea = panels.reduce((sum, p) => sum + p.w * p.h, 0) / 1_000_000;
  const overflow = panels.some(p =>
    p.x < settings.setback || p.y < settings.setback ||
    p.x + p.w > settings.areaWidth - settings.setback ||
    p.y + p.h > settings.areaHeight - settings.setback ||
    obstacles.some(o => p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y)
  );
  const selected = panels.find(p => p.id === selectedId) ?? null;
  const selectedObstacle = obstacles.find(o => o.id === selectedObstacleId) ?? null;
  const withinSetback = (p: Pick<Panel, "x" | "y" | "w" | "h">) =>
    p.x >= settings.setback && p.y >= settings.setback &&
    p.x + p.w <= settings.areaWidth - settings.setback &&
    p.y + p.h <= settings.areaHeight - settings.setback;
  const intersectsObstacle = (p: Pick<Panel, "x" | "y" | "w" | "h">, o: Obstacle) =>
    p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y;
  const isPlacementValid = (p: Pick<Panel, "x" | "y" | "w" | "h">, list: Obstacle[] = obstacles) =>
    withinSetback(p) && !list.some(o => intersectsObstacle(p, o));

  function handleGoogleMapsApply(data: {
    widthMm: number;
    heightMm: number;
    imageSrc: string;
    coordinates: { lat: number; lng: number };
    address: string;
    polygonPoints?: Array<{ lat: number; lng: number }>;
    rotationDeg?: number;
    pitchDegrees?: number;
    azimuthDegrees?: number;
    googleSolarData?: any;
  }) {
    const nextSettings = { ...settings, areaWidth: data.widthMm, areaHeight: data.heightMm };
    const nextSite = {
      coordinates: data.coordinates,
      address: data.address,
      polygonPoints: data.polygonPoints,
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
    saveDraft(safePanels, nextSettings, obstacles, nextSite);
    const solarInfo = data.pitchDegrees !== undefined ? ` [Google Solar Pitch: ${data.pitchDegrees}°, Azimuth: ${data.azimuthDegrees}°]` : "";
    const rotInfo = data.rotationDeg ? ` [Rotasi: ${data.rotationDeg}°]` : "";
    setNotice(id ? `Dimensi & batas area diperbarui: ${data.widthMm.toLocaleString()} × ${data.heightMm.toLocaleString()} mm.${rotInfo}${solarInfo}` : `Area dimensions & boundary updated: ${data.widthMm.toLocaleString()} × ${data.heightMm.toLocaleString()} mm.${rotInfo}${solarInfo}`);
  }

  function handleBackgroundUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice(id ? "Pilih file gambar yang valid." : "Choose a valid image file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        // Compress image to keep browser storage manageable.
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
    // Persist settings immediately so the 3D viewer reads the latest 2D parameters.
    saveDraft(panels, nextSettings, obstacles);
  }
  function saveDraft(nextPanels = panels, nextSettings = settings, nextObstacles = obstacles, nextSite = site) {
    try { localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ projectId, settings: nextSettings, panels: nextPanels, obstacles: nextObstacles, site: nextSite, backgroundImage, backgroundOpacity })); } catch { /* image or draft may exceed browser storage quota */ }
  }
  function generate() {
    const rows = Math.max(1, Math.min(100, Math.floor(Number(settings.rows) || 1)));
    const cols = Math.max(1, Math.min(100, Math.floor(Number(settings.cols) || 1)));
    const totalW = cols * moduleW + (cols - 1) * settings.gap;
    const totalH = rows * moduleH + (rows - 1) * settings.gap;
    const startX = Math.max(0, (settings.areaWidth - totalW) / 2);
    const startY = Math.max(0, (settings.areaHeight - totalH) / 2);
    const next: Panel[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const candidate = { id: Date.now() + r * cols + c, x: startX + c * (moduleW + settings.gap), y: startY + r * (moduleH + settings.gap), w: moduleW, h: moduleH };
      if (isPlacementValid(candidate)) next.push(candidate);
    }
    setPanels(next); setSelectedId(null); saveDraft(next); setNotice(copy.generated);
  }
  function reset() { setPanels([]); setSelectedId(null); saveDraft([]); setNotice(copy.confirmReset); }
  function addObstacle() {
    const w = Math.max(100, Math.min(settings.obstacleWidth, settings.areaWidth));
    const h = Math.max(100, Math.min(settings.obstacleHeight, settings.areaHeight));
    const next = [...obstacles, { id: Date.now(), x: Math.max(0, (settings.areaWidth - w) / 2), y: Math.max(0, (settings.areaHeight - h) / 2), w, h, label: `OBS-${String(obstacles.length + 1).padStart(2, "0")}` }];
    setObstacles(next); setSelectedObstacleId(next[next.length - 1].id);
    const safePanels = panels.filter(p => isPlacementValid(p, next));
    setPanels(safePanels); saveDraft(safePanels, settings, next); setNotice(copy.obstacleAdded);
  }
  function deleteSelectedObstacle() {
    if (selectedObstacleId === null) return;
    const next = obstacles.filter(o => o.id !== selectedObstacleId);
    setObstacles(next); setSelectedObstacleId(null); saveDraft(panels, settings, next); setNotice(copy.obstacleDeleted);
  }
  function pointFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = (event.clientX - rect.left) / rect.width * 1000;
    const sy = (event.clientY - rect.top) / rect.height * 600;
    return { x: (sx - originX) / scale, y: (sy - originY) / scale };
  }
  const scale = Math.min(840 / Math.max(settings.areaWidth, 1), 430 / Math.max(settings.areaHeight, 1));
  const originX = (1000 - settings.areaWidth * scale) / 2;
  const originY = (600 - settings.areaHeight * scale) / 2;

  function canvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-panel]") ) return;
    const p = pointFromEvent(event);
    if (p.x < 0 || p.y < 0 || p.x > settings.areaWidth || p.y > settings.areaHeight) return;
    const x = Math.max(0, Math.min(settings.areaWidth - moduleW, Math.round((p.x - moduleW / 2) / 50) * 50));
    const y = Math.max(0, Math.min(settings.areaHeight - moduleH, Math.round((p.y - moduleH / 2) / 50) * 50));
    const candidate = { id: Date.now(), x, y, w: moduleW, h: moduleH };
    if (!isPlacementValid(candidate)) { setNotice(copy.obstacleOverlap); return; }
    const next = [...panels, candidate];
    setPanels(next); setSelectedId(next[next.length - 1].id); saveDraft(next); setNotice(copy.manual);
  }
  function canvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const p = pointFromEvent(event);
    if (draggingObstacleId !== null) {
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
      saveDraft(nextPanels, settings, nextObstacles);
      return;
    }
    if (draggingId === null) return;
    const next = panels.map(panel => {
      if (panel.id !== draggingId) return panel;
      const candidate = { ...panel, x: Math.max(0, Math.min(settings.areaWidth - panel.w, Math.round((p.x - panel.w / 2) / 50) * 50)), y: Math.max(0, Math.min(settings.areaHeight - panel.h, Math.round((p.y - panel.h / 2) / 50) * 50)) };
      return isPlacementValid(candidate) ? candidate : panel;
    });
    setPanels(next);
    saveDraft(next);
  }
  function finishDrag() { setDraggingId(null); setDraggingObstacleId(null); }
  function deleteSelected() {
    if (selectedId === null) return;
    const next = panels.filter(p => p.id !== selectedId); setPanels(next); setSelectedId(null); saveDraft(next);
  }
  function exportCsv() {
    const lines = [["Panel ID", "X (mm)", "Y (mm)", "Width (mm)", "Height (mm)", "Power (Wp)"] , ...panels.map((p, i) => [`PV-${String(i + 1).padStart(3, "0")}`, p.x, p.y, p.w, p.h, settings.watts])];
    const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "solar-apps-pv-layout.csv"; a.click(); URL.revokeObjectURL(url); setNotice(copy.exported);
  }
  function exportDxf() {
    // AutoCAD R12 ASCII DXF. All geometry is emitted in millimetres.
    // Canvas Y grows downward; DXF coordinates are mapped to a bottom-left origin.
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
    // Site boundary, origin at lower-left (0,0).
    addRect(0, 0, settings.areaWidth, settings.areaHeight, "SITE_BOUNDARY");
    obstacles.forEach(obstacle => {
      const y = settings.areaHeight - obstacle.y - obstacle.h;
      addRect(obstacle.x, y, obstacle.w, obstacle.h, "OBSTACLES");
    });
    panels.forEach((panel, index) => {
      const x = panel.x;
      const y = settings.areaHeight - panel.y - panel.h;
      addRect(x, y, panel.w, panel.h, "PV_MODULES");
      // Small panel ID text, useful in CAD; height scales with module size.
      const textHeight = Math.max(40, Math.min(120, Math.min(panel.w, panel.h) / 8));
      if (panel.w > textHeight * 2 && panel.h > textHeight * 1.5) {
        entities.push(pair(0, "TEXT"), pair(8, "PANEL_ID"), pair(10, x + panel.w / 2 - textHeight), pair(20, y + panel.h / 2), pair(30, 0), pair(40, textHeight), pair(1, `PV-${String(index + 1).padStart(3, "0")}`), pair(50, 0));
      }
    });
    const header = [
      pair(0, "SECTION"), pair(2, "HEADER"),
      pair(9, "$ACADVER"), pair(1, "AC1009"),
      pair(9, "$INSBASE"), pair(10, 0), pair(20, 0), pair(30, 0),
      pair(9, "$INSUNITS"), pair(70, 4), // 4 = millimetres
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
    const a = document.createElement("a"); a.href = url; a.download = "solar-apps-pv-layout.dxf"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setNotice(copy.exportedDxf);
  }

  return <section className="pv-layout-page">
    <div className="pv-layout-heading"><div><div className="eyebrow"><span className="live-dot" />{copy.eyebrow}</div><div style={{ marginBottom: 10, color: "var(--muted, #9aa9a0)" }}>{projectName ? <>Project aktif: <strong style={{ color: "var(--text, #edf5ef)" }}>{projectName}</strong></> : "Belum ada project aktif — draft pribadi."}</div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><div className="pv-heading-actions"><button className="secondary-button" onClick={reset}><RotateCcw size={15} />{copy.reset}</button><button className="secondary-button" onClick={exportCsv} disabled={!panels.length}><Download size={15} />{copy.export}</button><button className="primary-button" onClick={exportDxf} disabled={!panels.length}><Download size={15} />{copy.exportDxf}</button></div></div>
    <div className="pv-stat-grid">
      <div className="pv-stat"><span>{copy.count}</span><strong>{panels.length.toLocaleString()}</strong><small>PV modules</small></div>
      <div className="pv-stat"><span>{copy.capacity}</span><strong>{capacity.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>kWp</small></strong><small>{settings.watts} Wp × {panels.length}</small></div>
      <div className="pv-stat"><span>{copy.used}</span><strong>{moduleArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>m²</small></strong><small>Panel area only</small></div>
      <div className="pv-stat"><span>{copy.fit}</span><strong className={overflow ? "pv-warning" : "pv-good"}>{overflow ? "!" : "✓"} <small>{overflow ? copy.overflow : copy.fits}</small></strong><small>Geometric check only</small></div>
    </div>
    <div className="pv-workspace-grid">
      <aside className="panel pv-controls">
        <div className="pv-section-title"><Grid2X2 size={16} /><strong>{copy.system}</strong></div>
        <select value={settings.system} onChange={e => update("system", e.target.value as SystemType)}><option value="Rooftop">{copy.roof}</option><option value="Ground-mounted">{copy.ground}</option></select>
        <div className="pv-section-title"><strong>{copy.area}</strong></div>
        <div className="pv-input-grid"><NumberField label={copy.width} value={settings.areaWidth} min={1000} step={100} onChange={v => update("areaWidth", v)} /><NumberField label={copy.height} value={settings.areaHeight} min={1000} step={100} onChange={v => update("areaHeight", v)} /><NumberField label={copy.setback} value={settings.setback} min={0} step={50} onChange={v => update("setback", v)} /></div>
        <div className="pv-section-title"><ImagePlus size={16} /><strong>{copy.satellite}</strong></div>
        <button className="primary-button" type="button" style={{ width: "100%", marginBottom: 8, background: "linear-gradient(135deg, #1b3821 0%, #112617 100%)", border: "1px solid #3d6e44" }} onClick={() => setIsMapsModalOpen(true)}>
          <Globe size={15} /> {id ? "🛰️ Cari di Peta Satelit Google" : "🛰️ Scan with Google Maps"}
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { handleBackgroundUpload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="secondary-button" type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} />{copy.uploadImage}</button>
          {backgroundImage && <button className="secondary-button" type="button" onClick={removeBackgroundImage}><X size={15} />{copy.removeImage}</button>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted, #93a69a)", lineHeight: 1.5 }}>{copy.imageHelp}</div>
        {backgroundImage && <label className="pv-field"><span>{copy.imageOpacity} ({Math.round(backgroundOpacity * 100)}%)</span><input type="range" min="0" max="1" step="0.05" value={backgroundOpacity} onChange={e => { const value = Number(e.target.value); setBackgroundOpacity(value); try { localStorage.setItem(storageKey(userId, projectId), JSON.stringify({ projectId, settings, panels, obstacles, site, backgroundImage, backgroundOpacity: value })); } catch { /* ignore storage errors */ } }} /></label>}
        <div className="pv-section-title"><strong>{copy.obstacles}</strong></div>
        <div className="pv-input-grid"><NumberField label={copy.obstacleWidth} value={settings.obstacleWidth} min={100} step={100} onChange={v => update("obstacleWidth", v)} /><NumberField label={copy.obstacleHeight} value={settings.obstacleHeight} min={100} step={100} onChange={v => update("obstacleHeight", v)} /></div>
        <button className="secondary-button pv-generate" onClick={addObstacle}><Grid2X2 size={15} />{copy.addObstacle}</button>
        <div className="pv-selected-box"><span>{copy.obstacles}</span><strong>{selectedObstacle?.label ?? `${obstacles.length} total`}</strong><button className="secondary-button" disabled={!selectedObstacle} onClick={deleteSelectedObstacle}><Trash2 size={14} />{copy.deleteObstacle}</button></div>
        <div className="pv-section-title"><strong>{copy.module}</strong></div>
        <div className="pv-input-grid"><NumberField label={copy.mw} value={settings.moduleWidth} min={100} step={1} onChange={v => update("moduleWidth", v)} /><NumberField label={copy.mh} value={settings.moduleHeight} min={100} step={1} onChange={v => update("moduleHeight", v)} /><NumberField label={copy.gap} value={settings.gap} min={0} step={5} onChange={v => update("gap", v)} /><NumberField label={copy.watts} value={settings.watts} min={1} step={5} onChange={v => update("watts", v)} /></div>
        <div className="pv-section-title"><strong>{copy.layout}</strong></div>
        <div className="pv-input-grid"><NumberField label={copy.rows} value={settings.rows} min={1} max={100} step={1} onChange={v => update("rows", v)} /><NumberField label={copy.cols} value={settings.cols} min={1} max={100} step={1} onChange={v => update("cols", v)} /><NumberField label={copy.tilt} value={settings.tilt} min={0} max={60} step={1} onChange={v => update("tilt", v)} /></div>
        <label className="pv-field"><span>{copy.orientation}</span><select value={settings.orientation} onChange={e => update("orientation", e.target.value as "landscape" | "portrait")}><option value="landscape">{copy.landscape}</option><option value="portrait">{copy.portrait}</option></select></label>
        <button className="primary-button pv-generate" onClick={generate}><WandSparkles size={16} />{copy.generate}</button>
        <div className="pv-selected-box"><span>{copy.selected}</span><strong>{selected ? `PV-${String(panels.findIndex(p => p.id === selectedId) + 1).padStart(3, "0")}` : "—"}</strong><button className="secondary-button" disabled={!selected} onClick={deleteSelected}><Trash2 size={14} />{copy.delete}</button></div>
      </aside>
      <div className="panel pv-canvas-panel">
        <div className="pv-canvas-toolbar"><div><MousePointer2 size={15} /><strong>{copy.canvas}</strong><span className="pv-units">{copy.snap}</span></div><span>{settings.areaWidth.toLocaleString()} × {settings.areaHeight.toLocaleString()} mm</span></div>
        <div className="pv-canvas-wrap"><svg className="pv-canvas" viewBox="0 0 1000 600" role="img" aria-label="Interactive photovoltaic panel layout canvas" onPointerDown={canvasPointerDown} onPointerMove={canvasPointerMove} onPointerUp={finishDrag} onPointerLeave={finishDrag}>
          <defs><pattern id="pv-grid-small" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#25322b" strokeWidth="0.7" /></pattern><pattern id="pv-grid-large" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#pv-grid-small)"/><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#34463a" strokeWidth="1" /></pattern></defs>
          <rect width="1000" height="600" fill="url(#pv-grid-large)" />
          {backgroundImage && <image href={backgroundImage} x={originX} y={originY} width={settings.areaWidth * scale} height={settings.areaHeight * scale} preserveAspectRatio="none" opacity={backgroundOpacity} pointerEvents="none" />}
          <rect x={originX} y={originY} width={settings.areaWidth * scale} height={settings.areaHeight * scale} fill={backgroundImage ? "#14221a" : "#14221a"} fillOpacity={backgroundImage ? ".08" : ".65"} stroke="#b8f36b" strokeWidth="2" strokeDasharray="8 4" />
          {obstacles.map(obstacle => <g key={obstacle.id} onPointerDown={e => { e.stopPropagation(); setSelectedObstacleId(obstacle.id); setSelectedId(null); setDraggingObstacleId(obstacle.id); (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId); }} style={{ cursor: "move" }}>
            <rect x={originX + obstacle.x * scale} y={originY + obstacle.y * scale} width={Math.max(1, obstacle.w * scale)} height={Math.max(1, obstacle.h * scale)} fill={selectedObstacleId === obstacle.id ? "#ff9f9f" : "#d45d5d"} fillOpacity=".38" stroke={selectedObstacleId === obstacle.id ? "#ffd0d0" : "#ff7777"} strokeWidth="2" strokeDasharray="5 3" />
            <text x={originX + (obstacle.x + obstacle.w / 2) * scale} y={originY + (obstacle.y + obstacle.h / 2) * scale} textAnchor="middle" dominantBaseline="middle" fill="#ffe2e2" fontSize="11">{obstacle.label}</text>
          </g>)}
          <rect x={originX + settings.setback * scale} y={originY + settings.setback * scale} width={Math.max(0, (settings.areaWidth - 2 * settings.setback) * scale)} height={Math.max(0, (settings.areaHeight - 2 * settings.setback) * scale)} fill="none" stroke="#e8b86b" strokeWidth="1.5" strokeDasharray="3 5" />
          {panels.map((panel, index) => <g key={panel.id} data-panel="true" onPointerDown={e => { e.stopPropagation(); setSelectedId(panel.id); setDraggingId(panel.id); (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId); }} style={{ cursor: "move" }}>
            <rect x={originX + panel.x * scale} y={originY + panel.y * scale} width={Math.max(1, panel.w * scale)} height={Math.max(1, panel.h * scale)} rx="2" fill={selectedId === panel.id ? "#c8ff8d" : "#438c64"} fillOpacity={selectedId === panel.id ? ".95" : ".88"} stroke={selectedId === panel.id ? "#efffd8" : "#8bd7a5"} strokeWidth={selectedId === panel.id ? 2 : 1} />
            <path d={`M ${originX + panel.x * scale + panel.w * scale / 2} ${originY + panel.y * scale} V ${originY + (panel.y + panel.h) * scale}`} stroke="#173b2a" strokeWidth="1" />
            <path d={`M ${originX + panel.x * scale} ${originY + panel.y * scale + panel.h * scale / 2} H ${originX + (panel.x + panel.w) * scale}`} stroke="#173b2a" strokeWidth="1" />
            {panel.w * scale > 30 && panel.h * scale > 18 && <text x={originX + (panel.x + panel.w / 2) * scale} y={originY + (panel.y + panel.h / 2) * scale + 3} textAnchor="middle" fontSize="10" fill="#102217" fontWeight="700">{String(index + 1).padStart(2, "0")}</text>}
          </g>)}
          <text x={originX} y={Math.max(18, originY - 12)} fill="#b8f36b" fontSize="12">SITE BOUNDARY · {settings.system.toUpperCase()}</text>
        </svg></div>
        <div className="pv-canvas-footer"><span><i className="pv-legend-dot" /> {panels.length} modules</span><span>{copy.hint}</span></div>
        {notice && <div className="pv-notice">{notice}</div>}
        {!panels.length && <div className="pv-empty-note">{copy.empty}</div>}
      </div>
    </div>
    <div className="pv-disclaimer">MVP geometry only: obstacle movement removes panels that would overlap the moved obstacle. This layout does not account for row-to-row shading, wind/seismic loads, structural checks, electrical string limits, or code compliance. Validate designs with project-specific engineering requirements.</div>
    <GoogleMapsModal
      isOpen={isMapsModalOpen}
      onClose={() => setIsMapsModalOpen(false)}
      onApply={handleGoogleMapsApply}
      initialWidthMm={settings.areaWidth}
      initialHeightMm={settings.areaHeight}
    />
  </section>;
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="pv-field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} /></label>;
}
