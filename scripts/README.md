# scripts/

Aquí, y **solo aquí**, se usa la service role de Supabase (`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`). La app nunca la ve.

Todo se corre desde la raíz del repo (`llego/`).

## 0. Una sola vez: entorno de Python

```powershell
# Windows (PowerShell)
py -3.12 -m venv scripts/.venv        # o: python -m venv scripts/.venv
scripts/.venv/Scripts/python -m pip install -r scripts/requirements.txt
```

```bash
# macOS / Linux
python3 -m venv scripts/.venv
scripts/.venv/bin/python -m pip install -r scripts/requirements.txt
```

En los comandos de abajo, `PY` es `scripts/.venv/Scripts/python` (Windows) o `scripts/.venv/bin/python` (macOS/Linux).

## 1. Base de datos

1. Aplica `supabase/migrations/001_init.sql` en Supabase → SQL Editor → pegar → Run.
2. Copia las paradas de `config/corridor.ts` a la tabla `stops`:

   ```
   npm run db:stops
   ```

## 2. Datos simulados + modelo

```
PY scripts/simulate_trips.py --out scripts/out/sim_trips.csv --upload
PY scripts/train.py
```

- `simulate_trips.py`: 90 días × laboral/fin de semana × horas 4–9 × 3 tramos, semilla fija, `is_simulated = true`. `--upload` **reemplaza** la semilla simulada y nunca toca los viajes reales.
- `train.py`: lee todos los `trips` (simulados + registrados), entrena los cuantiles p50/p90 y el clasificador de asiento, escribe `predictions` y borra reportes con más de 30 días. Falla si alguna celda queda con p90 < p50 (T9).

Sin Supabase (solo local):

```
PY scripts/simulate_trips.py --out scripts/out/sim_trips.csv
PY scripts/train.py --csv scripts/out/sim_trips.csv --dry-run
```

## 3. Pruebas

```
PY -m pytest scripts            # simulador + modelo, T9 (sin red)
npm run db:rls                  # T2 contra Supabase real, con 2 cuentas de prueba *.llego.test
```

## 4. Rol de revisor

La persona tiene que haber entrado una vez a la app. Luego:

```
npm run db:reviewer -- correo@ejemplo.com
npm run db:reviewer -- correo@ejemplo.com --quitar
```
