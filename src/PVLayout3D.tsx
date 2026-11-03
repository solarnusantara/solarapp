import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RotateCcw, RefreshCw } from "lucide-react";

type Panel = { id: number; x: number; y: number; w: number; h: number };
type Obstacle = { id: number; x: number; y: number; w: number; h: number; label?: string };
type SavedLayout = {
  settings?: { system?: string; areaWidth?: number; areaHeight?: number; moduleWidth?: number; moduleHeight?: number; tilt?: number; orientation?: string; watts?: number };
  panels?: Panel[];
  obstacles?: Obstacle[];
};
const STORAGE_KEY = "solar-apps-pv-layout-v1";

export default function PVLayout3D({ lang = "en", userId = "anonymous", projectId = null, projectName = null }: { lang?: "en" | "id"; userId?: string; projectId?: string | null; projectName?: string | null }) {
  const scopedStorageKey = `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}");
      const value = Number(saved?.settings?.tilt);
      return Number.isFinite(value) ? Math.max(0, Math.min(60, value)) : 10;
    } catch {
      return 10;
    }
  });
  const [system, setSystem] = useState<"Rooftop" | "Ground-mounted">("Rooftop");
  const [surfaceMode, setSurfaceMode] = useState<"auto" | "flat" | "terrain" | "roof-flat" | "roof-single" | "roof-gable">("auto");
  const [surfaceSlope, setSurfaceSlope] = useState(5);
  const [panelCount, setPanelCount] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [notice, setNotice] = useState("");
  const id = lang === "id";

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === scopedStorageKey || event.key === null) {
        // Keep the viewer's visual tilt aligned with the latest 2D engineering settings.
        try {
          const saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}");
          const value = Number(saved?.settings?.tilt);
          if (Number.isFinite(value)) setTilt(Math.max(0, Math.min(60, value)));
        } catch { /* ignore invalid draft */ }
        setNotice(v => String(Number(v || 0) + 1));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [scopedStorageKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let saved: SavedLayout = {};
    try { saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}"); } catch { saved = {}; }
    const settings = saved.settings ?? {};
    const panels = Array.isArray(saved.panels) ? saved.panels : [];
    const obstacles = Array.isArray(saved.obstacles) ? saved.obstacles : [];
    const areaW = Math.max(1000, Number(settings.areaWidth) || 12000) / 1000;
    const areaH = Math.max(1000, Number(settings.areaHeight) || 8000) / 1000;
    const startTilt = Math.max(0, Math.min(60, Number(tilt)));
    setSystem(settings.system === "Ground-mounted" ? "Ground-mounted" : "Rooftop");
    const mode = surfaceMode === "auto" ? (settings.system === "Ground-mounted" ? "terrain" : "roof-flat") : surfaceMode;
    setPanelCount(panels.length);
    setCapacity(panels.length * (Number(settings.watts) || 580) / 1000);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1220");
    scene.fog = new THREE.Fog("#0b1220", 30, 100);
    const camera = new THREE.PerspectiveCamera(45, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), 0.1, 500);
    camera.position.set(areaW * 0.9 + 7, Math.max(areaW, areaH) * 0.9 + 7, areaH * 1.25 + 7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdceaff, 0x334155, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 3.0);
    sun.position.set(areaW, 20, areaH * 0.6); sun.castShadow = true; scene.add(sun);

    const centerX = areaW / 2, centerZ = areaH / 2;
    const slope = Math.max(0, Math.min(30, Number(surfaceSlope) || 0)) / 100;
    const roofPitch = Math.max(0, Math.min(45, Number(settings.tilt) || 10)) * Math.PI / 180;
    const baseRoofY = 2.8;
    const surfaceY = (x: number, z: number) => {
      if (mode === "terrain") return x * slope;
      if (mode === "roof-single") return baseRoofY - z * Math.tan(roofPitch);
      if (mode === "roof-gable") return baseRoofY + centerX * Math.tan(roofPitch) - Math.abs(x) * Math.tan(roofPitch);
      if (mode === "roof-flat") return baseRoofY;
      return 0;
    };
    if (mode === "roof-flat" || mode === "roof-single" || mode === "roof-gable") {
      const building = new THREE.Mesh(new THREE.BoxGeometry(areaW, baseRoofY, areaH), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 }));
      building.position.set(0, baseRoofY / 2, 0); building.receiveShadow = true; scene.add(building);
    }
    const surfaceGeometry = new THREE.PlaneGeometry(areaW, areaH, 32, 32);
    surfaceGeometry.rotateX(-Math.PI / 2);
    const positions = surfaceGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, surfaceY(x, z) + 0.015);
    }
    positions.needsUpdate = true; surfaceGeometry.computeVertexNormals();
    const surfaceMesh = new THREE.Mesh(surfaceGeometry, new THREE.MeshStandardMaterial({ color: mode === "terrain" ? 0x47734d : 0x94a3b8, roughness: 0.94, side: THREE.DoubleSide }));
    surfaceMesh.receiveShadow = true; scene.add(surfaceMesh);
    const grid = new THREE.GridHelper(Math.max(areaW, areaH), Math.max(10, Math.round(Math.max(areaW, areaH))), 0x334155, 0x1e293b);
    grid.position.y = mode === "terrain" ? -centerX * slope : mode.startsWith("roof-") ? baseRoofY + 0.04 : 0.02; scene.add(grid);
    const outlinePoints = [new THREE.Vector3(-centerX, surfaceY(-centerX,-centerZ)+0.03, -centerZ), new THREE.Vector3(centerX, surfaceY(centerX,-centerZ)+0.03, -centerZ), new THREE.Vector3(centerX, surfaceY(centerX,centerZ)+0.03, centerZ), new THREE.Vector3(-centerX, surfaceY(-centerX,centerZ)+0.03, centerZ), new THREE.Vector3(-centerX, surfaceY(-centerX,-centerZ)+0.03, -centerZ)];
    const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0x22d3ee })); scene.add(boundary);

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1679bd, metalness: 0.32, roughness: 0.38, side: THREE.DoubleSide });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.7, roughness: 0.32 });
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.55, roughness: 0.4 });
    const tiltRad = startTilt * Math.PI / 180;
    panels.forEach((p) => {
      const w = Math.max(0.1, (Number(p.w) || Number(settings.moduleWidth) || 2278) / 1000);
      const h = Math.max(0.1, (Number(p.h) || Number(settings.moduleHeight) || 1134) / 1000);
      const x = (Number(p.x) || 0) / 1000 - centerX + w / 2;
      const z = (Number(p.y) || 0) / 1000 - centerZ + h / 2;
      const panelBase = mode.startsWith("roof-") ? surfaceY(x, z) + 0.12 : surfaceY(x, z) + (settings.system === "Ground-mounted" ? 1.1 : 0.35);
      const group = new THREE.Group(); group.position.set(x, panelBase, z);
      if (mode === "terrain") group.rotation.z = Math.atan(slope);
      else if (mode === "roof-single") group.rotation.x = -roofPitch;
      else if (mode === "roof-gable") group.rotation.z = x < 0 ? roofPitch : -roofPitch;
      else group.rotation.x = -tiltRad;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, h), panelMat); panel.castShadow = true; panel.receiveShadow = true; group.add(panel);
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.035, 0.045), frameMat); rail1.position.set(0, -0.045, -h * 0.32); group.add(rail1);
      const rail2 = rail1.clone(); rail2.position.z = h * 0.32; group.add(rail2);
      const supportHeight = settings.system === "Ground-mounted" ? 1.05 : 0.35;
      for (const sx of [-w * 0.35, w * 0.35]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, supportHeight, 0.055), supportMat);
        leg.position.set(sx, -supportHeight / 2 - 0.06, 0); group.add(leg);
      }
      scene.add(group);
    });
    obstacles.forEach((o) => {
      const w = Math.max(0.1, (Number(o.w) || 1000) / 1000), h = Math.max(0.1, (Number(o.h) || 1000) / 1000);
      const x = (Number(o.x) || 0) / 1000 - centerX + w / 2, z = (Number(o.y) || 0) / 1000 - centerZ + h / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, h), new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.82 }));
      mesh.position.set(x, surfaceY(x, z) + 0.38, z); mesh.castShadow = true; scene.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xfca5a5 })); edges.position.copy(mesh.position); scene.add(edges);
    });
    if (!panels.length) {
      const label = document.createElement("div"); label.textContent = id ? "Belum ada panel tersimpan — buat layout di PV Layout 2D lalu klik Muat Ulang." : "No saved panels — create a layout in PV Layout 2D, then click Reload.";
      label.style.cssText = "position:absolute;left:16px;bottom:16px;padding:10px 12px;background:#111827dd;color:#e5e7eb;border:1px solid #334155;border-radius:8px;font:12px system-ui;pointer-events:none"; host.appendChild(label);
    }
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI * 0.49;
    const resize = () => { if (!host) return; camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    let frame = 0; const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.LineSegments) { o.geometry.dispose(); const m = o.material; if (Array.isArray(m)) m.forEach(v => v.dispose()); else m.dispose(); } }); host.removeChild(renderer.domElement); while (host.firstChild) host.removeChild(host.firstChild); };
  }, [id, notice, tilt, surfaceMode, surfaceSlope, userId, projectId]);

  return <section style={{ color: "#e5edf8", display: "grid", gap: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div><div style={{ color: "#38bdf8", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>ENGINEERING VIEWER</div><h1 style={{ margin: "5px 0", fontSize: 25 }}>{id ? "PV Layout 3D" : "PV Layout 3D"}</h1>{projectName && <div style={{ color: "#94a3b8", fontSize: 12 }}>Project aktif: <strong style={{ color: "#e5edf8" }}>{projectName}</strong></div>}<p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>{id ? "Visualisasi 3D konseptual dengan pilihan tanah miring dan geometri atap." : "Conceptual 3D preview with sloped terrain and roof geometry options."}</p></div>
      <button onClick={() => setNotice(v => String(Number(v || 0) + 1))} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#123047", color: "#bae6fd", border: "1px solid #25617a", borderRadius: 9, padding: "10px 13px", cursor: "pointer" }}><RefreshCw size={16} />{id ? "Muat Ulang Layout" : "Reload Layout"}</button>
    </div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 125 }}><div style={{ color: "#94a3b8", fontSize: 11 }}>{id ? "MODUL" : "MODULES"}</div><strong style={{ fontSize: 22 }}>{panelCount}</strong></div>
      <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 125 }}><div style={{ color: "#94a3b8", fontSize: 11 }}>{id ? "KAPASITAS DC EST." : "EST. DC CAPACITY"}</div><strong style={{ fontSize: 22 }}>{capacity.toFixed(2)} kWp</strong></div>
      <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 145 }}><div style={{ color: "#94a3b8", fontSize: 11 }}>{id ? "SISTEM" : "SYSTEM"}</div><strong style={{ fontSize: 16 }}>{system}</strong></div>
      <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 220 }}>
        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>{id ? "PERMUKAAN 3D" : "3D SURFACE"}</div>
        <select aria-label="3D surface mode" value={surfaceMode} onChange={e => setSurfaceMode(e.target.value as typeof surfaceMode)} style={{ width: "100%", background: "#0b1220", color: "#e5edf8", border: "1px solid #334155", borderRadius: 7, padding: "7px" }}>
          <option value="auto">{id ? "Otomatis dari sistem" : "Auto from system"}</option>
          <option value="flat">{id ? "Bidang datar" : "Flat plane"}</option>
          <option value="terrain">{id ? "Tanah miring" : "Sloped terrain"}</option>
          <option value="roof-flat">{id ? "Atap datar" : "Flat roof"}</option>
          <option value="roof-single">{id ? "Atap miring satu sisi" : "Single-slope roof"}</option>
          <option value="roof-gable">{id ? "Atap pelana" : "Gable roof"}</option>
        </select>
        <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 8 }}>{id ? "Kemiringan tanah (%)" : "Terrain slope (%)"}</div>
        <input aria-label="Terrain slope percent" type="number" min="0" max="30" value={surfaceSlope} onChange={e => setSurfaceSlope(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#0b1220", color: "#e5edf8", border: "1px solid #334155", borderRadius: 7, padding: "7px" }} />
      </div>
      <div style={{ background: "#111c2d", border: "1px solid #26354a", borderRadius: 10, padding: "12px 16px", minWidth: 180 }}><div style={{ color: "#94a3b8", fontSize: 11 }}>{id ? "KEMIRINGAN VISUAL" : "VISUAL TILT"}</div><input aria-label="Tilt angle" type="range" min="0" max="60" value={tilt} onChange={e => setTilt(Number(e.target.value))} style={{ width: 150, display: "block", marginTop: 5 }} /><strong>{tilt}°</strong><div style={{ color: "#64748b", fontSize: 10 }}>{id ? "Kontrol tampilan; belum mengubah data engineering." : "Viewer-only control; does not update engineering data."}</div></div>
    </div>
    <div style={{ position: "relative", height: "min(66vh, 650px)", minHeight: 360, overflow: "hidden", border: "1px solid #26354a", borderRadius: 14, background: "#0b1220" }} ref={hostRef} />
    <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontSize: 12 }}><RotateCcw size={14} />{id ? "Seret untuk memutar kamera · scroll untuk zoom · klik Muat Ulang setelah mengubah layout 2D." : "Drag to orbit · scroll to zoom · click Reload after changing the 2D layout."}</div>
    <p style={{ color: "#fbbf24", fontSize: 12, margin: 0 }}>{id ? "Catatan: model 3D ini adalah visualisasi konseptual, bukan model struktur tervalidasi atau simulasi bayangan." : "Note: this is a conceptual 3D visualization, not a validated structural model or shading simulation."}</p>
  </section>;
}
