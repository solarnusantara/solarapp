import { describe, expect, it } from "vitest";
import { pushSnapshot, redoIndex, undoIndex } from "./history";

describe("history snapshots", () => {
  it("appends after the current index and truncates redo entries", () => {
    const next = pushSnapshot(["a", "b", "c"], 1, "d");
    expect(next).toEqual({ entries: ["a", "b", "d"], index: 2 });
  });

  it("keeps only the newest entries when the limit is exceeded", () => {
    const next = pushSnapshot(["a", "b", "c"], 2, "d", 3);
    expect(next).toEqual({ entries: ["b", "c", "d"], index: 2 });
  });

  it("treats an empty or negative index as the beginning", () => {
    expect(pushSnapshot([], -1, "a")).toEqual({ entries: ["a"], index: 0 });
    expect(pushSnapshot(["a"], 0, "b")).toEqual({ entries: ["a", "b"], index: 1 });
  });

  it("computes undo/redo availability", () => {
    expect(undoIndex(["a", "b", "c"], 0)).toBeNull();
    expect(undoIndex(["a", "b", "c"], 1)).toBe(0);
    expect(undoIndex(["a", "b", "c"], 3)).toBeNull();
    expect(redoIndex(["a", "b", "c"], 0)).toBe(1);
    expect(redoIndex(["a", "b", "c"], 2)).toBeNull();
    expect(redoIndex([], -1)).toBeNull();
  });
});
