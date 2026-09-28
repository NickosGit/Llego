"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { loadCache, saveCache } from "./prediction-cache";
import { PREDICTION_COLUMNS, type Prediction } from "./types";

export type PredictionState = {
  preds: Prediction[] | null;
  source: "live" | "cache" | "none";
  savedAt?: number;
};

/**
 * Predicciones con red de seguridad: si el servidor las trajo, se guardan; si
 * no (mala señal), se muestra la última copia buena y se reintenta desde el
 * navegador una vez más.
 */
export function usePredictions(initial: Prediction[] | null): PredictionState {
  const [state, setState] = useState<PredictionState>(() =>
    initial?.length ? { preds: initial, source: "live" } : { preds: null, source: "none" },
  );

  useEffect(() => {
    if (initial?.length) {
      saveCache(initial);
      return;
    }

    let cancelled = false;
    const cached = loadCache();
    // Primero la copia guardada, al instante; luego intentamos refrescar.
    queueMicrotask(() => {
      if (!cancelled && cached) setState({ preds: cached.preds, source: "cache", savedAt: cached.savedAt });
    });

    (async () => {
      for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
        try {
          const { data, error } = await createClient().from("predictions").select(PREDICTION_COLUMNS);
          if (!error && data?.length) {
            saveCache(data as Prediction[]);
            if (!cancelled) setState({ preds: data as Prediction[], source: "live" });
            return;
          }
        } catch {
          // Red caída: reintentamos una vez.
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initial]);

  return state;
}
