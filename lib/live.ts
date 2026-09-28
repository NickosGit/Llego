/**
 * Franja de reportes en vivo. Solo trabaja con AGREGADOS (live_reports_agg) y
 * aplica el k-umbral otra vez del lado del cliente, por si acaso: una celda con
 * menos de 3 personas nunca se muestra (T4).
 *
 * La franja NUNCA cambia el pronóstico: si contradice, se etiqueta
 * "en revisión" y decide una persona (T5).
 */
import type { StopId } from "@/config/corridor";

export type ReportKind = "long_wait" | "full" | "breakdown";

export const K_MIN = 3;

export type LiveAgg = { stop_id: string; kind: ReportKind; passengers: number };

export const REPORT_BUTTONS: { kind: ReportKind; label: string }[] = [
  { kind: "long_wait", label: "Espera larga" },
  { kind: "full", label: "Va lleno" },
  { kind: "breakdown", label: "Se descompuso" },
];

const PHRASE: Record<ReportKind, string> = {
  long_wait: "reportan espera larga",
  full: "reportan que va lleno",
  breakdown: "reportan una descompostura",
};

export type StripState = {
  visible: boolean;
  lines: string[];
  inReview: boolean;
};

export function stripState(rows: LiveAgg[], stop: StopId, inReview: boolean): StripState {
  const lines = rows
    .filter((r) => r.stop_id === stop && r.passengers >= K_MIN)
    .sort((a, b) => b.passengers - a.passengers)
    .map((r) => `Últimas 2 h: ${r.passengers} pasajeros ${PHRASE[r.kind]}`);

  if (lines.length === 0 && inReview) {
    // Regla (b): viajes registrados mucho más rápidos que el pronóstico.
    return { visible: true, lines: ["Los viajes recientes no coinciden con el pronóstico"], inReview };
  }
  return { visible: lines.length > 0, lines, inReview: inReview && lines.length > 0 };
}

/** Mensaje para el error del rate limit (1 reporte por parada cada 15 min). */
export function reportErrorMessage(message: string | undefined): string {
  if (message?.includes("rate_limited")) {
    return "Ya reportaste en esta parada hace poco. Puedes volver a reportar en 15 minutos.";
  }
  return "No se pudo mandar el reporte. Revisa tu señal e intenta otra vez.";
}
