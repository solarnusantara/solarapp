// PVsyst-style loss diagram layout. Pure: helio loss_tree stages in, positioned rows out.
// Every number shown is a helio value (annual, delta_pct, pct_of_input) or a product of two helio /
// layout values (collector area x irradiation is NOT computed here; efficiency at STC is passed in).
import type { StageSummary } from "../engine/types";
import { DASH, isNum, n, plain } from "./format";

export type LossRowKind = "milestone" | "stage" | "sub" | "info";

export interface LossRow {
  kind: LossRowKind;
  key: string;
  y: number;
  label: string;
  /** Absolute value text for milestones / info rows ("1811 kWh/m² * 3241 m² coll."). */
  value?: string;
  /** "-0.55%" for loss/gain rows. */
  pct?: string;
  /** Signed % (negative = loss, positive = gain, 0 = none). Arrow direction. */
  deltaPct?: number | null;
  notModeled?: boolean;
  /** Funnel half-width fraction (0..1) at this row; milestone rows carry the section value. */
  frac: number;
  section: "irradiance" | "energy";
}

export interface LossFunnel {
  section: "irradiance" | "energy";
  /** y of the flat/notched top and the pointed bottom. */
  top: number;
  bottom: number;
  /** Polyline of (y, frac) along the right edge, top to bottom. */
  profile: Array<{ y: number; frac: number }>;
}

export interface LossDiagram { rows: LossRow[]; funnels: LossFunnel[]; height: number }

export interface LossDiagramOpts {
  /** Sum of module areas (m²) from the layout; null hides the "* N m² coll." text. */
  moduleAreaM2: number | null;
  /** Module efficiency at STC in % (PAN Pnom / (area x 1000)); null hides the info row. */
  moduleEffPct: number | null;
  rowH?: number;
}

const MILESTONE_KEYS: Record<string, string> = {
  ghi: "Global horizontal irradiation",
  total_irradiance: "Effective irradiation on collectors",
  nameplate_power: "Array nominal energy (at STC effic.)",
};
const AFTER_OHMIC = "optimal_dc_power";
const INVERTER = "ac_power";
const CONSTRAINED = "actual_dc_power";

/** HelioScope order puts constrained-DC limits before the inverter row; PVsyst lists efficiency first. */
export function pvsystOrder(stages: StageSummary[]): StageSummary[] {
  const out = [...stages];
  const iC = out.findIndex((s) => s.key === CONSTRAINED), iI = out.findIndex((s) => s.key === INVERTER);
  if (iC >= 0 && iI === iC + 1) [out[iC], out[iI]] = [out[iI], out[iC]];
  return out;
}

export const fmtSigned = (v: number | null | undefined) => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(2)}%` : DASH);
const rowLabel = (s: { pvsyst_label: string | null; helioscope_label?: string | null; label: string }) => s.pvsyst_label ?? s.helioscope_label ?? s.label;

export function buildLossDiagram(stages: StageSummary[], opts: LossDiagramOpts): LossDiagram {
  const rowH = opts.rowH ?? 20;
  const rows: LossRow[] = [];
  const funnels: LossFunnel[] = [];
  let y = 14;
  for (const section of ["irradiance", "energy"] as const) {
    const list = pvsystOrder(stages.filter((s) => s.section === section));
    if (!list.length) continue;
    const base = list.find((s) => isNum(s.annual) && s.status !== "not_modeled")?.annual ?? null;
    let cum = base;
    const frac = () => (isNum(cum) && isNum(base) && base > 0 ? Math.max(0.12, cum / base) : 1);
    const profile: LossFunnel["profile"] = [];
    const top = y - 12;
    const push = (r: Omit<LossRow, "y" | "frac" | "section"> & { frac?: number }) => {
      const row: LossRow = { ...r, y, frac: r.frac ?? frac(), section };
      rows.push(row);
      profile.push({ y, frac: row.frac });
      y += rowH;
    };
    const modeled = (s: StageSummary) => s.status !== "not_modeled" && isNum(s.annual);
    const lastModeled = [...stages.filter((s) => s.section === section)].reverse().find(modeled) ?? null;
    const inverterStage = list.find((s) => s.key === INVERTER) ?? null;
    list.forEach((s, idx) => {
      const ok = modeled(s);
      if (ok) cum = s.annual;
      const unitTxt = (s.unit || (section === "irradiance" ? "kWh/m2" : "kWh")) === "kWh/m2" ? "kWh/m²" : s.unit || "kWh";
      if (MILESTONE_KEYS[s.key]) {
        let value = ok ? `${plain(s.annual, 0)} ${unitTxt}` : DASH;
        if (s.key === "total_irradiance" && ok && isNum(opts.moduleAreaM2)) value += ` * ${plain(opts.moduleAreaM2, 0)} m² coll.`;
        push({ kind: "milestone", key: s.key, label: MILESTONE_KEYS[s.key], value, notModeled: !ok });
        if (s.key === "total_irradiance" && isNum(opts.moduleEffPct)) {
          push({ kind: "info", key: "efficiency_stc", label: "PV conversion", value: `efficiency at STC = ${n(opts.moduleEffPct, 2, { group: false })}%`, frac: 0 });
        }
        return;
      }
      const subs = s.breakdown ?? [];
      // A stage with no PVsyst name whose loss is fully described by its sub-losses is shown as those sub-losses only.
      if (s.pvsyst_label || subs.length === 0) {
        push({ kind: "stage", key: s.key, label: rowLabel(s), pct: ok ? fmtSigned(s.delta_pct) : "tidak dimodelkan", deltaPct: ok ? s.delta_pct ?? 0 : null, notModeled: !ok });
      }
      for (const b of subs) {
        const bok = b.status !== "not_modeled" && isNum(b.pct_of_input);
        const d = bok ? -(b.pct_of_input as number) || 0 : null;
        push({ kind: "sub", key: b.key, label: b.pvsyst_label ?? b.label, pct: bok ? fmtSigned(d) : "tidak dimodelkan", deltaPct: d, notModeled: !bok });
      }
      if (s.key === AFTER_OHMIC && ok) push({ kind: "milestone", key: "virtual_energy_mpp", label: "Array virtual energy at MPP", value: `${plain(s.annual, 0)} kWh` });
      // The inverter group is the ac_power row plus the constrained-DC limits (PVsyst order puts both before this milestone).
      const next = list[idx + 1];
      const endsInverterGroup = (s.key === INVERTER && next?.key !== CONSTRAINED) || s.key === CONSTRAINED;
      if (endsInverterGroup && inverterStage && modeled(inverterStage)) {
        push({ kind: "milestone", key: "inverter_output", label: "Available Energy at Inverter Output", value: `${plain(inverterStage.annual, 0)} kWh`, frac: isNum(base) && base > 0 ? Math.max(0.12, (inverterStage.annual as number) / base) : 1 });
      }
    });
    if (section === "energy" && lastModeled) {
      push({ kind: "milestone", key: "energy_to_grid", label: "Energy injected into grid", value: `${plain(lastModeled.annual, 0)} kWh`, frac: isNum(base) && base > 0 ? Math.max(0.12, (lastModeled.annual as number) / base) : 1 });
    }
    funnels.push({ section, top, bottom: y - rowH + 8, profile });
    y += 16;
  }
  return { rows, funnels, height: y + 20 };
}
