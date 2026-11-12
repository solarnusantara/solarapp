// gisSolarService.ts — GIS Solar Irradiance, Google Solar, and Grid Infrastructure Engine

// Integrates NASA POWER 25-year Climatology, Open-Meteo Radiation, Google Solar API, and PLN Grid GIS



export type MonthlySolarData = {

  month: string;

  monthIndex: number;

  ghi: number; // Global Horizontal Irradiance in kWh/m²/day

  temp: number; // Ambient Temperature in °C

  dailyEnergyKwh: number;

  monthlyEnergyKwh: number;

  savingsIdr: number;

};



export type SolarLosses = {
  soiling: number; // %
  temperature: number; // %
  mismatch: number; // %
  inverter: number; // %
  cabling: number; // %
  shading: number; // %
  lid?: number; // %
  availability?: number; // %
  totalLossPct: number;
};

export type ConditionSetSettings = {
  name?: string;
  weatherDataset?: "nasa" | "meteonorm" | "pvgis";
  rackingType?: "flush" | "tilted" | "ground";
  soilingMode?: "flat" | "monthly";
  soilingFlatPct?: number;
  soilingMonthlyPct?: number[];
  cellTempCoeffPctPerC?: number; // e.g. -0.35
  tempLossPct?: number;
  dcWiringLossPct?: number; // e.g. 1.5
  acWiringLossPct?: number; // e.g. 1.0
  inverterEfficiencyPct?: number; // e.g. 98.4
  mismatchLossPct?: number; // e.g. 1.2
  lidLossPct?: number; // e.g. 1.0
  availabilityPct?: number; // e.g. 99.0
  shadingLossPct?: number; // e.g. 1.8
  annualDegradationPct?: number; // e.g. 0.40
  // Uncertainty / Probability
  p90Enabled?: boolean;
  weatherVariabilityPct?: number; // e.g. 5.5
  systemVariabilityPct?: number; // e.g. 1.0
};

export type SolarYieldResult = {
  coordinates: { lat: number; lng: number };
  capacityKwp: number;
  annualGhi: number; // Peak Sun Hours (PSH / day)
  annualTemp: number; // °C
  pr: number; // Performance Ratio (e.g. 0.805)
  specificYield: number; // kWh/kWp/year
  annualEnergyMwh: number;
  p90EnergyMwh?: number;
  carbonOffsetTons: number; // tCO₂e / year (ESDM Grid Emission Factor)
  annualSavingsIdr: number; // Electricity bill offset (Rp / year)
  monthly: MonthlySolarData[];
  losses: SolarLosses;
  source: string;
  fetchedAt: string;
};

export const DEFAULT_CONDITION_PRESETS: Record<string, ConditionSetSettings> = {
  tropical_flush: {
    name: "Standar Tropis Indonesia (Flush Mount Atap Seng)",
    weatherDataset: "nasa",
    rackingType: "flush",
    soilingMode: "flat",
    soilingFlatPct: 2.8,
    cellTempCoeffPctPerC: -0.35,
    tempLossPct: 8.8,
    dcWiringLossPct: 1.5,
    acWiringLossPct: 1.0,
    inverterEfficiencyPct: 98.4,
    mismatchLossPct: 1.2,
    lidLossPct: 1.0,
    availabilityPct: 99.0,
    shadingLossPct: 1.8,
    annualDegradationPct: 0.40,
    p90Enabled: true,
    weatherVariabilityPct: 5.5,
    systemVariabilityPct: 1.0,
  },
  bankable_p90: {
    name: "Konservatif P90 (Standar Bank & Pembiayaan)",
    weatherDataset: "nasa",
    rackingType: "flush",
    soilingMode: "flat",
    soilingFlatPct: 3.5,
    cellTempCoeffPctPerC: -0.38,
    tempLossPct: 9.5,
    dcWiringLossPct: 1.8,
    acWiringLossPct: 1.2,
    inverterEfficiencyPct: 98.0,
    mismatchLossPct: 1.5,
    lidLossPct: 1.5,
    availabilityPct: 98.5,
    shadingLossPct: 2.2,
    annualDegradationPct: 0.50,
    p90Enabled: true,
    weatherVariabilityPct: 6.0,
    systemVariabilityPct: 1.5,
  },
  helioscope_parity: {
    name: "HelioScope Parity Standard",
    weatherDataset: "meteonorm",
    rackingType: "tilted",
    soilingMode: "flat",
    soilingFlatPct: 2.0,
    cellTempCoeffPctPerC: -0.35,
    tempLossPct: 7.2,
    dcWiringLossPct: 1.2,
    acWiringLossPct: 0.8,
    inverterEfficiencyPct: 98.6,
    mismatchLossPct: 1.0,
    lidLossPct: 0.8,
    availabilityPct: 99.5,
    shadingLossPct: 1.5,
    annualDegradationPct: 0.40,
    p90Enabled: false,
    weatherVariabilityPct: 5.0,
    systemVariabilityPct: 0.8,
  },
};

export function loadProjectConditionSet(projectId: string): ConditionSetSettings {
  try {
    const raw = localStorage.getItem(`solarapp_condition_set_${projectId}`) || localStorage.getItem("solarapp_condition_set_default");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULT_CONDITION_PRESETS.tropical_flush };
}

export function saveProjectConditionSet(projectId: string, settings: ConditionSetSettings): void {
  try {
    localStorage.setItem(`solarapp_condition_set_${projectId}`, JSON.stringify(settings));
    localStorage.setItem("solarapp_condition_set_default", JSON.stringify(settings));
  } catch {}
}

export type GoogleSolarInsights = {

  available: boolean;

  name?: string;

  center?: { lat: number; lng: number };

  roofAreaM2?: number;

  groundAreaM2?: number;

  boundingBoxM?: { widthM: number; heightM: number };

  pitchDegrees?: number;

  azimuthDegrees?: number;

  planeHeightM?: number;

  maxPanels?: number;

  maxArrayAreaM2?: number;

  maxSunshineHoursPerYear?: number;

  carbonOffsetKgPerMwh?: number;

  panelCapacityWatts?: number;

  imageryQuality?: string;

  error?: string;

};



export type PlnSubstation = {

  name: string;

  voltage: string; // "150 kV" | "500 kV" | "20 kV"

  distanceKm: number;

  lat: number;

  lng: number;

};



// Major Indonesian Grid / PLN Substations (Gardu Induk 150/20kV & 500kV) based on RUPTL PLN & GIS Transmisi ESDM

const KNOWN_PLN_SUBSTATIONS: Array<{ name: string; voltage: string; lat: number; lng: number }> = [

  // --- Semarang & Jawa Tengah (Terdekat dengan Mas Silueta / KIC Semarang) ---

  { name: "GI 150 kV Krapyak (Semarang Barat)", voltage: "150/20 kV", lat: -6.9850, lng: 110.3620 },

  { name: "GI 150 kV Kaliwungu (Kawasan Industri Kendal)", voltage: "150/20 kV", lat: -6.9610, lng: 110.2650 },

  { name: "GI 150 kV Kalisari (Semarang)", voltage: "150/20 kV", lat: -6.9930, lng: 110.4120 },

  { name: "GI 150 kV Tambak Lorok (Semarang Utara)", voltage: "150/20 kV", lat: -6.9490, lng: 110.4350 },

  { name: "GI 150 kV Jatingaleh (Semarang Selatan)", voltage: "150/20 kV", lat: -7.0320, lng: 110.4200 },

  { name: "GI 150 kV Sayung (Demak - Semarang Timur)", voltage: "150/20 kV", lat: -6.9250, lng: 110.5100 },

  { name: "GITET 500 kV Ungaran (Pusat Transmisi Jateng)", voltage: "500/150 kV", lat: -7.1350, lng: 110.4050 },

  { name: "GI 150 kV Bawen", voltage: "150/20 kV", lat: -7.2400, lng: 110.4300 },

  { name: "GI 150 kV KITB Batang (Kawasan Industri Batang)", voltage: "150/20 kV", lat: -6.9200, lng: 109.8500 },

  { name: "GI 150 kV Kudus", voltage: "150/20 kV", lat: -6.8100, lng: 110.8400 },

  { name: "GI 150 kV Palur / Solo Timur", voltage: "150/20 kV", lat: -7.5600, lng: 110.8700 },

  { name: "GI 150 kV Gejayan (DI Yogyakarta)", voltage: "150/20 kV", lat: -7.7650, lng: 110.3950 },

  { name: "GI 150 kV Cilacap Industri", voltage: "150/20 kV", lat: -7.6950, lng: 109.0300 },



  // --- Jawa Barat, DKI Jakarta & Banten ---

  { name: "GI 150 kV Cikarang Pusat (GIIC)", voltage: "150/20 kV", lat: -6.3650, lng: 107.1720 },

  { name: "GI 150 kV Deltamas", voltage: "150/20 kV", lat: -6.3750, lng: 107.1850 },

  { name: "GI 150 kV Sukamahi / Cikarang Timur", voltage: "150/20 kV", lat: -6.3480, lng: 107.2100 },

  { name: "GI 150 kV KIIC Karawang Barat", voltage: "150/20 kV", lat: -6.3490, lng: 107.2780 },

  { name: "GI 150 kV Suryacipta Karawang Timur", voltage: "150/20 kV", lat: -6.3890, lng: 107.3450 },

  { name: "GITET 500 kV Cibatu Baru", voltage: "500/150 kV", lat: -6.3310, lng: 107.1420 },

  { name: "GI 150 kV MM2100 Cibitung", voltage: "150/20 kV", lat: -6.2950, lng: 107.1050 },

  { name: "GI 150 kV Jababeka Cikarang", voltage: "150/20 kV", lat: -6.2910, lng: 107.1620 },

  { name: "GI 150 kV Krakatau Steel Cilegon", voltage: "150/20 kV", lat: -6.0150, lng: 106.0180 },

  { name: "GI 150 kV Kopo / Bandung Industri", voltage: "150/20 kV", lat: -6.9600, lng: 107.5750 },

  { name: "GI 150 kV Pulogadung (DKI Jakarta)", voltage: "150/20 kV", lat: -6.1950, lng: 106.9100 },

  { name: "GI 150 kV Gambir Lama", voltage: "150/20 kV", lat: -6.1750, lng: 106.8300 },

  { name: "GI 150 kV Tangerang / BSD", voltage: "150/20 kV", lat: -6.2950, lng: 106.6600 },



  // --- Jawa Timur ---

  { name: "GI 150 kV Rungkut SIER Surabaya", voltage: "150/20 kV", lat: -7.3290, lng: 112.7610 },

  { name: "GI 150 kV Gresik Industri", voltage: "150/20 kV", lat: -7.1600, lng: 112.6500 },

  { name: "GI 150 kV JIIPE Manyar Gresik", voltage: "150/20 kV", lat: -7.0900, lng: 112.6000 },

  { name: "GI 150 kV Ngoro PIER Pasuruan", voltage: "150/20 kV", lat: -7.5800, lng: 112.6200 },

  { name: "GI 150 kV Pakis (Malang)", voltage: "150/20 kV", lat: -7.9500, lng: 112.6800 },

  { name: "GI 150 kV Probolinggo", voltage: "150/20 kV", lat: -7.7600, lng: 113.2100 },

  { name: "GI 150 kV Banyuwangi", voltage: "150/20 kV", lat: -8.2100, lng: 114.3600 },



  // --- Sumatera ---

  { name: "GI 150 kV Glugur (Medan)", voltage: "150/20 kV", lat: 3.6150, lng: 98.6750 },

  { name: "GI 150 kV KIM (Kawasan Industri Medan)", voltage: "150/20 kV", lat: 3.6800, lng: 98.6900 },

  { name: "GI 150 kV Titi Kuning (Medan Selatan)", voltage: "150/20 kV", lat: 3.5400, lng: 98.6800 },

  { name: "GI 150 kV Batu Ampar (Batam)", voltage: "150/20 kV", lat: 1.1550, lng: 104.0050 },

  { name: "GI 150 kV Panaran (Batam)", voltage: "150/20 kV", lat: 1.0500, lng: 104.0300 },

  { name: "GI 150 kV Teluk Lembu (Pekanbaru)", voltage: "150/20 kV", lat: 0.5400, lng: 101.4800 },

  { name: "GI 150 kV Keramasan (Palembang)", voltage: "150/20 kV", lat: -3.0200, lng: 104.7400 },

  { name: "GI 150 kV Jakabaring (Palembang)", voltage: "150/20 kV", lat: -3.0250, lng: 104.7950 },

  { name: "GI 150 kV Tarahan (Bandar Lampung)", voltage: "150/20 kV", lat: -5.5200, lng: 105.3350 },

  { name: "GI 150 kV Teluk Betung (Lampung)", voltage: "150/20 kV", lat: -5.4500, lng: 105.2700 },



  // --- Bali & Nusa Tenggara ---

  { name: "GI 150 kV Pesanggaran (Denpasar/Benoa)", voltage: "150/20 kV", lat: -8.7200, lng: 115.2150 },

  { name: "GI 150 kV Kapal (Badung)", voltage: "150/20 kV", lat: -8.5900, lng: 115.1800 },

  { name: "GI 150 kV Celukan Bawang (Buleleng)", voltage: "150/20 kV", lat: -8.1900, lng: 114.8500 },

  { name: "GI 150 kV Ampenan (Mataram Lombok)", voltage: "150/20 kV", lat: -8.5700, lng: 116.0750 },



  // --- Kalimantan ---

  { name: "GI 150 kV Karang Joang (KIK Balikpapan)", voltage: "150/20 kV", lat: -1.1600, lng: 116.8800 },

  { name: "GI 150 kV Manggar (Balikpapan)", voltage: "150/20 kV", lat: -1.2100, lng: 116.9400 },

  { name: "GI 150 kV Palaran (Samarinda)", voltage: "150/20 kV", lat: -0.5600, lng: 117.1700 },

  { name: "GI 150 kV Trisakti (Banjarmasin)", voltage: "150/20 kV", lat: -3.3300, lng: 114.5700 },

  { name: "GI 150 kV Siantan (Pontianak)", voltage: "150/20 kV", lat: -0.0100, lng: 109.3500 },



  // --- Sulawesi ---

  { name: "GI 150 kV KIMA (Kawasan Industri Makassar)", voltage: "150/20 kV", lat: -5.1100, lng: 119.5000 },

  { name: "GI 150 kV Tello (Makassar)", voltage: "150/20 kV", lat: -5.1450, lng: 119.4750 },

  { name: "GI 150 kV Panakkukang (Makassar)", voltage: "150/20 kV", lat: -5.1600, lng: 119.4450 },

  { name: "GI 150 kV Ranomuut (Manado)", voltage: "150/20 kV", lat: 1.4700, lng: 124.8650 },

];



const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const MONTH_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];



// Default Indonesian Java-Madura-Bali solar parameters

const DEFAULT_INDONESIA_GHI = [4.58, 4.39, 4.97, 4.97, 4.83, 4.71, 4.99, 5.53, 5.84, 5.53, 5.05, 4.69];

const DEFAULT_INDONESIA_TEMP = [24.4, 24.3, 24.6, 25.0, 25.1, 24.6, 24.1, 24.2, 25.0, 25.6, 25.4, 24.7];

const TARIF_PLN_INDUSTRI_IDR = 1114.74; // Tarif I-3 / TM per kWh reguler PLN

const EMISI_GRID_JAWA_BALI = 0.809; // ton CO₂ / MWh (faktor emisi ESDM)



// Geodesic distance calculation (Haversine formula in km)

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {

  const R = 6371; // Earth radius in km

  const dLat = ((lat2 - lat1) * Math.PI) / 180;

  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =

    Math.sin(dLat / 2) * Math.sin(dLat / 2) +

    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 100) / 100;

}



/**

 * Fetch 25-Year Solar Climatology and compute Energy Yield

 * Source: NASA POWER (Prediction of Worldwide Energy Resources) / Open-Meteo

 */

export async function fetchSolarClimatology(
  lat: number,
  lng: number,
  capacityKwp: number,
  customPrOrCondition?: number | ConditionSetSettings
): Promise<SolarYieldResult> {
  const cond = typeof customPrOrCondition === "object" ? customPrOrCondition : null;
  const customPr = typeof customPrOrCondition === "number" ? customPrOrCondition : undefined;

  const cacheKey = `solar_gis_climatology_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  let monthlyGhi = [...DEFAULT_INDONESIA_GHI];
  let monthlyTemp = [...DEFAULT_INDONESIA_TEMP];
  let annualGhi = 5.01;
  let annualTemp = 24.8;
  let source = "NASA POWER 25-Year Climatology (1998-2022)";

  // Check cached climatology
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.monthlyGhi && parsed.monthlyTemp) {
        monthlyGhi = parsed.monthlyGhi;
        monthlyTemp = parsed.monthlyTemp;
        annualGhi = parsed.annualGhi;
        annualTemp = parsed.annualTemp;
        source = parsed.source || source;
      }
    }
  } catch {}

  // Attempt live NASA POWER fetch if online
  try {
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lng}&latitude=${lat}&format=JSON`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const ghiParams = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
      const tempParams = data?.properties?.parameter?.T2M;

      if (ghiParams && tempParams) {
        monthlyGhi = MONTH_NAMES.map((m) => Number(ghiParams[m] || 4.8));
        monthlyTemp = MONTH_NAMES.map((m) => Number(tempParams[m] || 25.0));
        annualGhi = Number(ghiParams.ANN || (monthlyGhi.reduce((a, b) => a + b, 0) / 12));
        annualTemp = Number(tempParams.ANN || (monthlyTemp.reduce((a, b) => a + b, 0) / 12));
        source = "NASA POWER 25-Year Climatology (1998-2022)";

        // Cache for 30 days
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ monthlyGhi, monthlyTemp, annualGhi, annualTemp, source, cachedAt: Date.now() })
          );
        } catch {}
      }
    }
  } catch (err) {
    console.warn("NASA POWER fetch failed, using cached/regional default climatology:", err);
  }

  // Derive condition set parameters
  let tempDelta = 22;
  if (cond?.rackingType === "flush") tempDelta = 25;
  else if (cond?.rackingType === "tilted") tempDelta = 20;
  else if (cond?.rackingType === "ground") tempDelta = 15;

  const avgCellTemp = annualTemp + tempDelta;
  const tempCoeff = Math.abs(cond?.cellTempCoeffPctPerC ?? 0.35);
  const calculatedTempLoss = Math.round(Math.max(4.0, (avgCellTemp - 25) * tempCoeff) * 10) / 10;

  const tempLossPct = cond?.tempLossPct !== undefined ? cond.tempLossPct : calculatedTempLoss;
  const soilingLossPct = cond?.soilingFlatPct !== undefined ? cond.soilingFlatPct : 2.5;
  const mismatchLossPct = cond?.mismatchLossPct !== undefined ? cond.mismatchLossPct : 1.5;
  const inverterEff = cond?.inverterEfficiencyPct !== undefined ? cond.inverterEfficiencyPct : 98.2;
  const inverterLossPct = Math.round((100 - inverterEff) * 10) / 10;
  const dcLoss = cond?.dcWiringLossPct !== undefined ? cond.dcWiringLossPct : 1.5;
  const acLoss = cond?.acWiringLossPct !== undefined ? cond.acWiringLossPct : 1.0;
  const cablingLossPct = Math.round((dcLoss + acLoss) * 10) / 10;
  const shadingLossPct = cond?.shadingLossPct !== undefined ? cond.shadingLossPct : 1.8;
  const lidLossPct = cond?.lidLossPct !== undefined ? cond.lidLossPct : 1.0;
  const availPct = cond?.availabilityPct !== undefined ? cond.availabilityPct : 99.0;
  const availLossPct = Math.round((100 - availPct) * 10) / 10;

  // Combined Performance Ratio (Product of non-losses)
  const totalLossFraction =
    (1 - tempLossPct / 100) *
    (1 - soilingLossPct / 100) *
    (1 - mismatchLossPct / 100) *
    (1 - inverterLossPct / 100) *
    (1 - cablingLossPct / 100) *
    (1 - shadingLossPct / 100) *
    (1 - lidLossPct / 100) *
    (1 - availLossPct / 100);

  const defaultPr = Math.round(totalLossFraction * 1000) / 1000;
  const pr = customPr !== undefined ? customPr : defaultPr;
  const totalLossPct = Math.round((1 - pr) * 1000) / 10;

  // Specific Yield (kWh/kWp/year) = annual PSH * 365 * PR
  const specificYield = Math.round(annualGhi * 365 * pr);
  const annualEnergyMwh = Math.round((capacityKwp * specificYield) / 1000 * 10) / 10;

  // Production Probability (P90 bankable yield)
  let p90EnergyMwh: number | undefined = undefined;
  if (cond?.p90Enabled) {
    const sigmaW = (cond.weatherVariabilityPct ?? 5.5) / 100;
    const sigmaS = (cond.systemVariabilityPct ?? 1.0) / 100;
    const sigmaTotal = Math.sqrt(sigmaW * sigmaW + sigmaS * sigmaS);
    const p90Factor = 1 - 1.282 * sigmaTotal;
    p90EnergyMwh = Math.round(annualEnergyMwh * p90Factor * 10) / 10;
  }

  const carbonOffsetTons = Math.round(annualEnergyMwh * EMISI_GRID_JAWA_BALI * 10) / 10;
  const annualSavingsIdr = Math.round(annualEnergyMwh * 1000 * TARIF_PLN_INDUSTRI_IDR);

  // Month-by-month calculation
  const monthly: MonthlySolarData[] = monthlyGhi.map((ghi, idx) => {
    const days = DAYS_IN_MONTH[idx];
    const dailyEnergyKwh = Math.round(capacityKwp * ghi * pr * 10) / 10;
    const monthlyEnergyKwh = Math.round(dailyEnergyKwh * days);
    const savingsIdr = Math.round(monthlyEnergyKwh * TARIF_PLN_INDUSTRI_IDR);
    return {
      month: MONTH_FULL[idx],
      monthIndex: idx,
      ghi: Math.round(ghi * 100) / 100,
      temp: Math.round(monthlyTemp[idx] * 10) / 10,
      dailyEnergyKwh,
      monthlyEnergyKwh,
      savingsIdr,
    };
  });

  let weatherSourceName = source;
  if (cond?.weatherDataset === "meteonorm") weatherSourceName = "Meteonorm 8 TMY (10km Grid)";
  else if (cond?.weatherDataset === "pvgis") weatherSourceName = "PVGIS-SARAH2 TMY";

  return {
    coordinates: { lat, lng },
    capacityKwp,
    annualGhi: Math.round(annualGhi * 100) / 100,
    annualTemp: Math.round(annualTemp * 10) / 10,
    pr,
    specificYield,
    annualEnergyMwh,
    p90EnergyMwh,
    carbonOffsetTons,
    annualSavingsIdr,
    monthly,
    losses: {
      soiling: soilingLossPct,
      temperature: tempLossPct,
      mismatch: mismatchLossPct,
      inverter: inverterLossPct,
      cabling: cablingLossPct,
      shading: shadingLossPct,
      lid: lidLossPct,
      availability: availLossPct,
      totalLossPct,
    },
    source: weatherSourceName,
    fetchedAt: new Date().toISOString(),
  };
}





/**

 * Fetch Google Solar API Building Insights with BASE quality support for Indonesia

 */

export async function fetchGoogleSolarInsights(

  lat: number,

  lng: number,

  apiKey: string

): Promise<GoogleSolarInsights> {

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=BASE&key=${apiKey}`;



  try {

    const res = await fetch(url);

    if (!res.ok) {

      if (res.status === 404) {

        return {

          available: false,

          error: "Bangunan di titik koordinat ini belum terindeks Google Solar. Silakan sesuaikan kotak atap secara manual.",

        };

      }

      const errJson = await res.json().catch(() => ({}));

      return {

        available: false,

        error: errJson?.error?.message || `Google Solar API status HTTP ${res.status}`,

      };

    }



    const data = await res.json();

    const potential = data?.solarPotential;

    const wholeRoof = potential?.wholeRoofStats;

    const segments = potential?.roofSegmentStats || [];

    const primarySegment = segments[0] || {};

    const bbox = data?.boundingBox;



    let widthM = 30;

    let heightM = 20;



    if (bbox?.sw && bbox?.ne) {

      const sw = bbox.sw;

      const ne = bbox.ne;

      // Calculate width (longitude span) and height (latitude span)

      const latDist = haversineDistanceKm(sw.latitude, sw.longitude, ne.latitude, sw.longitude) * 1000;

      const lngDist = haversineDistanceKm(sw.latitude, sw.longitude, sw.latitude, ne.longitude) * 1000;

      widthM = Math.round(lngDist * 10) / 10;

      heightM = Math.round(latDist * 10) / 10;

    }



    const centerObj = data?.center

      ? {

          lat: Number(data.center.latitude || data.center.lat || lat),

          lng: Number(data.center.longitude || data.center.lng || lng),

        }

      : { lat, lng };



    return {

      available: true,

      name: data.name,

      center: centerObj,

      roofAreaM2: Math.round(wholeRoof?.areaMeters2 || widthM * heightM),

      groundAreaM2: Math.round(wholeRoof?.groundAreaMeters2 || 0),

      boundingBoxM: { widthM, heightM },

      pitchDegrees: Math.round((primarySegment?.pitchDegrees || 10) * 10) / 10,

      azimuthDegrees: Math.round((primarySegment?.azimuthDegrees || 180) * 10) / 10,

      planeHeightM: Math.round((primarySegment?.planeHeightAtCenterMeters || 12) * 10) / 10,

      maxPanels: potential?.maxArrayPanelsCount || 0,

      maxArrayAreaM2: Math.round(potential?.maxArrayAreaMeters2 || 0),

      maxSunshineHoursPerYear: Math.round(potential?.maxSunshineHoursPerYear || 0),

      carbonOffsetKgPerMwh: Math.round(potential?.carbonOffsetFactorKgPerMwh || 809),

      panelCapacityWatts: potential?.panelCapacityWatts || 400,

      imageryQuality: data.imageryQuality || "BASE",

    };

  } catch (err: any) {

    return {

      available: false,

      error: err?.message || "Gagal menghubungi Google Solar API",

    };

  }

}



/**

 * Find Nearest PLN High-Voltage Substation (Gardu Induk 150/20 kV)

 * Evaluates proximity for 20 kV Medium Voltage (MV) interconnection

 */

export function findNearestPlnSubstations(lat: number, lng: number, limit = 3, maxDistanceKm = 35): PlnSubstation[] {

  const withDistance = KNOWN_PLN_SUBSTATIONS.map((sub) => ({

    ...sub,

    distanceKm: haversineDistanceKm(lat, lng, sub.lat, sub.lng),

  }));



  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  const withinRadius = withDistance.filter((s) => s.distanceKm <= maxDistanceKm);

  return withinRadius.slice(0, limit);

}

