"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Station Coordinates (Real Lat/Lng) ──────────────────────────────
export const STATION_COORDS: Record<string, { lat: number; lng: number; name: string; code: string; major?: boolean }> = {
  NDLS: { lat: 28.6423, lng: 77.2209, name: "New Delhi", code: "NDLS", major: true },
  BCT:  { lat: 18.9690, lng: 72.8194, name: "Mumbai Central", code: "BCT", major: true },
  HWH:  { lat: 22.5839, lng: 88.3428, name: "Howrah Jn", code: "HWH", major: true },
  MAS:  { lat: 13.0827, lng: 80.2756, name: "Chennai Central", code: "MAS", major: true },
  SBC:  { lat: 12.9774, lng: 77.5708, name: "Bengaluru", code: "SBC", major: true },
  SC:   { lat: 17.4344, lng: 78.5013, name: "Secunderabad", code: "SC", major: true },
  ADI:  { lat: 23.0225, lng: 72.5714, name: "Ahmedabad", code: "ADI", major: true },
  JP:   { lat: 26.9196, lng: 75.7878, name: "Jaipur", code: "JP", major: true },
  LKO:  { lat: 26.8333, lng: 80.9150, name: "Lucknow", code: "LKO", major: true },
  PNBE: { lat: 25.6094, lng: 85.1376, name: "Patna", code: "PNBE", major: true },
  DDU:  { lat: 25.2733, lng: 83.0087, name: "DD Upadhyaya Jn", code: "DDU" },
  NGP:  { lat: 21.1458, lng: 79.0882, name: "Nagpur", code: "NGP" },
  BPL:  { lat: 23.2680, lng: 77.4132, name: "Bhopal", code: "BPL" },
  VSKP: { lat: 17.7231, lng: 83.3013, name: "Vizag", code: "VSKP" },
  CNB:  { lat: 26.4535, lng: 80.3483, name: "Kanpur Central", code: "CNB" },
  CDG:  { lat: 30.6900, lng: 76.8600, name: "Chandigarh", code: "CDG" },
  GHY:  { lat: 26.1850, lng: 91.7500, name: "Guwahati", code: "GHY", major: true },
  TVC:  { lat: 8.4886, lng: 76.9525, name: "Thiruvananthapuram", code: "TVC" },
};

// ─── Railway Corridors ──────────────────────────────────────────────
const RAILWAY_CORRIDORS: { from: string; to: string; primary?: boolean }[] = [
  { from: "NDLS", to: "JP",   primary: true },
  { from: "NDLS", to: "LKO",  primary: true },
  { from: "LKO",  to: "PNBE", primary: true },
  { from: "PNBE", to: "DDU",  primary: true },
  { from: "DDU",  to: "NDLS", primary: true },
  { from: "PNBE", to: "HWH",  primary: true },
  { from: "NDLS", to: "BCT",  primary: true },
  { from: "BCT",  to: "ADI" },
  { from: "ADI",  to: "NDLS" },
  { from: "ADI",  to: "JP" },
  { from: "BCT",  to: "SBC" },
  { from: "MAS",  to: "SBC" },
  { from: "HWH",  to: "MAS" },
  { from: "SC",   to: "SBC" },
  { from: "SC",   to: "MAS" },
  { from: "BCT",  to: "SC" },
  { from: "NDLS", to: "BPL" },
  { from: "BPL",  to: "NGP" },
  { from: "NGP",  to: "SC" },
  { from: "NGP",  to: "BCT" },
  { from: "HWH",  to: "VSKP" },
  { from: "VSKP", to: "MAS" },
  { from: "NDLS", to: "CDG" },
  { from: "MAS",  to: "TVC" },
];

// ─── Map Styles (Warm Ivory - Apple Maps inspired) ──────────────────
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f0e8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a5a5a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fdfbf7" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d4cfc5" }, { weight: 1.2 }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#b8b0a2" }, { weight: 2 }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#d4cfc5" }, { weight: 1 }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#f0ebe2" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#eae5db" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e5e0d5" }] },
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#c8d4e8" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// ─── Script loader (singleton) ──────────────────────────────────────
let gmapLoaded = false;
let gmapLoading = false;
const gmapCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    if (gmapLoaded && window.google?.maps) { resolve(); return; }
    gmapCallbacks.push(resolve);
    if (gmapLoading) return;
    gmapLoading = true;

    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) { console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"); return; }

    (window as any).__initGMap = () => {
      gmapLoaded = true;
      gmapCallbacks.forEach((cb) => cb());
      gmapCallbacks.length = 0;
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=__initGMap&v=weekly&loading=async`;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  });
}

// ─── Types ──────────────────────────────────────────────
interface GoogleMapProps {
  className?: string;
  activeRoute?: { from: string; to: string; via?: string[] } | null;
  onStationClick?: (code: string) => void;
  interactive?: boolean;
  showLabels?: boolean;
  overlayGradient?: boolean;  // warm sunset overlay for homepage hero
}

// ─── Main Component ──────────────────────────────────────────────
export function GoogleMapView({
  className = "",
  activeRoute = null,
  onStationClick,
  interactive = true,
  showLabels = true,
  overlayGradient = false,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);

  const initMap = useCallback(async () => {
    if (!containerRef.current) return;
    await loadGoogleMapsScript();

    const map = new google.maps.Map(containerRef.current, {
      center: { lat: 22.0, lng: 79.0 },
      zoom: 5,
      minZoom: 4,
      maxZoom: 10,
      styles: MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: interactive,
      gestureHandling: interactive ? "greedy" : "none",
      backgroundColor: "#f5f0e8",
      restriction: {
        latLngBounds: { north: 37.5, south: 6.5, west: 66.5, east: 98.0 },
        strictBounds: false,
      },
    });

    mapRef.current = map;
    drawRoutes(map);
    drawMarkers(map);
    if (activeRoute) highlightRoute(map, activeRoute);
    setLoaded(true);
    // Google Maps is an imperative widget; route updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Draw all corridor lines ──────────────────────────
  const drawRoutes = (map: google.maps.Map) => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    RAILWAY_CORRIDORS.forEach((c) => {
      const f = STATION_COORDS[c.from], t = STATION_COORDS[c.to];
      if (!f || !t) return;
      const path = [{ lat: f.lat, lng: f.lng }, { lat: t.lat, lng: t.lng }];

      // glow
      polylinesRef.current.push(new google.maps.Polyline({
        path, geodesic: true,
        strokeColor: c.primary ? "#6B46C1" : "#A0AEC0",
        strokeOpacity: c.primary ? 0.12 : 0.06,
        strokeWeight: c.primary ? 8 : 5,
        map, zIndex: 1,
      }));

      // main line
      polylinesRef.current.push(new google.maps.Polyline({
        path, geodesic: true,
        strokeColor: c.primary ? "#6B46C1" : "#A0AEC0",
        strokeOpacity: c.primary ? 0.5 : 0.2,
        strokeWeight: c.primary ? 2.5 : 1.5,
        map, zIndex: 2,
      }));
    });
  };

  // ─── Station markers ──────────────────────────────────
  const drawMarkers = (map: google.maps.Map) => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    Object.entries(STATION_COORDS).forEach(([code, s]) => {
      const marker = new google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: s.major ? 6 : 4,
          fillColor: s.major ? "#6B46C1" : "#A0AEC0",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        title: `${s.name} (${s.code})`,
        zIndex: s.major ? 20 : 10,
      });

      if (showLabels) {
        const label = new google.maps.InfoWindow({
          content: `<div style="font-family:'Inter',system-ui,sans-serif;padding:1px 4px;white-space:nowrap;">
            <span style="font-size:${s.major ? '11px' : '9px'};font-weight:${s.major ? '800' : '600'};color:#2A2A2A;">${s.name}</span>
          </div>`,
          disableAutoPan: true,
        });
        label.open({ anchor: marker, map });
      }

      if (onStationClick) {
        marker.addListener("click", () => onStationClick(code));
      }

      markersRef.current.push(marker);
    });
  };

  // ─── Highlight active route ──────────────────────────
  const highlightRoute = (map: google.maps.Map, route: { from: string; to: string; via?: string[] }) => {
    const stations = [route.from, ...(route.via || []), route.to];
    const path: google.maps.LatLngLiteral[] = [];
    stations.forEach((code) => {
      const s = STATION_COORDS[code];
      if (s) path.push({ lat: s.lat, lng: s.lng });
    });
    if (path.length < 2) return;

    // bright line
    polylinesRef.current.push(new google.maps.Polyline({
      path, geodesic: true,
      strokeColor: "#6B46C1", strokeOpacity: 0.9, strokeWeight: 4,
      map, zIndex: 10,
    }));

    // glow
    polylinesRef.current.push(new google.maps.Polyline({
      path, geodesic: true,
      strokeColor: "#6B46C1", strokeOpacity: 0.2, strokeWeight: 14,
      map, zIndex: 9,
    }));

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
  };

  useEffect(() => { initMap(); }, [initMap]);

  // Re-highlight when route changes
  useEffect(() => {
    if (mapRef.current && activeRoute) {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      drawRoutes(mapRef.current);
      highlightRoute(mapRef.current, activeRoute);
    }
    // Route redraw intentionally keys on route identity; map helpers are stable for this mounted widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.from, activeRoute?.to]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Loading shimmer */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
            initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
            className="absolute inset-0 z-20 bg-[#F5F0E8] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-2 border-[#6B46C1]/20 border-t-[#6B46C1] rounded-full"
              />
              <span className="text-[10px] font-bold text-[#8A8A8A] tracking-widest uppercase">Loading Map</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Optional warm sunset gradient overlay for homepage */}
      {overlayGradient && (
        <div className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: `
              linear-gradient(135deg, rgba(245,240,232,0.7) 0%, rgba(245,240,232,0.2) 30%, rgba(245,240,232,0) 50%, rgba(245,220,200,0.15) 80%, rgba(240,200,170,0.3) 100%),
              linear-gradient(to bottom, rgba(245,240,232,0.8) 0%, transparent 15%, transparent 80%, rgba(245,240,232,0.9) 100%)
            `,
          }}
        />
      )}
    </div>
  );
}
