/**
 * El corredor de Rodolfo: Atizapán → Metro El Rosario.
 *
 * Es el ÚNICO lugar con coordenadas. Cambiar las paradas reales debe ser un
 * commit que toque solo este archivo (Condición 1 del Blueprint).
 */

// PLACEHOLDER: confirm with Rodolfo — nombres y coordenadas aproximadas,
// todavía no son las paradas reales que él usa.
export const STOPS = [
  { id: "A", name: "Atizapán", lat: 19.5596, lng: -99.2547, seq: 1 },
  { id: "B", name: "Parada B", lat: 19.5412, lng: -99.2361, seq: 2 },
  { id: "C", name: "Parada C", lat: 19.5237, lng: -99.2178, seq: 3 },
  { id: "D", name: "Metro El Rosario", lat: 19.5046, lng: -99.2003, seq: 4 },
] as const;

export type StopId = (typeof STOPS)[number]["id"];
export type Stop = (typeof STOPS)[number];

/** Un tramo va de una parada a la siguiente: AB, BC, CD. */
export type SegmentId = "AB" | "BC" | "CD";

export const SEGMENTS: { id: SegmentId; from: StopId; to: StopId }[] = [
  { id: "AB", from: "A", to: "B" },
  { id: "BC", from: "B", to: "C" },
  { id: "CD", from: "C", to: "D" },
];

/** Horas de salida que cubre el modelo (4:00 a 9:59). */
export const HOURS = [4, 5, 6, 7, 8, 9] as const;

export const DEFAULT_FROM: StopId = "A";
export const DEFAULT_TO: StopId = "D";
export const DEFAULT_TIME = "05:10";

/** Radio para dar por llegado a una parada con GPS, en metros. */
export const ARRIVAL_RADIUS_M = 80;

export function stopById(id: StopId): Stop {
  const stop = STOPS.find((s) => s.id === id);
  if (!stop) throw new Error(`Parada desconocida: ${id}`);
  return stop;
}

/** Tramos que recorre un viaje de `from` a `to` (solo en sentido del corredor). */
export function segmentsBetween(from: StopId, to: StopId): SegmentId[] {
  const a = stopById(from).seq;
  const b = stopById(to).seq;
  if (b <= a) return [];
  return SEGMENTS.filter((s) => stopById(s.from).seq >= a && stopById(s.to).seq <= b).map(
    (s) => s.id,
  );
}

/** Tramo que empieza en una parada: ahí es donde se espera el colectivo. */
export function segmentStartingAt(stop: StopId): SegmentId | null {
  return SEGMENTS.find((s) => s.from === stop)?.id ?? null;
}
