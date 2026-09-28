import Link from "next/link";

/** Portada pública: la única pantalla que no pide sesión. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col gap-6 pt-8">
      <h1 className="text-4xl font-extrabold leading-tight">¿Llego?</h1>
      <p className="text-xl leading-snug">
        Cuánto vas a esperar el colectivo de <strong>Atizapán</strong> a{" "}
        <strong>Metro El Rosario</strong>, a la hora que sales, y si vas a ir sentado.
      </p>
      <ul className="space-y-3 text-lg text-muted">
        <li>• Espera típica y en un día malo, con cuánto dato la respalda.</li>
        <li>• Solo promedios de rutas y horas. Nunca se sigue a ningún colectivo ni a quien lo maneja.</li>
        <li>• Tu ubicación solo se usa si tú lo activas, y el recorrido no sale de tu teléfono.</li>
      </ul>
      <Link
        href="/corredor"
        className="mt-auto rounded-2xl bg-navy py-5 text-center text-2xl font-extrabold text-white"
      >
        Ver mi corredor
      </Link>
    </main>
  );
}
