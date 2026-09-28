import { CorridorView } from "@/components/CorridorView";
import { TopNav } from "@/components/TopNav";
import { isReviewer } from "@/lib/reviewer";
import { createClient } from "@/lib/supabase/server";
import { PREDICTION_COLUMNS, type Prediction } from "@/lib/types";

export default async function CorredorPage() {
  const supabase = await createClient();
  // Son 36 filas: se traen todas y el cambio de parada u hora no toca la red.
  const [{ data, error }, reviewer] = await Promise.all([
    supabase.from("predictions").select(PREDICTION_COLUMNS),
    isReviewer(supabase),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 pt-3">
      <TopNav reviewer={reviewer} />
      <CorridorView initial={error ? null : ((data as Prediction[]) ?? null)} nowIso={new Date().toISOString()} />
    </main>
  );
}
