"""Genera 90 días de viajes SIMULADOS del corredor Atizapán → Metro El Rosario.

Cada fila es un viaje que "registró un pasajero": tramo, tipo de día, hora,
espera, duración, si fue sentado y si llovía. No hay ningún dato de
colectivos ni de quien los maneja.

El número de viajes por celda varía a propósito (poca gente registra a las
4 am en fin de semana; mucha a las 7 en día laboral) para que la app muestre
las tres etiquetas de confianza.

Uso:
    python scripts/simulate_trips.py --out scripts/out/sim_trips.csv   # solo CSV
    python scripts/simulate_trips.py --upload                          # a Supabase
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from common import HOURS, SEGMENT_FROM, SEGMENT_TO, SEGMENTS, TRIP_COLUMNS

SEED = 20260927
START = date(2026, 6, 1)  # fecha fija para que el resultado sea reproducible
MX_OFFSET = timezone(timedelta(hours=-6))

# Viajes registrados esperados por día, hora y tramo (tasa de Poisson).
RATE = {
    "weekday": {4: 0.15, 5: 0.25, 6: 0.8, 7: 1.0, 8: 0.6, 9: 0.3},
    "weekend": {4: 0.03, 5: 0.05, 6: 0.2, 7: 0.3, 8: 0.3, 9: 0.2},
}
SEGMENT_RATE = {"AB": 1.0, "BC": 0.5, "CD": 0.8}

# Espera típica (min) por hora: peor de 5 a 7 am.
BASE_WAIT = {4: 8.0, 5: 11.0, 6: 14.0, 7: 13.0, 8: 9.0, 9: 7.0}
SEGMENT_WAIT = {"AB": 0.0, "BC": -2.0, "CD": 1.5}
BASE_RIDE = {"AB": 14.0, "BC": 12.0, "CD": 16.0}

# Probabilidad de ir sentado: cae en la hora pico y lejos del origen.
BASE_SEAT = {4: 0.70, 5: 0.40, 6: 0.20, 7: 0.15, 8: 0.30, 9: 0.50}
SEGMENT_SEAT = {"AB": 0.10, "BC": -0.05, "CD": -0.10}

RAIN_P = 0.3  # temporada de lluvias
BREAKDOWN_P = 0.06  # por hora y tramo: una descompostura dispara las esperas


def simulate(days: int = 90, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for d in range(days):
        day = START + timedelta(days=d)
        daytype = "weekend" if day.weekday() >= 5 else "weekday"
        rain = bool(rng.random() < RAIN_P)
        for hour in HOURS:
            for seg in SEGMENTS:
                breakdown = rng.random() < BREAKDOWN_P
                spike = rng.uniform(8, 25) if breakdown else 0.0
                n = rng.poisson(RATE[daytype][hour] * SEGMENT_RATE[seg])
                for _ in range(n):
                    typical = BASE_WAIT[hour] + SEGMENT_WAIT[seg]
                    if daytype == "weekend":
                        typical -= 2.0
                    if rain:
                        typical *= 1.4
                    wait = typical * rng.lognormal(0.0, 0.35) + spike
                    ride = BASE_RIDE[seg] * (1.3 if hour in (6, 7, 8) else 1.0)
                    ride *= (1.2 if rain else 1.0) * rng.lognormal(0.0, 0.12)

                    p_seat = BASE_SEAT[hour] + SEGMENT_SEAT[seg]
                    p_seat += 0.2 if daytype == "weekend" else 0.0
                    p_seat -= 0.1 if rain else 0.0
                    p_seat -= 0.1 if breakdown else 0.0
                    seat = bool(rng.random() < min(max(p_seat, 0.02), 0.98))

                    minute = int(rng.integers(0, 60))
                    created = datetime(day.year, day.month, day.day, hour, minute, tzinfo=MX_OFFSET)
                    rows.append(
                        {
                            "stop_from": SEGMENT_FROM[seg],
                            "stop_to": SEGMENT_TO[seg],
                            "daytype": daytype,
                            "hour": hour,
                            "wait_min": round(float(min(wait, 239.0)), 1),
                            "ride_min": round(float(min(ride, 239.0)), 1),
                            "got_seat": seat,
                            "rain": rain,
                            "is_simulated": True,
                            "created_at": created.isoformat(),
                        }
                    )
    df = pd.DataFrame(rows, columns=TRIP_COLUMNS)
    assert df["is_simulated"].all()
    return df


def upload(df: pd.DataFrame) -> None:
    from common import service_client

    sb = service_client()
    # Idempotente: se reemplaza toda la semilla simulada, nunca los viajes reales.
    sb.table("trips").delete().eq("is_simulated", True).execute()
    records = df.to_dict(orient="records")
    for i in range(0, len(records), 500):
        sb.table("trips").insert(records[i : i + 500]).execute()
    print(f"Subidos {len(records)} viajes simulados (is_simulated = true).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--out", help="ruta del CSV de salida")
    ap.add_argument("--upload", action="store_true", help="reemplaza la semilla simulada en Supabase")
    args = ap.parse_args()

    df = simulate(args.days, args.seed)
    print(f"{len(df)} viajes simulados · {df['rain'].mean():.0%} con lluvia")
    if args.out:
        from pathlib import Path

        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(args.out, index=False)
        print(f"CSV: {args.out}")
    if args.upload:
        upload(df)
    if not args.out and not args.upload:
        print("Nada que hacer: usa --out y/o --upload.")


if __name__ == "__main__":
    main()
