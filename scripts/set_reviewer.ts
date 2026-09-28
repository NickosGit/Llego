/**
 * Da (o quita) el rol de revisor a una cuenta. Solo con la service role:
 * desde la app nadie puede cambiarse el rol.
 *
 *   node --env-file=.env.local scripts/set_reviewer.ts correo@ejemplo.com
 *   node --env-file=.env.local scripts/set_reviewer.ts correo@ejemplo.com --quitar
 */
import { findUser, serviceClient } from "./admin.ts";

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error("Uso: scripts/set_reviewer.ts <correo> [--quitar]");
  process.exit(1);
}

const admin = serviceClient();
const id = await findUser(admin, email);
if (!id) {
  console.error(`No existe la cuenta ${email}. Que entre una vez a la app con su correo y vuelve a correr esto.`);
  process.exit(1);
}
const role = flag === "--quitar" ? "passenger" : "reviewer";
const { error } = await admin.from("profiles").upsert({ id, role }, { onConflict: "id" });
if (error) throw error;
console.log(`${email} → ${role}`);
