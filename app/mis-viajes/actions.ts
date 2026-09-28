"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Borra un viaje propio. RLS impide borrar los de otra persona (Condición 4). */
export async function deleteTrip(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("trips").delete().eq("id", id);
  revalidatePath("/mis-viajes");
}
