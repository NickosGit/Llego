// Copia el worker de MapLibre a public/maplibre/. MapLibre v6 lo busca junto a
// su propio módulo, ruta que el bundler de Next no conserva; la app lo apunta
// aquí con setWorkerUrl(). Corre antes de `dev` y `build`.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist/";
const to = "public/maplibre/";
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(from + f, to + f);
