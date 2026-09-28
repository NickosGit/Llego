/**
 * Subida del viaje con mala señal en mente (T8): un reintento, y si tampoco
 * sale, se guarda en el teléfono y se manda en la próxima visita.
 * Solo viaja `tripPayload` (duraciones + paradas), nunca coordenadas.
 */
import { tripPayload, type TripPayload } from "./trip";

type InsertResult = { error: { message: string; code?: string } | null };
export type Insert = (p: TripPayload) => Promise<InsertResult>;

const PENDING_KEY = "llego:pending-trips:v1";
export const RETRY_DELAY_MS = 2_000;

/** Un error con código de Postgres (p. ej. 23514) no se arregla reintentando. */
function isRetryable(error: { message: string; code?: string }): boolean {
  return !(error.code && /^[0-9A-Z]{5}$/.test(error.code));
}

export async function uploadTrip(
  payload: TripPayload,
  insert: Insert,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<"sent" | "pending" | "rejected"> {
  const clean = tripPayload(payload);
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: InsertResult;
    try {
      result = await insert(clean);
    } catch (e) {
      result = { error: { message: String(e) } };
    }
    if (!result.error) return "sent";
    if (!isRetryable(result.error)) return "rejected";
    if (attempt === 0) await sleep(RETRY_DELAY_MS);
  }
  savePending(clean);
  return "pending";
}

function readPending(): TripPayload[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePending(p: TripPayload) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...readPending(), p].slice(-20)));
  } catch {
    // Sin almacenamiento no podemos guardarlo; la UI ya avisó.
  }
}

/** Manda lo pendiente. Devuelve cuántos se enviaron. */
export async function flushPending(insert: Insert): Promise<number> {
  const pending = readPending();
  if (!pending.length) return 0;
  const left: TripPayload[] = [];
  let sent = 0;
  for (const p of pending) {
    try {
      const { error } = await insert(tripPayload(p));
      if (!error) sent++;
      else if (isRetryable(error)) left.push(p);
    } catch {
      left.push(p);
    }
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(left));
  } catch {
    // ignorar
  }
  return sent;
}
