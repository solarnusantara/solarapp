// "Data dokumen": report-meta (document number, revisions, approvers) and owner / EPC logo uploads.
import { useEffect, useState } from "react";
import { getCurrentUser } from "../api";
import { engineErrorMessage, putReportMeta, reportAssetUrl, uploadReportAsset, type ReportAssetKind } from "../engine/client";
import type { ApprovalSlot, ReportMeta } from "../engine/types/local";
import { LogoImg, SOLAR_NUSANTARA_LOGO } from "./parts";
import { mergeMeta, type ReportData } from "./useReportData";
import "./reports.css";

type SlotKey = "prepared" | "checked" | "approved";
const SLOTS: Array<[SlotKey, string]> = [["prepared", "Prepared by"], ["checked", "Checked by"], ["approved", "Approved by"]];

export default function ReportMetaForm({ data, projectId }: { data: ReportData; projectId: string | null }) {
  const user = getCurrentUser();
  const [draft, setDraft] = useState<ReportMeta>(() => mergeMeta(data.meta.data));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);

  useEffect(() => { if (data.meta.status === "ok") setDraft(mergeMeta(data.meta.data)); }, [data.meta.status, data.meta.data]);

  if (!projectId) return <p className="rpt-notice is-warn">Pilih proyek terlebih dahulu.</p>;
  const set = <K extends keyof ReportMeta>(k: K, v: ReportMeta[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSlot = (k: SlotKey, patch: Partial<ApprovalSlot>) => setDraft((d) => ({ ...d, approvals: { ...d.approvals, [k]: { ...d.approvals[k], ...patch } } }));

  async function save(next: ReportMeta = draft) {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await putReportMeta(projectId!, next);
      const merged = mergeMeta(saved && Object.keys(saved).length ? saved : next);
      setDraft(merged);
      data.setMeta(merged);
      setMsg({ ok: true, text: "Data dokumen tersimpan." });
    } catch (e) {
      setMsg({ ok: false, text: engineErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function sign(k: SlotKey) {
    const slot = draft.approvals[k];
    const next: ReportMeta = { ...draft, approvals: { ...draft.approvals, [k]: { ...slot, signed: true, date: slot.date || new Date().toISOString().slice(0, 10) } } };
    setDraft(next);
    await save(next);
  }

  async function upload(kind: ReportAssetKind, file: File | undefined) {
    if (!file) return;
    setMsg(null);
    try {
      await uploadReportAsset(projectId!, kind, file);
      setBust(Date.now());
      setMsg({ ok: true, text: "Logo terunggah." });
    } catch (e) {
      setMsg({ ok: false, text: engineErrorMessage(e) });
    }
  }

  const input = (label: string, key: "doc_no" | "rev" | "effective_date" | "owner_name" | "client" | "project_address" | "epc_contractor", type = "text") => (
    <label>{label}<input type={type} value={draft[key]} onChange={(e) => set(key, e.target.value)} /></label>
  );

  return (
    <div className="rpt-form no-print">
      {data.meta.status === "unavailable" && <p className="rpt-notice is-warn">SolarApp Engine Studio tidak tersedia — data dokumen tidak dapat disimpan sekarang.</p>}
      <h3>Dokumen</h3>
      <div className="grid2">
        {input("Nomor dokumen", "doc_no")}
        {input("Rev No", "rev")}
        {input("Tanggal efektif", "effective_date", "date")}
        {input("Owner (nama)", "owner_name")}
        {input("Client", "client")}
        {input("EPC Contractor", "epc_contractor")}
      </div>
      <div style={{ marginTop: 8 }}>{input("Alamat proyek", "project_address")}</div>

      <h3>Logo</h3>
      <div className="grid2">
        {(["owner_logo", "epc_logo"] as const).map((kind) => (
          <div key={kind}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>{kind === "owner_logo" ? "Logo Owner" : "Logo EPC (default: Solar Nusantara)"}</div>
            <div className="logo-box">
              <LogoImg className="" src={reportAssetUrl(projectId, kind, bust)} fallbackSrc={kind === "epc_logo" ? SOLAR_NUSANTARA_LOGO : undefined} fallbackText="(belum ada logo)" alt={kind} />
            </div>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => { void upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>PNG atau JPEG, maks. 1 MB.</div>
          </div>
        ))}
      </div>

      <h3>Riwayat revisi</h3>
      {draft.revisions.map((r, i) => (
        <div className="rowx" key={i}>
          <input placeholder="Rev" value={r.rev} onChange={(e) => set("revisions", draft.revisions.map((x, j) => (j === i ? { ...x, rev: e.target.value } : x)))} />
          <input type="date" value={r.date} onChange={(e) => set("revisions", draft.revisions.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
          <input placeholder="Deskripsi" value={r.description} onChange={(e) => set("revisions", draft.revisions.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <button type="button" className="btn" onClick={() => set("revisions", draft.revisions.filter((_, j) => j !== i))} aria-label="hapus baris">×</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => set("revisions", [...draft.revisions, { rev: "", date: "", description: "" }])}>+ Tambah baris revisi</button>

      <h3>Catatan</h3>
      <label><textarea rows={4} value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></label>

      <h3>Persetujuan</h3>
      {SLOTS.map(([k, label]) => {
        const s = draft.approvals[k];
        const mine = !!s.user_id && s.user_id === user.id;
        return (
          <div key={k} className="grid3" style={{ marginBottom: 8 }}>
            <label>{label}<input value={s.name} onChange={(e) => setSlot(k, { name: e.target.value })} /></label>
            <label>Tanggal<input type="date" value={s.date} onChange={(e) => setSlot(k, { date: e.target.value })} /></label>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {!mine && !s.signed && <button type="button" className="btn" onClick={() => setSlot(k, { user_id: user.id, name: s.name || user.name })}>Jadikan saya</button>}
              {mine && !s.signed && <button type="button" className="btn primary" disabled={busy} onClick={() => void sign(k)}>Tandatangani</button>}
              {s.signed && <span style={{ color: "#86efac", fontWeight: 700 }}>✓ Ditandatangani</span>}
              {s.user_id && !mine && !s.signed && <span style={{ color: "#94a3b8" }}>Hanya pemilik slot yang dapat menandatangani.</span>}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan data dokumen"}</button>
        {msg && <span style={{ color: msg.ok ? "#86efac" : "#fca5a5", fontWeight: 600 }}>{msg.text}</span>}
      </div>
    </div>
  );
}
