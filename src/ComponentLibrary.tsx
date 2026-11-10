import React, { useState, useMemo, useRef } from "react";
import {
  Sun,
  Zap,
  Battery,
  Search,
  Check,
  ShieldCheck,
  Upload,
  FileText,
  CheckCircle2,
  Maximize2,
  Sliders,
  Layers,
  ArrowRight,
  Info,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import {
  AUTHENTIC_PV_MODULES,
  AUTHENTIC_INVERTERS,
  AUTHENTIC_BATTERIES,
  parsePanFile,
  parseOndFile
} from "./pvDatabase";
import type {
  PVModuleSpec,
  InverterSpec,
  BatterySpec
} from "./pvDatabase";

interface Props {
  lang?: "id" | "en";
  activeProject?: any;
  onApplyModuleToLayout?: (module: PVModuleSpec) => void;
  onNavigateToLayout?: () => void;
}

export default function ComponentLibrary({
  lang = "id",
  activeProject,
  onApplyModuleToLayout,
  onNavigateToLayout
}: Props) {
  const isId = lang === "id";
  const [activeTab, setActiveTab] = useState<"modules" | "inverters" | "batteries">("modules");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedModule, setSelectedModule] = useState<PVModuleSpec | null>(AUTHENTIC_PV_MODULES[0]);
  const [selectedInverter, setSelectedInverter] = useState<InverterSpec | null>(AUTHENTIC_INVERTERS[0]);
  const [selectedBattery, setSelectedBattery] = useState<BatterySpec | null>(AUTHENTIC_BATTERIES[0]);
  
  // Custom uploaded items
  const [customModules, setCustomModules] = useState<PVModuleSpec[]>(() => {
    try {
      const saved = localStorage.getItem("solar-apps-custom-modules");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customInverters, setCustomInverters] = useState<InverterSpec[]>(() => {
    try {
      const saved = localStorage.getItem("solar-apps-custom-inverters");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine built-in with custom
  const allModules = useMemo(() => [...AUTHENTIC_PV_MODULES, ...customModules], [customModules]);
  const allInverters = useMemo(() => [...AUTHENTIC_INVERTERS, ...customInverters], [customInverters]);
  const allBatteries = AUTHENTIC_BATTERIES;

  // Filter lists
  const filteredModules = useMemo(() => {
    return allModules.filter(m => {
      const matchSearch =
        m.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.series.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.powerWp.toString().includes(searchQuery);
      const matchBrand = selectedBrand === "all" || m.manufacturer === selectedBrand;
      return matchSearch && matchBrand;
    });
  }, [allModules, searchQuery, selectedBrand]);

  const filteredInverters = useMemo(() => {
    return allInverters.filter(inv => {
      const matchSearch =
        inv.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.ratedPowerKw.toString().includes(searchQuery);
      const matchBrand = selectedBrand === "all" || inv.manufacturer === selectedBrand;
      return matchSearch && matchBrand;
    });
  }, [allInverters, searchQuery, selectedBrand]);

  const filteredBatteries = useMemo(() => {
    return allBatteries.filter(bat => {
      return (
        bat.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bat.ratedCapacityKwh.toString().includes(searchQuery)
      );
    });
  }, [allBatteries, searchQuery]);

  // Unique brands
  const moduleBrands = useMemo(() => Array.from(new Set(allModules.map(m => m.manufacturer))), [allModules]);
  const inverterBrands = useMemo(() => Array.from(new Set(allInverters.map(i => i.manufacturer))), [allInverters]);

  // Handle PAN/OND File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      if (file.name.toLowerCase().endsWith(".pan")) {
        const parsed = parsePanFile(text);
        if (parsed && parsed.model) {
          const newMod = { ...parsed, sourceRef: `File Unggahan: ${file.name}` } as PVModuleSpec;
          const next = [newMod, ...customModules];
          setCustomModules(next);
          localStorage.setItem("solar-apps-custom-modules", JSON.stringify(next));
          setSelectedModule(newMod);
          setActiveTab("modules");
          setAppliedNotice(isId ? `✅ Berhasil mengimpor modul "${newMod.model}" dari file .PAN!` : `✅ Successfully imported "${newMod.model}" from .PAN file!`);
          setTimeout(() => setAppliedNotice(null), 5000);
        }
      } else if (file.name.toLowerCase().endsWith(".ond")) {
        const parsed = parseOndFile(text);
        if (parsed && parsed.model) {
          const newInv = { ...parsed, sourceRef: `File Unggahan: ${file.name}` } as InverterSpec;
          const next = [newInv, ...customInverters];
          setCustomInverters(next);
          localStorage.setItem("solar-apps-custom-inverters", JSON.stringify(next));
          setSelectedInverter(newInv);
          setActiveTab("inverters");
          setAppliedNotice(isId ? `✅ Berhasil mengimpor inverter "${newInv.model}" dari file .OND!` : `✅ Successfully imported "${newInv.model}" from .OND file!`);
          setTimeout(() => setAppliedNotice(null), 5000);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleApplyModule = (mod: PVModuleSpec) => {
    if (onApplyModuleToLayout) {
      onApplyModuleToLayout(mod);
    }
    // Also save as preferred module for active project
    if (activeProject?.id) {
      try {
        localStorage.setItem(`solar-apps-preferred-module:${activeProject.id}`, JSON.stringify(mod));
      } catch {}
    }
    setAppliedNotice(isId ? `Modul "${mod.manufacturer} ${mod.model} (${mod.powerWp} Wp)" berhasil dipilih untuk proyek ini!` : `Module "${mod.model}" selected for this project!`);
    setTimeout(() => setAppliedNotice(null), 4000);
  };

  return (
    <div className="component-library-page" style={{ padding: "20px 24px", color: "#edf5ef", maxWidth: 1400, margin: "0 auto" }}>
      {/* Hidden File Input for .PAN and .OND */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pan,.ond,.txt"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />

      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="pv-badge" style={{ background: "#163820", color: "#b8f36b", borderColor: "#285836", display: "flex", alignItems: "center", gap: 4 }}>
              <ShieldCheck size={12} /> Referensi Resmi Terverifikasi
            </span>
            <span className="pv-badge" style={{ background: "#122538", color: "#38bdf8", borderColor: "#1e3c5a" }}>
              IEC 61724 / Standar Industri (.PAN / .OND) Compliant
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0", letterSpacing: "-0.5px" }}>
            {isId ? "Katalog Spesifikasi Komponen PLTS" : "PV System Component Specifications"}
          </h1>
          <p style={{ margin: 0, color: "#8aa092", fontSize: 13 }}>
            {isId
              ? "Database parameter teknis resmi untuk Modul Surya (PV), Inverter String/Sentral, dan BESS dari file manufaktur terakreditasi (.PAN / .OND) dan sertifikasi TÜV SÜD."
              : "Official technical parameters for PV modules, inverters, and BESS sourced from authentic manufacturer files (.PAN/.OND)."}
          </p>
        </div>

        {/* Action Button: Upload .PAN/.OND */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="secondary-button"
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "8px 14px", background: "#111c14", border: "1px solid #233b2a", color: "#b8f36b" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            {isId ? "Unggah File .PAN / .OND" : "Upload .PAN / .OND File"}
          </button>
          {activeProject && onNavigateToLayout && (
            <button
              type="button"
              className="primary-button"
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "8px 14px" }}
              onClick={onNavigateToLayout}
            >
              {isId ? "Buka Kanvas Layout" : "Go to Layout"}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Notice Toast */}
      {appliedNotice && (
        <div style={{ background: "#12301c", border: "1px solid #22c55e", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, color: "#b8f36b", fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{appliedNotice}</span>
        </div>
      )}

      {/* Tabs Bar: PV Modules, Inverters, BESS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a2c20", paddingBottom: 12, marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, background: "#0b130e", padding: 3, borderRadius: 8, border: "1px solid #1a2a1f" }}>
          <button
            type="button"
            onClick={() => { setActiveTab("modules"); setSelectedBrand("all"); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: activeTab === "modules" ? "var(--green, #b8f36b)" : "transparent",
              color: activeTab === "modules" ? "#0a130c" : "#8aa092",
              fontWeight: activeTab === "modules" ? 800 : 600,
              border: "none",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Sun size={15} />
            {isId ? "Modul Surya (PV)" : "PV Modules"} ({allModules.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("inverters"); setSelectedBrand("all"); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: activeTab === "inverters" ? "var(--green, #b8f36b)" : "transparent",
              color: activeTab === "inverters" ? "#0a130c" : "#8aa092",
              fontWeight: activeTab === "inverters" ? 800 : 600,
              border: "none",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Zap size={15} />
            {isId ? "Inverter String" : "Inverters"} ({allInverters.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("batteries"); setSelectedBrand("all"); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: activeTab === "batteries" ? "var(--green, #b8f36b)" : "transparent",
              color: activeTab === "batteries" ? "#0a130c" : "#8aa092",
              fontWeight: activeTab === "batteries" ? 800 : 600,
              border: "none",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Battery size={15} />
            {isId ? "Baterai (BESS)" : "Batteries"} ({allBatteries.length})
          </button>
        </div>

        {/* Search & Brand Filter */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#6e8275" }} />
            <input
              type="text"
              placeholder={isId ? "Cari merk, model, daya Wp/kW..." : "Search brand, model, power..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: "#080d09",
                border: "1px solid #1f3325",
                borderRadius: 6,
                padding: "6px 12px 6px 30px",
                color: "#edf5ef",
                fontSize: 12,
                width: 240,
              }}
            />
          </div>

          {activeTab !== "batteries" && (
            <select
              value={selectedBrand}
              onChange={e => setSelectedBrand(e.target.value)}
              style={{
                background: "#080d09",
                border: "1px solid #1f3325",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#edf5ef",
                fontSize: 12,
              }}
            >
              <option value="all">{isId ? "Semua Pabrikan" : "All Manufacturers"}</option>
              {(activeTab === "modules" ? moduleBrands : inverterBrands).map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Grid: Component List (Left) + Detailed Technical Inspector (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 20, alignItems: "start" }}>
        
        {/* =====================================================================
            LEFT COLUMN: COMPONENT CARDS LIST
            ===================================================================== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeTab === "modules" && (
            <>
              {filteredModules.map(mod => {
                const isSelected = selectedModule?.id === mod.id;
                const isMasSiluetaStandard = mod.id === "longi-lr8-66hgd-620";
                return (
                  <div
                    key={mod.id}
                    onClick={() => setSelectedModule(mod)}
                    style={{
                      background: isSelected ? "#122417" : "#0d1510",
                      border: isSelected ? "1.5px solid var(--green, #b8f36b)" : "1px solid #1b2d21",
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {mod.manufacturer}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#edf5ef" }}>
                          {mod.model}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "var(--green, #b8f36b)" }}>
                          {mod.powerWp} <small style={{ fontSize: 11 }}>Wp</small>
                        </div>
                        <span style={{ fontSize: 10, color: "#8aa092" }}>{mod.cellType}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#8aa092", marginTop: 6, flexWrap: "wrap" }}>
                      <span>📐 {mod.heightMm} × {mod.widthMm} mm</span>
                      <span>⚡ Vmp {mod.vmp}V · Imp {mod.imp}A</span>
                      <span>🛡️ {mod.bifacial ? `Bifacial (${Math.round((mod.bifacialityFactor || 0.8) * 100)}%)` : "Monofacial"}</span>
                      <span>⚖️ {mod.weightKg} kg</span>
                    </div>

                    {isMasSiluetaStandard && (
                      <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "#1c3321", border: "1px solid #2e5938", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#b8f36b", fontWeight: 700 }}>
                        ⭐ Standar Proyek PT Mas Silueta 744 kWp (Spesifikasi .PAN Resmi)
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {activeTab === "inverters" && (
            <>
              {filteredInverters.map(inv => {
                const isSelected = selectedInverter?.id === inv.id;
                const isMasSiluetaStandard = inv.id === "huawei-sun2000-150k-mg0";
                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInverter(inv)}
                    style={{
                      background: isSelected ? "#122417" : "#0d1510",
                      border: isSelected ? "1.5px solid var(--green, #b8f36b)" : "1px solid #1b2d21",
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase" }}>
                          {inv.manufacturer}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#edf5ef" }}>
                          {inv.model}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#38bdf8" }}>
                          {inv.ratedPowerKw} <small style={{ fontSize: 11 }}>kWac</small>
                        </div>
                        <span style={{ fontSize: 10, color: "#8aa092" }}>{inv.acVoltage}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#8aa092", marginTop: 6, flexWrap: "wrap" }}>
                      <span>🎛️ {inv.mpptCount} MPPT ({inv.totalDcInputs} Inputs)</span>
                      <span>⚡ MPPT: {inv.mpptVoltageRangeV[0]}–{inv.mpptVoltageRangeV[1]} V</span>
                      <span>✨ Efisiensi: {inv.maxEfficiencyPct}%</span>
                      <span>⚖️ {inv.weightKg} kg</span>
                    </div>

                    {isMasSiluetaStandard && (
                      <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "#152a38", border: "1px solid #284c66", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#38bdf8", fontWeight: 700 }}>
                        ⭐ Inverter Utama Proyek Mas Silueta (4x 150 kW = 600 kWac)
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {activeTab === "batteries" && (
            <>
              {filteredBatteries.map(bat => {
                const isSelected = selectedBattery?.id === bat.id;
                return (
                  <div
                    key={bat.id}
                    onClick={() => setSelectedBattery(bat)}
                    style={{
                      background: isSelected ? "#122417" : "#0d1510",
                      border: isSelected ? "1.5px solid var(--green, #b8f36b)" : "1px solid #1b2d21",
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase" }}>
                          {bat.manufacturer}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#edf5ef" }}>
                          {bat.model}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b" }}>
                          {bat.ratedCapacityKwh} <small style={{ fontSize: 11 }}>kWh</small>
                        </div>
                        <span style={{ fontSize: 10, color: "#8aa092" }}>{bat.chemistry}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#8aa092", marginTop: 6, flexWrap: "wrap" }}>
                      <span>🔋 Daya: {bat.continuousPowerKw} kW</span>
                      <span>🔄 {bat.cycleLife.toLocaleString()} Siklus (@{bat.dodPct}% DoD)</span>
                      <span>❄️ {bat.coolingType}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* =====================================================================
            RIGHT COLUMN: AUTHENTIC DATASHEET SPECIFICATION VIEWER
            ===================================================================== */}
        <div style={{ background: "#0c140f", border: "1px solid #1c2e22", borderRadius: 10, padding: 20, position: "sticky", top: 20 }}>
          {activeTab === "modules" && selectedModule && (
            <div>
              {/* Header Info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1b2f22", paddingBottom: 14, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", textTransform: "uppercase" }}>
                    {selectedModule.manufacturer} · {selectedModule.series}
                  </span>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#edf5ef", margin: "4px 0" }}>
                    {selectedModule.model}
                  </h2>
                  <div style={{ fontSize: 11, color: "#8aa092" }}>
                    Sertifikasi: TüV SüD / IEC 61215 / IEC 61730 · Garansi 12 Thn Material, 30 Thn Daya
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "var(--green, #b8f36b)" }}>
                    {selectedModule.powerWp} <small style={{ fontSize: 14 }}>Wp</small>
                  </div>
                  <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
                    Efisiensi: {selectedModule.efficiencyPct}%
                  </div>
                </div>
              </div>

              {/* Action: Apply to Active Layout */}
              <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ flex: 1, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13 }}
                  onClick={() => handleApplyModule(selectedModule)}
                >
                  <Check size={16} />
                  {isId ? "Terapkan Modul Ini ke Layout Proyek Aktif" : "Apply to Active Project Layout"}
                </button>
              </div>

              {/* Technical Parameter Tables */}
              <div style={{ display: "grid", gap: 14 }}>
                {/* 1. Karakteristik Elektrikal STC */}
                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#b8f36b", marginBottom: 8, textTransform: "uppercase" }}>
                    ⚡ Karakteristik Elektrikal (STC: 1000 W/m², 25°C, AM 1.5)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Tegangan Daya (Vmp)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedModule.vmp} V</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Arus Daya (Imp)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedModule.imp} A</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Teg. Rangkaian Terbuka (Voc)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedModule.voc} V</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Arus Hubung Singkat (Isc)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedModule.isc} A</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Tegangan Sistem Maksimum</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedModule.maxSystemVoltage} V DC</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Bifaciality Factor</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>
                        {selectedModule.bifacial ? `${Math.round((selectedModule.bifacialityFactor || 0.8) * 100)}%` : "N/A"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. Koefisien Suhu (Temperature Coefficients) */}
                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 8, textTransform: "uppercase" }}>
                    🌡️ Koefisien Suhu (Penting untuk Iklim Tropis Indonesia)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Koef. Daya (γ Pmax)</span>
                      <strong style={{ fontSize: 13, color: "#f59e0b" }}>{selectedModule.tempCoeffPmax}% / °C</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Koef. Tegangan (β Voc)</span>
                      <strong style={{ fontSize: 13, color: "#f59e0b" }}>{selectedModule.tempCoeffVoc}% / °C</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Koef. Arus (α Isc)</span>
                      <strong style={{ fontSize: 13, color: "#f59e0b" }}>+{selectedModule.tempCoeffIsc}% / °C</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Dimensi Mekanikal & Struktur */}
                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 8, textTransform: "uppercase" }}>
                    📐 Dimensi Mekanikal & Berat Fisik
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Panjang</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedModule.heightMm} mm</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Lebar</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedModule.widthMm} mm</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Ketebalan</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedModule.depthMm} mm</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Berat Fisik</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedModule.weightKg} kg</strong>
                    </div>
                  </div>
                </div>

                {/* Source Verification Badge */}
                <div style={{ padding: "8px 12px", background: "#0b1510", borderRadius: 6, border: "1px solid #192d1f", fontSize: 11, color: "#8aa092", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  <span><strong>Sumber Validasi:</strong> {selectedModule.sourceRef}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "inverters" && selectedInverter && (
            <div>
              {/* Header Info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1b2f22", paddingBottom: 14, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", textTransform: "uppercase" }}>
                    {selectedInverter.manufacturer} · {selectedInverter.type}
                  </span>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#edf5ef", margin: "4px 0" }}>
                    {selectedInverter.model}
                  </h2>
                  <div style={{ fontSize: 11, color: "#8aa092" }}>
                    Sertifikasi: VDE-AR-N 4105, EN 50549-1, IEC 62109 · Proteksi IP66 Outdoor
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#38bdf8" }}>
                    {selectedInverter.ratedPowerKw} <small style={{ fontSize: 14 }}>kWac</small>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--green, #b8f36b)", fontWeight: 700 }}>
                    Maks: {selectedInverter.maxPowerKw} kWac
                  </div>
                </div>
              </div>

              {/* Technical Parameter Tables */}
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 8, textTransform: "uppercase" }}>
                    ⚡ Spesifikasi Input DC & MPPT
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Tegangan DC Maks (Voc)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedInverter.maxDcVoltageV} V</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Rentang Tegangan MPPT</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedInverter.mpptVoltageRangeV[0]}–{selectedInverter.mpptVoltageRangeV[1]} V</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Jumlah MPPT</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedInverter.mpptCount} MPPT</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Input DC Total</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedInverter.totalDcInputs} Konektor ({selectedInverter.inputsPerMppt}/MPPT)</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Arus Masuk DC Maks</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedInverter.maxDcCurrentA} A</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Efisiensi Maksimum</span>
                      <strong style={{ fontSize: 14, color: "var(--green, #b8f36b)" }}>{selectedInverter.maxEfficiencyPct}% (Euro: {selectedInverter.euroEfficiencyPct}%)</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 8, textTransform: "uppercase" }}>
                    🔌 Output Grid AC & Dimensi Fisik
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Tegangan Nominal AC</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedInverter.acVoltage}</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Arus Output AC Maks</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedInverter.maxAcCurrentA} A</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Dimensi & Berat</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedInverter.dimensionsMm.join("×")} mm · {selectedInverter.weightKg} kg</strong>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "8px 12px", background: "#0b1510", borderRadius: 6, border: "1px solid #192d1f", fontSize: 11, color: "#8aa092", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  <span><strong>Sumber Validasi:</strong> {selectedInverter.sourceRef}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "batteries" && selectedBattery && (
            <div>
              {/* Header Info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1b2f22", paddingBottom: 14, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase" }}>
                    {selectedBattery.manufacturer} · {selectedBattery.category}
                  </span>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#edf5ef", margin: "4px 0" }}>
                    {selectedBattery.model}
                  </h2>
                  <div style={{ fontSize: 11, color: "#8aa092" }}>
                    Kimia Sel: {selectedBattery.chemistry} · {selectedBattery.coolingType} · Proteksi {selectedBattery.ipRating}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b" }}>
                    {selectedBattery.ratedCapacityKwh} <small style={{ fontSize: 14 }}>kWh</small>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--green, #b8f36b)", fontWeight: 700 }}>
                    Daya: {selectedBattery.continuousPowerKw} kW
                  </div>
                </div>
              </div>

              {/* Technical Parameter Tables */}
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 8, textTransform: "uppercase" }}>
                    🔋 Spesifikasi Kapasitas & Performa BESS
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Kapasitas Terpakai</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedBattery.usableCapacityKwh} kWh</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Siklus Hidup (@{selectedBattery.dodPct}% DoD)</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedBattery.cycleLife.toLocaleString()} Siklus</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Efisiensi Bolak-Balik (RTE)</span>
                      <strong style={{ fontSize: 14, color: "var(--green, #b8f36b)" }}>{selectedBattery.roundTripEfficiencyPct}%</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Tegangan Nominal</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedBattery.nominalVoltageV} V DC</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>C-Rate Pengisian</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedBattery.cRate}</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Sistem Pendingin</span>
                      <strong style={{ fontSize: 14, color: "#edf5ef" }}>{selectedBattery.coolingType}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: "#080e0a", borderRadius: 6, border: "1px solid #17271c", padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", marginBottom: 8, textTransform: "uppercase" }}>
                    🛡️ Sistem Proteksi & Dimensi Fisik Kontainer
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, fontSize: 11 }}>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Dimensi & Berat Kabinet</span>
                      <strong style={{ fontSize: 13, color: "#edf5ef" }}>{selectedBattery.dimensionsMm.join("×")} mm · {selectedBattery.weightKg.toLocaleString()} kg</strong>
                    </div>
                    <div style={{ background: "#0e1811", padding: 8, borderRadius: 4, border: "1px solid #192a1e" }}>
                      <span style={{ color: "#8aa092", display: "block" }}>Sistem Pemadam Kebakaran</span>
                      <strong style={{ fontSize: 12, color: "#edf5ef" }}>{selectedBattery.fireSuppression}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "8px 12px", background: "#0b1510", borderRadius: 6, border: "1px solid #192d1f", fontSize: 11, color: "#8aa092", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                  <span><strong>Sumber Validasi:</strong> {selectedBattery.sourceRef}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
