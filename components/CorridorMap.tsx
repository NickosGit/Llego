"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import { SEGMENTS, STOPS, stopById, type SegmentId } from "@/config/corridor";
import { TONE_COLOR, type SegmentTone } from "@/lib/forecast";

/**
 * Mapa del corredor: una línea por tramo coloreada por la espera típica y las
 * paradas como círculos. NO hay marcadores de colectivos: el mapa describe la
 * ruta, nunca a quien la trabaja. Estático a propósito (se usa a una mano y no
 * debe robarse el scroll).
 */
const TONE_TEXT: Record<SegmentTone, string> = {
  ok: "espera corta",
  warn: "espera media",
  bad: "espera larga",
  none: "sin dato",
};

function segmentsGeoJSON(tones: Record<SegmentId, SegmentTone>) {
  return {
    type: "FeatureCollection" as const,
    features: SEGMENTS.map((s) => {
      const a = stopById(s.from);
      const b = stopById(s.to);
      return {
        type: "Feature" as const,
        properties: { id: s.id, color: TONE_COLOR[tones[s.id]] },
        geometry: { type: "LineString" as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      };
    }),
  };
}

const STOPS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: STOPS.map((s) => ({
    type: "Feature" as const,
    properties: { id: s.id, name: s.name },
    geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
  })),
};

export function CorridorMap({ tones }: { tones: Record<SegmentId, SegmentTone> }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tonesRef = useRef(tones);

  useEffect(() => {
    tonesRef.current = tones;
    const source = mapRef.current?.getSource("segments") as GeoJSONSource | undefined;
    source?.setData(segmentsGeoJSON(tones));
  }, [tones]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const lngs = STOPS.map((s) => s.lng);
      const lats = STOPS.map((s) => s.lat);

      map = new maplibregl.Map({
        container: container.current,
        interactive: false,
        attributionControl: { compact: true },
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        fitBoundsOptions: { padding: { top: 40, bottom: 56, left: 40, right: 40 } },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [
            { id: "fondo", type: "background", paint: { "background-color": "#e8efe3" } },
            { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.7, "raster-opacity": 0.85 } },
          ],
        },
      });

      map.on("load", () => {
        if (!map) return;
        map.addSource("segments", { type: "geojson", data: segmentsGeoJSON(tonesRef.current) });
        map.addSource("stops", { type: "geojson", data: STOPS_GEOJSON });
        map.addLayer({
          id: "tramos-borde",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 12 },
        });
        map.addLayer({
          id: "tramos",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 7 },
        });
        map.addLayer({
          id: "paradas",
          type: "circle",
          source: "stops",
          paint: {
            "circle-radius": 8,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#1b1b1b",
            "circle-stroke-width": 3,
          },
        });

        // Solo las puntas llevan nombre (sin servidor de fuentes: etiquetas HTML).
        const loaded = map;
        for (const stop of [STOPS[0], STOPS[STOPS.length - 1]]) {
          const el = document.createElement("div");
          el.className = "rounded bg-white/85 px-1.5 text-sm font-bold text-black";
          el.textContent = stop.name;
          new maplibregl.Marker({
            element: el,
            anchor: stop.seq === 1 ? "left" : "right",
            offset: stop.seq === 1 ? [14, 0] : [-14, 0],
          })
            .setLngLat([stop.lng, stop.lat])
            .addTo(loaded);
        }
      });
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const description = SEGMENTS.map(
    (s) => `${stopById(s.from).name} a ${stopById(s.to).name}: ${TONE_TEXT[tones[s.id]]}`,
  ).join(". ");

  return (
    <div
      ref={container}
      role="img"
      aria-label={`Mapa del corredor. ${description}.`}
      data-testid="corridor-map"
      className="h-60 w-full overflow-hidden rounded-3xl bg-[#e8efe3]"
    />
  );
}

export function MapLegend() {
  const items: [SegmentTone, string][] = [
    ["ok", "< 10 min"],
    ["warn", "10–13"],
    ["bad", "14+"],
    ["none", "sin dato"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Espera típica por tramo">
      {items.map(([tone, text]) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-full" style={{ background: TONE_COLOR[tone] }} />
          {text}
        </li>
      ))}
    </ul>
  );
}
