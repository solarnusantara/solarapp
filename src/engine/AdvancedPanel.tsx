// PV Layout step 5 — Advanced workspace.
//
// Three clearly separated cards:
//   1. Module Shading Optimization — real Helio iso-shading only, with explicit status/provenance.
//   2. Overlays — JPG/JPEG/PNG only, additive to the existing satellite background.
//   3. LiDAR — honest "not configured" state (no LiDAR provider exists in this repository).
//
// Nothing here fabricates weather, shading, point-cloud, mesh or elevation data.

import { useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, CloudOff, Crosshair, ImagePlus, Layers, Mountain, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import WeatherPanel from "./WeatherPanel";
import {
  engineErrorMessage, getEngineState, getIsoShading, isUnavailable, UNAVAILABLE_MESSAGE,
} from "./client";
import { layoutToScene } from "./sceneAdapter";
import { shadingFingerprint, summarizeIsoShading, type ShadingSummary } from "./shading";
import type { SavedLayout } from "./layoutStore";
import type { EngineInputs, WeatherChoice } from "./types/local";
import { mmToM, mToMm } from "../pv/keepoutModel";
import {
  MAX_OVERLAY_BYTES, overlayFromData, removeOverlay, updateOverlay, validateOverlayFile,
  type Overlay,
} from "../pv/overlayModel";

const card: React.CSSProperties = { border: "1px solid #233527", borderRadius: 10, padding: 14, marginTop: 12, background: "#0d1410" };
const inp: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid #364b38", background: "#0d1410", color: "inherit", width: "100%", boxSizing: "border-box" };
const small: React.CSSProperties = { fontSize: 11, color: "#8ca293", lineHeight: 1.45 };
const th: React.CSSProperties = { textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #233527", fontWeight: 700, fontSize: 10.5 };
const td: React.CSSProperties = { textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #1a2a1d", fontSize: 11 };

const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);

type ShadingStatus = "idle" | "loading" | "done" | "error";

interface ShadingRun {
  summary: ShadingSummary;
  fingerprint: string;
  ranAt: string;
  designId: string;
  ignoreRowToRow: boolean;
  weatherLabel: string;
}

export default function AdvancedPanel({
  projectId,
  layout,
  inputs,
  onInputs,
  overlays,
  onOverlays,
}: {
  projectId: string | null;
  layout: SavedLayout;
  inputs: EngineInputs;
  onInputs: (next: EngineInputs) => void;
  overlays: Overlay[];
  onOverlays: (next: Overlay[]) => void;
}) {
  const latLon = useMemo(() => {
    const ad = layoutToScene(layout);
    return ad.latitude !== null && ad.longitude !== null ? { lat: ad.latitude, lon: ad.longitude } : null;
  }, [layout]);

  const ignoreRowToRow = inputs.shading_ignore_row_to_row === true;
  const fingerprint = useMemo(
    () => shadingFingerprint(layout, inputs.weather_choice ?? null, ignoreRowToRow),
    [layout, inputs.weather_choice, ignoreRowToRow],
  );

  const [shadeStatus, setShadeStatus] = useState<ShadingStatus>("idle");
  const [shadeError, setShadeError] = useState<string | null>(null);
  const [run, setRun] = useState<ShadingRun | null>(null);
  const stale = !!run && run.fingerprint !== fingerprint;

  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const areaWidthMm = Math.max(1, Number(layout.settings?.areaWidth) || 10000);
  const areaHeightMm = Math.max(1, Number(layout.settings?.areaHeight) || 10000);
  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) ?? null;

  const calculateShading = async () => {
    if (!projectId) {
      setShadeStatus("error");
      setShadeError("Proyek belum tersimpan di server. Simpan proyek dulu untuk memakai engine.");
      return;
    }
    setShadeStatus("loading");
    setShadeError(null);
    try {
      const state = await getEngineState(projectId);
      const designId = state.helio_design_id;
      if (!designId) {
        setShadeStatus("error");
        setShadeError("Proyek belum terhubung ke Helio. Jalankan Hitung (Helio) di bagian simulasi di bawah, lalu coba lagi.");
        return;
      }
      const iso = await getIsoShading(designId, { azStep: 5, elStep: 2 });
      const summary = summarizeIsoShading(iso);
      if (!summary) {
        setShadeStatus("error");
        setShadeError("Engine tidak mengembalikan data iso-shading untuk desain ini.");
        return;
      }
      const weather = inputs.weather_choice ?? null;
      setRun({
        summary,
        fingerprint,
        ranAt: new Date().toISOString(),
        designId,
        ignoreRowToRow,
        weatherLabel: weather?.label ?? "Cuaca condition set / fallback PVGIS saat run",
      });
      setShadeStatus("done");
    } catch (e) {
      setShadeStatus("error");
      setShadeError(isUnavailable(e) ? UNAVAILABLE_MESSAGE : engineErrorMessage(e));
    }
  };

  const readOverlay = (file: File) => {
    const problem = validateOverlayFile(file);
    if (problem) { setOverlayError(problem); return; }
    const reader = new FileReader();
    reader.onerror = () => setOverlayError("File tidak bisa dibaca.");
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) { setOverlayError("File bukan data gambar yang valid."); return; }
      try {
        const overlay = overlayFromData({
          id: `ov-${Date.now()}`,
          file,
          dataUrl,
          areaWidthMm,
          areaHeightMm,
        });
        onOverlays([...overlays, overlay]);
        setSelectedOverlayId(overlay.id);
        setOverlayError(null);
      } catch (e) {
        setOverlayError(e instanceof Error ? e.message : "Overlay gagal dibuat.");
      }
    };
    reader.readAsDataURL(file);
  };

  const statusLabel = shadeStatus === "loading"
    ? "Calculating"
    : shadeStatus === "error"
      ? "Failed"
      : shadeStatus === "done"
        ? stale ? "Stale" : "Calculated"
        : "Not calculated";
  const statusColor = shadeStatus === "loading" ? "#38bdf8" : shadeStatus === "error" ? "#f87171" : stale ? "#fbbf24" : shadeStatus === "done" ? "#6ee7b7" : "#94a3b8";

  return (
    <div style={{ padding: 4 }}>
      {/* 1. Module Shading Optimization */}
      <div style={{ ...card, marginTop: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7 }}>
              <Layers size={15} style={{ color: "#b8f36b" }} /> Module Shading Optimization
            </div>
            <div style={small}>
              Menghitung iso-shading geometris Helio dari scene tersimpan. Ini bukan simulasi energi tahunan.
            </div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: statusColor, border: `1px solid ${statusColor}55`, background: `${statusColor}16`, borderRadius: 5, padding: "3px 8px" }}>
            {statusLabel}
          </span>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#a5b8ad" }}>
            <input
              type="checkbox"
              checked={ignoreRowToRow}
              onChange={(e) => onInputs({ ...inputs, shading_ignore_row_to_row: e.target.checked })}
            />
            Ignore Row-to-Row Shading
          </label>
          <div style={small}>
            Opsi ini disimpan di <code>engine_inputs</code> dan ditampilkan bersama hasil. Endpoint iso-shading saat ini
            menghitung dari scene tersimpan dan tidak menerima parameter row-to-row; hasil tidak mengklaim
            opsi tersebut diterapkan oleh engine.
          </div>

          <WeatherPanel
            latLon={latLon}
            choice={inputs.weather_choice}
            onChoice={(c: WeatherChoice | null) => onInputs({ ...inputs, weather_choice: c })}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button"
              disabled={shadeStatus === "loading" || !projectId}
              onClick={() => void calculateShading()}
            >
              {shadeStatus === "loading" ? <><RefreshCw size={13} className="animate-spin" /> Menghitung…</> : <><Crosshair size={13} /> Calculate Shading</>}
            </button>
            {!projectId && <span style={{ ...small, color: "#fbbf24" }}>Simpan proyek di server dulu.</span>}
          </div>

          {shadeStatus === "error" && (
            <div role="alert" style={{ color: "#f87171", fontSize: 11.5, border: "1px solid #7f1d1d55", background: "#2a0f1255", borderRadius: 6, padding: "7px 9px" }}>
              {shadeError}
            </div>
          )}

          {run && (
            <div style={{ border: "1px solid #1f3024", borderRadius: 8, padding: 10, background: "#0a110c" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, color: stale ? "#fbbf24" : "#6ee7b7" }}>
                {stale ? <TriangleAlert size={13} /> : <CheckCircle2 size={13} />}
                {stale ? "Stale — layout/asumsi berubah setelah perhitungan" : "Calculated"}
              </div>
              <div style={{ ...small, marginTop: 4 }}>
                {new Date(run.ranAt).toLocaleString("id-ID")} · design {run.designId} · cuaca: {run.weatherLabel}
                {" · "}row-to-row: {run.ignoreRowToRow ? "diabaikan (tercatat)" : "tidak diabaikan"}
              </div>
              <div style={{ ...small, marginTop: 2 }}>
                {run.summary.orientationCount} orientasi · {run.summary.moduleCount} modul · {run.summary.levels.length} level kontur
              </div>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tilt</th>
                      <th style={th}>Azimuth</th>
                      <th style={th}>Modul</th>
                      <th style={th}>Kontur</th>
                      <th style={th}>Diffuse loss</th>
                      <th style={th}>Albedo loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.summary.orientations.map((o, i) => (
                      <tr key={i}>
                        <td style={td}>{o.tiltDeg.toFixed(1)}°</td>
                        <td style={td}>{o.azimuthDeg.toFixed(1)}°</td>
                        <td style={td}>{o.moduleCount}</td>
                        <td style={td}>{o.contourCount}</td>
                        <td style={td}>{fmtPct(o.diffuseLossPct)}</td>
                        <td style={td}>{fmtPct(o.albedoLossPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {run.summary.levels.length > 0 && (
                <div style={{ ...small, marginTop: 6 }}>
                  Level kontur (fraksi Helio): {run.summary.levels.map((l) => l.toFixed(3)).join(", ")}
                </div>
              )}
              {run.summary.warnings.length > 0 && (
                <ul style={{ margin: "6px 0 0 16px", color: "#fbbf24", fontSize: 10.5 }}>
                  {run.summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Overlays */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7 }}>
          <ImagePlus size={15} style={{ color: "#38bdf8" }} /> Overlays
        </div>
        <div style={small}>
          JPG/JPEG/PNG saja, maksimum {MAX_OVERLAY_BYTES / 1024 / 1024} MB per gambar. KML/KMZ tidak didukung.
          Overlay ditempatkan manual dengan X/Y/Lebar/Tinggi — bukan georeferensi otomatis.
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) readOverlay(file);
          }}
          style={{
            marginTop: 10,
            border: `1.5px dashed ${dragOver ? "#38bdf8" : "#2b4633"}`,
            background: dragOver ? "#0b1c27" : "#0a110c",
            borderRadius: 8,
            padding: "18px 12px",
            textAlign: "center",
          }}
        >
          <ImagePlus size={24} style={{ color: "#38bdf8", opacity: 0.85 }} />
          <div style={{ fontSize: 12, fontWeight: 800, color: "#edf5ef", marginTop: 5 }}>Tarik gambar ke sini</div>
          <div style={{ ...small, marginTop: 2 }}>atau pilih file dari komputer</div>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readOverlay(file);
              e.currentTarget.value = "";
            }}
          />
          <button type="button" className="secondary-button" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
            Browse Image
          </button>
        </div>

        {overlayError && (
          <div role="alert" style={{ color: "#f87171", fontSize: 11.5, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <X size={12} /> {overlayError}
          </div>
        )}

        {overlays.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
            {overlays.map((o) => (
              <div
                key={o.id}
                onClick={() => setSelectedOverlayId(o.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 9px", borderRadius: 7,
                  border: `1px solid ${selectedOverlayId === o.id ? "#38bdf8" : "#1c2d22"}`,
                  background: selectedOverlayId === o.id ? "#0b1c27" : "#0a110c", cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "#edf5ef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
                  <div style={{ ...small, fontSize: 9.5 }}>{o.mime === "image/png" ? "PNG" : "JPEG"} · {Math.round(o.opacity * 100)}%</div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={o.visible}
                    onChange={(e) => onOverlays(updateOverlay(overlays, o.id, { visible: e.target.checked }))}
                  />
                  Show
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={o.opacity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onOverlays(updateOverlay(overlays, o.id, { opacity: Number(e.target.value) }))}
                  style={{ width: 74, accentColor: "#38bdf8" }}
                  title="Opacity"
                />
                <button
                  type="button"
                  title="Hapus overlay"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOverlays(removeOverlay(overlays, o.id));
                    if (selectedOverlayId === o.id) setSelectedOverlayId(null);
                  }}
                  style={{ background: "transparent", border: "none", color: "#f87171", padding: 2, cursor: "pointer" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedOverlay && (
          <div style={{ marginTop: 10, border: "1px solid #1f3024", borderRadius: 8, padding: 10, background: "#0a110c" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>Manual placement — {selectedOverlay.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
              {(["x", "y", "w", "h"] as const).map((key) => (
                <label key={key} style={{ display: "grid", gap: 2, fontSize: 10, color: "#8aa092" }}>
                  {key.toUpperCase()} (m)
                  <input
                    type="number"
                    step="0.01"
                    min={key === "w" || key === "h" ? 0.01 : undefined}
                    value={mmToM(selectedOverlay[key])}
                    onChange={(e) => {
                      const n = e.target.value === "" ? 0 : Number(e.target.value);
                      onOverlays(updateOverlay(overlays, selectedOverlay.id, { [key]: Math.max(key === "w" || key === "h" ? 1 : 0, mToMm(n)) }));
                    }}
                    style={inp}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOverlays(updateOverlay(overlays, selectedOverlay.id, { x: 0, y: 0, w: areaWidthMm, h: areaHeightMm }))}
              >
                Fit to canvas
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOverlays(updateOverlay(overlays, selectedOverlay.id, { x: 0, y: 0, w: areaWidthMm, h: areaHeightMm, opacity: 0.6 }))}
              >
                Reset placement
              </button>
            </div>
          </div>
        )}

        <div style={{ ...small, marginTop: 8 }}>
          Overlay tidak mengubah site boundary, Field Segment, modul, walkway, atau obstacle. Data disimpan
          di payload layout yang sudah ada.
        </div>
      </div>

      {/* 3. LiDAR */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7 }}>
          <Mountain size={15} style={{ color: "#94a3b8" }} /> LiDAR
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7, color: "#fbbf24", fontSize: 11.5, fontWeight: 800 }}>
          <CloudOff size={14} /> Not configured — no LiDAR provider connected
        </div>
        <div style={{ ...small, marginTop: 5 }}>
          Build ini tidak memiliki provider titik-awan LiDAR, mesh, atau imagery LiDAR. Kontrol di bawah
          dinonaktifkan agar tidak menampilkan data yang tidak ada.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
          <label style={{ display: "grid", gap: 3, fontSize: 10.5, color: "#8aa092" }}>
            Data Source
            <select disabled style={inp} value="">
              <option value="">No LiDAR provider connected</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 3, fontSize: 10.5, color: "#8aa092" }}>
            Style
            <select disabled style={inp} value="">
              <option value="">Unavailable: Mesh / Imagery / Point-Cloud</option>
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
          {(["X", "Y", "Z"] as const).map((axis) => (
            <label key={axis} style={{ display: "grid", gap: 3, fontSize: 10.5, color: "#8aa092" }}>
              Offset {axis} (m)
              <input disabled type="number" value={0} readOnly style={inp} />
            </label>
          ))}
        </div>
        <div style={{ ...small, marginTop: 6 }}>
          CRS saat dataset tersedia: local ENU metres (X east, Y north, Z up) dengan datum yang harus
          didokumentasikan oleh provider. Saat ini belum ada dataset, jadi offset tidak dapat diterapkan.
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button type="button" className="secondary-button" disabled>Edit offset</button>
          <button type="button" className="secondary-button" disabled>Apply</button>
          <button type="button" className="secondary-button" disabled>Cancel</button>
          <button type="button" className="secondary-button" disabled>Reset to zero</button>
        </div>
        <div style={{ ...small, marginTop: 8, borderTop: "1px solid #1a2a1d", paddingTop: 7 }}>
          Terrain existing di PV Layout 3D memakai grid elevasi 9×9 Open-Meteo sebagai DEM visual.
          Itu bukan LiDAR dan tidak diberi label LiDAR.
        </div>
      </div>

      <div style={{ ...small, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Ban size={12} /> Tidak ada hasil shading, cuaca, atau LiDAR yang dibuat-buat saat engine/provider tidak tersedia.
      </div>
    </div>
  );
}
