import { moduleCountMismatch } from "../engine/moduleCount";
import type { ReactNode } from "react";
import type { Project } from "../api";
import type { ReportData } from "./useReportData";
import "./reports.css";

export const brandUrl = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;
export const SOLAR_NUSANTARA_LOGO = brandUrl("solar-nusantara.png");
export const SONUS_ID_LOGO = brandUrl("sonus-id.jpg");

export interface ReportProps {
  data: ReportData;
  projectId: string | null;
  project: Project | null | undefined;
}

export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rpt-sheet ${className}`}>{children}</section>;
}

/** Calm banner shown above the pages when a source is missing; pages still render with dashes. */
export function SourceNotice({ data }: { data: ReportData }) {
  const e = data.engine;
  if (e.status === "loading" || e.status === "idle") return <p className="rpt-notice">Memuat data engine…</p>;
  if (e.status === "unavailable") return <p className="rpt-notice is-warn">Engine Helio tidak tersedia — halaman ditampilkan dengan “—” sampai hasil tersedia.</p>;
  if (e.status === "empty") return <p className="rpt-notice is-warn">{e.message ?? "Belum dihitung — buka PV Layout lalu klik Hitung (Helio)"}</p>;
  if (e.status === "error") return <p className="rpt-notice is-warn">{e.message}</p>;
  // Variant kWp and field-segment module counts must agree with the run: warn when helio used another module count.
  const lay = data.layout.data;
  const layoutModules = (lay?.segments ?? []).filter((s) => s.visible !== false).reduce((a, s) => a + (s.panels?.length ?? 0), 0);
  const mm = moduleCountMismatch(layoutModules, data.result);
  return mm ? <p className="rpt-notice is-warn" role="alert">{mm.message}</p> : null;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="sim-note">{children}</div>;
}

import { useState } from "react";

/** <img> with a fallback: another URL, or (when none) a text node. Re-arms when `src` changes. */
export function LogoImg({ src, fallbackSrc, fallbackText, className = "eng-logo", alt }: { src: string; fallbackSrc?: string; fallbackText?: string; className?: string; alt: string }) {
  const [stage, setStage] = useState<{ src: string; level: 0 | 1 | 2 }>({ src, level: 0 });
  const level = stage.src === src ? stage.level : 0;
  if (level === 2) return fallbackText ? <span style={{ fontSize: 11, fontWeight: 700 }}>{fallbackText}</span> : null;
  const cur = level === 0 ? src : (fallbackSrc as string);
  return <img className={className} src={cur} alt={alt} onError={() => setStage({ src, level: level === 0 && fallbackSrc ? 1 : 2 })} />;
}
