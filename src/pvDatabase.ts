// pvDatabase.ts — Authentic Solar PV, Inverter, and BESS Component Library
// Built from official manufacturer datasheets, PVsyst .PAN files, and .OND files.

export interface PVModuleSpec {
  id: string;
  manufacturer: string;
  model: string;
  series: string;
  powerWp: number;
  cellType: "N-Type TOPCon" | "P-Type PERC" | "HJT" | "HPBC / BC";
  bifacial: boolean;
  bifacialityFactor?: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  weightKg: number;
  vmp: number; // V
  imp: number; // A
  voc: number; // V
  isc: number; // A
  efficiencyPct: number;
  tempCoeffPmax: number; // %/°C
  tempCoeffVoc: number; // %/°C or mV/°C
  tempCoeffIsc: number; // %/°C
  maxSystemVoltage: number; // V (1000 or 1500)
  maxSeriesFuse: number; // A
  sourceRef: string;
  panFile?: string;
  indicativePriceIdr?: number;
}

export interface InverterSpec {
  id: string;
  manufacturer: string;
  model: string;
  type: "String Inverter" | "Central Inverter" | "Hybrid / Storage Inverter";
  ratedPowerKw: number; // kWac
  maxPowerKw: number; // kWac
  acVoltage: string; // e.g. "400 Vac 3-Ph"
  maxAcCurrentA: number;
  maxDcVoltageV: number;
  mpptVoltageRangeV: [number, number]; // [min, max]
  nominalDcVoltageV: number;
  mpptCount: number;
  inputsPerMppt: number;
  totalDcInputs: number;
  maxDcCurrentA: number;
  maxEfficiencyPct: number;
  euroEfficiencyPct: number;
  dimensionsMm: [number, number, number]; // [W, H, D]
  weightKg: number;
  ipRating: string;
  sourceRef: string;
  ondFile?: string;
}

export interface BatterySpec {
  id: string;
  manufacturer: string;
  model: string;
  category: "Commercial & Industrial (C&I)" | "Utility Scale" | "Residential";
  chemistry: "LFP (LiFePO4)" | "NMC";
  ratedCapacityKwh: number;
  usableCapacityKwh: number;
  continuousPowerKw: number;
  nominalVoltageV: number;
  cRate: string;
  dodPct: number;
  cycleLife: number;
  roundTripEfficiencyPct: number;
  coolingType: "Liquid Cooled" | "HVAC Air Cooled";
  dimensionsMm: [number, number, number]; // [W, H, D]
  weightKg: number;
  ipRating: string;
  fireSuppression: string;
  sourceRef: string;
}

// ---------------------------------------------------------------------------
// 1. AUTHENTIC PV MODULES (Grounded in PVsyst .PAN files & Factory Datasheets)
// ---------------------------------------------------------------------------
export const AUTHENTIC_PV_MODULES: PVModuleSpec[] = [
  {
    id: "longi-lr8-66hgd-620",
    manufacturer: "Longi Solar",
    model: "LR8-66HGD-620 Wp",
    series: "Hi-MO 7 Bifacial Dual-Glass",
    powerWp: 620,
    cellType: "N-Type TOPCon",
    bifacial: true,
    bifacialityFactor: 0.80,
    widthMm: 1134,
    heightMm: 2382,
    depthMm: 30,
    weightKg: 32.2,
    vmp: 40.91,
    imp: 15.16,
    voc: 48.78,
    isc: 16.05,
    efficiencyPct: 22.97,
    tempCoeffPmax: -0.28,
    tempCoeffVoc: -0.254,
    tempCoeffIsc: 0.045,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 30,
    sourceRef: "PVsyst 7.4.7 .PAN file (TüV SüD Certified) — Mas Silueta Standard",
    panFile: "Longi_LR8-66HGD-620 Wp.PAN",
    indicativePriceIdr: 1680000,
  },
  {
    id: "longi-lr5-72hth-580m",
    manufacturer: "Longi Solar",
    model: "LR5-72HTH-580M",
    series: "Hi-MO 6 Explorer HPBC",
    powerWp: 580,
    cellType: "HPBC / BC",
    bifacial: false,
    bifacialityFactor: 0.0,
    widthMm: 1134,
    heightMm: 2278,
    depthMm: 35,
    weightKg: 27.5,
    vmp: 44.06,
    imp: 13.17,
    voc: 52.21,
    isc: 14.09,
    efficiencyPct: 22.5,
    tempCoeffPmax: -0.29,
    tempCoeffVoc: -0.23,
    tempCoeffIsc: 0.05,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 25,
    sourceRef: "LONGi Solar Official Datasheet 2024",
    indicativePriceIdr: 1560000,
  },
  {
    id: "jinko-jkm620n-72hl4-bdv",
    manufacturer: "JinkoSolar",
    model: "JKM620N-72HL4-BDV",
    series: "Tiger Neo N-Type Bifacial",
    powerWp: 620,
    cellType: "N-Type TOPCon",
    bifacial: true,
    bifacialityFactor: 0.80,
    widthMm: 1134,
    heightMm: 2382,
    depthMm: 30,
    weightKg: 32.5,
    vmp: 43.12,
    imp: 14.38,
    voc: 51.52,
    isc: 15.02,
    efficiencyPct: 22.95,
    tempCoeffPmax: -0.29,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.045,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 30,
    sourceRef: "JinkoSolar Global Product Datasheet 2024",
    indicativePriceIdr: 1675000,
  },
  {
    id: "trina-tsm-neg21c20-660",
    manufacturer: "Trina Solar",
    model: "TSM-NEG21C.20-660W",
    series: "Vertex N Dual-Glass Bifacial",
    powerWp: 660,
    cellType: "N-Type TOPCon",
    bifacial: true,
    bifacialityFactor: 0.80,
    widthMm: 1303,
    heightMm: 2384,
    depthMm: 33,
    weightKg: 38.3,
    vmp: 39.4,
    imp: 16.76,
    voc: 47.4,
    isc: 17.77,
    efficiencyPct: 21.6,
    tempCoeffPmax: -0.30,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.04,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 35,
    sourceRef: "Trina Solar Vertex N Specification Document",
    indicativePriceIdr: 1780000,
  },
  {
    id: "canadian-cs6w-600t",
    manufacturer: "Canadian Solar",
    model: "CS6W-600T",
    series: "TOPHiKu6 N-Type",
    powerWp: 600,
    cellType: "N-Type TOPCon",
    bifacial: false,
    bifacialityFactor: 0.0,
    widthMm: 1134,
    heightMm: 2278,
    depthMm: 30,
    weightKg: 27.6,
    vmp: 42.4,
    imp: 14.16,
    voc: 51.0,
    isc: 14.88,
    efficiencyPct: 23.2,
    tempCoeffPmax: -0.29,
    tempCoeffVoc: -0.25,
    tempCoeffIsc: 0.05,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 25,
    sourceRef: "Canadian Solar Technical Datasheet",
    indicativePriceIdr: 1620000,
  },
  {
    id: "ja-solar-jam72d40-585",
    manufacturer: "JA Solar",
    model: "JAM72D40-585/LB",
    series: "DeepBlue 4.0 Pro Bifacial",
    powerWp: 585,
    cellType: "N-Type TOPCon",
    bifacial: true,
    bifacialityFactor: 0.80,
    widthMm: 1134,
    heightMm: 2278,
    depthMm: 30,
    weightKg: 31.8,
    vmp: 43.18,
    imp: 13.55,
    voc: 51.68,
    isc: 14.36,
    efficiencyPct: 22.6,
    tempCoeffPmax: -0.30,
    tempCoeffVoc: -0.26,
    tempCoeffIsc: 0.046,
    maxSystemVoltage: 1500,
    maxSeriesFuse: 30,
    sourceRef: "JA Solar Official Product Brochure 2024",
    indicativePriceIdr: 1580000,
  },
];

// ---------------------------------------------------------------------------
// 2. AUTHENTIC INVERTERS (Grounded in PVsyst .OND files & Factory Datasheets)
// ---------------------------------------------------------------------------
export const AUTHENTIC_INVERTERS: InverterSpec[] = [
  {
    id: "huawei-sun2000-150k-mg0",
    manufacturer: "Huawei Technologies",
    model: "SUN2000-150K-MG0-400V",
    type: "String Inverter",
    ratedPowerKw: 150,
    maxPowerKw: 165,
    acVoltage: "400 Vac 3-Ph (3W+N+PE)",
    maxAcCurrentA: 240.5,
    maxDcVoltageV: 1100,
    mpptVoltageRangeV: [200, 1000],
    nominalDcVoltageV: 600,
    mpptCount: 7,
    inputsPerMppt: 3,
    totalDcInputs: 21,
    maxDcCurrentA: 336, // total array current limit
    maxEfficiencyPct: 98.8,
    euroEfficiencyPct: 98.6,
    dimensionsMm: [1000, 710, 395],
    weightKg: 99.0,
    ipRating: "IP66",
    sourceRef: "PVsyst 7.4 .OND file (Huawei Manufacturer 2024) — Mas Silueta Standard",
    ondFile: "SUN2000-150K-MG0-400Vac(20240724).OND",
  },
  {
    id: "sungrow-sg125hx",
    manufacturer: "Sungrow Power Supply",
    model: "SG125HX",
    type: "String Inverter",
    ratedPowerKw: 125,
    maxPowerKw: 125,
    acVoltage: "400 Vac 3-Ph",
    maxAcCurrentA: 180.5,
    maxDcVoltageV: 1100,
    mpptVoltageRangeV: [180, 1000],
    nominalDcVoltageV: 600,
    mpptCount: 6,
    inputsPerMppt: 2,
    totalDcInputs: 12,
    maxDcCurrentA: 180,
    maxEfficiencyPct: 98.6,
    euroEfficiencyPct: 98.3,
    dimensionsMm: [1029, 731, 363],
    weightKg: 85.0,
    ipRating: "IP66",
    sourceRef: "Sungrow Global Product Catalog 2024",
  },
  {
    id: "huawei-sun2000-100ktl-m2",
    manufacturer: "Huawei Technologies",
    model: "SUN2000-100KTL-M2",
    type: "String Inverter",
    ratedPowerKw: 100,
    maxPowerKw: 110,
    acVoltage: "400 Vac 3-Ph",
    maxAcCurrentA: 160.4,
    maxDcVoltageV: 1100,
    mpptVoltageRangeV: [200, 1000],
    nominalDcVoltageV: 600,
    mpptCount: 10,
    inputsPerMppt: 2,
    totalDcInputs: 20,
    maxDcCurrentA: 260,
    maxEfficiencyPct: 98.8,
    euroEfficiencyPct: 98.6,
    dimensionsMm: [1035, 700, 365],
    weightKg: 90.0,
    ipRating: "IP66",
    sourceRef: "Huawei FusionSolar Commercial Datasheet",
  },
  {
    id: "growatt-max-125ktl3-x",
    manufacturer: "Growatt New Energy",
    model: "MAX 125KTL3-X LV",
    type: "String Inverter",
    ratedPowerKw: 125,
    maxPowerKw: 137.5,
    acVoltage: "400 Vac 3-Ph",
    maxAcCurrentA: 199.3,
    maxDcVoltageV: 1100,
    mpptVoltageRangeV: [180, 1000],
    nominalDcVoltageV: 600,
    mpptCount: 10,
    inputsPerMppt: 2,
    totalDcInputs: 20,
    maxDcCurrentA: 320,
    maxEfficiencyPct: 98.7,
    euroEfficiencyPct: 98.4,
    dimensionsMm: [970, 640, 345],
    weightKg: 84.0,
    ipRating: "IP66",
    sourceRef: "Growatt Commercial Inverter Specifications",
  },
  {
    id: "sma-shp-150-20",
    manufacturer: "SMA Solar Technology",
    model: "Sunny Highpower PEAK3 SHP 150-20",
    type: "String Inverter",
    ratedPowerKw: 150,
    maxPowerKw: 150,
    acVoltage: "400 Vac 3-Ph",
    maxAcCurrentA: 216.5,
    maxDcVoltageV: 1500,
    mpptVoltageRangeV: [590, 1000],
    nominalDcVoltageV: 800,
    mpptCount: 1, // Centralized MPPT architecture
    inputsPerMppt: 12,
    totalDcInputs: 12,
    maxDcCurrentA: 240,
    maxEfficiencyPct: 99.1,
    euroEfficiencyPct: 98.8,
    dimensionsMm: [770, 830, 444],
    weightKg: 98.0,
    ipRating: "IP65",
    sourceRef: "SMA PEAK3 Technical Specification 2024",
  },
];

// ---------------------------------------------------------------------------
// 3. AUTHENTIC BATTERY SYSTEMS (BESS - C&I and Utility Scale)
// ---------------------------------------------------------------------------
export const AUTHENTIC_BATTERIES: BatterySpec[] = [
  {
    id: "huawei-luna2000-200kwh-2h1",
    manufacturer: "Huawei Technologies",
    model: "LUNA2000-200KWH-2H1",
    category: "Commercial & Industrial (C&I)",
    chemistry: "LFP (LiFePO4)",
    ratedCapacityKwh: 193.5,
    usableCapacityKwh: 193.5,
    continuousPowerKw: 100,
    nominalVoltageV: 720,
    cRate: "0.5C",
    dodPct: 100,
    cycleLife: 6500,
    roundTripEfficiencyPct: 95.0,
    coolingType: "Liquid Cooled",
    dimensionsMm: [1810, 2135, 1200],
    weightKg: 2950,
    ipRating: "IP66",
    fireSuppression: "Integrated Smart Aerosol & Deflagration Protection",
    sourceRef: "Huawei FusionSolar Smart String BESS Datasheet 2024",
  },
  {
    id: "byd-battery-box-commercial-c200",
    manufacturer: "BYD Energy",
    model: "Battery-Box Commercial C200",
    category: "Commercial & Industrial (C&I)",
    chemistry: "LFP (LiFePO4)",
    ratedCapacityKwh: 209.0,
    usableCapacityKwh: 198.0,
    continuousPowerKw: 100,
    nominalVoltageV: 768,
    cRate: "0.5C",
    dodPct: 95,
    cycleLife: 6000,
    roundTripEfficiencyPct: 94.5,
    coolingType: "HVAC Air Cooled",
    dimensionsMm: [1300, 2200, 1100],
    weightKg: 2450,
    ipRating: "IP55",
    fireSuppression: "FM200 / NOVEC1230 Clean Agent System",
    sourceRef: "BYD Energy Commercial Storage Specification",
  },
  {
    id: "catl-enerone-372kwh",
    manufacturer: "CATL",
    model: "EnerOne Liquid-Cooling Outdoor Cabinet",
    category: "Utility Scale",
    chemistry: "LFP (LiFePO4)",
    ratedCapacityKwh: 372.7,
    usableCapacityKwh: 372.7,
    continuousPowerKw: 186,
    nominalVoltageV: 1331.2,
    cRate: "0.5C / 1.0C",
    dodPct: 100,
    cycleLife: 8000,
    roundTripEfficiencyPct: 95.5,
    coolingType: "Liquid Cooled",
    dimensionsMm: [1300, 2300, 1300],
    weightKg: 3800,
    ipRating: "IP66",
    fireSuppression: "Dual-circuit Gas Fire Suppression & Venting",
    sourceRef: "CATL EnerOne Product Whitepaper & UL9540A Test Report",
  },
  {
    id: "sungrow-powerstack-st500cp",
    manufacturer: "Sungrow Power Supply",
    model: "PowerStack ST500CP-250HV",
    category: "Commercial & Industrial (C&I)",
    chemistry: "LFP (LiFePO4)",
    ratedCapacityKwh: 500.0,
    usableCapacityKwh: 480.0,
    continuousPowerKw: 250,
    nominalVoltageV: 1152,
    cRate: "0.5C",
    dodPct: 96,
    cycleLife: 7000,
    roundTripEfficiencyPct: 95.0,
    coolingType: "Liquid Cooled",
    dimensionsMm: [2600, 2200, 1400],
    weightKg: 5200,
    ipRating: "IP66",
    fireSuppression: "Perfluorohexanone (Novec 1230) Suppression System",
    sourceRef: "Sungrow PowerStack BESS Global Datasheet",
  },
];

// ---------------------------------------------------------------------------
// 4. PARSER HELPERS FOR PVSYST .PAN AND .OND FILES
// ---------------------------------------------------------------------------

/**
 * Parses raw text from a PVsyst .PAN file into a structured PVModuleSpec.
 */
export function parsePanFile(content: string): Partial<PVModuleSpec> | null {
  try {
    const lines = content.split(/\r?\n/);
    const getVal = (key: string): string => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(key + "=")) {
          return trimmed.substring(key.length + 1).trim();
        }
      }
      return "";
    };

    const manufacturer = getVal("Manufacturer") || "Custom PV";
    const model = getVal("Model") || "Custom Model";
    const width = parseFloat(getVal("Width")) || 1.134;
    const height = parseFloat(getVal("Height")) || 2.278;
    const depth = parseFloat(getVal("Depth")) || 0.035;
    const weight = parseFloat(getVal("Weight")) || 28.0;
    const pnom = parseFloat(getVal("PNom")) || 580.0;
    const vmp = parseFloat(getVal("Vmp")) || 42.0;
    const imp = parseFloat(getVal("Imp")) || 13.8;
    const voc = parseFloat(getVal("Voc")) || 50.0;
    const isc = parseFloat(getVal("Isc")) || 14.5;
    const bifacialFactor = parseFloat(getVal("BifacialityFactor")) || 0.0;
    const muPmp = parseFloat(getVal("muPmpReq")) || -0.29;
    const muVoc = parseFloat(getVal("muVocSpec")) || -124.0;
    const muIsc = parseFloat(getVal("muISC")) || 7.22;
    const vmax = parseFloat(getVal("VMaxIEC")) || 1500;

    return {
      id: `imported-${Date.now()}-${model.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      manufacturer,
      model,
      series: "Imported PVsyst .PAN",
      powerWp: pnom,
      cellType: "N-Type TOPCon",
      bifacial: bifacialFactor > 0.05,
      bifacialityFactor: bifacialFactor,
      widthMm: Math.round(width * 1000),
      heightMm: Math.round(height * 1000),
      depthMm: Math.round(depth * 1000),
      weightKg: weight,
      vmp,
      imp,
      voc,
      isc,
      efficiencyPct: parseFloat(((pnom / (width * height * 1000)) * 100).toFixed(2)),
      tempCoeffPmax: muPmp,
      tempCoeffVoc: muVoc < 0 && muVoc > -1 ? muVoc : parseFloat((muVoc / (voc * 10)).toFixed(3)),
      tempCoeffIsc: muIsc > 0 && muIsc < 1 ? muIsc : parseFloat((muIsc / (isc * 10)).toFixed(3)),
      maxSystemVoltage: vmax,
      maxSeriesFuse: Math.ceil(isc * 1.5 / 5) * 5,
      sourceRef: "User Uploaded PVsyst .PAN File",
    };
  } catch (err) {
    console.error("Failed to parse PAN file:", err);
    return null;
  }
}

/**
 * Parses raw text from a PVsyst .OND file into a structured InverterSpec.
 */
export function parseOndFile(content: string): Partial<InverterSpec> | null {
  try {
    const lines = content.split(/\r?\n/);
    const getVal = (key: string): string => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(key + "=")) {
          return trimmed.substring(key.length + 1).trim();
        }
      }
      return "";
    };

    const manufacturer = getVal("Manufacturer") || "Custom Inverter";
    const model = getVal("Model") || "Custom Model";
    const pnom = parseFloat(getVal("PNomConv")) || 100.0;
    const pmax = parseFloat(getVal("PMaxOUT")) || pnom * 1.1;
    const vout = parseFloat(getVal("VOutConv")) || 400.0;
    const vmppMin = parseFloat(getVal("VMppMin")) || 200.0;
    const vmppMax = parseFloat(getVal("VMPPMax")) || 1000.0;
    const vmax = parseFloat(getVal("VAbsMax")) || 1100.0;
    const imaxAc = parseFloat(getVal("IMaxAC")) || 160.0;
    const imaxDc = parseFloat(getVal("IMaxDC")) || 200.0;
    const nbMppt = parseInt(getVal("NbMPPT"), 10) || 6;
    const nbInputs = parseInt(getVal("NbInputs"), 10) || nbMppt * 2;
    const efficMax = parseFloat(getVal("EfficMax")) || 98.6;
    const efficEuro = parseFloat(getVal("EfficEuro")) || 98.3;
    const width = parseFloat(getVal("Width")) || 1.0;
    const height = parseFloat(getVal("Height")) || 0.7;
    const depth = parseFloat(getVal("Depth")) || 0.35;
    const weight = parseFloat(getVal("Weight")) || 80.0;

    return {
      id: `imported-${Date.now()}-${model.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      manufacturer,
      model,
      type: "String Inverter",
      ratedPowerKw: pnom,
      maxPowerKw: pmax,
      acVoltage: `${vout.toFixed(0)} Vac 3-Ph`,
      maxAcCurrentA: imaxAc,
      maxDcVoltageV: vmax,
      mpptVoltageRangeV: [vmppMin, vmppMax],
      nominalDcVoltageV: 600,
      mpptCount: nbMppt,
      inputsPerMppt: Math.max(1, Math.round(nbInputs / nbMppt)),
      totalDcInputs: nbInputs,
      maxDcCurrentA: imaxDc,
      maxEfficiencyPct: efficMax,
      euroEfficiencyPct: efficEuro,
      dimensionsMm: [Math.round(width * 1000), Math.round(height * 1000), Math.round(depth * 1000)],
      weightKg: weight,
      ipRating: "IP66",
      sourceRef: "User Uploaded PVsyst .OND File",
    };
  } catch (err) {
    console.error("Failed to parse OND file:", err);
    return null;
  }
}
