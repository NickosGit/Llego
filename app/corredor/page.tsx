import { STOPS } from "@/config/corridor";

/** Pantalla del corredor. El pronóstico llega en el commit 3. */
export default function CorredorPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 pt-6">
      <h1 className="text-3xl font-extrabold leading-tight">¿Llego? Atizapán → El Rosario</h1>
      <ol className="space-y-2 text-lg">
        {STOPS.map((s) => (
          <li key={s.id}>
            {s.id} · {s.name}
          </li>
        ))}
      </ol>
    </main>
  );
}
