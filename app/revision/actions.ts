"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isReviewer } from "@/lib/reviewer";
import { createClient } from "@/lib/supabase/server";

/** Confirmar o descartar un caso. RLS vuelve a comprobar el rol en la base. */
export async function resolveCase(formData: FormData) {
  const supabase = await createClient();
  if (!(await isReviewer(supabase))) redirect("/corredor");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!id || (status !== "confirmed" && status !== "dismissed")) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("review_cases")
    .update({
      status,
      reviewer_note: note || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq("id", id)
    .eq("status", "open");

  revalidatePath("/revision");
}
