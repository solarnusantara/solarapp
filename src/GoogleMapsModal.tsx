import { useEffect, useRef, useState, useMemo } from "react";
import {
  X,
  Search,
  MapPin,
  Maximize2,
  Check,
  RefreshCw,
  Layers,
  Zap,
  Plus,
  Trash2,
  RotateCw,
  RotateCcw,
  Compass,
  Crop,
  Undo2,
  Redo2,
} from "lucide-react";
import { fetchGoogleSolarInsights } from "./gisSolarService";
import type { GoogleSolarInsights } from "./gisSolarService";

export interface BoxSegmentData {
  id: string;
  name: string;
  color: string;
  polygonCornersMm: Array<{ x: number; y: number }>;
  widthM: number;
  heightM: number;
  areaM2: number;
  rotationDeg: number;
}

interface GoogleMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
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
    googleSolarData?: GoogleSolarInsights;
    segmentsData?: BoxSegmentData[];
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
  }) => void;
  initialWidthMm?: number;
  initialHeightMm?: number;
  initialPolygonPoints?: Array<{ lat: number; lng: number }>;
  initialRotationDeg?: number;
  initialCenter?: { lat: number; lng: number };
  initialBoxes?: Array<{
    id: string;
    name: string;
    color: string;
    center: { lat: number; lng: number };
    widthM: number;
    heightM: number;
    rotationAngle: number;
  }>;
  initialCropPaddingM?: number;
}

const DEFAULT_API_KEY = "AIzaSyC6TAjg7EBuCmkaWRwl-ih0PQ_Be07rc3o";

// Presets kawasan industri terkemuka di Indonesia
const INDUSTRIAL_PRESETS = [
  { name: "GIIC Cikarang (Kota Deltamas)", region: "Cikarang Pusat, Bekasi", lat: -6.3685, lng: 107.1985 },
  { name: "KIIC Karawang (Kawasan Industri)", region: "Telukjambe Timur, Karawang", lat: -6.3475, lng: 107.2798 },
  { name: "MM2100 Cibitung", region: "Cikarang Barat, Bekasi", lat: -6.2890, lng: 107.0980 },
  { name: "Suryacipta City of Industry", region: "Ciampel, Karawang", lat: -6.3980, lng: 107.3510 },
  { name: "Kawasan Industri Jababeka 1-7", region: "Cikarang Utara, Bekasi", lat: -6.2950, lng: 107.1550 },
  { name: "Krakatau Industrial Estate Cilegon", region: "Cilegon, Banten", lat: -6.0125, lng: 106.0235 },
  { name: "Kendal Industrial Park (KIK)", region: "Kendal, Jawa Tengah", lat: -6.9180, lng: 110.2240 },
  { name: "SIER Surabaya Industrial Estate", region: "Rungkut, Surabaya", lat: -7.3320, lng: 112.7560 },
  { name: "PIER Pasuruan Industrial Estate", region: "Rembang, Pasuruan", lat: -7.6320, lng: 112.8750 },
  { name: "Kawasan Industri Batamindo", region: "Mukakuning, Batam", lat: 1.0850, lng: 104.0450 },
];

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  source: "preset" | "google" | "osm";
}

const SHAPE_PALETTE = [
  "#3b82f6", // Blue - Segment A
  "#8b5cf6", // Purple - Segment B
  "#f97316", // Orange - Segment C
  "#10b981", // Emerald - Segment D
  "#06b6d4", // Cyan - Segment E
  "#eab308", // Yellow - Segment F
  "#ec4899", // Pink - Segment G
];

const M_PER_DEG_LAT = 111319.49;

export interface RoofBox {
  id: string;
  name: string;
  color: string;
  center: { lat: number; lng: number };
  widthM: number;
  heightM: number;
  rotationAngle: number;
  poly?: any; // google.maps.Polygon
}

export default function GoogleMapsModal({
  isOpen,
  onClose,
  onApply,
  initialWidthMm = 74000,
  initialHeightMm = 28000,
  initialPolygonPoints,
  initialRotationDeg,
  initialCenter,
  initialBoxes,
  initialCropPaddingM = 5,
}: GoogleMapsModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [mapInstance, setMapInstance] = useState<any>(null);
  const [searchAddress, setSearchAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: -6.3685,
    lng: 107.1985,
  });

  // Custom Crop Padding State
  const [cropPaddingM, setCropPaddingM] = useState<number>(initialCropPaddingM ?? 5);
  const cropPolyRef = useRef<any>(null);

  // Canva-Style Direct Manipulation Handles Ref
  const handlesRef = useRef<{
    cornerMarkers: any[];
    rotMarker: any;
    rotLine: any;
  }>({
    cornerMarkers: [],
    rotMarker: null,
    rotLine: null,
  });

  // Multiple 90-degree boxes
  const [boxes, setBoxes] = useState<RoofBox[]>([
    {
      id: "box-1",
      name: "Box A (Atap Utama)",
      color: SHAPE_PALETTE[0],
      center: initialCenter || { lat: -6.3685, lng: 107.1985 },
      widthM: Math.round(initialWidthMm / 1000) || 74,
      heightM: Math.round(initialHeightMm / 1000) || 28,
      rotationAngle: initialRotationDeg !== undefined ? initialRotationDeg : 334,
    },
  ]);
  const [activeBoxId, setActiveBoxId] = useState<string>("box-1");
  const activeBoxIdRef = useRef<string>(activeBoxId);
  activeBoxIdRef.current = activeBoxId;

  const boxesRef = useRef<RoofBox[]>(boxes);
  boxesRef.current = boxes;

  // History State for Undo / Redo
  interface ModalHistoryEntry {
    boxes: Array<{
      id: string;
      name: string;
      color: string;
      center: { lat: number; lng: number };
      widthM: number;
      heightM: number;
      rotationAngle: number;
    }>;
    activeBoxId: string;
    cropPaddingM: number;
  }
  const [history, setHistory] = useState<ModalHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isRestoringHistoryRef = useRef<boolean>(false);

  // Google Solar API Integration State
  const [solarDetecting, setSolarDetecting] = useState(false);
  const [solarInsights, setSolarInsights] = useState<GoogleSolarInsights | null>(null);
  const [solarStatusMsg, setSolarStatusMsg] = useState<string>("");

  const apiKey = (window as any).GOOGLE_MAPS_API_KEY || DEFAULT_API_KEY;

  const activeBox = useMemo(() => {
    return boxes.find(b => b.id === activeBoxId) || boxes[0] || null;
  }, [boxes, activeBoxId]);

  // Load Google Maps SDK
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setErrorMsg("");
    setSolarInsights(null);
    setSolarStatusMsg("");

    function loadScript(): Promise<void> {
      if ((window as any).google?.maps?.Map) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const scriptId = "google-maps-solar-sdk";
        const existing = document.getElementById(scriptId);
        if (existing) {
          if ((window as any).google?.maps?.Map) {
            resolve();
            return;
          }
          existing.remove();
        }

        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,drawing`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("Gagal mengunduh script Google Maps. Periksa koneksi internet atau API Key."));
        document.head.appendChild(script);
      });
    }

    loadScript()
      .then(() => {
        if (!isMounted || !mapRef.current) return;
        initMap();
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(err.message || "Gagal memuat Google Maps");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Compute 4 corner LatLngs for a strict 90-degree rectangle
  function computeStrict90BoxCoords(
    center: { lat: number; lng: number },
    wM: number,
    hM: number,
    angleDeg: number
  ) {
    const win = window as any;
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((center.lat * Math.PI) / 180);
    const mLng = M_PER_DEG_LAT * cosLat;

    const halfW = wM / 2;
    const halfH = hM / 2;

    // Strict 90-degree box corners:
    // 0: Top-Left (-halfW, +halfH)
    // 1: Top-Right (+halfW, +halfH)
    // 2: Bottom-Right (+halfW, -halfH)
    // 3: Bottom-Left (-halfW, -halfH)
    const localCorners = [
      { x: -halfW, y: halfH },
      { x: halfW, y: halfH },
      { x: halfW, y: -halfH },
      { x: -halfW, y: -halfH },
    ];

    return localCorners.map(pt => {
      const rx = pt.x * cosA - pt.y * sinA;
      const ry = pt.x * sinA + pt.y * cosA;
      const lat = center.lat + ry / M_PER_DEG_LAT;
      const lng = center.lng + rx / mLng;
      return new win.google.maps.LatLng(lat, lng);
    });
  }

  function createPolygonForBox(map: any, box: RoofBox) {
    const win = window as any;
    if (!win.google?.maps) return null;

    const coords = computeStrict90BoxCoords(box.center, box.widthM, box.heightM, box.rotationAngle);
    const poly = new win.google.maps.Polygon({
      paths: coords,
      editable: false, // Keep strict 90-degree geometry (no distorted corners!)
      draggable: true, // Allow dragging whole box smoothly
      strokeColor: box.color,
      strokeOpacity: 0.95,
      strokeWeight: box.id === activeBoxId ? 3.5 : 2,
      fillColor: box.color,
      fillOpacity: box.id === activeBoxId ? 0.32 : 0.16,
      map: map,
      zIndex: box.id === activeBoxId ? 100 : 10,
    });

    // When dragged, update center and keep strict 90-degree rectangle
    poly.addListener("dragend", () => {
      const path = poly.getPath();
      let sumLat = 0, sumLng = 0;
      for (let i = 0; i < path.getLength(); i++) {
        sumLat += path.getAt(i).lat();
        sumLng += path.getAt(i).lng();
      }
      const newCenter = { lat: sumLat / path.getLength(), lng: sumLng / path.getLength() };
      const current = boxesRef.current.find(b => b.id === box.id);
      const w = current?.widthM || box.widthM;
      const h = current?.heightM || box.heightM;
      const rot = current?.rotationAngle ?? box.rotationAngle;

      // Re-align perfectly
      const resetCoords = computeStrict90BoxCoords(newCenter, w, h, rot);
      poly.setPath(resetCoords);

      const updatedBox: RoofBox = {
        id: box.id,
        name: current?.name || box.name,
        color: current?.color || box.color,
        widthM: w,
        heightM: h,
        rotationAngle: rot,
        center: newCenter,
        poly: poly,
      };
      const nextBoxes = boxesRef.current.map(b => b.id === box.id ? updatedBox : b);
      boxesRef.current = nextBoxes;
      setBoxes(nextBoxes);
      if (box.id === activeBoxIdRef.current) {
        syncHandlesForActiveBox(updatedBox);
      }
      syncCropBoundary();
      pushModalHistory(nextBoxes, activeBoxIdRef.current, cropPaddingM);
    });

    // Click to select active box
    poly.addListener("click", () => {
      activeBoxIdRef.current = box.id;
      setActiveBoxId(box.id);
      const cur = boxesRef.current.find(b => b.id === box.id);
      syncHandlesForActiveBox(cur || box);
    });

    return poly;
  }

  function initMap() {
    const win = window as any;
    if (!mapRef.current || !win.google?.maps) return;

    let initLat = initialCenter?.lat ?? centerCoords.lat;
    let initLng = initialCenter?.lng ?? centerCoords.lng;

    if (initialBoxes && initialBoxes.length > 0 && initialBoxes[0].center) {
      initLat = initialBoxes[0].center.lat;
      initLng = initialBoxes[0].center.lng;
      setCenterCoords({ lat: initLat, lng: initLng });
    } else if (initialPolygonPoints && initialPolygonPoints.length >= 3) {
      let sLat = 0, sLng = 0;
      initialPolygonPoints.forEach(p => { sLat += p.lat; sLng += p.lng; });
      initLat = sLat / initialPolygonPoints.length;
      initLng = sLng / initialPolygonPoints.length;
      setCenterCoords({ lat: initLat, lng: initLng });
    }

    const map = new win.google.maps.Map(mapRef.current, {
      center: { lat: initLat, lng: initLng },
      zoom: 19,
      mapTypeId: "satellite",
      tilt: 0,
      rotateControl: false,
      streetViewControl: false,
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ["satellite", "hybrid"],
        position: win.google.maps.ControlPosition.TOP_RIGHT,
      },
      zoomControl: true,
      zoomControlOptions: {
        position: win.google.maps.ControlPosition.RIGHT_CENTER,
      },
    });

    setMapInstance(map);

    // Rehydrate previous boxes or initialize with initialRotationDeg
    let loadedBoxes: RoofBox[] = [];
    if (initialBoxes && initialBoxes.length > 0) {
      loadedBoxes = initialBoxes.map(b => {
        const boxObj: RoofBox = {
          id: b.id,
          name: b.name,
          color: b.color || SHAPE_PALETTE[0],
          center: b.center || { lat: initLat, lng: initLng },
          widthM: b.widthM || 74,
          heightM: b.heightM || 28,
          rotationAngle: b.rotationAngle !== undefined ? b.rotationAngle : (initialRotationDeg ?? 334),
        };
        boxObj.poly = createPolygonForBox(map, boxObj);
        return boxObj;
      });
    } else {
      const firstBox: RoofBox = {
        id: "box-1",
        name: "Box A (Atap Utama)",
        color: SHAPE_PALETTE[0],
        center: { lat: initLat, lng: initLng },
        widthM: Math.round(initialWidthMm / 1000) || 74,
        heightM: Math.round(initialHeightMm / 1000) || 28,
        rotationAngle: initialRotationDeg !== undefined ? initialRotationDeg : 334,
      };
      firstBox.poly = createPolygonForBox(map, firstBox);
      loadedBoxes = [firstBox];
    }

    setBoxes(loadedBoxes);
    const initialId = loadedBoxes[0]?.id || "box-1";
    activeBoxIdRef.current = initialId;
    setActiveBoxId(initialId);

    // Initial history entry
    const initialEntry: ModalHistoryEntry = {
      boxes: loadedBoxes.map(b => ({
        id: b.id,
        name: b.name,
        color: b.color,
        center: { ...b.center },
        widthM: b.widthM,
        heightM: b.heightM,
        rotationAngle: b.rotationAngle,
      })),
      activeBoxId: initialId,
      cropPaddingM: initialCropPaddingM ?? 5,
    };
    setHistory([initialEntry]);
    setHistoryIndex(0);

    // Setup Places Autocomplete
    if (searchInputRef.current && win.google.maps.places?.Autocomplete) {
      const autocomplete = new win.google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ["geometry", "name", "formatted_address"],
        componentRestrictions: { country: "id" },
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;

        const loc = place.geometry.location;
        const newLat = loc.lat();
        const newLng = loc.lng();

        map.setCenter(loc);
        map.setZoom(19);

        setCenterCoords({ lat: newLat, lng: newLng });
        const leadBox = boxesRef.current[0] || loadedBoxes[0];
        if (leadBox?.poly) {
          const coords = computeStrict90BoxCoords({ lat: newLat, lng: newLng }, leadBox.widthM, leadBox.heightM, leadBox.rotationAngle);
          leadBox.poly.setPath(coords);
        }
        setBoxes(prev => prev.map((b, i) => i === 0 ? { ...b, center: { lat: newLat, lng: newLng } } : b));
        setSearchAddress(place.formatted_address || place.name || "");
      });
    }
  }

  // Clear handles
  function clearHandles() {
    handlesRef.current.cornerMarkers.forEach(m => m.setMap(null));
    handlesRef.current.cornerMarkers = [];
    if (handlesRef.current.rotMarker) {
      handlesRef.current.rotMarker.setMap(null);
      handlesRef.current.rotMarker = null;
    }
    if (handlesRef.current.rotLine) {
      handlesRef.current.rotLine.setMap(null);
      handlesRef.current.rotLine = null;
    }
  }

  // Canva-Style Direct Manipulation Handles (4 corners resize + 1 top rotation handle)
  function syncHandlesForActiveBox(box: RoofBox | null) {
    const win = window as any;
    if (!mapInstance || !win.google?.maps) return;
    if (!box) {
      clearHandles();
      return;
    }

    const rad = (box.rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((box.center.lat * Math.PI) / 180);
    const mLng = M_PER_DEG_LAT * cosLat;
    const halfW = box.widthM / 2;
    const halfH = box.heightM / 2;

    // 4 Corners: TL, TR, BR, BL
    const localCorners = [
      { x: -halfW, y: halfH, cursor: "nwse-resize" },
      { x: halfW, y: halfH, cursor: "nesw-resize" },
      { x: halfW, y: -halfH, cursor: "nwse-resize" },
      { x: -halfW, y: -halfH, cursor: "nesw-resize" },
    ];

    const cornerLatLngs = localCorners.map(pt => {
      const rx = pt.x * cosA - pt.y * sinA;
      const ry = pt.x * sinA + pt.y * cosA;
      return new win.google.maps.LatLng(box.center.lat + ry / M_PER_DEG_LAT, box.center.lng + rx / mLng);
    });

    // Rotation Handle: extended above top center
    const rotDist = Math.max(7, Math.min(14, box.heightM * 0.28 + 4));
    const topCenterLocal = { x: 0, y: halfH };
    const rotHandleLocal = { x: 0, y: halfH + rotDist };

    const topCenterLatLng = new win.google.maps.LatLng(
      box.center.lat + (topCenterLocal.x * sinA + topCenterLocal.y * cosA) / M_PER_DEG_LAT,
      box.center.lng + (topCenterLocal.x * cosA - topCenterLocal.y * sinA) / mLng
    );

    const rotHandleLatLng = new win.google.maps.LatLng(
      box.center.lat + (rotHandleLocal.x * sinA + rotHandleLocal.y * cosA) / M_PER_DEG_LAT,
      box.center.lng + (rotHandleLocal.x * cosA - rotHandleLocal.y * sinA) / mLng
    );

    // If handles not created yet, instantiate them
    if (handlesRef.current.cornerMarkers.length !== 4) {
      clearHandles();
      handlesRef.current.cornerMarkers = localCorners.map((pt, idx) => {
        const marker = new win.google.maps.Marker({
          position: cornerLatLngs[idx],
          map: mapInstance,
          draggable: true,
          icon: {
            path: win.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: box.color || "#3b82f6",
            strokeWeight: 2.5,
          },
          cursor: pt.cursor,
          title: "Tarik sudut untuk resize " + box.name,
          zIndex: 200,
        });

        marker.addListener("drag", (e: any) => {
          const targetId = activeBoxIdRef.current;
          const curBox = boxesRef.current.find(b => b.id === targetId);
          if (!curBox) return;
          const curRad = (curBox.rotationAngle * Math.PI) / 180;
          const dEast = (e.latLng.lng() - curBox.center.lng) * mLng;
          const dNorth = (e.latLng.lat() - curBox.center.lat) * M_PER_DEG_LAT;
          const rx = dEast * Math.cos(curRad) + dNorth * Math.sin(curRad);
          const ry = -dEast * Math.sin(curRad) + dNorth * Math.cos(curRad);
          const newW = Math.max(4, Math.round(Math.abs(rx) * 2 * 2) / 2);
          const newH = Math.max(4, Math.round(Math.abs(ry) * 2 * 2) / 2);
          updateBoxProps(targetId, { widthM: newW, heightM: newH });
        });

        marker.addListener("dragend", () => {
          pushModalHistory(boxesRef.current, activeBoxIdRef.current, cropPaddingM);
        });

        return marker;
      });

      // Stem Line
      handlesRef.current.rotLine = new win.google.maps.Polyline({
        path: [topCenterLatLng, rotHandleLatLng],
        strokeColor: "#b8f36b",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        map: mapInstance,
        zIndex: 190,
      });

      // Rotation Knob
      const rotMarker = new win.google.maps.Marker({
        position: rotHandleLatLng,
        map: mapInstance,
        draggable: true,
        icon: {
          url: "data:image/svg+xml;utf-8," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
            '<circle cx="16" cy="16" r="14" fill="#142117" stroke="#b8f36b" stroke-width="2.5"/>' +
            '<path d="M16 8 A8 8 0 1 1 8 16" fill="none" stroke="#b8f36b" stroke-width="2.5" stroke-linecap="round"/>' +
            '<polygon points="8,11 4,16 11,16" fill="#b8f36b"/>' +
            '</svg>'
          ),
          scaledSize: new win.google.maps.Size(30, 30),
          anchor: new win.google.maps.Point(15, 15),
        },
        cursor: "grab",
        title: "Putar rotasi box (Canva-style) " + box.name,
        zIndex: 210,
      });

      rotMarker.addListener("drag", (e: any) => {
        const targetId = activeBoxIdRef.current;
        const curBox = boxesRef.current.find(b => b.id === targetId);
        if (!curBox) return;
        const dEast = (e.latLng.lng() - curBox.center.lng) * mLng;
        const dNorth = (e.latLng.lat() - curBox.center.lat) * M_PER_DEG_LAT;
        let angle = -Math.atan2(dEast, dNorth) * (180 / Math.PI);
        angle = Math.round(((angle % 360) + 360) % 360);
        updateBoxProps(targetId, { rotationAngle: angle });
      });

      rotMarker.addListener("dragend", () => {
        pushModalHistory(boxesRef.current, activeBoxIdRef.current, cropPaddingM);
      });

      handlesRef.current.rotMarker = rotMarker;
    } else {
      handlesRef.current.cornerMarkers.forEach((m, idx) => {
        m.setPosition(cornerLatLngs[idx]);
        m.setIcon({
          path: win.google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: box.color || "#3b82f6",
          strokeWeight: 2.5,
        });
      });
      if (handlesRef.current.rotLine) {
        handlesRef.current.rotLine.setPath([topCenterLatLng, rotHandleLatLng]);
      }
      if (handlesRef.current.rotMarker) {
        handlesRef.current.rotMarker.setPosition(rotHandleLatLng);
      }
    }
  }

  // Draw green crop area boundary on Google Maps
  function syncCropBoundary() {
    const win = window as any;
    if (!mapInstance || !win.google?.maps || boxes.length === 0) return;

    const allBoxCorners = boxes.flatMap(b => {
      const halfW = b.widthM / 2;
      const halfH = b.heightM / 2;
      const rad = (b.rotationAngle * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const cosLat = Math.cos((b.center.lat * Math.PI) / 180);
      const mLng = M_PER_DEG_LAT * cosLat;
      return [
        { x: -halfW, y: halfH },
        { x: halfW, y: halfH },
        { x: halfW, y: -halfH },
        { x: -halfW, y: -halfH },
      ].map(pt => ({
        lat: b.center.lat + (pt.x * sinA + pt.y * cosA) / M_PER_DEG_LAT,
        lng: b.center.lng + (pt.x * cosA - pt.y * sinA) / mLng,
      }));
    });

    const minLat = Math.min(...allBoxCorners.map(c => c.lat));
    const maxLat = Math.max(...allBoxCorners.map(c => c.lat));
    const minLng = Math.min(...allBoxCorners.map(c => c.lng));
    const maxLng = Math.max(...allBoxCorners.map(c => c.lng));
    const siteCenterLat = (minLat + maxLat) / 2;
    const siteCenterLng = (minLng + maxLng) / 2;

    const primaryAngle = boxes[0]?.rotationAngle ?? 24;
    const rad = (primaryAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((siteCenterLat * Math.PI) / 180);
    const mLng = M_PER_DEG_LAT * cosLat;

    let minRx = Infinity, maxRx = -Infinity, minRy = Infinity, maxRy = -Infinity;
    allBoxCorners.forEach(pt => {
      const dEast = (pt.lng - siteCenterLng) * mLng;
      const dNorth = (pt.lat - siteCenterLat) * M_PER_DEG_LAT;
      const rx = dEast * cosA + dNorth * sinA;
      const ry = -dEast * sinA + dNorth * cosA;
      if (rx < minRx) minRx = rx;
      if (rx > maxRx) maxRx = rx;
      if (ry < minRy) minRy = ry;
      if (ry > maxRy) maxRy = ry;
    });

    const padM = cropPaddingM;
    const cropCorners = [
      { rx: minRx - padM, ry: maxRy + padM }, // TL
      { rx: maxRx + padM, ry: maxRy + padM }, // TR
      { rx: maxRx + padM, ry: minRy - padM }, // BR
      { rx: minRx - padM, ry: minRy - padM }, // BL
    ].map(pt => {
      const dEast = pt.rx * cosA - pt.ry * sinA;
      const dNorth = pt.rx * sinA + pt.ry * cosA;
      return new win.google.maps.LatLng(siteCenterLat + dNorth / M_PER_DEG_LAT, siteCenterLng + dEast / mLng);
    });

    if (!cropPolyRef.current) {
      cropPolyRef.current = new win.google.maps.Polygon({
        paths: cropCorners,
        strokeColor: "#22c55e",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#22c55e",
        fillOpacity: 0.05,
        map: mapInstance,
        zIndex: 5,
        clickable: false,
      });
    } else {
      cropPolyRef.current.setPath(cropCorners);
    }
  }

  // Highlight active box styling on map & sync handles
  useEffect(() => {
    if (!mapInstance) return;
    boxes.forEach(b => {
      if (!b.poly) return;
      const isActive = b.id === activeBoxId;
      b.poly.setOptions({
        strokeWeight: isActive ? 3.5 : 2,
        strokeOpacity: isActive ? 1.0 : 0.75,
        fillOpacity: isActive ? 0.32 : 0.15,
        zIndex: isActive ? 100 : 10,
      });
    });
    syncHandlesForActiveBox(activeBox);
    syncCropBoundary();
  }, [activeBoxId, boxes, cropPaddingM, mapInstance]);

  // Clean up handles when closing
  useEffect(() => {
    if (!isOpen) {
      clearHandles();
      if (cropPolyRef.current) {
        cropPolyRef.current.setMap(null);
        cropPolyRef.current = null;
      }
    }
  }, [isOpen]);

  
  // History recording
  function pushModalHistory(nextBoxes: RoofBox[], nextActiveId: string, nextCropPad: number) {
    if (isRestoringHistoryRef.current) return;
    const entry: ModalHistoryEntry = {
      boxes: nextBoxes.map(b => ({
        id: b.id,
        name: b.name,
        color: b.color,
        center: { ...b.center },
        widthM: b.widthM,
        heightM: b.heightM,
        rotationAngle: b.rotationAngle,
      })),
      activeBoxId: nextActiveId,
      cropPaddingM: nextCropPad,
    };
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, entry].slice(-40);
    });
    setHistoryIndex(prev => prev + 1);
  }

  function handleUndo() {
    if (historyIndex <= 0) return;
    const targetIdx = historyIndex - 1;
    setHistoryIndex(targetIdx);
    restoreHistoryEntry(history[targetIdx]);
  }

  function handleRedo() {
    if (historyIndex >= history.length - 1) return;
    const targetIdx = historyIndex + 1;
    setHistoryIndex(targetIdx);
    restoreHistoryEntry(history[targetIdx]);
  }

  function restoreHistoryEntry(entry: ModalHistoryEntry) {
    const win = window as any;
    if (!mapInstance || !win.google?.maps || !entry) return;
    isRestoringHistoryRef.current = true;

    const entryIds = new Set(entry.boxes.map(b => b.id));

    // Remove polygons of boxes that do not exist in entry
    boxesRef.current.forEach(b => {
      if (!entryIds.has(b.id) && b.poly) {
        b.poly.setMap(null);
      }
    });

    // Reconstruct boxes
    const nextBoxes: RoofBox[] = entry.boxes.map(b => {
      const existing = boxesRef.current.find(eb => eb.id === b.id);
      let poly = existing?.poly;
      const coords = computeStrict90BoxCoords(b.center, b.widthM, b.heightM, b.rotationAngle);

      if (poly) {
        poly.setMap(mapInstance);
        poly.setPath(coords);
        poly.setOptions({
          strokeColor: b.color,
          fillColor: b.color,
          strokeWeight: b.id === entry.activeBoxId ? 3.5 : 2,
          strokeOpacity: b.id === entry.activeBoxId ? 1.0 : 0.75,
          fillOpacity: b.id === entry.activeBoxId ? 0.32 : 0.15,
          zIndex: b.id === entry.activeBoxId ? 100 : 10,
        });
      } else {
        const tempBox: RoofBox = {
          id: b.id,
          name: b.name,
          color: b.color,
          center: b.center,
          widthM: b.widthM,
          heightM: b.heightM,
          rotationAngle: b.rotationAngle,
        };
        poly = createPolygonForBox(mapInstance, tempBox);
      }

      return {
        id: b.id,
        name: b.name,
        color: b.color,
        center: b.center,
        widthM: b.widthM,
        heightM: b.heightM,
        rotationAngle: b.rotationAngle,
        poly,
      };
    });

    boxesRef.current = nextBoxes;
    setBoxes(nextBoxes);
    activeBoxIdRef.current = entry.activeBoxId;
    setActiveBoxId(entry.activeBoxId);
    setCropPaddingM(entry.cropPaddingM);

    const activeB = nextBoxes.find(b => b.id === entry.activeBoxId) || nextBoxes[0] || null;
    syncHandlesForActiveBox(activeB);
    syncCropBoundary();

    isRestoringHistoryRef.current = false;
  }

  // Update a specific box by ID (fixes multi-box stale closure bug!)
  function updateBoxProps(boxId: string, updates: Partial<Pick<RoofBox, "widthM" | "heightM" | "rotationAngle">>) {
    const curBox = boxesRef.current.find(b => b.id === boxId);
    if (!curBox || !curBox.poly) return;
    const nextW = updates.widthM ?? curBox.widthM;
    const nextH = updates.heightM ?? curBox.heightM;
    const nextAngle = updates.rotationAngle !== undefined ? ((updates.rotationAngle % 360) + 360) % 360 : curBox.rotationAngle;

    const coords = computeStrict90BoxCoords(curBox.center, nextW, nextH, nextAngle);
    curBox.poly.setPath(coords);

    const updatedBox: RoofBox = {
      ...curBox,
      widthM: nextW,
      heightM: nextH,
      rotationAngle: nextAngle,
    };

    setBoxes(prev => prev.map(b => b.id === boxId ? updatedBox : b));
    boxesRef.current = boxesRef.current.map(b => b.id === boxId ? updatedBox : b);

    if (boxId === activeBoxIdRef.current) {
      syncHandlesForActiveBox(updatedBox);
    }
    syncCropBoundary();
  }

    // Keyboard Undo (Ctrl+Z) & Redo (Ctrl+Y) Listener
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) return;

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
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, historyIndex, history]);

  // Update active box dimensions or rotation
  function updateActiveBoxProps(updates: Partial<Pick<RoofBox, "widthM" | "heightM" | "rotationAngle">>) {
    updateBoxProps(activeBoxIdRef.current, updates);
  }

  function rotateActiveBoxBy(deltaDeg: number) {
    const curBox = boxesRef.current.find(b => b.id === activeBoxIdRef.current);
    if (!curBox) return;
    const nextRot = curBox.rotationAngle + deltaDeg;
    updateActiveBoxProps({ rotationAngle: nextRot });
    pushModalHistory(boxesRef.current, activeBoxIdRef.current, cropPaddingM);
  }

  // Add new box (e.g. for small roofs)
  function handleAddBox() {
    if (!mapInstance) return;
    const count = boxes.length;
    const letter = String.fromCharCode(65 + count);
    const color = SHAPE_PALETTE[count % SHAPE_PALETTE.length];
    const newId = `box-${Date.now()}`;

    // Place slightly below the last/active box
    const ref = activeBox || boxes[boxes.length - 1];
    let newCenter = { ...centerCoords };
    const newW = count === 1 ? 18 : (ref?.widthM || 18);
    const newH = count === 1 ? 22 : (ref?.heightM || 22);
    const newRot = ref?.rotationAngle ?? 24;

    if (ref) {
      const shiftDistM = (ref.heightM / 2 + newH / 2 + 5);
      const rad = (newRot * Math.PI) / 180;
      // Direction perpendicular to top edge
      const dEast = shiftDistM * Math.sin(rad);
      const dNorth = -shiftDistM * Math.cos(rad);
      const cosLat = Math.cos((ref.center.lat * Math.PI) / 180);

      newCenter = {
        lat: ref.center.lat + dNorth / M_PER_DEG_LAT,
        lng: ref.center.lng + dEast / (M_PER_DEG_LAT * cosLat),
      };
    }

    const newBox: RoofBox = {
      id: newId,
      name: `Box ${letter} (${newW}m × ${newH}m)`,
      color,
      center: newCenter,
      widthM: newW,
      heightM: newH,
      rotationAngle: newRot,
    };

    const poly = createPolygonForBox(mapInstance, newBox);
    newBox.poly = poly;

    const nextBoxes = [...boxesRef.current, newBox];
    boxesRef.current = nextBoxes;
    setBoxes(nextBoxes);
    activeBoxIdRef.current = newId;
    setActiveBoxId(newId);
    syncHandlesForActiveBox(newBox);
    syncCropBoundary();
    pushModalHistory(nextBoxes, newId, cropPaddingM);
  }

  function handleDeleteBox(id: string) {
    if (boxes.length <= 1) return;
    const target = boxes.find(b => b.id === id);
    if (target?.poly) {
      target.poly.setMap(null);
    }
    const remaining = boxes.filter(b => b.id !== id);
    boxesRef.current = remaining;
    setBoxes(remaining);
    const nextActiveId = activeBoxIdRef.current === id ? (remaining[0]?.id || "") : activeBoxIdRef.current;
    activeBoxIdRef.current = nextActiveId;
    setActiveBoxId(nextActiveId);
    const nextActive = remaining.find(b => b.id === nextActiveId) || null;
    syncHandlesForActiveBox(nextActive);
    syncCropBoundary();
    pushModalHistory(remaining, nextActiveId, cropPaddingM);
  }

  // Apply to PV Layout 2D Canvas
  async function handleApply() {
    setApplying(true);
    setErrorMsg("");

    try {
      if (boxes.length === 0) throw new Error("Belum ada box atap yang dibuat");

      // 1. Gather all corner LatLngs across all boxes
      const allCorners: Array<{ lat: number; lng: number }> = [];
      const boxCornersList: Array<{ box: RoofBox; corners: Array<{ lat: number; lng: number }> }> = [];

      for (const b of boxes) {
        if (!b.poly) continue;
        const path = b.poly.getPath();
        const corners: Array<{ lat: number; lng: number }> = [];
        for (let i = 0; i < path.getLength(); i++) {
          const pt = path.getAt(i);
          const c = { lat: pt.lat(), lng: pt.lng() };
          corners.push(c);
          allCorners.push(c);
        }
        boxCornersList.push({ box: b, corners });
      }

      if (allCorners.length === 0) throw new Error("Data sudut box belum lengkap");

      // 2. Compute overall site center
      const minLat = Math.min(...allCorners.map(c => c.lat));
      const maxLat = Math.max(...allCorners.map(c => c.lat));
      const minLng = Math.min(...allCorners.map(c => c.lng));
      const maxLng = Math.max(...allCorners.map(c => c.lng));
      const siteCenterLat = (minLat + maxLat) / 2;
      const siteCenterLng = (minLng + maxLng) / 2;

      // Primary rotation angle (orient the 2D CAD canvas so roofs become horizontal)
      const primaryAngle = boxes[0]?.rotationAngle ?? 24;
      const rad = (primaryAngle * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const cosLat = Math.cos((siteCenterLat * Math.PI) / 180);
      const mLng = M_PER_DEG_LAT * cosLat;

      // 3. Un-rotate all corners by primaryAngle into CAD metric coordinates
      // rx: along building length (horizontal X on screen)
      // ry: across building width (vertical Y on screen)
      const projectedBoxes = boxCornersList.map(({ box, corners }) => {
        const localCorners = corners.map(pt => {
          const dEast = (pt.lng - siteCenterLng) * mLng;
          const dNorth = (pt.lat - siteCenterLat) * M_PER_DEG_LAT;
          const rx = dEast * cosA + dNorth * sinA;
          const ry = -dEast * sinA + dNorth * cosA;
          return { rx, ry };
        });
        return { box, localCorners };
      });

      // 4. Calculate unified bounding box of ALL boxes combined
      let minRx = Infinity, maxRx = -Infinity, minRy = Infinity, maxRy = -Infinity;
      projectedBoxes.forEach(({ localCorners }) => {
        localCorners.forEach(pt => {
          if (pt.rx < minRx) minRx = pt.rx;
          if (pt.rx > maxRx) maxRx = pt.rx;
          if (pt.ry < minRy) minRy = pt.ry;
          if (pt.ry > maxRy) maxRy = pt.ry;
        });
      });

      // Use custom cropPaddingM for margin around site
      const padM = cropPaddingM;
      const siteWidthM = Math.max(20, (maxRx - minRx) + padM * 2);
      const siteHeightM = Math.max(15, (maxRy - minRy) + padM * 2);
      const siteWidthMm = Math.round(siteWidthM * 1000);
      const siteHeightMm = Math.round(siteHeightM * 1000);

      // 5. Build strict 90-degree rectangle segments in millimeter coordinates for 2D CAD
      const segmentsData: BoxSegmentData[] = projectedBoxes.map(({ box, localCorners }, idx) => {
        const polygonCornersMm = localCorners.map(pt => ({
          x: Math.round((pt.rx - minRx + padM) * 1000),
          y: Math.round((maxRy - pt.ry + padM) * 1000), // Invert Y for screen
        }));
        return {
          id: `seg-${idx + 1}-${Date.now()}`,
          name: `Segment ${String.fromCharCode(65 + idx)} (${box.widthM}m × ${box.heightM}m)`,
          color: box.color,
          polygonCornersMm,
          widthM: box.widthM,
          heightM: box.heightM,
          areaM2: Math.round(box.widthM * box.heightM),
          rotationDeg: box.rotationAngle,
        };
      });

      // 6. Calculate optimal Google Static Map to encompass all boxes
      const maxDimM = Math.max(siteWidthM, siteHeightM);
      const targetPx = 1100;
      const val = (targetPx * 156543.03392 * cosLat) / Math.max(10, maxDimM);
      const targetZoom = Math.min(21, Math.max(14, Math.floor(Math.log2(val))));
      const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${siteCenterLat},${siteCenterLng}&zoom=${targetZoom}&size=640x640&scale=2&maptype=satellite&key=${apiKey}`;

      const imageSpanM = (640 * 156543.03392 * cosLat) / Math.pow(2, targetZoom);

      onApply({
        widthMm: siteWidthMm,
        heightMm: siteHeightMm,
        imageSrc: staticUrl,
        imageSpanM: Math.round(imageSpanM),
        coordinates: { lat: siteCenterLat, lng: siteCenterLng },
        address: searchAddress || `Kompleks Atap PLTS (${siteCenterLat.toFixed(4)}, ${siteCenterLng.toFixed(4)})`,
        polygonPoints: allCorners,
        polygonCornersMm: segmentsData[0]?.polygonCornersMm,
        rotationDeg: Math.round(primaryAngle),
        segmentsData,
        boxes: boxes.map(b => ({
          id: b.id,
          name: b.name,
          color: b.color,
          center: b.center,
          widthM: b.widthM,
          heightM: b.heightM,
          rotationAngle: b.rotationAngle,
        })),
        cropPaddingM,
      });

      onClose();
    } catch (err: any) {
      console.error("Gagal menerapkan box atap:", err);
      setErrorMsg(`Gagal menerapkan box atap: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      setApplying(false);
    }
  }

  if (!isOpen) return null;

  const totalAreaM2 = boxes.reduce((sum, b) => sum + Math.round(b.widthM * b.heightM), 0);
  const approxTotalPanels = Math.floor((totalAreaM2 * 0.65) / 2.58);
  const approxTotalKwp = Math.round((approxTotalPanels * 580) / 1000);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100000, padding: 16 }}>
      <div
        className="modal-card"
        style={{
          maxWidth: 1200,
          width: "96vw",
          height: "94vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          border: "1px solid #364b38",
          background: "#111713",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderBottom: "1px solid #243527",
            background: "#162019",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "#223824",
                color: "var(--green, #b8f36b)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Layers size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#edf5ef" }}>
                  🛰️ Google Maps Scanner — Presisi Box 90° & Multi-Atap
                </h2>
                <span
                  style={{
                    background: "#1e3825",
                    color: "#b8f36b",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid #2f5637",
                  }}
                >
                  Strict 90° Rectangle
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--muted, #93a69a)" }}>
                Setiap atap dikunci <strong>persegi panjang 90° presisi</strong>. Modul PV otomatis tersusun rapi searah derajat kemiringan box.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            style={{ width: 32, height: 32, padding: 0 }}
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Search, Active Box Controls, Rotation, Add Box */}
        <div
          style={{
            padding: "8px 20px",
            background: "#121b14",
            borderBottom: "1px solid #202d23",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {/* Autocomplete Search Input */}
          <div
            ref={searchContainerRef}
            style={{
              position: "relative",
              flex: "1 1 260px",
              minWidth: 240,
              maxWidth: 420,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#0c120e",
                border: "1px solid #223528",
                borderRadius: 6,
                padding: "5px 10px",
              }}
            >
              <Search size={14} style={{ color: "#7b9181", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cari lokasi, kota, kawasan industri..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#edf5ef",
                  fontSize: 12,
                  width: "100%",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ background: "transparent", border: "none", color: "#6c8072", cursor: "pointer", padding: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Undo / Redo Buttons */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                height: 27,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: historyIndex > 0 ? "#19281d" : "#0d140f",
                border: "1px solid " + (historyIndex > 0 ? "#2f5238" : "#1a261d"),
                color: historyIndex > 0 ? "#edf5ef" : "#495a4e",
                cursor: historyIndex > 0 ? "pointer" : "default",
                borderRadius: 5,
              }}
              title="Undo perubahan box (Ctrl+Z)"
            >
              <Undo2 size={12} /> Undo
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                height: 27,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: historyIndex < history.length - 1 ? "#19281d" : "#0d140f",
                border: "1px solid " + (historyIndex < history.length - 1 ? "#2f5238" : "#1a261d"),
                color: historyIndex < history.length - 1 ? "#edf5ef" : "#495a4e",
                cursor: historyIndex < history.length - 1 ? "pointer" : "default",
                borderRadius: 5,
              }}
              title="Redo perubahan box (Ctrl+Y)"
            >
              <Redo2 size={12} /> Redo
            </button>
          </div>

          {/* Active Box Size Controls */}
          {activeBox && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0c140f", padding: "4px 10px", borderRadius: 6, border: "1px solid #233829" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: activeBox.color }}>
                {activeBox.name}:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#8aa092" }}>Panjang (m):</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeBox.widthM}
                  onChange={e => updateActiveBoxProps({ widthM: Math.max(3, Number(e.target.value)) })}
                  style={{ width: 55, background: "#162319", border: "1px solid #284430", color: "#edf5ef", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#8aa092" }}>Lebar (m):</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeBox.heightM}
                  onChange={e => updateActiveBoxProps({ heightM: Math.max(3, Number(e.target.value)) })}
                  style={{ width: 55, background: "#162319", border: "1px solid #284430", color: "#edf5ef", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}
                />
              </div>
            </div>
          )}

          {/* Quick Rotation Buttons */}
          {activeBox && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#7a8a7f", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <Compass size={12} /> Rotasi:
              </span>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
                onClick={() => rotateActiveBoxBy(-15)}
                title="Putar -15 derajat"
              >
                <RotateCcw size={11} /> 15°
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
                onClick={() => rotateActiveBoxBy(-5)}
                title="Putar -5 derajat"
              >
                <RotateCcw size={11} /> 5°
              </button>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <input
                  type="number"
                  min="0"
                  max="360"
                  step="1"
                  value={activeBox.rotationAngle}
                  onChange={e => updateActiveBoxProps({ rotationAngle: Number(e.target.value) })}
                  style={{
                    width: 58,
                    background: "#162319",
                    border: "1.5px solid var(--green, #b8f36b)",
                    borderRadius: 4,
                    padding: "2px 4px",
                    color: "var(--green, #b8f36b)",
                    fontSize: 12,
                    fontWeight: 800,
                    textAlign: "center",
                    outline: "none",
                  }}
                  title="Ketik manual sudut rotasi (misal 334 atau 24)"
                />
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--green, #b8f36b)" }}>°</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
                onClick={() => rotateActiveBoxBy(5)}
                title="Putar +5 derajat"
              >
                <RotateCw size={11} /> 5°
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
                onClick={() => rotateActiveBoxBy(15)}
                title="Putar +15 derajat"
              >
                <RotateCw size={11} /> 15°
              </button>
            </div>
          )}

          {/* Custom Crop Area Size / Padding Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0c140f", padding: "4px 10px", borderRadius: 6, border: "1px solid #233829" }}>
            <span style={{ fontSize: 11, color: "#8aa092", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
              <Crop size={12} style={{ color: "#22c55e" }} /> Margin Crop:
            </span>
            <input
              type="number"
              min="0"
              max="200"
              step="5"
              value={cropPaddingM}
              onChange={e => setCropPaddingM(Math.max(0, Number(e.target.value)))}
              style={{ width: 46, background: "#162319", border: "1px solid #284430", color: "#22c55e", fontSize: 11, fontWeight: 800, padding: "2px 4px", borderRadius: 4, textAlign: "center" }}
              title="Margin area crop di sekeliling atap (meter)"
            />
            <span style={{ fontSize: 10, color: "#8aa092" }}>m</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[5, 10, 20, 40].map(pad => (
                <button
                  key={pad}
                  type="button"
                  onClick={() => setCropPaddingM(pad)}
                  style={{
                    background: cropPaddingM === pad ? "#1f3a25" : "#141e16",
                    border: "1px solid " + (cropPaddingM === pad ? "#4ade80" : "#28392c"),
                    color: cropPaddingM === pad ? "#b8f36b" : "#8aa092",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  title={`Set margin crop ${pad} meter`}
                >
                  +{pad}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Multi-Box Chips Bar */}
        <div
          style={{
            padding: "8px 20px",
            background: "#0c1510",
            borderBottom: "1px solid #1c2a1f",
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8da294", whiteSpace: "nowrap" }}>
            Daftar Box Atap ({boxes.length}):
          </span>

          {boxes.map((b, idx) => (
            <div
              key={b.id}
              onClick={() => {
                activeBoxIdRef.current = b.id;
                setActiveBoxId(b.id);
                const cur = boxesRef.current.find(box => box.id === b.id);
                syncHandlesForActiveBox(cur || b);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                background: b.id === activeBoxId ? "#1a2f21" : "#121b15",
                border: `1.5px solid ${b.id === activeBoxId ? b.color : "#273a2c"}`,
                color: b.id === activeBoxId ? "#ffffff" : "#99aba0",
                fontSize: 11,
                fontWeight: b.id === activeBoxId ? 800 : 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }} />
              <span>{b.name} ({b.widthM}m × {b.heightM}m)</span>
              {boxes.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleDeleteBox(b.id); }}
                  style={{ marginLeft: 3, color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                  title="Hapus box atap ini"
                >
                  ×
                </span>
              )}
            </div>
          ))}

          {/* Button + Tambah Box Atap */}
          <button
            type="button"
            onClick={handleAddBox}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 6,
              background: "var(--green, #b8f36b)",
              color: "#0a150d",
              border: "none",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(184, 243, 107, 0.25)",
            }}
          >
            <Plus size={13} /> Tambah Box Atap ({String.fromCharCode(65 + boxes.length)})
          </button>
        </div>

        {/* Google Maps Container */}
        <div style={{ flex: 1, position: "relative", minHeight: 400 }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#080e0acc",
                display: "grid",
                placeItems: "center",
                color: "var(--green, #b8f36b)",
                fontSize: 13,
                fontWeight: 700,
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <RefreshCw size={18} className="animate-spin" /> Memuat Google Maps...
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                right: 16,
                background: "#3b1616f0",
                color: "#fecaca",
                border: "1px solid #7f1d1d",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 12,
                zIndex: 20,
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Floating Bottom Bar: Multi-Box Metrics & Apply */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              right: 16,
              zIndex: 5,
              background: "#131c15f0",
              backdropFilter: "blur(8px)",
              border: "1px solid #2f4533",
              borderRadius: 10,
              padding: "10px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              boxShadow: "0 10px 30px #00000088",
            }}
          >
            {/* Aggregate Stats */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9.5, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Total Box Atap
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--green, #b8f36b)" }}>
                  {boxes.length} Box (90° Presisi)
                </div>
              </div>

              <div style={{ borderLeft: "1px solid #2b3d30", height: 26 }} />

              <div>
                <div style={{ fontSize: 9.5, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Total Luas Atap
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#edf5ef" }}>
                  {totalAreaM2.toLocaleString()} m²
                </div>
              </div>

              <div style={{ borderLeft: "1px solid #2b3d30", height: 26 }} />

              <div>
                <div style={{ fontSize: 9.5, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Est. Kapasitas Total
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green, #b8f36b)" }}>
                  ~{approxTotalKwp} kWp{" "}
                  <small style={{ fontSize: 10.5, color: "#93a69a" }}>({approxTotalPanels} panel)</small>
                </div>
              </div>

              <div style={{ borderLeft: "1px solid #2b3d30", height: 26 }} />

              <div>
                <div style={{ fontSize: 9.5, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Orientasi Box Aktif
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    step="1"
                    value={activeBox?.rotationAngle ?? 24}
                    onChange={e => updateActiveBoxProps({ rotationAngle: Number(e.target.value) })}
                    style={{
                      width: 54,
                      background: "#162319",
                      border: "1px solid #36553e",
                      borderRadius: 4,
                      padding: "2px 4px",
                      color: activeBox?.color || "var(--green, #b8f36b)",
                      fontSize: 13,
                      fontWeight: 800,
                      textAlign: "center",
                      outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 800, color: activeBox?.color || "var(--green, #b8f36b)" }}>°</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="primary-button"
                style={{ fontSize: 12, padding: "9px 18px", fontWeight: 800, background: "var(--green, #b8f36b)", color: "#0a150d" }}
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Terapkan ke Layout Atap ({boxes.length} Box)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Guidance */}
        <div
          style={{
            padding: "8px 20px",
            background: "#111813",
            borderTop: "1px solid #1e2c21",
            fontSize: 11,
            color: "#839589",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            🎨 <strong>Canva-Style Editing:</strong> Tarik <strong>4 sudut putih</strong> dengan mouse untuk resize panjang/lebar • Tarik <strong>knob ↺ hijau</strong> di atas box untuk memutar rotasi • Kotak hijau garis-putus menunjukkan <strong>area crop peta</strong> yang akan diekspor.
          </span>
          <span style={{ color: "#5d7063", whiteSpace: "nowrap" }}>
            Lat: {centerCoords.lat.toFixed(5)}, Lng: {centerCoords.lng.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}
