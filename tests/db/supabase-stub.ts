/**
 * Postgres real (PGlite) con lo mínimo de Supabase para aplicar la migración
 * tal cual y probar RLS: esquema `auth`, `auth.uid()` leyendo el JWT, y los
 * roles anon / authenticated / service_role.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

const PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export const USER_A = "00000000-0000-4000-a000-00000000000a";
export const USER_B = "00000000-0000-4000-a000-00000000000b";
export const USER_C = "00000000-0000-4000-a000-00000000000c";
export const USER_D = "00000000-0000-4000-a000-00000000000d";
export const REVIEWER = "00000000-0000-4000-a000-0000000000ee";

export type Db = PGlite & {
  as: (user: string | null) => Promise<void>;
  asService: () => Promise<void>;
};

export async function freshDb(): Promise<Db> {
  const db = new PGlite() as Db;
  await db.exec(PRELUDE);
  const migration = readFileSync(
    path.join(import.meta.dirname, "../../supabase/migrations/001_init.sql"),
    "utf8",
  );
  await db.exec(migration);

  await db.exec(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@prueba.test'), ('${USER_B}', 'b@prueba.test'),
      ('${USER_C}', 'c@prueba.test'), ('${USER_D}', 'd@prueba.test'),
      ('${REVIEWER}', 'rev@prueba.test');
    insert into public.profiles (id, role) values ('${REVIEWER}', 'reviewer');
    insert into public.stops (id, name, lat, lng, seq) values
      ('A', 'Atizapán', 19.5, -99.2, 1), ('B', 'B', 19.5, -99.2, 2),
      ('C', 'C', 19.5, -99.2, 3), ('D', 'Metro El Rosario', 19.5, -99.2, 4);
  `);

  db.as = async (user) => {
    await db.exec("reset role");
    const claims = user ? JSON.stringify({ sub: user, role: "authenticated" }) : "";
    await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
    await db.exec(user ? "set role authenticated" : "set role anon");
  };
  db.asService = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
    await db.exec("set role service_role");
  };
  return db;
}

/** Predicciones para todas las horas de un tramo, útil para fijar el p50 "de ahora". */
export async function seedPredictions(db: Db, segment: string, p50: number, p90 = p50 * 2) {
  await db.exec("reset role");
  for (const daytype of ["weekday", "weekend"]) {
    for (let hour = 0; hour < 24; hour++) {
      await db.query(
        `insert into public.predictions (segment, daytype, hour, wait_p50, wait_p90, seat_prob, n_obs, model_version)
         values ($1, $2, $3, $4, $5, 0.4, 20, 'test')
         on conflict (segment, daytype, hour) do update set wait_p50 = excluded.wait_p50, wait_p90 = excluded.wait_p90`,
        [segment, daytype, hour, p50, p90],
      );
    }
  }
}
