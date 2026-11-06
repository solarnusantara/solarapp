// Loads the saved PV layout payload (the object PVLayout.saveDraft writes) for a project:
// server first (existing `fetchProjectLayout`), localStorage as fallback. Never throws.
import * as api from "../api";
import { getProjectDefaultLayout } from "../defaultProjectsData";
import type { FieldSegment, Obstacle, Panel, Site, Walkway } from "../PVLayout";
import type { Overlay } from "../pv/overlayModel";
import type { EngineInputs } from "./types/local";

export interface SavedLayout {
  projectId?: string | null;
  settings?: Record<string, any>;
  segments?: FieldSegment[];
  walkways?: Walkway[];
  obstacles?: Obstacle[];
  panels?: Panel[];
  site?: Site | null;
  backgroundImage?: string;
  backgroundOpacity?: number;
  overlays?: Overlay[];
  layers?: Record<string, boolean>;
  engine_inputs?: EngineInputs;
}

const LS_PREFIX = "solar-apps-pv-layout-v1:";

const usable = (p: any): p is SavedLayout =>
  !!p && (Array.isArray(p.segments) || Array.isArray(p.panels) || !!p.settings);

/** localStorage copy for any user id (the key embeds the user id). Synchronous. */
export function readLocalLayout(projectId: string | null | undefined): SavedLayout | null {
  if (!projectId) return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX) && key.endsWith(`:${projectId}`)) {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (usable(parsed)) return parsed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export async function loadLayout(projectId: string | null | undefined): Promise<SavedLayout | null> {
  if (!projectId) return null;
  try {
    const remote = await api.fetchProjectLayout(projectId);
    if (usable(remote)) return remote;
  } catch { /* fall through */ }
  return readLocalLayout(projectId) ?? ((getProjectDefaultLayout(projectId) as SavedLayout | null) ?? null);
}

/** Engine inputs stored beside the layout; empty object when absent. */
export function layoutEngineInputs(layout: SavedLayout | null | undefined): Partial<EngineInputs> {
  return (layout?.engine_inputs ?? {}) as Partial<EngineInputs>;
}
