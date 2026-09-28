import { describe, expect, it } from "vitest";

import { confidence } from "@/lib/confidence";

describe("T3: umbrales de confianza", () => {
  it.each([
    [0, "none", "Sin dato"],
    [3, "none", "Sin dato"],
    [4, "none", "Sin dato"],
    [5, "low", "Poco dato · 5 viajes"],
    [14, "low", "Poco dato · 14 viajes"],
    [29, "low", "Poco dato · 29 viajes"],
    [30, "good", "Buen dato · 30 viajes"],
    [120, "good", "Buen dato · 120 viajes"],
  ])("n = %i → %s", (n, level, label) => {
    expect(confidence(n)).toEqual({ level, label });
  });

  it("valores raros cuentan como Sin dato", () => {
    expect(confidence(-3).level).toBe("none");
    expect(confidence(Number.NaN).level).toBe("none");
  });
});
