import { describe, expect, it } from "vitest";

import { isPublicPath, loginRedirectPath, safeNext } from "@/lib/routes";

describe("T1: rutas protegidas", () => {
  it("solo la portada, el login y el callback son públicos", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/corredor")).toBe(false);
    expect(isPublicPath("/mis-viajes")).toBe(false);
    expect(isPublicPath("/revision")).toBe(false);
  });

  it("manda al login recordando a dónde iba", () => {
    expect(loginRedirectPath("/corredor")).toBe("/login?next=%2Fcorredor");
  });

  it("no acepta redirecciones a otro dominio", () => {
    expect(safeNext("https://malo.example")).toBe("/corredor");
    expect(safeNext("//malo.example")).toBe("/corredor");
    expect(safeNext("/mis-viajes")).toBe("/mis-viajes");
  });
});
