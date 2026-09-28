/**
 * Aviso fijo en TODAS las pantallas: nada de lo que se ve son datos reales.
 * Vive en el layout raíz para que ninguna ruta pueda olvidarlo.
 */
export function SimBanner() {
  return (
    <div
      role="status"
      data-testid="sim-banner"
      className="sticky top-0 z-50 bg-[#FFD600] py-2 text-center text-sm font-extrabold tracking-[0.2em] text-black"
    >
      DATOS SIMULADOS
    </div>
  );
}
