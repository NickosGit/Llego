/**
 * Registro de un viaje con GPS, como máquina de estados pura.
 *
 * Privacidad (PACKET §8 y §10): las posiciones solo existen en memoria del
 * teléfono mientras el viaje está activo. "Terminar" las borra, y lo único que
 * se sube son duraciones y paradas (`tripPayload`, lista blanca de campos).
 */
import { ARRIVAL_RADIUS_M, stopById, type StopId } from "@/config/corridor";

import { distanceM } from "./geo";
import type { DayType } from "./types";

/** Margen extra para no confundir el ruido del GPS con "ya me subí". */
export const LEAVE_MARGIN_M = 20;
/** Lecturas seguidas fuera del radio para dar por hecho que ya se subió. */
export const LEAVE_READINGS = 2;
/** Lecturas con peor precisión que esto se ignoran. */
export const MAX_ACCURACY_M = 100;

export type Fix = { t: number; lat: number; lng: number; accuracy?: number };

export type TripState = {
  phase: "idle" | "waiting" | "riding" | "arrived";
  from: StopId;
  to: StopId;
  startedAt: number | null;
  boardedAt: number | null;
  arrivedAt: number | null;
  outsideCount: number;
  /** Recorrido en memoria. Nunca sale del teléfono y se vacía al terminar. */
  trail: Fix[];
};

export type TripEvent =
  | { type: "start"; t: number }
  | { type: "fix"; fix: Fix }
  | { type: "boarded"; t: number }
  | { type: "arrived"; t: number }
  | { type: "reset" };

export function initialTrip(from: StopId, to: StopId): TripState {
  return { phase: "idle", from, to, startedAt: null, boardedAt: null, arrivedAt: null, outsideCount: 0, trail: [] };
}

export function tripReducer(s: TripState, e: TripEvent): TripState {
  switch (e.type) {
    case "reset":
      return initialTrip(s.from, s.to);
    case "start":
      return s.phase === "idle" ? { ...s, phase: "waiting", startedAt: e.t, trail: [] } : s;
    case "boarded":
      return s.phase === "waiting" ? { ...s, phase: "riding", boardedAt: e.t } : s;
    case "arrived":
      return s.phase === "riding" ? { ...s, phase: "arrived", arrivedAt: e.t } : s;
    case "fix": {
      const { fix } = e;
      if (s.phase !== "waiting" && s.phase !== "riding") return s;
      if (fix.accuracy !== undefined && fix.accuracy > MAX_ACCURACY_M) return s;
      const trail = [...s.trail, fix];

      if (s.phase === "waiting") {
        const away = distanceM(fix, stopById(s.from)) > ARRIVAL_RADIUS_M + LEAVE_MARGIN_M;
        const outsideCount = away ? s.outsideCount + 1 : 0;
        if (outsideCount >= LEAVE_READINGS) {
          // Se subió cuando empezó a alejarse: la primera lectura de esta racha.
          const firstAway = trail[trail.length - LEAVE_READINGS];
          return { ...s, trail, outsideCount, phase: "riding", boardedAt: firstAway.t };
        }
        return { ...s, trail, outsideCount };
      }

      if (distanceM(fix, stopById(s.to)) <= ARRIVAL_RADIUS_M) {
        return { ...s, trail, phase: "arrived", arrivedAt: fix.t };
      }
      return { ...s, trail };
    }
  }
}

/** Minutos de espera y de trayecto al terminar. null si nunca se subió. */
export function durations(s: TripState, finishedAt: number): { wait_min: number; ride_min: number } | null {
  if (s.startedAt === null || s.boardedAt === null) return null;
  const end = s.arrivedAt ?? finishedAt;
  const round1 = (ms: number) => Math.max(0, Math.round(ms / 6_000) / 10);
  return { wait_min: round1(s.boardedAt - s.startedAt), ride_min: round1(end - s.boardedAt) };
}

export type TripPayload = {
  stop_from: StopId;
  stop_to: StopId;
  daytype: DayType;
  hour: number;
  wait_min: number;
  ride_min: number;
  got_seat: boolean;
};

/** Lo ÚNICO que sube al servidor. Lista blanca explícita: sin coordenadas (T7). */
export function tripPayload(p: TripPayload): TripPayload {
  return {
    stop_from: p.stop_from,
    stop_to: p.stop_to,
    daytype: p.daytype,
    hour: p.hour,
    wait_min: Math.min(Math.max(p.wait_min, 0), 240),
    ride_min: Math.min(Math.max(p.ride_min, 0), 240),
    got_seat: p.got_seat,
  };
}

/** Minutos entre dos horas "HH:MM" del mismo día (cruza medianoche si hace falta). */
export function minutesBetween(a: string, b: string): number {
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const d = toMin(b) - toMin(a);
  return d >= 0 ? d : d + 24 * 60;
}
