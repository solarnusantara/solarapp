import { useEffect, useMemo, useState } from "react";
import * as api from "./api";
import type { Project, SonusUser } from "./api";
import PVLayout from "./PVLayout";
import PVLayout3D from "./PVLayout3D";
import StringCalculator from "./StringCalculator";
import InverterConfiguration from "./InverterConfiguration";
import CableSizing from "./CableSizing";
import ProtectionGrounding from "./ProtectionGrounding";
import StructuralDesign from "./StructuralDesign";
import CADDrawings from "./CADDrawings";
import TraySizing from "./TraySizing";
import BreakerSizing from "./BreakerSizing";
import MountingDesign from "./MountingDesign";
import SurveyReport from "./SurveyReport";
import EngineeringReport from "./EngineeringReport";
import BOQ from "./BOQ";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Box, Cable,
  Check, ChevronDown, CircleHelp, ClipboardList, CloudSun,
  Command, Database, FileText, FolderOpen, Gauge, Globe,
  Grid2X2, Layers3, LayoutDashboard, Menu, Plus, Search,
  Settings2, ShieldCheck, Sun, X, Zap, Trash2, Maximize2, Minimize2,
  ExternalLink
} from "lucide-react";

type Lang = "id" | "en";
type ModuleId = "dashboard" | "projects" | "layout" | "layout3d" | "electrical" | "cable" | "protection" | "structure" | "cad" | "boq" | "survey" | "tray" | "breaker" | "mounting" | "report" | "settings";

const copy = {
  id: {
    workspace: "RUANG KERJA", tools: "ALAT ENGINEERING", dashboard: "Dasbor", projects: "Proyek",
    layout: "Layout PV 2D", electrical: "Desain Elektrikal", structure: "Desain Struktur", cad: "CAD & Gambar",
    boq: "Bill of Quantities", settings: "Pengaturan", search: "Cari proyek, modul...", welcome: "Studio Engineering PLTS SonusID",
    subtitle: "Desain 2D/3D, sizing kabel, string, kalkulasi struktur & BoQ siap eksekusi.", newProject: "Proyek Baru", overview: "Ringkasan Desain",
    allProjects: "Semua Proyek", capacity: "Total Kapasitas", active: "Proyek Aktif", modules: "Modul Tersedia",
    completion: "Penyelesaian Proyek", recent: "Proyek EPC Terbaru", project: "Proyek", type: "Jenis Sistem", status: "Status",
    power: "Kapasitas", updated: "Diperbarui", action: "Aksi", open: "Buka Studio", viewAll: "Lihat semua",
    quick: "Akses Cepat", quickDesc: "Lanjutkan alur kerja engineering", rooftop: "PLTS Atap (Rooftop)", ground: "Ground-mounted",
    strings: "Konfigurasi String", materials: "Material Takeoff", createTitle: "Buat Proyek Desain Baru",
    projectName: "Nama proyek", projectType: "Jenis sistem", capacityKwp: "Kapasitas (kWp)", cancel: "Batal", create: "Simpan & Buka",
    namePlaceholder: "mis. PLTS Rooftop Pabrik Cikarang 500 kWp", empty: "Belum ada proyek desain.", language: "Bahasa",
    planning: "Perencanaan", progress: "Sedang Berjalan", completed: "Selesai", notifications: "Notifikasi",
    ready: "Ruang Kerja SonusID", readyDesc: "Terintegrasi langsung dengan database ERP Sonus", newProjectDesc: "Mulai kalkulasi desain PLTS baru",
    back: "Kembali ke Dasbor", placeholder: "Modul ini masih dalam tahap finalisasi integrasi.",
    roadmap: "Integrasi ERP Sonus", roadmapDesc: "Data BoQ dapat langsung dikonversi menjadi draft Purchase Request SCM.",
  },
  en: {
    workspace: "WORKSPACE", tools: "ENGINEERING TOOLS", dashboard: "Dashboard", projects: "Projects",
    layout: "PV Layout 2D", electrical: "Electrical Design", structure: "Structural Design", cad: "CAD & Drawings",
    boq: "Bill of Quantities", settings: "Settings", search: "Search projects, tools...", welcome: "SonusID Solar Engineering Studio",
    subtitle: "2D/3D layout, string sizing, cable schedules, structural load & actionable BoQ.", newProject: "New Project", overview: "Design Overview",
    allProjects: "All Projects", capacity: "Total Capacity", active: "Active Projects", modules: "Engineering Modules",
    completion: "Project Completion", recent: "Recent EPC Projects", project: "Project", type: "System Type", status: "Status",
    power: "Capacity", updated: "Last Updated", action: "Action", open: "Open Studio", viewAll: "View all projects",
    quick: "Quick Access", quickDesc: "Continue your engineering workflow", rooftop: "Rooftop PV", ground: "Ground-mounted PV",
    strings: "String Configuration", materials: "Material Takeoff", createTitle: "Create a new project design",
    projectName: "Project name", projectType: "System type", capacityKwp: "Capacity (kWp)", cancel: "Cancel", create: "Create Project",
    namePlaceholder: "e.g. 500 kWp Rooftop Solar Factory", empty: "No projects found.", language: "Language",
    planning: "Planning", progress: "In Progress", completed: "Completed", notifications: "Notifications",
    ready: "SonusID Workspace", readyDesc: "Directly integrated with Sonus ERP database", newProjectDesc: "Start a new solar PV engineering design",
    back: "Back to Dashboard", placeholder: "This module is in final integration phase.",
    roadmap: "Sonus ERP Integration", roadmapDesc: "BoQ items can be exported directly into SCM Purchase Requests.",
  }
};

const moduleIcons: Record<ModuleId, any> = {
  dashboard: LayoutDashboard,
  projects: FolderOpen,
  layout: Grid2X2,
  layout3d: Box,
  electrical: Cable,
  cable: Cable,
  protection: ShieldCheck,
  structure: Layers3,
  cad: FileText,
  boq: ClipboardList,
  survey: ClipboardList,
  tray: Cable,
  breaker: Zap,
  mounting: Layers3,
  report: FileText,
  settings: Settings2,
};

export default function App() {
  const [lang, setLang] = useState<Lang>("id");
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [user, setUser] = useState<SonusUser>(() => api.getCurrentUser());
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<Project["type"]>("Rooftop");
  const [projectCapacity, setProjectCapacity] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: "Studio Desain PLTS Siap Digunakan", message: "15 Modul engineering terintegrasi langsung dengan SonusID.", time: "Baru saja", read: false },
    { id: 2, title: "Integrasi BoQ & SCM", message: "Hasil kalkulasi BoQ dapat langsung dikonversi menjadi draft Purchase Request SCM.", time: "Hari ini", read: false },
    { id: 3, title: "Verifikasi Struktur", message: "Validasi beban angin dan sudut tilt sebelum finalisasi konstruksi.", time: "Kemarin", read: true },
  ]);

  useEffect(() => {
    async function init() {
      const u = api.getCurrentUser();
      setUser(u);

      const projs = await api.fetchProjects();
      setProjects(projs);

      const initialId = api.getInitialProjectId();
      if (initialId) {
        const found = projs.find(p => p.id === initialId);
        if (found) {
          setActiveProject(found);
          setActive("layout");
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const t = copy[lang];

  function handleSwitchToSuperApp(e: React.MouseEvent, url: string) {
    e.preventDefault();
    const curtain = document.createElement("div");
    curtain.className = "ts-app-switch-curtain to-super";
    document.body.appendChild(curtain);
    requestAnimationFrame(() => {
      curtain.classList.add("is-active");
    });
    setTimeout(() => {
      window.location.href = url;
    }, 160);
  }

  function toggleFullscreen() {
    setIsFullscreen(prev => !prev);
    const body = document.body;
    if (!isFullscreen) {
      body.classList.add("ts-studio-fullscreen");
    } else {
      body.classList.remove("ts-studio-fullscreen");
    }
  }

  const navGroups = [
    { label: t.workspace, items: [{ id: "dashboard" as const, label: t.dashboard }, { id: "projects" as const, label: t.projects }] },
    { label: t.tools, items: [
      { id: "layout" as const, label: t.layout },
      { id: "layout3d" as const, label: "PV Layout 3D" },
      { id: "electrical" as const, label: t.electrical },
      { id: "cable" as const, label: "Cable Sizing" },
      { id: "protection" as const, label: lang === "id" ? "Proteksi & Grounding" : "Protection & Grounding" },
      { id: "structure" as const, label: t.structure },
      { id: "cad" as const, label: t.cad },
      { id: "boq" as const, label: t.boq },
      { id: "survey" as const, label: "Survey Report" },
      { id: "tray" as const, label: "Tray Sizing" },
      { id: "breaker" as const, label: "Breaker Sizing" },
      { id: "mounting" as const, label: lang === "id" ? "Desain Mounting" : "Mounting Design" },
      { id: "report" as const, label: lang === "id" ? "Laporan Engineering" : "Engineering Report" },
    ]},
  ];

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter(p => [p.name, p.type, p.status].some(v => v.toLowerCase().includes(q)));
  }, [projects, search]);

  const activeCapacity = projects.filter(p => p.status !== "Completed").reduce((sum, p) => sum + p.capacity, 0);
  const completedCount = projects.filter(p => p.status === "Completed").length;
  const pageNames: Record<ModuleId, string> = {
    dashboard: t.dashboard, projects: t.projects, layout: t.layout, layout3d: "PV Layout 3D", electrical: t.electrical, cable: "Cable Sizing", protection: lang === "id" ? "Proteksi & Grounding" : "Protection & Grounding",
    structure: t.structure, cad: t.cad, boq: t.boq,
    survey: "Survey Report", tray: "Tray Sizing", breaker: "Breaker Sizing",
    mounting: lang === "id" ? "Desain Mounting" : "Mounting Design",
    report: lang === "id" ? "Laporan Engineering" : "Engineering Report", settings: t.settings,
  };

  function openModule(id: ModuleId) { setActive(id); setMobileNav(false); }
  function openProject(project: Project, module: ModuleId = "layout") { setActiveProject(project); setActive(module); setMobileNav(false); }

  async function handleDeleteProject(project: Project) {
    const message = lang === "id"
      ? `Hapus proyek "${project.name}"? Tindakan ini tidak bisa dibatalkan.`
      : `Delete project "${project.name}"? This cannot be undone.`;

    if (!window.confirm(message)) return;
    await api.deleteProject(project.id);
    setProjects(prev => prev.filter(p => p.id !== project.id));
    if (activeProject?.id === project.id) setActiveProject(null);
  }

  async function handleCreateProject() {
    const name = projectName.trim();
    const capacity = Number(projectCapacity);

    if (!name || !Number.isFinite(capacity) || capacity <= 0) return;

    const created = await api.createProject({
      name,
      type: projectType,
      capacity,
      status: "Planning",
    });

    setProjects(prev => [created, ...prev]);
    setProjectName("");
    setProjectCapacity("");
    setModal(false);
    openProject(created, "layout");
  }

  const statusLabel = (status: Project["status"]) =>
    status === "Planning" ? t.planning : status === "In Progress" ? t.progress : t.completed;

  if (loading) {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: "#0c100f", color: "#e8eee9" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Sun size={32} color="#b8f36b" className="animate-spin" />
          <span>Memuat Studio Desain SonusID...</span>
        </div>
      </main>
    );
  }

  return (
    <div className={`solar-studio-app app-shell ${isFullscreen ? "is-fullscreen" : ""}`}>
      {mobileNav && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Sun size={23} /></div>
          <div>
            <div className="brand-name">SOLAR<span>APP</span></div>
            <div className="brand-sub">ENGINEERING STUDIO</div>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="workspace-switch-wrap">
          <div className="workspace-switch" style={{ cursor: "default" }}>
            <div className="workspace-avatar" style={{ background: "#20321f", color: "#b8f36b" }}>
              {user.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="workspace-text">
              <strong>{user.name}</strong>
              <span>SonusID SuperApp · {user.role}</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map(group => (
            <div className="nav-group" key={group.label}>
              <div className="nav-heading">{group.label}</div>
              {group.items.map(item => {
                const Icon = moduleIcons[item.id];
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={() => openModule(item.id)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <Sun className="system-icon" size={17} />
            <div>
              <strong>{activeProject ? activeProject.name : "Proyek Aktif: Belum Dipilih"}</strong>
              <span>{activeProject ? `${activeProject.capacity} kWp · ${activeProject.type}` : "Pilih proyek di daftar proyek atau mulai desain baru."}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={18} /></button>
            <div className="ts-app-switcher ts-app-switcher-dark" role="tablist" aria-label="Mode Aplikasi" style={{ marginRight: 10 }}>
              <a
                href="/hub/dashboard"
                className="ts-app-switcher-item"
                role="tab"
                aria-selected="false"
                onClick={(e) => handleSwitchToSuperApp(e, "/hub/dashboard")}
              >
                SuperApp
              </a>
              <span className="ts-app-switcher-item is-active" role="tab" aria-selected="true">
                SolarApp
              </span>
            </div>
            <div className="breadcrumb">
              <span>SolarApp</span>
              <span className="crumb-sep">/</span>
              {activeProject && (
                <>
                  <span style={{ color: "var(--green)" }}>{activeProject.name}</span>
                  <span className="crumb-sep">/</span>
                </>
              )}
              <strong>{pageNames[active]}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <Search size={14} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} />
              <kbd>Ctrl K</kbd>
            </div>

            <button
              className="icon-button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh (CAD Mode)"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span style={{ fontSize: 11, marginLeft: 4 }}>{isFullscreen ? "Kecilkan" : "Layar Penuh"}</span>
            </button>

            <button
              className="language-button"
              onClick={() => setLang(lang === "en" ? "id" : "en")}
              title="Ganti Bahasa"
            >
              <Globe size={15} />
              <span>{lang.toUpperCase()}</span>
            </button>


          </div>
        </header>

        <div className="page-content">
          {active === "dashboard" ? (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="live-dot" /> EPC ENGINEERING SUITE</div>
                  <h1>{t.welcome}</h1>
                  <p>{t.subtitle}</p>
                </div>
                <button className="primary-button" onClick={() => setModal(true)}>
                  <Plus size={16} /> {t.newProject}
                </button>
              </div>

              <div className="metric-grid">
                <MetricCard label={t.capacity} value={`${activeCapacity.toLocaleString()} kWp`} note="Kapasitas portofolio aktif" icon={<Sun size={17} />} trend="Aktif" />
                <MetricCard label={t.active} value={projects.filter(p => p.status !== "Completed").length.toString()} note="Proyek dalam pengerjaan" icon={<Activity size={17} />} trend="Berjalan" />
                <MetricCard label={t.completion} value={`${completedCount} Proyek`} note="Selesai & terverifikasi" icon={<Check size={17} />} trend="Selesai" />
                <MetricCard label={t.modules} value="15 Tool" note="2D/3D, Elektrikal, Kabel, CAD, BoQ" icon={<Gauge size={17} />} trend="Siap" />
              </div>

              <div className="content-grid">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{t.recent}</h2>
                      <p>Daftar proyek PLTS yang tersimpan di sistem</p>
                    </div>
                    <button className="text-button" onClick={() => openModule("projects")}>
                      {t.viewAll} <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.project}</th>
                          <th>{t.type}</th>
                          <th>{t.status}</th>
                          <th>{t.power}</th>
                          <th>{t.updated}</th>
                          <th>{lang === "id" ? "Aksi" : "Actions"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.slice(0, 5).map(p => (
                          <tr key={p.id}>
                            <td>
                              <button type="button" className="text-button project-open-link" onClick={() => openProject(p, "layout")}>
                                <strong>{p.name}</strong>
                              </button>
                            </td>
                            <td>{p.type === "Rooftop" ? t.rooftop : t.ground}</td>
                            <td>
                              <span className={`status status-${p.status.toLowerCase().replace(" ", "-")}`}>
                                <i /> {statusLabel(p.status)}
                              </span>
                            </td>
                            <td>{p.capacity.toLocaleString()} kWp</td>
                            <td>{p.updated}</td>
                            <td>
                              <button type="button" className="open-button" onClick={() => openProject(p, "layout")}>
                                {t.open}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!filteredProjects.length && (
                          <tr><td colSpan={6} className="empty-state">{t.empty}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel quick-panel">
                  <div className="panel-header">
                    <div>
                      <h2>{t.quick}</h2>
                      <p>{t.quickDesc}</p>
                    </div>
                  </div>
                  <div className="quick-list">
                    <QuickAction icon={<Grid2X2 size={18} />} title="Editor Layout PV 2D" subtitle="Penataan modul, obstacle, dan kalkulasi array" onClick={() => openModule("layout")} />
                    <QuickAction icon={<Box size={18} />} title="Viewer 3D Atap & Lahan" subtitle="Render Three.js interaktif dengan bayangan" onClick={() => openModule("layout3d")} />
                    <QuickAction icon={<Cable size={18} />} title="Kalkulator String & Inverter" subtitle="Cek Voc, Vmp, dan kesesuaian MPPT inverter" onClick={() => openModule("electrical")} />
                    <QuickAction icon={<ClipboardList size={18} />} title="Bill of Quantities (BoQ)" subtitle="Rincian material siap tarik ke SCM Purchase Request" onClick={() => openModule("boq")} />
                  </div>
                </section>
              </div>
            </>
          ) : active === "projects" ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{t.allProjects}</h2>
                  <p>Daftar seluruh desain proyek yang terhubung dengan SonusID</p>
                </div>
                <button className="primary-button" onClick={() => setModal(true)}>
                  <Plus size={16} /> {t.newProject}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.project}</th>
                      <th>{t.type}</th>
                      <th>{t.status}</th>
                      <th>{t.power}</th>
                      <th>{t.updated}</th>
                      <th>{lang === "id" ? "Aksi" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(p => (
                      <tr key={p.id}>
                        <td>
                          <button type="button" className="text-button project-open-link" onClick={() => openProject(p, "layout")}>
                            <strong>{p.name}</strong>
                          </button>
                        </td>
                        <td>{p.type === "Rooftop" ? t.rooftop : t.ground}</td>
                        <td>
                          <span className={`status status-${p.status.toLowerCase().replace(" ", "-")}`}>
                            <i /> {statusLabel(p.status)}
                          </span>
                        </td>
                        <td>{p.capacity.toLocaleString()} kWp</td>
                        <td>{p.updated}</td>
                        <td>
                          <button type="button" className="open-button" onClick={() => openProject(p, "layout")}>
                            {t.open}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            style={{ marginLeft: 6, color: "#ff8b8b" }}
                            title="Hapus proyek"
                            onClick={() => handleDeleteProject(p)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!filteredProjects.length && (
                      <tr><td colSpan={6} className="empty-state">{t.empty}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : active === "layout" ? (
            <PVLayout
              key={activeProject?.id ?? "unassigned"}
              lang={lang}
              userId={user.id}
              projectId={activeProject?.id ?? null}
              projectName={activeProject?.name ?? null}
              projectType={activeProject?.type ?? null}
            />
          ) : active === "layout3d" ? (
            <PVLayout3D
              key={activeProject?.id ?? "unassigned"}
              lang={lang}
              userId={user.id}
              projectId={activeProject?.id ?? null}
              projectName={activeProject?.name ?? null}
            />
          ) : active === "electrical" ? (
            <>
              <StringCalculator lang={lang} />
              <div style={{ marginTop: 32, borderTop: "1px solid var(--border, #374151)", paddingTop: 24 }}>
                <InverterConfiguration lang={lang} />
              </div>
            </>
          ) : active === "cable" ? (
            <CableSizing lang={lang} />
          ) : active === "protection" ? (
            <ProtectionGrounding lang={lang} />
          ) : active === "structure" ? (
            <StructuralDesign lang={lang} />
          ) : active === "cad" ? (
            <CADDrawings lang={lang} />
          ) : active === "boq" ? (
            <BOQ lang={lang} userId={user.id} />
          ) : active === "tray" ? (
            <TraySizing lang={lang} />
          ) : active === "breaker" ? (
            <BreakerSizing lang={lang} />
          ) : active === "mounting" ? (
            <MountingDesign lang={lang} />
          ) : active === "survey" ? (
            <SurveyReport lang={lang} />
          ) : active === "report" ? (
            <EngineeringReport lang={lang} />
          ) : active === "settings" ? (
            <section className="panel module-page">
              <h2>{t.settings}</h2>
              <p>{t.language}</p>
              <button
                className="secondary-button"
                onClick={() => setLang(lang === "en" ? "id" : "en")}
              >
                <Globe size={16} />
                {lang === "en" ? "English" : "Bahasa Indonesia"}
              </button>
              <p className="muted-value" style={{ marginTop: 20 }}>
                Status: Terhubung dengan SonusID SuperApp Monolith · Sesi: {user.name} ({user.email})
              </p>
            </section>
          ) : (
            <ModulePlaceholder
              id={active}
              title={pageNames[active]}
              lang={lang}
              onBack={() => openModule("dashboard")}
            />
          )}
        </div>

        <footer className="app-footer">
          <span>© 2026 PT Solar Nusantara Indonesia (SonusID) · Studio Desain PLTS EPC</span>
          <span>
            <span className="footer-dot" /> SonusID SuperApp Monolith · v1.0.0
          </span>
        </footer>
      </main>

      {modal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <form className="modal-card" onSubmit={e => { e.preventDefault(); handleCreateProject(); }}>
            <div className="modal-heading">
              <div>
                <div className="modal-icon"><Sun size={21} /></div>
                <h2>{t.createTitle}</h2>
                <p>{t.newProjectDesc}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setModal(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <label className="form-label">
              {t.projectName}
              <input autoFocus required value={projectName} onChange={e => setProjectName(e.target.value)} placeholder={t.namePlaceholder} />
            </label>
            <label className="form-label">
              {t.projectType}
              <select value={projectType} onChange={e => setProjectType(e.target.value as Project["type"])}>
                <option value="Rooftop">Rooftop / Atap</option>
                <option value="Ground-mounted">Ground-mounted / Lahan</option>
              </select>
            </label>
            <label className="form-label">
              {t.capacityKwp}
              <input type="number" required min="0.001" step="0.001" value={projectCapacity} onChange={e => setProjectCapacity(e.target.value)} placeholder="mis. 500" />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(false)}>{t.cancel}</button>
              <button className="primary-button" type="submit"><Plus size={16} />{t.create}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, note, icon, trend }: { label: string; value: string; note: string; icon: React.ReactNode; trend: string }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span>{note}</span>
        <span className="trend-neutral">{trend}</span>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <div className="quick-icon">{icon}</div>
      <div className="quick-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <ArrowUpRight className="quick-arrow" size={16} />
    </button>
  );
}

function ModulePlaceholder({ id, title, lang, onBack }: { id: ModuleId; title: string; lang: Lang; onBack: () => void }) {
  return (
    <section className="module-workspace">
      <div className="module-page-heading">
        <div>
          <span className="eyebrow">MODUL ENGINEERING</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="canvas-panel">
        <div className="canvas-toolbar">
          <span><Command size={15} />{title}</span>
          <div><span>Metric (mm)</span></div>
        </div>
        <div className="canvas-empty">
          <h2>{title}</h2>
          <p>{lang === "id" ? "Modul sedang dipersiapkan." : "Module is being finalized."}</p>
          <button className="secondary-button" onClick={onBack}>
            <LayoutDashboard size={16} />{copy[lang].back}
          </button>
        </div>
      </div>
    </section>
  );
}
