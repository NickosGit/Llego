"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_FROM,
  DEFAULT_TO,
  SEGMENTS,
  STOPS,
  stopById,
  type SegmentId,
  type StopId,
} from "@/config/corridor";
import {
  DEFAULT_DEPARTURE,
  decodeDeparture,
  departureTimes,
  displayTime,
  encodeDeparture,
  findPrediction,
  forecastFor,
  mexicoDate,
  resolveDeparture,
  toneFor,
  weekdayName,
  type Departure,
  type SegmentTone,
} from "@/lib/forecast";
import type { Prediction } from "@/lib/types";
import { usePredictions } from "@/lib/use-predictions";

import { CorridorMap, MapLegend } from "./CorridorMap";
import { ForecastCard } from "./ForecastCard";

const selectClass =
  "w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-lg font-semibold text-foreground";

export function CorridorView({
  initial,
  nowIso,
  children,
}: {
  initial: Prediction[] | null;
  nowIso: string;
  children?: React.ReactNode;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [from, setFrom] = useState<StopId>(DEFAULT_FROM);
  const [to, setTo] = useState<StopId>(DEFAULT_TO);
  const [departure, setDeparture] = useState<Departure>(DEFAULT_DEPARTURE);
  const { preds, source, savedAt } = usePredictions(initial);

  const { daytype, hour, weekdayName: dayName } = resolveDeparture(departure, now);
  const forecast = preds ? forecastFor(preds, from, to, daytype, hour) : null;

  const tones = useMemo(() => {
    const t = {} as Record<SegmentId, SegmentTone>;
    for (const s of SEGMENTS) t[s.id] = toneFor(preds ? findPrediction(preds, s.id, daytype, hour) : undefined);
    return t;
  }, [preds, daytype, hour]);

  const fromSeq = stopById(from).seq;
  const destinations = STOPS.filter((s) => s.seq > fromSeq);

  function changeFrom(next: StopId) {
    setFrom(next);
    if (stopById(to).seq <= stopById(next).seq) setTo(DEFAULT_TO);
  }

  const today = weekdayName(mexicoDate(now).weekday);
  const tomorrow = weekdayName(mexicoDate(now, 1).weekday);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold leading-tight">
        ¿Llego? {stopById(from).name} → {stopById(to).name.replace(/^Metro /, "")}
      </h1>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-base font-semibold text-muted">
          Desde
          <select className={selectClass} value={from} onChange={(e) => changeFrom(e.target.value as StopId)}>
            {STOPS.slice(0, -1).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-base font-semibold text-muted">
          Hasta
          <select className={selectClass} value={to} onChange={(e) => setTo(e.target.value as StopId)}>
            {destinations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-base font-semibold text-muted">
          Salida
          <select
            className={selectClass}
            value={encodeDeparture(departure)}
            onChange={(e) => setDeparture(decodeDeparture(e.target.value))}
          >
            <optgroup label={`Mañana · ${tomorrow}`}>
              {departureTimes().map((t) => (
                <option key={`m${t}`} value={encodeDeparture({ day: "manana", time: t })}>
                  mañana {displayTime(t)}
                </option>
              ))}
            </optgroup>
            <optgroup label={`Hoy · ${today}`}>
              {departureTimes().map((t) => (
                <option key={`h${t}`} value={encodeDeparture({ day: "hoy", time: t })}>
                  hoy {displayTime(t)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <CorridorMap tones={tones} />
      <MapLegend />

      {source === "cache" && savedAt && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
          Sin conexión: mostramos el último pronóstico guardado (
          {new Date(savedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}).
        </p>
      )}

      {forecast ? (
        <ForecastCard forecast={forecast} time={departure.time} weekdayName={dayName} />
      ) : (
        <p role="status" className="rounded-3xl bg-card p-5 text-lg shadow-sm">
          {preds
            ? "No hay pronóstico para ese tramo."
            : "Todavía no hay pronóstico. Si tienes mala señal, intenta de nuevo en un momento."}
        </p>
      )}

      {children}
    </div>
  );
}
