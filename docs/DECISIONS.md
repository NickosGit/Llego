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

## Commit 3: pronóstico con mapa y etiquetas de confianza

- `/corredor` trae las 36 predicciones de una vez: cambiar parada u hora no toca la red y todo el set cabe en caché.
- Caché del último set bueno en memoria + localStorage (`lib/prediction-cache.ts`); si el servidor no las trae, se muestra la copia con aviso "Sin conexión" y se reintenta una vez desde el navegador (base de T8).
- ≤ 3 taps: tres selects grandes (Desde, Hasta, Salida) con A→D y "mañana 5:10" por defecto, así que para Rodolfo son 0 taps. "Hoy" y "mañana" van dentro del select de salida para no agregar un cuarto control.
- Espera y asiento del pronóstico = los del tramo donde uno sube (el origen). El mapa colorea todos los tramos a esa hora.
- Colores: verde < 10 min, ámbar 10–13, rojo ≥ 14, gris si la celda es "Sin dato" (no pintamos verde algo sin respaldo).
- **Bug encontrado en la prueba visual**: con p50 = 9.5 el tramo salía verde ("< 10") y la tarjeta decía "10 min". El color ahora usa los minutos ya redondeados. Prueba de regresión en `tests/forecast.test.ts`.
- MapLibre v6 busca su worker junto a su módulo y el bundler de Next no conserva esa ruta ("Worker failed to load"). Se copia a `public/maplibre/` en `predev`/`prebuild` y se usa `setWorkerUrl`. El proxy no intercepta `/maplibre/`.
- Mapa estático (`interactive: false`): se usa a una mano y no debe robarse el scroll. Sin servidor de fuentes: las dos etiquetas son HTML. Teselas OSM raster sin llave, con atribución.
- Playwright usa el Edge instalado (`channel: "msedge"`), así que no descarga navegadores. Entra con una cuenta de prueba mediante `scripts/login_link.ts` (token_hash de un solo uso, sin correo).
- `package.json` con `"type": "module"`: los scripts de Node usan top-level await e importan `config/corridor.ts` directo.
- 🚀 **Deploy 1** (después del commit 3): https://llego-sigma.vercel.app. En Vercel solo están `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; la service role nunca sale de `.env.local`. `.vercelignore` excluye `.env*` y el venv. Playwright pasó contra producción.

## Commit 4: reportes en vivo, k-umbral, cola de revisión

- Los reportes son de la **parada de subida** elegida (Desde). El cliente inserta directo con supabase-js para que el payload visible en DevTools sea exactamente `{"stop_id","kind"}` (verificado: `{"stop_id":"A","kind":"full"}`). Una server action mandaría un cuerpo opaco.
- La franja pide `live_reports_agg()` y `flag_contradiction(stop)` al cargar. El k-umbral se aplica en la base y otra vez en `lib/live.ts` por si algo se colara.
- Si el caso se abrió por la regla (b) (viajes rápidos, sin reportes), la franja aparece igual con "Los viajes recientes no coinciden con el pronóstico" + `en revisión`: si no, la etiqueta quedaría invisible.
- La contradicción se compara con el p50 de la **hora actual**, no con la salida que se está consultando (que suele ser mañana): los reportes son de ahora.
- `/revision`: el rol se comprueba con `is_reviewer()` en la página y en la server action, y RLS lo vuelve a exigir. Un pasajero es redirigido a `/corredor`. Solo "Confirmar"/"Descartar" + nota: ninguna acción de sanción ni despacho.
- T4 y T5 se prueban en tres capas: PGlite (`tests/db`), lógica de la franja (`tests/live.test.ts`) y el Supabase real (`npm run db:live`, cuentas `*.llego.test`). Como a las 23 h no hay predicción, `test_live.ts` crea una temporal para la hora actual (p50 = 6) y la borra al final; nunca toca las de 4–9 h.
