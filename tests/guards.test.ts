/**
 * Guardias mecánicas que corren con cada `npm test`:
 * - T6: ningún archivo del producto menciona datos que identifiquen a trabajadores.
 * - Seguridad: ninguna llave (service role o JWT) en app/ ni components/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".venv", "__pycache__", ".next", ".pytest_cache"]);

function filesUnder(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (SKIP.has(name)) return [];
    const rel = path.join(dir, name);
    return statSync(path.join(ROOT, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
}

function offenders(dirs: string[], pattern: RegExp) {
  return dirs
    .flatMap(filesUnder)
    .filter((f) => /\.(ts|tsx|sql|py|mjs|md)$/.test(f))
    .flatMap((f) =>
      readFileSync(path.join(ROOT, f), "utf8")
        .split("\n")
        .map((line, i) => ({ f, line: i + 1, text: line }))
        .filter(({ text }) => pattern.test(text)),
    );
}

describe("T6: sin datos que identifiquen a trabajadores", () => {
  it("supabase/, scripts/, app/, components/, lib/ y config/ no mencionan vehículo, placa ni conductor", () => {
    const found = offenders(
      ["supabase", "scripts", "app", "components", "lib", "config"],
      /vehicle|unit_id|plate|driver|placa|unidad|chofer/i,
    );
    expect(found).toEqual([]);
  });
});

describe("Sin secretos en el código del cliente", () => {
  it("app/ y components/ no contienen service_role ni JWTs", () => {
    const found = offenders(["app", "components"], /service_role|eyJ/i);
    expect(found).toEqual([]);
  });
});
