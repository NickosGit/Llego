"use client";

import { useSyncExternalStore } from "react";

/**
 * Consentimiento de ubicación, guardado en el propio teléfono. Si localStorage
 * no está disponible, vale para esta sesión (copia en memoria).
 */
const KEY = "llego:gps-consent:v1";
const EVENT = "llego-gps-consent";

export type Consent = "yes" | "no" | null;

let memory: Consent = null;

function read(): Consent {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Exclude<Consent, null>) {
  memory = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // Solo en memoria.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useGpsConsent(): Consent | "loading" {
  return useSyncExternalStore<Consent | "loading">(subscribe, read, () => "loading");
}
