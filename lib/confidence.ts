/**
 * Etiqueta de confianza según cuántos viajes respaldan una celda (PACKET §9).
 *   n ≥ 30   → Buen dato · n viajes
 *   5 a 29   → Poco dato · n viajes
 *   n < 5    → Sin dato (la UI muestra el promedio del corredor, en gris)
 */
export type ConfidenceLevel = "good" | "low" | "none";

export type Confidence = {
  level: ConfidenceLevel;
  label: string;
};

export const GOOD_MIN = 30;
export const LOW_MIN = 5;

export function confidence(nObs: number): Confidence {
  const n = Number.isFinite(nObs) && nObs > 0 ? Math.floor(nObs) : 0;
  if (n >= GOOD_MIN) return { level: "good", label: `Buen dato · ${n} viajes` };
  if (n >= LOW_MIN) return { level: "low", label: `Poco dato · ${n} viajes` };
  return { level: "none", label: "Sin dato" };
}
