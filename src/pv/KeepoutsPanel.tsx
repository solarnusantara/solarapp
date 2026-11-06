import { Ban, Eye, EyeOff, MousePointer2, Square, Table, Trash2 } from "lucide-react";
import type { Obstacle, Walkway } from "../PVLayout";
import {
  findKeepoutView, mToMm, mmToM, toKeepoutViews,
  type KeepoutRef, type KeepoutView,
} from "./keepoutModel";

export type KeepoutTool = "select" | "keepout" | "walkway";

export interface KeepoutPatch {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label?: string;
  heightM?: number;
  visible?: boolean;
}

const card: React.CSSProperties = {
  background: "#0e1611",
  border: "1.5px solid #233728",
  borderRadius: 8,
  padding: "12px 13px",
  display: "flex",
  flexDirection: "column",
  gap: 9,
};
const inp: React.CSSProperties = {
  width: "100%",
  background: "#080d09",
  border: "1px solid #1f3325",
  borderRadius: 6,
  padding: "5px 8px",
  color: "#edf5ef",
  fontSize: 11,
  boxSizing: "border-box",
};

function ToolButton({ active, title, onClick, color, children }: {
  active: boolean;
  title: string;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "6px 7px",
        borderRadius: 6,
        border: `1px solid ${active ? color : "#233527"}`,
        background: active ? `${color}22` : "#0b120d",
        color: active ? color : "#8da294",
        fontSize: 10.5,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function NumberField({ label, value, onChange, onBlur, unit = "m", min = 0 }: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  onBlur: () => void;
  unit?: string;
  min?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 10, color: "#8aa092" }}>
      {label} <span style={{ opacity: 0.65 }}>({unit})</span>
      <input
        type="number"
        step="0.01"
        min={min}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onBlur={onBlur}
        style={inp}
      />
    </label>
  );
}

export default function KeepoutsPanel({
  walkways,
  obstacles,
  selected,
  toolMode,
  onTool,
  onFocus,
  onToggleVisibility,
  onDelete,
  onUpdate,
  onCommit,
}: {
  walkways: Walkway[];
  obstacles: Obstacle[];
  selected: KeepoutRef | null;
  toolMode: string;
  onTool: (tool: KeepoutTool) => void;
  onFocus: (ref: KeepoutRef) => void;
  onToggleVisibility: (ref: KeepoutRef) => void;
  onDelete: (ref: KeepoutRef) => void;
  onUpdate: (ref: KeepoutRef, patch: KeepoutPatch) => void;
  onCommit: () => void;
}) {
  const views = toKeepoutViews(walkways, obstacles);
  const current = findKeepoutView(views, selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#edf5ef", display: "flex", alignItems: "center", gap: 7 }}>
          <Ban size={15} style={{ color: "#f87171" }} /> Keepouts
        </div>
        <div style={{ fontSize: 10.5, color: "#8ca293", marginTop: 3, lineHeight: 1.4 }}>
          Kelola walkway dan rintangan dari satu tempat. Walkway tetap objek terpisah dan selalu
          menahan area panel saat generate.
        </div>
      </div>

      <div style={{ display: "flex", gap: 5 }}>
        <ToolButton active={toolMode === "select"} title="Pilih / geser objek" onClick={() => onTool("select")} color="#b8f36b">
          <MousePointer2 size={12} /> Select
        </ToolButton>
        <ToolButton active={toolMode === "keepout"} title="Gambar keepout / rintangan" onClick={() => onTool("keepout")} color="#ef4444">
          <Square size={12} /> Keepout
        </ToolButton>
        <ToolButton active={toolMode === "walkway"} title="Gambar walkway / jalur akses" onClick={() => onTool("walkway")} color="#f97316">
          <Table size={12} /> Walkway
        </ToolButton>
      </div>

      <div style={{ fontSize: 10, color: "#8ca293", background: "#0b120d", border: "1px solid #1f3024", borderRadius: 6, padding: "6px 8px", lineHeight: 1.4 }}>
        Pilih alat lalu seret kotak di kanvas. Satuan tersimpan tetap milimeter; input di bawah memakai meter.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 250, overflowY: "auto", paddingRight: 2 }}>
        {views.length === 0 && (
          <div style={{ fontSize: 11, color: "#8ca293", padding: 10, textAlign: "center", border: "1px dashed #233527", borderRadius: 7 }}>
            Belum ada walkway atau keepout.
          </div>
        )}
        {views.map((v) => {
          const isSel = !!selected && selected.kind === v.kind && String(selected.id) === String(v.id);
          const color = v.kind === "walkway" ? "#f97316" : "#ef4444";
          return (
            <div
              key={v.key}
              onClick={() => onFocus(v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 8px",
                borderRadius: 7,
                border: `1px solid ${isSel ? "#b8f36b" : "#1c2d22"}`,
                background: isSel ? "#16251b" : "#0b120d",
                cursor: "pointer",
                opacity: v.visible ? 1 : 0.55,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#edf5ef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.label}
                </div>
                <div style={{ fontSize: 9.5, color: "#8ca293", marginTop: 1 }}>
                  {v.kind === "walkway" ? "Walkway" : "Keepout / obstacle"} · {mmToM(v.w).toFixed(2)} × {mmToM(v.h).toFixed(2)} m
                </div>
              </div>
              <button
                type="button"
                title={v.visible ? "Sembunyikan" : "Tampilkan"}
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(v); }}
                style={{ background: "transparent", border: "none", color: v.visible ? "#a5b8ad" : "#6b7f72", padding: 2, cursor: "pointer" }}
              >
                {v.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                type="button"
                title="Hapus objek"
                onClick={(e) => { e.stopPropagation(); onDelete(v); }}
                style={{ background: "transparent", border: "none", color: "#f87171", padding: 2, cursor: "pointer" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {current && (
        <div style={card}>
          <div style={{ fontSize: 11.5, fontWeight: 900, color: "#b8f36b", display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span>{current.kind === "walkway" ? "Walkway" : "Keepout"} · {current.label}</span>
            <span style={{ color: current.visible ? "#6ee7b7" : "#fbbf24", fontSize: 9.5 }}>{current.visible ? "visible" : "hidden"}</span>
          </div>

          <label style={{ display: "grid", gap: 3, fontSize: 10, color: "#8aa092" }}>
            Label
            <input
              value={current.label}
              onChange={(e) => onUpdate(current, { label: e.target.value })}
              onBlur={onCommit}
              style={inp}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <NumberField label="X" value={mmToM(current.x)} onChange={(n) => onUpdate(current, { x: mToMm(n) })} onBlur={onCommit} />
            <NumberField label="Y" value={mmToM(current.y)} onChange={(n) => onUpdate(current, { y: mToMm(n) })} onBlur={onCommit} />
            <NumberField label="Lebar" value={mmToM(current.w)} onChange={(n) => onUpdate(current, { w: Math.max(1, mToMm(n)) })} onBlur={onCommit} min={0.01} />
            <NumberField label="Tinggi" value={mmToM(current.h)} onChange={(n) => onUpdate(current, { h: Math.max(1, mToMm(n)) })} onBlur={onCommit} min={0.01} />
          </div>

          {current.kind === "obstacle" && (
            <NumberField
              label="Tinggi fisik (untuk shading)"
              unit="m"
              value={typeof current.heightM === "number" ? current.heightM : 0}
              onChange={(n) => onUpdate(current, { heightM: n })}
              onBlur={onCommit}
            />
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#a5b8ad" }}>
            <input
              type="checkbox"
              checked={current.visible}
              onChange={(e) => {
                onUpdate(current, { visible: e.target.checked });
                // The ref is updated synchronously in patchKeepout, so the commit sees the toggle.
                onCommit();
              }}
            />
            Tampilkan objek ini
          </label>

          <div style={{ fontSize: 9.5, color: "#6b7f72", lineHeight: 1.4 }}>
            Objek yang disembunyikan tetap dihitung sebagai area terlarang saat generate panel.
          </div>
        </div>
      )}
    </div>
  );
}
