import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNasaPowerWeather, createPvgisSeries, createSolcastWeather, EngineError, getWeatherComparison, getWeatherProviders, getWeatherQc,
  listWeather, listWeatherSeries, setConditionSetWeather, uploadWeather, verbatimError, weatherUploadProblems, WEATHER_UPLOAD_MAX_BYTES,
} from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
const stub = (...r: Response[]) => {
  const f = vi.fn();
  for (const x of r) f.mockResolvedValueOnce(x);
  vi.stubGlobal("fetch", f);
  return f;
};
const urlOf = (f: ReturnType<typeof vi.fn>, i = 0) => String(f.mock.calls[i][0]);
const initOf = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i][1] as RequestInit & { headers: Headers };

describe("weather read helpers", () => {
  it("list endpoints hit the proxy paths; archived only when asked", async () => {
    const f = stub(json(200, []), json(200, []), json(200, []));
    await listWeather(); await listWeather(true); await listWeatherSeries();
    expect(urlOf(f, 0)).toBe("/api/design/engine/weather");
    expect(urlOf(f, 1)).toBe("/api/design/engine/weather?include_archived=true");
    expect(urlOf(f, 2)).toBe("/api/design/engine/weather/series");
  });
  it("comparison sends dataset_ids comma separated; qc sends point params", async () => {
    const f = stub(json(200, { sources: [] }), json(200, { warnings: [] }), json(200, { providers: [] }));
    await getWeatherComparison(["a", "b"]);
    await getWeatherQc("a", { lat: -6.9, lon: 110.4 });
    await getWeatherProviders();
    expect(urlOf(f, 0)).toBe("/api/design/engine/weather/comparison?dataset_ids=a,b");
    expect(urlOf(f, 1)).toBe("/api/design/engine/weather/a/qc?lat=-6.9&lon=110.4");
    expect(urlOf(f, 2)).toBe("/api/design/engine/weather/providers");
  });
});

describe("weather fetch helpers (JSON bodies)", () => {
  it("pvgis-series / nasa-power / solcast POST the documented fields", async () => {
    const f = stub(json(201, {}), json(201, {}), json(201, {}));
    await createPvgisSeries({ tmy_dataset_id: "t", year_first: 2005, year_last: 2023 });
    await createNasaPowerWeather({ lat: -6.9, lon: 110.4, utc_offset_h: 7, start: "20230101", end: "20231231" });
    await createSolcastWeather({ lat: -6.9, lon: 110.4, utc_offset_h: 7, start: "2023-01-01", end: "2023-12-31" });
    expect(urlOf(f, 0)).toBe("/api/design/engine/weather/pvgis-series");
    expect(JSON.parse(initOf(f, 0).body as string)).toEqual({ tmy_dataset_id: "t", year_first: 2005, year_last: 2023 });
    expect(initOf(f, 0).method).toBe("POST");
    expect(urlOf(f, 1)).toBe("/api/design/engine/weather/nasa-power");
    expect(JSON.parse(initOf(f, 1).body as string)).toMatchObject({ start: "20230101", end: "20231231" });
    expect(initOf(f, 1).headers.get("content-type")).toBe("application/json");
    expect(urlOf(f, 2)).toBe("/api/design/engine/weather/solcast");
  });
  it("a Solcast 'provider not configured' answer surfaces verbatim", async () => {
    stub(json(422, { error: "weather_provider_not_configured", message: "API key Solcast belum diisi untuk organisasi ini." }));
    const e = await createSolcastWeather({ lat: 0, lon: 0, utc_offset_h: 7, start: "2023-01-01", end: "2023-01-02" }).catch((x) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect(e.message).toBe("API key Solcast belum diisi untuk organisasi ini.");
    expect(verbatimError(e)).toContain("weather_provider_not_configured");
  });
});

describe("uploadWeather (multipart)", () => {
  const epw = new File(["x"], "semarang.epw");

  it("sends FormData and lets the browser set Content-Type", async () => {
    const f = stub(json(201, { created: true, dataset: {} }));
    await uploadWeather(epw, { name: "Semarang EPW", format: "epw", utc_offset_h: 7 });
    const init = initOf(f);
    expect(urlOf(f)).toBe("/api/design/engine/weather/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.has("content-type")).toBe(false);
    const fd = init.body as FormData;
    expect((fd.get("file") as File).name).toBe("semarang.epw");
    expect(fd.get("name")).toBe("Semarang EPW");
    expect(fd.get("format")).toBe("epw");
    expect(fd.get("utc_offset_h")).toBe("7");
    expect(fd.has("mapping")).toBe(false);
  });
  it("csv carries the mapping as JSON text and the numeric fields helio requires", async () => {
    const f = stub(json(201, {}));
    const mapping = {
      delimiter: ",", skip_lines: 0, time: { column: "t", format: "iso8601", clock_utc_offset_h: 7, label: "interval_start" },
      ghi: { column: "g", unit: "W/m2" }, temp_air: { column: "a", unit: "degC" }, wind_speed: { column: "w", unit: "m/s" },
      dni: null, dhi: null, pressure: null, relative_humidity: null,
    } as const;
    await uploadWeather(new File(["x"], "a.csv"), { name: "n", format: "csv", utc_offset_h: 7, wind_height_m: 10, lat: -6.9, lon: 110.4, elevation_m: 5, mapping });
    const fd = initOf(f).body as FormData;
    expect(JSON.parse(fd.get("mapping") as string)).toEqual(mapping);
    expect(fd.get("lat")).toBe("-6.9");
    expect(fd.get("wind_height_m")).toBe("10");
  });
  it("rejects before any request: oversize, csv without mapping, missing csv numbers", async () => {
    const f = stub();
    const big = { size: WEATHER_UPLOAD_MAX_BYTES + 1 } as File;
    await expect(uploadWeather(big, { name: "n", format: "epw" })).rejects.toMatchObject({ code: "weather_upload_invalid" });
    await expect(uploadWeather(epw, { name: "n", format: "csv" })).rejects.toThrow(/pemetaan/i);
    expect(weatherUploadProblems(epw, { name: "n", format: "csv", template: "solcast" }).join(" ")).toMatch(/lat wajib/);
    expect(weatherUploadProblems(epw, { name: " ", format: "epw" })).toEqual(["Nama harus 1–120 karakter."]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("setConditionSetWeather", () => {
  const params = { schema_version: 1, weather: { kind: "reference_site", site_id: "x" }, albedo: 0.2 };
  const saved = { id: "c1", name: "Default", version: 4, params };

  it("PUTs name+version+params with the new weather", async () => {
    const f = stub(json(200, saved), json(200, saved));
    const wrote = await setConditionSetWeather("c1", { kind: "series", series_id: "s1" });
    expect(wrote).toBe(true);
    expect(initOf(f, 1).method).toBe("PUT");
    expect(JSON.parse(initOf(f, 1).body as string)).toEqual({ name: "Default", version: 4, params: { ...params, weather: { kind: "series", series_id: "s1" } } });
  });
  it("does not write when the set already points there", async () => {
    const f = stub(json(200, { ...saved, params: { ...params, weather: { kind: "dataset", dataset_id: "d1" } } }));
    expect(await setConditionSetWeather("c1", { kind: "dataset", dataset_id: "d1" })).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
