import { useEffect, useMemo, useState } from "react";
import {
  Sun,
  Zap,
  CloudSun,
  Download,
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
} from "lucide-react";
import {
  fetchSolarClimatology,
  findNearestPlnSubstations,
} from "./gisSolarService";
import type {
  SolarYieldResult,
  PlnSubstation,
} from "./gisSolarService";
import { REAL_PROJECTS } from "./defaultProjectsData";

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

  // GIS Solar Irradiance & Yield State
  const [yieldData, setYieldData] = useState<SolarYieldResult | null>(null);
  const [loadingGis, setLoadingGis] = useState(false);
  const [gisError, setGisError] = useState<string | null>(null);
  const [substations, setSubstations] = useState<PlnSubstation[]>([]);

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

  return (
    <div className="module-page" style={{ color: "#e8eef9", display: "grid", gap: 20 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "var(--green, #b8f36b)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            EPC DETAILED ENGINEERING DESIGN
          </div>
          <h1 style={{ fontSize: 26, margin: "6px 0", color: "#edf5ef", fontWeight: 700 }}>
            {isId ? "Laporan Rekayasa & Estimasi Produksi PLTS" : "PV Engineering & Energy Yield Report"}
          </h1>
          <p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 13 }}>
            {isId
              ? "Kalkulasi radiasi matahari 25 tahun (NASA POWER GIS), produksi energi P50/P90, rugi sistem, dan interkoneksi PLN."
              : "25-year solar irradiance climatology (NASA POWER GIS), P50/P90 energy generation, loss budget, and PLN grid feasibility."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={loadGisData}
            disabled={loadingGis}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "8px 12px" }}
          >
            <RefreshCw size={13} className={loadingGis ? "animate-spin" : ""} />
            {loadingGis ? (isId ? "Memperbarui GIS..." : "Updating GIS...") : (isId ? "Refresh Data GIS" : "Refresh GIS")}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "8px 16px" }}
          >
            <Printer size={13} /> {isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}
          </button>
        </div>
      </header>

      {/* Project Meta Bar */}
      <section
        style={{
          background: "var(--panel, #111a17)",
          border: "1px solid var(--border, #293a33)",
          borderRadius: 12,
          padding: "16px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        <div>
          <label style={{ fontSize: 11, color: "var(--muted, #93a69a)", textTransform: "uppercase" }}>
            {isId ? "Nama Proyek" : "Project Name"}
          </label>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#edf5ef", marginTop: 4 }}>
            {activeProj?.name || "PLTS Studio Project"}
          </div>
          <small style={{ color: "var(--green, #b8f36b)" }}>
            {activeProj?.type || "Rooftop"} · {capacityKwp} kWp
          </small>
        </div>

        <div>
          <label style={{ fontSize: 11, color: "var(--muted, #93a69a)", textTransform: "uppercase" }}>
            {isId ? "Lokasi & Koordinat GIS" : "Site & GIS Coordinates"}
          </label>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#edf5ef", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={14} style={{ color: "var(--green, #b8f36b)" }} /> {coords.name}
          </div>
          <small style={{ color: "#7a8a7f" }}>
            Lat: {coords.lat.toFixed(4)}, Lng: {coords.lng.toFixed(4)}
          </small>
        </div>

        <div>
          <label style={{ fontSize: 11, color: "var(--muted, #93a69a)", textTransform: "uppercase" }}>
            {isId ? "Klien / Pemilik Fasilitas" : "Client / Facility Owner"}
          </label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 10px",
              marginTop: 4,
              borderRadius: 6,
              border: "1px solid #33443a",
              background: "#0c130f",
              color: "#edf5ef",
              fontSize: 12,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, color: "var(--muted, #93a69a)", textTransform: "uppercase" }}>
            {isId ? "Status Review Engineering" : "Engineering Status"}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 10px",
              marginTop: 4,
              borderRadius: 6,
              border: "1px solid #33443a",
              background: "#0c130f",
              color: "#edf5ef",
              fontSize: 12,
            }}
          >
            <option>Draft Feasibility Study</option>
            <option>Issued for Engineering Review</option>
            <option>Approved by Lead PV Engineer</option>
            <option>Issued for Construction (IFC)</option>
          </select>
        </div>
      </section>

      {/* KPI Cards: Solar Resource & Energy Output */}
      {yieldData && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 14,
          }}
        >
          {/* Annual GHI / PSH */}
          <div
            style={{
              background: "#111b15",
              border: "1px solid #233b2a",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8ca094" }}>Radiasi Matahari (PSH)</span>
              <Sun size={18} style={{ color: "var(--green, #b8f36b)" }} />
            </div>
            <div style={{ margin: "10px 0" }}>
              <strong style={{ fontSize: 26, color: "#edf5ef" }}>{yieldData.annualGhi.toFixed(2)}</strong>
              <span style={{ fontSize: 12, color: "var(--green, #b8f36b)", marginLeft: 6 }}>kWh/m²/hari</span>
            </div>
            <small style={{ color: "#7a8a7f", fontSize: 11 }}>Rata-rata insolasi NASA POWER 25 tahun</small>
          </div>

          {/* Specific Yield */}
          <div
            style={{
              background: "#111b15",
              border: "1px solid #233b2a",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8ca094" }}>Specific Yield</span>
              <TrendingUp size={18} style={{ color: "var(--green, #b8f36b)" }} />
            </div>
            <div style={{ margin: "10px 0" }}>
              <strong style={{ fontSize: 26, color: "#edf5ef" }}>{yieldData.specificYield.toLocaleString()}</strong>
              <span style={{ fontSize: 12, color: "var(--green, #b8f36b)", marginLeft: 6 }}>kWh/kWp/thn</span>
            </div>
            <small style={{ color: "#7a8a7f", fontSize: 11 }}>Produktivitas per kWp terpasang</small>
          </div>

          {/* Total Annual Energy */}
          <div
            style={{
              background: "#111b15",
              border: "1px solid #233b2a",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8ca094" }}>Produksi Energi Tahunan</span>
              <Zap size={18} style={{ color: "var(--green, #b8f36b)" }} />
            </div>
            <div style={{ margin: "10px 0" }}>
              <strong style={{ fontSize: 26, color: "#edf5ef" }}>{yieldData.annualEnergyMwh.toLocaleString()}</strong>
              <span style={{ fontSize: 12, color: "var(--green, #b8f36b)", marginLeft: 6 }}>MWh/tahun</span>
            </div>
            <small style={{ color: "#7a8a7f", fontSize: 11 }}>Performance Ratio (PR): {(yieldData.pr * 100).toFixed(1)}%</small>
          </div>

          {/* Cost Savings */}
          <div
            style={{
              background: "#111b15",
              border: "1px solid #233b2a",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8ca094" }}>Est. Penghematan Listrik</span>
              <Activity size={18} style={{ color: "#fbbf24" }} />
            </div>
            <div style={{ margin: "10px 0" }}>
              <strong style={{ fontSize: 22, color: "#edf5ef" }}>
                Rp {(yieldData.annualSavingsIdr / 1_000_000).toFixed(1)} Jt
              </strong>
              <span style={{ fontSize: 11, color: "#93a69a", marginLeft: 4 }}>/tahun</span>
            </div>
            <small style={{ color: "#7a8a7f", fontSize: 11 }}>Tarif Industri I-3 PLN @ Rp 1.114/kWh</small>
          </div>

          {/* Carbon Offset */}
          <div
            style={{
              background: "#111b15",
              border: "1px solid #233b2a",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8ca094" }}>Reduksi Emisi Karbon</span>
              <Leaf size={18} style={{ color: "var(--green, #b8f36b)" }} />
            </div>
            <div style={{ margin: "10px 0" }}>
              <strong style={{ fontSize: 26, color: "#edf5ef" }}>{yieldData.carbonOffsetTons.toLocaleString()}</strong>
              <span style={{ fontSize: 12, color: "var(--green, #b8f36b)", marginLeft: 6 }}>tCO₂e/thn</span>
            </div>
            <small style={{ color: "#7a8a7f", fontSize: 11 }}>Faktor Emisi Grid Jamali: 0,809 tCO₂/MWh</small>
          </div>
        </section>
      )}

      {/* Visual Monthly Energy Generation Bar Chart */}
      {yieldData && (
        <section
          style={{
            background: "var(--panel, #111a17)",
            border: "1px solid var(--border, #293a33)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: 0, color: "#edf5ef", fontWeight: 700 }}>
                📊 Profil Produksi Energi Bulanan (MWh)
              </h2>
              <p style={{ margin: "4px 0 0", color: "#8a9c90", fontSize: 12 }}>
                Distribusi produksi listrik PLTS sepanjang tahun berdasarkan insolasi harian dan variasi musim tropis Indonesia.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#93a69a" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: "var(--green, #b8f36b)", borderRadius: 2 }} />
                Produksi Energi (MWh)
              </span>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: 8,
              alignItems: "flex-end",
              height: 200,
              padding: "16px 8px 8px",
              background: "#0c130f",
              borderRadius: 8,
              border: "1px solid #1f3024",
            }}
          >
            {yieldData.monthly.map((m) => {
              const heightPct = Math.max(12, Math.round((m.monthlyEnergyKwh / maxMonthlyKwh) * 100));
              const mwh = (m.monthlyEnergyKwh / 1000).toFixed(1);
              return (
                <div
                  key={m.month}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    height: "100%",
                    justifyContent: "flex-end",
                  }}
                  title={`${m.month}: ${mwh} MWh (GHI: ${m.ghi} kWh/m²/hari, Suhu: ${m.temp}°C)`}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green, #b8f36b)" }}>
                    {mwh}
                  </span>
                  <div
                    style={{
                      width: "80%",
                      maxWidth: 32,
                      height: `${heightPct}%`,
                      background: "linear-gradient(180deg, #b8f36b 0%, #366d47 100%)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s ease",
                      boxShadow: "0 2px 8px #b8f36b20",
                    }}
                  />
                  <span style={{ fontSize: 10, color: "#8a9c90", textTransform: "uppercase" }}>
                    {m.month.slice(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Two-Column Grid: Loss Budget & Monthly Table */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        {/* Loss Budget */}
        {yieldData && (
          <section
            style={{
              background: "var(--panel, #111a17)",
              border: "1px solid var(--border, #293a33)",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "#edf5ef", fontWeight: 700 }}>
              📉 Analisis Rugi Sistem & Efisiensi (Loss Budget)
            </h2>
            <p style={{ margin: "0 0 16px", color: "#8a9c90", fontSize: 12 }}>
              Dekomposisi kerugian dari radiasi nominal STC menuju AC Output interkoneksi.
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              <LossRow label="Insolasi Nominal Bidang Panel (STC 1000 W/m²)" value="100.0%" isPositive />
              <LossRow label="Rugi Suhu Tropis (Cell Temp Derating ~46°C)" value={`-${yieldData.losses.temperature}%`} />
              <LossRow label="Rugi Debu & Soiling (Kawasan Industri)" value={`-${yieldData.losses.soiling}%`} />
              <LossRow label="Efisiensi Konversi Inverter On-Grid" value={`-${yieldData.losses.inverter}%`} />
              <LossRow label="Rugi Kabel DC & AC (Ohmic Drop)" value={`-${yieldData.losses.cabling}%`} />
              <LossRow label="Mismatch Modul & Degradasi LID Awal" value={`-${yieldData.losses.mismatch}%`} />
              <LossRow label="Rugi Bayangan Struktur & Horizon" value={`-${yieldData.losses.shading}%`} />
              <div style={{ borderTop: "1px solid #233b28", paddingTop: 10, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "var(--green, #b8f36b)", fontSize: 14 }}>
                    Total Performance Ratio (PR Netto)
                  </strong>
                  <strong style={{ color: "var(--green, #b8f36b)", fontSize: 18 }}>
                    {(yieldData.pr * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PLN Substation & Interconnection GIS */}
        <section
          style={{
            background: "var(--panel, #111a17)",
            border: "1px solid var(--border, #293a33)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ fontSize: 16, margin: 0, color: "#edf5ef", fontWeight: 700 }}>
              ⚡ Interkoneksi Jaringan PLN Terdekat (GIS)
            </h2>
            <span style={{ fontSize: 10, background: "#1b3323", color: "#b8f36b", padding: "2px 6px", borderRadius: 4 }}>
              Grid Feasibility
            </span>
          </div>
          <p style={{ margin: "0 0 16px", color: "#8a9c90", fontSize: 12 }}>
            Jarak geospasial dari lokasi PLTS menuju Gardu Induk (GI) transmisi PLN untuk evaluasi interkoneksi 20 kV.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {substations.map((s, idx) => (
              <div
                key={s.name}
                style={{
                  background: idx === 0 ? "#14281b" : "#0c130f",
                  border: idx === 0 ? "1px solid #32633e" : "1px solid #1c2b21",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: idx === 0 ? "var(--green, #b8f36b)" : "#edf5ef" }}>
                    {idx === 0 && "⭐ "}
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#8a9c90", marginTop: 2 }}>
                    Tegangan: {s.voltage} · Titik Titik Koordinat PLN
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#edf5ef" }}>{s.distanceKm} km</div>
                  <small style={{ fontSize: 10, color: idx === 0 ? "var(--green, #b8f36b)" : "#7a8a7f" }}>
                    {idx === 0 ? "Rekomendasi Utama" : "Alternatif"}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#0c130f",
              borderRadius: 6,
              border: "1px solid #1f3024",
              fontSize: 11,
              color: "#93a69a",
            }}
          >
            💡 <strong>Rekomendasi Skema Ekspor/Interkoneksi:</strong>{" "}
            {capacityKwp > 1000
              ? `Kapasitas ${capacityKwp} kWp (> 1 MW) mewajibkan interkoneksi Tegangan Menengah (TM 20 kV) via Trafo Step-Up & Cubicle Proteksi PLN.`
              : `Kapasitas ${capacityKwp} kWp dapat disinkronkan langsung ke Busbar LVMDP Utama (380V Tegangan Rendah) fasilitas eksisting.`}
          </div>
        </section>
      </div>

      {/* Monthly Irradiance Table */}
      {yieldData && (
        <section
          style={{
            background: "var(--panel, #111a17)",
            border: "1px solid var(--border, #293a33)",
            borderRadius: 14,
            padding: 20,
            overflowX: "auto",
          }}
        >
          <h2 style={{ fontSize: 16, margin: "0 0 4px", color: "#edf5ef", fontWeight: 700 }}>
            📅 Rincian Data Insolasi & Produksi Per Bulan
          </h2>
          <p style={{ margin: "0 0 14px", color: "#8a9c90", fontSize: 12 }}>
            Data radiasi permukaan GHI harian (NASA POWER), suhu ambien, dan estimasi energi AC per bulan.
          </p>

          <table className="pv-table" style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Bulan</th>
                <th>Insolasi GHI (kWh/m²/hari)</th>
                <th>Suhu Ambien (°C)</th>
                <th>Harian Rata-rata (kWh)</th>
                <th>Total Bulanan (MWh)</th>
                <th style={{ textAlign: "right" }}>Penghematan (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {yieldData.monthly.map((m) => (
                <tr key={m.month}>
                  <td style={{ fontWeight: 600, color: "#edf5ef" }}>{m.month}</td>
                  <td>{m.ghi.toFixed(2)}</td>
                  <td>{m.temp.toFixed(1)} °C</td>
                  <td>{m.dailyEnergyKwh.toLocaleString()} kWh</td>
                  <td style={{ fontWeight: 700, color: "var(--green, #b8f36b)" }}>
                    {(m.monthlyEnergyKwh / 1000).toFixed(1)} MWh
                  </td>
                  <td style={{ textAlign: "right" }}>Rp {m.savingsIdr.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#14251b", fontWeight: 700 }}>
                <td>TOTAL / RATA-RATA</td>
                <td>{yieldData.annualGhi.toFixed(2)} PSH</td>
                <td>{yieldData.annualTemp.toFixed(1)} °C</td>
                <td>-</td>
                <td style={{ color: "var(--green, #b8f36b)" }}>
                  {yieldData.annualEnergyMwh.toLocaleString()} MWh/thn
                </td>
                <td style={{ textAlign: "right", color: "var(--green, #b8f36b)" }}>
                  Rp {yieldData.annualSavingsIdr.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Engineering Sign-off & Footnote */}
      <footer
        style={{
          background: "#0c120e",
          border: "1px solid #1f3024",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12,
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
  );
}

function LossRow({ label, value, isPositive = false }: { label: string; value: string; isPositive?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px dashed #1f3024",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#8a9c90" }}>{label}</span>
      <strong style={{ color: isPositive ? "#edf5ef" : "#f87171" }}>{value}</strong>
    </div>
  );
}
