"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { flushPending } from "@/lib/trip-upload";

/** Manda en silencio los viajes que se quedaron en el teléfono por falta de señal. */
export function PendingTrips() {
  useEffect(() => {
    const send = () =>
      void flushPending(async (p) => {
        const { error } = await createClient().from("trips").insert(p);
        return { error };
      });
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, []);
  return null;
}
