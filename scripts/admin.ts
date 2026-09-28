/**
 * Clientes para scripts. La service role vive SOLO aquí (scripts/), nunca en la
 * app. Correr con: node --env-file=.env.local scripts/<script>.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env.local`);
  return v;
}

export function serviceClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Id de un usuario existente por correo, o null. */
export async function findUser(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Cuenta de PRUEBA: la busca o la crea ya confirmada (no se manda ningún correo). */
export async function ensureUser(admin: SupabaseClient, email: string): Promise<string> {
  const existing = await findUser(admin, email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

/** Sesión real de un usuario de prueba, sin contraseña y sin mandar correo. */
export async function sessionFor(admin: SupabaseClient, email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = anonClient();
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw verifyError;
  return client;
}

/** Cuentas de prueba de ¿Llego?. Dominio .test: no existen fuera de este proyecto. */
export const TEST_EMAILS = {
  a: "llego.prueba.a@llego.test",
  b: "llego.prueba.b@llego.test",
  c: "llego.prueba.c@llego.test",
  reviewer: "llego.revision@llego.test",
};
