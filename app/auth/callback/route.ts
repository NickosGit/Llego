import { NextResponse } from "next/server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { safeNext } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta desde el magic link. Acepta los dos formatos de Supabase:
 * - `code` (PKCE): solo funciona si el enlace se abre en el mismo navegador.
 * - `token_hash` + `type`: funciona aunque el correo abra otro navegador
 *   (requiere la plantilla de correo descrita en docs/SETUP.md).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  // Detrás del proxy de Vercel, `origin` es el host interno.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = isLocal || !forwardedHost ? origin : "https://" + forwardedHost;

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(base + next);
    return NextResponse.redirect(base + "/login?error=enlace");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(base + next);
    return NextResponse.redirect(base + "/login?error=enlace");
  }

  return NextResponse.redirect(base + "/login?error=sin_codigo");
}
