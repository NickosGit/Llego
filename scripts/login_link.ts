/**
 * Enlace de entrada de un solo uso para una cuenta de PRUEBA, sin correo.
 * Lo usan Playwright y las pruebas manuales en local.
 *
 *   node --env-file=.env.local scripts/login_link.ts [a|b|c|reviewer] [base]
 */
import { ensureUser, serviceClient, TEST_EMAILS } from "./admin.ts";

export async function loginLink(who: keyof typeof TEST_EMAILS, base: string, next = "/corredor") {
  const admin = serviceClient();
  const email = TEST_EMAILS[who];
  await ensureUser(admin, email);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const url = new URL("/auth/callback", base);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", next);
  return url.toString();
}

if (import.meta.main) {
  const who = (process.argv[2] ?? "a") as keyof typeof TEST_EMAILS;
  console.log(await loginLink(who, process.argv[3] ?? "http://localhost:3500"));
}
