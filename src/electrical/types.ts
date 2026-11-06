/**
 * Electrical Design contracts — Phase 1
 *
 * These types are additive. They do not change the PV Layout payload, the
 * project model, or any existing component. The layout adapter in
 * `layoutSource.ts` reads the existing `solar-apps-pv-layout-v1` payload and
 * maps it into `LayoutSnapshot`.
 *
 * Design rules:
 * - Datasheet values are `number | null`. `null` means "not recorded", never 0.
 * - Nothing is inferred from a model name.
 * - Visual SLD positions live in `sldLayout` and never feed calculations.
 */

export type Lang = "id" | "en";

export type VerificationState = "verified" | "unverified" | "missing";

export type DesignStatus = "preliminary" | "calculated" | "stale" | "approved" | "failed";

export type CheckState = "pass" | "warning" | "fail" | "not_calculated";

export type SystemType = "Rooftop" | "Ground-mounted";

export type Orientation = "landscape" | "portrait";

export type Phase = 1 | 3;

export type Frequency = 50 | 60;

export type GeometryPoint = { x: number; y: number };

export type LatLng = { lat: number; lng: number };

// ---------------------------------------------------------------------------
// PV Layout snapshot (read-only view of the existing PV Layout payload)
// ---------------------------------------------------------------------------

export interface LayoutSettings {
  system: SystemType;
  /** mm */
  areaWidth: number;
  /** mm */
  areaHeight: number;
  /** mm */
  moduleWidth: number;
  /** mm */
  moduleHeight: number;
  /** mm */
  gap: number;
  rows: number;
  cols: number;
  /** Wp */
  watts: number;
  /** degrees */
  tilt: number;
  orientation: Orientation;
  /** mm */
  setback: number;
  obstacleWidth: number;
  obstacleHeight: number;
}

export interface LayoutPanel {
  id: number;
  /** mm */
  x: number;
  /** mm */
  y: number;
  /** mm */
  w: number;
  /** mm */
  h: number;
  /** Present only after the PV Layout segment model ships. */
  segmentId?: string;
}

export interface LayoutObstacle {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  heightM?: number;
}

export interface LayoutSite {
  coordinates?: LatLng;
  address?: string;
  polygonPoints?: LatLng[];
  /** Local millimetres, Y down. */
  polygonCorners?: GeometryPoint[];
  rotationDeg?: number;
  pitchDegrees?: number;
  azimuthDegrees?: number;
  googleSolarData?: unknown;
}

/**
 * A segment as seen by Electrical. Until the PV Layout segment model ships,
 * the adapter produces exactly one implicit segment covering every panel.
 */
export interface FieldSegmentSnapshot {
  id: string;
  name: string;
  source: "layout" | "implicit";
  /** Local millimetres, Y down. Empty when the layout has no polygon. */
  corners: GeometryPoint[];
  panelIds: number[];
  panelCount: number;
  dcKwp: number;
  settings: Partial<LayoutSettings>;
  warnings: string[];
}

export type LayoutSnapshotSource = "local" | "remote" | "seed" | "empty";

export interface LayoutSnapshot {
  projectId: string | null;
  source: LayoutSnapshotSource;
  settings: LayoutSettings;
  panels: LayoutPanel[];
  obstacles: LayoutObstacle[];
  site: LayoutSite | null;
  segments: FieldSegmentSnapshot[];
  panelCount: number;
  dcKwp: number;
  /** Stable hash of the inputs Electrical depends on. Used for stale detection. */
  fingerprint: string;
  warnings: string[];
  /** Legacy keys that were found and remapped, e.g. "moduleWidth <- panelWidth". */
  legacyKeysNormalized: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
}

// ---------------------------------------------------------------------------
// Equipment catalog
// ---------------------------------------------------------------------------

export interface ModuleSpec {
  id: string;
  manufacturer: string;
  model: string;
  /** Wp at STC */
  pmaxWp: number | null;
  vocV: number | null;
  vmpV: number | null;
  iscA: number | null;
  impA: number | null;
  /** %/°C, negative for crystalline silicon Voc */
  betaVocPctPerC: number | null;
  /** %/°C */
  betaVmpPctPerC?: number | null;
  /** %/°C */
  alphaIscPctPerC?: number | null;
  /** °C, STC reference (normally 25) */
  referenceTempC: number | null;
  maxSystemVoltageV: number | null;
  maxSeriesFuseA: number | null;
  /** °C */
  tempMinC?: number | null;
  /** °C */
  tempMaxC?: number | null;
  source: string;
  /** ISO date of the datasheet check. Required when verification is "verified". */
  verifiedAt?: string;
  verification: VerificationState;
  notes?: string;
}

export interface InverterSpec {
  id: string;
  manufacturer: string;
  model: string;
  ratedAcPowerW: number | null;
  maxDcVoltageV: number | null;
  mpptMinV: number | null;
  mpptMaxV: number | null;
  startupV?: number | null;
  mpptCount: number | null;
  inputsPerMppt: number | null;
  maxMpptCurrentA: number | null;
  maxMpptIscA: number | null;
  maxUsableDcPowerW?: number | null;
  ratedAcVoltageV: number | null;
  phases: Phase | null;
  frequencyHz: Frequency | null;
  powerFactorMin?: number | null;
  powerFactorMax?: number | null;
  efficiencyPct: number | null;
  source: string;
  verifiedAt?: string;
  verification: VerificationState;
  notes?: string;
}

export interface ReadinessResult {
  ready: boolean;
  verification: VerificationState;
  missing: string[];
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Electrical design (created in later phases; declared now to stabilise the
// shared contract)
// ---------------------------------------------------------------------------

export interface CableRun {
  id: string;
  circuitId: string;
  currentType: "dc" | "ac";
  /** One-way route length. `null` means not calculated — never inferred. */
  routeLengthM: number | null;
  conductorMaterial: "copper" | "aluminium" | null;
  conductorSizeMm2: number | null;
  installationMethod?: string;
  ambientTempC?: number | null;
  groupingFactor?: number | null;
  voltageDropLimitPct?: number | null;
  notes?: string;
}

export type TopologyNodeType =
  | "pv_string"
  | "dc_combiner"
  | "dc_isolator"
  | "dc_spd"
  | "inverter"
  | "ac_breaker"
  | "ac_combiner"
  | "main_ac_panel"
  | "meter"
  | "pcc_grid"
  | "grounding";

export interface TopologyNode {
  id: string;
  type: TopologyNodeType;
  label: string;
  equipmentId?: string;
  circuitId?: string;
  ratings?: Record<string, string | number | null>;
  status?: CheckState;
}

export interface TopologyConnection {
  id: string;
  from: string;
  to: string;
  circuitId: string;
  currentType: "dc" | "ac";
  cableRunId?: string;
  protectionId?: string;
  status?: CheckState;
}

export interface MpptAllocation {
  mpptIndex: number;
  strings: number;
}

export interface StringGroup {
  id: string;
  segmentId: string;
  name: string;
  moduleId: string;
  modulesPerString: number;
  stringCount: number;
  orientation?: Orientation;
  tiltDeg?: number;
  azimuthDeg?: number;
  inverterId?: string;
  mppt?: MpptAllocation[];
}

export interface StringCalculation {
  stringGroupId: string;
  modulesPerString: number;
  stringCount: number;
  stringPowerWp: number | null;
  vocStcV: number | null;
  vocColdV: number | null;
  vmpStcV: number | null;
  vmpHotV: number | null;
  iscA: number | null;
  impA: number | null;
  checks: Record<string, CheckState>;
  warnings: string[];
}

export interface CalculationSnapshot {
  engineVersion: string;
  computedAt: string;
  inputHash: string;
  strings: StringCalculation[];
  warnings: string[];
  totals: {
    modules: number;
    dcKwp: number;
    acKw: number;
    dcAcRatio: number | null;
  };
}

export interface AcDesign {
  topology: "single" | "combined" | "multiple";
  voltageV: number | null;
  phases: Phase | null;
  frequencyHz: Frequency | null;
  powerFactor: number | null;
  mainBreakerA?: number | null;
  faultLevelKa?: number | null;
  cableRuns: CableRun[];
}

export interface DcDesign {
  combiner: boolean;
  isolator: boolean;
  spd: boolean;
  cableRuns: CableRun[];
}

export interface DesignAssumptions {
  tempMinC: number | null;
  tempMaxC: number | null;
  dcAcMin: number | null;
  dcAcMax: number | null;
  /** Cable length must be entered explicitly; no inference from imagery. */
  routeLengthRequired: true;
}

export interface ElectricalDesign {
  version: 1;
  schema: "solarapp.electrical";
  projectId: string;
  revision: number;
  status: DesignStatus;
  createdAt: string;
  updatedAt: string;
  sourceLayout: {
    fingerprint: string;
    panelCount: number;
    dcKwp: number;
    /** Added to the layout payload in a later phase. */
    savedAt?: string;
  };
  modules: ModuleSpec[];
  inverters: Array<InverterSpec & { quantity: number }>;
  strings: StringGroup[];
  dc: DcDesign;
  ac: AcDesign;
  assumptions: DesignAssumptions;
  topology: {
    nodes: TopologyNode[];
    connections: TopologyConnection[];
  };
  /** Visual-only SLD positions. Never used as calculation input. */
  sldLayout: Record<string, { x: number; y: number }>;
  results?: CalculationSnapshot;
}
