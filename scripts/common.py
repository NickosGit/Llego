"""Constantes y conexión compartidas por los scripts de ¿Llego?.

Los IDs de paradas y tramos son estables; las coordenadas y nombres viven solo
en config/corridor.ts (ver scripts/sync_stops.ts).
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEGMENTS = ["AB", "BC", "CD"]
SEGMENT_FROM = {"AB": "A", "BC": "B", "CD": "C"}
SEGMENT_TO = {"AB": "B", "BC": "C", "CD": "D"}
STOP_TO_SEGMENT = {v: k for k, v in SEGMENT_FROM.items()}
DAYTYPES = ["weekday", "weekend"]
HOURS = [4, 5, 6, 7, 8, 9]

# Columnas que se permiten en un viaje. Ninguna identifica a un trabajador.
TRIP_COLUMNS = [
    "stop_from",
    "stop_to",
    "daytype",
    "hour",
    "wait_min",
    "ride_min",
    "got_seat",
    "rain",
    "is_simulated",
    "created_at",
]


def service_client():
    """Cliente con la service role. SOLO para scripts: nunca en la app."""
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local"
        )
    return create_client(url, key)
