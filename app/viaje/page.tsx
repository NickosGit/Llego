import { DEFAULT_FROM, DEFAULT_TO, STOPS, type StopId } from "@/config/corridor";
import { PendingTrips } from "@/components/PendingTrips";
import { TopNav } from "@/components/TopNav";
import { TripLogger } from "@/components/TripLogger";

const isStop = (v: unknown): v is StopId => typeof v === "string" && STOPS.some((s) => s.id === v);

export default async function ViajePage({ searchParams }: PageProps<"/viaje">) {
  const q = await searchParams;
  const from = isStop(q.from) ? q.from : DEFAULT_FROM;
  const to = isStop(q.to) && STOPS.find((s) => s.id === q.to)!.seq > STOPS.find((s) => s.id === from)!.seq ? q.to : DEFAULT_TO;

  return (
    <main className="flex flex-1 flex-col gap-4 pt-3">
      <TopNav />
      <h1 className="text-3xl font-extrabold">Registrar mi viaje</h1>
      <TripLogger initialFrom={from} initialTo={to} />
      <PendingTrips />
    </main>
  );
}
