import { describe, expect, it } from "vitest";
import { circuitRequest } from "./useEngine";

const base = {
  module_characterization_id: "m", inverter_characterization_id: "i",
  inverter_count: 4 as number | "", t_min_c: 15 as number | "", t_min_source: "BMKG",
  t_amb_max_c: 38 as number | "", t_amb_max_source: "BMKG",
};

describe("circuitRequest", () => {
  it("returns null until module and inverter are picked", () => {
    expect(circuitRequest({ ...base, module_characterization_id: undefined })).toBeNull();
  });
  it("needs exactly one of inverter_count / target_dc_ac", () => {
    expect(circuitRequest({ ...base, target_dc_ac: 1.24 })).toHaveProperty("error");
    expect(circuitRequest({ ...base, inverter_count: "" })).toHaveProperty("error");
  });
  it("refuses a temperature without its source (no invented basis)", () => {
    expect(circuitRequest({ ...base, t_min_source: "  " })).toHaveProperty("error");
    expect(circuitRequest({ ...base, t_amb_max_c: "" })).toHaveProperty("error");
  });
  it("builds the helio ELE-30 body", () => {
    expect(circuitRequest({ ...base, noct_c: 45 })).toEqual({
      module_characterization_id: "m", inverter_characterization_id: "i",
      inverter_count: 4, target_dc_ac: null,
      string_length_method: null, manual_min: null, manual_max: null, routing: null,
      t_min_c: 15, t_min_source: "BMKG", t_amb_max_c: 38, t_amb_max_source: "BMKG",
      noct_c: 45, ac_voltage_v: null,
    });
  });
});
