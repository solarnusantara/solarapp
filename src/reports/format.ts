// Display helpers. Rule of the reports: a missing / non-finite value is always the dash.
export const DASH = "—";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface NumOpts { group?: boolean; sign?: boolean }

/** Fixed decimals, optional thousands grouping ("1,047,291.7", en style like the references). */
export function n(v: unknown, digits = 0, opts: NumOpts = {}): string {
  if (!isNum(v)) return DASH;
  const group = opts.group ?? true;
  const s = group
    ? v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : v.toFixed(digits);
  return opts.sign && v > 0 ? `+${s}` : s;
}

export const pct = (v: unknown, digits = 1, opts: NumOpts = {}) => (isNum(v) ? `${n(v, digits, { group: false, ...opts })}%` : DASH);
export const withUnit = (v: unknown, unit: string, digits = 1, opts: NumOpts = {}) => (isNum(v) ? `${n(v, digits, opts)} ${unit}` : DASH);
export const text = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s === "" ? DASH : s;
};

/** Plain number without grouping, as PVsyst prints energies ("1049404"). */
export const plain = (v: unknown, digits = 0) => n(v, digits, { group: false });

export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Oktober 2026" style date from an ISO string; dash when empty. */
export function dateLong(iso: unknown, locale = "id-ID"): string {
  if (typeof iso !== "string" || !iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return text(iso);
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}
export function dateTime(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Value when all 12 months are equal, else a min-max range; dash for anything else. */
export function monthlyUniform(values: unknown, digits = 1, suffix = ""): string {
  if (!Array.isArray(values) || values.length === 0 || !values.every(isNum)) return DASH;
  const min = Math.min(...values), max = Math.max(...values);
  const f = (x: number) => `${n(x, digits, { group: false })}${suffix}`;
  return min === max ? f(min) : `${f(min)} – ${f(max)}`;
}

/** Safe nested read: `pick(obj, "a", "b", 0)`; undefined when any hop is missing. */
export function pick(obj: unknown, ...path: Array<string | number>): unknown {
  let cur: any = obj;
  for (const k of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k as any];
  }
  return cur;
}
/** First defined value among several candidate dotted paths. */
export function firstOf(obj: unknown, ...paths: string[]): unknown {
  for (const p of paths) {
    const v = pick(obj, ...p.split("."));
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}
