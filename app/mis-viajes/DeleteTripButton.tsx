"use client";

/** Borrar pide confirmación: a una mano es fácil tocar de más. */
export function DeleteTripButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm("¿Borrar este viaje? Ya no contará en el pronóstico.")) e.preventDefault();
      }}
      className="rounded-xl border-2 border-red-700 px-4 text-base font-bold text-red-700"
    >
      Borrar
    </button>
  );
}
