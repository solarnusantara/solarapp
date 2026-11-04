import { useEffect, useRef, useState } from "react";
import {
  X,
  Search,
  MapPin,
  Maximize2,
  Check,
  RefreshCw,
  Layers,
  Zap,
  Sparkles,
  SunMedium,
  RotateCw,
  RotateCcw,
  Compass,
} from "lucide-react";
import { fetchGoogleSolarInsights } from "./gisSolarService";
import type { GoogleSolarInsights } from "./gisSolarService";

interface GoogleMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
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
    googleSolarData?: GoogleSolarInsights;
  }) => void;
  initialWidthMm?: number;
  initialHeightMm?: number;
  initialPolygonPoints?: Array<{ lat: number; lng: number }>;
}

const DEFAULT_API_KEY = "AIzaSyC6TAjg7EBuCmkaWRwl-ih0PQ_Be07rc3o";

// Presets kawasan industri terkemuka di Indonesia (lokasi atap pabrik PLTS atap)
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

export default function GoogleMapsModal({
  isOpen,
  onClose,
  onApply,
  initialWidthMm = 24000,
  initialHeightMm = 12000,
  initialPolygonPoints,
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
  const [polygon, setPolygon] = useState<any>(null);
  const [searchAddress, setSearchAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [widthM, setWidthM] = useState(initialWidthMm / 1000);
  const [heightM, setHeightM] = useState(initialHeightMm / 1000);
  const [rotationAngle, setRotationAngle] = useState(0); // Degrees 0..360
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: -6.3685,
    lng: 107.1985,
  });

  // 4 Side lengths in meters [top, right, bottom, left]
  const [sideLengths, setSideLengths] = useState<{ top: number; right: number; bottom: number; left: number }>({
    top: initialWidthMm / 1000,
    right: initialHeightMm / 1000,
    bottom: initialWidthMm / 1000,
    left: initialHeightMm / 1000,
  });

  const [computedAreaM2, setComputedAreaM2] = useState<number>(
    Math.round((initialWidthMm / 1000) * (initialHeightMm / 1000))
  );

  // Google Solar API Integration State
  const [solarDetecting, setSolarDetecting] = useState(false);
  const [solarInsights, setSolarInsights] = useState<GoogleSolarInsights | null>(null);
  const [solarStatusMsg, setSolarStatusMsg] = useState<string>("");

  const apiKey = (window as any).GOOGLE_MAPS_API_KEY || DEFAULT_API_KEY;

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
          reject(new Error("Gagal mengunduh script Google Maps. Periksa koneksi internet atau proteksi domain API Key."));
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

  function initMap() {
    const win = window as any;
    if (!mapRef.current || !win.google?.maps) return;

    const defaultLat = centerCoords.lat;
    const defaultLng = centerCoords.lng;

    const map = new win.google.maps.Map(mapRef.current, {
      center: { lat: defaultLat, lng: defaultLng },
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

    // Initial polygon setup: restore previous polygon if available, else setup default box
    if (initialPolygonPoints && initialPolygonPoints.length >= 3) {
      createOrUpdatePolygonFromPoints(map, initialPolygonPoints);
    } else {
      createOrUpdatePolygon(map, { lat: defaultLat, lng: defaultLng }, widthM, heightM, 0);
    }

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

        createOrUpdatePolygon(map, { lat: newLat, lng: newLng }, widthM, heightM, rotationAngle);
        setSearchAddress(place.formatted_address || place.name || "");
        setSolarInsights(null);
        setSolarStatusMsg("");
      });
    }
  }

  /**
   * Helper: compute 4 corner coordinates rotated around center
   * Points order: 0: NW (Top-Left), 1: NE (Top-Right), 2: SE (Bottom-Right), 3: SW (Bottom-Left)
   */
  function computeRotatedBoxCoords(
    center: { lat: number; lng: number },
    wM: number,
    hM: number,
    angleDeg: number,
    topRatio = 1.0 // for trapezoid (< 1.0)
  ) {
    const win = window as any;
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((center.lat * Math.PI) / 180);

    const halfW = wM / 2;
    const halfH = hM / 2;
    const topW = halfW * topRatio;

    // Local metric offsets (x: East, y: North)
    const localOffsets = [
      { x: -topW, y: halfH },   // 0: NW
      { x: topW, y: halfH },    // 1: NE
      { x: halfW, y: -halfH },  // 2: SE
      { x: -halfW, y: -halfH }, // 3: SW
    ];

    return localOffsets.map((pt) => {
      // Rotate locally
      const rx = pt.x * cosA - pt.y * sinA;
      const ry = pt.x * sinA + pt.y * cosA;

      const lat = center.lat + ry / 111111;
      const lng = center.lng + rx / (111111 * cosLat);
      return new win.google.maps.LatLng(lat, lng);
    });
  }

  /**
   * Recalculates metrics (side lengths, area, centroid) whenever vertices are dragged
   */
  function updateMetricsFromPolygonPath(polyInstance: any) {
    const win = window as any;
    if (!polyInstance || !win.google?.maps) return;

    const path = polyInstance.getPath();
    const len = path.getLength();
    if (len < 3) return;

    const spherical = win.google.maps.geometry?.spherical;

    // Centroid
    let sumLat = 0;
    let sumLng = 0;
    for (let i = 0; i < len; i++) {
      const p = path.getAt(i);
      sumLat += p.lat();
      sumLng += p.lng();
    }
    const center = { lat: sumLat / len, lng: sumLng / len };
    setCenterCoords(center);

    // Compute side lengths and area
    if (spherical) {
      const p0 = path.getAt(0);
      const p1 = path.getAt(1);
      const p2 = path.getAt(2);
      const p3 = path.getAt(len >= 4 ? 3 : 2);

      const dTop = spherical.computeDistanceBetween(p0, p1);
      const dRight = spherical.computeDistanceBetween(p1, p2);
      const dBottom = spherical.computeDistanceBetween(p2, p3);
      const dLeft = spherical.computeDistanceBetween(p3, p0);

      const roundTop = Math.round(dTop * 10) / 10;
      const roundRight = Math.round(dRight * 10) / 10;
      const roundBottom = Math.round(dBottom * 10) / 10;
      const roundLeft = Math.round(dLeft * 10) / 10;

      setSideLengths({
        top: roundTop,
        right: roundRight,
        bottom: roundBottom,
        left: roundLeft,
      });

      const avgW = Math.round(((dTop + dBottom) / 2) * 10) / 10;
      const avgH = Math.round(((dLeft + dRight) / 2) * 10) / 10;
      setWidthM(avgW);
      setHeightM(avgH);

      const area = Math.round(spherical.computeArea(path));
      setComputedAreaM2(area);

      // Orientation from top edge
      const heading = (Math.round(spherical.computeHeading(p0, p1)) + 360) % 360;
      // Heading of top edge (East=90 -> angle=0)
      const inferredAngle = (heading - 90 + 360) % 360;
      setRotationAngle(Math.round(inferredAngle));
    } else {
      setComputedAreaM2(Math.round(widthM * heightM));
    }
  }


  // Click outside search container to close recommendations dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search-as-you-type autocomplete recommendation
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const matches: SearchSuggestion[] = [];
        const cleanQ = q.toLowerCase();

        // 1. Presets match
        for (const p of INDUSTRIAL_PRESETS) {
          if (p.name.toLowerCase().includes(cleanQ) || p.region.toLowerCase().includes(cleanQ)) {
            matches.push({
              id: `preset-${p.name}`,
              title: p.name,
              subtitle: `${p.region} · Kawasan Industri`,
              lat: p.lat,
              lng: p.lng,
              source: "preset",
            });
          }
        }

        // 2. OpenStreetMap Nominatim Search (Indonesian coverage: cities, kecamatan, kelurahan, roads)
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=id&addressdetails=1&limit=8`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "Accept-Language": "id,en" },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const item of data) {
              const lat = parseFloat(item.lat);
              const lng = parseFloat(item.lon);
              if (!isNaN(lat) && !isNaN(lng)) {
                const parts = (item.display_name || "").split(", ");
                const title = parts.slice(0, 2).join(", ");
                const subtitle = parts.slice(2).join(", ");
                const isDup = matches.some(m => Math.abs(m.lat - lat) < 0.005 && Math.abs(m.lng - lng) < 0.005);
                if (!isDup) {
                  matches.push({
                    id: `osm-${item.place_id}`,
                    title: title || item.name || q,
                    subtitle: subtitle || "Indonesia",
                    lat,
                    lng,
                    source: "osm",
                  });
                }
              }
            }
          }
        }

        setSuggestions(matches.slice(0, 8));
        setShowSuggestions(matches.length > 0);
        setSelectedIndex(-1);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Location suggestion fetch warning:", err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  function handleSelectSuggestion(item: SearchSuggestion) {
    const win = window as any;
    if (mapInstance && win.google?.maps) {
      const pos = new win.google.maps.LatLng(item.lat, item.lng);
      mapInstance.panTo(pos);
      mapInstance.setZoom(19);
      setCenterCoords({ lat: item.lat, lng: item.lng });
      createOrUpdatePolygon(mapInstance, { lat: item.lat, lng: item.lng }, widthM, heightM, rotationAngle);
    }
    setSearchQuery(item.title);
    setSearchAddress(`${item.title}, ${item.subtitle}`);
    setShowSuggestions(false);
    setSolarInsights(null);
    setSolarStatusMsg("");
  }

  function handleSearchSubmit() {
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelectSuggestion(suggestions[selectedIndex]);
      return;
    }
    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }

    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=id&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const item = data[0];
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            handleSelectSuggestion({
              id: `direct-${item.place_id}`,
              title: item.display_name.split(",")[0] || q,
              subtitle: item.display_name,
              lat,
              lng,
              source: "osm",
            });
          }
        }
      })
      .catch(e => console.warn("Direct search error:", e))
      .finally(() => setIsSearching(false));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(suggestions.length - 1, prev + 1));
      setShowSuggestions(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSearchSubmit();
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function handleClearSearch() {
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    if (searchInputRef.current) searchInputRef.current.focus();
  }

  function createOrUpdatePolygon(
    map: any,
    center: { lat: number; lng: number },
    wM: number,
    hM: number,
    angleDeg: number,
    topRatio = 1.0
  ) {
    const win = window as any;
    if (!win.google?.maps) return;

    setCenterCoords(center);
    setRotationAngle(angleDeg);

    const coords = computeRotatedBoxCoords(center, wM, hM, angleDeg, topRatio);

    if (polygon) {
      polygon.setPath(coords);
      polygon.setMap(map);
      updateMetricsFromPolygonPath(polygon);
    } else {
      const poly = new win.google.maps.Polygon({
        paths: coords,
        editable: true, // Shows draggable handles at all 4 corners and midpoints
        draggable: true, // Allows dragging whole shape across map
        strokeColor: "#b8f36b",
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: "#14221a",
        fillOpacity: 0.35,
        map: map,
      });

      const path = poly.getPath();
      path.addListener("set_at", () => updateMetricsFromPolygonPath(poly));
      path.addListener("insert_at", () => updateMetricsFromPolygonPath(poly));
      path.addListener("remove_at", () => updateMetricsFromPolygonPath(poly));
      poly.addListener("dragend", () => updateMetricsFromPolygonPath(poly));

      setPolygon(poly);
      updateMetricsFromPolygonPath(poly);
    }
  }

  function createOrUpdatePolygonFromPoints(map: any, points: Array<{ lat: number; lng: number }>) {
    const win = window as any;
    if (!win.google?.maps || !points || points.length < 3) return;

    let sumLat = 0, sumLng = 0;
    points.forEach(p => { sumLat += p.lat; sumLng += p.lng; });
    const center = { lat: sumLat / points.length, lng: sumLng / points.length };
    setCenterCoords(center);

    const coords = points.map(p => new win.google.maps.LatLng(p.lat, p.lng));

    if (polygon) {
      polygon.setPath(coords);
      polygon.setMap(map);
      updateMetricsFromPolygonPath(polygon);
    } else {
      const poly = new win.google.maps.Polygon({
        paths: coords,
        editable: true,
        draggable: true,
        strokeColor: "#b8f36b",
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: "#14221a",
        fillOpacity: 0.35,
        map: map,
      });

      const path = poly.getPath();
      path.addListener("set_at", () => updateMetricsFromPolygonPath(poly));
      path.addListener("insert_at", () => updateMetricsFromPolygonPath(poly));
      path.addListener("remove_at", () => updateMetricsFromPolygonPath(poly));
      poly.addListener("dragend", () => updateMetricsFromPolygonPath(poly));

      setPolygon(poly);
      updateMetricsFromPolygonPath(poly);
    }
    map.setCenter(center);
  }

  /**
   * Rotate polygon vertices around its centroid by deltaDegrees
   */
  function rotatePolygonBy(deltaDeg: number) {
    if (!polygon || !mapInstance) return;
    const win = window as any;
    const path = polygon.getPath();
    const len = path.getLength();
    if (len < 3) return;

    const rad = (deltaDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((centerCoords.lat * Math.PI) / 180);

    const newPath: any[] = [];
    for (let i = 0; i < len; i++) {
      const pt = path.getAt(i);
      const x = (pt.lng() - centerCoords.lng) * 111111 * cosLat;
      const y = (pt.lat() - centerCoords.lat) * 111111;

      const rx = x * cosA - y * sinA;
      const ry = x * sinA + y * cosA;

      const nLat = centerCoords.lat + ry / 111111;
      const nLng = centerCoords.lng + rx / (111111 * cosLat);
      newPath.push(new win.google.maps.LatLng(nLat, nLng));
    }

    polygon.setPath(newPath);
    updateMetricsFromPolygonPath(polygon);
  }

  /**
   * Shape Preset: Perfect Rectangle (Kotak Presisi)
   */
  function handleSetRectangle() {
    if (!mapInstance) return;
    createOrUpdatePolygon(mapInstance, centerCoords, widthM, heightM, rotationAngle, 1.0);
  }

  /**
   * Shape Preset: Trapezoid (Trapesium)
   * Top width is 65% of bottom width
   */
  function handleSetTrapezoid() {
    if (!mapInstance) return;
    createOrUpdatePolygon(mapInstance, centerCoords, widthM, heightM, rotationAngle, 0.65);
  }

  /**
   * Shape Preset: Parallelogram (Jajar Genjang)
   */
  function handleSetParallelogram() {
    if (!polygon || !mapInstance) return;
    const win = window as any;
    const rad = (rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((centerCoords.lat * Math.PI) / 180);

    const halfW = widthM / 2;
    const halfH = heightM / 2;
    const skew = widthM * 0.25;

    const localOffsets = [
      { x: -halfW + skew, y: halfH },  // NW shifted
      { x: halfW + skew, y: halfH },   // NE shifted
      { x: halfW, y: -halfH },         // SE
      { x: -halfW, y: -halfH },        // SW
    ];

    const newPath = localOffsets.map((pt) => {
      const rx = pt.x * cosA - pt.y * sinA;
      const ry = pt.x * sinA + pt.y * cosA;
      const lat = centerCoords.lat + ry / 111111;
      const lng = centerCoords.lng + rx / (111111 * cosLat);
      return new win.google.maps.LatLng(lat, lng);
    });

    polygon.setPath(newPath);
    updateMetricsFromPolygonPath(polygon);
  }

  function handlePresetClick(preset: { name: string; lat: number; lng: number }) {
    if (!mapInstance) return;
    mapInstance.setCenter({ lat: preset.lat, lng: preset.lng });
    mapInstance.setZoom(19);
    createOrUpdatePolygon(mapInstance, { lat: preset.lat, lng: preset.lng }, widthM, heightM, 0);
    setSearchAddress(preset.name);
    setSolarInsights(null);
    setSolarStatusMsg("");
  }

  function handleSwapDimensions() {
    if (!mapInstance) return;
    const newW = heightM;
    const newH = widthM;
    setWidthM(newW);
    setHeightM(newH);
    createOrUpdatePolygon(mapInstance, centerCoords, newW, newH, (rotationAngle + 90) % 360);
  }

  function handleResetToCenter() {
    if (!mapInstance) return;
    const center = mapInstance.getCenter();
    if (!center) return;
    createOrUpdatePolygon(mapInstance, { lat: center.lat(), lng: center.lng() }, widthM, heightM, rotationAngle);
  }

  /**
   * Auto-Detect Roof Geometry & Solar Potential via Google Solar API
   */
  async function handleAutoDetectGoogleSolar() {
    if (!apiKey) return;
    setSolarDetecting(true);
    setSolarStatusMsg("Menghubungi Google Solar API (kualitas BASE)...");

    try {
      const insights = await fetchGoogleSolarInsights(centerCoords.lat, centerCoords.lng, apiKey);
      if (insights.available && insights.boundingBoxM) {
        setSolarInsights(insights);
        const newW = Math.max(10, insights.boundingBoxM.widthM);
        const newH = Math.max(10, insights.boundingBoxM.heightM);
        setWidthM(newW);
        setHeightM(newH);

        const targetCenter = insights.center
          ? { lat: insights.center.lat, lng: insights.center.lng }
          : centerCoords;
        setCenterCoords(targetCenter);

        const detectedAzimuth = insights.azimuthDegrees || 0;

        if (mapInstance) {
          mapInstance.setCenter(targetCenter);
          createOrUpdatePolygon(mapInstance, targetCenter, newW, newH, (detectedAzimuth - 90 + 360) % 360);
        }

        setSolarStatusMsg(
          `✅ Atap terdeteksi via Google Solar! Luas ${insights.roofAreaM2} m² · Kemiringan ${insights.pitchDegrees}° · Azimuth ${insights.azimuthDegrees}° · Potensi maks ${insights.maxPanels} panel.`
        );
      } else {
        setSolarInsights(null);
        setSolarStatusMsg(
          `ℹ️ ${insights.error || "Poligon atap spesifik belum tersedia di titik ini. Silakan sesuaikan titik sudut secara manual."}`
        );
      }
    } catch (err: any) {
      setSolarInsights(null);
      setSolarStatusMsg(`Gagal mendeteksi via Google Solar: ${err?.message || "Kesalahan koneksi"}`);
    } finally {
      setSolarDetecting(false);
    }
  }

  function getCurrentPolygonPoints(): Array<{ lat: number; lng: number }> {
    if (!polygon) return [];
    const path = polygon.getPath();
    const pts: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      pts.push({ lat: path.getAt(i).lat(), lng: path.getAt(i).lng() });
    }
    return pts;
  }

  /**
   * Computes polygon corners projected into local millimeter coordinates [0..widthMm, 0..heightMm].
   * The coordinates are un-rotated by the polygon orientation so that the shape sits aligned
   * with the 2D CAD canvas axes, with (0,0) as top-left of the bounding box.
   */
  function computeLocalCornersMm(): {
    corners: Array<{ x: number; y: number }>;
    widthMm: number;
    heightMm: number;
  } {
    if (!polygon) {
      const w = Math.round(widthM * 1000);
      const h = Math.round(heightM * 1000);
      return {
        corners: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        widthMm: w,
        heightMm: h,
      };
    }
    const path = polygon.getPath();
    const len = path.getLength();
    if (len < 3) {
      const w = Math.round(widthM * 1000);
      const h = Math.round(heightM * 1000);
      return {
        corners: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        widthMm: w,
        heightMm: h,
      };
    }

    const rad = (rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosLat = Math.cos((centerCoords.lat * Math.PI) / 180);

    const localPoints: Array<{ x: number; y: number }> = [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < len; i++) {
      const pt = path.getAt(i);
      const dEast = (pt.lng() - centerCoords.lng) * 111111 * cosLat;
      const dNorth = (pt.lat() - centerCoords.lat) * 111111;

      // Inverse rotate to align with principal axis
      const lx = dEast * cosA + dNorth * sinA;
      const ly = -dEast * sinA + dNorth * cosA;

      localPoints.push({ x: lx, y: ly });
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
    }

    const wMm = Math.max(1000, Math.round((maxX - minX) * 1000));
    const hMm = Math.max(1000, Math.round((maxY - minY) * 1000));

    // Map to canvas mm coordinates where (0,0) is top-left, X is right, Y is down
    const corners = localPoints.map(p => ({
      x: Math.round((p.x - minX) * 1000),
      y: Math.round((maxY - p.y) * 1000),
    }));

    return { corners, widthMm: wMm, heightMm: hMm };
  }

  async function handleApply() {
    setApplying(true);
    setErrorMsg("");

    try {
      const lat = centerCoords.lat;
      const lng = centerCoords.lng;
      const local = computeLocalCornersMm();
      const wMm = local.widthMm;
      const hMm = local.heightMm;
      const wM = wMm / 1000;
      const hM = hMm / 1000;

      // Kalkulasi optimal zoom untuk Static Map (maks 1100px dari 1280px)
      const maxDim = Math.max(wM, hM);
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const targetPx = 1100;
      const val = (targetPx * 156543.03392 * cosLat) / Math.max(10, maxDim);
      const targetZoom = Math.min(21, Math.max(14, Math.floor(Math.log2(val))));

      // URL Google Static Map
      const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${targetZoom}&size=640x640&scale=2&maptype=satellite&key=${apiKey}`;

      let croppedDataUrl = "";
      try {
        const resp = await fetch(staticUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const img = new Image();
          const blobUrl = URL.createObjectURL(blob);

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Gagal membaca hasil citra satelit"));
            img.src = blobUrl;
          });

          const res = (156543.03392 * cosLat) / Math.pow(2, targetZoom);
          const cropW = Math.min(1280, Math.max(20, Math.round(wM / res)));
          const cropH = Math.min(1280, Math.max(20, Math.round(hM / res)));
          const cropX = Math.max(0, Math.round(640 - cropW / 2));
          const cropY = Math.max(0, Math.round(640 - cropH / 2));

          const offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = cropW;
          offscreenCanvas.height = cropH;
          const ctx = offscreenCanvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            croppedDataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.86);
          }
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        console.warn("Static Map fetch failed (likely referrer restriction), continuing with dimensions only:", e);
      }

      onApply({
        widthMm: wMm,
        heightMm: hMm,
        imageSrc: croppedDataUrl,
        coordinates: { lat, lng },
        address: searchAddress || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        polygonPoints: getCurrentPolygonPoints(),
        polygonCornersMm: local.corners,
        rotationDeg: Math.round(rotationAngle),
        pitchDegrees: solarInsights?.pitchDegrees,
        azimuthDegrees: solarInsights?.azimuthDegrees,
        googleSolarData: solarInsights || undefined,
      });

      onClose();
    } catch (err: any) {
      console.error("Gagal memproses citra satelit:", err);
      setErrorMsg(`Gagal memuat citra satelit: ${err.message}. Tetap terapkan ukuran atap?`);
    } finally {
      setApplying(false);
    }
  }

  function handleApplyDimensionsOnly() {
    const local = computeLocalCornersMm();
    onApply({
      widthMm: local.widthMm,
      heightMm: local.heightMm,
      imageSrc: "",
      coordinates: centerCoords,
      address: searchAddress || `Koordinat (${centerCoords.lat.toFixed(4)}, ${centerCoords.lng.toFixed(4)})`,
      polygonPoints: getCurrentPolygonPoints(),
      polygonCornersMm: local.corners,
      rotationDeg: Math.round(rotationAngle),
      pitchDegrees: solarInsights?.pitchDegrees,
      azimuthDegrees: solarInsights?.azimuthDegrees,
      googleSolarData: solarInsights || undefined,
    });
    onClose();
  }

  if (!isOpen) return null;

  const areaM2 = computedAreaM2;
  const approxPanels = solarInsights?.maxPanels || Math.floor((areaM2 * 0.65) / 2.58);
  const approxKwp = Math.round((approxPanels * 580) / 1000);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100000, padding: 16 }}>
      <div
        className="modal-card"
        style={{
          maxWidth: 1180,
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
            padding: "14px 20px",
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
                  🛰️ Google Maps Satellite Scanner — Poligon 4-Titik & Rotasi
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
                  Rotatable & Custom Quad
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--muted, #93a69a)" }}>
                Tarik 4 titik sudut bebas (bisa jadi <strong>Trapesium</strong> atau miring), putar orientasi atap/lahan, atau gunakan deteksi otomatis Google Solar.
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

        {/* Toolbar: Search, Shape Presets, Rotation Controls, and Google Solar Trigger */}
        <div
          style={{
            padding: "10px 20px",
            background: "#121b14",
            borderBottom: "1px solid #202d23",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Autocomplete Input with Google Maps style recommendation dropdown */}
          <div
            ref={searchContainerRef}
            style={{
              position: "relative",
              flex: "1 1 280px",
              minWidth: 260,
              maxWidth: 480,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#0c120e",
                border: showSuggestions && suggestions.length > 0 ? "1px solid var(--green, #b8f36b)" : "1px solid #2a3d2e",
                borderRadius: showSuggestions && suggestions.length > 0 ? "6px 6px 0 0" : 6,
                padding: "6px 12px",
                transition: "border-color 0.15s ease",
              }}
            >
              {isSearching ? (
                <RefreshCw size={14} className="animate-spin" style={{ color: "var(--green, #b8f36b)" }} />
              ) : (
                <Search size={14} style={{ color: "#7a8a7f" }} />
              )}
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Cari lokasi / kecamatan / kawasan (mis. Beji, Cikarang, Karawang)..."
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
                  onClick={handleClearSearch}
                  className="icon-button"
                  style={{
                    padding: 2,
                    width: 20,
                    height: 20,
                    border: "none",
                    background: "transparent",
                    color: "#839589",
                  }}
                  title="Hapus pencarian"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={handleSearchSubmit}
                style={{
                  background: "#1c2b1e",
                  border: "1px solid #2e4431",
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  color: "#b8f36b",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="Cari lokasi sekarang"
              >
                Cari
              </button>
            </div>

            {/* Suggestions Popup Menu */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="search-suggestions-dropdown">
                <div
                  style={{
                    padding: "6px 12px",
                    fontSize: 10,
                    color: "#7e9284",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    borderBottom: "1px solid #1f2d22",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Rekomendasi Lokasi</span>
                  <span style={{ fontSize: 9, color: "#5a6b5f" }}>Gunakan ↑ ↓ dan Enter</span>
                </div>
                {suggestions.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`search-suggestion-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelectSuggestion(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <MapPin
                        size={15}
                        style={{
                          color: item.source === "preset" ? "#b8f36b" : "#89b98d",
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="search-suggestion-title">{item.title}</div>
                        <div className="search-suggestion-subtitle">{item.subtitle}</div>
                      </div>
                      <span className="search-suggestion-badge">
                        {item.source === "preset" ? "Kawasan Industri" : "Lokasi"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shape Presets */}
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#7a8a7f", fontWeight: 600 }}>Bentuk:</span>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 8px", fontSize: 11, height: 26 }}
              onClick={handleSetRectangle}
              title="Reset bentuk menjadi persegi panjang presisi"
            >
              📐 Kotak
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 8px", fontSize: 11, height: 26 }}
              onClick={handleSetTrapezoid}
              title="Bentuk Trapesium simetris (sisi atas lebih pendek)"
            >
              🔺 Trapesium
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 8px", fontSize: 11, height: 26 }}
              onClick={handleSetParallelogram}
              title="Bentuk Jajar Genjang miring"
            >
              🔷 Jajar Genjang
            </button>
          </div>

          {/* Quick Rotation Buttons */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#7a8a7f", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Compass size={12} /> Rotasi:
            </span>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 7px", fontSize: 11, height: 26 }}
              onClick={() => rotatePolygonBy(-15)}
              title="Putar -15 derajat (berlawanan jarum jam)"
            >
              <RotateCcw size={11} /> 15°
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
              onClick={() => rotatePolygonBy(-5)}
              title="Putar -5 derajat"
            >
              <RotateCcw size={11} /> 5°
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #b8f36b)", minWidth: 32, textAlign: "center" }}>
              {rotationAngle}°
            </span>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 6px", fontSize: 11, height: 26 }}
              onClick={() => rotatePolygonBy(5)}
              title="Putar +5 derajat (searah jarum jam)"
            >
              <RotateCw size={11} /> 5°
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 7px", fontSize: 11, height: 26 }}
              onClick={() => rotatePolygonBy(15)}
              title="Putar +15 derajat"
            >
              <RotateCw size={11} /> 15°
            </button>
          </div>

          {/* Google Solar Auto-Detect Button */}
          <button
            type="button"
            onClick={handleAutoDetectGoogleSolar}
            disabled={solarDetecting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: solarDetecting ? "#1a2c20" : "linear-gradient(135deg, #1d402b 0%, #173322 100%)",
              border: "1px solid #366d47",
              color: "#b8f36b",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: solarDetecting ? "wait" : "pointer",
            }}
            title="Deteksi atap bangunan via Google Solar API"
          >
            {solarDetecting ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            <span>⚡ Google Solar</span>
          </button>
        </div>

        {/* Solar Detection Banner (if active/notified) */}
        {solarStatusMsg && (
          <div
            style={{
              padding: "7px 20px",
              background: solarInsights?.available ? "#142a1b" : "#1a221d",
              borderBottom: "1px solid #233b28",
              fontSize: 11,
              color: solarInsights?.available ? "#d1fae5" : "#cbd5e1",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {solarInsights?.available ? <Sparkles size={14} style={{ color: "#b8f36b" }} /> : <SunMedium size={14} />}
            <span>{solarStatusMsg}</span>
          </div>
        )}

        {/* Map Container & Floating HUD */}
        <div style={{ flex: 1, position: "relative", minHeight: 340, background: "#0b100d" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                background: "#0b100de0",
                display: "grid",
                placeItems: "center",
                color: "var(--green, #b8f36b)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <RefreshCw size={24} className="animate-spin" />
                <span>Memuat Google Maps Platform...</span>
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
                zIndex: 11,
                background: "#3e1818",
                border: "1px solid #993333",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#ffc9c9",
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{errorMsg}</span>
              <button
                className="secondary-button"
                style={{ fontSize: 11, padding: "4px 10px" }}
                onClick={handleApplyDimensionsOnly}
              >
                Terapkan Dimensi Saja (Tanpa Gambar)
              </button>
            </div>
          )}

          {/* The Google Map Element */}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

          {/* Floating Live Roof & Solar Metrics Overlay */}
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
              padding: "12px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
              boxShadow: "0 10px 30px #00000088",
            }}
          >
            {/* Dimensions of each side */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Panjang 4 Sisi (M)
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#edf5ef" }}>
                  Atas: <span style={{ color: "var(--green, #b8f36b)" }}>{sideLengths.top}m</span> · Bawah:{" "}
                  <span style={{ color: "var(--green, #b8f36b)" }}>{sideLengths.bottom}m</span>
                </div>
                <div style={{ fontSize: 11, color: "#93a69a" }}>
                  Kiri: {sideLengths.left}m · Kanan: {sideLengths.right}m
                </div>
              </div>

              <div style={{ borderLeft: "1px solid #2b3d30", height: 28 }} />

              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Luas Area Poligon
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#b8f36b" }}>
                  {areaM2.toLocaleString()} m²
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {solarInsights?.available ? "Potensi Google Solar" : "Est. Kapasitas (~65%)"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#edf5ef" }}>
                  ~{approxKwp} kWp{" "}
                  <small style={{ fontSize: 11, color: "#93a69a" }}>({approxPanels} panel)</small>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Sudut Orientasi
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green, #b8f36b)" }}>
                  {rotationAngle}°
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="secondary-button"
                style={{ fontSize: 11, padding: "8px 12px" }}
                onClick={handleSwapDimensions}
                title="Tukar Lebar dan Panjang atap (Rotasi 90°)"
              >
                <RefreshCw size={13} /> Putar 90°
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{ fontSize: 11, padding: "8px 12px" }}
                onClick={handleResetToCenter}
                title="Posisikan poligon ke tengah layar"
              >
                <Maximize2 size={13} /> Pusatkan
              </button>

              <button
                type="button"
                className="primary-button"
                style={{ fontSize: 11, padding: "8px 16px" }}
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Terapkan ke Layout Atap
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Instructions */}
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
            💡 <strong>Petunjuk:</strong> 4 titik sudut (putih) dapat <strong>ditarik bebas</strong> membentuk <strong>trapesium</strong> atau miring. Gunakan tombol rotasi untuk memutar orientasi poligon mengikuti arah atap/lahan pabrik.
          </span>
          <span style={{ color: "#5d7063", whiteSpace: "nowrap" }}>
            Lat: {centerCoords.lat.toFixed(5)}, Lng: {centerCoords.lng.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}
