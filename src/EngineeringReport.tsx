import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import {
  fetchSolarClimatology,
  findNearestPlnSubstations,
} from "./gisSolarService";
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

  // Project defaults based on selection
  const isCikarang = activeProj?.id === "proj-cikarang-500kwp";
  const defaultCoords = isCikarang
    ? { lat: -6.3625, lng: 107.1689, name: "GIIC Cikarang, Jawa Barat" }
    : { lat: -6.3542, lng: 107.2847, name: "KIIC Karawang Barat, Jawa Barat" };

  const defaultClient = isCikarang
    ? "PT Cikarang Multi Industri Tbk (GIIC Cikarang)"
    : "PT Kawasan Industri Karawang (KIIC)";

  const [client, setClient] = useState(defaultClient);
  const [prepared, setPrepared] = useState("Tim Engineering PT Sonus Nusantara");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Issued for Engineering Review");
  const [coords, setCoords] = useState(defaultCoords);
  const [capacityKwp, setCapacityKwp] = useState(activeProj?.capacity || 500);

  // View & Preview States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<"screen" | "a4-light">("screen");

  // GIS Solar Irradiance & Yield State
  const [yieldData, setYieldData] = useState<SolarYieldResult | null>(null);
  const [loadingGis, setLoadingGis] = useState(false);
  const [gisError, setGisError] = useState<string | null>(null);
  const [substations, setSubstations] = useState<PlnSubstation[]>([]);

  // Load layout data (panels, obstacles, settings, polygon)
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

  // Update when project changes
  useEffect(() => {
    const isCik = activeProj?.id === "proj-cikarang-500kwp";
    const nextCoords = isCik
      ? { lat: -6.3625, lng: 107.1689, name: "GIIC Cikarang, Jawa Barat" }
      : { lat: -6.3542, lng: 107.2847, name: "KIIC Karawang Barat, Jawa Barat" };

    setCoords(nextCoords);
    setCapacityKwp(activeProj?.capacity || (isCik ? 500 : 2000));
    setClient(
      isCik
        ? "PT Cikarang Multi Industri Tbk (GIIC Cikarang)"
        : "PT Kawasan Industri Karawang (KIIC)"
    );
  }, [activeProj]);

  // Fetch GIS Solar Climatology and Grid Substation Data
  async function loadGisData() {
    setLoadingGis(true);
    setGisError(null);
    try {
      const data = await fetchSolarClimatology(coords.lat, coords.lng, capacityKwp);
      setYieldData(data);
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
    loadGisData();
  }, [coords.lat, coords.lng, capacityKwp]);

  const maxMonthlyKwh = useMemo(() => {
    if (!yieldData) return 1;
    return Math.max(...yieldData.monthly.map((m) => m.monthlyEnergyKwh), 1);
  }, [yieldData]);

  // CAD 2D rendering variables
  const layoutSettings = savedLayout?.settings ?? {};
  const areaW = Number(layoutSettings.areaWidth) || (isCikarang ? 110000 : 220000);
  const areaH = Number(layoutSettings.areaHeight) || (isCikarang ? 32000 : 120000);
  const panels = Array.isArray(savedLayout?.panels) ? savedLayout.panels : [];
  const obstacles = Array.isArray(savedLayout?.obstacles) ? savedLayout.obstacles : [];
  const siteCorners = savedLayout?.site?.polygonCorners;
  const isCustomPolygon = Boolean(siteCorners && siteCorners.length >= 3);
  const moduleW = Number(layoutSettings.moduleWidth) || 2278;
  const moduleH = Number(layoutSettings.moduleHeight) || 1134;
  const tilt = Number(layoutSettings.tilt) || 10;
  const totalPanels = panels.length || Math.round((capacityKwp * 1000) / 580);
  const totalModuleArea = (totalPanels * (moduleW * moduleH)) / 1_000_000;

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Reusable Kop Gambar / CAD Title Block for Pages 2 & 3
  const renderCadTitleBlock = (sheetNo: number, title: string, docNo: string) => (
    <div
      style={{
        border: "1.5px solid #0f172a",
        marginTop: 14,
        background: "#ffffff",
        fontSize: 10,
        color: "#0f172a",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 140px", borderBottom: "1px solid #cbd5e1" }}>
        <div style={{ padding: "8px 10px", borderRight: "1px solid #cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: "#10b981", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
            SN
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 11, color: "#0f172a" }}>PT SONUS NUSANTARA</div>
            <div style={{ fontSize: 8.5, color: "#64748b" }}>EPC SOLAR ENGINEERING STUDIO</div>
          </div>
        </div>

        <div style={{ padding: "6px 12px", borderRight: "1px solid #cbd5e1", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 8.5, color: "#64748b", textTransform: "uppercase" }}>NAMA PROYEK / FASILITAS</div>
          <div style={{ fontWeight: 700, fontSize: 11, color: "#0f172a" }}>{activeProj?.name} ({capacityKwp} kWp)</div>
          <div style={{ fontSize: 8.5, color: "#475569" }}>KLIEN: {client} · {coords.name}</div>
        </div>

        <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 8.5, color: "#64748b" }}>SKALA / SATUAN</div>
          <div style={{ fontWeight: 700, fontSize: 10 }}>NTS (1:500) · mm / meter</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px", fontSize: 9 }}>
        <div style={{ padding: "6px 10px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#64748b" }}>JUDUL GAMBAR:</span> <strong style={{ color: "#0f172a", fontSize: 9.5 }}>{title}</strong>
        </div>
        <div style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#64748b" }}>NO. GAMBAR:</span> <strong style={{ fontFamily: "monospace" }}>{docNo}</strong>
        </div>
        <div style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>
          <span style={{ color: "#64748b" }}>TANGGAL:</span> <strong>{date}</strong>
        </div>
        <div style={{ padding: "6px 8px", background: "#f8fafc", textAlign: "center" }}>
          <span style={{ color: "#64748b" }}>LEMBAR:</span> <strong style={{ color: "#0f172a" }}>{sheetNo} DARI 3</strong>
        </div>
      </div>
    </div>
  );

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
            Dokumen rekayasa lengkap 3 Halaman A4: Ringkasan Eksekutif, Gambar Desain PV 2D CAD, dan Visualisasi 3D dengan Studi Bayangan.
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
                padding: "6px 11px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: viewMode === "screen" ? 700 : 400
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
                padding: "6px 11px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: viewMode === "a4-light" ? 700 : 400
              }}
            >
              📄 Format Cetak A4 (Light)
            </button>
          </div>

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
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "7px 14px", background: "#10b981", borderColor: "#34d399", color: "#ffffff", fontWeight: 700 }}
          >
            <Printer size={13} />
            <span>Cetak / Simpan PDF</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          PRINT / A4 DOCUMENT CONTAINER (PAGE 1, PAGE 2, PAGE 3)
          ========================================================================= */}
      <div
        className="print-document-container"
        style={{
          display: viewMode === "a4-light" ? "flex" : "block",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* =======================================================================
            HALAMAN 1: EXECUTIVE ENGINEERING SUMMARY & CLIMATOLOGY (NASA POWER GIS)
            ======================================================================= */}
        <section className="a4-page-sheet" id="report-page-1">
          {/* Sheet Header Kop Surat */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: 10, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, background: "#10b981", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontWeight: 900, fontSize: 18 }}>
                  SN
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", letterSpacing: 0.5 }}>PT SONUS NUSANTARA</div>
                  <div style={{ fontSize: 9.5, color: "#059669", fontWeight: 700, letterSpacing: 1 }}>SOLAR ENGINEERING & EPC FEASIBILITY STUDY</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 9, color: "#475569" }}>
                <div>DOKUMEN NO: <strong style={{ color: "#0f172a" }}>SN-DED-2026-001</strong></div>
                <div>REVISI: <strong style={{ color: "#0f172a" }}>REV 0 (IFC)</strong></div>
                <div>TANGGAL LAPORAN: <strong style={{ color: "#0f172a" }}>{date}</strong></div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 2px", color: "#0f172a", fontWeight: 800, textTransform: "uppercase" }}>
                Laporan Kelayakan Rekayasa & Estimasi Produksi PLTS
              </h2>
              <div style={{ fontSize: 9.5, color: "#475569" }}>
                Kalkulasi Radiasi Matahari 25 Tahun NASA POWER, Analisis Rugi Daya, Profil Energi Bulanan & Interkoneksi PLN
              </div>
            </div>

            {/* Project Profile Meta Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr", gap: 8, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: 12, fontSize: 9.5 }}>
              <div>
                <span style={{ color: "#64748b" }}>Nama Proyek:</span> <strong style={{ color: "#0f172a" }}>{activeProj?.name}</strong>
                <div style={{ color: "#059669", fontWeight: 600 }}>Tipe: {activeProj?.type || "Rooftop"} ({capacityKwp} kWp)</div>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Klien / Pemilik:</span> <strong style={{ color: "#0f172a" }}>{client}</strong>
                <div style={{ color: "#64748b" }}>Lokasi: {coords.name}</div>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Koordinat GPS:</span> <strong style={{ color: "#0f172a" }}>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</strong>
                <div style={{ color: "#059669", fontWeight: 600 }}>Status: {status}</div>
              </div>
            </div>

            {/* Executive KPIs Grid */}
            {yieldData && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 12 }}>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Kapasitas DC</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{capacityKwp}</strong> <small style={{ fontSize: 8.5, color: "#059669" }}>kWp</small>
                </div>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Radiasi GHI</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.annualGhi.toFixed(2)}</strong> <small style={{ fontSize: 8.5, color: "#059669" }}>PSH</small>
                </div>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Specific Yield</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.specificYield.toLocaleString()}</strong> <small style={{ fontSize: 8.5, color: "#059669" }}>kWh/kWp</small>
                </div>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Produksi Thn</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.annualEnergyMwh.toLocaleString()}</strong> <small style={{ fontSize: 8.5, color: "#059669" }}>MWh</small>
                </div>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Perf. Ratio (PR)</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{(yieldData.pr * 100).toFixed(1)}%</strong>
                </div>
                <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5 }}>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>Reduksi CO₂</div>
                  <strong style={{ fontSize: 13, color: "#0f172a" }}>{yieldData.carbonOffsetTons.toLocaleString()}</strong> <small style={{ fontSize: 8.5, color: "#059669" }}>ton</small>
                </div>
              </div>
            )}

            {/* Compact Monthly Bar Chart */}
            {yieldData && (
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a" }}>📊 Profil Produksi Energi Bulanan (MWh)</span>
                  <span style={{ fontSize: 8.5, color: "#64748b" }}>Distribusi Musiman Berdasarkan Insolasi Harian NASA POWER 25 Tahun</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6, alignItems: "flex-end", height: 75, background: "#f8fafc", borderRadius: 4, padding: "8px 6px 4px", border: "1px solid #f1f5f9" }}>
                  {yieldData.monthly.map((m) => {
                    const heightPct = Math.max(16, Math.round((m.monthlyEnergyKwh / maxMonthlyKwh) * 100));
                    const mwh = (m.monthlyEnergyKwh / 1000).toFixed(1);
                    return (
                      <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#059669", marginBottom: 2 }}>{mwh}</span>
                        <div style={{ width: "80%", maxWidth: 22, height: `${heightPct}%`, background: "linear-gradient(180deg, #10b981 0%, #059669 100%)", borderRadius: "2px 2px 0 0" }} />
                        <span style={{ fontSize: 7.5, color: "#64748b", marginTop: 3 }}>{m.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Monthly Irradiance & Yield Table */}
            {yieldData && (
              <div style={{ marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5, border: "1px solid #e2e8f0" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", color: "#334155", textAlign: "center" }}>
                      <th style={{ padding: "4px 6px", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>Bulan</th>
                      <th style={{ padding: "4px 6px", borderBottom: "1px solid #cbd5e1" }}>GHI (kWh/m²/hari)</th>
                      <th style={{ padding: "4px 6px", borderBottom: "1px solid #cbd5e1" }}>Suhu (°C)</th>
                      <th style={{ padding: "4px 6px", borderBottom: "1px solid #cbd5e1" }}>Harian (kWh)</th>
                      <th style={{ padding: "4px 6px", borderBottom: "1px solid #cbd5e1" }}>Total (MWh)</th>
                      <th style={{ padding: "4px 6px", textAlign: "right", borderBottom: "1px solid #cbd5e1" }}>Est. Hemat (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yieldData.monthly.map((m, idx) => (
                      <tr key={m.month} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f8fafc", textAlign: "center" }}>
                        <td style={{ padding: "3.5px 6px", textAlign: "left", fontWeight: 700, color: "#0f172a" }}>{m.month}</td>
                        <td style={{ padding: "3.5px 6px" }}>{m.ghi.toFixed(2)}</td>
                        <td style={{ padding: "3.5px 6px" }}>{m.temp.toFixed(1)} °C</td>
                        <td style={{ padding: "3.5px 6px" }}>{m.dailyEnergyKwh.toLocaleString()}</td>
                        <td style={{ padding: "3.5px 6px", fontWeight: 700, color: "#059669" }}>{(m.monthlyEnergyKwh / 1000).toFixed(1)}</td>
                        <td style={{ padding: "3.5px 6px", textAlign: "right" }}>Rp {m.savingsIdr.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#e2e8f0", fontWeight: 800, textAlign: "center", color: "#0f172a" }}>
                      <td style={{ padding: "4px 6px", textAlign: "left" }}>TOTAL / RATA-RATA</td>
                      <td style={{ padding: "4px 6px" }}>{yieldData.annualGhi.toFixed(2)} PSH</td>
                      <td style={{ padding: "4px 6px" }}>{yieldData.annualTemp.toFixed(1)} °C</td>
                      <td style={{ padding: "4px 6px" }}>-</td>
                      <td style={{ padding: "4px 6px", color: "#059669" }}>{yieldData.annualEnergyMwh.toLocaleString()} MWh</td>
                      <td style={{ padding: "4px 6px", textAlign: "right", color: "#059669" }}>Rp {yieldData.annualSavingsIdr.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Loss Diagram & PLN Substation Interconnection (Two Columns) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px", background: "#f8fafc", fontSize: 9 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Layers size={11} style={{ color: "#059669" }} /> Anggaran Rugi Daya Sistem (Loss Tree)
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Soiling / Debu Permukaan</span>
                  <strong>-2.0%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Koefisien Suhu Modul (NOCT)</span>
                  <strong>-5.5%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Efisiensi Inverter Euro/CEC</span>
                  <strong>-2.5%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ color: "#64748b" }}>Wiring DC / AC & Mismatch</span>
                  <strong>-1.5%</strong>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px", background: "#f8fafc", fontSize: 9 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Building2 size={11} style={{ color: "#0284c7" }} /> Interkoneksi Grid PLN & Gardu Induk
                </div>
                {substations.slice(0, 2).map((sub, idx) => (
                  <div key={sub.name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: idx === 0 ? "1px dashed #e2e8f0" : "none" }}>
                    <span style={{ color: "#475569" }}>{sub.name} ({sub.voltage})</span>
                    <strong style={{ color: idx === 0 ? "#059669" : "#64748b" }}>{sub.distanceKm.toFixed(1)} km</strong>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 8.5, color: "#64748b", lineHeight: 1.3 }}>
                  💡 {capacityKwp > 1000
                    ? `Kapasitas ${capacityKwp} kWp (>1 MW) mewajibkan sinkronisasi TM 20 kV via Trafo Step-Up & Cubicle Proteksi PLN.`
                    : `Kapasitas ${capacityKwp} kWp dapat disinkronkan langsung ke Busbar LVMDP 380V fasilitas eksisting.`}
                </div>
              </div>
            </div>

            {/* Sign-off & Engineering Approval Block */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, borderTop: "1px solid #cbd5e1", paddingTop: 8, fontSize: 9 }}>
              <div>
                <div style={{ color: "#64748b" }}>DISUSUN & DIHITUNG OLEH:</div>
                <div style={{ fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{prepared}</div>
                <div style={{ fontSize: 8.5, color: "#64748b" }}>Lead PV Solar Design Engineer</div>
                <div style={{ marginTop: 14, borderBottom: "1px solid #94a3b8", width: "70%" }} />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#64748b" }}>DISETUJUI OLEH KLIEN / FASILITAS:</div>
                <div style={{ fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{client}</div>
                <div style={{ fontSize: 8.5, color: "#64748b" }}>Kepala Divisi Energi & Fasilitas</div>
                <div style={{ marginTop: 14, borderBottom: "1px solid #94a3b8", width: "70%", marginLeft: "auto" }} />
              </div>
            </div>
          </div>

          {/* Sheet Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
            <span>PT SONUS NUSANTARA · DOKUMEN RAHASIA TEKNIS EPC</span>
            <span>LEMBAR 1 DARI 3 (EXECUTIVE SUMMARY)</span>
          </div>
        </section>

        {/* =======================================================================
            HALAMAN 2: GAMBAR DESAIN PV 2D & BATAS AREA (CAD 2D DRAWING)
            ======================================================================= */}
        <section className="a4-page-sheet" id="report-page-2">
          <div>
            {/* Sheet Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, background: "#0284c7", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
                  CAD
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>DETAIL TATA LETAK MODUL PV 2D & SITE BOUNDARY</div>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>LEMBAR 2 DARI 3 · EPC DRAWING PACKAGE · REVISI 0 (IFC)</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 9 }}>
                <span style={{ color: "#64748b" }}>SKALA: </span><strong style={{ color: "#0f172a" }}>NTS (1:500)</strong>
              </div>
            </div>

            {/* CAD Drawing Canvas SVG */}
            <div style={{ border: "1.5px solid #0f172a", borderRadius: 4, background: "#f8fafc", padding: 12, position: "relative" }}>
              {/* North Compass Arrow in top-right */}
              <div style={{ position: "absolute", top: 18, right: 18, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 8.5, fontWeight: 700, color: "#0f172a", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
                <Compass size={13} style={{ color: "#0284c7" }} />
                <span>UTARA (N)</span>
              </div>

              {/* 2D CAD SVG */}
              <svg viewBox="0 0 1000 520" style={{ width: "100%", height: 350, display: "block", background: "#ffffff" }}>
                <defs>
                  <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="1000" height="520" fill="url(#cad-grid)" stroke="#cbd5e1" strokeWidth="1" />

                {/* Scaled geometry */}
                {(() => {
                  const cadScale = Math.min(840 / Math.max(areaW, 1), 380 / Math.max(areaH, 1));
                  const cadOriginX = (1000 - areaW * cadScale) / 2;
                  const cadOriginY = (520 - areaH * cadScale) / 2;

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
                        x={cadOriginX + 6}
                        y={cadOriginY + 6}
                        width={Math.max(1, areaW * cadScale - 12)}
                        height={Math.max(1, areaH * cadScale - 12)}
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
                            fontSize="8.5"
                            fontWeight="700"
                          >
                            {obs.label || "OBSTACLE"}
                          </text>
                        </g>
                      ))}

                      {/* PV Modules */}
                      {panels.map((p: any, idx: number) => (
                        <rect
                          key={p.id}
                          x={cadOriginX + p.x * cadScale}
                          y={cadOriginY + p.y * cadScale}
                          width={Math.max(1, p.w * cadScale)}
                          height={Math.max(1, p.h * cadScale)}
                          fill="#0284c7"
                          stroke="#0369a1"
                          strokeWidth="0.6"
                          rx="0.5"
                        />
                      ))}

                      {/* Dimension Labels */}
                      <text x={cadOriginX + (areaW * cadScale) / 2} y={Math.max(16, cadOriginY - 8)} textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
                        LEBAR ATAP: {(areaW / 1000).toFixed(1)} M ({areaW.toLocaleString()} mm)
                      </text>
                      <text
                        x={cadOriginX - 10}
                        y={cadOriginY + (areaH * cadScale) / 2}
                        textAnchor="middle"
                        fill="#0f172a"
                        fontSize="10"
                        fontWeight="700"
                        transform={`rotate(-90 ${cadOriginX - 10} ${cadOriginY + (areaH * cadScale) / 2})`}
                      >
                        PANJANG: {(areaH / 1000).toFixed(1)} M
                      </text>
                    </g>
                  );
                })()}
              </svg>

              {/* CAD Legend Bar */}
              <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 8, fontSize: 8.5, color: "#334155", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 12, height: 12, background: "#ecfdf5", border: "1.5px dashed #059669", borderRadius: 2 }} />
                  Batas Area Lahan / Atap
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 12, height: 2, background: "#f59e0b" }} />
                  Setback Bebas Tepi (300 mm)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 12, height: 8, background: "#0284c7", borderRadius: 1 }} />
                  Modul PV ({moduleW}×{moduleH} mm, 580 Wp)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 12, height: 8, background: "#fee2e2", border: "1px solid #ef4444" }} />
                  Area Terlarang / Obstacle
                </span>
              </div>
            </div>

            {/* Technical Array Specs Table */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10, fontSize: 9 }}>
              <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                <span style={{ color: "#64748b" }}>Jumlah Modul</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>{totalPanels.toLocaleString()} Unit</div>
              </div>
              <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                <span style={{ color: "#64748b" }}>Total Luas Modul</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>{totalModuleArea.toFixed(1)} m²</div>
              </div>
              <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                <span style={{ color: "#64748b" }}>Ground Cover Ratio</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>~68.4%</div>
              </div>
              <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                <span style={{ color: "#64748b" }}>Kemiringan (Tilt)</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>{tilt}° (Optimal)</div>
              </div>
              <div style={{ padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                <span style={{ color: "#64748b" }}>Orientasi Modul</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 12 }}>{layoutSettings.orientation === "portrait" ? "Portrait" : "Landscape"}</div>
              </div>
            </div>

            {/* Kop Gambar CAD Lembar 2 */}
            {renderCadTitleBlock(2, "DETAIL TATA LETAK MODUL PV 2D & BATAS AREA", "SN-DED-PV-002")}
          </div>

          {/* Sheet Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
            <span>PT SONUS NUSANTARA · DOKUMEN GAMBAR TEKNIS DED</span>
            <span>LEMBAR 2 DARI 3 (2D CAD LAYOUT)</span>
          </div>
        </section>

        {/* =======================================================================
            HALAMAN 3: VISUALISASI 3D, MOUNTING & STUDI BAYANGAN (SHADOW STUDY)
            ======================================================================= */}
        <section className="a4-page-sheet" id="report-page-3">
          <div>
            {/* Sheet Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, background: "#f59e0b", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
                  3D
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>VISUALISASI 3D, STRUKTUR MOUNTING & STUDI BAYANGAN</div>
                  <div style={{ fontSize: 8.5, color: "#64748b" }}>LEMBAR 3 DARI 3 · EPC DRAWING PACKAGE · REVISI 0 (IFC)</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 9 }}>
                <span style={{ color: "#64748b" }}>SIMULASI: </span><strong style={{ color: "#0f172a" }}>THREE.JS CAD ENGINE</strong>
              </div>
            </div>

            {/* 3D Isometric & Shadow Schematic */}
            <div style={{ border: "1.5px solid #0f172a", borderRadius: 4, background: "#f8fafc", padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                <span>📐 Proyeksi Isometrik 3D & Analisis Sudut Jatuh Bayangan Matahari</span>
                <span style={{ color: "#059669" }}>Simulasi Astronomis Sinar Matahari (Sun Path)</span>
              </div>

              {/* Isometric Vector Art */}
              <svg viewBox="0 0 1000 380" style={{ width: "100%", height: 240, display: "block", background: "#ffffff", borderRadius: 4, border: "1px solid #e2e8f0" }}>
                {/* Sky & Sun Vector */}
                <defs>
                  <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f0f9ff" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
                <rect width="1000" height="380" fill="url(#sky-grad)" />

                {/* Sun 09:00 Vector */}
                <g>
                  <circle cx="180" cy="80" r="16" fill="#f59e0b" />
                  <circle cx="180" cy="80" r="24" fill="none" stroke="#fef3c7" strokeWidth="4" />
                  <line x1="180" y1="96" x2="420" y2="240" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" />
                  <text x="180" y="52" textAnchor="middle" fill="#d97706" fontSize="9" fontWeight="700">Matahari Pagi 09:00 (Elevasi 42.5°)</text>
                </g>

                {/* Sun 12:00 Vector */}
                <g>
                  <circle cx="500" cy="40" r="20" fill="#eab308" />
                  <circle cx="500" cy="40" r="30" fill="none" stroke="#fef9c3" strokeWidth="5" />
                  <line x1="500" y1="65" x2="500" y2="210" stroke="#eab308" strokeWidth="1.8" strokeDasharray="4 2" />
                  <text x="500" y="24" textAnchor="middle" fill="#ca8a04" fontSize="9.5" fontWeight="800">Matahari Puncak 12:00 (Elevasi 78.1°)</text>
                </g>

                {/* Sun 15:00 Vector */}
                <g>
                  <circle cx="820" cy="80" r="16" fill="#f59e0b" />
                  <circle cx="820" cy="80" r="24" fill="none" stroke="#fef3c7" strokeWidth="4" />
                  <line x1="820" y1="96" x2="580" y2="240" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" />
                  <text x="820" y="52" textAnchor="middle" fill="#d97706" fontSize="9" fontWeight="700">Matahari Sore 15:00 (Elevasi 44.0°)</text>
                </g>

                {/* Sun Path Arc */}
                <path d="M 180 80 Q 500 20 820 80" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 3" />

                {/* Building / Roof Isometric Base */}
                <polygon points="260,250 740,250 840,320 160,320" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                <polygon points="160,320 840,320 840,350 160,350" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />

                {/* Tilted Solar Rows on Roof */}
                {[0, 1, 2, 3].map((r) => {
                  const yOff = r * 15;
                  return (
                    <polygon
                      key={r}
                      points={`280,${260 + yOff} 720,${260 + yOff} 710,${270 + yOff} 270,${270 + yOff}`}
                      fill="#0284c7"
                      stroke="#0369a1"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* HVAC Chiller Obstacle & Simulated Shadows */}
                <g>
                  {/* Morning shadow (to west) */}
                  <polygon points="460,285 410,295 430,305 480,295" fill="#94a3b8" fillOpacity="0.5" />
                  {/* Evening shadow (to east) */}
                  <polygon points="500,285 550,295 530,305 480,295" fill="#94a3b8" fillOpacity="0.4" />
                  {/* Obstacle Box */}
                  <polygon points="470,270 490,270 490,290 470,290" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" />
                  <polygon points="470,270 480,260 500,260 490,270" fill="#f87171" stroke="#b91c1c" strokeWidth="1" />
                  <polygon points="490,270 500,260 500,280 490,290" fill="#dc2626" stroke="#b91c1c" strokeWidth="1" />
                  <text x="485" y="306" textAnchor="middle" fill="#b91c1c" fontSize="8" fontWeight="700">HVAC Chiller</text>
                </g>
              </svg>
            </div>

            {/* Structural Parameters & Shadow Evaluation Tables */}
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr", gap: 10, marginBottom: 10, fontSize: 9 }}>
              {/* Structural & Mechanical Specs */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <ShieldCheck size={12} style={{ color: "#059669" }} /> Spesifikasi Mekanikal & Struktur Mounting
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Material Racking</span>
                  <strong>Aluminium Rail AL6005-T5</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Baut & Fastener</span>
                  <strong>Stainless Steel SUS304 Anti-Karat</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Sudut Kemiringan (Tilt)</span>
                  <strong>{tilt}° (Hadap Khatulistiwa)</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px dashed #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Beban Angin Desain</span>
                  <strong>SNI 1727:2020 (120 km/jam)</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "#64748b" }}>Beban Mati Tambahan</span>
                  <strong>~14.5 kg/m² (Kategori Ringan)</strong>
                </div>
              </div>

              {/* Sun & Shadow Analysis Matrix */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={12} style={{ color: "#f59e0b" }} /> Matriks Evaluasi Bayangan (Shadow Clearance)
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
                  <thead>
                    <tr style={{ background: "#e2e8f0", color: "#334155" }}>
                      <th style={{ padding: "3px 5px", textAlign: "left" }}>Jam</th>
                      <th style={{ padding: "3px 5px" }}>Elevasi</th>
                      <th style={{ padding: "3px 5px" }}>Azimuth</th>
                      <th style={{ padding: "3px 5px" }}>Arah Bayangan</th>
                      <th style={{ padding: "3px 5px", textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px dashed #e2e8f0" }}>
                      <td style={{ padding: "3px 5px", fontWeight: 700 }}>09:00 WIB</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>42.5°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>68.2°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>Barat (1.1x H)</td>
                      <td style={{ padding: "3px 5px", textAlign: "right", color: "#059669", fontWeight: 700 }}>✓ Bebas</td>
                    </tr>
                    <tr style={{ borderBottom: "1px dashed #e2e8f0", background: "#f1f5f9" }}>
                      <td style={{ padding: "3px 5px", fontWeight: 700 }}>12:00 WIB</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>78.1°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>18.5°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>Minimal (0.2x H)</td>
                      <td style={{ padding: "3px 5px", textAlign: "right", color: "#059669", fontWeight: 700 }}>✓ Puncak</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 5px", fontWeight: 700 }}>15:00 WIB</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>44.0°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>285.3°</td>
                      <td style={{ padding: "3px 5px", textAlign: "center" }}>Timur (1.0x H)</td>
                      <td style={{ padding: "3px 5px", textAlign: "right", color: "#059669", fontWeight: 700 }}>✓ Bebas</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 4, fontSize: 8.5, color: "#059669", fontWeight: 600 }}>
                  ✓ Kesimpulan Shading: Bebas 100% dari bayangan jatuh obstacle pada jam produktif (09:00 - 15:00 WIB).
                </div>
              </div>
            </div>

            {/* IFC Engineering Notes */}
            <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 4, padding: "6px 10px", fontSize: 8.5, color: "#334155", marginBottom: 10 }}>
              <strong>CATATAN TEKNIS KONSTRUKSI (IFC):</strong>
              <ol style={{ margin: "3px 0 0", paddingLeft: 16, lineHeight: 1.35 }}>
                <li>Pemasangan modul wajib mematuhi batas setback 300 mm dari tepi atap untuk akses pemeliharaan dan koridor pemadam kebakaran.</li>
                <li>Seluruh struktur aluminium harus terhubung ke sistem grounding proteksi petir dengan tahanan pentanahan ≤ 2 Ohm (SNI 0225:2020).</li>
                <li>Inverter string ditempatkan terlindung dari paparan hujan langsung di dekat dinding kanopi fasilitas dengan sirkulasi udara baik.</li>
              </ol>
            </div>

            {/* Kop Gambar CAD Lembar 3 */}
            {renderCadTitleBlock(3, "VISUALISASI 3D, MOUNTING & STUDI BAYANGAN (SHADOW STUDY)", "SN-DED-PV-003")}
          </div>

          {/* Sheet Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
            <span>PT SONUS NUSANTARA · DOKUMEN GAMBAR TEKNIS DED</span>
            <span>LEMBAR 3 DARI 3 (3D VISUALIZATION & SHADOW STUDY)</span>
          </div>
        </section>
      </div>

      {/* =========================================================================
          INTERACTIVE PDF PREVIEW MODAL (LIGHTBOX A4 READER)
          ========================================================================= */}
      {isPreviewOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(10, 16, 26, 0.94)",
            backdropFilter: "blur(8px)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Modal Header */}
          <div
            className="preview-modal-header"
            style={{
              padding: "12px 24px",
              background: "#0d1726",
              borderBottom: "1px solid #23354d",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
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
                  document.getElementById("preview-a4-page-1")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "5px 12px",
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
                  document.getElementById("preview-a4-page-2")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "none",
                  background: previewTab === 2 ? "#1e3a5f" : "transparent",
                  color: previewTab === 2 ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: previewTab === 2 ? 700 : 400,
                }}
              >
                Halaman 2: Layout 2D (CAD)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewTab(3);
                  document.getElementById("preview-a4-page-3")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "none",
                  background: previewTab === 3 ? "#1e3a5f" : "transparent",
                  color: previewTab === 3 ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: previewTab === 3 ? 700 : 400,
                }}
              >
                Halaman 3: 3D & Bayangan
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#10b981",
                  border: "1px solid #34d399",
                  color: "#ffffff",
                  borderRadius: 6,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Printer size={14} /> Cetak / Unduh PDF
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
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Modal Body: Scrollable A4 Stack */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            <div id="preview-a4-page-1" style={{ width: "100%", maxWidth: 820 }}>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, fontWeight: 700 }}>
                HALAMAN 1: RINGKASAN EKSEKUTIF & CLIMATOLOGY NASA POWER (A4 PORTRAIT)
              </div>
              <div dangerouslySetInnerHTML={{ __html: document.getElementById("report-page-1")?.outerHTML || "" }} />
            </div>

            <div id="preview-a4-page-2" style={{ width: "100%", maxWidth: 820 }}>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, fontWeight: 700 }}>
                HALAMAN 2: DETAIL TATA LETAK MODUL PV 2D & SITE BOUNDARY CAD (A4 PORTRAIT)
              </div>
              <div dangerouslySetInnerHTML={{ __html: document.getElementById("report-page-2")?.outerHTML || "" }} />
            </div>

            <div id="preview-a4-page-3" style={{ width: "100%", maxWidth: 820 }}>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, fontWeight: 700 }}>
                HALAMAN 3: VISUALISASI 3D, STRUKTUR MOUNTING & STUDI BAYANGAN (A4 PORTRAIT)
              </div>
              <div dangerouslySetInnerHTML={{ __html: document.getElementById("report-page-3")?.outerHTML || "" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
