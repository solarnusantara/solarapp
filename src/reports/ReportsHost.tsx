// Host for the report views: tab bar, print button, shared data loading. Rendered in place by
// EngineeringReport (early return) and closed with onClose.
import { useEffect, useState } from "react";
import type { Project } from "../api";
import EngineeringCalc from "./EngineeringCalc";
import ProductionReport from "./ProductionReport";
import ReportMetaForm from "./ReportMetaForm";
import { useReportData } from "./useReportData";
import "./reports.css";

export type ReportView = "production" | "calc" | "meta";

export default function ReportsHost({ lang = "id", projectId, project, initialView = "production", onClose }: {
  lang?: "id" | "en"; projectId: string | null | undefined; project?: Project | null; initialView?: ReportView; onClose?: () => void;
}) {
  const [view, setView] = useState<ReportView>(initialView);
  const pid = projectId ?? project?.id ?? null;
  const data = useReportData(pid, { hourly: view !== "meta", sun: view === "calc", shade: view === "calc", iso: view === "calc" });
  const isId = lang === "id";
  // The per-hour table is ~5 MB and helio can take tens of seconds to answer (35 s measured for the Mas Silueta run).
  // Printing before it lands leaves "System Output Power Distribution" empty, so printing waits and automation can poll data-report-ready.
  const hourlyLoading = data.hourly.status === "loading";
  const busy = [data.engine, data.hourly, data.sun, data.shade, data.iso].some((s) => s.status === "loading");

  const title = `SolarApp - ${project?.name?.trim() || "Laporan Rekayasa PLTS"}`;
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);

  const handlePrint = () => {
    document.title = title;
    try { if (window.top && window.top !== window) window.top.document.title = title; } catch { /* cross-origin */ }
    window.print();
  };

  const tabs: Array<[ReportView, string]> = [["production", "Production Report"], ["calc", "Engineering Calculation"], ["meta", isId ? "Data dokumen" : "Document data"]];
  const props = { data, projectId: pid, project };

  return (
    <div className="rpt-root" data-report-ready={busy ? "false" : "true"}>
      <div className="rpt-toolbar no-print">
        <div className="rpt-tabs">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" className={`rpt-tab${view === k ? " is-active" : ""}`} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "meta" && <button type="button" className="rpt-tab" onClick={handlePrint} disabled={busy} title={busy ? (isId ? "Menunggu data dari engine…" : "Waiting for engine data…") : undefined}>{busy ? (isId ? "Memuat data…" : "Loading data…") : isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}</button>}
          <button type="button" className="rpt-tab" onClick={() => data.reload()}>{isId ? "Muat ulang" : "Reload"}</button>
          {onClose && <button type="button" className="rpt-tab" onClick={onClose}>{isId ? "← Kembali" : "← Back"}</button>}
        </div>
      </div>
      {hourlyLoading && view !== "meta" && <p className="rpt-notice no-print">{isId ? "Memuat data per jam dari engine (bisa sampai ~40 detik) — grafik distribusi daya terisi setelah itu." : "Loading hourly data from the engine (up to ~40 s) — the power-distribution chart fills in afterwards."}</p>}
      {view === "production" && <ProductionReport {...props} />}
      {view === "calc" && <EngineeringCalc {...props} />}
      {view === "meta" && <ReportMetaForm data={data} projectId={pid} />}
    </div>
  );
}
