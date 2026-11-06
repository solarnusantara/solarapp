// Pure Undo/Redo stack helpers for PV Layout 2D. The component still owns the snapshots; these
// functions only make the slice/truncate/seek rules deterministic and testable.

export interface HistoryState<T> {
  entries: T[];
  index: number;
}

export const HISTORY_LIMIT = 30;

/** Pushes a snapshot after the current index and drops the oldest entries beyond the limit. */
export function pushSnapshot<T>(history: readonly T[], index: number, entry: T, limit = HISTORY_LIMIT): HistoryState<T> {
  const truncated = history.slice(0, Math.max(0, index + 1));
  const entries = [...truncated, entry].slice(-limit);
  return { entries, index: entries.length - 1 };
}

/** Index of the previous snapshot, or null when there is nothing to undo. */
export function undoIndex(history: readonly unknown[], index: number): number | null {
  if (index <= 0 || index >= history.length) return null;
  return index - 1;
}

/** Index of the next snapshot, or null when there is nothing to redo. */
export function redoIndex(history: readonly unknown[], index: number): number | null {
  if (index < 0 || index >= history.length - 1) return null;
  return index + 1;
}
