import Link from "next/link";

/** Navegación mínima: pocas opciones, grandes, arriba a la derecha. */
export function TopNav({ reviewer = false }: { reviewer?: boolean }) {
  return (
    <nav className="flex flex-wrap items-center justify-end gap-x-4 text-base font-semibold text-navy">
      <Link href="/corredor" className="py-2 underline-offset-4 hover:underline">
        Pronóstico
      </Link>
      <Link href="/mis-viajes" className="py-2 underline-offset-4 hover:underline">
        Mis viajes
      </Link>
      {reviewer && (
        <Link href="/revision" className="py-2 underline-offset-4 hover:underline">
          Revisión
        </Link>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="min-h-0 py-2 text-muted underline-offset-4 hover:underline">
          Salir
        </button>
      </form>
    </nav>
  );
}
