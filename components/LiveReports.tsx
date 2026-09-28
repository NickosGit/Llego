"use client";

import { useEffect, useState } from "react";

import { stopById, type StopId } from "@/config/corridor";
import { REPORT_BUTTONS, reportErrorMessage, stripState, type LiveAgg, type ReportKind } from "@/lib/live";
import { createClient } from "@/lib/supabase/client";

type Notice = { tone: "ok" | "error"; text: string } | null;

/** Agregados de la parada + si hay caso abierto. null si no hay señal. */
async function loadLive(stop: StopId): Promise<{ rows: LiveAgg[]; inReview: boolean } | null> {
  try {
    const sb = createClient();
    const [agg, flag] = await Promise.all([
      sb.rpc("live_reports_agg"),
      sb.rpc("flag_contradiction", { p_stop_id: stop }),
    ]);
    return {
      rows: agg.error ? [] : ((agg.data as LiveAgg[]) ?? []),
      inReview: !flag.error && Boolean(flag.data),
    };
  } catch {
    return null; // Sin señal: la franja simplemente no aparece.
  }
}

/**
 * Reportes rápidos + franja con lo que reportan otros en la parada de subida.
 * Solo se leen agregados (≥ 3 personas). El pronóstico de arriba no cambia
 * nunca por esto: si hay contradicción, la base abre un caso para una persona.
 */
export function LiveReports({ stop }: { stop: StopId }) {
  const [rows, setRows] = useState<LiveAgg[]>([]);
  const [inReview, setInReview] = useState(false);
  const [sending, setSending] = useState<ReportKind | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function refresh() {
    const live = await loadLive(stop);
    if (live) {
      setRows(live.rows);
      setInReview(live.inReview);
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadLive(stop).then((live) => {
      if (cancelled || !live) return;
      setRows(live.rows);
      setInReview(live.inReview);
    });
    return () => {
      cancelled = true;
    };
  }, [stop]);

  async function report(kind: ReportKind) {
    setSending(kind);
    setNotice(null);
    // Solo stop_id y kind: la base pone quién y cuándo.
    const { error } = await createClient().from("reports").insert({ stop_id: stop, kind });
    setSending(null);
    if (error) {
      setNotice({ tone: "error", text: reportErrorMessage(error.message) });
      return;
    }
    setNotice({ tone: "ok", text: "Gracias. Se muestra cuando al menos 3 personas reportan lo mismo." });
    void refresh();
  }

  const strip = stripState(rows, stop, inReview);

  return (
    <section className="flex flex-col gap-3" aria-label="Reportes en vivo">
      {strip.visible && (
        <div
          data-testid="live-strip"
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
        >
          <div className="text-lg leading-snug">
            {strip.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          {strip.inReview && (
            <span
              data-testid="in-review"
              className="shrink-0 rounded-lg bg-warn px-3 py-1 text-base font-extrabold text-white"
            >
              en revisión
            </span>
          )}
        </div>
      )}

      <h2 className="text-lg font-bold">¿Qué pasa ahora en {stopById(stop).name}?</h2>
      <div className="grid grid-cols-3 gap-2">
        {REPORT_BUTTONS.map((b) => (
          <button
            key={b.kind}
            type="button"
            onClick={() => report(b.kind)}
            disabled={sending !== null}
            className="min-h-16 rounded-2xl border-2 border-navy bg-white px-1 text-base font-bold leading-tight text-navy active:bg-navy active:text-white disabled:opacity-50"
          >
            {sending === b.kind ? "…" : b.label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className={`text-base ${notice.tone === "ok" ? "text-green-800" : "text-red-700"}`}>
          {notice.text}
        </p>
      )}
    </section>
  );
}
