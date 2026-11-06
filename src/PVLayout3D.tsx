import { getProjectDefaultLayout } from "./defaultProjectsData";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  RotateCcw,
  RefreshCw,
  Sun,
  Mountain,
  Play,
  Pause,
  Clock,
  RotateCw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Layers,
  Check
} from "lucide-react";

type Panel = { id: number; x: number; y: number; w: number; h: number };
type Obstacle = { id: number; x: number; y: number; w: number; h: number; label?: string; heightM?: number };
type Site = { coordinates: { lat: number; lng: number }; address?: string; polygonCorners?: Array<{ x: number; y: number }> };
type DemGrid = { rows: number; cols: number; elevations: number[]; min: number; max: number; source: string; fetchedAt: string };
type SavedLayout = {
  projectId?: string | null;
  settings?: { system?: string; areaWidth?: number; areaHeight?: number; moduleWidth?: number; moduleHeight?: number; tilt?: number; orientation?: string; watts?: number; panelWatts?: number };
  panels?: Panel[];
  obstacles?: Obstacle[];
  site?: Site | null;
  dem?: DemGrid | null;
};
const STORAGE_KEY = "solar-apps-pv-layout-v1";

function solarPosition(date: Date, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.0148 * Math.sin(3 * gamma);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const offsetMinutes = -date.getTimezoneOffset();
  const trueSolarMinutes = ((hour * 60 + eqTime + 4 * lng - offsetMinutes) % 1440 + 1440) % 1440;
  const hourAngle = (trueSolarMinutes / 4 - 180) * rad;
  const latRad = lat * rad;
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / rad;
  const azimuth =
    (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad)) / rad +
      180 +
      360) %
    360;
  return { azimuth, elevation };
}

function formatHour(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h % 1) * 60);
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function getAzimuthName(deg: number, id: boolean) {
  if (deg >= 337.5 || deg < 22.5) return id ? "Utara (N)" : "North (N)";
  if (deg < 67.5) return id ? "Timur Laut (NE)" : "North-East (NE)";
  if (deg < 112.5) return id ? "Timur (E)" : "East (E)";
  if (deg < 157.5) return id ? "Tenggara (SE)" : "South-East (SE)";
  if (deg < 202.5) return id ? "Selatan (S)" : "South (S)";
  if (deg < 247.5) return id ? "Barat Daya (SW)" : "South-West (SW)";
  if (deg < 292.5) return id ? "Barat (W)" : "West (W)";
  return id ? "Barat Laut (NW)" : "North-West (NW)";
}

export default function PVLayout3D({
  lang = "en",
  userId = "anonymous",
  projectId = null,
  projectName = null
}: {
  lang?: "en" | "id";
  userId?: string;
  projectId?: string | null;
  projectName?: string | null;
}) {
  const scopedStorageKey = `${STORAGE_KEY}:project:${projectId ?? "unassigned"}`;
  const userScopedStorageKey = `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const buildingDimRef = useRef<{ w: number; h: number; y: number }>({ w: 65, h: 35, y: 5 });

  const [surfaceMode, setSurfaceMode] = useState<"auto" | "flat" | "terrain" | "roof-flat" | "roof-single" | "roof-gable" | "roof-multi-2" | "roof-multi-3" | "roof-multi-4" | "roof-hip">("auto");
  const [surfaceSlope, setSurfaceSlope] = useState(5);
  const [panelCount, setPanelCount] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [notice, setNotice] = useState(0);

  // Orientation & Sizing Controls
  // "NS" = Ridges run North-South along Z; bays divide along X (90° rotated, ideal for Mas Silueta)
  // "WE" = Ridges run West-East along X; bays divide along Z (standard 0°)
  const [ridgeAxis, setRidgeAxis] = useState<"NS" | "WE">("NS");
  const [roofFitMode, setRoofFitMode] = useState<"fit-panels" | "full-site" | "custom">("fit-panels");
  const [customRoofW, setCustomRoofW] = useState<number>(0);
  const [customRoofH, setCustomRoofH] = useState<number>(0);
  const [wallHeight, setWallHeight] = useState<number>(5.0);
  const [roofPitchDeg, setRoofPitchDeg] = useState<number>(10);
  const [activeBuildingDim, setActiveBuildingDim] = useState<{ w: number; h: number }>({ w: 65, h: 35 });

  // Time & Sun simulation state
  const [simDate, setSimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [simHour, setSimHour] = useState(12.0); // 12:00
  const [isPlaying, setIsPlaying] = useState(false);

  const [demLoading, setDemLoading] = useState(false);
  const [demStatus, setDemStatus] = useState("");
  const [sunInfo, setSunInfo] = useState({ azimuth: 0, elevation: 0 });
  const id = lang === "id";

  const handleZoomIn = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.sub(controlsRef.current.target).multiplyScalar(0.82).add(controlsRef.current.target);
    controlsRef.current.update();
  };

  const handleZoomOut = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.sub(controlsRef.current.target).multiplyScalar(1.22).add(controlsRef.current.target);
    controlsRef.current.update();
  };

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    const { w, h, y } = buildingDimRef.current;
    const span = Math.max(w, h, 30);
    const dist = span * 1.05 + 10;
    cameraRef.current.position.set(dist * 0.72, dist * 0.78, dist * 0.88);
    controlsRef.current.target.set(0, y, 0);
    controlsRef.current.update();
  };

  const handleFlipOrientation = () => {
    setRidgeAxis(prev => (prev === "NS" ? "WE" : "NS"));
  };

  const currentDateObj = useMemo(() => {
    const d = new Date(`${simDate}T00:00:00`);
    const hours = Math.floor(simHour);
    const mins = Math.round((simHour % 1) * 60);
    d.setHours(hours, mins, 0, 0);
    return d;
  }, [simDate, simHour]);

  // Animation loop when isPlaying is true
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setSimHour(prev => {
        let next = prev + 0.15;
        if (next > 18.0) next = 6.0;
        return Number(next.toFixed(2));
      });
    }, 120);
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  async function fetchDem() {
    let saved: SavedLayout = {};
    try {
      saved = JSON.parse(localStorage.getItem(scopedStorageKey) || localStorage.getItem(userScopedStorageKey) || "{}");
    } catch { /* ignore */ }
    let site = saved.site;
    if (!site?.coordinates) {
      const defaultData = getProjectDefaultLayout(projectId);
      if (defaultData?.site) site = defaultData.site;
    }
    if (!site?.coordinates || !Number.isFinite(site.coordinates.lat) || !Number.isFinite(site.coordinates.lng)) {
      setDemStatus(id ? "Koordinat lokasi belum tersimpan. Terapkan lokasi dari Google Maps di PV Layout 2D terlebih dahulu." : "Project coordinates are missing. Apply a Google Maps location in PV Layout 2D first.");
      return;
    }
    setDemLoading(true);
    setDemStatus(id ? "Mengambil elevasi DEM…" : "Fetching DEM elevations…");
    try {
      const rows = 9, cols = 9;
      const latSpan = 0.0015, lngSpan = 0.0015 / Math.max(0.2, Math.cos((site.coordinates.lat * Math.PI) / 180));
      const latitudes: number[] = [], longitudes: number[] = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        latitudes.push(site.coordinates.lat + (0.5 - r / (rows - 1)) * latSpan);
        longitudes.push(site.coordinates.lng + (c / (cols - 1) - 0.5) * lngSpan);
      }
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitudes.join(",")}&longitude=${longitudes.join(",")}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`DEM service returned HTTP ${response.status}`);
      const payload = await response.json();
      const elevations = (payload.elevation as number[]).map(Number);
      if (elevations.length !== rows * cols || elevations.some(v => !Number.isFinite(v))) throw new Error("Invalid elevation grid returned by DEM service");
      const dem: DemGrid = { rows, cols, elevations, min: Math.min(...elevations), max: Math.max(...elevations), source: "Open-Meteo Elevation API", fetchedAt: new Date().toISOString() };
      localStorage.setItem(scopedStorageKey, JSON.stringify({ ...saved, projectId, dem }));
      setDemStatus(`${id ? "DEM berhasil dimuat" : "DEM loaded"}: ${dem.min.toFixed(1)}–${dem.max.toFixed(1)} m · ${rows}×${cols} grid`);
      setNotice(v => v + 1);
    } catch (error) {
      setDemStatus(`${id ? "Gagal mengambil DEM" : "DEM fetch failed"}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDemLoading(false);
    }
  }

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === scopedStorageKey || event.key === null) setNotice(v => v + 1);
    };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => setNotice(v => v + 1), 60000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [scopedStorageKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let saved: SavedLayout = {};
    try {
      saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}");
    } catch {
      saved = {};
    }
    if (!saved?.panels || !saved.panels.length) {
      const defaultData = getProjectDefaultLayout(projectId);
      if (defaultData) saved = defaultData as any;
    }
    const settings: Record<string, any> = saved.settings ?? {};
    const savedAny = saved as any;

    const moduleW = Number(settings.moduleWidth) || Number(settings.panelWidth) || 2278;
    const moduleH = Number(settings.moduleHeight) || Number(settings.panelHeight) || 1134;

    // Load all panels, including segmented panels
    const panels: Panel[] = (Array.isArray(saved.panels) && saved.panels.length > 0)
      ? saved.panels
      : (Array.isArray(savedAny?.segments))
      ? savedAny.segments.filter((s: any) => s.visible !== false).flatMap((s: any) => s.panels || [])
      : [];

    const obstacles = Array.isArray(saved.obstacles) ? saved.obstacles : [];
    const areaW = Math.max(1000, Number(settings.areaWidth) || 12000) / 1000;
    const areaH = Math.max(1000, Number(settings.areaHeight) || 8000) / 1000;
    const system = settings.system === "Ground-mounted" ? "Ground-mounted" : "Rooftop";

    // Compute bounding box of all panels in millimeters
    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    panels.forEach(p => {
      const px = Number(p.x) || 0;
      const py = Number(p.y) || 0;
      const pw = Number(p.w) || moduleW;
      const ph = Number(p.h) || moduleH;
      if (px < pMinX) pMinX = px;
      if (px + pw > pMaxX) pMaxX = px + pw;
      if (py < pMinY) pMinY = py;
      if (py + ph > pMaxY) pMaxY = py + ph;
    });

    const hasPanels = Number.isFinite(pMinX) && Number.isFinite(pMaxX) && pMaxX > pMinX;
    const panelSpanW = hasPanels ? (pMaxX - pMinX) / 1000 : areaW;
    const panelSpanH = hasPanels ? (pMaxY - pMinY) / 1000 : areaH;
    const panelCenterMmX = hasPanels ? (pMinX + pMaxX) / 2 : areaW * 500;
    const panelCenterMmY = hasPanels ? (pMinY + pMaxY) / 2 : areaH * 500;

    // Determine building dimensions based on roofFitMode
    let buildingW = areaW;
    let buildingH = areaH;
    if (roofFitMode === "fit-panels") {
      // 3m overhang on all sides (+6m total) for a realistic warehouse rooftop
      buildingW = Math.max(10, Math.round(panelSpanW + 6));
      buildingH = Math.max(10, Math.round(panelSpanH + 6));
    } else if (roofFitMode === "custom") {
      buildingW = customRoofW > 0 ? customRoofW : Math.max(10, Math.round(panelSpanW + 6));
      buildingH = customRoofH > 0 ? customRoofH : Math.max(10, Math.round(panelSpanH + 6));
    } else {
      // full-site (canvas boundary)
      buildingW = areaW;
      buildingH = areaH;
    }

    setActiveBuildingDim({ w: buildingW, h: buildingH });
    buildingDimRef.current = { w: buildingW, h: buildingH, y: wallHeight };

    const halfW = buildingW / 2;
    const halfH = buildingH / 2;
    const baseRoofY = wallHeight;
    const pitchDeg = roofPitchDeg || Number(settings.tilt) || 10;
    const roofPitch = Math.max(1, Math.min(45, pitchDeg)) * (Math.PI / 180);

    let mode = surfaceMode;
    if (mode === "auto") {
      if (system === "Ground-mounted") {
        mode = "terrain";
      } else if (projectId?.includes("mas-silueta") || (savedAny?.segments && savedAny.segments.length >= 6)) {
        mode = "roof-multi-3"; // Automatic multi-bay warehouse detection
      } else {
        mode = "roof-gable";
      }
    }

    const isMultiBay = mode === "roof-multi-2" || mode === "roof-multi-3" || mode === "roof-multi-4";
    const bayCount = mode === "roof-multi-2" ? 2 : mode === "roof-multi-4" ? 4 : mode === "roof-multi-3" ? 3 : 1;

    const site = saved.site;
    const lat = site?.coordinates?.lat ?? -6.36;
    const lng = site?.coordinates?.lng ?? 107.17;

    const sun = solarPosition(currentDateObj, lat, lng);
    setSunInfo(sun);

    const rawWatts = Number(settings.watts) || Number(settings.panelWatts) || 580;
    const watts = rawWatts > 1000 ? rawWatts / 10 : rawWatts; // Protect against 7440 Wp typo
    const tilt = Math.max(0, Math.min(60, Number(settings.tilt) || 10));
    setPanelCount(panels.length);
    setCapacity((panels.length * watts) / 1000);

    const span = Math.max(buildingW, buildingH);
    const viewDist = span * 1.05 + 15;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080f1a");
    scene.fog = new THREE.Fog("#080f1a", viewDist * 1.8, viewDist * 5.5);

    const camera = new THREE.PerspectiveCamera(45, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), Math.max(0.1, span / 2000), viewDist * 9);
    camera.position.set(span * 0.72, span * 0.78, span * 0.88);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // Hemisphere ambient light
    const isDay = sun.elevation > 0;
    const hemiLight = new THREE.HemisphereLight(
      isDay ? 0xdceaff : 0x1e293b,
      0x1a2638,
      isDay ? Math.max(0.85, Math.min(1.65, (sun.elevation / 90) * 1.8)) : 0.35
    );
    scene.add(hemiLight);

    // Sun directional vector & light
    const sunRad = Math.max(0.01, (sun.elevation * Math.PI) / 180);
    const az = (sun.azimuth * Math.PI) / 180;
    const sunDir = new THREE.Vector3(
      Math.sin(az) * Math.cos(sunRad),
      Math.sin(sunRad),
      -Math.cos(az) * Math.cos(sunRad)
    );

    const sunIntensity = isDay ? Math.max(0.4, Math.min(3.2, (sun.elevation / 90) * 3.4)) : 0.05;
    const sunColor = sun.elevation > 15 ? 0xfff6dd : sun.elevation > 0 ? 0xffaa55 : 0x334466;
    const sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
    const halfDiag = Math.hypot(buildingW, buildingH) / 2 + 8;
    const lightDist = halfDiag * 3.2;

    sunLight.position.copy(sunDir.clone().multiplyScalar(lightDist));
    sunLight.castShadow = isDay;
    const shadowRes = Math.min(4096, renderer.capabilities.maxTextureSize);
    sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    Object.assign(sunLight.shadow.camera, {
      left: -halfDiag,
      right: halfDiag,
      top: halfDiag,
      bottom: -halfDiag,
      near: 0.5,
      far: lightDist + halfDiag * 2
    });
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // --- 1. VISIBLE 3D SUN ORB & GLOW AURA IN SKY ---
    if (sun.elevation > -8) {
      const sunRadius = Math.max(2.2, span * 0.045);
      const sunGeom = new THREE.SphereGeometry(sunRadius, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({
        color: sun.elevation > 15 ? 0xffea78 : 0xff6622,
      });
      const sunMesh = new THREE.Mesh(sunGeom, sunMat);
      sunMesh.position.copy(sunDir.clone().multiplyScalar(lightDist * 0.95));
      scene.add(sunMesh);

      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(255, 245, 180, 1)");
        grad.addColorStop(0.25, isDay ? "rgba(255, 205, 80, 0.75)" : "rgba(255, 120, 40, 0.75)");
        grad.addColorStop(0.65, isDay ? "rgba(255, 140, 40, 0.25)" : "rgba(255, 60, 20, 0.25)");
        grad.addColorStop(1, "rgba(255, 100, 0, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        const sunTex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, blending: THREE.AdditiveBlending });
        const sunSprite = new THREE.Sprite(spriteMat);
        sunSprite.scale.set(sunRadius * 4.6, sunRadius * 4.6, 1);
        sunSprite.position.copy(sunMesh.position);
        scene.add(sunSprite);
      }
    }

    // --- 2. SOLAR PATH TRAJECTORY ARC (06:00 to 18:00) ---
    const arcPoints: THREE.Vector3[] = [];
    const arcDist = lightDist * 0.95;
    for (let h = 5.5; h <= 18.5; h += 0.25) {
      const d = new Date(currentDateObj);
      d.setHours(Math.floor(h), Math.floor((h % 1) * 60), 0);
      const pos = solarPosition(d, lat, lng);
      if (pos.elevation >= -3) {
        const sRad = (pos.elevation * Math.PI) / 180;
        const sAz = (pos.azimuth * Math.PI) / 180;
        arcPoints.push(new THREE.Vector3(
          Math.sin(sAz) * Math.cos(sRad) * arcDist,
          Math.sin(sRad) * arcDist,
          -Math.cos(sAz) * Math.cos(sRad) * arcDist
        ));
      }
    }
    if (arcPoints.length >= 2) {
      const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineDashedMaterial({
        color: 0xf59e0b,
        dashSize: Math.max(1, span * 0.04),
        gapSize: Math.max(0.5, span * 0.02),
        transparent: true,
        opacity: 0.65,
      });
      const arcLine = new THREE.Line(arcGeom, arcMat);
      arcLine.computeLineDistances();
      scene.add(arcLine);
    }

    const dem = saved.dem && saved.dem.elevations?.length === saved.dem.rows * saved.dem.cols ? saved.dem : null;
    const demValues = dem?.elevations ?? [];
    const demMin = dem?.min ?? 0;
    const demRange = Math.max(0.01, (dem?.max ?? 0) - demMin);

    const terrainHeight = (x: number, z: number) => {
      if (!dem) return x * (Math.max(0, Math.min(30, surfaceSlope)) / 100);
      const u = Math.max(0, Math.min(1, (x + halfW) / buildingW)) * (dem.cols - 1);
      const v = Math.max(0, Math.min(1, (z + halfH) / buildingH)) * (dem.rows - 1);
      const c0 = Math.floor(u), r0 = Math.floor(v);
      const c1 = Math.min(dem.cols - 1, c0 + 1), r1 = Math.min(dem.rows - 1, r0 + 1);
      const fu = u - c0, fv = v - r0;
      const at = (r: number, c: number) => demValues[r * dem.cols + c] ?? demMin;
      const a = at(r0, c0) * (1 - fu) + at(r0, c1) * fu;
      const b = at(r1, c0) * (1 - fu) + at(r1, c1) * fu;
      return ((a * (1 - fv) + b * fv) - demMin) / demRange * Math.min(4, demRange);
    };

    // Multi-Bay & Gable Roof Height Calculation with 90° Axis Rotation
    let roofHeight: (x: number, z: number) => number;
    if (mode === "roof-flat") {
      roofHeight = () => baseRoofY;
    } else if (mode === "roof-single") {
      if (ridgeAxis === "NS") {
        roofHeight = (x: number) => baseRoofY + halfW * Math.tan(roofPitch) - (x + halfW) * Math.tan(roofPitch);
      } else {
        roofHeight = (_x: number, z: number) => baseRoofY + halfH * Math.tan(roofPitch) - (z + halfH) * Math.tan(roofPitch);
      }
    } else if (mode === "roof-gable" || isMultiBay) {
      if (ridgeAxis === "NS") {
        // Ridges run North-South along Z axis; bays divide along X axis (90° Flipped)
        const bayW = buildingW / bayCount;
        const halfBayW = bayW / 2;
        const bayRidgeRise = halfBayW * Math.tan(roofPitch);
        roofHeight = (x: number) => {
          const xNorm = Math.max(0, Math.min(buildingW - 0.001, x + halfW));
          const bayIdx = Math.floor(xNorm / bayW);
          const bayCenterX = (bayIdx + 0.5) * bayW - halfW;
          const deltaX = x - bayCenterX;
          return baseRoofY + bayRidgeRise - Math.abs(deltaX) * Math.tan(roofPitch);
        };
      } else {
        // Ridges run West-East along X axis; bays divide along Z axis (0° Standard)
        const bayH = buildingH / bayCount;
        const halfBayH = bayH / 2;
        const bayRidgeRise = halfBayH * Math.tan(roofPitch);
        roofHeight = (_x: number, z: number) => {
          const zNorm = Math.max(0, Math.min(buildingH - 0.001, z + halfH));
          const bayIdx = Math.floor(zNorm / bayH);
          const bayCenterZ = (bayIdx + 0.5) * bayH - halfH;
          const deltaZ = z - bayCenterZ;
          return baseRoofY + bayRidgeRise - Math.abs(deltaZ) * Math.tan(roofPitch);
        };
      }
    } else {
      roofHeight = () => baseRoofY;
    }

    const surfaceY = (x: number, z: number) =>
      mode === "terrain" ? terrainHeight(x, z) : mode.startsWith("roof-") ? roofHeight(x, z) : 0;

    // Building Box Walls & Gable Ends
    if (mode.startsWith("roof-")) {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.15 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(buildingW, baseRoofY, buildingH), wallMat);
      wall.position.y = baseRoofY / 2 - 0.08;
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);

      // Pitched triangular gable end walls
      if (mode === "roof-gable" || isMultiBay) {
        const gableMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.15, side: THREE.DoubleSide });

        if (ridgeAxis === "NS") {
          // North-South ridges: Triangular gables on North wall (z = -halfH) and South wall (z = +halfH)
          const bayW = buildingW / bayCount;
          const halfBayW = bayW / 2;
          const bayRidgeRise = halfBayW * Math.tan(roofPitch);

          for (let b = 0; b < bayCount; b++) {
            const xStart = b * bayW - halfW;
            const xCenter = (b + 0.5) * bayW - halfW;
            const xEnd = (b + 1) * bayW - halfW;
            const tri = new THREE.Shape([
              new THREE.Vector2(xStart, 0),
              new THREE.Vector2(xEnd, 0),
              new THREE.Vector2(xCenter, bayRidgeRise),
            ]);
            const geom = new THREE.ShapeGeometry(tri);
            for (const zEnd of [-halfH, halfH]) {
              const gable = new THREE.Mesh(geom, gableMat);
              gable.position.set(0, baseRoofY - 0.08, zEnd);
              gable.castShadow = true;
              gable.receiveShadow = true;
              scene.add(gable);
            }
          }
        } else {
          // West-East ridges: Triangular gables on West wall (x = -halfW) and East wall (x = +halfW)
          const bayH = buildingH / bayCount;
          const halfBayH = bayH / 2;
          const bayRidgeRise = halfBayH * Math.tan(roofPitch);

          for (let b = 0; b < bayCount; b++) {
            const zStart = b * bayH - halfH;
            const zCenter = (b + 0.5) * bayH - halfH;
            const zEnd = (b + 1) * bayH - halfH;
            const tri = new THREE.Shape([
              new THREE.Vector2(zStart, 0),
              new THREE.Vector2(zEnd, 0),
              new THREE.Vector2(zCenter, bayRidgeRise),
            ]);
            const geom = new THREE.ShapeGeometry(tri);
            for (const xEnd of [-halfW, halfW]) {
              const gable = new THREE.Mesh(geom, gableMat);
              gable.rotation.y = Math.PI / 2;
              gable.position.set(xEnd, baseRoofY - 0.08, 0);
              gable.castShadow = true;
              gable.receiveShadow = true;
              scene.add(gable);
            }
          }
        }
      }
    }

    // High-resolution Roof Surface Mesh with accurate corrugated pitches
    const segX = Math.max(48, bayCount * 24);
    const segZ = Math.max(48, bayCount * 24);
    const surfaceGeometry = new THREE.PlaneGeometry(buildingW, buildingH, segX, segZ);
    surfaceGeometry.rotateX(-Math.PI / 2);
    const positions = surfaceGeometry.attributes.position;
    let surfaceMin = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = surfaceY(x, z);
      surfaceMin = Math.min(surfaceMin, y);
      positions.setY(i, y + 0.025);
    }
    positions.needsUpdate = true;
    surfaceGeometry.computeVertexNormals();

    const surfaceMesh = new THREE.Mesh(
      surfaceGeometry,
      new THREE.MeshStandardMaterial({
        color: mode === "terrain" ? 0x47734d : 0x8ba2b8,
        roughness: 0.88,
        metalness: 0.18,
        side: THREE.DoubleSide
      })
    );
    surfaceMesh.receiveShadow = true;
    scene.add(surfaceMesh);

    // Ground reference grid
    const gridSize = Math.max(span * 1.6, 60);
    const gridCell = span > 60 ? 5 : 1;
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.round(gridSize / gridCell)), 0x334155, 0x1e293b);
    grid.position.y = mode.startsWith("roof-") ? 0 : Math.min(0, surfaceMin) - 0.05;
    scene.add(grid);

    // Directional Compass Markers on ground
    const compassDist = span * 0.76;
    const dirs = [
      { label: id ? "UTARA (N)" : "NORTH (N)", x: 0, z: -compassDist, color: "#38bdf8" },
      { label: id ? "SELATAN (S)" : "SOUTH (S)", x: 0, z: compassDist, color: "#94a3b8" },
      { label: id ? "TIMUR (E)" : "EAST (E)", x: compassDist, z: 0, color: "#f59e0b" },
      { label: id ? "BARAT (W)" : "WEST (W)", x: -compassDist, z: 0, color: "#f59e0b" },
    ];
    dirs.forEach(d => {
      const c = document.createElement("canvas");
      c.width = 180;
      c.height = 44;
      const cx = c.getContext("2d");
      if (cx) {
        cx.fillStyle = "#0c1524ee";
        cx.roundRect(0, 0, 180, 44, 8);
        cx.fill();
        cx.strokeStyle = "#2e425e";
        cx.lineWidth = 2;
        cx.stroke();
        cx.fillStyle = d.color;
        cx.font = "bold 15px system-ui, sans-serif";
        cx.textAlign = "center";
        cx.textBaseline = "middle";
        cx.fillText(d.label, 90, 22);
        const tex = new THREE.CanvasTexture(c);
        const spMat = new THREE.SpriteMaterial({ map: tex });
        const sp = new THREE.Sprite(spMat);
        sp.scale.set(span * 0.16, span * 0.04, 1);
        sp.position.set(d.x, (mode.startsWith("roof-") ? baseRoofY : 0) + 0.6, d.z);
        scene.add(sp);
      }
    });

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1679bd, metalness: 0.32, roughness: 0.38, side: THREE.DoubleSide });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.7, roughness: 0.32 });
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.55, roughness: 0.4 });

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const n = panels.length;
    const supportHeight = system === "Ground-mounted" ? 1.05 : 0.35;
    const panelIM = new THREE.InstancedMesh(unitBox, panelMat, n);
    const railIM = new THREE.InstancedMesh(unitBox, frameMat, n * 2);
    const legIM = new THREE.InstancedMesh(unitBox, supportMat, n * 2);
    panelIM.castShadow = panelIM.receiveShadow = railIM.castShadow = legIM.castShadow = true;

    const groupM = new THREE.Matrix4(), partM = new THREE.Matrix4(), outM = new THREE.Matrix4();
    const euler = new THREE.Euler(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();

    const put = (im: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, sx: number, sy: number, sz: number) => {
      partM.compose(pos.set(px, py, pz), quat.identity(), scl.set(sx, sy, sz));
      im.setMatrixAt(i, outM.multiplyMatrices(groupM, partM));
    };

    panels.forEach((p, i) => {
      const w = Math.max(0.1, (Number(p.w) || moduleW) / 1000);
      const h = Math.max(0.1, (Number(p.h) || moduleH) / 1000);

      // Centered position relative to building rooftop
      let x = 0;
      let z = 0;
      if (roofFitMode === "full-site") {
        x = (Number(p.x) || 0) / 1000 - areaW / 2 + w / 2;
        z = (Number(p.y) || 0) / 1000 - areaH / 2 + h / 2;
      } else {
        // Centered directly on the building according to the panels' collective bounding box
        x = ((Number(p.x) || 0) + (Number(p.w) || moduleW) / 2 - panelCenterMmX) / 1000;
        z = ((Number(p.y) || 0) + (Number(p.h) || moduleH) / 2 - panelCenterMmY) / 1000;
      }

      const base = surfaceY(x, z) + (mode.startsWith("roof-") ? 0.12 : system === "Ground-mounted" ? 1.15 : 0.35);

      euler.set(0, 0, 0);
      if (mode === "terrain") {
        euler.z = Math.atan(surfaceSlope / 100);
      } else if (mode === "roof-flat") {
        euler.x = -tilt * (Math.PI / 180);
      } else if (mode === "roof-single") {
        if (ridgeAxis === "NS") {
          euler.z = roofPitch;
        } else {
          euler.x = roofPitch;
        }
      } else if (mode === "roof-gable" || isMultiBay) {
        if (ridgeAxis === "NS") {
          // North-South ridges: panels tilt towards West (-X) or East (+X)
          const bayW = buildingW / bayCount;
          const xNorm = Math.max(0, Math.min(buildingW - 0.001, x + halfW));
          const bayIdx = Math.floor(xNorm / bayW);
          const bayCenterX = (bayIdx + 0.5) * bayW - halfW;
          const deltaX = x - bayCenterX;
          euler.x = 0;
          euler.z = deltaX < 0 ? roofPitch : -roofPitch;
        } else {
          // West-East ridges: panels tilt towards North (-Z) or South (+Z)
          const bayH = buildingH / bayCount;
          const zNorm = Math.max(0, Math.min(buildingH - 0.001, z + halfH));
          const bayIdx = Math.floor(zNorm / bayH);
          const bayCenterZ = (bayIdx + 0.5) * bayH - halfH;
          const deltaZ = z - bayCenterZ;
          euler.x = deltaZ < 0 ? roofPitch : -roofPitch;
          euler.z = 0;
        }
      } else {
        euler.x = -tilt * (Math.PI / 180);
      }

      groupM.compose(pos.set(x, base, z), quat.setFromEuler(euler), one);
      put(panelIM, i, 0, 0, 0, w, 0.055, h);
      put(railIM, i * 2, 0, -0.045, -h * 0.32, w * 0.96, 0.04, 0.05);
      put(railIM, i * 2 + 1, 0, -0.045, h * 0.32, w * 0.96, 0.04, 0.05);
      put(legIM, i * 2, -w * 0.35, -supportHeight / 2 - 0.06, 0, 0.055, supportHeight, 0.055);
      put(legIM, i * 2 + 1, w * 0.35, -supportHeight / 2 - 0.06, 0, 0.055, supportHeight, 0.055);
    });

    for (const im of [panelIM, railIM, legIM]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      scene.add(im);
    }

    // Site boundary 3D line loop (Trapezoid / Polygon)
    if (site?.polygonCorners && Array.isArray(site.polygonCorners) && site.polygonCorners.length >= 3) {
      const linePts = site.polygonCorners.map(pt => {
        let lx = 0;
        let lz = 0;
        if (roofFitMode === "full-site") {
          lx = (pt.x / 1000) - areaW / 2;
          lz = (pt.y / 1000) - areaH / 2;
        } else {
          lx = (pt.x - panelCenterMmX) / 1000;
          lz = (pt.y - panelCenterMmY) / 1000;
        }
        const ly = surfaceY(lx, lz) + (mode.startsWith("roof-") ? 0.08 : 0.06);
        return new THREE.Vector3(lx, ly, lz);
      });
      linePts.push(linePts[0].clone());
      const lineGeom = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xb8f36b, linewidth: 2 });
      const borderLine = new THREE.Line(lineGeom, lineMat);
      scene.add(borderLine);
    }

    // Obstacles
    obstacles.forEach(o => {
      const w = Math.max(0.1, (Number(o.w) || 1000) / 1000);
      const h = Math.max(0.1, (Number(o.h) || 1000) / 1000);
      let x = 0;
      let z = 0;
      if (roofFitMode === "full-site") {
        x = (Number(o.x) || 0) / 1000 - areaW / 2 + w / 2;
        z = (Number(o.y) || 0) / 1000 - areaH / 2 + h / 2;
      } else {
        x = ((Number(o.x) || 0) + w * 500 - panelCenterMmX) / 1000;
        z = ((Number(o.y) || 0) + h * 500 - panelCenterMmY) / 1000;
      }
      const height = Math.max(0.5, Number(o.heightM) || 2.5);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, height, h),
        new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.85, roughness: 0.7 })
      );
      mesh.position.set(x, surfaceY(x, z) + height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    if (!panels.length) {
      const label = document.createElement("div");
      label.textContent = id
        ? "Belum ada panel tersimpan — buat layout di PV Layout 2D lalu klik Muat Ulang."
        : "No saved panels — create a layout in PV Layout 2D, then click Reload.";
      label.style.cssText =
        "position:absolute;left:16px;bottom:16px;padding:10px 12px;background:#111827dd;color:#e5e7eb;border:1px solid #334155;border-radius:8px;font:12px system-ui;pointer-events:none";
      host.appendChild(label);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false; // Disable default wheel capture so outer page scrolls naturally
    controls.target.set(0, mode.startsWith("roof-") ? baseRoofY : 0, 0);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2;
    controls.maxDistance = viewDist * 3.5;
    controls.update();

    controlsRef.current = controls;
    cameraRef.current = camera;

    // Shift + Scroll for 3D camera zoom
    const handle3DWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 0.88 : 1.14;
        camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
        controls.update();
      }
    };
    host.addEventListener("wheel", handle3DWheel, { passive: false });

    const resize = () => {
      camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("wheel", handle3DWheel);
      controls.dispose();
      renderer.dispose();
      scene.traverse(o => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach(v => v.dispose());
          else m.dispose();
        }
      });
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, [
    currentDateObj,
    notice,
    surfaceMode,
    surfaceSlope,
    scopedStorageKey,
    id,
    projectId,
    ridgeAxis,
    roofFitMode,
    customRoofW,
    customRoofH,
    wallHeight,
    roofPitchDeg
  ]);

  // Shadow evaluation
  const shadowStatus = useMemo(() => {
    const el = sunInfo.elevation;
    if (el <= 0) return { label: id ? "Matahari Terbenam (Malam)" : "Sunset (Night)", color: "#94a3b8" };
    if (el < 20) return { label: id ? "Bayangan Sangat Panjang (Risiko Shading Kritis)" : "Very Long Shadows (High Shading Risk)", color: "#ef4444" };
    if (el < 40) return { label: id ? "Bayangan Panjang (Waspada Jarak Baris)" : "Long Shadows (Watch Row Spacing)", color: "#f59e0b" };
    if (el < 65) return { label: id ? "Bayangan Sedang (Produksi Optimal)" : "Moderate Shadows (Optimal PV)", color: "#84cc16" };
    return { label: id ? "Bayangan Minimal (Peak Solar Irradiance)" : "Minimal Shadows (Peak Solar)", color: "#10b981" };
  }, [sunInfo.elevation, id]);

  return (
    <section style={{ color: "#e5edf8", display: "grid", gap: 14 }}>
      {/* Heading */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#38bdf8", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>ENGINEERING VIEWER</div>
          <h1 style={{ margin: "5px 0", fontSize: 25 }}>PV Layout 3D</h1>
          {projectName && (
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Project aktif: <strong style={{ color: "#e5edf8" }}>{projectName}</strong> · <small>{projectId ?? "Unassigned"}</small>
            </div>
          )}
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
            Engineering visualization · 3D Sun Path, Multi-Gable Roof Alignments & Real-time Shadow Simulation
          </p>
        </div>
        <button
          onClick={() => setNotice(v => v + 1)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#123047",
            color: "#bae6fd",
            border: "1px solid #25617a",
            borderRadius: 9,
            padding: "10px 13px",
            cursor: "pointer"
          }}
        >
          <RefreshCw size={16} />
          {id ? "Muat Ulang Layout" : "Reload Layout"}
        </button>
      </div>

      {/* Top Stats & Surface Settings */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 115 }}>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>MODULES</div>
          <strong style={{ fontSize: 22 }}>{panelCount}</strong>
        </div>
        <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 125 }}>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>DC CAPACITY</div>
          <strong style={{ fontSize: 22 }}>{capacity.toFixed(2)} kWp</strong>
        </div>
        <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 200 }}>
          <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>SURFACE / ROOF TYPE</div>
          <select
            aria-label="3D surface mode"
            value={surfaceMode}
            onChange={e => setSurfaceMode(e.target.value as typeof surfaceMode)}
            style={{ width: "100%", background: "#0b1220", color: "#e5edf8", border: "1px solid #334155", borderRadius: 7, padding: 7 }}
          >
            <option value="auto">Auto from system</option>
            <option value="roof-multi-3">Multi-Gable (3 Bay / Pabrik 3 Atap - Mas Silueta)</option>
            <option value="roof-multi-2">Multi-Gable (2 Bay / Pabrik 2 Atap)</option>
            <option value="roof-multi-4">Multi-Gable (4 Bay / Pabrik 4 Atap)</option>
            <option value="roof-gable">Gable roof (1 Atap Pelana Tunggal)</option>
            <option value="roof-single">Single slope (Kemiringan 1 Arah)</option>
            <option value="roof-flat">Flat roof (Atap Datar Gedung)</option>
            <option value="terrain">DEM Terrain (Kontur Tanah GIS)</option>
            <option value="flat">Flat plane (Tanah Datar)</option>
          </select>
          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 8 }}>Manual terrain slope fallback (%)</div>
          <input
            type="number"
            min="0"
            max="30"
            value={surfaceSlope}
            onChange={e => setSurfaceSlope(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#0b1220", color: "#e5edf8", border: "1px solid #334155", borderRadius: 7, padding: 7 }}
          />
        </div>

        {/* 90° Flip & Orientation Toggle Card */}
        <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 220 }}>
          <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>
            ORIENTASI BUBUNGAN ATAP (RIDGE)
          </div>
          <button
            type="button"
            onClick={handleFlipOrientation}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: ridgeAxis === "NS" ? "#1e3a5f" : "#2d3748",
              color: ridgeAxis === "NS" ? "#93c5fd" : "#e2e8f0",
              border: `1px solid ${ridgeAxis === "NS" ? "#3b82f6" : "#4a5568"}`,
              borderRadius: 7,
              padding: "9px 12px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 12
            }}
          >
            <RotateCw size={14} />
            <span>
              {ridgeAxis === "NS" ? "Utara-Selatan (N-S) · 90°" : "Barat-Timur (W-E) · 0°"}
            </span>
          </button>
          <small style={{ display: "block", color: "#7a8f9f", marginTop: 6, fontSize: 10 }}>
            {ridgeAxis === "NS"
              ? "✓ Arah bubungan tegak (N-S). Bay membagi sumbu X. Sejajar barisan modul Mas Silueta."
              : "✓ Arah bubungan datar (W-E). Bay membagi sumbu Z."}
          </small>
        </div>

        <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 210, flex: 1 }}>
          <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>
            <Mountain size={13} style={{ display: "inline", verticalAlign: "middle" }} /> DEM TERRAIN (GIS)
          </div>
          <button
            disabled={demLoading}
            onClick={fetchDem}
            style={{ width: "100%", background: "#173a2a", color: "#d1fae5", border: "1px solid #34734c", borderRadius: 7, padding: 8, cursor: "pointer" }}
          >
            {demLoading ? "Loading DEM…" : "Fetch DEM for project coordinates"}
          </button>
          <small style={{ display: "block", color: "#94a3b8", marginTop: 7, fontSize: 11 }}>
            {demStatus || "Uses project coordinates saved from Google Maps."}
          </small>
        </div>
      </div>

      {/* Rooftop Resizing & Dimension Controls Bar */}
      <div style={{
        background: "#0d1624",
        border: "1px solid #1e2e42",
        borderRadius: 10,
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#38bdf8", fontSize: 12, fontWeight: 700 }}>
            <Maximize2 size={14} />
            <span>UKURAN ATAP / GEDUNG 3D:</span>
          </div>

          <div style={{ display: "inline-flex", background: "#060b13", padding: 3, borderRadius: 8, border: "1px solid #23344b" }}>
            <button
              type="button"
              onClick={() => {
                setRoofFitMode("fit-panels");
                setCustomRoofW(0);
                setCustomRoofH(0);
              }}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: roofFitMode === "fit-panels" ? 700 : 400,
                background: roofFitMode === "fit-panels" ? "#1d4ed8" : "transparent",
                color: roofFitMode === "fit-panels" ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              🎯 Pas ke Panel (+3m)
            </button>
            <button
              type="button"
              onClick={() => {
                setRoofFitMode("full-site");
                setCustomRoofW(0);
                setCustomRoofH(0);
              }}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: roofFitMode === "full-site" ? 700 : 400,
                background: roofFitMode === "full-site" ? "#1d4ed8" : "transparent",
                color: roofFitMode === "full-site" ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: 6,
                cursor: "pointer"
              }}
            >
              🗺️ Sesuai Peta GIS
            </button>
          </div>
        </div>

        {/* Manual Dimension Inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Panjang (m):</span>
            <input
              type="number"
              min="10"
              max="500"
              value={customRoofW > 0 ? customRoofW : activeBuildingDim.w}
              onChange={e => {
                const val = Math.max(10, Math.min(500, Number(e.target.value) || 10));
                setCustomRoofW(val);
                setRoofFitMode("custom");
              }}
              style={{
                width: 65,
                background: "#08101a",
                color: "#b8f36b",
                border: "1px solid #2c4159",
                borderRadius: 5,
                padding: "4px 7px",
                fontSize: 12,
                fontWeight: 700,
                textAlign: "center"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Lebar (m):</span>
            <input
              type="number"
              min="10"
              max="500"
              value={customRoofH > 0 ? customRoofH : activeBuildingDim.h}
              onChange={e => {
                const val = Math.max(10, Math.min(500, Number(e.target.value) || 10));
                setCustomRoofH(val);
                setRoofFitMode("custom");
              }}
              style={{
                width: 65,
                background: "#08101a",
                color: "#b8f36b",
                border: "1px solid #2c4159",
                borderRadius: 5,
                padding: "4px 7px",
                fontSize: 12,
                fontWeight: 700,
                textAlign: "center"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Tinggi Dinding (m):</span>
            <input
              type="number"
              min="2"
              max="30"
              step="0.5"
              value={wallHeight}
              onChange={e => setWallHeight(Math.max(2, Math.min(30, Number(e.target.value) || 5)))}
              style={{
                width: 55,
                background: "#08101a",
                color: "#bae6fd",
                border: "1px solid #2c4159",
                borderRadius: 5,
                padding: "4px 7px",
                fontSize: 12,
                textAlign: "center"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Kemiringan (°):</span>
            <input
              type="number"
              min="1"
              max="45"
              value={roofPitchDeg}
              onChange={e => setRoofPitchDeg(Math.max(1, Math.min(45, Number(e.target.value) || 10)))}
              style={{
                width: 50,
                background: "#08101a",
                color: "#f59e0b",
                border: "1px solid #2c4159",
                borderRadius: 5,
                padding: "4px 7px",
                fontSize: 12,
                textAlign: "center"
              }}
            />
          </div>
        </div>
      </div>

      {/* Interactive Sun Position & Clock Scrubber Card */}
      <div style={{
        background: "linear-gradient(135deg, #131f31 0%, #0d1726 100%)",
        border: "1px solid #2f4563",
        borderRadius: 12,
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 18,
        alignItems: "center",
      }}>
        {/* Col 1: Date & Presets */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f59e0b", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            <Sun size={15} />
            <span>{id ? "TANGGAL & MUSIM SIMULASI" : "SIMULATION DATE"}</span>
          </div>
          <input
            type="date"
            value={simDate}
            onChange={e => setSimDate(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#09101b",
              color: "#edf5ef",
              border: "1px solid #33445c",
              borderRadius: 6,
              padding: "7px 10px",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSimDate(new Date().toISOString().slice(0, 10))}
              style={{ fontSize: 10, background: "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 7px", cursor: "pointer" }}
            >
              {id ? "Hari Ini" : "Today"}
            </button>
            <button
              type="button"
              onClick={() => setSimDate(`${new Date().getFullYear()}-06-21`)}
              style={{ fontSize: 10, background: "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 7px", cursor: "pointer" }}
            >
              21 Jun (Solstice)
            </button>
            <button
              type="button"
              onClick={() => setSimDate(`${new Date().getFullYear()}-09-23`)}
              style={{ fontSize: 10, background: "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 7px", cursor: "pointer" }}
            >
              23 Sep (Ekuinoks)
            </button>
            <button
              type="button"
              onClick={() => setSimDate(`${new Date().getFullYear()}-12-21`)}
              style={{ fontSize: 10, background: "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 7px", cursor: "pointer" }}
            >
              21 Des (Solstice)
            </button>
          </div>
        </div>

        {/* Col 2: Interactive Clock Scrubber */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#38bdf8", fontSize: 12, fontWeight: 700 }}>
              <Clock size={14} />
              <span>{id ? "JAM SIMULASI MATAHARI" : "SOLAR TIME"}</span>
            </span>
            <strong style={{ fontSize: 16, color: "#b8f36b", fontFamily: "monospace" }}>
              {formatHour(simHour)} WIB
            </strong>
          </div>

          <input
            type="range"
            min="6.0"
            max="18.0"
            step="0.25"
            value={simHour}
            onChange={e => setSimHour(Number(e.target.value))}
            style={{
              width: "100%",
              accentColor: "#f59e0b",
              cursor: "pointer",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#7a8f9f", marginTop: 2 }}>
            <span>06:00 (Terbit)</span>
            <span>12:00 (Siang)</span>
            <span>18:00 (Terbenam)</span>
          </div>

          {/* Preset Buttons & Play Animation */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setIsPlaying(v => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: isPlaying ? "#ef4444" : "#10b981",
                color: "#ffffff",
                border: "none",
                borderRadius: 5,
                padding: "4px 9px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              <span>{isPlaying ? (id ? "Jeda" : "Pause") : (id ? "Putar Jam" : "Play Time")}</span>
            </button>

            <button
              type="button"
              onClick={() => setSimHour(9.0)}
              style={{ fontSize: 10, background: simHour === 9.0 ? "#2563eb" : "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 6px", cursor: "pointer" }}
            >
              🌅 09:00
            </button>
            <button
              type="button"
              onClick={() => setSimHour(12.0)}
              style={{ fontSize: 10, background: simHour === 12.0 ? "#2563eb" : "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 6px", cursor: "pointer" }}
            >
              ☀️ 12:00
            </button>
            <button
              type="button"
              onClick={() => setSimHour(15.0)}
              style={{ fontSize: 10, background: simHour === 15.0 ? "#2563eb" : "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 6px", cursor: "pointer" }}
            >
              🌇 15:00
            </button>
            <button
              type="button"
              onClick={() => setSimHour(17.0)}
              style={{ fontSize: 10, background: simHour === 17.0 ? "#2563eb" : "#1a2a40", border: "1px solid #365073", color: "#edf5ef", borderRadius: 4, padding: "3px 6px", cursor: "pointer" }}
            >
              🌆 17:00
            </button>
          </div>
        </div>

        {/* Col 3: Solar Angles & Real-Time Shadow Evaluation */}
        <div style={{
          background: "#09121d",
          border: "1px solid #21354d",
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{id ? "Sudut Elevasi:" : "Solar Elevation:"}</span>
            <strong style={{ fontSize: 13, color: sunInfo.elevation > 0 ? "#b8f36b" : "#94a3b8" }}>
              {sunInfo.elevation.toFixed(1)}°
            </strong>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{id ? "Arah Azimuth:" : "Solar Azimuth:"}</span>
            <strong style={{ fontSize: 13, color: "#edf5ef" }}>
              {sunInfo.azimuth.toFixed(1)}° ({getAzimuthName(sunInfo.azimuth, id)})
            </strong>
          </div>

          <div style={{ borderTop: "1px solid #1a2a3e", paddingTop: 6, marginTop: 2 }}>
            <div style={{ fontSize: 10, color: "#7a8f9f", marginBottom: 3 }}>
              {id ? "Analisis Bayangan (Shadow Study):" : "Shadow Study Analysis:"}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: shadowStatus.color, display: "flex", alignItems: "center", gap: 5 }}>
              <span>●</span>
              <span>{shadowStatus.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3D WebGL Canvas with Floating Controls */}
      <div
        style={{
          position: "relative",
          height: "min(66vh,650px)",
          minHeight: 380,
          border: "1px solid #26354a",
          borderRadius: 14,
          overflow: "hidden",
          background: "#0b1220"
        }}
      >
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />

        {/* Top-Left HUD Info Pill */}
        <div style={{
          position: "absolute",
          top: 14,
          left: 14,
          zIndex: 10,
          background: "rgba(11, 20, 34, 0.88)",
          backdropFilter: "blur(6px)",
          border: "1px solid #293d56",
          borderRadius: 8,
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          color: "#cbd5e1"
        }}>
          <div>
            <span style={{ color: "#94a3b8" }}>Gedung: </span>
            <strong style={{ color: "#b8f36b" }}>{activeBuildingDim.w}m × {activeBuildingDim.h}m</strong>
          </div>
          <span style={{ color: "#475569" }}>|</span>
          <div>
            <span style={{ color: "#94a3b8" }}>Bubungan: </span>
            <strong style={{ color: "#38bdf8" }}>{ridgeAxis === "NS" ? "Utara-Selatan (90°)" : "Barat-Timur (0°)"}</strong>
          </div>
          <span style={{ color: "#475569" }}>|</span>
          <div>
            <span style={{ color: "#94a3b8" }}>Pitch: </span>
            <strong style={{ color: "#f59e0b" }}>{roofPitchDeg}°</strong>
          </div>
        </div>

        {/* Floating Zoom & Camera Action Buttons (Bottom-Right) */}
        <div style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 7,
          zIndex: 10
        }}>
          <button
            type="button"
            title="Zoom In (atau Shift + Scroll ke atas)"
            onClick={handleZoomIn}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#162338ee",
              border: "1px solid #334968",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.4)"
            }}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            title="Zoom Out (atau Shift + Scroll ke bawah)"
            onClick={handleZoomOut}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#162338ee",
              border: "1px solid #334968",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.4)"
            }}
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            title="Reset Sudut Pandang Kamera"
            onClick={handleResetCamera}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#162338ee",
              border: "1px solid #334968",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.4)"
            }}
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontSize: 12 }}>
        <RotateCcw size={14} /> Orbit kamera · Shift + Scroll untuk zoom 3D · Tombol zoom (+ / -) di kanan bawah · Gunakan tombol "Putar Arah Atap 90°" untuk menyelaraskan arah bubungan atap.
      </div>
      <p style={{ color: "#fbbf24", fontSize: 12, margin: 0 }}>
        Batasan engineering: DEM API memberikan grid elevasi resolusi terbatas untuk konteks visual, bukan survey konstruksi. Multi-roof/hip saat ini merupakan geometri konseptual. Shadow adalah simulasi geometris akurat secara astronomis berdasarkan koordinat lokasi dan waktu terpilih.
      </p>
    </section>
  );
}
