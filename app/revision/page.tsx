import { redirect } from "next/navigation";

import { STOPS } from "@/config/corridor";
import { TopNav } from "@/components/TopNav";
import { isReviewer, REASON_TEXT, STATUS_TEXT } from "@/lib/reviewer";
import { createClient } from "@/lib/supabase/server";

import { resolveCase } from "./actions";

type Case = {
  id: string;
  stop_id: string;
  window_start: string;
  reason: string;
  forecast_p50: number;
  report_count: number;
  status: string;
  reviewer_note: string | null;
  reviewed_at: string | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

const stopName = (id: string) => STOPS.find((s) => s.id === id)?.name ?? id;

/**
 * Cola de revisión: solo para el rol `reviewer`. Solo confirmar, descartar y
 * anotar la causa. No hay acciones de sanción ni de despacho, y nada aquí
 * identifica colectivos ni a quien los maneja: los casos son de parada y hora.
 */
export default async function RevisionPage() {
  const supabase = await createClient();
  if (!(await isReviewer(supabase))) redirect("/corredor");

  const { data } = await supabase
    .from("review_cases")
    .select("id, stop_id, window_start, reason, forecast_p50, report_count, status, reviewer_note, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const cases = (data ?? []) as Case[];
  const open = cases.filter((c) => c.status === "open");
  const closed = cases.filter((c) => c.status !== "open");

  return (
    <main className="flex flex-1 flex-col gap-4 pt-3">
      <TopNav reviewer />
      <h1 className="text-3xl font-extrabold">Revisión</h1>
      <p className="text-base text-muted">
        Casos donde lo que reportan los pasajeros no cuadra con el pronóstico. El pronóstico no cambia solo: aquí decides si
        el reporte es cierto y anotas la causa.
      </p>

      <h2 className="text-xl font-bold">Abiertos ({open.length})</h2>
      {open.length === 0 && <p className="text-lg text-muted">No hay casos abiertos.</p>}
      {open.map((c) => (
        <article key={c.id} data-testid="review-case" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm">
          <p className="text-sm text-muted">
            {stopName(c.stop_id)} · bloque desde {fmt(c.window_start)}
          </p>
          <p className="text-lg">{REASON_TEXT[c.reason] ?? c.reason}</p>
          <p className="text-base text-muted">
            Pronóstico típico: {Math.round(c.forecast_p50)} min · {c.report_count} personas
          </p>
          <form action={resolveCase} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={c.id} />
            <label className="flex flex-col gap-1 text-base font-semibold">
              Nota (causa, opcional)
              <textarea
                name="note"
                maxLength={500}
                rows={2}
                placeholder="Ej.: lluvia fuerte, cierre en la avenida"
                className="rounded-xl border-2 border-gray-300 bg-white p-3 text-lg font-normal"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                name="status"
                value="confirmed"
                className="rounded-2xl bg-navy py-3 text-lg font-extrabold text-white"
              >
                Confirmar
              </button>
              <button
                name="status"
                value="dismissed"
                className="rounded-2xl border-2 border-navy py-3 text-lg font-extrabold text-navy"
              >
                Descartar
              </button>
            </div>
          </form>
        </article>
      ))}

      {closed.length > 0 && (
        <>
          <h2 className="text-xl font-bold">Revisados</h2>
          <ul className="flex flex-col gap-2">
            {closed.map((c) => (
              <li key={c.id} className="rounded-2xl bg-card p-4 text-base shadow-sm">
                <strong>{STATUS_TEXT[c.status]}</strong> · {stopName(c.stop_id)} · {fmt(c.window_start)}
                {c.reviewer_note && <p className="text-muted">“{c.reviewer_note}”</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
