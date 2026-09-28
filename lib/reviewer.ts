import type { SupabaseClient } from "@supabase/supabase-js";

/** ¿La sesión actual tiene rol de revisor? Lo decide la base (profiles + RLS). */
export async function isReviewer(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_reviewer");
  return !error && data === true;
}

export const REASON_TEXT: Record<string, string> = {
  long_wait_vs_low_forecast: "Varias personas reportan espera larga, pero el pronóstico dice espera corta.",
  fast_trips_vs_forecast: "Varias personas registraron esperas mucho más cortas que el pronóstico.",
};

export const STATUS_TEXT: Record<string, string> = {
  open: "Abierto",
  confirmed: "Confirmado",
  dismissed: "Descartado",
};
