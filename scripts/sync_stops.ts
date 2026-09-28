/**
 * Copia las paradas de config/corridor.ts a la tabla `stops`.
 * config/corridor.ts es la única fuente: si cambian las paradas, se edita ese
 * archivo y se vuelve a correr esto.
 *
 *   node --env-file=.env.local scripts/sync_stops.ts
 */
import { STOPS } from "../config/corridor.ts";

import { serviceClient } from "./admin.ts";

const sb = serviceClient();
const { error } = await sb.from("stops").upsert(
  STOPS.map(({ id, name, lat, lng, seq }) => ({ id, name, lat, lng, seq })),
  { onConflict: "id" },
);
if (error) throw error;
console.log(`Paradas sincronizadas: ${STOPS.map((s) => `${s.id} ${s.name}`).join(" · ")}`);
