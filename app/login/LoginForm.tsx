"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) {
      setStatus("error");
      setMessage(
        error.status === 429
          ? "Se pidieron muchos enlaces seguidos. Espera unos minutos."
          : "No pudimos mandar el enlace. Revisa el correo e intenta otra vez.",
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <p role="status" className="rounded-2xl bg-card p-5 text-xl shadow-sm">
        Listo. Abre el enlace que te llegó a <strong>{email}</strong> en este mismo teléfono.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-lg font-semibold">
        Tu correo
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border-2 border-gray-300 bg-white px-4 text-xl"
        />
      </label>
      {status === "error" && (
        <p role="alert" className="text-lg text-red-700">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-2xl bg-navy py-4 text-xl font-extrabold text-white disabled:opacity-60"
      >
        {status === "sending" ? "Enviando…" : "Mandarme el enlace"}
      </button>
    </form>
  );
}
