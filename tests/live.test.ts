import { describe, expect, it } from "vitest";

import { forecastFor } from "@/lib/forecast";
import { reportErrorMessage, stripState, type LiveAgg } from "@/lib/live";
import type { Prediction } from "@/lib/types";

describe("T4: la franja se oculta bajo el k-umbral", () => {
  it("sin reportes, oculta", () => {
    expect(stripState([], "A", false).visible).toBe(false);
  });

  it("2 personas (si algo se colara del servidor), oculta", () => {
    const rows: LiveAgg[] = [{ stop_id: "A", kind: "long_wait", passengers: 2 }];
    expect(stripState(rows, "A", false)).toEqual({ visible: false, lines: [], inReview: false });
  });

  it("3 personas, visible y solo de la parada elegida", () => {
    const rows: LiveAgg[] = [
      { stop_id: "A", kind: "long_wait", passengers: 4 },
      { stop_id: "B", kind: "full", passengers: 5 },
    ];
    expect(stripState(rows, "A", false)).toEqual({
      visible: true,
      lines: ["Últimas 2 h: 4 pasajeros reportan espera larga"],
      inReview: false,
    });
  });
});

describe("T5: contradicción → etiqueta, pronóstico intacto", () => {
  it("con caso abierto la franja dice en revisión", () => {
    const rows: LiveAgg[] = [{ stop_id: "A", kind: "long_wait", passengers: 3 }];
    expect(stripState(rows, "A", true).inReview).toBe(true);
  });

  it("caso por viajes rápidos sin reportes: franja visible en revisión", () => {
    const s = stripState([], "A", true);
    expect(s.visible).toBe(true);
    expect(s.inReview).toBe(true);
  });

  it("el pronóstico no depende de los reportes", () => {
    const preds: Prediction[] = [
      { segment: "AB", daytype: "weekday", hour: 5, wait_p50: 6, wait_p90: 12, seat_prob: 0.4, n_obs: 20, model_version: "t" },
    ];
    // forecastFor no recibe reportes: no hay forma de que la franja lo altere.
    expect(forecastFor.length).toBe(5);
    expect(forecastFor(preds, "A", "D", "weekday", 5)?.waitP50).toBe(6);
  });
});

describe("mensajes de reporte", () => {
  it("explica el límite de 15 minutos", () => {
    expect(reportErrorMessage("rate_limited: un reporte por parada cada 15 minutos")).toMatch(/15 minutos/);
    expect(reportErrorMessage("fetch failed")).toMatch(/señal/);
  });
});
