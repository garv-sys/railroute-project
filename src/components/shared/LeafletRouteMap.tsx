"use client";

import React, { useEffect, useRef } from "react";
import { STATION_COORDS } from "@/lib/railway-intelligence";

interface StationPoint {
  code: string;
  name: string;
}

export default function LeafletRouteMap({
  stations
}: {
  stations: StationPoint[];
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let active = true;
    let L: any = null;

    const initMap = async () => {
      // Dynamically import leaflet on the client side
      const Leaflet = await import("leaflet");
      if (!active) return;
      L = Leaflet.default || Leaflet;

      // Filter stations to only those with valid coordinates
      const points: { lat: number; lng: number; code: string; name: string }[] = [];
      stations.forEach((st) => {
        const codeUpper = String(st.code || "").toUpperCase().trim();
        const coord = STATION_COORDS[codeUpper];
        if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
          points.push({
            lat: coord.lat,
            lng: coord.lng,
            code: codeUpper,
            name: st.name || codeUpper
          });
        }
      });

      if (points.length === 0) return;

      // Initialize map
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false
      });
      mapInstanceRef.current = map;

      // Voyager base layer (clean light map style)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
      }).addTo(map);

      // Create polyline for route
      const latlngs = points.map(p => [p.lat, p.lng]);
      const polyline = L.polyline(latlngs, {
        color: "#06b6d4", // cyan-500
        weight: 4,
        opacity: 0.85
      }).addTo(map);

      // Add markers for source, destination, and intermediate hubs
      points.forEach((p, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === points.length - 1;
        const isHub = !isStart && !isEnd && points.length > 2;

        if (isStart || isEnd || isHub) {
          const markerColor = isStart ? "#10b981" : isEnd ? "#f43f5e" : "#f59e0b"; // emerald, rose, amber
          const roleLabel = isStart ? "Source" : isEnd ? "Destination" : "Stop";
          
          const icon = L.divIcon({
            html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.35);"></div>`,
            className: "",
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });

          L.marker([p.lat, p.lng], { icon })
            .bindPopup(`<div class="text-xs font-black text-slate-800"><span style="color: ${markerColor}">${roleLabel}</span>: ${p.code}<br/><span class="font-semibold text-slate-500">${p.name}</span></div>`)
            .addTo(map);
        }
      });

      // Fit map bounds to show the route with padding
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    };

    initMap();

    return () => {
      active = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [stations]);

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-72 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-inner mt-2" 
      style={{ zIndex: 10 }}
    />
  );
}
