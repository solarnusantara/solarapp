import React, { useState, useEffect, useMemo } from "react";
import {
  Sliders,
  Sun,
  CloudSun,
  Gauge,
  Zap,
  Thermometer,
  ShieldCheck,
  Check,
  RotateCcw,
  Info,
  Layers,
  ArrowRight,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import {
  type ConditionSetSettings,
  type SolarYieldResult,
  DEFAULT_CONDITION_PRESETS,
  loadProjectConditionSet,
  saveProjectConditionSet,
  fetchSolarClimatology,
} from "../gisSolarService";

interface ConditionSetTabProps {
  projectId: string;
  projectName: string;
  coords: { lat: number; lng: number };
  capacityKwp: number;
  currentYield: SolarYieldResult | null;
  onApplyCondition: (settings: ConditionSetSettings, recalculatedYield: SolarYieldResult) => void;
  onSwitchTab: (tab: "epc" | "production" | "calc") => void;
}

export default function ConditionSetTab({
  projectId,
  projectName,
  coords,
  capacityKwp,
  currentYield,
  onApplyCondition,
  onSwitchTab,
}: ConditionSetTabProps) {
  const [settings, setSettings] = useState<ConditionSetSettings>(() =>
    loadProjectConditionSet(projectId)
  );
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Live recalculation based on current settings
  const simulatedYield = useMemo(() => {
    const annualGhi = currentYield?.annualGhi ?? 5.01;
    const annualTemp = currentYield?.annualTemp ?? 24.8;

    let tempDelta = 22;
    if (settings.rackingType === "flush") tempDelta = 25;
    else if (settings.rackingType === "tilted") tempDelta = 20;
    else if (settings.rackingType === "ground") tempDelta = 15;

    const avgCellTemp = annualTemp + tempDelta;
    const tempCoeff = Math.abs(settings.cellTempCoeffPctPerC ?? 0.35);
    const calculatedTempLoss = Math.round(Math.max(4.0, (avgCellTemp - 25) * tempCoeff) * 10) / 10;

    const tempLoss = settings.tempLossPct ?? calculatedTempLoss;
    const soilingLoss = settings.soilingFlatPct ?? 2.8;
    const mismatchLoss = settings.mismatchLossPct ?? 1.2;
    const inverterEff = settings.inverterEfficiencyPct ?? 98.4;
    const invLoss = Math.round((100 - inverterEff) * 10) / 10;
    const dcLoss = settings.dcWiringLossPct ?? 1.5;
    const acLoss = settings.acWiringLossPct ?? 1.0;
    const cablingLoss = Math.round((dcLoss + acLoss) * 10) / 10;
    const shadingLoss = settings.shadingLossPct ?? 1.8;
    const lidLoss = settings.lidLossPct ?? 1.0;
    const availPct = settings.availabilityPct ?? 99.0;
    const availLoss = Math.round((100 - availPct) * 10) / 10;

    const totalLossFraction =
      (1 - tempLoss / 100) *
      (1 - soilingLoss / 100) *
      (1 - mismatchLoss / 100) *
      (1 - invLoss / 100) *
      (1 - cablingLoss / 100) *
      (1 - shadingLoss / 100) *
      (1 - lidLoss / 100) *
      (1 - availLoss / 100);

    const pr = Math.round(totalLossFraction * 1000) / 1000;
    const specificYield = Math.round(annualGhi * 365 * pr);
    const annualEnergyMwh = Math.round(((capacityKwp * specificYield) / 1000) * 10) / 10;

    let p90EnergyMwh: number | undefined = undefined;
    let p90Factor = 1;
    if (settings.p90Enabled) {
      const sigmaW = (settings.weatherVariabilityPct ?? 5.5) / 100;
      const sigmaS = (settings.systemVariabilityPct ?? 1.0) / 100;
      const sigmaTotal = Math.sqrt(sigmaW * sigmaW + sigmaS * sigmaS);
      p90Factor = 1 - 1.282 * sigmaTotal;
      p90EnergyMwh = Math.round(annualEnergyMwh * p90Factor * 10) / 10;
    }

    const annualSavingsIdr = Math.round(annualEnergyMwh * 1000 * 1114.74);
    const carbonOffsetTons = Math.round(annualEnergyMwh * 0.809 * 10) / 10;

    return {
      pr,
      specificYield,
      annualEnergyMwh,
      p90EnergyMwh,
      p90Factor,
      annualSavingsIdr,
      carbonOffsetTons,
      avgCellTemp,
      losses: {
        temperature: tempLoss,
        soiling: soilingLoss,
        mismatch: mismatchLoss,
        inverter: invLoss,
        cabling: cablingLoss,
        shading: shadingLoss,
        lid: lidLoss,
        availability: availLoss,
        totalLossPct: Math.round((1 - pr) * 1000) / 10,
      },
    };
  }, [settings, currentYield, capacityKwp]);

  const handleApplyPreset = (key: keyof typeof DEFAULT_CONDITION_PRESETS) => {
    const preset = DEFAULT_CONDITION_PRESETS[key];
    if (preset) {
      setSettings({ ...preset });
    }
  };

  const handleSaveAndApply = async () => {
    setCalculating(true);
    try {
      saveProjectConditionSet(projectId, settings);
      const updatedYield = await fetchSolarClimatology(
        coords.lat,
        coords.lng,
        capacityKwp,
        settings
      );
      onApplyCondition(settings, updatedYield);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to apply condition set:", err);
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div style={{ color: "#edf5ef", paddingBottom: 40 }}>
      {/* Top Banner / Breadcrumb & Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
          background: "#0d1410",
          border: "1px solid #1f3024",
          borderRadius: 8,
          padding: "14px 18px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sliders size={18} style={{ color: "#b8f36b" }} />
            <h2 style={{ fontSize: 16, margin: 0, fontWeight: 800, color: "#f8fafc" }}>
              Condition Set (Kondisi Simulasi & Asumsi Rekayasa)
            </h2>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#8a9c90" }}>
            Proyek: <strong>{projectName}</strong> ({capacityKwp.toFixed(2)} kWp) · Koordinat:{" "}
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Preset Buttons */}
          <span style={{ fontSize: 11, color: "#8a9c90", marginRight: 4 }}>Preset:</span>
          <button
            type="button"
            onClick={() => handleApplyPreset("tropical_flush")}
            className="secondary-button"
            style={{ fontSize: 11, padding: "5px 10px", background: "#132318", borderColor: "#22c55e", color: "#b8f36b" }}
          >
            ⚡ Tropis Flush Mount
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("bankable_p90")}
            className="secondary-button"
            style={{ fontSize: 11, padding: "5px 10px", background: "#16202e", borderColor: "#38bdf8", color: "#38bdf8" }}
          >
            🛡️ Konservatif P90
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset("helioscope_parity")}
            className="secondary-button"
            style={{ fontSize: 11, padding: "5px 10px" }}
          >
            🌐 HelioScope Parity
          </button>

          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={calculating}
            className="primary-button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "7px 14px",
              fontWeight: 700,
            }}
          >
            {savedSuccess ? (
              <>
                <Check size={14} /> Tersimpan & Diterapkan!
              </>
            ) : calculating ? (
              "Mengkalkulasi..."
            ) : (
              <>
                <Sparkles size={14} /> Terapkan ke Laporan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Real-time PR Simulator on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16 }}>
        {/* Left Column: Detailed Conditioning Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Card 1: Weather & Climatology Dataset */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CloudSun size={16} style={{ color: "#38bdf8" }} />
                <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700, color: "#edf5ef" }}>
                  1. Weather Dataset (Meteorologi & Radiasi Matahari)
                </h3>
              </div>
              <span className="pv-badge" style={{ background: "#132318", color: "#b8f36b", fontSize: 10 }}>
                Live Satellite Data
              </span>
            </div>
            <p style={{ fontSize: 11, color: "#8a9c90", margin: "0 0 12px" }}>
              Digunakan untuk menghitung insolasi global (GHI), komponen baur (DHI), dan profil suhu ambien tahunan.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
                <span>Sumber Data Cuaca:</span>
                <select
                  value={settings.weatherDataset || "nasa"}
                  onChange={(e) => setSettings({ ...settings, weatherDataset: e.target.value as any })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 6,
                    padding: "6px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                >
                  <option value="nasa">NASA POWER 25-Year Climatology (1998-2022) [Rekomendasi Indonesia]</option>
                  <option value="meteonorm">Meteonorm 8 (TMY, 10km Grid) [HelioScope Parity]</option>
                  <option value="pvgis">PVGIS-SARAH2 TMY (European Commission JRC)</option>
                </select>
              </label>

              <div
                style={{
                  background: "#0a110c",
                  borderRadius: 6,
                  padding: "8px 10px",
                  border: "1px solid #1f3024",
                  fontSize: 10.5,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                <div>
                  Insolasi Rata-rata: <strong style={{ color: "#b8f36b" }}>{currentYield?.annualGhi ?? 5.01} PSH/hari</strong>
                </div>
                <div>
                  Suhu Ambien Rata-rata: <strong style={{ color: "#38bdf8" }}>{currentYield?.annualTemp ?? 24.8} °C</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Production Probability (HelioScope Parity P50 / P90 / P95) */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} style={{ color: "#f59e0b" }} />
                <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700, color: "#edf5ef" }}>
                  2. Production Probability & Bankability (P50, P90, P95)
                </h3>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.p90Enabled ?? true}
                  onChange={(e) => setSettings({ ...settings, p90Enabled: e.target.checked })}
                />
                <span style={{ color: settings.p90Enabled ? "#b8f36b" : "#8a9c90", fontWeight: 600 }}>
                  Aktifkan P90 Bankable
                </span>
              </label>
            </div>
            <p style={{ fontSize: 11, color: "#8a9c90", margin: "0 0 12px" }}>
              Memberikan proyeksi risiko dan reliabilitas produksi energi untuk kelayakan perbankan (*Bankable Report*).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Weather Variability */}
              <div style={{ background: "#0a110c", border: "1px solid #1f3024", borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
                  Variabilitas Cuaca (Weather Variability)
                </div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span>Annual Variability (%):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="15"
                    value={settings.weatherVariabilityPct ?? 5.5}
                    onChange={(e) => setSettings({ ...settings, weatherVariabilityPct: Number(e.target.value) })}
                    style={{
                      width: 65,
                      background: "#0d1410",
                      border: "1px solid #233527",
                      borderRadius: 4,
                      padding: "3px 6px",
                      color: "#b8f36b",
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  />
                </label>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  Standar Meteonorm/NASA untuk Jawa: 5.0% - 6.0%
                </div>
              </div>

              {/* System Variability */}
              <div style={{ background: "#0a110c", border: "1px solid #1f3024", borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
                  Variabilitas Sistem (System Variability)
                </div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span>System Uncertainty (%):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={settings.systemVariabilityPct ?? 1.0}
                    onChange={(e) => setSettings({ ...settings, systemVariabilityPct: Number(e.target.value) })}
                    style={{
                      width: 65,
                      background: "#0d1410",
                      border: "1px solid #233527",
                      borderRadius: 4,
                      padding: "3px 6px",
                      color: "#b8f36b",
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  />
                </label>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  Modul modeling, efisiensi inverter & degradasi
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Irradiance & Soiling Losses */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Sun size={16} style={{ color: "#fbbf24" }} />
              <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700, color: "#edf5ef" }}>
                3. Irradiance & Soiling Losses (Pengotoran Debu & Bayangan)
              </h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4 }}>
                  <span>Rugi Pengotoran Debu (Soiling):</span>
                  <strong style={{ color: "#b8f36b" }}>{(settings.soilingFlatPct ?? 2.8).toFixed(1)}%</strong>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="8.0"
                  step="0.1"
                  value={settings.soilingFlatPct ?? 2.8}
                  onChange={(e) => setSettings({ ...settings, soilingFlatPct: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#22c55e" }}
                />
                <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2 }}>
                  Iklim tropis Indonesia: 2.0% - 3.5% (terbantu hujan alami)
                </div>
              </div>

              <div>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4 }}>
                  <span>Rugi Bayangan & Pitch (Shading):</span>
                  <strong style={{ color: "#b8f36b" }}>{(settings.shadingLossPct ?? 1.8).toFixed(1)}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="6.0"
                  step="0.1"
                  value={settings.shadingLossPct ?? 1.8}
                  onChange={(e) => setSettings({ ...settings, shadingLossPct: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#22c55e" }}
                />
                <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2 }}>
                  Inter-row shading & obstacle sekitar atap
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Thermal & Temperature Model */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Thermometer size={16} style={{ color: "#f87171" }} />
              <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700, color: "#edf5ef" }}>
                4. Temperature & Thermal Model (Suhu Sel & Ventilasi Racking)
              </h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
                <span>Tipe Pemasangan / Ventilasi Racking:</span>
                <select
                  value={settings.rackingType || "flush"}
                  onChange={(e) => setSettings({ ...settings, rackingType: e.target.value as any })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 6,
                    padding: "6px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                >
                  <option value="flush">Atap Industri Flush Mount (Menempel Spandek - Ventilasi Terbatas)</option>
                  <option value="tilted">Atap Industri Tilted / Elevasi (Ventilasi Cukup)</option>
                  <option value="ground">Ground Mount / Kanopi Terbuka (Ventilasi Bebas)</option>
                </select>
              </label>

              <div
                style={{
                  background: "#0a110c",
                  borderRadius: 6,
                  padding: "8px 10px",
                  border: "1px solid #1f3024",
                  fontSize: 10.5,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                <div>
                  Est. Suhu Operasi Sel: <strong style={{ color: "#f87171" }}>{simulatedYield.avgCellTemp.toFixed(1)} °C</strong>
                </div>
                <div>
                  Rugi Suhu Terhitung: <strong style={{ color: "#f87171" }}>-{simulatedYield.losses.temperature.toFixed(1)}%</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: System Losses & Electrical Derates */}
          <div className="pv-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Zap size={16} style={{ color: "#38bdf8" }} />
              <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700, color: "#edf5ef" }}>
                5. System & Electrical Derates (Kabel, Inverter, Mismatch, LID)
              </h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>Rugi Kabel DC (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="5"
                  value={settings.dcWiringLossPct ?? 1.5}
                  onChange={(e) => setSettings({ ...settings, dcWiringLossPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>Rugi Kabel AC & Trafo (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="5"
                  value={settings.acWiringLossPct ?? 1.0}
                  onChange={(e) => setSettings({ ...settings, acWiringLossPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>Efisiensi Inverter (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="90"
                  max="99.5"
                  value={settings.inverterEfficiencyPct ?? 98.4}
                  onChange={(e) => setSettings({ ...settings, inverterEfficiencyPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>Modul Mismatch (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={settings.mismatchLossPct ?? 1.2}
                  onChange={(e) => setSettings({ ...settings, mismatchLossPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>LID & Tahun 1 (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={settings.lidLossPct ?? 1.0}
                  onChange={(e) => setSettings({ ...settings, lidLossPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5 }}>
                <span>System Availability (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="90"
                  max="100"
                  value={settings.availabilityPct ?? 99.0}
                  onChange={(e) => setSettings({ ...settings, availabilityPct: Number(e.target.value) })}
                  style={{
                    background: "#0d1410",
                    border: "1px solid #233527",
                    borderRadius: 4,
                    padding: "4px 8px",
                    color: "#f8fafc",
                    fontSize: 11,
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Real-time Live Simulator Summary (Sticky) */}
        <div style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Main PR Badge Card */}
          <div
            className="pv-card"
            style={{
              padding: 20,
              background: "linear-gradient(180deg, #122318 0%, #0c1510 100%)",
              border: "1.5px solid #22c55e",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(34, 197, 94, 0.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#8a9c90" }}>
                HASIL CONDITIONING REAL-TIME
              </span>
              <Gauge size={18} style={{ color: "#b8f36b" }} />
            </div>

            <div style={{ margin: "14px 0 6px" }}>
              <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>
                Net Performance Ratio (PR):
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#b8f36b", lineHeight: 1.1 }}>
                {(simulatedYield.pr * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 10.5, color: "#8a9c90", marginTop: 4 }}>
                Total Akumulasi Rugi Sistem: -{simulatedYield.losses.totalLossPct.toFixed(1)}%
              </div>
            </div>

            <div style={{ borderTop: "1px solid #1f3024", paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: "#8a9c90" }}>Specific Yield:</span>
                <strong style={{ color: "#f8fafc" }}>{simulatedYield.specificYield} kWh/kWp/tahun</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: "#8a9c90" }}>Produksi Tahunan (P50):</span>
                <strong style={{ color: "#b8f36b" }}>
                  {(simulatedYield.annualEnergyMwh / 1000).toFixed(2)} GWh / tahun
                </strong>
              </div>
              {settings.p90Enabled && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                  <span style={{ color: "#38bdf8" }}>Produksi Bankable (P90):</span>
                  <strong style={{ color: "#38bdf8" }}>
                    {((simulatedYield.p90EnergyMwh || 0) / 1000).toFixed(2)} GWh / tahun
                  </strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "#8a9c90" }}>Est. Penghematan Tagihan:</span>
                <strong style={{ color: "#f8fafc" }}>
                  Rp {(simulatedYield.annualSavingsIdr / 1e9).toFixed(2)} Miliar / tahun
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveAndApply}
              disabled={calculating}
              className="primary-button"
              style={{
                width: "100%",
                marginTop: 16,
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 800,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              {savedSuccess ? (
                <>
                  <Check size={16} /> Tersimpan ke Seluruh Laporan!
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Simpan & Terapkan ke Laporan
                </>
              )}
            </button>
          </div>

          {/* Loss Tree Mini Breakdown */}
          <div className="pv-card" style={{ padding: 14 }}>
            <h4 style={{ fontSize: 12, margin: "0 0 10px", color: "#cbd5e1", fontWeight: 700 }}>
              Rincian Derate (Loss Breakdown)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Suhu Sel (Thermal):</span>
                <span style={{ color: "#f87171", fontWeight: 700 }}>-{simulatedYield.losses.temperature.toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Pengotoran Debu (Soiling):</span>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>-{simulatedYield.losses.soiling.toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Kabel DC & AC:</span>
                <span style={{ color: "#38bdf8", fontWeight: 700 }}>-{simulatedYield.losses.cabling.toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Inverter & Trafo:</span>
                <span style={{ color: "#38bdf8", fontWeight: 700 }}>-{simulatedYield.losses.inverter.toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Mismatch Modul & LID:</span>
                <span style={{ color: "#cbd5e1", fontWeight: 700 }}>-{(simulatedYield.losses.mismatch + (simulatedYield.losses.lid || 0)).toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8a9c90" }}>Bayangan (Shading):</span>
                <span style={{ color: "#cbd5e1", fontWeight: 700 }}>-{simulatedYield.losses.shading.toFixed(1)}%</span>
              </div>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid #1f3024", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                onClick={() => onSwitchTab("epc")}
                className="secondary-button"
                style={{ fontSize: 11, padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>Lihat Laporan EPC (3 Hal A4)</span>
                <ArrowRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => onSwitchTab("production")}
                className="secondary-button"
                style={{ fontSize: 11, padding: "5px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>Lihat Production Report</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
