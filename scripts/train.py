"""Entrena el modelo por lotes y escribe la tabla `predictions`.

- Espera: GradientBoostingRegressor con pérdida cuantil, alpha 0.5 (típica) y
  0.9 (día malo).
- Asiento: GradientBoostingClassifier.
- Variables: tramo, tipo de día, hora, lluvia.

Escribe una fila por (tramo, tipo de día, hora) con n_obs y model_version. Las
predicciones se calculan para un día SIN lluvia (el caso por defecto que ve
Rodolfo); la lluvia entra al entrenamiento para que no contamine ese caso.

Fuerza wait_p90 >= wait_p50 tomando el máximo, y lo comprueba (T9).

Uso:
    python scripts/train.py --csv scripts/out/sim_trips.csv --dry-run   # local
    python scripts/train.py                                             # Supabase
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor

from common import DAYTYPES, HOURS, SEGMENTS, STOP_TO_SEGMENT

MODEL_NAME = "gbr-quantile-v1"
GBR_PARAMS = dict(n_estimators=200, max_depth=3, learning_rate=0.05, min_samples_leaf=5, random_state=0)


def features(df: pd.DataFrame) -> np.ndarray:
    return np.column_stack(
        [
            df["segment"].map({s: i for i, s in enumerate(SEGMENTS)}).to_numpy(),
            (df["daytype"] == "weekend").astype(int).to_numpy(),
            df["hour"].astype(int).to_numpy(),
            df["rain"].astype(int).to_numpy(),
        ]
    )


def prepare(trips: pd.DataFrame) -> pd.DataFrame:
    """La espera de un viaje se atribuye al tramo que empieza en su parada de origen."""
    df = trips.copy()
    df["segment"] = df["stop_from"].map(STOP_TO_SEGMENT)
    df = df.dropna(subset=["segment"])
    df["rain"] = df.get("rain", False)
    df["rain"] = df["rain"].fillna(False).astype(bool)
    df["got_seat"] = df["got_seat"].astype(bool)
    df["wait_min"] = df["wait_min"].astype(float)
    df["hour"] = df["hour"].astype(int)
    return df


def train(trips: pd.DataFrame, version: str | None = None) -> pd.DataFrame:
    df = prepare(trips)
    if len(df) < 20:
        raise SystemExit(f"Muy pocos viajes para entrenar ({len(df)}).")

    X = features(df)
    y_wait = df["wait_min"].to_numpy()
    q50 = GradientBoostingRegressor(loss="quantile", alpha=0.5, **GBR_PARAMS).fit(X, y_wait)
    q90 = GradientBoostingRegressor(loss="quantile", alpha=0.9, **GBR_PARAMS).fit(X, y_wait)

    y_seat = df["got_seat"].astype(int).to_numpy()
    seat_model = None
    if len(np.unique(y_seat)) > 1:
        seat_model = GradientBoostingClassifier(**GBR_PARAMS).fit(X, y_seat)

    grid = pd.DataFrame(
        [(s, d, h, False) for s in SEGMENTS for d in DAYTYPES for h in HOURS],
        columns=["segment", "daytype", "hour", "rain"],
    )
    Xg = features(grid)
    p50 = np.clip(q50.predict(Xg), 0, None)
    p90 = np.maximum(q90.predict(Xg), p50)  # cuantiles pueden cruzarse: p90 = max(p90, p50)
    seat = seat_model.predict_proba(Xg)[:, 1] if seat_model else np.full(len(grid), y_seat.mean())

    counts = df.groupby(["segment", "daytype", "hour"]).size()
    version = version or f"{MODEL_NAME}-{datetime.now(timezone.utc):%Y%m%d%H%M}"

    out = grid.drop(columns=["rain"]).copy()
    out["wait_p50"] = np.round(p50, 1)
    out["wait_p90"] = np.round(p90, 1)
    # Redondear puede volver a cruzarlos por una décima: se repite el máximo.
    out["wait_p90"] = np.maximum(out["wait_p90"], out["wait_p50"])
    out["seat_prob"] = np.round(np.clip(seat, 0, 1), 3)
    out["n_obs"] = [int(counts.get((s, d, h), 0)) for s, d, h in zip(out.segment, out.daytype, out.hour)]
    out["model_version"] = version
    out["is_simulated"] = bool(trips.get("is_simulated", pd.Series([True])).any())

    # T9: sanidad del modelo en TODAS las celdas.
    bad = out[out["wait_p90"] < out["wait_p50"]]
    assert bad.empty, f"p90 < p50 en {len(bad)} celdas:\n{bad}"
    return out


def load_from_supabase() -> pd.DataFrame:
    from common import service_client

    sb = service_client()
    rows, page = [], 1000
    for start in range(0, 1_000_000, page):
        chunk = (
            sb.table("trips")
            .select("stop_from, stop_to, daytype, hour, wait_min, got_seat, rain, is_simulated")
            .range(start, start + page - 1)
            .execute()
            .data
        )
        rows.extend(chunk)
        if len(chunk) < page:
            break
    return pd.DataFrame(rows)


def write_to_supabase(preds: pd.DataFrame) -> None:
    from common import service_client

    sb = service_client()
    records = preds.to_dict(orient="records")
    sb.table("predictions").upsert(records, on_conflict="segment,daytype,hour").execute()
    purged = sb.rpc("purge_old_reports").execute().data
    print(f"Escritas {len(records)} predicciones · reportes >30 días borrados: {purged}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", help="entrenar desde un CSV en vez de Supabase")
    ap.add_argument("--dry-run", action="store_true", help="no escribir en Supabase")
    args = ap.parse_args()

    trips = pd.read_csv(args.csv) if args.csv else load_from_supabase()
    preds = train(trips)

    pd.set_option("display.width", 140)
    print(preds.drop(columns=["model_version", "is_simulated"]).to_string(index=False))
    print(f"\nT9 OK: p90 >= p50 en las {len(preds)} celdas · modelo {preds.model_version.iloc[0]}")
    if not args.dry_run:
        write_to_supabase(preds)


if __name__ == "__main__":
    main()
