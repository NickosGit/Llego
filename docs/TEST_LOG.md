# TEST_LOG: ¿Llego?

Pasada mecánica completa (PACKET §11) contra **producción** (https://llego-sigma.vercel.app) y el Supabase real, después del Deploy 2. Fecha: 2026-09-27, ~23:30 CDMX (domingo).

Cómo repetirla:

```
E2E_BASE_URL=https://llego-sigma.vercel.app npx playwright test   # T1, T3*, T7, T8, T10, /revision
npm test                                                          # unidad + PGlite: T2–T6, T9 (constraint), T3
npm run db:rls                                                    # T2 y T10 en Supabase real
npm run db:live                                                   # T4, T5 en Supabase real
scripts/.venv/Scripts/python -m pytest scripts                    # T9
git grep -iE "vehicle|unit_id|plate|driver|placa|unidad|chofer" -- supabase/ scripts/ app/ components/ lib/   # T6
```

| # | Prueba | Cómo | Resultado |
|---|---|---|---|
| T1 | Sin sesión, `/corridor` → login | curl prod: `/corridor` → 307 `/corredor` → 307 `/login?next=%2Fcorredor`; Playwright en prod | ✅ |
| T2 | A consulta viajes de B | `npm run db:rls` (2 cuentas reales): 0 filas; tampoco borra, ni inserta a nombre de otro, ni se da rol de revisor. También en PGlite | ✅ |
| T3 | Celda con n = 3 | Vitest (4/5/29/30 y n = 3 → `Sin dato` + promedio). En la UI: hoy domingo 4:10, AB con n = 2 → "Sin dato", números en gris, tramos grises | ✅ |
| T4 | 2 reportes → franja oculta | `npm run db:live`: con 2 personas `live_reports_agg()` no devuelve la celda; con la 3ª sí. También PGlite y `tests/live.test.ts` | ✅ |
| T5 | 3 `long_wait` con p50 = 6 | `npm run db:live`: `flag_contradiction` → true, **1** caso (idempotente), `predictions` idéntica antes/después. En la UI: franja "3 pasajeros reportan espera larga" + `en revisión`; el revisor lo confirmó con nota en `/revision` | ✅ |
| T6 | grep de datos de trabajadores | `git grep` sin coincidencias + prueba en Vitest sobre columnas reales de la base | ✅ |
| T7 | Payload del viaje con GPS | Playwright con GPS simulado: cuerpo del POST = exactamente 7 campos, sin lat/lng/trail. Reporte: `{"stop_id":"A","kind":"full"}` | ✅ |
| T8 | Slow 3G | Playwright con CDP (2 s de latencia, 400 kbps): la tarjeta aparece. Subida del viaje: 1ª petición cortada → reintento → "Listo" (2 intentos exactos) | ✅ |
| T9 | p90 ≥ p50 en todas las celdas | `assert` en `train.py` (36/36 con datos reales), pytest, y `CHECK` en la base | ✅ |
| T10 | Borrar un viaje en Mis viajes | Playwright: aparece → Borrar → desaparece. `db:rls`: la fila ya no existe (service role) | ✅ |

## Bugs encontrados

1. **Commit 3, prueba visual**: el tramo con p50 = 9.5 salía verde ("< 10 min") mientras la tarjeta decía "10 min". Arreglado en el mismo commit (el color usa minutos redondeados) + prueba de regresión.
2. **Después del Deploy 2, revisando horarios reales de Rodolfo**: la salida por defecto era siempre "mañana 5:10". Rodolfo se levanta a las 4 am: si abre la app a las 4:15 un viernes, "mañana" es **sábado** y le mostraba el pronóstico de fin de semana en vez del de la 5:10 que está por tomar. Todas las pruebas pasaban porque corrieron de noche. Arreglo: la salida por defecto es la **próxima** 5:10 (hoy si aún no llega, si no mañana). Commit `fix: …` con 3 pruebas (viernes 4:15 → hoy laboral; viernes 6:00 → mañana; domingo 23:00 → mañana lunes).

## Pendiente de la pasada

- Persona test (PACKET §11, capa 1): se hace en un **chat nuevo**; resultados en `docs/PERSONA_LOG.md`.
- Login por correo en producción: requiere agregar `https://llego-sigma.vercel.app/**` a las Redirect URLs de Supabase (las pruebas e2e entran con token de un solo uso y no dependen de eso).
