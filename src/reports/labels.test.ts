import { describe, expect, it } from "vitest";
import { wiringLossLabel } from "./labels";

describe("wiringLossLabel", () => {
  it("stc basis prints 'at STC'", () => expect(wiringLossLabel({ mode: "pct", pct: 3, basis: "stc" }, 1)).toBe("3.0 % at STC"));
  it("flat and absent basis do not claim STC", () => {
    expect(wiringLossLabel({ mode: "pct", pct: 3, basis: "flat" }, 1)).toBe("3.0 % (rata setahun)");
    expect(wiringLossLabel({ mode: "pct", pct: 0.36 }, 2)).toBe("0.36 % (rata setahun)");
  });
  it("not applied", () => expect(wiringLossLabel({ mode: "not_applied" }, 1)).toBe("Tidak diterapkan"));
});
