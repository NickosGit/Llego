import type { SegmentId } from "@/config/corridor";

export type DayType = "weekday" | "weekend";

/** Fila de la tabla `predictions`. */
export type Prediction = {
  segment: SegmentId;
  daytype: DayType;
  hour: number;
  wait_p50: number;
  wait_p90: number;
  seat_prob: number;
  n_obs: number;
  model_version: string;
};

export const PREDICTION_COLUMNS =
  "segment, daytype, hour, wait_p50, wait_p90, seat_prob, n_obs, model_version";
