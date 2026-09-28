/**
 * Último set de predicciones que llegó bien: en memoria (sobrevive a cambios de
 * pantalla) y en localStorage (sobrevive a recargar con mala señal, T8).
 * localStorage puede fallar (modo privado, sin espacio): todo va en try/catch.
 */
import type { Prediction } from "./types";

const KEY = "llego:predictions:v1";

export type CachedPredictions = { preds: Prediction[]; savedAt: number };

let memory: CachedPredictions | null = null;

function isPredictionList(x: unknown): x is Prediction[] {
  return (
    Array.isArray(x) &&
    x.every((p) => p && typeof p.segment === "string" && typeof p.hour === "number" && "wait_p50" in p)
  );
}

export function saveCache(preds: Prediction[], now = Date.now()): void {
  if (!preds.length) return;
  memory = { preds, savedAt: now };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Sin localStorage seguimos con la copia en memoria.
  }
}

export function loadCache(): CachedPredictions | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.savedAt === "number" && isPredictionList(parsed.preds)) {
      memory = parsed;
      return memory;
    }
  } catch {
    // Cache corrupto o inaccesible: como si no hubiera.
  }
  return null;
}

/** Solo para pruebas. */
export function clearMemoryCache(): void {
  memory = null;
}
