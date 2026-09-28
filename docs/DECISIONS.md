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

## Commit 2: esquema, RLS, datos simulados, modelo cuantil

- `review_cases.window` se llama `window_start`: `window` es palabra reservada en Postgres. Guarda el inicio del bloque de 2 h (`date_bin`), y `unique (stop_id, window_start)` hace idempotente la apertura de casos.
- `reports`: el cliente solo tiene permiso de columna sobre `stop_id` y `kind`; `user_id`, `created_at` y `expires_at` los pone la base (default + trigger). Sin permiso de select: leer reportes directo da `permission denied`, que es más fuerte que "0 filas".
- Rate limit (1 reporte/usuario/parada/15 min) en un trigger `security definer`, porque sin select el usuario no vería sus propios reportes y la comprobación siempre pasaría.
- k-umbral en `live_reports_agg()` cuenta **personas distintas**, no filas: si no, una sola persona reportando cada 15 min llegaría a 3 sola.
- La detección de contradicciones vive en `flag_contradiction(stop_id)` (security definer): un pasajero no puede insertar en `review_cases` (solo quien revisa), así que la base abre el caso por él. Compara contra el p50 de la hora actual en America/Mexico_City. Nunca toca `predictions`.
- Quien revisa solo puede actualizar `status`, `reviewer_note`, `reviewed_at` y `reviewed_by` (grant de columnas). Nadie puede darse el rol: `profiles` no tiene insert/update para clientes; el rol lo pone `scripts/set_reviewer.ts`.
- `trips.rain` se agregó (no está en el PACKET §9): el modelo usa lluvia como variable y los viajes simulados la traen. Es clima, no dato de personas. Los viajes reales la guardan en `false`.
- `trips.user_id` puede ser null SOLO si `is_simulated` (constraint): la semilla no pertenece a nadie.
- `stops` no se llena en la migración: `scripts/sync_stops.ts` la copia de `config/corridor.ts`, que sigue siendo la única fuente de coordenadas. La app lee la config, no la tabla.
- Simulación: el número de viajes por celda es Poisson con tasa por hora/tipo de día/tramo (pocos a las 4 am en fin de semana, muchos a las 7 en día laboral), para que aparezcan las tres etiquetas de confianza. Semilla fija y fecha de inicio fija: mismo CSV en cada corrida.
- Predicciones para un día **sin lluvia**: es el caso por defecto; la lluvia entra al entrenamiento para no inflar ese caso. Pendiente: interruptor "¿llueve?" si Rodolfo lo pide.
- La espera de un viaje se atribuye al tramo que empieza en su parada de origen (A→D entrena AB): se espera en la parada donde uno sube.
- Pruebas de base de datos con PGlite (Postgres 18 en WASM) + stub mínimo de Supabase (`auth.uid()`, roles). Corren en `npm test` sin red. T2 también tiene versión contra el Supabase real (`npm run db:rls`, 2 cuentas `*.llego.test` creadas con la API admin, sin correos).
- `purge_old_reports()` (retención de 30 días) la llama `train.py` en cada corrida, en vez de depender de pg_cron.
