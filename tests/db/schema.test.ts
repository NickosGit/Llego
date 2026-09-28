/**
 * La migración aplicada sobre Postgres real (PGlite), con los roles de Supabase.
 * Cubre la parte de base de datos de T2, T4, T5, T6 y T9.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { freshDb, REVIEWER, seedPredictions, USER_A, USER_B, USER_C, USER_D, type Db } from "./supabase-stub";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function insertTrip(user: string, extra: Record<string, unknown> = {}) {
  await db.as(user);
  const row = {
    stop_from: "A",
    stop_to: "D",
    daytype: "weekday",
    hour: 5,
    wait_min: 12,
    ride_min: 40,
    got_seat: false,
    ...extra,
  };
  const cols = Object.keys(row);
  await db.query(
    `insert into public.trips (${cols.join(", ")}) values (${cols.map((_, i) => "$" + (i + 1)).join(", ")})`,
    Object.values(row),
  );
}

async function report(user: string, stop: string, kind: string) {
  await db.as(user);
  await db.query("insert into public.reports (stop_id, kind) values ($1, $2)", [stop, kind]);
}

describe("migración", () => {
  it("aplica limpio y deja RLS activo en todas las tablas", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([
      "predictions",
      "profiles",
      "reports",
      "review_cases",
      "stops",
      "trips",
    ]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("T6: ninguna columna identifica colectivos ni a quien los maneja", async () => {
    const { rows } = await db.query<{ col: string }>(
      `select table_name || '.' || column_name as col from information_schema.columns
       where table_schema = 'public'`,
    );
    const bad = rows.filter((r) => /vehicle|unit|plate|driver|placa|unidad|chofer/i.test(r.col));
    expect(bad).toEqual([]);
  });

  it("anon no puede leer nada", async () => {
    await db.as(null);
    await expect(db.query("select * from public.predictions")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.trips")).rejects.toThrow(/permission denied/);
  });
});

describe("T2: viajes aislados por usuario", () => {
  it("B no ve los viajes de A", async () => {
    await insertTrip(USER_A);
    await db.as(USER_A);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    await db.as(USER_B);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(0);
  });

  it("B no puede insertar a nombre de A ni marcar un viaje como simulado", async () => {
    await expect(insertTrip(USER_B, { user_id: USER_A })).rejects.toThrow(/row-level security/);
    await expect(insertTrip(USER_B, { is_simulated: true })).rejects.toThrow(/row-level security/);
  });

  it("B no puede borrar los viajes de A; A sí (T10)", async () => {
    await insertTrip(USER_A);
    await db.as(USER_B);
    await db.query("delete from public.trips");
    await db.as(USER_A);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    await db.query("delete from public.trips");
    await db.exec("reset role");
    expect((await db.query("select * from public.trips")).rows).toHaveLength(0);
  });
});

describe("reportes", () => {
  it("nadie puede leer reportes individuales, ni los propios", async () => {
    await report(USER_A, "A", "full");
    await db.as(USER_A);
    await expect(db.query("select * from public.reports")).rejects.toThrow(/permission denied/);
  });

  it("el cliente solo puede mandar stop_id y kind", async () => {
    await db.as(USER_A);
    await expect(
      db.query("insert into public.reports (stop_id, kind, created_at) values ('A', 'full', now() - interval '1 day')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("máximo 1 reporte por usuario y parada cada 15 min", async () => {
    await report(USER_A, "A", "full");
    await expect(report(USER_A, "A", "long_wait")).rejects.toThrow(/rate_limited/);
    await report(USER_A, "B", "long_wait"); // otra parada sí se puede
  });
});

describe("T4: k-umbral en live_reports_agg()", () => {
  it("con 2 personas la celda no aparece", async () => {
    await report(USER_A, "A", "long_wait");
    await report(USER_B, "A", "long_wait");
    await db.as(USER_C);
    expect((await db.query("select * from public.live_reports_agg()")).rows).toEqual([]);
  });

  it("con 3 personas aparece, contando personas distintas", async () => {
    await report(USER_A, "A", "long_wait");
    await report(USER_B, "A", "long_wait");
    await report(USER_C, "A", "long_wait");
    await db.as(USER_D);
    expect((await db.query("select * from public.live_reports_agg()")).rows).toEqual([
      { stop_id: "A", kind: "long_wait", passengers: 3 },
    ]);
  });

  it("los reportes vencidos no cuentan", async () => {
    for (const u of [USER_A, USER_B, USER_C]) await report(u, "A", "full");
    await db.exec("reset role");
    await db.exec("update public.reports set expires_at = now() - interval '1 minute'");
    await db.as(USER_D);
    expect((await db.query("select * from public.live_reports_agg()")).rows).toEqual([]);
  });
});

describe("T5: contradicciones van a revisión humana", () => {
  it("3 esperas largas con p50 = 6 abren UN caso y no tocan el pronóstico", async () => {
    await seedPredictions(db, "AB", 6);
    await db.exec("reset role");
    const before = (await db.query("select * from public.predictions order by 1, 2, 3")).rows;

    for (const u of [USER_A, USER_B, USER_C]) await report(u, "A", "long_wait");
    await db.as(USER_D);
    const first = await db.query<{ r: boolean }>("select public.flag_contradiction('A') as r");
    const again = await db.query<{ r: boolean }>("select public.flag_contradiction('A') as r");
    expect(first.rows[0].r).toBe(true);
    expect(again.rows[0].r).toBe(true);

    await db.exec("reset role");
    const cases = (await db.query("select stop_id, reason, forecast_p50, report_count, status from public.review_cases")).rows;
    expect(cases).toEqual([
      { stop_id: "A", reason: "long_wait_vs_low_forecast", forecast_p50: "6.0", report_count: 3, status: "open" },
    ]);
    expect((await db.query("select * from public.predictions order by 1, 2, 3")).rows).toEqual(before);
  });

  it("con p50 alto, 3 esperas largas no son contradicción", async () => {
    await seedPredictions(db, "AB", 15);
    for (const u of [USER_A, USER_B, USER_C]) await report(u, "A", "long_wait");
    await db.as(USER_D);
    expect((await db.query<{ r: boolean }>("select public.flag_contradiction('A') as r")).rows[0].r).toBe(false);
  });

  it("3 personas que esperaron menos de la mitad del p50 también abren caso", async () => {
    await seedPredictions(db, "AB", 20);
    for (const u of [USER_A, USER_B, USER_C]) await insertTrip(u, { wait_min: 4 });
    await db.as(USER_D);
    expect((await db.query<{ r: boolean }>("select public.flag_contradiction('A') as r")).rows[0].r).toBe(true);
    await db.exec("reset role");
    expect((await db.query("select reason from public.review_cases")).rows).toEqual([
      { reason: "fast_trips_vs_forecast" },
    ]);
  });

  it("solo quien revisa ve y actualiza casos, y solo estado y nota", async () => {
    await seedPredictions(db, "AB", 6);
    for (const u of [USER_A, USER_B, USER_C]) await report(u, "A", "long_wait");
    await db.as(USER_D);
    await db.query("select public.flag_contradiction('A')");
    expect((await db.query("select * from public.review_cases")).rows).toHaveLength(0);
    await db.query("update public.review_cases set status = 'dismissed'");

    await db.as(REVIEWER);
    expect((await db.query("select status from public.review_cases")).rows).toEqual([{ status: "open" }]);
    await db.query("update public.review_cases set status = 'confirmed', reviewer_note = 'lluvia fuerte'");
    await expect(db.query("update public.review_cases set forecast_p50 = 30")).rejects.toThrow(/permission denied/);
    expect((await db.query("select status, reviewer_note from public.review_cases")).rows).toEqual([
      { status: "confirmed", reviewer_note: "lluvia fuerte" },
    ]);
  });

  it("nadie puede ascenderse a revisor", async () => {
    await db.as(USER_A);
    await expect(
      db.query(`insert into public.profiles (id, role) values ('${USER_A}', 'reviewer')`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("T9 en la base: p90 ≥ p50", () => {
  it("la base rechaza una predicción con p90 < p50", async () => {
    await db.asService();
    await expect(
      db.query(
        `insert into public.predictions (segment, daytype, hour, wait_p50, wait_p90, seat_prob, n_obs, model_version)
         values ('AB', 'weekday', 5, 12, 8, 0.3, 10, 'x')`,
      ),
    ).rejects.toThrow(/predictions_p90_ge_p50/);
  });
});
