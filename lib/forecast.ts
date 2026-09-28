/**
 * Lógica pura del pronóstico: horarios de salida, tipo de día, qué predicción
 * aplica y el promedio del corredor para "Sin dato". Sin React ni red.
 */
import {
  HOURS,
  segmentsBetween,
  segmentStartingAt,
  type SegmentId,
  type StopId,
} from "@/config/corridor";

import { confidence, type Confidence } from "./confidence";
import type { DayType, Prediction } from "./types";

export const TIME_ZONE = "America/Mexico_City";

// ───────────────────────────────────────────────────────── días y horas ──

export type Day = "hoy" | "manana";

/** Fecha civil (año, mes, día, día de la semana) en la Ciudad de México. */
export function mexicoDate(now: Date, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Mediodía UTC para que sumar días nunca cruce un cambio de fecha.
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offsetDays, 12));
  return { date: d, weekday: d.getUTCDay() };
}

export function daytypeOf(weekday: number): DayType {
  return weekday === 0 || weekday === 6 ? "weekend" : "weekday";
}

const WEEKDAY_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function weekdayName(weekday: number): string {
  return WEEKDAY_ES[weekday] ?? "";
}

export type Departure = {
  day: Day;
  time: string; // "05:10"
};

export const DEFAULT_DEPARTURE: Departure = { day: "manana", time: "05:10" };

/** Salidas cada 10 min entre la primera y la última hora del modelo. */
export function departureTimes(): string[] {
  return HOURS.flatMap((h) =>
    [0, 10, 20, 30, 40, 50].map((m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
  );
}

export function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

/** "5:10" para mostrar (sin cero a la izquierda). */
export function displayTime(time: string): string {
  return time.replace(/^0/, "");
}

export function resolveDeparture(dep: Departure, now: Date) {
  const { weekday } = mexicoDate(now, dep.day === "manana" ? 1 : 0);
  return {
    daytype: daytypeOf(weekday),
    hour: hourOf(dep.time),
    weekdayName: weekdayName(weekday),
  };
}

export function encodeDeparture(dep: Departure): string {
  return `${dep.day}@${dep.time}`;
}

export function decodeDeparture(value: string): Departure {
  const [day, time] = value.split("@");
  if ((day === "hoy" || day === "manana") && /^\d{2}:\d{2}$/.test(time ?? "")) {
    return { day, time };
  }
  return DEFAULT_DEPARTURE;
}

// ──────────────────────────────────────────────────────────── pronóstico ──

export function findPrediction(
  preds: Prediction[],
  segment: SegmentId,
  daytype: DayType,
  hour: number,
): Prediction | undefined {
  return preds.find((p) => p.segment === segment && p.daytype === daytype && p.hour === hour);
}

/** Promedio del corredor ponderado por viajes, para mostrar en gris cuando no hay dato. */
export function corridorAverage(preds: Prediction[], daytype: DayType) {
  const sameDay = preds.filter((p) => p.daytype === daytype);
  const pool = sameDay.some((p) => p.n_obs > 0) ? sameDay : preds;
  const weight = (p: Prediction) => Math.max(p.n_obs, 0) || 1;
  const total = pool.reduce((s, p) => s + weight(p), 0);
  if (!total) return null;
  const avg = (f: (p: Prediction) => number) => pool.reduce((s, p) => s + f(p) * weight(p), 0) / total;
  return { wait_p50: avg((p) => p.wait_p50), wait_p90: avg((p) => p.wait_p90), seat_prob: avg((p) => p.seat_prob) };
}

export type Forecast = {
  waitP50: number;
  waitP90: number;
  seatProb: number;
  nObs: number;
  confidence: Confidence;
  /** true cuando los números son el promedio del corredor (Sin dato). */
  isFallback: boolean;
  modelVersion: string | null;
};

/**
 * Pronóstico para subir en `from` con destino `to`. La espera y el asiento son
 * los del tramo donde uno sube: ahí es donde se espera el colectivo.
 */
export function forecastFor(
  preds: Prediction[],
  from: StopId,
  to: StopId,
  daytype: DayType,
  hour: number,
): Forecast | null {
  const segment = segmentStartingAt(from);
  if (!segment || segmentsBetween(from, to).length === 0) return null;

  const cell = findPrediction(preds, segment, daytype, hour);
  const conf = confidence(cell?.n_obs ?? 0);

  if (cell && conf.level !== "none") {
    return {
      waitP50: Number(cell.wait_p50),
      waitP90: Number(cell.wait_p90),
      seatProb: Number(cell.seat_prob),
      nObs: cell.n_obs,
      confidence: conf,
      isFallback: false,
      modelVersion: cell.model_version,
    };
  }

  const avg = corridorAverage(preds, daytype);
  if (!avg) return null;
  return {
    waitP50: avg.wait_p50,
    waitP90: Math.max(avg.wait_p90, avg.wait_p50),
    seatProb: avg.seat_prob,
    nObs: cell?.n_obs ?? 0,
    confidence: conf,
    isFallback: true,
    modelVersion: cell?.model_version ?? null,
  };
}

// ──────────────────────────────────────────────────────────── colores ──

export type SegmentTone = "ok" | "warn" | "bad" | "none";

/**
 * Verde < 10 min, ámbar 10–13, rojo ≥ 14, gris si la celda no tiene dato.
 * Usa los minutos YA redondeados, igual que la tarjeta: con p50 = 9.5 la
 * tarjeta dice "10 min" y el tramo no puede salir verde.
 */
export function toneFor(pred: Prediction | undefined): SegmentTone {
  if (!pred || confidence(pred.n_obs).level === "none") return "none";
  const p50 = Math.round(Number(pred.wait_p50));
  if (p50 < 10) return "ok";
  if (p50 < 14) return "warn";
  return "bad";
}

export const TONE_COLOR: Record<SegmentTone, string> = {
  ok: "#2e9e44",
  warn: "#f29d0b",
  bad: "#e03131",
  none: "#9aa1a9",
};

export function minutes(n: number): string {
  return `${Math.round(n)} min`;
}

export function percent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Hora (0–23) de un instante en la Ciudad de México. */
export function mexicoHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(at);
  return Number(h) % 24;
}
