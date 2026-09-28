import { describe, expect, it } from "vitest";

import { SEGMENTS, STOPS, segmentStartingAt, segmentsBetween } from "@/config/corridor";

describe("config del corredor", () => {
  it("tiene 4 paradas A-D en orden y 3 tramos", () => {
    expect(STOPS.map((s) => s.id)).toEqual(["A", "B", "C", "D"]);
    expect(STOPS.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
    expect(SEGMENTS.map((s) => s.id)).toEqual(["AB", "BC", "CD"]);
  });

  it("calcula los tramos entre dos paradas", () => {
    expect(segmentsBetween("A", "D")).toEqual(["AB", "BC", "CD"]);
    expect(segmentsBetween("B", "C")).toEqual(["BC"]);
    expect(segmentsBetween("C", "A")).toEqual([]);
    expect(segmentStartingAt("A")).toBe("AB");
    expect(segmentStartingAt("D")).toBeNull();
  });
});
