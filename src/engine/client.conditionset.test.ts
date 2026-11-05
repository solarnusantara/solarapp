import { afterEach, describe, expect, it, vi } from "vitest";
import { putConditionSet } from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("putConditionSet", () => {
  it("sends helio's required name + current version (optimistic lock)", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json(200, { id: "cs", name: "Default", version: 3, params: {} }))
      .mockResolvedValueOnce(json(200, { id: "cs", name: "Default", version: 4, params: {} }));
    vi.stubGlobal("fetch", f);
    await putConditionSet("cs", { schema_version: 1 } as never);
    const init = f.mock.calls[1][1] as RequestInit;
    expect(String(f.mock.calls[1][0])).toBe("/api/design/engine/condition-sets/cs");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Default", version: 3, params: { schema_version: 1 } });
  });
});
