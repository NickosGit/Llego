import { describe, expect, it } from "vitest";

import {
  corridorAverage,
  decodeDeparture,
  departureTimes,
  encodeDeparture,
  forecastFor,
  resolveDeparture,
  toneFor,
} from "@/lib/forecast";
import type { Prediction } from "@/lib/types";

const p = (over: Partial<Prediction>): Prediction => ({
  segment: "AB",
  daytype: "weekday",
  hour: 5,
  wait_p50: 12,
  wait_p90: 28,
  seat_prob: 0.35,
  n_obs: 14,
  model_version: "t",
  ...over,
});

describe("salidas", () => {
  it("cubre de 4:00 a 9:50 cada 10 min", () => {
    const t = departureTimes();
    expect(t[0]).toBe("04:00");
    expect(t.at(-1)).toBe("09:50");
    expect(t).toContain("05:10");
  });

  it("'mañana' desde un lunes por la noche en CDMX es martes laboral", () => {
    // Lunes 28 sep 2026, 22:00 en CDMX = martes 04:00 UTC.
    const now = new Date("2026-09-29T04:00:00Z");
    expect(resolveDeparture({ day: "manana", time: "05:10" }, now)).toEqual({
      daytype: "weekday",
      hour: 5,
      weekdayName: "martes",
    });
  });

  it("'mañana' desde un viernes es fin de semana", () => {
    const now = new Date("2026-10-02T18:00:00Z"); // viernes en CDMX
    expect(resolveDeparture({ day: "manana", time: "07:00" }, now).daytype).toBe("weekend");
  });

  it("codifica y decodifica, con valor por defecto si llega basura", () => {
    expect(decodeDeparture(encodeDeparture({ day: "hoy", time: "06:40" }))).toEqual({ day: "hoy", time: "06:40" });
    expect(decodeDeparture("x")).toEqual({ day: "manana", time: "05:10" });
  });
});

describe("pronóstico", () => {
  it("usa el tramo donde uno sube", () => {
    const preds = [p({}), p({ segment: "BC", wait_p50: 3, n_obs: 40 })];
    const f = forecastFor(preds, "A", "D", "weekday", 5)!;
    expect(f).toMatchObject({ waitP50: 12, waitP90: 28, seatProb: 0.35, isFallback: false });
    expect(f.confidence.label).toBe("Poco dato · 14 viajes");
  });

  it("T3: con n = 3 muestra Sin dato y el promedio del corredor", () => {
    const preds = [p({ n_obs: 3, wait_p50: 99 }), p({ segment: "BC", wait_p50: 10, wait_p90: 20, n_obs: 40 })];
    const f = forecastFor(preds, "A", "D", "weekday", 5)!;
    expect(f.confidence.level).toBe("none");
    expect(f.isFallback).toBe(true);
    expect(f.waitP50).toBeLessThan(99);
  });

  it("sin tramo válido (destino antes del origen) no hay pronóstico", () => {
    expect(forecastFor([p({})], "C", "A", "weekday", 5)).toBeNull();
  });

  it("promedio ponderado por viajes", () => {
    const avg = corridorAverage([p({ wait_p50: 10, n_obs: 30 }), p({ wait_p50: 20, n_obs: 10 })], "weekday")!;
    expect(avg.wait_p50).toBeCloseTo(12.5);
  });

  it("colores por p50, gris sin dato", () => {
    expect(toneFor(p({ wait_p50: 8 }))).toBe("ok");
    expect(toneFor(p({ wait_p50: 12 }))).toBe("warn");
    expect(toneFor(p({ wait_p50: 16 }))).toBe("bad");
    expect(toneFor(p({ n_obs: 2 }))).toBe("none");
    expect(toneFor(undefined)).toBe("none");
  });

  it("el color usa los mismos minutos redondeados que la tarjeta", () => {
    // Bug encontrado en la prueba visual: p50 = 9.5 pintaba verde "< 10" y la tarjeta decía "10 min".
    expect(toneFor(p({ wait_p50: 9.5 }))).toBe("warn");
    expect(toneFor(p({ wait_p50: 9.4 }))).toBe("ok");
    expect(toneFor(p({ wait_p50: 13.5 }))).toBe("bad");
  });
});

describe("mexicoHour", () => {
  it("convierte a la hora de CDMX", async () => {
    const { mexicoHour } = await import("@/lib/forecast");
    expect(mexicoHour(new Date("2026-09-29T11:10:00Z"))).toBe(5);
    expect(mexicoHour(new Date("2026-09-29T06:00:00Z"))).toBe(0);
  });
});

describe("salida por defecto = la próxima 5:10", () => {
  it("viernes 4:15 am en CDMX: es HOY 5:10 (laboral), no mañana sábado", async () => {
    const { defaultDeparture, resolveDeparture } = await import("@/lib/forecast");
    const now = new Date("2026-10-02T10:15:00Z"); // viernes 4:15 CDMX
    const dep = defaultDeparture(now);
    expect(dep).toEqual({ day: "hoy", time: "05:10" });
    expect(resolveDeparture(dep, now)).toMatchObject({ daytype: "weekday", weekdayName: "viernes" });
  });

  it("viernes 6:00 am: la próxima es mañana (sábado)", async () => {
    const { defaultDeparture } = await import("@/lib/forecast");
    expect(defaultDeparture(new Date("2026-10-02T12:00:00Z"))).toEqual({ day: "manana", time: "05:10" });
  });

  it("domingo 23:00: mañana lunes", async () => {
    const { defaultDeparture } = await import("@/lib/forecast");
    expect(defaultDeparture(new Date("2026-09-28T05:00:00Z"))).toEqual({ day: "manana", time: "05:10" });
  });
});
