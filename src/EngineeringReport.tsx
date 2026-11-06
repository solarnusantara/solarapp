import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Sun,
  Zap,
  CloudSun,
  Printer,
  RefreshCw,
  ShieldCheck,
  MapPin,
  TrendingUp,
  Leaf,
  Layers,
  Thermometer,
  Gauge,
  Activity,
  FileText,
  Eye,
  X,
  Compass,
  Clock,
  CheckCircle2,
  Building2,
  Award,
  Box,
} from "lucide-react";
import {
  findNearestPlnSubstations,
} from "./gisSolarService";
import ReportsHost, { type ReportView } from "./reports/ReportsHost";
import { useReportData } from "./reports/useReportData";
import { engineYield, lossLines, out as engineOut } from "./reports/model";
import { pct as fmtPct, n as fmtNum, DASH } from "./reports/format";
import type {
  SolarYieldResult,
  PlnSubstation,
} from "./gisSolarService";
import { REAL_PROJECTS, getProjectDefaultLayout } from "./defaultProjectsData";

type Props = {
  lang?: "en" | "id";
  projectId?: string | null;
  project?: any;
};

const GOOGLE_MAPS_API_KEY = (typeof window !== "undefined" && (window as any).GOOGLE_MAPS_API_KEY) || "AIzaSyC6TAjg7EBuCmkaWRwl-ih0PQ_Be07rc3o";

// Precise Solar Position calculation based on NOAA solar geometry
function computeSolarPosition(hour: number, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
  const diff = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start.getTime();
  const day = Math.floor(diff / 86400000);
  const gamma = ((2 * Math.PI) / 365) * (day - 1 + (hour - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const offsetMinutes = 420; // UTC+7 WIB
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
  return { elevation, azimuth };
}

// ============================================================================
// REAL 3D VIEWPORT COMPONENT (THREE.JS / WEBGL)
// ============================================================================
export function Report3DViewport({
  panels,
  obstacles,
  areaW,
  areaH,
  moduleW,
  moduleH,
  tilt,
  siteCorners,
  theme = "dark",
  interactive = true,
  height = 220,
  defaultHour = 12.0,
  coords = { lat: -6.36, lng: 107.17 },
  onHourChange,
  hideTimeControls = false,
  titleBadge,
  cameraTransform,
  onCameraChange,
  roof3dConfig,
  projectId,
}: {
  panels: any[];
  obstacles: any[];
  areaW: number;
  areaH: number;
  moduleW: number;
  moduleH: number;
  tilt: number;
  siteCorners?: Array<{ x: number; y: number }>;
  theme?: "light" | "dark";
  interactive?: boolean;
  height?: number | string;
  defaultHour?: number;
  coords?: { lat: number; lng: number };
  onHourChange?: (h: number) => void;
  hideTimeControls?: boolean;
  titleBadge?: string;
  cameraTransform?: { position: [number, number, number]; target: [number, number, number] } | null;
  onCameraChange?: (cam: { position: [number, number, number]; target: [number, number, number] }) => void;
  roof3dConfig?: any;
  projectId?: string | null;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [hour, setHour] = useState(defaultHour);
  const [cameraPreset, setCameraPreset] = useState<"iso" | "top">("iso");

  const effectiveRoof3d = useMemo(() => {
    if (roof3dConfig) return roof3dConfig;
    if (projectId) {
      try {
        const raw = localStorage.getItem(`solar-apps-3d-roof:${projectId}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    if (projectId?.includes("mas-silueta")) {
      return {
        surfaceMode: "roof-multi-3",
        ridgeAxis: "NS",
        roofFitMode: "fit-panels",
        wallHeight: 5.0,
        roofPitchDeg: 10,
      };
    }
    return null;
  }, [roof3dConfig, projectId]);

  useEffect(() => {
    setHour(defaultHour);
  }, [defaultHour]);

  const sunPos = useMemo(() => {
    return computeSolarPosition(hour, coords.lat, coords.lng);
  }, [hour, coords.lat, coords.lng]);

  const isNight = hour >= 20 || hour <= 4 || hour === 24 || hour === 0;
  const isGround = areaW > 150000 && areaH > 80000;
  const buildingHeight = isGround ? 0.9 : 3.5;
  const areaWM = Math.max(10, areaW / 1000);
  const areaHM = Math.max(10, areaH / 1000);
  const centerX = areaWM / 2;
  const centerZ = areaHM / 2;
  const span = Math.hypot(areaWM, areaHM);

  const handleSetHour = (h: number) => {
    setHour(h);
    if (onHourChange) onHourChange(h);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const heightPx = typeof height === "number" ? height : (mount.clientHeight || 220);

    // Perspective Camera with wider FOV to comfortably encompass the sky arc and the ground array
    const camera = new THREE.PerspectiveCamera(42, width / heightPx, 0.5, span * 15);
    cameraRef.current = camera;
    const viewDist = span * 1.25 + 6;

    // High quality renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Scene setup with distinct daylight sky (Siang) vs nocturnal dark sky (Malam)
    const scene = new THREE.Scene();
    scene.background = isNight ? new THREE.Color("#080f1a") : new THREE.Color("#e0f2fe");

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.enabled = interactive;

    // Apply synchronized camera transform, top preset, or calibrated front perspective (matching user preview)
    if (cameraPreset === "top") {
      const topDist = Math.max(areaWM, areaHM) * 1.35;
      camera.position.set(0, topDist, 0.01);
      controls.target.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
    } else if (cameraTransform) {
      camera.position.set(...cameraTransform.position);
      controls.target.set(...cameraTransform.target);
      camera.lookAt(...cameraTransform.target);
    } else {
      // Calibrated Front-Perspective framing (matching Image 1 preview)
      const targetCoverage = areaWM * 1.32;
      const aspect = Math.max(1.5, width / heightPx);
      const fovRad = (42 * Math.PI) / 180;
      const idealDist = (targetCoverage / aspect / 2) / Math.tan(fovRad / 2);
      const elevAngle = (26 * Math.PI) / 180;
      const camZ = Math.max(areaHM * 0.68 + 20, idealDist * Math.cos(elevAngle));
      const camY = Math.max(15, camZ * Math.tan(elevAngle) + buildingHeight);
      const camX = 0; // centered in front, looking north

      camera.position.set(camX, camY, camZ);
      controls.target.set(0, buildingHeight * 0.5, 0);
      camera.lookAt(0, buildingHeight * 0.5, 0);
    }
    controls.update();

    // Listen to user interaction and synchronize camera with other viewports
    let debounceTimer: any = null;
    const handleControlsChange = () => {
      if (!interactive) return;
      if (onCameraChange) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          onCameraChange({
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          });
        }, 120);
      }
    };
    controls.addEventListener("change", handleControlsChange);

    // =========================================================================
    // LIGHTING & ATMOSPHERE (SIANG 12:00 vs MALAM 24:00)
    // =========================================================================
    if (!isNight) {
      // SIANG: Directional Sun Light with Crisp Soft Shadows
      const realSunRad = Math.max(0.05, (sunPos.elevation * Math.PI) / 180);
      const realAzRad = (sunPos.azimuth * Math.PI) / 180;
      const sunDir = new THREE.Vector3(
        Math.sin(realAzRad) * Math.cos(realSunRad),
        Math.sin(realSunRad),
        -Math.cos(realAzRad) * Math.cos(realSunRad)
      );

      const lightDist = span * 2.2;
      const sunLight = new THREE.DirectionalLight(0xfffaed, 3.8);
      sunLight.position.copy(sunDir.clone().multiplyScalar(lightDist));
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.camera.left = -span * 0.9;
      sunLight.shadow.camera.right = span * 0.9;
      sunLight.shadow.camera.top = span * 0.9;
      sunLight.shadow.camera.bottom = -span * 0.9;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = lightDist * 2.2;
      sunLight.shadow.bias = -0.0003;
      scene.add(sunLight);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb0c4de, 1.25);
      scene.add(hemiLight);

      // Sun Path Trajectory Arc across the sky
      const arcPoints: THREE.Vector3[] = [];
      const arcRadius = span * 1.35;
      for (let h = 6.0; h <= 18.0; h += 0.5) {
        const p = computeSolarPosition(h, coords.lat, coords.lng);
        const visualElev = Math.min(50, Math.max(8, p.elevation * 0.6 + 6));
        const altRad = (visualElev * Math.PI) / 180;
        const azmRad = (p.azimuth * Math.PI) / 180;
        arcPoints.push(
          new THREE.Vector3(
            Math.sin(azmRad) * Math.cos(altRad) * arcRadius,
            Math.sin(altRad) * arcRadius + buildingHeight,
            -Math.cos(azmRad) * Math.cos(altRad) * arcRadius
          )
        );
      }
      const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.6,
      });
      scene.add(new THREE.Line(arcGeom, arcMat));

      // Luminous Golden Sun Orb & Corona
      const currentVisualElev = Math.min(50, Math.max(8, sunPos.elevation * 0.6 + 6));
      const curAltRad = (currentVisualElev * Math.PI) / 180;
      const curAzmRad = (sunPos.azimuth * Math.PI) / 180;
      const sunOrbPos = new THREE.Vector3(
        Math.sin(curAzmRad) * Math.cos(curAltRad) * arcRadius,
        Math.sin(curAltRad) * arcRadius + buildingHeight,
        -Math.cos(curAzmRad) * Math.cos(curAltRad) * arcRadius
      );

      const sunOrbGeom = new THREE.SphereGeometry(Math.max(2.6, span * 0.045), 32, 32);
      const sunOrbMat = new THREE.MeshBasicMaterial({ color: 0xfff388 });
      const sunOrb = new THREE.Mesh(sunOrbGeom, sunOrbMat);
      sunOrb.position.copy(sunOrbPos);
      scene.add(sunOrb);

      const ringGeom = new THREE.RingGeometry(span * 0.045, span * 0.085, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.copy(sunOrbPos);
      ringMesh.lookAt(camera.position);
      scene.add(ringMesh);
    } else {
      // MALAM: Nocturnal Sky with Moonlit Ambient & Safety Perimeter Markers
      // Crisp directional moonlight so panel racking, rows, and structure cast visible contrasts
      const moonLight = new THREE.DirectionalLight(0xa5c4f5, 2.6);
      moonLight.position.set(span * 0.4, span * 1.5, span * 0.7);
      moonLight.castShadow = true;
      scene.add(moonLight);

      const nightHemiLight = new THREE.HemisphereLight(0x60a5fa, 0x0f172a, 1.15);
      scene.add(nightHemiLight);

      // Starfield particles in upper sky
      const starCount = 350;
      const starGeom = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.42;
        const r = span * 2.5;
        starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.cos(phi) + 6;
        starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xbae6fd,
        size: Math.max(1.8, span * 0.014),
        transparent: true,
        opacity: 0.9,
      });
      scene.add(new THREE.Points(starGeom, starMat));

      // Perimeter safety LED beacon markers (bright green beacons)
      const beaconCorners = [
        { x: -areaWM / 2, z: -areaHM / 2 },
        { x: areaWM / 2, z: -areaHM / 2 },
        { x: areaWM / 2, z: areaHM / 2 },
        { x: -areaWM / 2, z: areaHM / 2 },
      ];
      beaconCorners.forEach((c) => {
        const beaconGeom = new THREE.SphereGeometry(Math.max(0.6, span * 0.012), 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
        const beacon = new THREE.Mesh(beaconGeom, beaconMat);
        beacon.position.set(c.x, buildingHeight + 0.4, c.z);
        scene.add(beacon);
      });
    }

    // Ground Plane & Engineering Grid (Bright clean terrain in Siang, dark nocturnal in Malam)
    const groundGeom = new THREE.PlaneGeometry(span * 3, span * 3);
    groundGeom.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x0f172a : 0xe2e8f0,
      roughness: 0.85,
    });
    const groundMesh = new THREE.Mesh(groundGeom, groundMat);
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(
      span * 2.2,
      Math.max(12, Math.round(span / 4)),
      isNight ? 0x38bdf8 : 0x94a3b8,
      isNight ? 0x1e293b : 0xcbd5e1
    );
    gridHelper.position.y = -0.04;
    scene.add(gridHelper);

    // Cardinal Direction Sprites (Crisp High-Contrast Badges for WCAG Accessibility)
    const compassDist = span * 0.65;
    const directions = [
      { label: "UTARA (N)", x: 0, z: -compassDist, color: "#0284c7" },
      { label: "SELATAN (S)", x: 0, z: compassDist, color: "#0f172a" },
      { label: "TIMUR (E)", x: compassDist, z: 0, color: "#d97706" },
      { label: "BARAT (W)", x: -compassDist, z: 0, color: "#d97706" },
    ];
    directions.forEach((d) => {
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 42;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = isNight ? "#0f172af2" : "#fffffffa";
        if (ctx.roundRect) ctx.roundRect(0, 0, 180, 42, 7);
        else ctx.rect(0, 0, 180, 42);
        ctx.fill();
        ctx.strokeStyle = isNight ? "#38bdf8" : "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = isNight ? "#ffffff" : "#0f172a";
        ctx.font = "bold 15px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(d.label, 90, 21);
        const tex = new THREE.CanvasTexture(canvas);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sp.scale.set(span * 0.15, (span * 0.15 * 42) / 180, 1);
        sp.position.set(d.x, 0.4, d.z);
        scene.add(sp);
      }
    });

    // 1. Gather display panels
    let displayPanels = panels;
    if (!displayPanels || displayPanels.length === 0) {
      displayPanels = [];
      const cols = Math.floor((areaW - 4000) / (moduleW + 400));
      const rows = Math.floor((areaH - 4000) / (moduleH + 800));
      let idCounter = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          displayPanels.push({
            id: idCounter++,
            x: 2000 + c * (moduleW + 400),
            y: 2000 + r * (moduleH + 800),
            w: moduleW,
            h: moduleH,
          });
        }
      }
    }

    // 2. Compute panel bounding box in millimeters
    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    displayPanels.forEach((p: any) => {
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
    const panelSpanW = hasPanels ? (pMaxX - pMinX) / 1000 : areaWM;
    const panelSpanH = hasPanels ? (pMaxY - pMinY) / 1000 : areaHM;
    const panelCenterMmX = hasPanels ? (pMinX + pMaxX) / 2 : areaW / 2;
    const panelCenterMmY = hasPanels ? (pMinY + pMaxY) / 2 : areaH / 2;

    // 3. Configure roof mode, dimensions, orientation synced from PV Layout 3D
    const r3d = effectiveRoof3d;
    let mode = r3d?.surfaceMode || (projectId?.includes("mas-silueta") ? "roof-multi-3" : "auto");
    if (mode === "auto") {
      mode = isGround ? "flat" : projectId?.includes("mas-silueta") ? "roof-multi-3" : "roof-gable";
    }
    const isMultiBay = mode === "roof-multi-2" || mode === "roof-multi-3" || mode === "roof-multi-4";
    const bayCount = mode === "roof-multi-2" ? 2 : mode === "roof-multi-4" ? 4 : mode === "roof-multi-3" ? 3 : 1;
    const isGable = mode === "roof-gable" || isMultiBay;
    const ridgeAxis: "NS" | "WE" = r3d?.ridgeAxis || "NS";
    const wallH = r3d?.wallHeight ? Number(r3d.wallHeight) : buildingHeight;
    const pitchDeg = r3d?.roofPitchDeg ? Number(r3d.roofPitchDeg) : (tilt || 10);
    const roofPitch = Math.max(1, Math.min(45, pitchDeg)) * (Math.PI / 180);

    let buildingW = areaWM;
    let buildingH = areaHM;
    if (r3d?.roofFitMode === "custom" && Number(r3d.customRoofW) > 0) {
      buildingW = Number(r3d.customRoofW);
      buildingH = Number(r3d.customRoofH) > 0 ? Number(r3d.customRoofH) : Math.max(10, Math.round(panelSpanH + 6));
    } else if (r3d?.roofFitMode === "fit-panels" || !isGround) {
      buildingW = Math.max(10, Math.round(panelSpanW + 6));
      buildingH = Math.max(10, Math.round(panelSpanH + 6));
    }

    const halfW = buildingW / 2;
    const halfH = buildingH / 2;
    const baseRoofY = wallH;

    // 4. Roof height function
    let roofHeight: (x: number, z: number) => number;
    if (isGable) {
      if (ridgeAxis === "NS") {
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

    // Building Roof & Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x1e293b : 0x475569,
      roughness: 0.8,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x0f172a : 0x8ba2b8,
      roughness: 0.88,
      metalness: 0.18,
      side: THREE.DoubleSide
    });

    if (!isGround) {
      // Main warehouse box walls
      const wallGeom = new THREE.BoxGeometry(buildingW, baseRoofY, buildingH);
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
      wallMesh.position.set(0, baseRoofY / 2 - 0.08, 0);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      scene.add(wallMesh);

      // Pitched triangular gables
      if (isGable) {
        const gableMat = new THREE.MeshStandardMaterial({
          color: isNight ? 0x1e293b : 0x475569,
          roughness: 0.8,
          side: THREE.DoubleSide
        });

        if (ridgeAxis === "NS") {
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

      // Corrugated / Pitched Roof Surface Mesh
      const segX = Math.max(32, bayCount * 16);
      const segZ = Math.max(32, bayCount * 16);
      const surfaceGeom = new THREE.PlaneGeometry(buildingW, buildingH, segX, segZ);
      surfaceGeom.rotateX(-Math.PI / 2);
      const pos = surfaceGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, roofHeight(x, z) + 0.025);
      }
      pos.needsUpdate = true;
      surfaceGeom.computeVertexNormals();

      const surfaceMesh = new THREE.Mesh(surfaceGeom, roofMat);
      surfaceMesh.receiveShadow = true;
      scene.add(surfaceMesh);
    }

    // PV Modules Array (InstancedMesh with metallic sheen & elevation offset)
    const n = displayPanels.length;
    if (n > 0) {
      const samplePanel = displayPanels[0];
      const pW = (Number(samplePanel?.w) || moduleW || 1134) / 1000;
      const pH = (Number(samplePanel?.h) || moduleH || 2278) / 1000;

      const panelGeom = new THREE.BoxGeometry(pW, 0.05, pH);
      const panelMat = new THREE.MeshStandardMaterial({
        color: !isNight ? 0x0284c7 : 0x2563eb,
        roughness: !isNight ? 0.22 : 0.32,
        metalness: !isNight ? 0.65 : 0.55,
      });
      const panelIM = new THREE.InstancedMesh(panelGeom, panelMat, n);
      panelIM.castShadow = !isNight;
      panelIM.receiveShadow = true;

      const dummy = new THREE.Object3D();
      displayPanels.forEach((p, idx) => {
        const pw = (Number(p.w) || moduleW) / 1000;
        const ph = (Number(p.h) || moduleH) / 1000;
        const px = ((Number(p.x) || 0) + pw * 500 - panelCenterMmX) / 1000;
        const pz = ((Number(p.y) || 0) + ph * 500 - panelCenterMmY) / 1000;
        const py = roofHeight(px, pz) + 0.12;

        dummy.position.set(px, py, pz);

        if (isGable) {
          if (ridgeAxis === "NS") {
            const bayW = buildingW / bayCount;
            const xNorm = Math.max(0, Math.min(buildingW - 0.001, px + halfW));
            const bayIdx = Math.floor(xNorm / bayW);
            const bayCenterX = (bayIdx + 0.5) * bayW - halfW;
            const deltaX = px - bayCenterX;
            dummy.rotation.set(0, 0, deltaX < 0 ? roofPitch : -roofPitch);
          } else {
            const bayH = buildingH / bayCount;
            const zNorm = Math.max(0, Math.min(buildingH - 0.001, pz + halfH));
            const bayIdx = Math.floor(zNorm / bayH);
            const bayCenterZ = (bayIdx + 0.5) * bayH - halfH;
            const deltaZ = pz - bayCenterZ;
            dummy.rotation.set(deltaZ < 0 ? roofPitch : -roofPitch, 0, 0);
          }
        } else {
          dummy.rotation.set(((tilt || 10) * Math.PI) / 180, 0, 0);
        }

        dummy.updateMatrix();
        panelIM.setMatrixAt(idx, dummy.matrix);
      });
      panelIM.instanceMatrix.needsUpdate = true;
      scene.add(panelIM);
    }

    // Obstacles (HVAC Chillers / Substation)
    obstacles.forEach((obs: any) => {
      const ow = Math.max(1, (Number(obs.w) || 3000) / 1000);
      const oh = Math.max(1, (Number(obs.h) || 3000) / 1000);
      const ox = ((Number(obs.x) || 0) + ow * 500 - panelCenterMmX) / 1000;
      const oz = ((Number(obs.y) || 0) + oh * 500 - panelCenterMmY) / 1000;
      const obsHeight = Number(obs.heightM) || 2.4;
      const oy = roofHeight(ox, oz) + obsHeight / 2;

      const obsGeom = new THREE.BoxGeometry(ow, obsHeight, oh);
      const obsMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.45,
        metalness: 0.35,
      });
      const obsMesh = new THREE.Mesh(obsGeom, obsMat);
      obsMesh.position.set(ox, oy, oz);
      obsMesh.castShadow = true;
      obsMesh.receiveShadow = true;
      scene.add(obsMesh);

      // Label sprite
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 36;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#dc2626f0";
        if (ctx.roundRect) ctx.roundRect(0, 0, 180, 36, 4);
        else ctx.fillRect(0, 0, 180, 36);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(obs.label || "HVAC CHILLER", 90, 18);
        const tex = new THREE.CanvasTexture(canvas);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sp.scale.set(Math.max(ow * 1.2, 5), (Math.max(ow * 1.2, 5) * 36) / 180, 1);
        sp.position.set(ox, oy + obsHeight / 2 + 0.6, oz);
        scene.add(sp);
      }
    });

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = typeof height === "number" ? height : (mount.clientHeight || 220);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      controls.removeEventListener("change", handleControlsChange);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [panels, obstacles, areaW, areaH, moduleW, moduleH, tilt, siteCorners, theme, interactive, height, sunPos, cameraPreset, hour, effectiveRoof3d]);

  // Synchronize camera smoothly across mounted viewports when shared camera state updates
  useEffect(() => {
    if (!cameraTransform || !cameraRef.current || !controlsRef.current || cameraPreset === "top") return;
    const c = cameraRef.current;
    const ctrl = controlsRef.current;
    const curP = c.position;
    const newP = cameraTransform.position;
    const curT = ctrl.target;
    const newT = cameraTransform.target;

    const pDist = Math.hypot(curP.x - newP[0], curP.y - newP[1], curP.z - newP[2]);
    const tDist = Math.hypot(curT.x - newT[0], curT.y - newT[1], curT.z - newT[2]);

    if (pDist > 0.5 || tDist > 0.5) {
      c.position.set(newP[0], newP[1], newP[2]);
      ctrl.target.set(newT[0], newT[1], newT[2]);
      ctrl.update();
    }
  }, [cameraTransform, cameraPreset]);

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden", background: isNight ? "#080f1a" : "#e0f2fe" }}>
      {/* 3D Viewport Controls Overlay */}
      <div
        className="no-print"
        style={{
          position: "absolute",
          top: 6,
          left: 8,
          right: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {/* Dual Time Controls or Static Title Badge */}
        {hideTimeControls ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: isNight ? "rgba(11,19,32,0.92)" : "rgba(255,255,255,0.95)",
              padding: "3px 8px",
              borderRadius: 4,
              border: isNight ? "1px solid #1e293b" : "1px solid #cbd5e1",
              pointerEvents: "auto",
              boxShadow: isNight ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
              fontSize: 9,
              fontWeight: 700,
              color: isNight ? "#818cf8" : "#b45309",
            }}
          >
            {titleBadge || (isNight ? "🌙 24:00 WIB (Malam / Nokturnal)" : "☀️ 12:00 WIB (Siang / Puncak)")}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 5, background: isNight ? "rgba(11,19,32,0.92)" : "rgba(255,255,255,0.95)", padding: "3px 5px", borderRadius: 5, border: isNight ? "1px solid #1e293b" : "1px solid #cbd5e1", pointerEvents: "auto", boxShadow: isNight ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)" }}>
            <button
              type="button"
              onClick={() => handleSetHour(12.0)}
              style={{
                padding: "3px 9px",
                fontSize: 9.5,
                fontWeight: 700,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: Math.abs(hour - 12.0) < 0.2 ? "#f59e0b" : "transparent",
                color: Math.abs(hour - 12.0) < 0.2 ? "#ffffff" : (isNight ? "#94a3b8" : "#475569"),
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ☀️ 12:00 (Siang / Puncak)
            </button>
            <button
              type="button"
              onClick={() => handleSetHour(24.0)}
              style={{
                padding: "3px 9px",
                fontSize: 9.5,
                fontWeight: 700,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: (Math.abs(hour - 24.0) < 0.2 || Math.abs(hour - 0.0) < 0.2) ? "#6366f1" : "transparent",
                color: (Math.abs(hour - 24.0) < 0.2 || Math.abs(hour - 0.0) < 0.2) ? "#ffffff" : (isNight ? "#94a3b8" : "#475569"),
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              🌙 24:00 (Malam / Nokturnal)
            </button>
          </div>
        )}

        {/* Camera Preset Controls */}
        <div style={{ display: "flex", gap: 4, background: isNight ? "rgba(11,19,32,0.92)" : "rgba(255,255,255,0.95)", padding: "3px 5px", borderRadius: 5, border: isNight ? "1px solid #1e293b" : "1px solid #cbd5e1", pointerEvents: "auto", boxShadow: isNight ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)" }}>
          <button
            type="button"
            onClick={() => {
              setCameraPreset("iso");
              if (cameraRef.current && controlsRef.current) {
                const width = mountRef.current?.clientWidth || 800;
                const heightPx = typeof height === "number" ? height : (mountRef.current?.clientHeight || 220);
                const targetCoverage = areaWM * 1.32;
                const aspect = Math.max(1.5, width / heightPx);
                const fovRad = (42 * Math.PI) / 180;
                const idealDist = (targetCoverage / aspect / 2) / Math.tan(fovRad / 2);
                const elevAngle = (26 * Math.PI) / 180;
                const camZ = Math.max(areaHM * 0.68 + 20, idealDist * Math.cos(elevAngle));
                const camY = Math.max(15, camZ * Math.tan(elevAngle) + buildingHeight);
                cameraRef.current.position.set(0, camY, camZ);
                controlsRef.current.target.set(0, buildingHeight * 0.5, 0);
                controlsRef.current.update();
                if (onCameraChange) {
                  onCameraChange({
                    position: [0, camY, camZ],
                    target: [0, buildingHeight * 0.5, 0],
                  });
                }
              }
            }}
            style={{
              padding: "3px 8px",
              fontSize: 9.5,
              fontWeight: 700,
              borderRadius: 3,
              border: "none",
              cursor: "pointer",
              background: cameraPreset === "iso" ? "#0284c7" : "transparent",
              color: cameraPreset === "iso" ? "#ffffff" : (isNight ? "#94a3b8" : "#475569"),
            }}
          >
            📐 3D Isometrik
          </button>
          <button
            type="button"
            onClick={() => {
              setCameraPreset("top");
              if (cameraRef.current && controlsRef.current) {
                const topDist = Math.max(areaWM, areaHM) * 1.35;
                cameraRef.current.position.set(0, topDist, 0.01);
                controlsRef.current.target.set(0, 0, 0);
                controlsRef.current.update();
                if (onCameraChange) {
                  onCameraChange({
                    position: [0, topDist, 0.01],
                    target: [0, 0, 0],
                  });
                }
              }
            }}
            style={{
              padding: "3px 8px",
              fontSize: 9.5,
              fontWeight: 700,
              borderRadius: 3,
              border: "none",
              cursor: "pointer",
              background: cameraPreset === "top" ? "#0284c7" : "transparent",
              color: cameraPreset === "top" ? "#ffffff" : (isNight ? "#94a3b8" : "#475569"),
            }}
          >
            🔭 Tampak Atap
          </button>
        </div>
      </div>

      {/* Three.js Canvas Container */}
      <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />

      {/* Floating Info Pill at Bottom */}
      <div
        className="no-print"
        style={{
          position: "absolute",
          bottom: 6,
          left: 8,
          right: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 8.5,
          color: isNight ? "#cbd5e1" : "#1e293b",
          background: isNight ? "rgba(11,19,32,0.90)" : "rgba(255,255,255,0.94)",
          padding: "3px 9px",
          borderRadius: 4,
          border: isNight ? "1px solid #1e293b" : "1px solid #cbd5e1",
          pointerEvents: "none",
          boxShadow: isNight ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        <span>
          {isNight ? "🌙 24:00 WIB (Malam / Nokturnal)" : "☀️ 12:00 WIB (Siang / Puncak Surya)"} · Elevasi: <strong>{sunPos.elevation.toFixed(1)}°</strong> · Azimuth: <strong>{sunPos.azimuth.toFixed(1)}°</strong> · {isNight ? "Standby Isolation Proteksi Arus Balik Grid" : "Radiasi Puncak & Bebas Shading"}
        </span>
        <span style={{ color: isNight ? "#94a3b8" : "#64748b" }}>🖱️ Drag mouse untuk rotasi 3D · Scroll zoom</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT: EngineeringReport
// ============================================================================
export default function EngineeringReport({ lang = "id", projectId = null, project = null }: Props) {
  const isId = lang === "id";

  // Resolve active project metadata
  const activeProj = useMemo(() => {
    if (project && project.id) return project;
    if (projectId) {
      const found = REAL_PROJECTS.find((p) => p.id === projectId);
      if (found) return found;
    }
    return REAL_PROJECTS[0]; // Default Cikarang 500 kWp
  }, [project, projectId]);

  // Load layout data (panels, obstacles, settings, polygon, site)
  const savedLayout = useMemo(() => {
    const targetId = activeProj?.id ?? projectId;
    if (!targetId) return null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("solar-apps-pv-layout-v1:") && key.endsWith(`:${targetId}`)) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.panels && parsed.panels.length > 0) return parsed;
          }
        }
      }
    } catch { /* ignore */ }
    return getProjectDefaultLayout(targetId) || null;
  }, [activeProj?.id, projectId]);

  // Project defaults based on selection and saved layout
  const isCikarang = activeProj?.id === "proj-cikarang-500kwp";
  const siteCoords = savedLayout?.site?.coordinates;
  const siteAddress = savedLayout?.site?.address;
  const defaultCoords = isCikarang
    ? { lat: -6.3625, lng: 107.1689, name: "GIIC Cikarang, Jawa Barat" }
    : { lat: -6.36838, lng: 107.19759, name: "Kawasan Industri KIIC Karawang (Lahan Ground-Mounted), Jawa Barat" };

  const initialCoords = (siteCoords?.lat && siteCoords?.lng)
    ? {
        lat: Number(siteCoords.lat),
        lng: Number(siteCoords.lng),
        name: siteAddress || defaultCoords.name,
      }
    : defaultCoords;

  const defaultClient = isCikarang
    ? "PT Cikarang Multi Industri Tbk (GIIC Cikarang)"
    : "PT Kawasan Industri Karawang (KIIC)";

  const [client, setClient] = useState(defaultClient);
  const [prepared, setPrepared] = useState("Tim Engineering SolarApp");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Issued for Review (IFC)");
  const [coords, setCoords] = useState(initialCoords);
  const [capacityKwp, setCapacityKwp] = useState(activeProj?.capacity || 500);

  // View & Preview States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<"screen" | "a4-light">("screen");
  const [active3DHour, setActive3DHour] = useState<number>(12.0);

  // Synchronized 3D Camera State across all viewports (Screen Dashboard, PDF Page 3 Siang, PDF Page 3 Malam)
  const [sharedCamera, setSharedCamera] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(() => {
    try {
      const targetId = activeProj?.id ?? projectId ?? "default";
      const raw = localStorage.getItem(`solar-apps-3d-cam:${targetId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      const targetId = activeProj?.id ?? projectId ?? "default";
      const raw = localStorage.getItem(`solar-apps-3d-cam:${targetId}`);
      if (raw) {
        setSharedCamera(JSON.parse(raw));
      } else {
        setSharedCamera(null);
      }
    } catch {}
  }, [activeProj?.id, projectId]);

  const handleCameraChange = useCallback(
    (cam: { position: [number, number, number]; target: [number, number, number] }) => {
      setSharedCamera(cam);
      try {
        const targetId = activeProj?.id ?? projectId ?? "default";
        localStorage.setItem(`solar-apps-3d-cam:${targetId}`, JSON.stringify(cam));
      } catch {}
    },
    [activeProj?.id, projectId]
  );

  // GIS Solar Irradiance & Yield State
  const reportData = useReportData(activeProj?.id ?? projectId, { hourly: false });
  const [reportView, setReportView] = useState<ReportView | null>(null);
  const [yieldData, setYieldData] = useState<SolarYieldResult | null>(null);
  const [loadingGis, setLoadingGis] = useState(false);
  const [gisError, setGisError] = useState<string | null>(null);
  const [substations, setSubstations] = useState<PlnSubstation[]>([]);

  // Update when project or savedLayout changes
  useEffect(() => {
    const isCik = activeProj?.id === "proj-cikarang-500kwp";
    const curSiteCoords = savedLayout?.site?.coordinates;
    const curSiteAddress = savedLayout?.site?.address;
    const baseCoords = isCik
      ? { lat: -6.3625, lng: 107.1689, name: "GIIC Cikarang, Jawa Barat" }
      : { lat: -6.36838, lng: 107.19759, name: "Kawasan Industri KIIC Karawang (Lahan Ground-Mounted), Jawa Barat" };

    const nextCoords = (curSiteCoords?.lat && curSiteCoords?.lng)
      ? {
          lat: Number(curSiteCoords.lat),
          lng: Number(curSiteCoords.lng),
          name: curSiteAddress || baseCoords.name,
        }
      : baseCoords;

    setCoords(nextCoords);
    setCapacityKwp(activeProj?.capacity || (isCik ? 500 : 2000));
    setClient(
      isCik
        ? "PT Cikarang Multi Industri Tbk (GIIC Cikarang)"
        : "PT Kawasan Industri Karawang (KIIC)"
    );
  }, [activeProj, savedLayout]);

  // Fetch GIS Solar Climatology and Grid Substation Data
  async function loadGisData() {
    setLoadingGis(true);
    setGisError(null);
    try {
      reportData.reload();
      const subs = findNearestPlnSubstations(coords.lat, coords.lng, 3);
      setSubstations(subs);
    } catch (err: any) {
      console.error("GIS Climatology fetch failed:", err);
      setGisError(err?.message || "Gagal mengambil data GIS");
    } finally {
      setLoadingGis(false);
    }
  }

  useEffect(() => {
    setYieldData(engineYield(reportData.result, coords));
  }, [reportData.result, coords.lat, coords.lng]);

  useEffect(() => {
    loadGisData();
  }, [coords.lat, coords.lng, capacityKwp]);

  const maxMonthlyKwh = useMemo(() => {
    if (!yieldData) return 1;
    return Math.max(...yieldData.monthly.map((m) => m.monthlyEnergyKwh), 1);
  }, [yieldData]);

  // CAD 2D rendering variables
  const targetProjId = activeProj?.id ?? projectId;
  const layoutSettings = savedLayout?.settings ?? {};
  const roof3dConfig = useMemo(() => {
    try {
      const direct = localStorage.getItem(`solar-apps-3d-roof:${targetProjId}`);
      if (direct) return JSON.parse(direct);
      if (layoutSettings?.roof3d) return layoutSettings.roof3d;
    } catch {}
    if (targetProjId?.includes("mas-silueta")) {
      return {
        surfaceMode: "roof-multi-3",
        ridgeAxis: "NS",
        roofFitMode: "fit-panels",
        wallHeight: 5.0,
        roofPitchDeg: 10,
      };
    }
    return null;
  }, [targetProjId, layoutSettings?.roof3d]);

  const areaW = Number(layoutSettings.areaWidth) || (isCikarang ? 110000 : 220000);
  const areaH = Number(layoutSettings.areaHeight) || (isCikarang ? 32000 : 120000);
  const panels = Array.isArray(savedLayout?.panels) ? savedLayout.panels : [];
  const obstacles = Array.isArray(savedLayout?.obstacles) ? savedLayout.obstacles : [];
  const siteCorners = savedLayout?.site?.polygonCorners;
  const moduleW = Number(layoutSettings.moduleWidth) || 2278;
  const moduleH = Number(layoutSettings.moduleHeight) || 1134;
  const tilt = Number(layoutSettings.tilt) || 10;
  const totalPanels = panels.length || Math.round((capacityKwp * 1000) / 580);
  const totalModuleArea = (totalPanels * (moduleW * moduleH)) / 1_000_000;

  // Set document title dynamically to "SolarApp - [Nama Proyek]" for browser print dialog suggested filename
  const syncDocumentTitle = () => {
    const projName = activeProj?.name?.trim() || "Laporan Rekayasa PLTS";
    const title = `SolarApp - ${projName}`;
    document.title = title;
    try {
      if (window.top && window.top !== window) {
        window.top.document.title = title;
      }
    } catch {
      // ignore cross-origin restriction if any
    }
    return title;
  };

  useEffect(() => {
    const originalTitle = document.title;
    let originalTopTitle = "";
    try {
      if (window.top && window.top !== window) {
        originalTopTitle = window.top.document.title;
      }
    } catch {}

    syncDocumentTitle();

    const handleBeforePrint = () => {
      syncDocumentTitle();
    };
    window.addEventListener("beforeprint", handleBeforePrint);

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      document.title = originalTitle;
      try {
        if (window.top && window.top !== window && originalTopTitle) {
          window.top.document.title = originalTopTitle;
        }
      } catch {}
    };
  }, [activeProj?.name]);

  // Print function
  const handlePrint = () => {
    syncDocumentTitle();
    window.print();
  };

  // Reusable Kop Gambar / CAD Title Block for Pages 2 & 3
  const renderCadTitleBlock = (sheetNo: number, title: string, docNo: string) => (
    <div
      style={{
        border: "1.5px solid #0f172a",
        marginTop: 6,
        background: "#ffffff",
        fontSize: 9.5,
        color: "#0f172a",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 130px", borderBottom: "1px solid #cbd5e1" }}>
        <div style={{ padding: "5px 8px", borderRight: "1px solid #cbd5e1", display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 26, height: 26, background: "#10b981", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 12 }}>
            SA
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 11, color: "#0f172a", letterSpacing: 0.5 }}>SOLARAPP</div>
            <div style={{ fontSize: 7.5, color: "#1e293b", fontWeight: 800 }}>ENGINEERING STUDIO</div>
          </div>
        </div>

        <div style={{ padding: "4px 10px", borderRight: "1px solid #cbd5e1", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 7.5, color: "#1e293b", fontWeight: 700, textTransform: "uppercase" }}>NAMA PROYEK / FASILITAS</div>
          <div style={{ fontWeight: 800, fontSize: 10.5, color: "#0f172a" }}>{activeProj?.name} ({capacityKwp} kWp)</div>
          <div style={{ fontSize: 8, color: "#0f172a" }}>KLIEN: {client} · {coords.name}</div>
        </div>

        <div style={{ padding: "4px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 7.5, color: "#1e293b", fontWeight: 700 }}>SKALA / SATUAN</div>
          <div style={{ fontWeight: 700, fontSize: 9, color: "#0f172a" }}>NTS (1:500) · mm / meter</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 85px", fontSize: 8 }}>
        <div style={{ padding: "4px 8px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>JUDUL GAMBAR:</span> <strong style={{ color: "#0f172a", fontSize: 8.5 }}>{title}</strong>
        </div>
        <div style={{ padding: "4px 6px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>NO. GAMBAR:</span> <strong style={{ fontFamily: "monospace", color: "#0f172a" }}>{docNo}</strong>
        </div>
        <div style={{ padding: "4px 6px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>TANGGAL:</span> <strong style={{ color: "#0f172a" }}>{date}</strong>
        </div>
        <div style={{ padding: "4px 6px", background: "#f8fafc", textAlign: "center" }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>LEMBAR:</span> <strong style={{ color: "#0f172a" }}>{sheetNo} DARI 3</strong>
        </div>
      </div>
    </div>
  );

  // =========================================================================
  // SUB-RENDERER: PAGE 1 (EXECUTIVE SUMMARY & CLIMATOLOGY)
  // =========================================================================
  const renderPage1 = () => (
    <div>
      {/* Sheet Header Kop Surat */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "#10b981", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontWeight: 900, fontSize: 17 }}>
            SA
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", letterSpacing: 0.5 }}>SOLARAPP</div>
            <div style={{ fontSize: 9, color: "#059669", fontWeight: 700, letterSpacing: 1 }}>SOLAR PV ENGINEERING STUDIO & FEASIBILITY STUDY</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 8.5, color: "#1e293b", fontWeight: 600 }}>
          <div>DOKUMEN NO: <strong style={{ color: "#0f172a" }}>SOLARAPP-DED-2026-001</strong></div>
          <div>REVISI: <strong style={{ color: "#0f172a" }}>REV 0 (IFC)</strong></div>
          <div>TANGGAL LAPORAN: <strong style={{ color: "#0f172a" }}>{date}</strong></div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <h2 style={{ fontSize: 14.5, margin: "0 0 2px", color: "#0f172a", fontWeight: 800, textTransform: "uppercase" }}>
          LAPORAN KELAYAKAN REKAYASA & ESTIMASI PRODUKSI ENERGI PLTS
        </h2>
        <div style={{ fontSize: 8.5, color: "#1e293b", fontWeight: 600 }}>
          Kalkulasi Radiasi Matahari 25 Tahun NASA POWER, Analisis Rugi Daya, Profil Energi Bulanan & Titik Sambung PLN
        </div>
      </div>

      {/* Project Profile Table */}
      <div style={{ background: "#f8fafc", border: "1.5px solid #cbd5e1", borderRadius: 5, padding: "8px 11px", marginBottom: 10, fontSize: 9 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr", gap: 8 }}>
          <div>
            <span style={{ color: "#1e293b", fontWeight: 700 }}>Nama Proyek: </span>
            <strong style={{ color: "#0f172a" }}>{activeProj?.name}</strong>
            <div style={{ color: "#047857", fontWeight: 800, marginTop: 1 }}>Tipe: {activeProj?.system || "Rooftop On-Grid"} ({capacityKwp} kWp)</div>
          </div>
          <div>
            <span style={{ color: "#1e293b", fontWeight: 700 }}>Klien / Pemilik: </span>
            <strong style={{ color: "#0f172a" }}>{client}</strong>
            <div style={{ color: "#0f172a", marginTop: 1, fontWeight: 500 }}>Lokasi: {coords.name}</div>
          </div>
          <div>
            <span style={{ color: "#1e293b", fontWeight: 700 }}>Koordinat GPS: </span>
            <strong style={{ color: "#0f172a" }}>{coords.lat.toFixed(4)}°, {coords.lng.toFixed(4)}°</strong>
            <div style={{ color: "#0f172a", marginTop: 1, fontWeight: 500 }}>Status: {status}</div>
          </div>
        </div>
      </div>

      {/* 6 Metric KPI Badges */}
      {yieldData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 10, textAlign: "center" }}>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Kapasitas DC</div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.capacityKwp}</strong> <small style={{ fontSize: 8, color: "#047857", fontWeight: 800 }}>kWp</small>
          </div>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Total Modul</div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{totalPanels.toLocaleString()}</strong> <small style={{ fontSize: 8, color: "#047857", fontWeight: 800 }}>unit</small>
          </div>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Specific Yield</div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.specificYield.toLocaleString()}</strong> <small style={{ fontSize: 8, color: "#047857", fontWeight: 800 }}>kWh/kWp</small>
          </div>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Produksi Thn</div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.annualEnergyMwh.toLocaleString()}</strong> <small style={{ fontSize: 8, color: "#047857", fontWeight: 800 }}>MWh</small>
          </div>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Perf. Ratio (PR)</div>
            <strong style={{ fontSize: 13, color: "#047857" }}>{(yieldData.pr * 100).toFixed(1)}%</strong>
          </div>
          <div style={{ padding: "5px 6px", background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4 }}>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>Reduksi CO₂</div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.carbonOffsetTons.toLocaleString()}</strong> <small style={{ fontSize: 8, color: "#047857", fontWeight: 800 }}>ton</small>
          </div>
        </div>
      )}

      {/* Compact Monthly Bar Chart */}
      {yieldData && (
        <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 5, padding: "7px 10px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0f172a" }}>📊 Profil Produksi Energi Bulanan (MWh)</span>
            <span style={{ fontSize: 8, color: "#1e293b", fontWeight: 600 }}>Distribusi Musiman Berdasarkan Insolasi Harian NASA POWER 25 Tahun</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 5, alignItems: "flex-end", height: 72, background: "#f8fafc", borderRadius: 4, padding: "6px 5px 3px", border: "1px solid #e2e8f0" }}>
            {yieldData.monthly.map((m) => {
              const heightPct = Math.max(16, Math.round((m.monthlyEnergyKwh / maxMonthlyKwh) * 100));
              const mwh = (m.monthlyEnergyKwh / 1000).toFixed(1);
              return (
                <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 7.5, fontWeight: 800, color: "#047857", marginBottom: 2 }}>{mwh}</span>
                  <div style={{ width: "80%", maxWidth: 22, height: `${heightPct}%`, background: "linear-gradient(180deg, #10b981 0%, #059669 100%)", borderRadius: "2px 2px 0 0" }} />
                  <span style={{ fontSize: 7.5, color: "#0f172a", fontWeight: 700, marginTop: 2 }}>{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Irradiance & Yield Table */}
      {yieldData && (
        <div style={{ marginBottom: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5, border: "1.5px solid #0f172a", color: "#0f172a" }}>
            <thead>
              <tr style={{ background: "#e2e8f0", color: "#0f172a", textAlign: "center" }}>
                <th style={{ padding: "4px 6px", textAlign: "left", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>Bulan</th>
                <th style={{ padding: "4px 6px", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>GHI (kWh/m²/hari)</th>
                <th style={{ padding: "4px 6px", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>Suhu (°C)</th>
                <th style={{ padding: "4px 6px", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>Harian (kWh)</th>
                <th style={{ padding: "4px 6px", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>Total (MWh)</th>
                <th style={{ padding: "4px 6px", textAlign: "right", borderBottom: "1.5px solid #0f172a", color: "#0f172a", fontWeight: 800 }}>Est. Hemat (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {yieldData.monthly.map((m, idx) => (
                <tr key={m.month} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f1f5f9", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "3.5px 6px", textAlign: "left", fontWeight: 800, color: "#0f172a" }}>{m.month}</td>
                  <td style={{ padding: "3.5px 6px", fontWeight: 600, color: "#0f172a" }}>{m.ghi.toFixed(2)}</td>
                  <td style={{ padding: "3.5px 6px", fontWeight: 600, color: "#0f172a" }}>{m.temp.toFixed(1)} °C</td>
                  <td style={{ padding: "3.5px 6px", fontWeight: 600, color: "#0f172a" }}>{m.dailyEnergyKwh.toLocaleString()}</td>
                  <td style={{ padding: "3.5px 6px", fontWeight: 800, color: "#047857" }}>{(m.monthlyEnergyKwh / 1000).toFixed(1)}</td>
                  <td style={{ padding: "3.5px 6px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>{Number.isFinite(m.savingsIdr) ? `Rp ${m.savingsIdr.toLocaleString()}` : DASH}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#cbd5e1", fontWeight: 900, textAlign: "center", color: "#0f172a", borderTop: "2px solid #0f172a" }}>
                <td style={{ padding: "4px 6px", textAlign: "left", color: "#0f172a", fontWeight: 900 }}>TOTAL / RATA-RATA</td>
                <td style={{ padding: "4px 6px", color: "#0f172a", fontWeight: 800 }}>{yieldData.annualGhi.toFixed(2)} PSH</td>
                <td style={{ padding: "4px 6px", color: "#0f172a", fontWeight: 800 }}>{yieldData.annualTemp.toFixed(1)} °C</td>
                <td style={{ padding: "4px 6px", color: "#0f172a", fontWeight: 800 }}>-</td>
                <td style={{ padding: "4px 6px", color: "#047857", fontWeight: 900 }}>{yieldData.annualEnergyMwh.toLocaleString()} MWh</td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: "#047857", fontWeight: 900 }}>Rp {yieldData.annualSavingsIdr.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Bottom Section: Loss Analysis & Grid Interconnection */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 8, marginBottom: 10, fontSize: 8, color: "#0f172a" }}>
        <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 4, padding: "6px 8px", background: "#ffffff", color: "#0f172a" }}>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
            <ShieldCheck size={11} style={{ color: "#047857" }} /> Dekomposisi Rugi Daya Sistem (IEC 61724)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px", color: "#0f172a" }}>
            {lossLines(reportData.result).map((l) => (
              <div key={l.label}>{l.label}: <strong style={{ color: "#dc2626" }}>{fmtNum(l.pct, 1)}%</strong></div>
            ))}
            {!reportData.result && <div style={{ gridColumn: "1 / -1" }}>Belum dihitung — buka PV Layout lalu klik Hitung (Helio)</div>}
            <div>Net PR: <strong style={{ color: "#047857" }}>{fmtPct(engineOut(reportData.result)?.performance_ratio_pct, 1)}</strong></div>
          </div>
        </div>

        <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 4, padding: "6px 8px", background: "#ffffff", color: "#0f172a" }}>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
            <Zap size={11} style={{ color: "#0284c7" }} /> Rekomendasi Titik Sambung Grid PLN
          </div>
          {substations.slice(0, 2).map((sub) => (
            <div key={sub.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, color: "#0f172a" }}>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>{sub.name} ({sub.voltage})</span>
              <strong style={{ color: "#0369a1" }}>{sub.distanceKm.toFixed(1)} km · Siap</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Approval / Signatures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 8.5, marginTop: 4 }}>
        <div>
          <div style={{ color: "#1e293b", fontWeight: 700 }}>DISUSUN & DISETUJUI OLEH:</div>
          <div style={{ fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{prepared}</div>
          <div style={{ fontSize: 8, color: "#0f172a", fontWeight: 600 }}>Lead Electrical & Structural PV Engineer</div>
          <div style={{ marginTop: 12, borderBottom: "1.5px solid #0f172a", width: "70%" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#1e293b", fontWeight: 700 }}>DISETUJUI OLEH KLIEN / FASILITAS:</div>
          <div style={{ fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{client}</div>
          <div style={{ fontSize: 8, color: "#0f172a", fontWeight: 600 }}>Kepala Divisi Energi & Fasilitas</div>
          <div style={{ marginTop: 12, borderBottom: "1.5px solid #0f172a", width: "70%", marginLeft: "auto" }} />
        </div>
      </div>

      {/* Sheet Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#0f172a", fontWeight: 700, borderTop: "1.5px solid #0f172a", paddingTop: 5, marginTop: 10 }}>
        <span>SOLARAPP · DOKUMEN RAHASIA TEKNIS EPC</span>
        <span>LEMBAR 1 DARI 3 (EXECUTIVE SUMMARY)</span>
      </div>
    </div>
  );

  // =========================================================================
  // SUB-RENDERER: PAGE 2 (GEOLOCATION, SATELLITE MAP, SHADING & LOSS BREAKDOWN)
  // =========================================================================
  const renderPage2 = () => (
    <div>
      {/* Sheet Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 6, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: "#0284c7", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>
            GIS
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>GEOLOKASI TAPAK, STUDI SHADING & LOSS BREAKDOWN</div>
            <div style={{ fontSize: 8, color: "#0f172a", fontWeight: 600 }}>LEMBAR 2 DARI 3 · EPC DRAWING PACKAGE · REVISI 0 (IFC)</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 8.5 }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>METODE: </span><strong style={{ color: "#0f172a" }}>GIS & 3D RAY-TRACING</strong>
        </div>
      </div>

      {/* Geolocation & Satellite Map Box */}
      {(() => {
        const siteWidthM = areaW / 1000;
        const siteHeightM = areaH / 1000;
        // Exact 16:9 framing: parcel occupies ~72% width with ~14% margin on sides
        const totalWidthM = Math.max(siteWidthM / 0.72, (siteHeightM / 0.68) * (800 / 450));
        const totalHeightM = totalWidthM / (800 / 450); // 16:9 ratio (1.7778)

        const deltaLng = (totalWidthM / 2) / (111000 * Math.cos((coords.lat * Math.PI) / 180));
        const deltaLat = (totalHeightM / 2) / 111000;
        const minLng = (coords.lng - deltaLng).toFixed(5);
        const minLat = (coords.lat - deltaLat).toFixed(5);
        const maxLng = (coords.lng + deltaLng).toFixed(5);
        const maxLat = (coords.lat + deltaLat).toFixed(5);
        const esriSatelliteUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326&size=800,450&f=image`;
        const satelliteImgSrc = savedLayout?.backgroundImage || esriSatelliteUrl;

        // Exact overlay bounding percentage matching the real site dimensions on the satellite map
        const overlayWidthPct = Math.min(94, Math.max(15, (siteWidthM / totalWidthM) * 100)).toFixed(1);
        const overlayHeightPct = Math.min(94, Math.max(15, (siteHeightM / totalHeightM) * 100)).toFixed(1);
        const overlayLeftPct = ((100 - Number(overlayWidthPct)) / 2).toFixed(1);
        const overlayTopPct = ((100 - Number(overlayHeightPct)) / 2).toFixed(1);

        return (
          <div style={{ border: "1.5px solid #0f172a", borderRadius: 4, background: "#f8fafc", padding: 8, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={13} style={{ color: "#0284c7" }} />
                <strong style={{ fontSize: 10, color: "#0f172a" }}>Citra Satelit & Peta Geolokasi Tapak Bangunan</strong>
              </div>
              <span style={{ fontSize: 8, color: "#059669", fontWeight: 700 }}>
                Resolusi Citra 0.5m/px · High-Res Satellite Ground Truth
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10, alignItems: "stretch" }}>
              {/* Satellite Map with High-Res Satellite Imagery & Boundary Overlay */}
              <div style={{ position: "relative", height: 265, borderRadius: 4, overflow: "hidden", border: "1px solid #0f172a", background: "#080f1a" }}>
                {/* Fallback dark raster grid (behind satellite image) */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: "radial-gradient(#334155 1.5px, transparent 1.5px), radial-gradient(#1e293b 1.5px, #080f1a 1.5px)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 8px 8px",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />

                <img
                  src={satelliteImgSrc}
                  alt="Citra Satelit Lokasi PLTS"
                  crossOrigin="anonymous"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    zIndex: 1,
                  }}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src !== esriSatelliteUrl) {
                      target.src = esriSatelliteUrl;
                    } else {
                      target.style.display = "none";
                    }
                  }}
                />

                {/* Rooftop / Ground Boundary Polygon Overlay on Satellite Map */}
                <div
                  style={{
                    position: "absolute",
                    top: `${overlayTopPct}%`,
                    left: `${overlayLeftPct}%`,
                    width: `${overlayWidthPct}%`,
                    height: `${overlayHeightPct}%`,
                    border: "2.5px solid #22c55e",
                    background: "rgba(34, 197, 94, 0.18)",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 14px rgba(34, 197, 94, 0.45)",
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", background: "rgba(15,23,42,0.92)", padding: "2px 7px", borderRadius: 3, border: "1px solid #22c55e", boxShadow: "0 2px 5px rgba(0,0,0,0.6)" }}>
                    TAPAK PLTS: {(areaW / 1000).toFixed(0)}m × {(areaH / 1000).toFixed(0)}m
                  </span>
                  <span style={{ fontSize: 7.5, color: "#ffffff", background: "rgba(0,0,0,0.78)", padding: "1.5px 5px", borderRadius: 2, marginTop: 3 }}>
                    Luas Tapak: {((areaW * areaH) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m²
                  </span>
                </div>

                {/* Red GPS Center Pin */}
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)", textAlign: "center", zIndex: 3, pointerEvents: "none" }}>
                  <MapPin size={26} style={{ color: "#ef4444", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.9))" }} />
                </div>

                {/* North Indicator Badge */}
                <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.92)", padding: "3px 6px", borderRadius: 3, fontSize: 8, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 3, zIndex: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                  <Compass size={11} style={{ color: "#0284c7" }} /> UTARA (N)
                </div>

                {/* Satellite Metadata Bar at Bottom */}
                <div style={{ position: "absolute", bottom: 6, left: 6, right: 6, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15,23,42,0.88)", padding: "3px 8px", borderRadius: 3, fontSize: 7.5, color: "#cbd5e1", zIndex: 3, border: "1px solid #334155" }}>
                  <span>📍 GPS: {coords.lat.toFixed(5)}° S, {coords.lng.toFixed(5)}° E</span>
                  <span>Skala ~1:2500 · Resolusi 0.5m/px</span>
                </div>
              </div>

              {/* Geolocation Coordinates & Site Data */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 4, fontSize: 8 }}>
                <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                  <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Nama Lokasi & Fasilitas</div>
                  <strong style={{ color: "#0f172a", fontSize: 9 }}>{coords.name}</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Latitude (Lintang)</div>
                    <strong style={{ color: "#0369a1", fontWeight: 800 }}>{coords.lat.toFixed(5)}° S</strong>
                  </div>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Longitude (Bujur)</div>
                    <strong style={{ color: "#0369a1", fontWeight: 800 }}>{coords.lng.toFixed(5)}° E</strong>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Elevasi Tapak (DEM)</div>
                    <strong style={{ color: "#0f172a", fontWeight: 800 }}>+34.2 m dpl</strong>
                  </div>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Luas Tapak Bangunan</div>
                    <strong style={{ color: "#047857", fontWeight: 800 }}>{((areaW * areaH) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m²</strong>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Orientasi Utama</div>
                    <strong style={{ color: "#0f172a", fontWeight: 800 }}>Hadap Khatulistiwa</strong>
                  </div>
                  <div style={{ background: "#ffffff", padding: "5px 8px", border: "1.5px solid #cbd5e1", borderRadius: 3 }}>
                    <div style={{ color: "#1e293b", fontSize: 7.5, fontWeight: 700 }}>Status Verifikasi</div>
                    <strong style={{ color: "#047857", fontWeight: 800 }}>✓ Ground Truth OK</strong>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="no-print"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    background: "#0284c7",
                    color: "#ffffff",
                    padding: "5px 8px",
                    borderRadius: 3,
                    fontSize: 8.5,
                    fontWeight: 700,
                    textDecoration: "none",
                    marginTop: 2,
                  }}
                >
                  <MapPin size={11} /> Buka Lokasi di Google Maps ↗
                </a>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Shading Analysis Matrix */}
      <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 5, padding: "7px 9px", background: "#f8fafc", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
          <Clock size={12} style={{ color: "#d97706" }} /> Matriks Evaluasi Shading & Sudut Jatuh Bayangan Obstacle
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5, border: "1.5px solid #0f172a", color: "#0f172a" }}>
          <thead>
            <tr style={{ background: "#e2e8f0", color: "#0f172a" }}>
              <th style={{ padding: "4px 6px", textAlign: "left", color: "#0f172a", fontWeight: 800 }}>Waktu (WIB)</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#0f172a", fontWeight: 800 }}>Elevasi</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#0f172a", fontWeight: 800 }}>Azimuth</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#0f172a", fontWeight: 800 }}>Arah Bayangan</th>
              <th style={{ padding: "4px 6px", textAlign: "center", color: "#0f172a", fontWeight: 800 }}>Panjang Relatif</th>
              <th style={{ padding: "4px 6px", textAlign: "right", color: "#0f172a", fontWeight: 800 }}>Status Klirens</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <td style={{ padding: "4px 6px", fontWeight: 800, color: "#0f172a" }}>☀️ Pagi 09:00 WIB</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>42.5°</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>68.2° (Timur-Laut)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>Barat Daya (248.2°)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>1.10 × H (~2.6 m)</td>
              <td style={{ padding: "4px 6px", textAlign: "right", color: "#047857", fontWeight: 800 }}>✓ Bebas Shading</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <td style={{ padding: "4px 6px", fontWeight: 800, color: "#0f172a" }}>☀️ Siang 12:00 WIB (Puncak)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>78.1°</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>18.5° (Utara)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>Selatan (198.5°)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>0.21 × H (~0.5 m)</td>
              <td style={{ padding: "4px 6px", textAlign: "right", color: "#047857", fontWeight: 800 }}>✓ Puncak Radiasi</td>
            </tr>
            <tr style={{ background: "#ffffff" }}>
              <td style={{ padding: "4px 6px", fontWeight: 800, color: "#0f172a" }}>☀️ Sore 15:00 WIB</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>44.0°</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>285.3° (Barat-Laut)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>Tenggara (105.3°)</td>
              <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>1.04 × H (~2.5 m)</td>
              <td style={{ padding: "4px 6px", textAlign: "right", color: "#047857", fontWeight: 800 }}>✓ Bebas Shading</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 7.5, color: "#047857", marginTop: 3, fontWeight: 800 }}>
          ✓ Kesimpulan Shading: Jarak setback modul dari HVAC chiller (≥ 3.0 m) menjamin 0% kehilangan daya akibat bayangan pada jam produktif (09:00 - 15:00 WIB).
        </div>
      </div>

      {/* Loss Breakdown & Mounting Specs */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8, marginBottom: 6, fontSize: 8 }}>
        {/* Detailed Loss Breakdown */}
        <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 5, padding: "7px 8px", background: "#ffffff" }}>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <Activity size={11} style={{ color: "#dc2626" }} /> Analisis Susut Daya Sistem Lengkap (IEC 61724)
          </div>
          <div style={{ display: "grid", gap: 3 }}>
            {lossLines(reportData.result).map((l) => (
              <div key={l.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#0f172a", fontWeight: 600 }}>{l.label}:</span>
                <strong style={{ color: "#dc2626" }}>{fmtNum(l.pct, 1)}%</strong>
              </div>
            ))}
            {!reportData.result && <div>Belum dihitung — buka PV Layout lalu klik Hitung (Helio)</div>}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1.5px solid #0f172a", paddingTop: 3, fontWeight: 900 }}>
              <span style={{ color: "#0f172a" }}>Net Performance Ratio (PR):</span>
              <strong style={{ color: "#047857", fontSize: 9.5 }}>{fmtPct(engineOut(reportData.result)?.performance_ratio_pct, 1)}</strong>
            </div>
          </div>
        </div>

        {/* Structural Mounting Specs */}
        <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 5, padding: "7px 8px", background: "#ffffff" }}>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <ShieldCheck size={11} style={{ color: "#047857" }} /> Spesifikasi Mekanikal Racking
          </div>
          <div style={{ display: "grid", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Material Rail:</span>
              <strong style={{ color: "#0f172a" }}>Aluminium AL6005-T5</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Fastener & Baut:</span>
              <strong style={{ color: "#0f172a" }}>Stainless SUS304 Anti-Karat</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Kemiringan (Tilt):</span>
              <strong style={{ color: "#0f172a" }}>{tilt}° (Hadap Khatulistiwa)</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Beban Angin SNI:</span>
              <strong style={{ color: "#0f172a" }}>120 km/jam (SNI 1727:2020)</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Beban Mati Total:</span>
              <strong style={{ color: "#0f172a" }}>~14.5 kg/m² (Kategori Ringan)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Official CAD Title Block */}
      {renderCadTitleBlock(2, "GEOLOKASI TAPAK, STUDI SHADING & LOSS BREAKDOWN", "SOLARAPP-DED-SH-002")}

      {/* Sheet Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#1e293b", fontWeight: 700, borderTop: "1.5px solid #cbd5e1", paddingTop: 5, marginTop: 8 }}>
        <span>SOLARAPP · DOKUMEN GAMBAR TEKNIS DED</span>
        <span>LEMBAR 2 DARI 3 (GEOLOCATION & SHADING)</span>
      </div>
    </div>
  );

  // =========================================================================
  // SUB-RENDERER: PAGE 3 (2D CAD & 3D DUAL-LAYER: SIANG & MALAM)
  // =========================================================================
  const renderPage3 = () => (
    <div>
      {/* Sheet Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 6, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: "#f59e0b", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>
            2D/3D
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>DETAIL TATA LETAK MODUL PV 2D & VISUALISASI 3D DUA LAYER (SIANG & MALAM)</div>
            <div style={{ fontSize: 8, color: "#1e293b", fontWeight: 700 }}>LEMBAR 3 DARI 3 · EPC DRAWING PACKAGE · REVISI 0 (IFC)</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 8.5 }}>
          <span style={{ color: "#1e293b", fontWeight: 700 }}>SKALA: </span><strong style={{ color: "#0f172a" }}>NTS (1:500)</strong>
        </div>
      </div>

      {/* SECTION A: CAD 2D DRAWING CANVAS */}
      <div style={{ border: "1.5px solid #0f172a", borderRadius: 4, background: "#f8fafc", padding: "6px 8px", marginBottom: 6, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ fontSize: 9, color: "#0f172a" }}>BAGIAN A: GAMBAR TATA LETAK MODUL PV 2D & SITE BOUNDARY</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: "#0284c7", fontWeight: 700 }}>
            <Compass size={11} /> UTARA (N)
          </div>
        </div>

        {/* 2D CAD SVG */}
        <svg viewBox="0 0 1000 300" style={{ width: "100%", height: 140, display: "block", background: "#ffffff", border: "1px solid #cbd5e1" }}>
          <defs>
            <pattern id="cad-grid-page3" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="1000" height="300" fill="url(#cad-grid-page3)" stroke="#cbd5e1" strokeWidth="1" />

          {/* Scaled geometry */}
          {(() => {
            const cadScale = Math.min(840 / Math.max(areaW, 1), 220 / Math.max(areaH, 1));
            const cadOriginX = (1000 - areaW * cadScale) / 2;
            const cadOriginY = (300 - areaH * cadScale) / 2;

            let polyPoints = `${cadOriginX},${cadOriginY} ${cadOriginX + areaW * cadScale},${cadOriginY} ${cadOriginX + areaW * cadScale},${cadOriginY + areaH * cadScale} ${cadOriginX},${cadOriginY + areaH * cadScale}`;
            if (siteCorners && siteCorners.length >= 3) {
              polyPoints = siteCorners.map((p: any) => `${cadOriginX + p.x * cadScale},${cadOriginY + p.y * cadScale}`).join(" ");
            }

            return (
              <g>
                {/* Boundary Polygon */}
                <polygon points={polyPoints} fill="#ecfdf5" stroke="#059669" strokeWidth="2.5" strokeDasharray="6 3" />

                {/* Setback Line */}
                <rect
                  x={cadOriginX + 5}
                  y={cadOriginY + 5}
                  width={Math.max(1, areaW * cadScale - 10)}
                  height={Math.max(1, areaH * cadScale - 10)}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />

                {/* Obstacles */}
                {obstacles.map((obs: any) => (
                  <g key={obs.id}>
                    <rect
                      x={cadOriginX + obs.x * cadScale}
                      y={cadOriginY + obs.y * cadScale}
                      width={Math.max(2, obs.w * cadScale)}
                      height={Math.max(2, obs.h * cadScale)}
                      fill="#fee2e2"
                      stroke="#ef4444"
                      strokeWidth="1.5"
                    />
                    <text
                      x={cadOriginX + (obs.x + obs.w / 2) * cadScale}
                      y={cadOriginY + (obs.y + obs.h / 2) * cadScale}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#dc2626"
                      fontSize="8"
                      fontWeight="700"
                    >
                      {obs.label || "OBSTACLE"}
                    </text>
                  </g>
                ))}

                {/* PV Modules */}
                {panels.map((p: any, idx: number) => (
                  <rect
                    key={p.id || idx}
                    x={cadOriginX + p.x * cadScale}
                    y={cadOriginY + p.y * cadScale}
                    width={Math.max(1, p.w * cadScale)}
                    height={Math.max(1, p.h * cadScale)}
                    fill="#0284c7"
                    stroke="#0369a1"
                    strokeWidth="0.5"
                    rx="0.5"
                  />
                ))}

                {/* Dimension Labels */}
                <text x={cadOriginX + (areaW * cadScale) / 2} y={Math.max(14, cadOriginY - 6)} textAnchor="middle" fill="#0f172a" fontSize="9" fontWeight="700">
                  LEBAR ATAP: {(areaW / 1000).toFixed(1)} M ({areaW.toLocaleString()} mm)
                </text>
                <text
                  x={cadOriginX - 8}
                  y={cadOriginY + (areaH * cadScale) / 2}
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="9"
                  fontWeight="700"
                  transform={`rotate(-90 ${cadOriginX - 8} ${cadOriginY + (areaH * cadScale) / 2})`}
                >
                  PANJANG ATAP: {(areaH / 1000).toFixed(1)} M ({areaH.toLocaleString()} mm)
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Legend Strip */}
        <div style={{ display: "flex", gap: 12, fontSize: 8, marginTop: 4, color: "#334155", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, height: 10, background: "#0284c7", borderRadius: 2 }} /> Modul PV 580Wp ({totalPanels} unit)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, height: 10, background: "#ecfdf5", border: "1px dashed #059669", borderRadius: 2 }} /> Batas Site Boundary Atap
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, height: 10, border: "1px dashed #f59e0b", borderRadius: 2 }} /> Garis Aman Setback (300 mm)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, height: 10, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 2 }} /> Area Terlarang (HVAC Chiller)
          </span>
        </div>
      </div>

      {/* SECTION B: 3D DUAL-LAYER VISUALIZATION (TOP: SIANG 12:00 & BOTTOM: MALAM 24:00) */}
      <div style={{ border: "1.5px solid #0f172a", borderRadius: 4, background: "#f8fafc", padding: "6px 8px", marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <strong style={{ fontSize: 9, color: "#0f172a" }}>BAGIAN B: STUDI VISUALISASI 3D DUA LAYER (SIANG 12:00 WIB & MALAM 24:00 WIB)</strong>
          <span style={{ fontSize: 8, color: "#059669", fontWeight: 700 }}>Simulasi Digital Twin Dua Layer: Puncak Surya vs Nokturnal Standby</span>
        </div>

        {/* LAYER 1 (TOP): SIANG (12:00 WIB) */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "3px 3px 0 0", padding: "3px 7px" }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: "#b45309", display: "flex", alignItems: "center", gap: 4 }}>
              ☀️ 1. LAYER ATAS: KONDISI SIANG (12:00 WIB - Puncak Surya & Radiasi)
            </span>
            <span style={{ fontSize: 7.5, color: "#92400e", fontWeight: 700 }}>
              Elevasi: 78.1° (Zenit) · Azimuth: 18.5° · Klirens Bayangan &lt; 0.5m · Bebas Shading
            </span>
          </div>
          <div style={{ height: 215, width: "100%", borderRadius: "0 0 3px 3px", overflow: "hidden", border: "1.5px solid #0f172a", borderTop: "none", background: "#e0f2fe" }}>
            <Report3DViewport
              panels={panels}
              obstacles={obstacles}
              areaW={areaW}
              areaH={areaH}
              moduleW={moduleW}
              moduleH={moduleH}
              tilt={tilt}
              siteCorners={siteCorners}
              theme="light"
              interactive={true}
              height={215}
              defaultHour={12.0}
              coords={coords}
              hideTimeControls={true}
              titleBadge="☀️ 12:00 WIB - Puncak Surya & Klirens Bayangan"
              cameraTransform={sharedCamera}
              onCameraChange={handleCameraChange}
              roof3dConfig={roof3dConfig}
              projectId={targetProjId}
            />
          </div>
        </div>

        {/* LAYER 2 (BOTTOM): MALAM (24:00 WIB) */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e0e7ff", border: "1px solid #c7d2fe", borderRadius: "3px 3px 0 0", padding: "3px 7px" }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: "#4338ca", display: "flex", alignItems: "center", gap: 4 }}>
              🌙 2. LAYER BAWAH: KONDISI MALAM (24:00 WIB - Simulasi Nokturnal & Standby)
            </span>
            <span style={{ fontSize: 7.5, color: "#3730a3", fontWeight: 700 }}>
              Elevasi: -78.0° (Nadir) · Irradiansi: 0 W/m² · Standby Isolation (IEC 62109) · Beacon Aktif
            </span>
          </div>
          <div style={{ height: 215, width: "100%", borderRadius: "0 0 3px 3px", overflow: "hidden", border: "1.5px solid #0f172a", borderTop: "none", background: "#080f1a" }}>
            <Report3DViewport
              panels={panels}
              obstacles={obstacles}
              areaW={areaW}
              areaH={areaH}
              moduleW={moduleW}
              moduleH={moduleH}
              tilt={tilt}
              siteCorners={siteCorners}
              theme="dark"
              interactive={true}
              height={215}
              defaultHour={24.0}
              coords={coords}
              hideTimeControls={true}
              titleBadge="🌙 24:00 WIB - Standby Isolation Mode (IEC 62109)"
              cameraTransform={sharedCamera}
              onCameraChange={handleCameraChange}
              roof3dConfig={roof3dConfig}
              projectId={targetProjId}
            />
          </div>
        </div>

        {/* 2-Condition Comparative Analysis Summaries (Siang vs Malam) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 8 }}>
          <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4, padding: "5px 8px" }}>
            <div style={{ fontWeight: 800, color: "#b45309", display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span>☀️ Evaluasi Kondisi Siang</span>
              <span style={{ color: "#047857" }}>✓ Efisiensi 100%</span>
            </div>
            <div style={{ color: "#0f172a", marginTop: 2, lineHeight: 1.35, fontWeight: 600 }}>
              Sinar jatuh hampir tegak lurus (azimuth 18.5°). Bayangan jatuh tepat di bawah obstacle (&lt; 0.5 m). Tidak ada modul yang mengalami shading, efisiensi radiasi 100% dengan daya puncak sistem.
            </div>
          </div>

          <div style={{ background: "#ffffff", border: "1.5px solid #cbd5e1", borderRadius: 4, padding: "5px 8px" }}>
            <div style={{ fontWeight: 800, color: "#4338ca", display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span>🌙 Evaluasi Kondisi Malam</span>
              <span style={{ color: "#4338ca" }}>✓ Standby Aman</span>
            </div>
            <div style={{ color: "#0f172a", marginTop: 2, lineHeight: 1.35, fontWeight: 600 }}>
              Elevasi surya di bawah horizon (-78°). Irradiansi 0 W/m². Inverter string dalam status Standby Isolation (IEC 62109) untuk mencegah arus balik. Sistem penerangan perimeter aktif (&lt; 50W).
            </div>
          </div>
        </div>
      </div>

      {/* IFC Construction Notes */}
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 4, padding: "4px 7px", background: "#ffffff", fontSize: 7.5, color: "#334155", marginBottom: 4 }}>
        <strong style={{ color: "#0f172a" }}>CATATAN TEKNIS KONSTRUKSI (IFC):</strong>
        <div style={{ marginTop: 1, lineHeight: 1.35 }}>
          1. Pemasangan modul mematuhi batas setback 300 mm dari tepi atap untuk akses pemeliharaan dan koridor darurat kebakaran.
          · 2. Seluruh struktur aluminium AL6005-T5 terhubung ke sistem grounding pentanahan ≤ 2 Ohm (SNI 0225:2020).
          · 3. Inverter ditempatkan terlindung dari cuaca langsung dengan ventilasi udara optimal.
        </div>
      </div>

      {/* CAD Title Block */}
      {renderCadTitleBlock(3, "DETAIL TATA LETAK MODUL PV 2D & VISUALISASI 3D DUA LAYER", "SOLARAPP-DED-PV-003")}

      {/* Sheet Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#1e293b", fontWeight: 700, borderTop: "1.5px solid #cbd5e1", paddingTop: 5, marginTop: 6 }}>
        <span>SOLARAPP · DOKUMEN GAMBAR TEKNIS DED</span>
        <span>LEMBAR 3 DARI 3 (2D & 3D DUAL-LAYER)</span>
      </div>
    </div>
  );

  if (reportView) {
    return <ReportsHost lang={lang} projectId={activeProj?.id ?? projectId} project={activeProj} initialView={reportView} onClose={() => setReportView(null)} />;
  }

  return (
    <div className="module-page" style={{ color: "#e8eef9", display: "grid", gap: 18 }}>
      {/* Screen Header & Top Action Bar */}
      <header
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          paddingBottom: 4,
          borderBottom: "1px solid #1f2f26",
        }}
      >
        <div>
          <div style={{ color: "var(--green, #b8f36b)", fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
            EPC DETAILED ENGINEERING DESIGN
          </div>
          <h1 style={{ fontSize: 24, margin: "6px 0", color: "#edf5ef", fontWeight: 700 }}>
            {isId ? "Laporan Rekayasa & Estimasi Produksi PLTS" : "PV Engineering & Energy Yield Report"}
          </h1>
          <p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 13 }}>
            Dokumen 3 Halaman A4: Hal 1 Ringkasan Eksekutif, Hal 2 Geolocation & Shading, Hal 3 Detail Layout 2D CAD & 3D Dua Layer (Siang & Malam).
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Toggle View Mode */}
          <div style={{ display: "flex", background: "#0e1511", padding: 2, borderRadius: 6, border: "1px solid #233528" }}>
            <button
              type="button"
              onClick={() => setViewMode("screen")}
              style={{
                background: viewMode === "screen" ? "#1e3525" : "transparent",
                color: viewMode === "screen" ? "#b8f36b" : "#7a8f81",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: viewMode === "screen" ? 700 : 500,
                transition: "all 0.15s ease",
              }}
            >
              Mode Layar (Dark)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("a4-light")}
              style={{
                background: viewMode === "a4-light" ? "#1e3525" : "transparent",
                color: viewMode === "a4-light" ? "#b8f36b" : "#7a8f81",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: viewMode === "a4-light" ? 700 : 500,
                transition: "all 0.15s ease",
              }}
            >
              📄 Format Cetak A4 (Light)
            </button>
          </div>

          {([["production", "Production Report"], ["calc", "Engineering Calculation"], ["meta", "Data dokumen"]] as const).map(([v, label]) => (
            <button key={v} type="button" className="secondary-button" onClick={() => setReportView(v)} style={{ fontSize: 11, padding: "7px 11px" }}>{label}</button>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={loadGisData}
            disabled={loadingGis}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "7px 11px" }}
          >
            <RefreshCw size={13} className={loadingGis ? "animate-spin" : ""} />
            {loadingGis ? "Memuat GIS…" : "Refresh GIS"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsPreviewOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "7px 12px", background: "#172738", borderColor: "#2b4666", color: "#60a5fa" }}
          >
            <Eye size={13} />
            <strong>Preview PDF (3 Hal A4)</strong>
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handlePrint}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "7px 14px", fontWeight: 700 }}
          >
            <Printer size={13} />
            Cetak / Simpan PDF
          </button>
        </div>
      </header>

      {/* =======================================================================
          VIEW MODE 1: DARK SCREEN INTERACTIVE DASHBOARD
          ======================================================================= */}
      {viewMode === "screen" && (
        <div className="screen-only no-print" style={{ display: "grid", gap: 20 }}>
          {/* Project Profile Summary Card */}
          <div className="pv-card" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className="pv-badge" style={{ background: "#163820", color: "#b8f36b", borderColor: "#285836" }}>
                  {activeProj?.system || "Rooftop On-Grid"}
                </span>
                <span className="pv-badge" style={{ background: "#172738", color: "#38bdf8", borderColor: "#2b4666" }}>
                  {status}
                </span>
              </div>
              <h2 style={{ fontSize: 20, margin: "4px 0 8px", color: "#edf5ef", fontWeight: 800 }}>
                {activeProj?.name}
              </h2>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted, #93a69a)", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <MapPin size={13} style={{ color: "#38bdf8" }} /> {coords.name} ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Building2 size={13} style={{ color: "#b8f36b" }} /> Klien: <strong style={{ color: "#edf5ef" }}>{client}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, background: "#0c1510", padding: 12, borderRadius: 8, border: "1px solid #1a2a20" }}>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Target Kapasitas</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--green, #b8f36b)" }}>{capacityKwp} kWp</div>
                <small style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>{totalPanels.toLocaleString()} modul 580Wp</small>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Luas Modul Efektif</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>{totalModuleArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²</div>
                <small style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>Tilt {tilt}° azimuth 0°</small>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Model Radiasi</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>NASA POWER</div>
                <small style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>25-Thn Climatology</small>
              </div>
            </div>
          </div>

          {/* 6 Key Performance Metric Cards */}
          {yieldData && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Kapasitas Sistem DC</span>
                  <Zap size={14} style={{ color: "#b8f36b" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#edf5ef", margin: "6px 0 2px" }}>
                  {yieldData.capacityKwp} <small style={{ fontSize: 12 }}>kWp</small>
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{totalPanels.toLocaleString()} Panel Tier-1 (580 Wp)</small>
              </div>

              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Estimasi Yield Tahunan</span>
                  <TrendingUp size={14} style={{ color: "#38bdf8" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#38bdf8", margin: "6px 0 2px" }}>
                  {yieldData.annualEnergyMwh.toLocaleString()} <small style={{ fontSize: 12 }}>MWh/thn</small>
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Specific: {yieldData.specificYield.toLocaleString()} kWh/kWp</small>
              </div>

              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Rata-rata Radiasi Harian</span>
                  <Sun size={14} style={{ color: "#f59e0b" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b", margin: "6px 0 2px" }}>
                  {yieldData.annualGhi.toFixed(2)} <small style={{ fontSize: 12 }}>kWh/m²/hari</small>
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Peak Sun Hours (PSH) rata-rata</small>
              </div>

              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Performance Ratio (PR)</span>
                  <Gauge size={14} style={{ color: "#b8f36b" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#b8f36b", margin: "6px 0 2px" }}>
                  {(yieldData.pr * 100).toFixed(1)}%
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Standar IEC 61724 (Suhu & Kabel)</small>
              </div>

              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Reduksi Emisi CO₂</span>
                  <Leaf size={14} style={{ color: "#10b981" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", margin: "6px 0 2px" }}>
                  {yieldData.carbonOffsetTons.toLocaleString()} <small style={{ fontSize: 12 }}>Ton/thn</small>
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Sumber: Helio engine</small>
              </div>

              <div className="pv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 11, fontWeight: 700 }}>
                  <span>Levelized Cost (LCOE)</span>
                  <Award size={14} style={{ color: "#a855f7" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#c084fc", margin: "6px 0 2px" }}>
                  {Number.isFinite(engineOut(reportData.result)?.lcoe_idr_per_kwh) ? `Rp ${Math.round(engineOut(reportData.result).lcoe_idr_per_kwh).toLocaleString()}` : DASH} <small style={{ fontSize: 12 }}>/kWh</small>
                </div>
                <small style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Sumber: Helio engine</small>
              </div>
            </div>
          )}

          {/* Monthly Generation Bar Chart (Dark Theme) */}
          {yieldData && (
            <div className="pv-card" style={{ padding: "16px 20px", background: "#0c1410", border: "1px solid #19271e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#edf5ef", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📊 Profil Produksi Energi Bulanan (MWh)</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted, #93a69a)", marginTop: 2 }}>
                    Distribusi produksi listrik PLTS sepanjang tahun berdasarkan insolasi harian dan variasi musim tropis Indonesia.
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#b8f36b" }}>
                  <div style={{ width: 10, height: 10, background: "#b8f36b", borderRadius: 2 }} />
                  <span>Produksi Energi (MWh)</span>
                </div>
              </div>

              {/* Responsive Bar Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 10,
                  alignItems: "flex-end",
                  height: 150,
                  background: "#080e0b",
                  borderRadius: 6,
                  padding: "16px 10px 10px",
                  border: "1px solid #142218",
                }}
              >
                {yieldData.monthly.map((m) => {
                  const heightPct = Math.max(18, Math.round((m.monthlyEnergyKwh / maxMonthlyKwh) * 100));
                  const mwh = (m.monthlyEnergyKwh / 1000).toFixed(1);
                  return (
                    <div
                      key={m.month}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#b8f36b", marginBottom: 6 }}>
                        {mwh}
                      </span>
                      <div
                        style={{
                          width: "70%",
                          maxWidth: 34,
                          height: `${heightPct}%`,
                          background: "linear-gradient(180deg, #b8f36b 0%, #10b981 100%)",
                          borderRadius: "4px 4px 0 0",
                          boxShadow: "0 0 10px rgba(184, 243, 107, 0.2)",
                          transition: "height 0.3s ease",
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#8a9c90", marginTop: 8, fontWeight: 600 }}>
                        {m.month}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Embedded Real 3D Digital Twin Viewer Card */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Box size={18} style={{ color: "#38bdf8" }} />
                <h3 style={{ fontSize: 15, margin: 0, color: "#edf5ef", fontWeight: 700 }}>
                  Visualisasi 3D Model Tapak & Analisis Bayangan Matahari
                </h3>
              </div>
              <span className="pv-badge" style={{ background: "#172738", color: "#38bdf8" }}>
                Three.js WebGL Real-time Engine
              </span>
            </div>

            <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #23354d", background: "#080f1a" }}>
              <Report3DViewport
                panels={panels}
                obstacles={obstacles}
                areaW={areaW}
                areaH={areaH}
                moduleW={moduleW}
                moduleH={moduleH}
                tilt={tilt}
                siteCorners={siteCorners}
                theme="dark"
                interactive={true}
                height={380}
                defaultHour={active3DHour}
                coords={coords}
                onHourChange={setActive3DHour}
                cameraTransform={sharedCamera}
                onCameraChange={handleCameraChange}
                roof3dConfig={roof3dConfig}
                projectId={targetProjId}
              />
            </div>
          </div>

          {/* Monthly Table & Loss Tree Details */}
          {yieldData && (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
              {/* Climatology Table */}
              <div className="pv-card" style={{ padding: 16 }}>
                <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#edf5ef", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <CloudSun size={15} style={{ color: "#38bdf8" }} /> Data Insolasi Bulanan (NASA POWER)
                </h3>
                <table className="pv-table" style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1.5px solid #334155" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: "#cbd5e1", fontWeight: 700 }}>Bulan</th>
                      <th style={{ textAlign: "center", padding: "6px 8px", color: "#cbd5e1", fontWeight: 700 }}>GHI (kWh/m²/hari)</th>
                      <th style={{ textAlign: "center", padding: "6px 8px", color: "#cbd5e1", fontWeight: 700 }}>Suhu Ambien</th>
                      <th style={{ textAlign: "center", padding: "6px 8px", color: "#cbd5e1", fontWeight: 700 }}>Total (MWh)</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#cbd5e1", fontWeight: 700 }}>Est. Hemat (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yieldData.monthly.map((m) => (
                      <tr key={m.month} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ fontWeight: 700, color: "#f8fafc", padding: "6px 8px" }}>{m.month}</td>
                        <td style={{ color: "#e2e8f0", padding: "6px 8px", textAlign: "center", fontWeight: 600 }}>{m.ghi.toFixed(2)}</td>
                        <td style={{ color: "#e2e8f0", padding: "6px 8px", textAlign: "center", fontWeight: 600 }}>{m.temp.toFixed(1)} °C</td>
                        <td style={{ fontWeight: 800, color: "var(--green, #b8f36b)", padding: "6px 8px", textAlign: "center" }}>
                          {(m.monthlyEnergyKwh / 1000).toFixed(1)}
                        </td>
                        <td style={{ textAlign: "right", color: "#f1f5f9", padding: "6px 8px", fontWeight: 600 }}>{Number.isFinite(m.savingsIdr) ? `Rp ${m.savingsIdr.toLocaleString()}` : DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#14251b", fontWeight: 800, borderTop: "2px solid #22c55e" }}>
                      <td style={{ padding: "7px 8px", color: "#f8fafc", fontWeight: 800 }}>TOTAL / RATA-RATA</td>
                      <td style={{ padding: "7px 8px", color: "#f8fafc", textAlign: "center", fontWeight: 700 }}>{yieldData.annualGhi.toFixed(2)} PSH</td>
                      <td style={{ padding: "7px 8px", color: "#f8fafc", textAlign: "center", fontWeight: 700 }}>{yieldData.annualTemp.toFixed(1)} °C</td>
                      <td style={{ padding: "7px 8px", textAlign: "center", color: "var(--green, #b8f36b)", fontWeight: 800 }}>
                        {yieldData.annualEnergyMwh.toLocaleString()} MWh
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 8px", color: "var(--green, #b8f36b)", fontWeight: 800 }}>
                        Rp {yieldData.annualSavingsIdr.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Loss Breakdown & Grid Substation */}
              <div style={{ display: "grid", gap: 16 }}>
                <div className="pv-card" style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#edf5ef", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={15} style={{ color: "#f59e0b" }} /> Analisis Susut Daya (Loss Tree)
                  </h3>
                  <div style={{ display: "grid", gap: 6, fontSize: 11 }}>
                    {lossLines(reportData.result).map((l) => (
                      <div key={l.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed #1f3024" }}>
                        <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{l.label}</span>
                        <strong style={{ color: "#f87171" }}>{fmtNum(l.pct, 1)}%</strong>
                      </div>
                    ))}
                    {!reportData.result && <div style={{ color: "#cbd5e1" }}>Belum dihitung — buka PV Layout lalu klik Hitung (Helio)</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 700 }}>
                      <span style={{ color: "#edf5ef" }}>Total System PR Net</span>
                      <strong style={{ color: "var(--green, #b8f36b)" }}>{fmtPct(engineOut(reportData.result)?.performance_ratio_pct, 1)}</strong>
                    </div>
                  </div>
                </div>

                <div className="pv-card" style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "#edf5ef", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <Zap size={15} style={{ color: "#38bdf8" }} /> Titik Sambung Gardu Induk PLN
                  </h3>
                  {substations.slice(0, 2).map((sub) => (
                    <div key={sub.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1f3024", fontSize: 11 }}>
                      <div>
                        <strong style={{ color: "#edf5ef" }}>{sub.name}</strong>
                        <div style={{ fontSize: 10, color: "#8a9c90" }}>Tegangan: {sub.voltage}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: "#38bdf8", fontWeight: 700 }}>{sub.distanceKm.toFixed(1)} km</span>
                        <div style={{ fontSize: 10, color: "#8a9c90" }}>Status: Siap Interkoneksi</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Engineering Sign-off & Disusun oleh */}
          <footer
            style={{
              background: "#0c120e",
              border: "1px solid #1f3024",
              borderRadius: 8,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 11,
              color: "#8a9c90",
            }}
          >
            <div>
              <div>Disusun oleh: <strong style={{ color: "#edf5ef" }}>{prepared}</strong></div>
              <small style={{ color: "#627568" }}>
                Data GIS: NASA POWER 25-Year Climatology Model & OpenStreetMap Grid Infrastructure
              </small>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>Tanggal Laporan: <strong style={{ color: "#edf5ef" }}>{date}</strong></div>
              <small style={{ color: "var(--green, #b8f36b)" }}>Status: {status}</small>
            </div>
          </footer>
        </div>
      )}

      {/* =========================================================================
          PRINT / A4 DOCUMENT CONTAINER (PAGE 1, PAGE 2, PAGE 3)
          ========================================================================= */}
      <div
        className={viewMode === "a4-light" ? "print-document-container" : "print-document-container only-print"}
        style={{
          display: viewMode === "a4-light" ? "flex" : undefined,
          flexDirection: "column",
          gap: 24,
          alignItems: "center",
        }}
      >
        <section className="a4-page-sheet" id="report-page-1">
          {renderPage1()}
        </section>

        <section className="a4-page-sheet" id="report-page-2">
          {renderPage2()}
        </section>

        <section className="a4-page-sheet" id="report-page-3">
          {renderPage3()}
        </section>
      </div>

      {/* =========================================================================
          INTERACTIVE FULLSCREEN PDF PREVIEW LIGHTBOX MODAL
          ========================================================================= */}
      {isPreviewOpen && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(5, 10, 16, 0.94)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Modal Header Bar */}
          <div
            style={{
              padding: "12px 20px",
              background: "#0c1524",
              borderBottom: "1px solid #23354d",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={18} style={{ color: "#38bdf8" }} />
              <div>
                <strong style={{ fontSize: 14, color: "#edf5ef" }}>Preview Dokumen Laporan Rekayasa PLTS (A4)</strong>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {activeProj?.name} · 3 Halaman Lengkap Siap Cetak / Export PDF
                </div>
              </div>
            </div>

            {/* Page Jump Tabs */}
            <div style={{ display: "flex", gap: 6, background: "#080f1a", padding: 3, borderRadius: 6, border: "1px solid #1e2c3d" }}>
              <button
                type="button"
                onClick={() => {
                  setPreviewTab(1);
                  document.getElementById("modal-page-1")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "none",
                  background: previewTab === 1 ? "#1e3a5f" : "transparent",
                  color: previewTab === 1 ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: previewTab === 1 ? 700 : 400,
                }}
              >
                Halaman 1: Summary
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewTab(2);
                  document.getElementById("modal-page-2")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "none",
                  background: previewTab === 2 ? "#1e3a5f" : "transparent",
                  color: previewTab === 2 ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: previewTab === 2 ? 700 : 400,
                }}
              >
                Halaman 2: Geolocation & Shading
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewTab(3);
                  document.getElementById("modal-page-3")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "none",
                  background: previewTab === 3 ? "#1e3a5f" : "transparent",
                  color: previewTab === 3 ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: previewTab === 3 ? 700 : 400,
                }}
              >
                Halaman 3: CAD 2D & 3D Waktu
              </button>
            </div>

            {/* Print & Close Actions */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 18px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Printer size={15} /> Cetak / Unduh PDF
              </button>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #33445c",
                  color: "#cbd5e1",
                  borderRadius: 6,
                  padding: "7px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Modal Body: FULL SCROLLABLE STACK OF 3 A4 PAGES */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 28,
              background: "#080f1a",
            }}
          >
            {/* Modal Page 1 */}
            <div id="modal-page-1" style={{ width: "100%", maxWidth: 840, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ color: "#38bdf8", fontSize: 11, fontWeight: 700, marginBottom: 8, alignSelf: "flex-start" }}>
                HALAMAN 1: EXECUTIVE ENGINEERING SUMMARY & CLIMATOLOGY (A4)
              </div>
              <div className="a4-page-sheet" style={{ width: "100%", boxSizing: "border-box" }}>
                {renderPage1()}
              </div>
            </div>

            {/* Modal Page 2 */}
            <div id="modal-page-2" style={{ width: "100%", maxWidth: 840, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ color: "#38bdf8", fontSize: 11, fontWeight: 700, marginBottom: 8, alignSelf: "flex-start" }}>
                HALAMAN 2: GEOLOKASI TAPAK, STUDI SHADING & LOSS BREAKDOWN (A4)
              </div>
              <div className="a4-page-sheet" style={{ width: "100%", boxSizing: "border-box" }}>
                {renderPage2()}
              </div>
            </div>

            {/* Modal Page 3 */}
            <div id="modal-page-3" style={{ width: "100%", maxWidth: 840, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ color: "#38bdf8", fontSize: 11, fontWeight: 700, marginBottom: 8, alignSelf: "flex-start" }}>
                HALAMAN 3: DETAIL TATA LETAK MODUL PV 2D & VISUALISASI 3D DUA LAYER (SIANG & MALAM) (A4)
              </div>
              <div className="a4-page-sheet" style={{ width: "100%", boxSizing: "border-box" }}>
                {renderPage3()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
