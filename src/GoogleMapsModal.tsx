import { useEffect, useRef, useState } from "react";
import { X, Search, MapPin, Maximize2, Check, RefreshCw, Layers } from "lucide-react";

interface GoogleMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
    widthMm: number;
    heightMm: number;
    imageSrc: string;
    coordinates: { lat: number; lng: number };
    address: string;
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

  const apiKey = window.GOOGLE_MAPS_API_KEY || DEFAULT_API_KEY;

  // Load Google Maps SDK
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setErrorMsg("");

    function loadScript(): Promise<void> {
      if (window.google?.maps?.Map) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const scriptId = "google-maps-solar-sdk";
        const existing = document.getElementById(scriptId);
        if (existing) {
          if (window.google?.maps?.Map) {
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
        script.onerror = () => reject(new Error("Gagal mengunduh script Google Maps. Periksa koneksi internet atau proteksi domain API Key."));
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
    if (!mapRef.current || !window.google?.maps) return;

    const defaultLat = centerCoords.lat;
    const defaultLng = centerCoords.lng;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: defaultLat, lng: defaultLng },
      zoom: 19,
      mapTypeId: "satellite",
      tilt: 0,
      rotateControl: false,
      streetViewControl: false,
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ["satellite", "hybrid"],
        position: window.google.maps.ControlPosition.TOP_RIGHT,
      },
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_CENTER,
      },
    });

    setMapInstance(map);

    // Initial rectangle calculation
    createOrUpdateRectangle(map, { lat: defaultLat, lng: defaultLng }, widthM, heightM);

    // Setup Places Autocomplete
    if (searchInputRef.current && window.google.maps.places?.Autocomplete) {
      const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
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
      });
    }
  }

  function createOrUpdateRectangle(
    map: any,
    center: { lat: number; lng: number },
    wM: number,
    hM: number
  ) {
    if (!window.google?.maps) return;

    setCenterCoords(center);

    // Hitung offset lat/lng untuk dimensi wM x hM di sekitar center
    const latOffset = (hM / 2) / 111111;
    const lngOffset = (wM / 2) / (111111 * Math.cos((center.lat * Math.PI) / 180));

    const bounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(center.lat - latOffset, center.lng - lngOffset),
      new window.google.maps.LatLng(center.lat + latOffset, center.lng + lngOffset)
    );

    if (rectangle) {
      rectangle.setBounds(bounds);
      rectangle.setMap(map);
    } else {
      const rect = new window.google.maps.Rectangle({
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
        const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());

        // Geodesic distance in meters using google.maps.geometry.spherical
        let computedW = wM;
        let computedH = hM;

        if (window.google.maps.geometry?.spherical) {
          computedW = window.google.maps.geometry.spherical.computeDistanceBetween(nw, ne);
          computedH = window.google.maps.geometry.spherical.computeDistanceBetween(nw, sw);
        } else {
          // Fallback formula jika geometry library belum ready
          const latDiff = (ne.lat() - sw.lat()) * 111111;
          const lngDiff = (ne.lng() - sw.lng()) * 111111 * Math.cos(((ne.lat() + sw.lat()) / 2 * Math.PI) / 180);
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

  async function handleApply() {
    setApplying(true);
    setErrorMsg("");

    try {
      const lat = centerCoords.lat;
      const lng = centerCoords.lng;
      const wM = widthM;
      const hM = heightM;

      // Kalkulasi optimal zoom untuk Static Map (maks 1150px dari 1280px)
      const maxDim = Math.max(wM, hM);
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const targetPx = 1100;
      const val = (targetPx * 156543.03392 * cosLat) / Math.max(10, maxDim);
      const targetZoom = Math.min(21, Math.max(14, Math.floor(Math.log2(val))));

      // URL Google Static Map
      const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${targetZoom}&size=640x640&scale=2&maptype=satellite&key=${apiKey}`;

      // Ambil citra via fetch
      const resp = await fetch(staticUrl);
      if (!resp.ok) {
        throw new Error(`Google Static Maps mengembalikan status HTTP ${resp.status}`);
      }
      const blob = await resp.blob();

      // Buat crop canvas yang hanya menyisakan atap gedung terpilih
      const img = new Image();
      const blobUrl = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Gagal membaca hasil citra satelit"));
        img.src = blobUrl;
      });

      // Ground resolution pada target zoom
      const res = (156543.03392 * cosLat) / Math.pow(2, targetZoom);
      const cropW = Math.min(1280, Math.max(20, Math.round(wM / res)));
      const cropH = Math.min(1280, Math.max(20, Math.round(hM / res)));
      const cropX = Math.max(0, Math.round(640 - cropW / 2));
      const cropY = Math.max(0, Math.round(640 - cropH / 2));

      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = cropW;
      offscreenCanvas.height = cropH;
      const ctx = offscreenCanvas.getContext("2d");

      if (!ctx) throw new Error("Gagal menginisialisasi canvas untuk crop citra");

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedDataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.86);

      URL.revokeObjectURL(blobUrl);

      // Teruskan data ukuran atap (dalam mm) dan gambar ke PVLayout
      onApply({
        widthMm: Math.round(wM * 1000),
        heightMm: Math.round(hM * 1000),
        imageSrc: croppedDataUrl,
        coordinates: { lat, lng },
        address: searchAddress,
      });

      onClose();
    } catch (err: any) {
      console.error("Gagal memproses citra satelit:", err);
      // Fallback: terapkan dimensi atap tanpa gambar jika static map diblokir
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
      address: searchAddress,
    });
    onClose();
  }

  if (!isOpen) return null;

  const areaM2 = Math.round(widthM * heightM);
  const approxPanels = Math.floor((areaM2 * 0.65) / 2.58);
  const approxKwp = Math.round((approxPanels * 580) / 1000);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100000, padding: 16 }}>
      <div
        className="modal-card"
        style={{
          maxWidth: 1080,
          width: "95vw",
          height: "90vh",
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
            padding: "16px 20px",
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
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#edf5ef" }}>
                🛰️ Google Maps Satellite Scanner — Atap PLTS
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "var(--muted, #93a69a)" }}>
                Cari lokasi pabrik, sesuaikan kotak atap gedung, dan kalkulasi dimensi otomatis untuk layout PV.
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

        {/* Toolbar: Search & Presets */}
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
              flex: "1 1 320px",
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
              placeholder="Ketik nama pabrik / kawasan industri (cth: GIIC Cikarang, PT ABC Karawang)..."
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

          {/* Floating Live Roof Metrics Overlay */}
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
                  Est. Kapasitas (~65% density)
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#edf5ef" }}>
                  ~{approxKwp} kWp{" "}
                  <small style={{ fontSize: 11, color: "#93a69a" }}>({approxPanels} panel)</small>
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
                    <RefreshCw size={14} className="animate-spin" /> Mengambil Citra...
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
            💡 <strong>Petunjuk:</strong> Seret bagian tengah kotak untuk memindahkan posisi. Tarik titik-titik sudut
            atau tepi kotak untuk mengubah ukuran atap gedung pabrik secara presisi.
          </span>
          <span style={{ color: "#5d7063", whiteSpace: "nowrap" }}>
            Lat: {centerCoords.lat.toFixed(5)}, Lng: {centerCoords.lng.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}
