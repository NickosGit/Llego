/**
 * T4 + T5 + cola de revisión contra el Supabase REAL, con cuentas de prueba.
 *
 *   node --env-file=.env.local scripts/test_live.ts
 *
 * Usa la parada C (la que menos se ve en la app por defecto). Si a la hora
 * actual no hay predicción para el tramo CD (fuera de 4–9 h), crea una
 * temporal con p50 = 6 y la borra al final. Nunca toca predicciones reales.
 * Los reportes de prueba quedan y vencen solos en 2 h.
 */
import assert from "node:assert/strict";

import { ensureUser, serviceClient, sessionFor, TEST_EMAILS } from "./admin.ts";

const STOP = "C";
const SEGMENT = "CD";

const admin = serviceClient();
for (const who of ["a", "b", "c", "reviewer"] as const) await ensureUser(admin, TEST_EMAILS[who]);
const reviewerId = await ensureUser(admin, TEST_EMAILS.reviewer);
await admin.from("profiles").upsert({ id: reviewerId, role: "reviewer" }, { onConflict: "id" });

const [a, b, c, reviewer] = await Promise.all(
  (["a", "b", "c", "reviewer"] as const).map((w) => sessionFor(admin, TEST_EMAILS[w])),
);

const { data: now } = await admin.rpc("corridor_now");
const { daytype, hour, window_start } = (now as { daytype: string; hour: number; window_start: string }[])[0];

// Estado limpio para esta prueba: sin casos ni reportes previos en la parada C.
await admin.from("review_cases").delete().eq("stop_id", STOP).eq("window_start", window_start);
await admin.from("reports").delete().eq("stop_id", STOP).in("user_id", [
  await ensureUser(admin, TEST_EMAILS.a),
  await ensureUser(admin, TEST_EMAILS.b),
  await ensureUser(admin, TEST_EMAILS.c),
]);

const existing = await admin
  .from("predictions")
  .select("*")
  .eq("segment", SEGMENT)
  .eq("daytype", daytype)
  .eq("hour", hour)
  .maybeSingle();
let tempPrediction = false;
if (!existing.data) {
  const ins = await admin.from("predictions").insert({
    segment: SEGMENT, daytype, hour, wait_p50: 6, wait_p90: 12, seat_prob: 0.4, n_obs: 20,
    model_version: "prueba-temporal-test_live", is_simulated: true,
  });
  assert.ifError(ins.error);
  tempPrediction = true;
}
const before = (await admin.from("predictions").select("*").order("segment").order("daytype").order("hour")).data;
const p50 = Number((existing.data ?? { wait_p50: 6 }).wait_p50);

let failures = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

const aggFor = async (client: typeof a) => {
  const { data, error } = await client.rpc("live_reports_agg");
  assert.ifError(error);
  return (data as { stop_id: string; kind: string; passengers: number }[]).filter((r) => r.stop_id === STOP);
};

try {
  console.log(`Hora del corredor: ${daytype} ${hour}h · p50 ${SEGMENT} = ${p50}${tempPrediction ? " (temporal)" : ""}`);

  await check("T4: 2 personas reportan → la celda no aparece", async () => {
    assert.ifError((await a.from("reports").insert({ stop_id: STOP, kind: "long_wait" })).error);
    assert.ifError((await b.from("reports").insert({ stop_id: STOP, kind: "long_wait" })).error);
    assert.deepEqual(await aggFor(c), []);
  });

  await check("rate limit: A no puede reportar otra vez en la misma parada", async () => {
    const { error } = await a.from("reports").insert({ stop_id: STOP, kind: "full" });
    assert.match(error?.message ?? "", /rate_limited/);
  });

  await check("T4: la 3ª persona hace visible la celda", async () => {
    assert.ifError((await c.from("reports").insert({ stop_id: STOP, kind: "long_wait" })).error);
    assert.deepEqual(await aggFor(a), [{ stop_id: STOP, kind: "long_wait", passengers: 3 }]);
  });

  await check(`T5: con p50 = ${p50} ${p50 < 10 ? "abre caso" : "(≥ 10) no abre caso"}`, async () => {
    const r1 = await a.rpc("flag_contradiction", { p_stop_id: STOP });
    const r2 = await b.rpc("flag_contradiction", { p_stop_id: STOP });
    assert.ifError(r1.error);
    assert.equal(r1.data, p50 < 10);
    assert.equal(r2.data, p50 < 10);
    const { data } = await admin.from("review_cases").select("id").eq("stop_id", STOP).eq("window_start", window_start);
    assert.equal(data?.length, p50 < 10 ? 1 : 0, "un solo caso por parada y bloque de 2 h");
  });

  await check("T5: el pronóstico no cambió", async () => {
    const after = (await admin.from("predictions").select("*").order("segment").order("daytype").order("hour")).data;
    assert.deepEqual(after, before);
  });

  await check("un pasajero no ve casos; el revisor sí", async () => {
    assert.equal((await a.from("review_cases").select("id")).data?.length ?? 0, 0);
    const { data } = await reviewer.from("review_cases").select("id").eq("stop_id", STOP).eq("window_start", window_start);
    assert.equal(data?.length, p50 < 10 ? 1 : 0);
  });

  await check("un pasajero no puede cerrar casos", async () => {
    await a.from("review_cases").update({ status: "dismissed" }).eq("stop_id", STOP);
    const { data } = await admin.from("review_cases").select("status").eq("stop_id", STOP).eq("window_start", window_start);
    for (const row of data ?? []) assert.equal(row.status, "open");
  });
} finally {
  if (tempPrediction) {
    await admin.from("predictions").delete().eq("model_version", "prueba-temporal-test_live");
  }
}

console.log(failures ? `\n${failures} fallaron` : "\nTodo bien. (El caso de prueba queda abierto para verlo en /revision.)");
process.exit(failures ? 1 : 0);
