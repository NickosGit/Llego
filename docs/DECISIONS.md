# DECISIONS: ¿Llego?

Una línea por decisión, con el porqué. Lo más nuevo va abajo.

## Commit 1: scaffold, auth, banner, config del corredor

- Next 16 renombró `middleware.ts` a `proxy.ts`; la protección de rutas vive ahí (misma función, nombre nuevo).
- Ruta real `/corredor` (UI en español); `/corridor` del PACKET (T1) redirige a `/corredor` para que ambas pruebas apliquen.
- Supabase: se reutiliza el proyecto de consent-log/reparto (decisión de Nico: límite de 2 proyectos gratis). No hay choque de nombres (ese proyecto solo tiene `pulls` e `incidents`).
- El callback del magic link acepta `code` (PKCE) y `token_hash`: en Android el correo suele abrir otro navegador y PKCE falla ahí.
- Paleta clara fija, texto base de 18px y controles de ≥48px: se usa de madrugada, a una mano.
- T6 y "sin secretos en app/ y components/" son pruebas de Vitest (`tests/guards.test.ts`), no solo un grep manual, para que se rompan solas.
- Copy de la portada reescrito para no usar la palabra "unidad": el grep de T6 la marcaría, y además la app no habla de colectivos individuales.
