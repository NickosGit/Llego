/**
 * T2 contra el Supabase REAL, con dos cuentas de prueba: el usuario A no puede
 * ver, borrar ni suplantar los viajes de B, y nadie lee reportes individuales.
 *
 *   node --env-file=.env.local scripts/test_rls.ts
 */
import assert from "node:assert/strict";

import { anonClient, ensureUser, serviceClient, sessionFor, TEST_EMAILS } from "./admin.ts";

const admin = serviceClient();
const idA = await ensureUser(admin, TEST_EMAILS.a);
const idB = await ensureUser(admin, TEST_EMAILS.b);
const a = await sessionFor(admin, TEST_EMAILS.a);
const b = await sessionFor(admin, TEST_EMAILS.b);

const trip = {
  stop_from: "A",
  stop_to: "D",
  daytype: "weekday",
  hour: 5,
  wait_min: 12,
  ride_min: 40,
  got_seat: false,
};

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

console.log("T2: RLS con dos cuentas");

const inserted = await a.from("trips").insert(trip).select("id").single();
assert.ifError(inserted.error);
const tripId = inserted.data.id as string;

await check("A ve su propio viaje", async () => {
  const { data, error } = await a.from("trips").select("id").eq("id", tripId);
  assert.ifError(error);
  assert.equal(data.length, 1);
});

await check("B no ve el viaje de A (0 filas)", async () => {
  const { data, error } = await b.from("trips").select("*").eq("user_id", idA);
  assert.ifError(error);
  assert.equal(data.length, 0);
});

await check("B no puede borrar el viaje de A", async () => {
  await b.from("trips").delete().eq("id", tripId);
  const { data } = await a.from("trips").select("id").eq("id", tripId);
  assert.equal(data?.length, 1);
});

await check("B no puede insertar a nombre de A", async () => {
  const { error } = await b.from("trips").insert({ ...trip, user_id: idA });
  assert.ok(error, "debió fallar");
});

await check("B no puede subir viajes marcados como simulados", async () => {
  const { error } = await b.from("trips").insert({ ...trip, is_simulated: true });
  assert.ok(error, "debió fallar");
});

await check("nadie lee reportes individuales", async () => {
  const { data, error } = await b.from("reports").select("*");
  assert.ok(error || data?.length === 0);
});

await check("sin sesión no se leen predicciones", async () => {
  const { data, error } = await anonClient().from("predictions").select("*");
  assert.ok(error || data?.length === 0);
});

await check("B no puede darse rol de revisor", async () => {
  const { error } = await b.from("profiles").insert({ id: idB, role: "reviewer" });
  assert.ok(error, "debió fallar");
});

// Limpieza: A borra su viaje de prueba (T10 de paso).
await check("A borra su viaje y desaparece (T10)", async () => {
  const del = await a.from("trips").delete().eq("id", tripId);
  assert.ifError(del.error);
  const { data } = await admin.from("trips").select("id").eq("id", tripId);
  assert.equal(data?.length, 0);
});

console.log(failures ? `\n${failures} fallaron` : "\nTodo bien.");
process.exit(failures ? 1 : 0);
