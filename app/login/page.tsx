import { hasSupabaseEnv } from "@/lib/supabase/env";
import { safeNext } from "@/lib/routes";

import { LoginForm } from "./LoginForm";

const ERRORS: Record<string, string> = {
  enlace: "Ese enlace ya se usó o caducó. Pide uno nuevo.",
  sin_codigo: "El enlace llegó incompleto. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <main className="flex flex-1 flex-col gap-5 pt-8">
      <h1 className="text-3xl font-extrabold">Entrar</h1>
      <p className="text-lg">
        Te mandamos un enlace a tu correo. Sin contraseña.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-lg text-red-800">
          {error}
        </p>
      )}
      {hasSupabaseEnv ? (
        <LoginForm next={next} />
      ) : (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-lg text-red-800">
          Falta configurar Supabase en este despliegue.
        </p>
      )}
    </main>
  );
}
