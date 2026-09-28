import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "./env";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Las consultas llevan el JWT del usuario, así que RLS se aplica en Postgres.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}
