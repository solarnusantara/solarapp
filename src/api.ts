import { REAL_PROJECTS } from "./defaultProjectsData";

export type SonusUser = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "engineer" | "viewer";
};

export type Project = {
  id: string;
  name: string;
  type: "Ground-mounted" | "Rooftop";
  capacity: number;
  status: "In Progress" | "Planning" | "Completed";
  updated: string;
};

const LOCAL_PROJECTS_KEY = "sonus_solar_studio_projects_v1";

export function getCurrentUser(): SonusUser {
  const win = window as any;
  if (win?.SONUS_USER && typeof win.SONUS_USER === "object") {
    return {
      id: win.SONUS_USER.id || "guest",
      name: win.SONUS_USER.name || "Engineer",
      email: win.SONUS_USER.email || "engineer@sonus.id",
      role: (win.SONUS_USER.role as any) || "engineer",
    };
  }
  return {
    id: "guest",
    name: "Sonus Engineer",
    email: "engineer@sonus.id",
    role: "engineer",
  };
}

export function getInitialProjectId(): string | null {
  const win = window as any;
  if (win?.SONUS_ACTIVE_PROJECT_ID && typeof win.SONUS_ACTIVE_PROJECT_ID === "string" && win.SONUS_ACTIVE_PROJECT_ID.trim() !== "") {
    return win.SONUS_ACTIVE_PROJECT_ID.trim();
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("project_id") || params.get("id") || null;
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    const res = await fetch("/api/design/projects", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => ({
          id: String(p.id),
          name: p.name || p.project_code || "Untitled Project",
          type: (p.type === "Rooftop" || p.project_type === "Rooftop") ? "Rooftop" : "Ground-mounted",
          capacity: Number(p.capacity || p.capacity_kwp || 0),
          status: p.status === "Completed" ? "Completed" : p.status === "In Progress" ? "In Progress" : "Planning",
          updated: p.updated || (p.updated_at ? new Date(p.updated_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "Today"),
        }));
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote projects, falling back to local storage:", err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(REAL_PROJECTS));
  return REAL_PROJECTS;
}

export async function saveLocalProjects(projects: Project[]) {
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
  } catch {}
}

export async function createProject(newProject: Omit<Project, "id" | "updated">): Promise<Project> {
  const project: Project = {
    ...newProject,
    id: "proj-" + Date.now(),
    updated: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
  };

  try {
    const res = await fetch("/api/design/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(project),
    });
    if (res.ok) {
      const saved = await res.json();
      if (saved && saved.id) return saved;
    }
  } catch (err) {
    console.warn("Failed to persist project remotely:", err);
  }

  // Local persistence
  const existing = await fetchProjects();
  const updated = [project, ...existing];
  await saveLocalProjects(updated);
  return project;
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await fetch(`/api/design/projects/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch (err) {
    console.warn("Failed to delete project remotely:", err);
  }

  const existing = await fetchProjects();
  const updated = existing.filter(p => p.id !== id);
  await saveLocalProjects(updated);
  return true;
}
