import Link from "next/link";

import { STOPS } from "@/config/corridor";
import { PendingTrips } from "@/components/PendingTrips";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";

import { deleteTrip } from "./actions";
import { DeleteTripButton } from "./DeleteTripButton";

type Trip = {
  id: string;
  stop_from: string;
  stop_to: string;
  wait_min: number;
  ride_min: number;
  got_seat: boolean;
  created_at: string;
};

const stopName = (id: string) => STOPS.find((s) => s.id === id)?.name ?? id;
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

/** Mis viajes: solo los propios (RLS), con borrar por viaje. */
export default async function MisViajesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("id, stop_from, stop_to, wait_min, ride_min, got_seat, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const trips = (data ?? []) as Trip[];

  return (
    <main className="flex flex-1 flex-col gap-4 pt-3">
      <TopNav />
      <h1 className="text-3xl font-extrabold">Mis viajes</h1>
      <p className="text-base text-muted">
        Solo tú ves esta lista. Guardamos paradas y minutos, nunca tu recorrido. Si borras un viaje, deja de contar en el
        siguiente cálculo del pronóstico.
      </p>
      {trips.length === 0 ? (
        <p className="text-lg">Todavía no registras viajes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((t) => (
            <li key={t.id} data-testid="my-trip" className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-sm">
              <div>
                <p className="text-sm text-muted">{fmt(t.created_at)}</p>
                <p className="text-lg font-bold">
                  {stopName(t.stop_from)} → {stopName(t.stop_to)}
                </p>
                <p className="text-base">
                  Esperaste {Math.round(t.wait_min)} min · viaje {Math.round(t.ride_min)} min · {t.got_seat ? "sentado" : "de pie"}
                </p>
              </div>
              <form action={deleteTrip}>
                <input type="hidden" name="id" value={t.id} />
                <DeleteTripButton />
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href="/viaje" className="mt-2 rounded-2xl bg-navy py-5 text-center text-2xl font-extrabold text-white">
        Registrar mi viaje
      </Link>
      <PendingTrips />
    </main>
  );
}
