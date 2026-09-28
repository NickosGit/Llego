import { describe, expect, it } from "vitest";

import { stopById } from "@/config/corridor";
import { durations, initialTrip, minutesBetween, tripPayload, tripReducer, type Fix, type TripState } from "@/lib/trip";

const A = stopById("A");
const D = stopById("D");
const MIN = 60_000;

// ~0.0018° de latitud ≈ 200 m: fuera del radio de 80 m + margen.
const near = (s: { lat: number; lng: number }, t: number, dLat = 0): Fix => ({ t, lat: s.lat + dLat, lng: s.lng, accuracy: 10 });

function run(events: Parameters<typeof tripReducer>[1][]): TripState {
  return events.reduce(tripReducer, initialTrip("A", "D"));
}

describe("detección con GPS en el teléfono", () => {
  it("espera → se sube al alejarse 2 lecturas → llega al destino", () => {
    const s = run([
      { type: "start", t: 0 },
      { type: "fix", fix: near(A, 1 * MIN) },
      { type: "fix", fix: near(A, 12 * MIN, 0.0018) },
      { type: "fix", fix: near(A, 13 * MIN, 0.004) },
      { type: "fix", fix: near(D, 50 * MIN) },
    ]);
    expect(s.phase).toBe("arrived");
    expect(durations(s, 55 * MIN)).toEqual({ wait_min: 12, ride_min: 38 });
  });

  it("una sola lectura lejana (ruido del GPS) no cuenta como subirse", () => {
    const s = run([
      { type: "start", t: 0 },
      { type: "fix", fix: near(A, 1 * MIN, 0.0018) },
      { type: "fix", fix: near(A, 2 * MIN) },
      { type: "fix", fix: near(A, 3 * MIN, 0.0018) },
    ]);
    expect(s.phase).toBe("waiting");
  });

  it("ignora lecturas imprecisas", () => {
    const s = run([
      { type: "start", t: 0 },
      { type: "fix", fix: { ...near(A, MIN, 0.01), accuracy: 500 } },
      { type: "fix", fix: { ...near(A, 2 * MIN, 0.01), accuracy: 500 } },
    ]);
    expect(s.phase).toBe("waiting");
    expect(s.trail).toHaveLength(0);
  });

  it("'Ya me subí' manual y terminar sin llegar usa la hora de terminar", () => {
    const s = run([
      { type: "start", t: 0 },
      { type: "boarded", t: 5 * MIN },
    ]);
    expect(durations(s, 30 * MIN)).toEqual({ wait_min: 5, ride_min: 25 });
  });

  it("si nunca se subió no hay duraciones", () => {
    expect(durations(run([{ type: "start", t: 0 }]), 10 * MIN)).toBeNull();
  });

  it("reset borra el recorrido de memoria", () => {
    const s = run([{ type: "start", t: 0 }, { type: "fix", fix: near(A, MIN) }, { type: "reset" }]);
    expect(s.trail).toEqual([]);
    expect(s.phase).toBe("idle");
  });
});

describe("T7: el payload no lleva coordenadas", () => {
  it("solo duraciones, paradas y asiento, aunque le pasen de más", () => {
    const dirty = {
      stop_from: "A", stop_to: "D", daytype: "weekday", hour: 5, wait_min: 12, ride_min: 38, got_seat: true,
      lat: 19.5, lng: -99.2, trail: [[19.5, -99.2]],
    } as unknown as Parameters<typeof tripPayload>[0];
    const out = tripPayload(dirty);
    expect(Object.keys(out).sort()).toEqual(["daytype", "got_seat", "hour", "ride_min", "stop_from", "stop_to", "wait_min"]);
    expect(JSON.stringify(out)).not.toMatch(/lat|lng|trail|19\.5/);
  });
});

describe("modo manual", () => {
  it("minutos entre horas, cruzando medianoche", () => {
    expect(minutesBetween("05:10", "05:32")).toBe(22);
    expect(minutesBetween("23:50", "00:10")).toBe(20);
  });
});
