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
    <div className="rpt-root">
      <div className="rpt-toolbar no-print">
        <div className="rpt-tabs">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" className={`rpt-tab${view === k ? " is-active" : ""}`} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "meta" && <button type="button" className="rpt-tab" onClick={handlePrint}>{isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}</button>}
          <button type="button" className="rpt-tab" onClick={() => data.reload()}>{isId ? "Muat ulang" : "Reload"}</button>
          {onClose && <button type="button" className="rpt-tab" onClick={onClose}>{isId ? "← Kembali" : "← Back"}</button>}
        </div>
      </div>
      {view === "production" && <ProductionReport {...props} />}
      {view === "calc" && <EngineeringCalc {...props} />}
      {view === "meta" && <ReportMetaForm data={data} projectId={pid} />}
    </div>
  );
}
