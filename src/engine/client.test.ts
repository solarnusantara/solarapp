import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineError, engineJson, simulate, verbatimError } from "./client";
import type { SimulationInput } from "./types";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const input = {} as SimulationInput;
const out = { annual_p50_kwh: 1, simulation_id: "s1", engine_version: "x", warnings: ["w1"] };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("engine client", () => {
  it("200 returns the body and its warnings verbatim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, out)));
    const r = await simulate(input);
    expect(r.warnings).toEqual(["w1"]);
  });

  it("202 job_id polls jobs/{id} until succeeded", async () => {
    const statuses: string[] = [];
    const f = vi.fn()
      .mockResolvedValueOnce(json(202, { job_id: "j1" }))
      .mockResolvedValueOnce(json(200, { status: "queued" }))
      .mockResolvedValueOnce(json(200, { status: "running" }))
      .mockResolvedValueOnce(json(200, { status: "succeeded", result: out }));
    vi.stubGlobal("fetch", f);
    const p = simulate(input, {}, { onStatus: (s) => statuses.push(s) });
    await vi.advanceTimersByTimeAsync(3000);
    const r = await p;
    expect(r.output.simulation_id).toBe("s1");
    expect(statuses).toEqual(["queued", "running", "succeeded"]);
    expect(String(f.mock.calls[1][0])).toContain("/api/design/engine/jobs/j1");
  });

  it("failed job becomes an EngineError", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(202, { job_id: "j1" }))
      .mockResolvedValueOnce(json(200, { status: "failed", error: { message: "boom", code: "E1" } })));
    await expect(simulate(input)).rejects.toMatchObject({ message: "boom", code: "E1" });
  });

  it("times out and honours abort", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (u: string) =>
      String(u).includes("jobs/") ? json(200, { status: "running" }) : json(202, { job_id: "j" })));
    const caught = simulate(input, {}, { timeoutMs: 5000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(7000);
    expect((await caught).code).toBe("timeout");

    const ac = new AbortController();
    const p2 = simulate(input, {}, { signal: ac.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);
    ac.abort();
    await vi.advanceTimersByTimeAsync(1500);
    expect((await p2).code).toBe("aborted");
  });

  it("normalises proxy errors and standalone html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(503, { code: "engine_not_configured" })));
    await expect(engineJson("sites")).rejects.toMatchObject({ code: "engine_not_configured", message: "Engine Helio tidak tersedia" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 404, headers: { "content-type": "text/html" } })));
    await expect(engineJson("sites")).rejects.toMatchObject({ code: "engine_unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { code: "circuit_missing" })));
    await expect(engineJson("designs/x/circuit")).rejects.toThrow("Sirkuit belum dibuat");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("net")));
    await expect(engineJson("sites")).rejects.toMatchObject({ code: "engine_unavailable" });
  });

  it("verbatimError prints status, code and body", () => {
    expect(verbatimError(new EngineError(422, "missing_v_out", { message: "wajib" }))).toBe('HTTP 422 missing_v_out: {"message":"wajib"}');
  });
});
