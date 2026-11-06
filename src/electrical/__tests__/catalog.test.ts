import { describe, expect, it } from "vitest";

import {
  INVERTER_CATALOG,
  MODULE_CATALOG,
  createCustomInverterSpec,
  createCustomModuleSpec,
  findInverterById,
  findModuleById,
  inverterReadiness,
  moduleReadiness,
  slugifyId,
  uniqueId
} from "../catalog";
import type { InverterSpec, ModuleSpec } from "../types";

const completeModule: ModuleSpec = {
  ...createCustomModuleSpec({ manufacturer: "Test", model: "TM-580" }),
  pmaxWp: 580,
  vocV: 50.2,
  vmpV: 42.1,
  iscA: 14.3,
  impA: 13.78,
  betaVocPctPerC: -0.25,
  betaVmpPctPerC: -0.3,
  alphaIscPctPerC: 0.04,
  referenceTempC: 25,
  maxSystemVoltageV: 1000,
  maxSeriesFuseA: 20,
  tempMinC: -10,
  tempMaxC: 70
};

const completeInverter: InverterSpec = {
  ...createCustomInverterSpec({ manufacturer: "Test", model: "TI-100k" }),
  ratedAcPowerW: 100000,
  maxDcVoltageV: 1100,
  mpptMinV: 200,
  mpptMaxV: 1000,
  startupV: 150,
  mpptCount: 10,
  inputsPerMppt: 2,
  maxMpptCurrentA: 30,
  maxMpptIscA: 45,
  maxUsableDcPowerW: 150000,
  ratedAcVoltageV: 400,
  phases: 3,
  frequencyHz: 50,
  powerFactorMin: 0.8,
  powerFactorMax: 1,
  efficiencyPct: 98.8
};

describe("catalog — seeded entries", () => {
  it("contains only repo-sourced, unverified modules", () => {
    expect(MODULE_CATALOG.length).toBeGreaterThanOrEqual(4);

    for (const module of MODULE_CATALOG) {
      expect(module.verification).toBe("unverified");
      expect(module.source.trim().length).toBeGreaterThan(0);
      expect(module.pmaxWp).toBeGreaterThan(0);
      // The repository contains no datasheet values, so these stay null.
      expect(module.vocV).toBeNull();
      expect(module.vmpV).toBeNull();
      expect(module.iscA).toBeNull();
      expect(module.impA).toBeNull();
      expect(module.betaVocPctPerC).toBeNull();
      expect(module.maxSystemVoltageV).toBeNull();
    }
  });

  it("contains only unverified inverters and keeps unknown fields null", () => {
    expect(INVERTER_CATALOG.length).toBeGreaterThanOrEqual(4);

    const huawei = findInverterById("inverter-huawei-sun2000-100k");
    expect(huawei).toBeDefined();
    expect(huawei?.manufacturer).toBe("Huawei");
    expect(huawei?.ratedAcPowerW).toBe(100000);
    expect(huawei?.mpptCount).toBe(10);
    expect(huawei?.efficiencyPct).toBe(98.8);
    expect(huawei?.phases).toBe(3);
    expect(huawei?.verification).toBe("unverified");
    expect(huawei?.maxDcVoltageV).toBeNull();
    expect(huawei?.maxMpptCurrentA).toBeNull();
  });

  it("has unique ids and lookup helpers that return undefined for unknown ids", () => {
    const moduleIds = MODULE_CATALOG.map(module => module.id);
    const inverterIds = INVERTER_CATALOG.map(inverter => inverter.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(inverterIds).size).toBe(inverterIds.length);

    expect(findModuleById(moduleIds[0])?.id).toBe(moduleIds[0]);
    expect(findModuleById("nope")).toBeUndefined();
    expect(findInverterById(inverterIds[0])?.id).toBe(inverterIds[0]);
    expect(findInverterById("nope")).toBeUndefined();
  });
});

describe("catalog — module readiness", () => {
  it("reports every missing datasheet field for a seeded module", () => {
    const ja = findModuleById("module-ja-solar-550");
    expect(ja).toBeDefined();

    const readiness = moduleReadiness(ja as ModuleSpec);

    expect(readiness.ready).toBe(false);
    expect(readiness.verification).toBe("unverified");
    expect(readiness.missing).toEqual(
      expect.arrayContaining([
        "vocV",
        "vmpV",
        "iscA",
        "impA",
        "betaVocPctPerC",
        "referenceTempC",
        "maxSystemVoltageV",
        "maxSeriesFuseA"
      ])
    );
    expect(readiness.errors).toEqual([]);
    expect(readiness.warnings.join(" ")).toContain("unverified");
  });

  it("is ready but still flagged unverified when all required fields exist", () => {
    const readiness = moduleReadiness(completeModule);

    expect(readiness.ready).toBe(true);
    expect(readiness.verification).toBe("unverified");
    expect(readiness.missing).toEqual([]);
    expect(readiness.errors).toEqual([]);
    expect(readiness.warnings.join(" ")).toContain("unverified");
  });

  it("requires a verification date before accepting a verified module", () => {
    const readiness = moduleReadiness({
      ...completeModule,
      verification: "verified"
    });

    expect(readiness.verification).toBe("unverified");
    expect(readiness.ready).toBe(false);
    expect(readiness.errors.join(" ")).toContain("verifiedAt");
  });

  it("accepts a verified module with source and date", () => {
    const readiness = moduleReadiness({
      ...completeModule,
      verification: "verified",
      verifiedAt: "2026-11-06"
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.verification).toBe("verified");
    expect(readiness.warnings).toEqual([]);
  });

  it("rejects contradictory Voc/Vmp and Isc/Imp values", () => {
    expect(moduleReadiness({ ...completeModule, vocV: 40 }).errors.join(" ")).toContain(
      "Voc is lower than Vmp"
    );
    expect(moduleReadiness({ ...completeModule, iscA: 12 }).errors.join(" ")).toContain(
      "Isc is lower than Imp"
    );
  });

  it("warns about a non-negative Voc coefficient instead of silently accepting it", () => {
    const readiness = moduleReadiness({ ...completeModule, betaVocPctPerC: 0 });

    expect(readiness.ready).toBe(true);
    expect(readiness.warnings.join(" ")).toContain("not negative");
  });

  it("treats a missing specification as not ready", () => {
    const readiness = moduleReadiness({
      ...completeModule,
      verification: "missing"
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.verification).toBe("missing");
  });
});

describe("catalog — inverter readiness", () => {
  it("reports missing datasheet fields for a seeded inverter", () => {
    const solis = findInverterById("inverter-solis-10k-3p");
    expect(solis).toBeDefined();

    const readiness = inverterReadiness(solis as InverterSpec);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(
      expect.arrayContaining([
        "maxDcVoltageV",
        "mpptMinV",
        "mpptMaxV",
        "mpptCount",
        "inputsPerMppt",
        "maxMpptCurrentA",
        "maxMpptIscA",
        "ratedAcVoltageV",
        "frequencyHz",
        "efficiencyPct"
      ])
    );
    expect(readiness.verification).toBe("unverified");
  });

  it("is ready but unverified when every required field exists", () => {
    const readiness = inverterReadiness(completeInverter);

    expect(readiness.ready).toBe(true);
    expect(readiness.verification).toBe("unverified");
    expect(readiness.missing).toEqual([]);
    expect(readiness.errors).toEqual([]);
  });

  it("rejects an inverted MPPT window", () => {
    const readiness = inverterReadiness({ ...completeInverter, mpptMinV: 1000, mpptMaxV: 900 });

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.join(" ")).toContain("MPPT minimum voltage");
  });

  it("rejects an MPPT window above the maximum DC voltage", () => {
    const readiness = inverterReadiness({ ...completeInverter, maxDcVoltageV: 800 });

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.join(" ")).toContain("maximum DC voltage");
  });

  it("rejects fractional MPPT counts and impossible efficiency", () => {
    expect(
      inverterReadiness({ ...completeInverter, mpptCount: 3.5 }).errors.join(" ")
    ).toContain("mpptCount must be a whole number");
    expect(
      inverterReadiness({ ...completeInverter, efficiencyPct: 120 }).errors.join(" ")
    ).toContain("Efficiency");
  });

  it("rejects an inverted power-factor range", () => {
    const readiness = inverterReadiness({
      ...completeInverter,
      powerFactorMin: 1,
      powerFactorMax: 0.8
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.join(" ")).toContain("Power factor minimum");
  });
});

describe("catalog — custom equipment", () => {
  it("creates a custom module with trimmed identity and null datasheet fields", () => {
    const module = createCustomModuleSpec({
      manufacturer: "  Acme  ",
      model: "  M-1 "
    });

    expect(module.id).toBe("module-acme-m-1");
    expect(module.manufacturer).toBe("Acme");
    expect(module.model).toBe("M-1");
    expect(module.pmaxWp).toBeNull();
    expect(module.vocV).toBeNull();
    expect(module.maxSeriesFuseA).toBeNull();
    expect(module.verification).toBe("unverified");
    expect(module.source).toContain("Custom");
  });

  it("never promotes a custom entry to verified", () => {
    const module = createCustomModuleSpec({
      model: "X",
      verification: "verified",
      verifiedAt: "2026-01-01"
    } as unknown as Parameters<typeof createCustomModuleSpec>[0]);

    expect(module.verification).toBe("unverified");
  });

  it("creates a custom inverter with null unknown values", () => {
    const inverter = createCustomInverterSpec({
      manufacturer: "Acme",
      model: "Inv 10k",
      phases: 3
    });

    expect(inverter.id).toBe("inverter-acme-inv-10k");
    expect(inverter.phases).toBe(3);
    expect(inverter.ratedAcPowerW).toBeNull();
    expect(inverter.maxDcVoltageV).toBeNull();
    expect(inverter.frequencyHz).toBeNull();
    expect(inverter.verification).toBe("unverified");
  });

  it("generates unique ids when ids already exist", () => {
    const base = createCustomModuleSpec({ manufacturer: "Acme", model: "M-1" }).id;
    expect(base).toBe("module-acme-m-1");

    const second = createCustomModuleSpec(
      { manufacturer: "Acme", model: "M-1" },
      { existingIds: [base] }
    );
    expect(second.id).toBe(`${base}-2`);

    const third = createCustomModuleSpec(
      { manufacturer: "Acme", model: "M-1" },
      { existingIds: [base, `${base}-2`] }
    );
    expect(third.id).toBe(`${base}-3`);
  });

  it("slugifies and de-duplicates identifiers deterministically", () => {
    expect(slugifyId("LONGi", "Hi-MO 6")).toBe("longi-hi-mo-6");
    expect(slugifyId("!!!")).toBe("item");
    expect(uniqueId("x", [])).toBe("x");
    expect(uniqueId("x", ["x"])).toBe("x-2");
    expect(uniqueId("x", ["x", "x-2"])).toBe("x-3");
  });

  it("keeps a custom inverter incomplete until datasheet values are supplied", () => {
    const readiness = inverterReadiness(
      createCustomInverterSpec({ manufacturer: "Acme", model: "Inv" })
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(
      expect.arrayContaining(["ratedAcPowerW", "maxDcVoltageV", "mpptCount"])
    );
  });
});
