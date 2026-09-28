"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { STOPS, stopById, type StopId } from "@/config/corridor";
import { daytypeOf, mexicoDate, mexicoHour } from "@/lib/forecast";
import { setConsent, useGpsConsent } from "@/lib/gps-consent";
import { createClient } from "@/lib/supabase/client";
import {
  durations,
  initialTrip,
  minutesBetween,
  tripReducer,
  type TripEvent,
  type TripPayload,
  type TripState,
} from "@/lib/trip";
import { uploadTrip, type Insert } from "@/lib/trip-upload";

const insertTrip: Insert = async (p) => {
  const { error } = await createClient().from("trips").insert(p);
  return { error };
};

type Result = "sent" | "pending" | "rejected";
type Finished = { wait_min: number; ride_min: number; startedAt: number };

const big = "w-full rounded-2xl py-5 text-2xl font-extrabold";
const selectClass = "w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-lg font-semibold";

function clock(ms: number) {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function payloadFor(from: StopId, to: StopId, f: Finished, gotSeat: boolean): TripPayload {
  const at = new Date(f.startedAt);
  return {
    stop_from: from,
    stop_to: to,
    daytype: daytypeOf(mexicoDate(at).weekday),
    hour: mexicoHour(at),
    wait_min: f.wait_min,
    ride_min: f.ride_min,
    got_seat: gotSeat,
  };
}

// ─────────────────────────────────────────────────────────── consentimiento ──

function ConsentScreen({ onManual }: { onManual: () => void }) {
  return (
    <section data-testid="gps-consent" className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-sm">
      <h2 className="text-2xl font-extrabold">Antes de usar tu ubicación</h2>
      <p className="text-2xl font-bold leading-snug">
        Guardamos cuánto esperaste y cuánto tardaste. No guardamos tu recorrido.
      </p>
      <p className="text-lg text-muted">
        El GPS solo funciona entre “Empezar” y “Terminar”. Tu teléfono calcula los minutos y borra el recorrido; a
        nosotros solo nos llegan las paradas y los minutos.
      </p>
      <button type="button" onClick={() => setConsent("yes")} className={`${big} bg-navy text-white`}>
        Acepto
      </button>
      <button
        type="button"
        onClick={() => {
          setConsent("no");
          onManual();
        }}
        className={`${big} border-2 border-navy text-navy`}
      >
        Ahora no
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── asiento ──

function SeatQuestion({ onAnswer, busy }: { onAnswer: (seat: boolean) => void; busy: boolean }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
      <h2 className="text-2xl font-extrabold">¿Fuiste sentado?</h2>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={() => onAnswer(true)} className={`${big} bg-navy text-white`}>
          Sí
        </button>
        <button type="button" disabled={busy} onClick={() => onAnswer(false)} className={`${big} border-2 border-navy text-navy`}>
          No
        </button>
      </div>
    </section>
  );
}

function ResultMessage({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const text = {
    sent: "Listo. Tu viaje cuenta en el próximo cálculo del pronóstico.",
    pending: "No hay señal. Guardamos el viaje en tu teléfono y lo mandamos la próxima vez que abras ¿Llego?.",
    rejected: "No pudimos guardar ese viaje. Revisa las horas e intenta otra vez.",
  }[result];
  return (
    <section role="status" data-testid="trip-result" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
      <p className="text-2xl font-bold leading-snug">{text}</p>
      <Link href="/mis-viajes" className={`${big} bg-navy text-center text-white`}>
        Ver mis viajes
      </Link>
      <button type="button" onClick={onAgain} className="text-lg font-semibold text-navy underline">
        Registrar otro
      </button>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────── GPS ──

function GpsTrip({
  from,
  to,
  onFinished,
  onUnavailable,
}: {
  from: StopId;
  to: StopId;
  onFinished: (f: Finished) => void;
  onUnavailable: (why: string) => void;
}) {
  const [trip, setTrip] = useState(() => initialTrip(from, to));
  // Copia sincrónica del estado para el callback del GPS (que vive fuera de React).
  const tripRef = useRef<TripState>(trip);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const watchId = useRef<number | null>(null);

  function stopWatch() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }

  useEffect(() => stopWatch, []);

  useEffect(() => {
    if (trip.phase !== "waiting" && trip.phase !== "riding") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [trip.phase]);

  function dispatch(e: TripEvent) {
    const next = tripReducer(tripRef.current, e);
    tripRef.current = next;
    setTrip(next);
    // Al llegar al destino se apaga el GPS solo.
    if (next.phase === "arrived") finish();
  }

  function start() {
    if (!("geolocation" in navigator)) {
      onUnavailable("Este teléfono no tiene GPS disponible en el navegador.");
      return;
    }
    dispatch({ type: "start", t: Date.now() });
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        dispatch({
          type: "fix",
          fix: { t: pos.timestamp, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stopWatch();
          dispatch({ type: "reset" });
          onUnavailable("No diste permiso de ubicación. Puedes registrar el viaje a mano.");
        } else {
          setNotice("Buscando señal de GPS…");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }

  function finish() {
    const current = tripRef.current;
    const end = Date.now();
    const d = durations(current, end);
    const startedAt = current.startedAt ?? end;
    // Terminar: se apaga el GPS y se borra el recorrido de memoria ANTES de subir nada.
    stopWatch();
    dispatch({ type: "reset" });
    if (!d) {
      setNotice("No registramos que te subieras, así que no guardamos nada.");
      return;
    }
    onFinished({ ...d, startedAt });
  }

  if (trip.phase === "idle") {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-xl">
          Toca <strong>Empezar</strong> cuando llegues a la parada <strong>{stopById(from).name}</strong>.
        </p>
        {notice && <p role="status" className="text-lg text-muted">{notice}</p>}
        <button type="button" onClick={start} className={`${big} bg-navy text-white`}>
          Empezar
        </button>
      </section>
    );
  }

  const waiting = trip.phase === "waiting";
  const since = waiting ? trip.startedAt : trip.boardedAt;
  return (
    <section data-testid="trip-live" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
      <p className="text-lg text-muted">{waiting ? `Esperando en ${stopById(from).name}` : `En camino a ${stopById(to).name}`}</p>
      <p className="text-5xl font-extrabold tabular-nums" aria-live="off">
        {clock(Math.max(0, now - (since ?? now)))}
      </p>
      <p className="text-base text-muted">GPS encendido solo en este viaje. El recorrido no sale de tu teléfono.</p>
      {notice && <p role="status" className="text-lg text-muted">{notice}</p>}
      {waiting && (
        <button type="button" onClick={() => dispatch({ type: "boarded", t: Date.now() })} className={`${big} bg-navy text-white`}>
          Ya me subí
        </button>
      )}
      <button type="button" onClick={finish} className={`${big} border-2 border-navy text-navy`}>
        Terminar
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── manual ──

function ManualTrip({ onFinished }: { onFinished: (f: Finished) => void }) {
  const [arrived, setArrived] = useState("05:10");
  const [boarded, setBoarded] = useState("05:22");
  const [ride, setRide] = useState(40);
  const wait = minutesBetween(arrived, boarded);
  const valid = wait <= 180;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Hoy, a la hora en que llegó a la parada. CDMX es UTC-6 todo el año (sin horario de verano desde 2022).
    const today = mexicoDate(new Date()).date;
    const [h, m] = arrived.split(":").map(Number);
    const startedAt = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h + 6, m);
    onFinished({ wait_min: wait, ride_min: ride, startedAt });
  }

  return (
    <form onSubmit={submit} data-testid="manual-trip" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
      <h2 className="text-2xl font-extrabold">Registrar a mano</h2>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        Llegué a la parada
        <input type="time" required value={arrived} onChange={(e) => setArrived(e.target.value)} className={selectClass} />
      </label>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        Me subí
        <input type="time" required value={boarded} onChange={(e) => setBoarded(e.target.value)} className={selectClass} />
      </label>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        ¿Cuánto duró el viaje?
        <select value={ride} onChange={(e) => setRide(Number(e.target.value))} className={selectClass}>
          {Array.from({ length: 24 }, (_, i) => (i + 1) * 5).map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <p className={`text-lg ${valid ? "" : "text-red-700"}`}>
        {valid ? `Esperaste ${wait} min.` : "Revisa las horas: la espera sale de más de 3 horas."}
      </p>
      <button type="submit" disabled={!valid} className={`${big} bg-navy text-white disabled:opacity-50`}>
        Seguir
      </button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────── página ──

export function TripLogger({ initialFrom, initialTo }: { initialFrom: StopId; initialTo: StopId }) {
  const consent = useGpsConsent();
  const [from, setFrom] = useState<StopId>(initialFrom);
  const [to, setTo] = useState<StopId>(initialTo);
  const [manual, setManual] = useState(false);
  const [gpsProblem, setGpsProblem] = useState("");
  const [finished, setFinished] = useState<Finished | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function answerSeat(gotSeat: boolean) {
    if (!finished) return;
    setBusy(true);
    setResult(await uploadTrip(payloadFor(from, to, finished, gotSeat), insertTrip));
    setBusy(false);
  }

  function again() {
    setFinished(null);
    setResult(null);
  }

  if (result) return <ResultMessage result={result} onAgain={again} />;
  if (finished) return <SeatQuestion onAnswer={answerSeat} busy={busy} />;
  if (consent === "loading") return null;

  const useManual = manual || consent === "no" || Boolean(gpsProblem);
  const fromSeq = stopById(from).seq;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-base font-semibold text-muted">
          Desde
          <select
            className={selectClass}
            value={from}
            onChange={(e) => {
              const next = e.target.value as StopId;
              setFrom(next);
              if (stopById(to).seq <= stopById(next).seq) setTo("D");
            }}
          >
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
            {STOPS.filter((s) => s.seq > fromSeq).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {gpsProblem && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-lg text-amber-900">
          {gpsProblem}
        </p>
      )}

      {consent === null && !manual ? (
        <ConsentScreen onManual={() => setManual(true)} />
      ) : useManual ? (
        <>
          <ManualTrip onFinished={setFinished} />
          {consent === "no" && (
            <button type="button" onClick={() => setConsent("yes")} className="text-lg font-semibold text-navy underline">
              Mejor usar GPS
            </button>
          )}
        </>
      ) : (
        <>
          <GpsTrip key={`${from}${to}`} from={from} to={to} onFinished={setFinished} onUnavailable={setGpsProblem} />
          <button type="button" onClick={() => setManual(true)} className="text-lg font-semibold text-navy underline">
            Registrar a mano
          </button>
        </>
      )}
    </div>
  );
}
