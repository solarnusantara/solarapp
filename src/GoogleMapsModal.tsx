import { useEffect, useRef, useState } from "react";
import { X, Search, MapPin, Maximize2, Check, RefreshCw, Layers, Zap, Sparkles, SunMedium } from "lucide-react";
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
    pitchDegrees?: number;
    azimuthDegrees?: number;
    googleSolarData?: GoogleSolarInsights;
  }) => void;
  initialWidthMm?: number;
  initialHeightMm?: number;
}

const DEFAULT_API_KEY = "AIzaSyC6TAjg7EBuCmkaWRwl-ih0PQ_Be07rc3o";

// Presets kawasan industri terkemuka di Indonesia (lokasi atap pabrik PLTS atap)
const INDUSTRIAL_PRESETS = [
  { name: "GIIC Cikarang", lat: -6.3685, lng: 107.1985 },
  { name: "KIIC Karawang", lat: -6.3475, lng: 107.2798 },
  { name: "MM2100 Cibitung", lat: -6.2890, lng: 107.0980 },
  { name: "Suryacipta", lat: -6.3980, lng: 107.3510 },
  { name: "Krakatau Cilegon", lat: -6.0125, lng: 106.0235 },
  { name: "SIER Surabaya", lat: -7.3320, lng: 112.7560 },
];

export default function GoogleMapsModal({
  isOpen,
  onClose,
  onApply,
  initialWidthMm = 24000,
  initialHeightMm = 12000,
}: GoogleMapsModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mapInstance, setMapInstance] = useState<any>(null);
  const [rectangle, setRectangle] = useState<any>(null);
  const [searchAddress, setSearchAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [widthM, setWidthM] = useState(initialWidthMm / 1000);
  const [heightM, setHeightM] = useState(initialHeightMm / 1000);
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: -6.3685,
    lng: 107.1985,
  });

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

    // Initial rectangle calculation
    createOrUpdateRectangle(map, { lat: defaultLat, lng: defaultLng }, widthM, heightM);

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

        createOrUpdateRectangle(map, { lat: newLat, lng: newLng }, widthM, heightM);
        setSearchAddress(place.formatted_address || place.name || "");
        setSolarInsights(null);
        setSolarStatusMsg("");
      });
    }
  }

  function createOrUpdateRectangle(
    map: any,
    center: { lat: number; lng: number },
    wM: number,
    hM: number
  ) {
    const win = window as any;
    if (!win.google?.maps) return;

    setCenterCoords(center);

    // Hitung offset lat/lng untuk dimensi wM x hM di sekitar center
    const latOffset = hM / 2 / 111111;
    const lngOffset = wM / 2 / (111111 * Math.cos((center.lat * Math.PI) / 180));

    const bounds = new win.google.maps.LatLngBounds(
      new win.google.maps.LatLng(center.lat - latOffset, center.lng - lngOffset),
      new win.google.maps.LatLng(center.lat + latOffset, center.lng + lngOffset)
    );

    if (rectangle) {
      rectangle.setBounds(bounds);
      rectangle.setMap(map);
    } else {
      const rect = new win.google.maps.Rectangle({
        bounds: bounds,
        editable: true,
        draggable: true,
        strokeColor: "#b8f36b",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#14221a",
        fillOpacity: 0.25,
        map: map,
      });

      rect.addListener("bounds_changed", () => {
        const b = rect.getBounds();
        if (!b) return;

        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const nw = new win.google.maps.LatLng(ne.lat(), sw.lng());

        let computedW = wM;
        let computedH = hM;

        if (win.google.maps.geometry?.spherical) {
          computedW = win.google.maps.geometry.spherical.computeDistanceBetween(nw, ne);
          computedH = win.google.maps.geometry.spherical.computeDistanceBetween(nw, sw);
        } else {
          const latDiff = (ne.lat() - sw.lat()) * 111111;
          const lngDiff = (ne.lng() - sw.lng()) * 111111 * Math.cos((((ne.lat() + sw.lat()) / 2) * Math.PI) / 180);
          computedW = Math.abs(lngDiff);
          computedH = Math.abs(latDiff);
        }

        const roundW = Math.round(computedW * 10) / 10;
        const roundH = Math.round(computedH * 10) / 10;
        setWidthM(roundW);
        setHeightM(roundH);

        const centerLat = (ne.lat() + sw.lat()) / 2;
        const centerLng = (ne.lng() + sw.lng()) / 2;
        setCenterCoords({ lat: centerLat, lng: centerLng });
      });

      setRectangle(rect);
    }
  }

  function handlePresetClick(preset: { name: string; lat: number; lng: number }) {
    if (!mapInstance) return;
    mapInstance.setCenter({ lat: preset.lat, lng: preset.lng });
    mapInstance.setZoom(19);
    createOrUpdateRectangle(mapInstance, { lat: preset.lat, lng: preset.lng }, widthM, heightM);
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
    createOrUpdateRectangle(mapInstance, centerCoords, newW, newH);
  }

  function handleResetToCenter() {
    if (!mapInstance) return;
    const center = mapInstance.getCenter();
    if (!center) return;
    createOrUpdateRectangle(mapInstance, { lat: center.lat(), lng: center.lng() }, widthM, heightM);
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

        const targetCenter = insights.center ? { lat: insights.center.lat, lng: insights.center.lng } : centerCoords;
        setCenterCoords(targetCenter);

        if (mapInstance) {
          mapInstance.setCenter(targetCenter);
          createOrUpdateRectangle(mapInstance, targetCenter, newW, newH);
        }

        setSolarStatusMsg(
          `✅ Atap terdeteksi via Google Solar! Luas ${insights.roofAreaM2} m² · Kemiringan ${insights.pitchDegrees}° · Azimuth ${insights.azimuthDegrees}° · Potensi maks ${insights.maxPanels} panel.`
        );
      } else {
        setSolarInsights(null);
        setSolarStatusMsg(
          `ℹ️ ${insights.error || "Poligon atap spesifik belum tersedia di titik ini. Silakan sesuaikan kotak secara manual."}`
        );
      }
    } catch (err: any) {
      setSolarInsights(null);
      setSolarStatusMsg(`Gagal mendeteksi via Google Solar: ${err?.message || "Kesalahan koneksi"}`);
    } finally {
      setSolarDetecting(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    setErrorMsg("");

    try {
      const lat = centerCoords.lat;
      const lng = centerCoords.lng;
      const wM = widthM;
      const hM = heightM;

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
        widthMm: Math.round(wM * 1000),
        heightMm: Math.round(hM * 1000),
        imageSrc: croppedDataUrl,
        coordinates: { lat, lng },
        address: searchAddress || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
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
    onApply({
      widthMm: Math.round(widthM * 1000),
      heightMm: Math.round(heightM * 1000),
      imageSrc: "",
      coordinates: centerCoords,
      address: searchAddress || `Koordinat (${centerCoords.lat.toFixed(4)}, ${centerCoords.lng.toFixed(4)})`,
      pitchDegrees: solarInsights?.pitchDegrees,
      azimuthDegrees: solarInsights?.azimuthDegrees,
      googleSolarData: solarInsights || undefined,
    });
    onClose();
  }

  if (!isOpen) return null;

  const areaM2 = Math.round(widthM * heightM);
  const approxPanels = solarInsights?.maxPanels || Math.floor((areaM2 * 0.65) / 2.58);
  const approxKwp = Math.round((approxPanels * 580) / 1000);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100000, padding: 16 }}>
      <div
        className="modal-card"
        style={{
          maxWidth: 1120,
          width: "96vw",
          height: "92vh",
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
                  🛰️ Google Maps Satellite & Solar GIS Scanner
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
                  Solar API Ready
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--muted, #93a69a)" }}>
                Cari lokasi pabrik, manfaatkan deteksi otomatis Google Solar, atau sesuaikan kotak atap & lahan secara presisi.
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

        {/* Toolbar: Search, Presets, and Google Solar Trigger */}
        <div
          style={{
            padding: "10px 20px",
            background: "#121b14",
            borderBottom: "1px solid #202d23",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Autocomplete Input */}
          <div
            style={{
              flex: "1 1 280px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0c120e",
              border: "1px solid #2a3d2e",
              borderRadius: 6,
              padding: "6px 12px",
            }}
          >
            <Search size={15} style={{ color: "#7a8a7f" }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Ketik nama pabrik / kawasan (cth: GIIC Cikarang, KIIC Karawang)..."
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#edf5ef",
                fontSize: 12,
                width: "100%",
              }}
            />
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
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: solarDetecting ? "wait" : "pointer",
              boxShadow: "0 2px 8px #00000040",
            }}
            title="Deteksi atap bangunan, kemiringan sudut (pitch), orientasi (azimuth), dan potensi energi via Google Solar API"
          >
            {solarDetecting ? (
              <>
                <RefreshCw size={13} className="animate-spin" /> Menganalisis...
              </>
            ) : (
              <>
                <Zap size={13} /> ⚡ Deteksi Atap Otomatis (Google Solar)
              </>
            )}
          </button>

          {/* Preset Buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#7a8a7f", fontWeight: 600 }}>Preset:</span>
            {INDUSTRIAL_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="secondary-button"
                style={{ padding: "4px 8px", fontSize: 10, height: 26 }}
                onClick={() => handlePresetClick(p)}
              >
                <MapPin size={11} /> {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Solar Detection Banner (if active/notified) */}
        {solarStatusMsg && (
          <div
            style={{
              padding: "8px 20px",
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
            {/* Dimensions */}
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Lebar Atap (W)
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#edf5ef" }}>
                  {widthM.toFixed(1)} m{" "}
                  <small style={{ fontSize: 11, color: "var(--green, #b8f36b)" }}>
                    ({Math.round(widthM * 1000).toLocaleString()} mm)
                  </small>
                </div>
              </div>

              <div style={{ color: "#364d3b" }}>✕</div>

              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Panjang Atap (L)
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#edf5ef" }}>
                  {heightM.toFixed(1)} m{" "}
                  <small style={{ fontSize: 11, color: "var(--green, #b8f36b)" }}>
                    ({Math.round(heightM * 1000).toLocaleString()} mm)
                  </small>
                </div>
              </div>

              <div style={{ borderLeft: "1px solid #2b3d30", height: 28 }} />

              <div>
                <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Luas Area Atap
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#b8f36b" }}>
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

              {solarInsights?.pitchDegrees !== undefined && (
                <div>
                  <div style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Sudut Kemiringan / Pitch
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#b8f36b" }}>
                    {solarInsights.pitchDegrees}° (Azimuth {solarInsights.azimuthDegrees}°)
                  </div>
                </div>
              )}
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
                <RefreshCw size={13} /> Tukar P ✕ L
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{ fontSize: 11, padding: "8px 12px" }}
                onClick={handleResetToCenter}
                title="Posisikan kotak atap ke tengah layar"
              >
                <Maximize2 size={13} /> Pusatkan Kotak
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
            padding: "9px 20px",
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
            💡 <strong>Petunjuk:</strong> Klik <strong>⚡ Deteksi Atap Otomatis</strong> untuk membaca poligon atap Google Solar secara presisi, atau seret & tarik kotak untuk menyesuaikan manual.
          </span>
          <span style={{ color: "#5d7063", whiteSpace: "nowrap" }}>
            Lat: {centerCoords.lat.toFixed(5)}, Lng: {centerCoords.lng.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}
