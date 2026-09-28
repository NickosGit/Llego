import type { ConfidenceLevel } from "@/lib/confidence";
import { displayTime, minutes, percent, type Forecast } from "@/lib/forecast";

const PILL: Record<ConfidenceLevel, string> = {
  good: "bg-green-100 text-green-900",
  low: "bg-gray-200 text-gray-800",
  none: "bg-gray-200 text-gray-600",
};

export function ConfidencePill({ level, label }: { level: ConfidenceLevel; label: string }) {
  return (
    <span data-testid="confidence-pill" className={`rounded-full px-4 py-1.5 text-base font-bold ${PILL[level]}`}>
      {label}
    </span>
  );
}

export function ForecastCard({
  forecast,
  time,
  weekdayName,
}: {
  forecast: Forecast;
  time: string;
  weekdayName: string;
}) {
  const grey = forecast.isFallback;
  return (
    <section
      data-testid="forecast-card"
      aria-live="polite"
      className="rounded-3xl bg-card p-5 shadow-sm"
    >
      <p className="text-lg text-muted">
        Salida {displayTime(time)} · {weekdayName}
      </p>
      <div className={grey ? "text-gray-400" : ""}>
        <p className="mt-1 text-4xl font-extrabold leading-tight">
          Espera típica: {minutes(forecast.waitP50)}
        </p>
        <p className={`mt-1 text-xl ${grey ? "" : "text-muted"}`}>
          Día malo: hasta {minutes(forecast.waitP90)}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xl ${grey ? "text-gray-400" : ""}`}>
          <span aria-hidden>🪑 </span>Ir sentado: <strong>{percent(forecast.seatProb)}</strong>
        </p>
        <ConfidencePill level={forecast.confidence.level} label={forecast.confidence.label} />
      </div>
      {grey && (
        <p className="mt-3 text-base text-muted">
          Casi nadie ha registrado viajes a esta hora. Mostramos el promedio de todo el corredor, en gris.
        </p>
      )}
    </section>
  );
}
