import { getProjectDefaultBoq, getProjectDefaultLayout } from "./defaultProjectsData";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Trash2, FileDown, FileUp, Printer, RotateCcw, Database } from "lucide-react";
import * as api from "./api";

type Lang = "en" | "id";
type Item = {
  id: string;
  category: string;
  description: string;
  specification: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

const starterItems: Item[] = [
  { id: "pv-1", category: "PV Module", description: "PV module", specification: "Select brand/model from market catalog or verify quotation", unit: "pcs", quantity: 0, unitPrice: 1800000 },
  { id: "inv-1", category: "Electrical", description: "String inverter", specification: "Select brand/model from market catalog or verify quotation", unit: "pcs", quantity: 0, unitPrice: 25000000 },
  { id: "rail-1", category: "Mounting", description: "Mounting rail", specification: "Enter profile / length", unit: "m", quantity: 0, unitPrice: 0 },
  { id: "clamp-1", category: "Mounting", description: "Mid clamp", specification: "Confirm module thickness", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "end-1", category: "Mounting", description: "End clamp", specification: "Confirm module thickness", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "steel-1", category: "Structure", description: "Steel profile", specification: "Enter profile / grade", unit: "kg", quantity: 0, unitPrice: 0 },
  { id: "bp-1", category: "Structure", description: "Base plate", specification: "Enter size / thickness", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "anchor-1", category: "Structure", description: "Anchor bolt", specification: "Enter diameter / embedment", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "dc-1", category: "Cable", description: "PV DC cable", specification: "Enter size / type", unit: "m", quantity: 0, unitPrice: 0 },
  { id: "ac-1", category: "Cable", description: "AC power cable", specification: "Enter size / type", unit: "m", quantity: 0, unitPrice: 0 },
  { id: "tray-1", category: "Cable Tray", description: "Cable tray / ladder", specification: "Enter width / material", unit: "m", quantity: 0, unitPrice: 0 },
  { id: "brk-1", category: "Electrical", description: "Circuit breaker", specification: "Enter poles / rating / Icu", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "spd-1", category: "Electrical", description: "Surge protection device", specification: "Enter type / voltage", unit: "pcs", quantity: 0, unitPrice: 0 },
  { id: "gnd-1", category: "Grounding", description: "PE / grounding conductor", specification: "Enter size / type", unit: "m", quantity: 0, unitPrice: 0 },
];

const categories = ["PV Module", "Inverter", "Mounting", "Structure", "Cable", "Cable Tray", "Electrical", "Grounding", "Civil", "Other"];
type CatalogItem = { category: string; brand: string; description: string; specification: string; unit: string; unitPrice: number };

// Indicative Indonesia market budget prices, not binding EPC vendor quotations.
const marketCatalog: CatalogItem[] = [
  { category: "PV Module", brand: "JA Solar", description: "JA Solar 550 Wp module", specification: "Mono PERC; exact model/warranty verify", unit: "pcs", unitPrice: 1581250 },
  { category: "PV Module", brand: "Trina Solar", description: "Vertex 575 Wp module", specification: "Exact model/warranty verify", unit: "pcs", unitPrice: 1477077 },
  { category: "PV Module", brand: "LONGi", description: "LONGi 650 Wp module", specification: "Hi-MO series; exact model verify", unit: "pcs", unitPrice: 1833215 },
  { category: "PV Module", brand: "AIKO", description: "AIKO 650 Wp module", specification: "ABC series; exact model verify", unit: "pcs", unitPrice: 2536162 },
  { category: "Inverter", brand: "Solis", description: "On-grid inverter 10 kW 3-phase", specification: "Exact model and warranty verify", unit: "pcs", unitPrice: 22000000 },
  { category: "Inverter", brand: "Growatt", description: "On-grid inverter 10 kW 3-phase", specification: "Exact model and warranty verify", unit: "pcs", unitPrice: 26494000 },
  { category: "Inverter", brand: "Huawei", description: "SUN2000 10 kW inverter", specification: "Exact model and accessories verify", unit: "pcs", unitPrice: 30000000 },
  { category: "Inverter", brand: "Sungrow", description: "On-grid inverter 10 kW 3-phase", specification: "Exact model and warranty verify", unit: "pcs", unitPrice: 28000000 },
  { category: "Cable", brand: "Supreme", description: "PV DC cable 6 mm²", specification: "Verify solar certification and copper specification", unit: "m", unitPrice: 30000 },
  { category: "Cable", brand: "Jembo / equivalent", description: "PV DC cable 6 mm²", specification: "Verify exact product certification", unit: "m", unitPrice: 34000 },
  { category: "Mounting", brand: "Generic / project supply", description: "Aluminium rail 2.4 m", specification: "Profile, alloy and finish dependent", unit: "pcs", unitPrice: 269500 },
  { category: "Mounting", brand: "Generic / project supply", description: "Mid clamp 35–40 mm", specification: "Match module frame thickness", unit: "pcs", unitPrice: 18500 },
  { category: "Mounting", brand: "Generic / project supply", description: "End clamp 30–35 mm", specification: "Match module frame thickness", unit: "pcs", unitPrice: 17900 },
  { category: "Mounting", brand: "Generic / project supply", description: "L-foot / roof bracket", specification: "Roof type and coating dependent", unit: "pcs", unitPrice: 25000 },
  { category: "Structure", brand: "Generic steel supplier", description: "Steel profile", specification: "Price/kg; section and grade verify", unit: "kg", unitPrice: 25000 },
  { category: "Structure", brand: "Fabrication estimate", description: "Base plate", specification: "Dimensions/thickness and fabrication verify", unit: "pcs", unitPrice: 100000 },
  { category: "Structure", brand: "Generic fastener supplier", description: "Anchor bolt M16", specification: "Length, grade and coating verify", unit: "pcs", unitPrice: 40000 },
  { category: "Cable Tray", brand: "Generic cable support", description: "Cable ladder / tray", specification: "Price/m; width, thickness and finish verify", unit: "m", unitPrice: 180000 },
  { category: "Electrical", brand: "Schneider / equivalent", description: "MCCB 3-phase", specification: "Rating, poles, Icu and series dependent", unit: "pcs", unitPrice: 1500000 },
  { category: "Electrical", brand: "Generic / approved brand", description: "DC SPD Type 2", specification: "PV voltage, poles and certification verify", unit: "pcs", unitPrice: 500000 },
  { category: "Electrical", brand: "Generic / approved brand", description: "AC SPD Type 2", specification: "Voltage, poles and certification verify", unit: "pcs", unitPrice: 500000 },
  { category: "Grounding", brand: "Generic cable supplier", description: "PE copper cable 16 mm²", specification: "Conductor standard and brand verify", unit: "m", unitPrice: 45000 },
  { category: "Grounding", brand: "Generic grounding supplier", description: "Copper-bonded ground rod", specification: "Length and diameter verify", unit: "pcs", unitPrice: 150000 },
  { category: "Electrical", brand: "Generic / approved brand", description: "DC isolator switch", specification: "DC-PV voltage/current rating verify", unit: "pcs", unitPrice: 450000 },
  { category: "Civil", brand: "Ready-mix supplier", description: "Ready-mix concrete", specification: "Grade, volume and delivery location dependent", unit: "m\u00b3", unitPrice: 1100000 },
];

const units = ["pcs", "m", "kg", "set", "lot", "roll", "box", "unit"];
const PV_LAYOUT_STORAGE_KEY = "solar-apps-pv-layout-v1";
// Budgetary conversion rate for display only; update when preparing a real quotation.
const IDR_PER_USD = 17000;

const card: React.CSSProperties = { background: "var(--panel, #111a16)", border: "1px solid var(--border, #2a3931)", borderRadius: 14, padding: 18 };
const field: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border, #34443a)", background: "var(--input, #0c1210)", color: "var(--text, #f1f5f2)", font: "inherit" };
const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border, #34443a)", background: "var(--panel, #17211b)", color: "var(--text, #f1f5f2)", cursor: "pointer", font: "inherit" };

function money(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}
function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function BOQ({ lang = "en", userId = "anonymous", projectId = null, projectName = null }: { lang?: Lang; userId?: string; projectId?: string | null; projectName?: string | null }) {
  const scopedBoqKey = `solar-apps-boq-v1:${userId}:${projectId ?? "unassigned"}`;
  const idText = lang === "id";
  const [project, setProject] = useState(projectName || "PLTS Project");
  const [client, setClient] = useState("");
  const [currency, setCurrency] = useState<"IDR" | "USD">("IDR");
  const [taxPercent, setTaxPercent] = useState(11);
  const [contingencyPercent, setContingencyPercent] = useState(0);
  const [items, setItems] = useState<Item[]>(() => {
    try {
      const raw = localStorage.getItem(scopedBoqKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const defBoq = getProjectDefaultBoq(projectId);
    if (defBoq) return defBoq.map(x => ({ ...x }));
    return starterItems.map(x => ({ ...x }));
  });
  const [filter, setFilter] = useState("All");
  const [catalogFilter, setCatalogFilter] = useState("All categories");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pvSyncInfo, setPvSyncInfo] = useState<{ count: number; watts: number; system: string } | null>(null);
  const [pvSyncMessage, setPvSyncMessage] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let isCancelled = false;
    const targetId = projectId;
    async function loadRemoteBoq() {
      const remote = await api.fetchProjectBoq(targetId);
      if (remote && Array.isArray(remote) && remote.length > 0 && !isCancelled) {
        setItems(remote);
        try {
          localStorage.setItem(scopedBoqKey, JSON.stringify(remote));
        } catch {}
      }
    }
    loadRemoteBoq();
    return () => { isCancelled = true; };
  }, [projectId, scopedBoqKey]);

  function persistItems(next: Item[]) {
    setItems(next);
    try {
      localStorage.setItem(scopedBoqKey, JSON.stringify(next));
    } catch {}
    if (projectId) {
      api.saveProjectBoq(projectId, next);
    }
  }

  const rows = useMemo(() => items.filter(i => filter === "All" || i.category === filter), [items, filter]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + Math.max(0, Number(i.quantity) || 0) * Math.max(0, Number(i.unitPrice) || 0), 0), [items]);
  const contingency = subtotal * Math.max(0, contingencyPercent) / 100;
  const tax = (subtotal + contingency) * Math.max(0, taxPercent) / 100;
  const total = subtotal + contingency + tax;
  const fmt = (n: number) => currency === "IDR" ? money(n) : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format((Number.isFinite(n) ? n : 0) / IDR_PER_USD);
  const displayedUnitPrice = (idrPrice: number) => currency === "USD" ? idrPrice / IDR_PER_USD : idrPrice;

  function update(id: string, key: keyof Item, value: string) {
    const updated = items.map(item => {
      if (item.id !== id) return item;
      if (key === "quantity") return { ...item, quantity: Math.max(0, Number(value) || 0) };
      if (key === "unitPrice") { const enteredPrice = Math.max(0, Number(value) || 0); return { ...item, unitPrice: currency === "USD" ? enteredPrice * IDR_PER_USD : enteredPrice }; }
      return { ...item, [key]: value };
    });
    persistItems(updated);
  }
  function syncPVLayout() {
    try {
      const raw = (projectId ? localStorage.getItem(`${PV_LAYOUT_STORAGE_KEY}:project:${projectId}`) : null)
        || localStorage.getItem(`${PV_LAYOUT_STORAGE_KEY}:${userId}:${projectId ?? "unassigned"}`)
        || localStorage.getItem(`${PV_LAYOUT_STORAGE_KEY}:${userId}`);
      let data: any = null;
      if (raw) {
        data = JSON.parse(raw);
      } else {
        data = getProjectDefaultLayout(projectId);
      }
      if (!data) {
        setPvSyncInfo(null);
        setPvSyncMessage(idText ? "Draft PV Layout belum ditemukan. Buka PV Layout, buat/simpan layout, lalu coba sinkronkan lagi." : "No saved PV Layout draft found. Open PV Layout, create/save a layout, then sync again.");
        return;
      }
      const count = Array.isArray(data?.panels) ? data.panels.length : 0;
      const watts = Math.max(0, Number(data?.settings?.watts) || 0);
      const system = String(data?.settings?.system || "PV Layout");
      if (count === 0) {
        setPvSyncInfo({ count, watts, system });
        setPvSyncMessage(idText ? "Layout tersimpan, tetapi belum ada panel. Tambahkan/generate panel terlebih dahulu." : "Layout is saved but contains no panels. Add/generate panels first.");
        return;
      }
      const existing = items.find(item => item.id === "pv-1" || item.id === "c-pv-1" || item.id === "k-pv-1") || items.find(item => item.category === "PV Module");
      const next = existing
        ? items.map(item => item.id === existing.id ? { ...item, quantity: count, specification: `${watts || "?"} Wp/module · ${system} · synced from PV Layout (${count} modules)` } : item)
        : [...items, { id: `pv-layout-${Date.now()}`, category: "PV Module", description: "PV module (synced from PV Layout)", specification: `${watts || "?"} Wp/module · ${system} · synced from PV Layout (${count} modules)`, unit: "pcs", quantity: count, unitPrice: 1800000 }];
      persistItems(next);
      setPvSyncInfo({ count, watts, system });
      setPvSyncMessage(idText ? `Berhasil sinkron: ${count} modul · kapasitas DC ${(count * watts / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kWp. Kuantitas panel diperbarui di BOQ.` : `Synced ${count} modules · ${(count * watts / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} kWp DC. PV module quantity updated in BOQ.`);
    } catch {
      setPvSyncMessage(idText ? "Draft PV Layout tidak dapat dibaca. Coba buka dan simpan ulang layout." : "Could not read the PV Layout draft. Open and save the layout again.");
    }
  }
  const visibleCatalog = useMemo(() => marketCatalog.filter(x => catalogFilter === "All categories" || x.category === catalogFilter), [catalogFilter]);

  function addCatalogItem(product: CatalogItem) {
    persistItems([...items, {
      id: `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: product.category,
      description: `${product.brand} — ${product.description}`,
      specification: product.specification,
      unit: product.unit,
      quantity: 1,
      unitPrice: product.unitPrice
    }]);
  }

  function addItem() {
    persistItems([...items, { id: `item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, category: "Other", description: "", specification: "", unit: "pcs", quantity: 0, unitPrice: 0 }]);
  }
  function exportJSON() {
    downloadFile("solar-apps-boq.json", JSON.stringify({ project, client, currency, taxPercent, contingencyPercent, items, exportedAt: new Date().toISOString() }, null, 2), "application/json");
  }
  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const data = [
      ["Project", project], ["Client", client], ["Currency", currency], [],
      ["No.", "Category", "Description", "Specification", "Unit", "Quantity", "Unit Price", "Amount"],
      ...items.map((i, n) => [n + 1, i.category, i.description, i.specification, i.unit, i.quantity, i.unitPrice, i.quantity * i.unitPrice]),
      [], ["Subtotal", "", "", "", "", "", "", subtotal],
      ["Contingency", `${contingencyPercent}%`, "", "", "", "", "", contingency],
      ["Tax", `${taxPercent}%`, "", "", "", "", "", tax],
      ["Grand Total", "", "", "", "", "", "", total],
    ];
    downloadFile("solar-apps-boq.csv", "\uFEFF" + data.map(row => row.map(esc).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function importJSON(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.items)) throw new Error("Invalid BOQ file");
        const imported = data.items.map((x: any, index: number) => ({
          id: String(x.id ?? `import-${index}`),
          category: categories.includes(x.category) ? x.category : "Other",
          description: String(x.description ?? ""),
          specification: String(x.specification ?? ""),
          unit: units.includes(x.unit) ? x.unit : "pcs",
          quantity: Math.max(0, Number(x.quantity) || 0),
          unitPrice: Math.max(0, Number(x.unitPrice) || 0),
        }));
        persistItems(imported);
        if (typeof data.project === "string") setProject(data.project);
        if (typeof data.client === "string") setClient(data.client);
        if (data.currency === "USD" || data.currency === "IDR") setCurrency(data.currency);
        if (Number.isFinite(Number(data.taxPercent))) setTaxPercent(Math.max(0, Number(data.taxPercent)));
        if (Number.isFinite(Number(data.contingencyPercent))) setContingencyPercent(Math.max(0, Number(data.contingencyPercent)));
      } catch { window.alert(idText ? "File BOQ tidak valid." : "Invalid BOQ file."); }
    };
    reader.readAsText(file);
  }

  return <section style={{ display: "grid", gap: 16, color: "var(--text, #f1f5f2)" }}>
    <div className="module-page-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><span className="eyebrow">ENGINEERING MODULE</span><h1 style={{ margin: "8px 0" }}>Bill of Quantities (BOQ)</h1><p style={{ margin: 0, color: "var(--muted, #93a69a)" }}>{idText ? "Rekap material, kuantitas, dan estimasi biaya proyek PLTS." : "Material takeoff, quantities, and cost estimate for PV projects."}</p></div>
      <span className="status status-planning"><i /> {idText ? "Estimasi" : "Estimate"}</span>
    </div>

    <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #93a69a)" }}>{idText ? "Nama proyek" : "Project name"}<input style={field} value={project} onChange={e => setProject(e.target.value)} /></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #93a69a)" }}>{idText ? "Klien" : "Client"}<input style={field} value={client} onChange={e => setClient(e.target.value)} placeholder={idText ? "Nama klien (opsional)" : "Client name (optional)"} /></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #93a69a)" }}>{idText ? "Mata uang" : "Currency"}<select style={field} value={currency} onChange={e => setCurrency(e.target.value as "IDR" | "USD")}><option value="IDR">IDR — Rupiah</option><option value="USD">USD — US Dollar</option></select></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #93a69a)"}}>{idText ? "Pajak (%)" : "Tax (%)"}<input style={field} type="number" min="0" value={taxPercent} onChange={e => setTaxPercent(Math.max(0, Number(e.target.value) || 0))} /></label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--muted, #93a69a)"}}>{idText ? "Cadangan (%)" : "Contingency (%)"}<input style={field} type="number" min="0" value={contingencyPercent} onChange={e => setContingencyPercent(Math.max(0, Number(e.target.value) || 0))} /></label>
    </div>
    <p style={{ margin: "-6px 2px 0", color: "var(--muted, #93a69a)", fontSize: 12 }}>
      {currency === "USD" ? (idText ? `Kurs estimasi: 1 USD = Rp${IDR_PER_USD.toLocaleString("id-ID")}. Harga disimpan dalam IDR dan dikonversi untuk tampilan.` : `Indicative exchange rate: USD 1 = IDR ${IDR_PER_USD.toLocaleString("en-US")}. Prices are stored in IDR and converted for display.`) : (idText ? `Harga katalog disimpan dalam Rupiah. Kurs tampilan USD: 1 USD = Rp${IDR_PER_USD.toLocaleString("id-ID")}.` : `Catalog prices are stored in Rupiah. USD display rate: 1 USD = IDR ${IDR_PER_USD.toLocaleString("en-US")}.`)}
    </p>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      {[{ label: idText ? "Subtotal material" : "Material subtotal", value: fmt(subtotal) }, { label: idText ? "Cadangan" : "Contingency", value: fmt(contingency) }, { label: idText ? "Pajak" : "Tax", value: fmt(tax) }, { label: idText ? "Total estimasi" : "Estimated total", value: fmt(total) }].map((x, i) => <div key={x.label} style={{ ...card, padding: 16 }}><div style={{ color: "var(--muted, #93a69a)", fontSize: 13 }}>{x.label}</div><div style={{ fontSize: i === 3 ? 23 : 20, fontWeight: 750, marginTop: 10, overflowWrap: "anywhere", color: i === 3 ? "#b5f36a" : "var(--text, #f1f5f2)" }}>{x.value}</div></div>)}
    </div>

    <div style={{ ...card, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 5px" }}>{idText ? "Sinkronisasi PV Layout" : "PV Layout sync"}</h2>
          <p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 13 }}>{idText ? "Ambil jumlah panel dan daya modul dari draft PV Layout yang tersimpan di browser ini." : "Read module count and module wattage from the saved PV Layout draft in this browser."}</p>
        </div>
        <button style={{ ...btn, borderColor: "#8bcf45" }} onClick={syncPVLayout}><RotateCcw size={15} />{idText ? "Sync PV Layout" : "Sync PV Layout"}</button>
      </div>
      {pvSyncInfo && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        <div style={{ ...card, padding: 12 }}><div style={{ color: "var(--muted, #93a69a)", fontSize: 12 }}>{idText ? "Jumlah panel" : "Panel count"}</div><strong style={{ fontSize: 20 }}>{pvSyncInfo.count.toLocaleString()}</strong><div style={{ color: "var(--muted, #93a69a)", fontSize: 12 }}>pcs</div></div>
        <div style={{ ...card, padding: 12 }}><div style={{ color: "var(--muted, #93a69a)", fontSize: 12 }}>{idText ? "Daya modul" : "Module power"}</div><strong style={{ fontSize: 20 }}>{pvSyncInfo.watts.toLocaleString()} Wp</strong></div>
        <div style={{ ...card, padding: 12 }}><div style={{ color: "var(--muted, #93a69a)", fontSize: 12 }}>{idText ? "Kapasitas DC" : "DC capacity"}</div><strong style={{ fontSize: 20, color: "#b5f36a" }}>{(pvSyncInfo.count * pvSyncInfo.watts / 1000).toLocaleString(idText ? "id-ID" : "en-US", { maximumFractionDigits: 2 })} kWp</strong></div>
      </div>}
      {pvSyncMessage && <p role="status" style={{ margin: 0, color: pvSyncInfo && pvSyncInfo.count > 0 ? "#b5f36a" : "var(--muted, #93a69a)", fontSize: 13 }}>{pvSyncMessage}</p>}
    </div>


    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: "0 0 5px" }}>{idText ? "Katalog harga pasar Indonesia" : "Indonesia market price catalog"}</h2>
        <p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 13 }}>{idText ? "Pilih merek/material untuk menambahkan item beserta harga indikatif. Harga publik bukan quotation kontrak EPC." : "Choose a brand/material to add an item with an indicative price. Public listings are not EPC contract quotes."}</p>
      </div>
      <label style={{ display: "grid", gap: 6, maxWidth: 340, fontSize: 13, color: "var(--muted, #93a69a)" }}>
        {idText ? "Filter katalog" : "Catalog filter"}
        <select style={field} value={catalogFilter} onChange={e => setCatalogFilter(e.target.value)}>
          <option>All categories</option>{categories.filter(c => c !== "Other").map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
          <thead><tr>{[idText ? "Kategori" : "Category", idText ? "Merek" : "Brand", idText ? "Material" : "Material", idText ? "Satuan" : "Unit", idText ? "Harga indikatif" : "Indicative price", ""].map((h, i) => <th key={i} style={{ textAlign: "left", padding: "10px 8px", color: "var(--muted, #93a69a)", fontSize: 12, borderBottom: "1px solid var(--border, #2a3931)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{visibleCatalog.map((product, index) => <tr key={`${product.brand}-${product.description}-${index}`}>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)" }}>{product.category}</td>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)", whiteSpace: "nowrap" }}>{product.brand}</td>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)", minWidth: 230 }}><div>{product.description}</div><div style={{ color: "var(--muted, #93a69a)", fontSize: 11 }}>{product.specification}</div></td>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)" }}>{product.unit}</td>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)", whiteSpace: "nowrap", fontWeight: 650 }}>{fmt(product.unitPrice)}</td>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)" }}><button style={{ ...btn, whiteSpace: "nowrap" }} onClick={() => addCatalogItem(product)}><Plus size={14} />{idText ? "Tambah ke BOQ" : "Add to BOQ"}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 12 }}>{idText ? "Harga hanya referensi awal. Verifikasi model, sertifikasi, ongkir, PPN, volume, kurs, dan quotation distributor sebelum tender/pembelian." : "Prices are initial references. Verify model, certification, freight, VAT, volume, currency and distributor quotations before tender/procurement."}</p>
    </div>

    <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div><h2 style={{ margin: "0 0 5px" }}>{idText ? "Daftar material" : "Material list"}</h2><p style={{ margin: 0, color: "var(--muted, #93a69a)", fontSize: 13 }}>{idText ? `${items.length} baris · isi kuantitas dan harga satuan sesuai penawaran aktual.` : `${items.length} rows · enter quantities and unit prices from current quotations.`}</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={addItem}><Plus size={15} />{idText ? "Tambah item" : "Add item"}</button>
        <button style={btn} onClick={() => fileRef.current?.click()}><FileUp size={15} />{idText ? "Buka JSON" : "Open JSON"}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={e => { importJSON(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <button style={btn} onClick={exportJSON}><Download size={15} />JSON</button>
        <button style={btn} onClick={exportCSV}><FileDown size={15} />CSV</button>
        <button style={btn} onClick={() => window.print()}><Printer size={15} />PDF / Print</button>
        <button style={btn} onClick={() => { if (window.confirm(idText ? "Kembalikan daftar awal? Perubahan saat ini akan hilang." : "Reset to starter list? Current edits will be lost.")) { persistItems(starterItems.map(x => ({ ...x }))); setProject("PLTS Project"); setClient(""); setTaxPercent(11); setContingencyPercent(0); setCurrency("IDR"); } }}><RotateCcw size={15} /></button>
      </div>
    </div>

    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid var(--border, #2a3931)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>{idText ? "Filter kategori" : "Category filter"}</strong>
        <select style={{ ...field, width: "auto", minWidth: 170 }} value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <span style={{ marginLeft: "auto", color: "var(--muted, #93a69a)", fontSize: 12 }}>{idText ? "Harga belum diisi bernilai nol." : "Blank prices are treated as zero."}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
          <thead><tr>{[idText ? "No." : "No.", idText ? "Kategori" : "Category", idText ? "Deskripsi" : "Description", idText ? "Spesifikasi" : "Specification", idText ? "Satuan" : "Unit", idText ? "Kuantitas" : "Quantity", idText ? "Harga satuan" : "Unit price", idText ? "Jumlah" : "Amount", ""].map((h, i) => <th key={i} style={{ textAlign: "left", padding: "12px 10px", color: "var(--muted, #93a69a)", fontSize: 12, borderBottom: "1px solid var(--border, #2a3931)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((item, idx) => <tr key={item.id}>
            <td style={{ padding: 8, borderBottom: "1px solid var(--border, #26352d)", color: "var(--muted, #93a69a)" }}>{items.findIndex(x => x.id === item.id) + 1}</td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)" }}><select aria-label="Category" style={field} value={item.category} onChange={e => update(item.id, "category", e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)", minWidth: 170 }}><input aria-label="Description" style={field} value={item.description} onChange={e => update(item.id, "description", e.target.value)} /></td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)", minWidth: 190 }}><input aria-label="Specification" style={field} value={item.specification} onChange={e => update(item.id, "specification", e.target.value)} /></td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)" }}><select aria-label="Unit" style={field} value={item.unit} onChange={e => update(item.id, "unit", e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)", minWidth: 100 }}><input aria-label="Quantity" style={field} type="number" min="0" step="any" value={item.quantity} onChange={e => update(item.id, "quantity", e.target.value)} /></td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)", minWidth: 135 }}><input aria-label="Unit price" style={field} type="number" min="0" step="any" value={Number(displayedUnitPrice(item.unitPrice).toFixed(currency === "USD" ? 2 : 0))} onChange={e => update(item.id, "unitPrice", e.target.value)} /></td>
            <td style={{ padding: 10, borderBottom: "1px solid var(--border, #26352d)", whiteSpace: "nowrap", fontWeight: 650 }}>{fmt(item.quantity * item.unitPrice)}</td>
            <td style={{ padding: 6, borderBottom: "1px solid var(--border, #26352d)" }}><button aria-label="Delete item" title={idText ? "Hapus item" : "Delete item"} style={{ ...btn, padding: 8 }} onClick={() => persistItems(items.filter(x => x.id !== item.id))}><Trash2 size={15} /></button></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--muted, #93a69a)" }}>{idText ? "Tidak ada item pada kategori ini." : "No items in this category."}</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={7} style={{ padding: 14, textAlign: "right", fontWeight: 700, borderTop: "1px solid var(--border, #2a3931)" }}>{idText ? "Subtotal seluruh item" : "All items subtotal"}</td><td style={{ padding: 14, fontWeight: 800, borderTop: "1px solid var(--border, #2a3931)", whiteSpace: "nowrap" }}>{fmt(subtotal)}</td><td /></tr></tfoot>
        </table>
      </div>
    </div>
    <div style={{ ...card, borderColor: "#725c22", background: "rgba(120,90,20,.12)", fontSize: 13, lineHeight: 1.6 }}>
      <strong>{idText ? "Catatan estimasi" : "Estimate note"}</strong><div>{idText ? "Daftar awal adalah template; jumlah panel dapat disinkronkan dari draft PV Layout yang tersimpan. Pastikan semua jumlah, spesifikasi, harga, pajak, dan kurs diverifikasi sebelum dijadikan BOQ penawaran atau pembelian." : "Starter rows are a template; PV module count can be synced from the saved PV Layout draft. Verify quantities, specifications, prices, tax, and currency before using this BOQ for quotation or procurement."}</div>
    </div>
  </section>;
}
