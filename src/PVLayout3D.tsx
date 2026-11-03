import { getProjectDefaultLayout } from "./defaultProjectsData";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RotateCcw, RefreshCw, Sun, Mountain } from "lucide-react";

type Panel = { id: number; x: number; y: number; w: number; h: number };
type Obstacle = { id: number; x: number; y: number; w: number; h: number; label?: string; heightM?: number };
type Site = { coordinates: { lat: number; lng: number }; address?: string };
type DemGrid = { rows: number; cols: number; elevations: number[]; min: number; max: number; source: string; fetchedAt: string };
type SavedLayout = {
  projectId?: string | null;
  settings?: { system?: string; areaWidth?: number; areaHeight?: number; moduleWidth?: number; moduleHeight?: number; tilt?: number; orientation?: string; watts?: number };
  panels?: Panel[]; obstacles?: Obstacle[]; site?: Site | null; dem?: DemGrid | null;
};
const STORAGE_KEY = "solar-apps-pv-layout-v1";

function solarPosition(date: Date, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const offsetMinutes = -date.getTimezoneOffset();
  const trueSolarMinutes = ((hour * 60 + eqTime + 4 * lng - offsetMinutes) % 1440 + 1440) % 1440;
  const hourAngle = (trueSolarMinutes / 4 - 180) * rad;
  const latRad = lat * rad;
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / rad;
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad)) / rad + 180 + 360) % 360;
  return { azimuth, elevation };
}

export default function PVLayout3D({ lang = "en", userId = "anonymous", projectId = null, projectName = null }: { lang?: "en" | "id"; userId?: string; projectId?: string | null; projectName?: string | null }) {
  const scopedStorageKey = `${STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [surfaceMode, setSurfaceMode] = useState<"auto" | "flat" | "terrain" | "roof-flat" | "roof-single" | "roof-gable" | "roof-hip">("auto");
  const [surfaceSlope, setSurfaceSlope] = useState(5);
  const [panelCount, setPanelCount] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [notice, setNotice] = useState(0);
  const [dateTime, setDateTime] = useState(() => { const d = new Date(); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [demLoading, setDemLoading] = useState(false);
  const [demStatus, setDemStatus] = useState("");
  const [sunInfo, setSunInfo] = useState({ azimuth: 0, elevation: 0 });
  const id = lang === "id";

  async function fetchDem() {
    let saved: SavedLayout = {};
    try { saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}"); } catch { /* ignore */ }
    let site = saved.site;
    if (!site?.coordinates) {
      const defaultData = getProjectDefaultLayout(projectId);
      if (defaultData?.site) site = defaultData.site;
    }
    if (!site?.coordinates || !Number.isFinite(site.coordinates.lat) || !Number.isFinite(site.coordinates.lng)) {
      setDemStatus(id ? "Koordinat lokasi belum tersimpan. Terapkan lokasi dari Google Maps di PV Layout 2D terlebih dahulu." : "Project coordinates are missing. Apply a Google Maps location in PV Layout 2D first."); return;
    }
    setDemLoading(true); setDemStatus(id ? "Mengambil elevasi DEM…" : "Fetching DEM elevations…");
    try {
      const rows = 9, cols = 9;
      const latSpan = 0.0015, lngSpan = 0.0015 / Math.max(0.2, Math.cos(site.coordinates.lat * Math.PI / 180));
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
    } finally { setDemLoading(false); }
  }

  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === scopedStorageKey || event.key === null) setNotice(v => v + 1); };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => setNotice(v => v + 1), 60000);
    return () => { window.removeEventListener("storage", onStorage); window.clearInterval(timer); };
  }, [scopedStorageKey]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let saved: SavedLayout = {};
    try { saved = JSON.parse(localStorage.getItem(scopedStorageKey) || "{}"); } catch { saved = {}; }
    if (!saved?.panels || !saved.panels.length) {
      const defaultData = getProjectDefaultLayout(projectId);
      if (defaultData) saved = defaultData as any;
    }
    const settings: Record<string, any> = saved.settings ?? {}, panels = Array.isArray(saved.panels) ? saved.panels : [], obstacles = Array.isArray(saved.obstacles) ? saved.obstacles : [];
    const areaW = Math.max(1000, Number(settings.areaWidth) || 12000) / 1000, areaH = Math.max(1000, Number(settings.areaHeight) || 8000) / 1000;
    const system = settings.system === "Ground-mounted" ? "Ground-mounted" : "Rooftop";
    const mode = surfaceMode === "auto" ? (system === "Ground-mounted" ? "terrain" : "roof-gable") : surfaceMode;
    const site = saved.site; const lat = site?.coordinates?.lat ?? -7.8; const lng = site?.coordinates?.lng ?? 110.36;
    const sun = solarPosition(new Date(dateTime), lat, lng); setSunInfo(sun);
    // The 2D editor saves watts/moduleWidth; the seeded project data uses panelWatts/panelWidth.
    const watts = Number(settings.watts) || Number(settings.panelWatts) || 580;
    const moduleW = Number(settings.moduleWidth) || Number(settings.panelWidth) || 2278, moduleH = Number(settings.moduleHeight) || Number(settings.panelHeight) || 1134;
    const tilt = Math.max(0, Math.min(60, Number(settings.tilt) || 10));
    setPanelCount(panels.length); setCapacity(panels.length * watts / 1000);

    // Everything that depends on distance must scale with the site. A fixed 30–140 m fog
    // used to swallow the whole scene for anything bigger than ~100 m (the seeded 110×32 m
    // and 220×120 m projects rendered as a blank canvas in the fog/background colour).
    const span = Math.max(areaW, areaH), viewDist = span * 1.05 + 10;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#0b1220"); scene.fog = new THREE.Fog("#0b1220", viewDist * 1.6, viewDist * 4.5);
    const camera = new THREE.PerspectiveCamera(45, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), Math.max(0.1, span / 2000), viewDist * 8);
    camera.position.copy(new THREE.Vector3(0.62, 0.62, 0.48).normalize().multiplyScalar(viewDist));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xdceaff, 0x334155, 1.45));
    const sunRad = Math.max(0.02, sun.elevation * Math.PI / 180), az = sun.azimuth * Math.PI / 180;
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(sunRad), Math.sin(sunRad), -Math.cos(az) * Math.cos(sunRad));
    const sunLight = new THREE.DirectionalLight(0xfff1cf, sun.elevation > 0 ? 2.8 : 0.12);
    const half = Math.hypot(areaW, areaH) / 2 + 5, lightDist = half * 3;
    sunLight.position.copy(sunDir.clone().multiplyScalar(lightDist)); sunLight.castShadow = true; const shadowRes = Math.min(4096, renderer.capabilities.maxTextureSize); sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    Object.assign(sunLight.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: lightDist + half * 2 }); sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight); scene.add(sunLight.target);

    const centerX = areaW / 2, centerZ = areaH / 2, roofPitch = Math.max(0, Math.min(45, Number(settings.tilt) || 10)) * Math.PI / 180, baseRoofY = 3.2;
    const dem = saved.dem && saved.dem.elevations?.length === saved.dem.rows * saved.dem.cols ? saved.dem : null;
    const demValues = dem?.elevations ?? [];
    const demMin = dem?.min ?? 0, demRange = Math.max(0.01, (dem?.max ?? 0) - demMin);
    const terrainHeight = (x: number, z: number) => {
      if (!dem) return x * (Math.max(0, Math.min(30, surfaceSlope)) / 100);
      const u = Math.max(0, Math.min(1, (x + centerX) / areaW)) * (dem.cols - 1), v = Math.max(0, Math.min(1, (z + centerZ) / areaH)) * (dem.rows - 1);
      const c0 = Math.floor(u), r0 = Math.floor(v), c1 = Math.min(dem.cols - 1, c0 + 1), r1 = Math.min(dem.rows - 1, r0 + 1), fu = u - c0, fv = v - r0;
      const at = (r: number, c: number) => demValues[r * dem.cols + c] ?? demMin;
      const a = at(r0,c0) * (1-fu) + at(r0,c1) * fu, b = at(r1,c0) * (1-fu) + at(r1,c1) * fu;
      return ((a * (1-fv) + b * fv) - demMin) / demRange * Math.min(4, demRange);
    };
    const roofHeight = (x: number, z: number) => {
      if (mode === "roof-single") return baseRoofY - z * Math.tan(roofPitch);
      if (mode === "roof-gable" || mode === "roof-hip") return baseRoofY + centerX * Math.tan(roofPitch) - Math.abs(x) * Math.tan(roofPitch);
      return baseRoofY;
    };
    const surfaceY = (x: number, z: number) => mode === "terrain" ? terrainHeight(x,z) : mode.startsWith("roof-") ? roofHeight(x,z) : 0;

    if (mode.startsWith("roof-")) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(areaW, baseRoofY, areaH), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 })); wall.position.y = baseRoofY/2 - 0.08; wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
      // The sloped roof itself is the surface mesh below. A flat slab used to sit here at
      // mid-ridge height and buried every panel in the outer half of a gable roof.
      if (mode === "roof-gable" || mode === "roof-hip") {
        const rise = centerX * Math.tan(roofPitch), gableMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, side: THREE.DoubleSide });
        const tri = new THREE.Shape([new THREE.Vector2(-centerX, 0), new THREE.Vector2(centerX, 0), new THREE.Vector2(0, rise)]);
        for (const zEnd of [-centerZ, centerZ]) { const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), gableMat); gable.position.set(0, baseRoofY - 0.08, zEnd); gable.castShadow = true; gable.receiveShadow = true; scene.add(gable); }
      }
    }
    const seg = dem ? dem.cols - 1 : 32; const segZ = dem ? dem.rows - 1 : 32;
    const surfaceGeometry = new THREE.PlaneGeometry(areaW, areaH, seg, segZ); surfaceGeometry.rotateX(-Math.PI/2);
    const positions = surfaceGeometry.attributes.position;
    let surfaceMin = Infinity;
    for (let i=0;i<positions.count;i++){ const x=positions.getX(i),z=positions.getZ(i),y=surfaceY(x,z); surfaceMin=Math.min(surfaceMin,y); positions.setY(i,y+0.025); }
    positions.needsUpdate=true; surfaceGeometry.computeVertexNormals();
    const surfaceMesh = new THREE.Mesh(surfaceGeometry,new THREE.MeshStandardMaterial({color:mode==="terrain"?0x47734d:0x94a3b8,roughness:0.94,side:THREE.DoubleSide})); surfaceMesh.receiveShadow=true; scene.add(surfaceMesh);
    // Ground reference grid: 1 m cells on small sites, 5 m on large ones (1 m on a 220 m site is a moiré),
    // and always below the lowest surface point — a sloped terrain used to rise through a flat y=0 grid
    // and draw grid lines over half the array. On roofs it sits at ground level around the building.
    const gridSize = span * 1.6, gridCell = span > 60 ? 5 : 1;
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.round(gridSize / gridCell)), 0x334155, 0x1e293b); grid.position.y = mode.startsWith("roof-") ? 0 : Math.min(0, surfaceMin) - 0.05; scene.add(grid);

    const panelMat=new THREE.MeshStandardMaterial({color:0x1679bd,metalness:0.32,roughness:0.38,side:THREE.DoubleSide}), frameMat=new THREE.MeshStandardMaterial({color:0xcbd5e1,metalness:0.7,roughness:0.32}), supportMat=new THREE.MeshStandardMaterial({color:0x94a3b8,metalness:0.55,roughness:0.4});
    // One InstancedMesh per part instead of 5 meshes per module: the 2 MWp seed has 3,092
    // modules, which was ~15k meshes (and ~30k draw calls with the shadow pass).
    const unitBox = new THREE.BoxGeometry(1, 1, 1), n = panels.length, supportHeight = system === "Ground-mounted" ? 1.05 : 0.35;
    const panelIM = new THREE.InstancedMesh(unitBox, panelMat, n), railIM = new THREE.InstancedMesh(unitBox, frameMat, n * 2), legIM = new THREE.InstancedMesh(unitBox, supportMat, n * 2);
    panelIM.castShadow = panelIM.receiveShadow = railIM.castShadow = legIM.castShadow = true;
    const groupM = new THREE.Matrix4(), partM = new THREE.Matrix4(), outM = new THREE.Matrix4(), euler = new THREE.Euler(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const put = (im: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, sx: number, sy: number, sz: number) => { partM.compose(pos.set(px, py, pz), quat.identity(), scl.set(sx, sy, sz)); im.setMatrixAt(i, outM.multiplyMatrices(groupM, partM)); };
    panels.forEach((p, i) => {
      const w=Math.max(0.1,(Number(p.w)||moduleW)/1000),h=Math.max(0.1,(Number(p.h)||moduleH)/1000),x=(Number(p.x)||0)/1000-centerX+w/2,z=(Number(p.y)||0)/1000-centerZ+h/2;
      const base=surfaceY(x,z)+(mode.startsWith("roof-")?0.13:system==="Ground-mounted"?1.15:0.35);
      euler.set(0, 0, 0);
      // roof-single falls toward +z (roofHeight = base - z·tan), so +rotation.x tips the module down with it.
      if(mode==="terrain") euler.z=Math.atan(surfaceSlope/100); else if(mode==="roof-single") euler.x=roofPitch; else if(mode==="roof-gable"||mode==="roof-hip") euler.z=x<0?roofPitch:-roofPitch; else euler.x=-tilt*Math.PI/180;
      groupM.compose(pos.set(x, base, z), quat.setFromEuler(euler), one);
      put(panelIM, i, 0, 0, 0, w, 0.055, h);
      put(railIM, i * 2, 0, -0.045, -h * 0.32, w * 0.96, 0.04, 0.05); put(railIM, i * 2 + 1, 0, -0.045, h * 0.32, w * 0.96, 0.04, 0.05);
      put(legIM, i * 2, -w * 0.35, -supportHeight / 2 - 0.06, 0, 0.055, supportHeight, 0.055); put(legIM, i * 2 + 1, w * 0.35, -supportHeight / 2 - 0.06, 0, 0.055, supportHeight, 0.055);
    });
    for (const im of [panelIM, railIM, legIM]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); }
    obstacles.forEach(o=>{const w=Math.max(0.1,(Number(o.w)||1000)/1000),h=Math.max(0.1,(Number(o.h)||1000)/1000),x=(Number(o.x)||0)/1000-centerX+w/2,z=(Number(o.y)||0)/1000-centerZ+h/2,height=Math.max(0.5,Number(o.heightM)||2.5);const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,height,h),new THREE.MeshStandardMaterial({color:0xef4444,transparent:true,opacity:0.82}));mesh.position.set(x,surfaceY(x,z)+height/2,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);});
    if(!panels.length){const label=document.createElement("div");label.textContent=id?"Belum ada panel tersimpan — buat layout di PV Layout 2D lalu klik Muat Ulang.":"No saved panels — create a layout in PV Layout 2D, then click Reload.";label.style.cssText="position:absolute;left:16px;bottom:16px;padding:10px 12px;background:#111827dd;color:#e5e7eb;border:1px solid #334155;border-radius:8px;font:12px system-ui;pointer-events:none";host.appendChild(label);}
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,mode.startsWith("roof-")?baseRoofY:0,0);controls.maxPolarAngle=Math.PI*0.49;controls.minDistance=2;controls.maxDistance=viewDist*3;controls.update();
    const resize=()=>{camera.aspect=Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);};const observer=new ResizeObserver(resize);observer.observe(host);
    let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.dispose();scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.LineSegments){o.geometry.dispose();const m=o.material;if(Array.isArray(m))m.forEach(v=>v.dispose());else m.dispose();}});if(renderer.domElement.parentElement===host)host.removeChild(renderer.domElement);while(host.firstChild)host.removeChild(host.firstChild);};
  },[dateTime,notice,surfaceMode,surfaceSlope,scopedStorageKey,id,projectId]);

  return <section style={{color:"#e5edf8",display:"grid",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><div style={{color:"#38bdf8",fontSize:11,letterSpacing:2,fontWeight:700}}>ENGINEERING VIEWER</div><h1 style={{margin:"5px 0",fontSize:25}}>PV Layout 3D</h1>{projectName&&<div style={{color:"#94a3b8",fontSize:12}}>Project aktif: <strong style={{color:"#e5edf8"}}>{projectName}</strong> · <small>{projectId??"Unassigned"}</small></div>}<p style={{margin:0,color:"#94a3b8",fontSize:13}}>Engineering visualization · project-scoped layout</p></div><button onClick={()=>setNotice(v=>v+1)} style={{display:"inline-flex",alignItems:"center",gap:8,background:"#123047",color:"#bae6fd",border:"1px solid #25617a",borderRadius:9,padding:"10px 13px",cursor:"pointer"}}><RefreshCw size={16}/>{id?"Muat Ulang Layout":"Reload Layout"}</button></div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{background:"#111c2d",border:"1px solid #26354a",borderRadius:10,padding:"12px 16px",minWidth:115}}><div style={{color:"#94a3b8",fontSize:11}}>MODULES</div><strong style={{fontSize:22}}>{panelCount}</strong></div>
      <div style={{background:"#111c2d",border:"1px solid #26354a",borderRadius:10,padding:"12px 16px",minWidth:125}}><div style={{color:"#94a3b8",fontSize:11}}>DC CAPACITY</div><strong style={{fontSize:22}}>{capacity.toFixed(2)} kWp</strong></div>
      <div style={{background:"#111c2d",border:"1px solid #26354a",borderRadius:10,padding:"12px 16px",minWidth:190}}><div style={{color:"#94a3b8",fontSize:11,marginBottom:6}}>SURFACE / ROOF TYPE</div><select aria-label="3D surface mode" value={surfaceMode} onChange={e=>setSurfaceMode(e.target.value as typeof surfaceMode)} style={{width:"100%",background:"#0b1220",color:"#e5edf8",border:"1px solid #334155",borderRadius:7,padding:7}}><option value="auto">Auto from system</option><option value="flat">Flat plane</option><option value="terrain">DEM Terrain</option><option value="roof-flat">Flat roof</option><option value="roof-single">Single slope</option><option value="roof-gable">Gable roof</option><option value="roof-hip">Hip / Multi-roof (concept)</option></select><div style={{color:"#94a3b8",fontSize:11,marginTop:8}}>Manual terrain slope fallback (%)</div><input type="number" min="0" max="30" value={surfaceSlope} onChange={e=>setSurfaceSlope(Math.max(0,Math.min(30,Number(e.target.value)||0)))} style={{width:"100%",boxSizing:"border-box",marginTop:4,background:"#0b1220",color:"#e5edf8",border:"1px solid #334155",borderRadius:7,padding:7}}/></div>
      <div style={{background:"#111c2d",border:"1px solid #26354a",borderRadius:10,padding:"12px 16px",minWidth:240}}><div style={{color:"#94a3b8",fontSize:11,marginBottom:6}}><Mountain size={13} style={{display:"inline",verticalAlign:"middle"}}/> DEM TERRAIN</div><button disabled={demLoading} onClick={fetchDem} style={{width:"100%",background:"#173a2a",color:"#d1fae5",border:"1px solid #34734c",borderRadius:7,padding:8,cursor:"pointer"}}>{demLoading?"Loading DEM…":"Fetch DEM for project coordinates"}</button><small style={{display:"block",color:"#94a3b8",marginTop:7}}>{demStatus||"Uses project coordinates saved from Google Maps. DEM is terrain context, not survey-grade."}</small></div>
      <div style={{background:"#111c2d",border:"1px solid #26354a",borderRadius:10,padding:"12px 16px",minWidth:245}}><div style={{color:"#94a3b8",fontSize:11,marginBottom:6}}><Sun size={13} style={{display:"inline",verticalAlign:"middle"}}/> SUN POSITION & SHADOW</div><input aria-label="Simulation date and time" type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)} style={{width:"100%",boxSizing:"border-box",background:"#0b1220",color:"#e5edf8",border:"1px solid #334155",borderRadius:7,padding:7}}/><div style={{fontSize:12,color:"#cbd5e1",marginTop:7}}>Azimuth {sunInfo.azimuth.toFixed(1)}° · Elevation {sunInfo.elevation.toFixed(1)}°</div></div>
    </div>
    <div ref={hostRef} style={{position:"relative",height:"min(66vh,650px)",minHeight:360,overflow:"hidden",border:"1px solid #26354a",borderRadius:14,background:"#0b1220"}}/>
    <div style={{display:"flex",gap:8,alignItems:"center",color:"#94a3b8",fontSize:12}}><RotateCcw size={14}/> Orbit kamera · scroll zoom · gunakan tanggal/jam untuk melihat perubahan arah cahaya dan bayangan.</div>
    <p style={{color:"#fbbf24",fontSize:12,margin:0}}>Batasan engineering: DEM API memberikan grid elevasi resolusi terbatas untuk konteks visual, bukan survey konstruksi. Multi-roof/hip saat ini merupakan geometri konseptual. Shadow adalah simulasi geometris pada waktu terpilih, belum analisis shading tahunan atau energi.</p>
  </section>;
}
