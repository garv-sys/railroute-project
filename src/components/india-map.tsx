"use client";

import { motion } from "framer-motion";

// ─── Geographically Accurate City Coordinates ──────────────────────────────
// Calculated from real lat/lon projected onto India's bounding box
// Lon range: 68°E - 97°E → x%   |   Lat range: 8°N - 37°N → y%
export const CITIES: Record<string, { x: number; y: number; name: string; code: string; major?: boolean }> = {
  DELHI:      { x: 31.7, y: 29.0, name: "New Delhi",         code: "NDLS",  major: true },
  MUMBAI:     { x: 16.9, y: 61.7, name: "Mumbai Central",    code: "BCT",   major: true },
  KOLKATA:    { x: 70.3, y: 49.7, name: "Kolkata",           code: "HWH",   major: true },
  CHENNAI:    { x: 42.4, y: 82.4, name: "Chennai Central",   code: "MAS",   major: true },
  BENGALURU:  { x: 33.1, y: 82.8, name: "Bengaluru",         code: "SBC",   major: true },
  HYDERABAD:  { x: 36.2, y: 67.6, name: "Hyderabad",         code: "SC",    major: true },
  AHMEDABAD:  { x: 15.9, y: 48.3, name: "Ahmedabad",         code: "ADI",   major: true },
  JAIPUR:     { x: 26.9, y: 34.8, name: "Jaipur",            code: "JP",    major: true },
  LUCKNOW:    { x: 44.5, y: 35.2, name: "Lucknow",           code: "LKO",   major: true },
  PATNA:      { x: 59.0, y: 39.3, name: "Patna",             code: "PNBE",  major: true },
  DDU:        { x: 52.1, y: 40.3, name: "Pt. DD Upadhyaya",  code: "DDU" },
  NAGPUR:     { x: 35.2, y: 55.9, name: "Nagpur",             code: "NGP" },
  BHOPAL:     { x: 33.4, y: 48.6, name: "Bhopal",             code: "BPL" },
  VISAKHAPATNAM: { x: 55.5, y: 65.2, name: "Vizag",           code: "VSKP" },
};

// ─── Real Indian Railway Route Network ──────────────────────────────────────
// Each route is a pair of city keys representing a real rail corridor
const ROUTES: [string, string, { primary?: boolean; label?: string }][] = [
  // Major Rajdhani/Shatabdi corridors
  ["DELHI",     "JAIPUR",     { primary: true }],
  ["DELHI",     "LUCKNOW",    { primary: true }],
  ["LUCKNOW",   "PATNA",      { primary: true }],
  ["PATNA",     "DDU",        { primary: true }],
  ["DDU",       "DELHI",      { primary: true, label: "Duronto" }],
  ["PATNA",     "KOLKATA",    { primary: true }],
  ["DELHI",     "MUMBAI",     { primary: true }],
  
  // Secondary corridors
  ["MUMBAI",    "AHMEDABAD",  {}],
  ["AHMEDABAD", "DELHI",      {}],
  ["AHMEDABAD", "JAIPUR",     {}],
  ["MUMBAI",    "BENGALURU",  {}],
  ["CHENNAI",   "BENGALURU",  {}],
  ["KOLKATA",   "CHENNAI",    {}],
  ["HYDERABAD", "BENGALURU",  {}],
  ["HYDERABAD", "CHENNAI",    {}],
  ["MUMBAI",    "HYDERABAD",  {}],
  ["DELHI",     "BHOPAL",     {}],
  ["BHOPAL",    "NAGPUR",     {}],
  ["NAGPUR",    "HYDERABAD",  {}],
  ["NAGPUR",    "MUMBAI",     {}],
  ["KOLKATA",   "VISAKHAPATNAM", {}],
  ["VISAKHAPATNAM", "CHENNAI", {}],
  ["LUCKNOW",   "KOLKATA",    {}],
];

// Train dots that travel along routes
const TRAIN_PATHS: { cities: string[]; color: string; duration: number; delay: number }[] = [
  { cities: ["PATNA", "DDU", "DELHI"],           color: "#6B46C1", duration: 20, delay: 0 },
  { cities: ["DELHI", "MUMBAI"],                 color: "#D53F8C", duration: 25, delay: 3 },
  { cities: ["KOLKATA", "CHENNAI"],              color: "#2B6CB0", duration: 22, delay: 5 },
  { cities: ["MUMBAI", "AHMEDABAD"],             color: "#38A169", duration: 18, delay: 8 },
  { cities: ["DELHI", "LUCKNOW", "PATNA"],       color: "#DD6B20", duration: 24, delay: 2 },
  { cities: ["HYDERABAD", "BENGALURU"],          color: "#6B46C1", duration: 16, delay: 10 },
  { cities: ["CHENNAI", "BENGALURU"],            color: "#2B6CB0", duration: 14, delay: 7 },
  { cities: ["DELHI", "JAIPUR"],                 color: "#D53F8C", duration: 12, delay: 4 },
];

function getRouteArc(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curvature = Math.min(dist * 0.25, 8);
  const cpX = midX + (dy / dist) * curvature;
  const cpY = midY - (dx / dist) * curvature;
  return `M ${from.x}% ${from.y}% Q ${cpX}% ${cpY}% ${to.x}% ${to.y}%`;
}

export function IndiaMapBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 z-0 pointer-events-none overflow-hidden ${className}`}>
      {/* Warm gradient underlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FDF8F0] via-[#F5F0E8] to-[#EDE8DD]" />
      
      {/* Map image - centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[90%] max-w-[1100px] aspect-[4/5]">
          <div 
            className="absolute inset-0"
            style={{ 
              backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/4/41/India_location_map.svg")', 
              backgroundSize: 'contain', 
              backgroundPosition: 'center', 
              backgroundRepeat: 'no-repeat',
              filter: 'sepia(80%) hue-rotate(-15deg) saturate(25%) brightness(105%) opacity(22%)'
            }} 
          />
          
          {/* SVG Route Network */}
          <svg className="absolute inset-0 w-full h-full z-10" style={{ overflow: 'visible' }}>
            <defs>
              <filter id="route-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {/* Draw all route lines */}
            {ROUTES.map(([fromKey, toKey, opts], i) => {
              const from = CITIES[fromKey];
              const to = CITIES[toKey];
              if (!from || !to) return null;
              const d = getRouteArc(from, to);
              const isPrimary = opts.primary;
              return (
                <motion.path
                  key={`route-${i}`}
                  d={d}
                  fill="transparent"
                  stroke={isPrimary ? "#6B46C1" : "#A0AEC0"}
                  strokeWidth={isPrimary ? 2.5 : 1.5}
                  strokeDasharray={isPrimary ? "none" : "4 4"}
                  opacity={isPrimary ? 0.6 : 0.25}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5 + i * 0.15, ease: "easeInOut", delay: i * 0.08 }}
                  filter={isPrimary ? "url(#route-glow)" : undefined}
                />
              );
            })}
          </svg>

          {/* City Markers */}
          {Object.entries(CITIES).map(([key, city]) => (
            <div 
              key={key} 
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20"
              style={{ left: `${city.x}%`, top: `${city.y}%` }}
            >
              {/* Outer pulse ring for major cities */}
              {city.major && (
                <span className="absolute w-6 h-6 rounded-full bg-[#6B46C1]/10 animate-ping" style={{ animationDuration: '3s' }} />
              )}
              <div className={`rounded-full border-2 shadow-sm z-10 ${
                city.major 
                  ? 'w-3.5 h-3.5 bg-[#6B46C1] border-white shadow-[0_0_10px_rgba(107,70,193,0.4)]' 
                  : 'w-2.5 h-2.5 bg-[#A0AEC0] border-white/80'
              }`} />
              <div className={`backdrop-blur-md rounded-md shadow-sm whitespace-nowrap z-10 ${
                city.major 
                  ? 'bg-white/90 px-2 py-0.5 text-[10px] font-black text-[#2A2A2A] border border-white/60' 
                  : 'bg-white/70 px-1.5 py-0.5 text-[8px] font-bold text-[#718096]'
              }`}>
                {city.name} <span className="text-[#A0AEC0] font-mono">{city.code}</span>
              </div>
            </div>
          ))}

          {/* Animated Train Dots */}
          {TRAIN_PATHS.map((train, i) => {
            const positions = train.cities.map(c => CITIES[c]).filter(Boolean);
            if (positions.length < 2) return null;
            return (
              <motion.div 
                key={`train-${i}`}
                className="absolute w-3 h-3 rounded-full z-30 -translate-x-1/2 -translate-y-1/2"
                style={{ 
                  backgroundColor: train.color,
                  boxShadow: `0 0 12px ${train.color}80, 0 0 4px ${train.color}`,
                  border: '2px solid white'
                }}
                animate={{
                  left: positions.map(p => `${p.x}%`),
                  top: positions.map(p => `${p.y}%`),
                }}
                transition={{ 
                  duration: train.duration, 
                  repeat: Infinity, 
                  ease: "linear",
                  delay: train.delay,
                  repeatType: "reverse"
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
