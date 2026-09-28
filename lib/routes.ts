/**
 * Qué rutas se pueden ver sin sesión. Todo lo demás exige login (PACKET §10).
 * Función pura para poder probarla sin levantar Next.
 */
const PUBLIC_EXACT = new Set(["/", "/login"]);
const PUBLIC_PREFIXES = ["/auth/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** A dónde mandar a alguien sin sesión, recordando a dónde iba. */
export function loginRedirectPath(pathname: string, search = ""): string {
  const next = pathname + search;
  return "/login?next=" + encodeURIComponent(next);
}

/** Solo aceptamos `next` relativo al sitio, para no abrir un redirect a otro dominio. */
export function safeNext(next: string | null | undefined, fallback = "/corredor"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
