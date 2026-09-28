import { describe, expect, it, vi } from "vitest";

import { uploadTrip } from "@/lib/trip-upload";
import type { TripPayload } from "@/lib/trip";

const payload: TripPayload = {
  stop_from: "A", stop_to: "D", daytype: "weekday", hour: 5, wait_min: 12, ride_min: 38, got_seat: false,
};
const noSleep = () => Promise.resolve();

describe("T8: la subida del viaje reintenta una vez", () => {
  it("si la red falla una vez, el reintento lo manda", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "TypeError: Failed to fetch" } })
      .mockResolvedValueOnce({ error: null });
    expect(await uploadTrip(payload, insert, noSleep)).toBe("sent");
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("si falla dos veces, queda pendiente en el teléfono (sin tercer intento)", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await uploadTrip(payload, insert, noSleep)).toBe("pending");
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de la base (RLS/constraint) no se reintenta", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "violates check", code: "23514" } });
    expect(await uploadTrip(payload, insert, noSleep)).toBe("rejected");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("lo que se manda es solo la lista blanca", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await uploadTrip({ ...payload, lat: 1 } as TripPayload, insert, noSleep);
    expect(Object.keys(insert.mock.calls[0][0])).not.toContain("lat");
  });
});
