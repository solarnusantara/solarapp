// Single source for "how many modules did helio use" and the visible warning when it differs from
// the layout. helio sizes the plant from the scene it was sent (non-removed modules, circuit/auto),
// so a gap here means the layout changed after the run or the run saw a different layout.
import type { EngineResultSummary } from "./types/local";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const id = (n: number) => n.toLocaleString("id-ID");

/** Modules helio reports for the run: production report design count, else the sum over stringing reports. */
export function helioModuleCount(r: EngineResultSummary | null | undefined): number | null {
  const d = (r?.production as any)?.design?.module_count;
  if (isNum(d)) return d;
  const reports = (r?.circuit_auto as any)?.stringing;
  if (Array.isArray(reports) && reports.length) {
    const t = reports.reduce((a: number, s: any) => a + (isNum(s?.total_module_count) ? s.total_module_count : 0), 0);
    if (t > 0) return t;
  }
  return null;
}

export interface ModuleCountCheck { layout: number; helio: number; message: string }

/** null when the counts agree (or either is unknown). */
export function moduleCountMismatch(layoutModules: number, r: EngineResultSummary | null | undefined): ModuleCountCheck | null {
  const helio = helioModuleCount(r);
  if (helio === null || !(layoutModules > 0) || helio === layoutModules) return null;
  const why = helio < layoutModules
    ? "hasil dihitung dari layout yang lebih lama atau modul dihapus/dibuang saat regenerasi. Jalankan Hitung (Helio) ulang."
    : "layout sekarang punya lebih sedikit modul dari saat hasil ini dihitung. Jalankan Hitung (Helio) ulang.";
  return { layout: layoutModules, helio, message: `Helio memakai ${id(helio)} dari ${id(layoutModules)} modul: ${why}` };
}
