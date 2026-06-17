"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Compass, ZoomIn, ZoomOut, RotateCcw, MapPin, 
  ShieldCheck, Clock, Sparkles, Navigation, Activity,
  Info, Eye, Landmark, HelpCircle, CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ═══════════════════════════════════════════
// GEOGRAPHIC DATA
// ═══════════════════════════════════════════

export const INDIA_BORDER_OUTLINE: [number, number][] = [
  [37.05, 74.40], [37.10, 74.80], [36.95, 75.50], [36.50, 76.00], [35.80, 76.70], [35.60, 76.90],
  [35.30, 77.80], [35.20, 78.40], [34.70, 79.00], [34.20, 79.50], [33.80, 79.00], [33.00, 79.35],
  [32.50, 78.70], [31.85, 78.75], [31.10, 78.85], [30.20, 80.35], [30.15, 80.40],
  [28.95, 80.15], [28.60, 80.50], [28.25, 81.30], [27.50, 83.10], [27.35, 84.10], [26.50, 85.10], [26.35, 86.10], [26.50, 87.50], [26.35, 88.10],
  [27.30, 88.50], [28.00, 88.60], [27.75, 88.90], [27.20, 88.90],
  [27.15, 89.10], [26.85, 89.30], [26.75, 89.90], [26.85, 90.30], [26.85, 91.50], [27.25, 91.50], [27.40, 92.00],
  [27.75, 91.70], [27.95, 92.50], [28.15, 93.30], [28.75, 94.10], [29.10, 94.60], [29.20, 95.30], [29.35, 96.00], [28.65, 97.40],
  [27.60, 97.20], [27.20, 96.00], [26.50, 95.30], [25.75, 94.65], [24.50, 93.50], [23.50, 93.30], [22.05, 92.95],
  [22.00, 92.40], [22.75, 91.80], [23.40, 91.40], [24.20, 92.20], [25.10, 92.00], [25.10, 89.90], [25.80, 89.80], [26.35, 89.70], [26.15, 88.50], [25.15, 88.20], [24.70, 88.40], [23.80, 88.85], [22.90, 88.75], [22.10, 89.10],
  [21.60, 89.15], [21.50, 88.00], [21.80, 87.30], [20.70, 86.95], [19.80, 85.90], [19.25, 84.85], [18.00, 83.70], [17.30, 82.80], [16.20, 81.30], [15.80, 80.80], [14.05, 80.20], [13.25, 80.35], [12.50, 80.15], [11.50, 79.80], [10.30, 79.85], [9.30, 79.15],
  [9.15, 78.55], [8.55, 78.15], [8.08, 77.54],
  [8.35, 77.00], [9.15, 76.50], [10.00, 76.20], [11.25, 75.75], [12.50, 74.90], [13.50, 74.75], [15.20, 73.80], [16.50, 73.30], [18.00, 72.90], [18.97, 72.82], [20.10, 72.70], [21.00, 72.50], [22.20, 72.25],
  [22.40, 70.30], [22.30, 69.00], [22.80, 68.40], [23.50, 68.10], [23.80, 68.20],
  [24.30, 69.10], [24.50, 70.30], [24.60, 71.20], [25.75, 70.30], [26.50, 70.00], [27.50, 70.20], [28.40, 71.50], [28.95, 72.10], [30.15, 73.65],
  [30.90, 74.30], [31.50, 74.50], [32.05, 74.85], [32.60, 74.80], [32.85, 74.15], [33.70, 74.00], [34.00, 73.80], [34.60, 74.05], [34.85, 74.25], [35.95, 73.65],
  [36.90, 74.80], [37.05, 74.40]
];

export interface Capital {
  name: string;
  state: string;
  lat: number;
  lng: number;
}

export const STATE_CAPITALS: Capital[] = [
  { name: "New Delhi", state: "National Capital", lat: 28.6139, lng: 77.2090 },
  { name: "Mumbai", state: "Maharashtra", lat: 18.97, lng: 72.82 },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  { name: "Patna", state: "Bihar", lat: 25.5941, lng: 85.1376 },
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lng: 77.4126 },
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lng: 85.3096 },
  { name: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245 },
  { name: "Hyderabad", state: "Telangana", lat: 17.3850, lng: 78.4867 },
  { name: "Gandhinagar", state: "Gujarat", lat: 23.2156, lng: 72.6369 },
  { name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lng: 78.0322 },
  { name: "Shimla", state: "Himachal Pradesh", lat: 31.1048, lng: 77.1734 },
  { name: "Srinagar", state: "Jammu & Kashmir", lat: 34.0837, lng: 74.7973 },
  { name: "Dispur", state: "Assam", lat: 26.1445, lng: 91.7362 },
  { name: "Thiruvananthapuram", state: "Kerala", lat: 8.5241, lng: 76.9366 }
];

export interface StateOutline {
  id: string;
  name: string;
  coords: [number, number][];
}

export const STATE_OUTLINES: StateOutline[] = [
  {
    id: "JK",
    name: "Jammu & Kashmir & Ladakh",
    coords: [[37.05, 74.40], [37.10, 74.80], [36.95, 75.50], [36.50, 76.00], [35.80, 76.70], [35.60, 76.90], [35.30, 77.80], [35.20, 78.40], [34.70, 79.0], [34.20, 79.5], [33.8, 79.0], [33.0, 79.35], [32.5, 78.7], [32.1, 75.9], [32.7, 74.9], [33.7, 74.0], [34.0, 73.8], [34.6, 74.05], [34.85, 74.25], [35.95, 73.65], [36.90, 74.8], [37.05, 74.40]]
  },
  {
    id: "HP",
    name: "Himachal Pradesh",
    coords: [[33.0, 79.35], [32.5, 78.7], [31.85, 78.75], [31.1, 78.85], [31.2, 77.0], [32.1, 75.9], [32.5, 76.5], [33.0, 79.35]]
  },
  {
    id: "PB",
    name: "Punjab",
    coords: [[32.5, 75.9], [31.2, 77.0], [30.16, 75.2], [29.9, 74.2], [30.9, 74.3], [31.5, 74.5], [32.05, 74.85], [32.5, 75.9]]
  },
  {
    id: "UK",
    name: "Uttarakhand",
    coords: [[31.1, 78.85], [30.2, 80.35], [30.15, 80.40], [28.95, 80.15], [29.5, 79.5], [30.3, 78.0], [31.1, 78.85]]
  },
  {
    id: "RJ",
    name: "Rajasthan",
    coords: [[30.16, 73.88], [30.2, 75.2], [27.7, 76.9], [27.3, 78.2], [26.8, 77.9], [25.7, 77.2], [24.4, 76.4], [23.9, 74.3], [24.7, 72.5], [25.8, 71.2], [26.8, 70.1], [28.4, 69.8], [29.9, 72.1], [30.16, 73.88]]
  },
  {
    id: "GJ",
    name: "Gujarat",
    coords: [[24.7, 71.2], [24.5, 72.5], [23.4, 74.1], [22.2, 74.3], [22.0, 73.9], [20.2, 72.8], [20.7, 72.2], [21.0, 72.1], [22.3, 70.3], [22.3, 69.0], [22.8, 68.4], [23.8, 68.2], [24.3, 69.1], [24.5, 70.3], [24.7, 71.2]]
  },
  {
    id: "MH",
    name: "Maharashtra",
    coords: [[22.0, 72.8], [21.5, 74.5], [21.6, 76.3], [21.1, 78.5], [21.4, 80.5], [19.9, 80.7], [18.7, 80.3], [17.8, 78.0], [17.3, 77.4], [15.6, 74.1], [15.0, 74.0], [15.8, 73.6], [17.5, 73.1], [19.0, 72.8], [20.5, 72.7], [22.0, 72.8]]
  },
  {
    id: "UP",
    name: "Uttar Pradesh",
    coords: [[29.5, 77.3], [30.3, 78.0], [29.5, 79.5], [28.6, 80.2], [27.7, 81.6], [27.5, 83.1], [27.3, 84.1], [25.9, 84.0], [25.1, 83.0], [24.3, 83.3], [24.1, 82.8], [25.0, 81.5], [25.3, 80.0], [25.1, 79.0], [26.2, 78.2], [27.2, 77.3], [28.6, 77.3], [29.5, 77.3]]
  },
  {
    id: "BR",
    name: "Bihar",
    coords: [[27.3, 84.1], [27.5, 85.0], [26.5, 85.1], [26.3, 86.1], [26.5, 87.5], [26.3, 88.1], [25.2, 87.8], [25.0, 87.1], [24.5, 86.8], [24.3, 85.5], [24.8, 84.0], [25.1, 83.0], [25.9, 84.0], [27.3, 84.1]]
  },
  {
    id: "MP",
    name: "Madhya Pradesh",
    coords: [[26.8, 77.9], [26.2, 78.2], [25.1, 79.0], [25.3, 80.0], [25.0, 81.5], [24.1, 82.8], [23.9, 82.5], [22.8, 81.2], [22.0, 81.1], [21.5, 80.5], [21.1, 78.5], [21.6, 76.3], [21.5, 74.5], [22.0, 74.3], [23.4, 74.1], [24.5, 72.5], [24.7, 72.8], [24.5, 73.8], [25.2, 75.8], [26.8, 77.9]]
  },
  {
    id: "KA",
    name: "Karnataka",
    coords: [[17.3, 77.4], [17.8, 78.0], [16.5, 78.0], [15.1, 76.8], [13.7, 78.2], [12.8, 78.3], [12.0, 77.0], [12.0, 76.0], [12.7, 75.3], [12.5, 74.9], [13.5, 74.7], [15.2, 73.8], [15.0, 74.0], [15.6, 74.1], [17.3, 77.4]]
  },
  {
    id: "TN",
    name: "Tamil Nadu",
    coords: [[13.7, 78.2], [13.5, 80.2], [12.5, 80.15], [11.5, 79.8], [10.3, 79.85], [9.3, 79.15], [9.15, 78.55], [8.55, 78.15], [8.08, 77.54], [8.35, 77.0], [9.5, 77.3], [10.5, 77.2], [11.8, 78.0], [13.7, 78.2]]
  },
  {
    id: "KL",
    name: "Kerala",
    coords: [[12.7, 75.3], [12.0, 76.0], [12.0, 77.0], [10.5, 77.2], [9.5, 77.3], [8.35, 77.0], [9.15, 76.5], [10.0, 76.2], [11.25, 75.75], [12.5, 74.9], [12.7, 75.3]]
  },
  {
    id: "WB",
    name: "West Bengal",
    coords: [[27.3, 88.5], [27.2, 88.9], [26.8, 89.3], [26.1, 89.7], [25.1, 89.9], [25.1, 88.2], [24.7, 88.4], [23.8, 88.85], [22.9, 88.75], [22.1, 89.1], [21.6, 89.15], [21.5, 88.0], [21.8, 87.3], [22.2, 86.8], [22.9, 86.8], [24.1, 85.8], [24.5, 86.8], [25.0, 87.1], [25.2, 87.8], [26.3, 88.1], [27.3, 88.5]]
  },
  {
    id: "AP_TS",
    name: "Andhra Pradesh & Telangana",
    coords: [[19.1, 78.7], [18.7, 80.3], [17.5, 81.3], [18.2, 83.8], [17.3, 82.8], [16.2, 81.3], [15.8, 80.8], [14.05, 80.2], [13.25, 80.35], [13.5, 80.2], [13.7, 78.2], [15.1, 76.8], [16.5, 78.0], [17.8, 78.0], [19.1, 78.7]]
  },
  {
    id: "JH",
    name: "Jharkhand",
    coords: [[24.5, 86.8], [24.1, 85.8], [22.9, 86.8], [22.2, 86.8], [22.0, 84.8], [23.5, 83.7], [24.3, 83.3], [25.1, 83.0], [24.8, 84.0], [24.3, 85.5], [24.5, 86.8]]
  },
  {
    id: "OD",
    name: "Odisha",
    coords: [[22.2, 86.8], [21.8, 87.3], [20.7, 86.95], [19.8, 85.9], [19.25, 84.85], [18.2, 83.8], [17.5, 81.3], [18.5, 82.5], [20.1, 82.9], [21.1, 84.2], [22.0, 84.8], [22.2, 86.8]]
  }
];

export const CAPITAL_STATION_MAP: Record<string, { code: string; name: string }> = {
  "New Delhi": { code: "NDLS", name: "New Delhi Junction" },
  "Mumbai": { code: "CSMT", name: "Mumbai CSMT" },
  "Kolkata": { code: "HWH", name: "Howrah Junction" },
  "Chennai": { code: "MAS", name: "Chennai Central" },
  "Bengaluru": { code: "SBC", name: "Bengaluru City Jn" },
  "Jaipur": { code: "JP", name: "Jaipur Junction" },
  "Lucknow": { code: "LKO", name: "Lucknow Junction" },
  "Patna": { code: "PNBE", name: "Patna Junction" },
  "Bhopal": { code: "BPL", name: "Bhopal Junction" },
  "Ranchi": { code: "RNC", name: "Ranchi Junction" },
  "Bhubaneswar": { code: "BBS", name: "Bhubaneswar" },
  "Hyderabad": { code: "HYB", name: "Hyderabad Deccan" },
  "Gandhinagar": { code: "ADI", name: "Ahmedabad Junction" },
  "Dehradun": { code: "DDN", name: "Dehradun" },
  "Shimla": { code: "SML", name: "Shimla" },
  "Srinagar": { code: "SML", name: "Shimla" },
  "Dispur": { code: "GHY", name: "Guwahati" },
  "Thiruvananthapuram": { code: "TVC", name: "Thiruvananthapuram Central" }
};

export const STATION_GEO: Record<string, [number, number]> = {
  "NDLS": [28.64, 77.22], "DEE": [28.64, 77.22], "DLI": [28.67, 77.23], "NZM": [28.58, 77.25],
  "PNBE": [25.60, 85.10], "RJPB": [25.61, 85.13],
  "HJP": [25.68, 85.22],
  "MMCT": [18.97, 72.82], "BCT": [19.17, 72.83], "CSMT": [18.94, 72.84], "LTT": [19.07, 72.93],
  "HWH": [22.58, 88.34], "SDAH": [22.58, 88.37], "KOAA": [22.57, 88.36],
  "MAS": [13.08, 80.28], "MS": [13.04, 80.25],
  "BLR": [12.98, 77.57], "SBC": [12.98, 77.57], "YPR": [13.01, 77.55],
  "HYB": [17.38, 78.49], "SC": [17.43, 78.50],
  "PNQ": [18.53, 73.87], "PUNE": [18.53, 73.87],
  "JP": [26.92, 75.79], "JU": [26.30, 73.02], "AII": [26.45, 74.64],
  "KSG": [26.57, 74.87], "BHL": [25.35, 74.64], "COR": [24.88, 74.62],
  "NMH": [24.47, 74.87], "MDS": [24.07, 75.07], "RTM": [23.33, 75.03],
  "DHD": [22.83, 74.25], "BRC": [22.31, 73.18], "ST": [21.17, 72.83],
  "BVI": [19.23, 72.86], "BDTS": [19.06, 72.84],
  "ADI": [23.02, 72.58],
  "BPL": [23.27, 77.42], "INDB": [22.72, 75.80],
  "NGP": [21.15, 79.09],
  "CNB": [26.45, 80.35], "LKO": [26.85, 80.95], "LJN": [26.85, 80.95],
  "PRYJ": [25.43, 81.85], "ALD": [25.43, 81.85],
  "GWL": [26.22, 78.18], "AGC": [27.18, 78.02], "AF": [27.18, 78.01],
  "BSB": [25.32, 83.00], "DDU": [25.27, 83.01], "MGS": [25.38, 83.58],
  "GKP": [26.75, 83.37],
  "JAT": [32.73, 74.87], "SVDK": [32.98, 74.95],
  "SML": [31.10, 77.17], "KLK": [30.84, 76.94],
  "CDG": [30.73, 76.79], "UMB": [30.38, 76.77],
  "ASR": [31.63, 74.88], "LDH": [30.91, 75.86],
  "DDN": [30.32, 78.03],
  "DBG": [26.15, 85.90], "SPJ": [25.93, 85.78],
  "RNC": [23.35, 85.33], "HTE": [23.37, 85.32],
  "GAY": [24.80, 85.00],
  "NJP": [26.71, 88.43],
  "GHY": [26.18, 91.75], "KYQ": [26.18, 91.75],
  "TATA": [22.79, 86.19], "JSG": [22.80, 86.19],
  "BBS": [20.27, 85.84], "PURI": [19.80, 85.83],
  "VSKP": [17.72, 83.22], "BZA": [16.52, 80.62],
  "TVC": [8.50, 76.95], "ERS": [10.00, 76.29], "CLT": [11.25, 75.78],
  "CBE": [11.00, 76.96], "MDU": [9.92, 78.12], "TPJ": [10.79, 79.14],
  "SRR": [13.34, 77.12], "MYS": [12.30, 76.65],
  "UDZ": [24.58, 73.69],
  "KOTA": [25.18, 75.85],
  "RJT": [22.30, 70.78],
  "GIMB": [21.52, 70.47],
  "ABR": [24.48, 72.71],
  "MFP": [26.67, 84.37], "RXL": [26.76, 84.85],
  "KIR": [25.40, 87.23], "BGP": [25.25, 86.97],
  "SUR": [17.66, 75.91], "KOP": [16.17, 74.60], "UBL": [15.43, 75.07],
  "GNT": [16.30, 80.44],
  "MAQ": [12.87, 74.88], "ALLP": [9.49, 76.33],
  "AGTL": [23.89, 91.27], "DLO": [25.58, 93.73],
  "JHS": [25.43, 78.57], "MTJ": [27.49, 77.67],
  "CAPE": [8.08, 77.54],
  "ET": [24.18, 78.20],
  "AWR": [25.34, 73.05],
};

// SVG projection fallback to keep typing backwards compatible
export function projectGeo(lat: number, lng: number): { x: number; y: number } {
  const VB_W = 500;
  const VB_H = 560;
  // Dynamic scale projection to perfectly center India's map in the SVG bounding box
  const x = ((lng - 66.5) / 32) * (VB_W - 60) + 30;
  const y = ((37.8 - lat) / 31) * (VB_H - 60) + 30;
  return { x, y };
}

export interface RouteCoord {
  code: string;
  name: string;
  lat: number;
  lng: number;
  arrival?: string;
  departure?: string;
  platform?: string;
  trainDetails?: string;
  transferInfo?: string;
}

export const ACTIVE_MAJOR_HUBS: RouteCoord[] = [
  { code: "NDLS", name: "New Delhi Junction", lat: 28.64, lng: 77.22, arrival: "Major North Hub", departure: "400+ Daily Trains", platform: "16 Platforms", trainDetails: "Rajdhani, Shatabdi, Vande Bharat", transferInfo: "Central Interconnection Gateway" },
  { code: "PNBE", name: "Patna Junction", lat: 25.60, lng: 85.10, arrival: "Major East Hub", departure: "180+ Daily Trains", platform: "10 Platforms", trainDetails: "Tejas Rajdhani, Garib Rath, Express", transferInfo: "East-West Transit Gateway" },
  { code: "JP", name: "Jaipur Junction", lat: 26.92, lng: 75.79, arrival: "Major West Hub", departure: "150+ Daily Trains", platform: "7 Platforms", trainDetails: "Double Decker, Shatabdi, SF Express", transferInfo: "Desert Circuit Connector" },
  { code: "CSMT", name: "Mumbai CSMT", lat: 18.94, lng: 72.84, arrival: "Major West Terminus", departure: "250+ Daily Trains", platform: "18 Platforms", trainDetails: "Tejas Express, SF Express, Duronto", transferInfo: "Heritage West Coast Terminus" },
  { code: "HWH", name: "Howrah Junction", lat: 22.58, lng: 88.34, arrival: "Major East Terminus", departure: "350+ Daily Trains", platform: "23 Platforms", trainDetails: "Kolkata Shatabdi, Duronto, Express", transferInfo: "Eastern Railway Zone Hub" },
  { code: "SBC", name: "Bengaluru City Jn", lat: 12.98, lng: 77.57, arrival: "Major South Hub", departure: "120+ Daily Trains", platform: "10 Platforms", trainDetails: "SBC Shatabdi, SF Express, Mail", transferInfo: "Silicon Valley Core Gateway" },
  { code: "MAS", name: "Chennai Central", lat: 13.08, lng: 80.28, arrival: "Major South Terminus", departure: "160+ Daily Trains", platform: "11 Platforms", trainDetails: "MAS Shatabdi, SF Express, Duronto", transferInfo: "Southern Corridor Connector" }
];

interface IndiaRouteMapProps {
  isDarkMode: boolean;
  routeStops: RouteCoord[];
  originCode: string;
  destCode: string;
  selectedRoute?: any;
  onSelectOrigin?: (code: string, name: string) => void;
  onSelectDest?: (code: string, name: string) => void;
}

export function IndiaRouteMap({ isDarkMode, routeStops, originCode, destCode, selectedRoute, onSelectOrigin, onSelectDest }: IndiaRouteMapProps) {
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: -15, y: -25 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<RouteCoord | null>(null);
  const [hoveredCapital, setHoveredCapital] = useState<Capital | null>(null);
  const [hoveredState, setHoveredState] = useState<StateOutline | null>(null);
  const [clickedNode, setClickedNode] = useState<{ node: any; type: 'station' | 'capital'; x: number; y: number } | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Generate path coordinates for the border outline
  const indiaBorderPath = useMemo(() => {
    return INDIA_BORDER_OUTLINE.map((coord, i) => {
      const { x, y } = projectGeo(coord[0], coord[1]);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  }, []);

  const stateBorderPaths = useMemo(() => {
    return STATE_OUTLINES.map(state => {
      const pathData = state.coords.map((coord, i) => {
        const { x, y } = projectGeo(coord[0], coord[1]);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ') + ' Z';
      return { ...state, pathData };
    });
  }, []);

  const activeStops = useMemo(() => {
    return routeStops && routeStops.length > 0 ? routeStops : ACTIVE_MAJOR_HUBS;
  }, [routeStops]);

  // Project active stops to SVG coordinates
  const projectedStops = useMemo(() => {
    return activeStops.map(stop => {
      const coords = projectGeo(stop.lat, stop.lng);
      return {
        ...stop,
        x: coords.x,
        y: coords.y
      };
    });
  }, [activeStops]);

  // Dynamic automatic centering on route stops
  useEffect(() => {
    if (projectedStops.length === 0) return;
    
    // Calculate bounding box of active stops
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    projectedStops.forEach(s => {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Determine appropriate zoom level based on bounding size
    const width = maxX - minX || 50;
    const height = maxY - minY || 50;
    const maxDim = Math.max(width, height);
    
    let targetZoom = 1.35;
    if (maxDim > 300) targetZoom = 0.95;
    else if (maxDim > 200) targetZoom = 1.15;
    else if (maxDim > 100) targetZoom = 1.35;
    else targetZoom = 1.65;

    // Set pan to center the box inside our 500x560 viewport
    setZoom(targetZoom);
    setPan({
      x: (250 - centerX * targetZoom),
      y: (280 - centerY * targetZoom)
    });
  }, [projectedStops]);

  // Extract real leg details for stops
  const getStationDetails = (stop: RouteCoord) => {
    const code = stop.code;
    const isOrigin = code === originCode;
    const isDest = code === destCode;

    if (stop.arrival || stop.departure || stop.platform || stop.trainDetails || stop.transferInfo) {
      return {
        arrival: stop.arrival || "N/A",
        departure: stop.departure || "N/A",
        platform: stop.platform || "Pf #1",
        transferInfo: stop.transferInfo || "",
        trainDetails: stop.trainDetails || ""
      };
    }

    let arrival = "N/A";
    let departure = "N/A";
    let platform = "Pf #1";
    let transferInfo = "";
    let trainDetails = "";

    if (!selectedRoute) {
      if (isOrigin) {
        return { arrival: "Origin Terminus", departure: "Synced Scheduled Time", platform: "Pf #1", transferInfo: "Starting Station", trainDetails: "Command Scheduled" };
      }
      if (isDest) {
        return { arrival: "Scheduled Terminus", departure: "Terminus locked", platform: "Pf #3", transferInfo: "Destination", trainDetails: "Terminus locked" };
      }
      return { arrival: "Syncing...", departure: "Syncing...", platform: "Pf #2", transferInfo: "Platform transition", trainDetails: "Intermediate step" };
    }

    const incomingLeg = selectedRoute.legs.find((l: any) => {
      const toCode = l.to.match(/\(([^)]+)\)/)?.[1] || l.to;
      return toCode === code && l.type === "train";
    });
    
    const outgoingLeg = selectedRoute.legs.find((l: any) => {
      const fromCode = l.from.match(/\(([^)]+)\)/)?.[1] || l.from;
      return fromCode === code && l.type === "train";
    });

    const transferLeg = selectedRoute.legs.find((l: any) => {
      if (l.type !== "transfer") return false;
      const fromCode = l.from.match(/\(([^)]+)\)/)?.[1] || l.from;
      const toCode = l.to.match(/\(([^)]+)\)/)?.[1] || l.to;
      return fromCode === code || toCode === code;
    });

    if (isOrigin) {
      arrival = "Origin Hub";
      if (outgoingLeg) {
        departure = outgoingLeg.depTime || "N/A";
        platform = outgoingLeg.platform || "Pf #1";
        trainDetails = `${outgoingLeg.name || "Express"} (${outgoingLeg.number || "Train"})`;
      }
    } else if (isDest) {
      departure = "Destination Terminus";
      if (incomingLeg) {
        arrival = incomingLeg.arrTime || "N/A";
        platform = incomingLeg.platform || "Pf #3";
        trainDetails = `${incomingLeg.name || "Express"} (${incomingLeg.number || "Train"})`;
      }
    } else {
      if (incomingLeg) {
        arrival = incomingLeg.arrTime || "N/A";
      }
      if (outgoingLeg) {
        departure = outgoingLeg.depTime || "N/A";
        platform = outgoingLeg.platform || "Pf #2";
        trainDetails = `${outgoingLeg.name || "Express"} (${outgoingLeg.number || "Train"})`;
      }

      if (incomingLeg && outgoingLeg && incomingLeg.platform && outgoingLeg.platform) {
        if (incomingLeg.platform !== outgoingLeg.platform) {
          platform = `${incomingLeg.platform} → ${outgoingLeg.platform}`;
        }
      }
    }

    if (transferLeg) {
      const fromCode = transferLeg.from.match(/\(([^)]+)\)/)?.[1] || transferLeg.from;
      const toCode = transferLeg.to.match(/\(([^)]+)\)/)?.[1] || transferLeg.to;
      
      if (fromCode !== toCode) {
        transferInfo = `Different Station Cab Transit via GMaps India`;
      } else {
        const fromPlat = incomingLeg?.platform || "Pf #2";
        const toPlat = outgoingLeg?.platform || "Pf #5";
        transferInfo = `Platform Switch: ${fromPlat} → ${toPlat}, 10 mins walk`;
      }
    }

    return { arrival, departure, platform, transferInfo, trainDetails };
  };

  // Drag handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Render glowing curved paths for route legs
  const routePathSegments = useMemo(() => {
    if (projectedStops.length < 2) return null;
    const paths: any[] = [];
    
    for (let i = 0; i < projectedStops.length - 1; i++) {
      const start = projectedStops[i];
      const end = projectedStops[i + 1];

      // Draw elegant curved arcs (flight-route styled) rather than boring straight lines
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; // curve radius

      // Alternating colors for split-route aesthetics
      const isTransfer = selectedRoute?.legs?.[i]?.type === "transfer";
      const color = isTransfer 
        ? "#00FFCC" // Glowing Teal/Green for cab/transfer hops
        : i % 2 === 0 
          ? "#0066FF" // Glowing Electric Blue
          : "#BD00FF"; // Glowing Purple

      const pathData = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${dr.toFixed(1)} ${dr.toFixed(1)} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
      
      paths.push({
        pathData,
        color,
        isTransfer,
        fromCode: start.code,
        toCode: end.code
      });
    }

    return paths;
  }, [projectedStops, selectedRoute]);

  // Reset zoom & pan to perfectly fit India outline
  const resetZoom = () => {
    setZoom(1.15);
    setPan({ x: -15, y: -25 });
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => setClickedNode(null)}
      className="w-full h-full relative overflow-hidden select-none bg-slate-950/40 rounded-3xl border border-white/5 backdrop-blur-xl"
    >
      {/* ── TOP MAP CONTROLS ── */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md text-[9px] font-black font-mono tracking-widest text-[#00FFCC] shadow-2xl">
          <Activity className="w-3.5 h-3.5 animate-pulse text-[#00FFCC]" />
          TELEMETRY MAP VIEW
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-1.5">
        <button 
          onClick={() => setZoom(prev => Math.min(3, prev + 0.15))}
          className="w-8 h-8 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-[#00FFCC] hover:bg-slate-800 transition-all cursor-pointer shadow-lg"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoom(prev => Math.max(0.6, prev - 0.15))}
          className="w-8 h-8 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-[#00FFCC] hover:bg-slate-800 transition-all cursor-pointer shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button 
          onClick={resetZoom}
          className="w-8 h-8 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-[#00FFCC] hover:bg-slate-800 transition-all cursor-pointer shadow-lg"
          title="Reset Map View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* ── LIVE TELEMETRY FLOATING HUD PANEL (Starting station & details) ── */}
      <div className="absolute bottom-4 left-4 right-4 sm:left-4 sm:right-auto z-10 p-4 rounded-2xl bg-slate-950/80 border border-white/10 backdrop-blur-md shadow-2xl max-w-sm flex flex-col gap-2">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <h4 className="text-[10px] font-black uppercase font-mono tracking-widest text-slate-200">ACTIVE ROUTE TELEMETRY</h4>
          </div>
          <span className="text-[8px] font-bold font-mono text-[#00FFCC] bg-[#00FFCC]/10 px-2 py-0.5 rounded border border-[#00FFCC]/20">100% SECURE</span>
        </div>
        
        {projectedStops.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Origin Node:</span>
              <span className="font-mono font-black text-blue-400">{projectedStops[0].name} ({projectedStops[0].code})</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Platform Info:</span>
              <span className="font-mono font-bold text-amber-400 bg-amber-400/5 px-2 py-0.5 rounded border border-amber-400/10">
                {getStationDetails(projectedStops[0]).platform || "Pf #1"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 font-medium">Lounge Sync Status:</span>
              <span className="text-emerald-400 font-mono font-black flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> ACTIVE SYNCED
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── MAP CONTAINER ── */}
      <div 
        onMouseDown={handleMouseDown}
        className={`w-full h-full cursor-grab ${isDragging ? "cursor-grabbing" : ""}`}
      >
        <svg 
          width="100%" 
          height="100%" 
          viewBox="0 0 500 560" 
          className="w-full h-full transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0"
          }}
        >
          {/* Definitions for gorgeous neon glows */}
          <defs>
            <filter id="neon-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="neon-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0066FF" />
              <stop offset="100%" stopColor="#00FFCC" />
            </linearGradient>
          </defs>

          {/* Grid Background Lines for Tech/Cyber Feel */}
          <g stroke="rgba(255, 255, 255, 0.015)" strokeWidth="0.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`h-${i}`} x1="0" y1={i * 30} x2="500" y2={i * 30} />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 25} y1="0" x2={i * 25} y2="560" />
            ))}
          </g>

          {/* ── INDIA BORDERS vector outline with dynamic amber glow ── */}
          <path
            d={indiaBorderPath}
            className="stroke-[#FFA800]/25 stroke-[1.5] fill-[#0B132B]/60 transition-all duration-300"
          />
          
          {/* ── STATE BORDERS vector outlines with cyber hover effect ── */}
          <g>
            {stateBorderPaths.map((state) => {
              const isHovered = hoveredState?.id === state.id;
              return (
                <path
                  key={state.id}
                  d={state.pathData}
                  onMouseEnter={() => setHoveredState(state)}
                  onMouseLeave={() => setHoveredState(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const matchingCap = STATE_CAPITALS.find(c => c.state.toLowerCase() === state.name.toLowerCase() || (state.id === "JK" && c.state.includes("Jammu")));
                    if (matchingCap) {
                      const coords = projectGeo(matchingCap.lat, matchingCap.lng);
                      setClickedNode({
                        node: matchingCap,
                        type: 'capital',
                        x: coords.x,
                        y: coords.y
                      });
                    }
                  }}
                  className={`cursor-pointer transition-all duration-300 fill-transparent stroke-[0.8] ${
                    isHovered 
                      ? "stroke-[#00E5FF] fill-[#00E5FF]/5" 
                      : "stroke-white/[0.08]"
                  }`}
                  style={{
                    filter: isHovered ? "drop-shadow(0px 0px 4px rgba(0,229,255,0.3))" : "none"
                  }}
                />
              );
            })}
          </g>

          <path
            d={indiaBorderPath}
            className="stroke-[#FFA800] stroke-[1.8] fill-none filter transition-all duration-300"
            style={{
              filter: "drop-shadow(0px 0px 8px rgba(255,168,0,0.4))",
            }}
          />

          {/* ── STATE CAPITALS: elegant pulsing markers ── */}
          <g>
            {STATE_CAPITALS.map((cap, idx) => {
              const { x, y } = projectGeo(cap.lat, cap.lng);
              const isHovered = hoveredCapital?.name === cap.name;

              return (
                <g 
                  key={idx}
                  onMouseEnter={() => setHoveredCapital(cap)}
                  onMouseLeave={() => setHoveredCapital(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setClickedNode({
                      node: cap,
                      type: 'capital',
                      x,
                      y
                    });
                  }}
                  className="cursor-pointer"
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 4.5 : 2.5}
                    className="fill-[#FFB800] stroke-black stroke-1 transition-all duration-200"
                  />
                  {isHovered && (
                    <circle
                      cx={x}
                      cy={y}
                      r="9"
                      className="fill-none stroke-[#FFB800]/40 stroke-1 animate-ping"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* ── ACTIVE SEGMENT ROUTE ARCS ── */}
          {routePathSegments && routePathSegments.map((seg, idx) => (
            <g key={idx}>
              {/* Outer Glow Line */}
              <path
                d={seg.pathData}
                fill="none"
                stroke={seg.color}
                strokeWidth="4.5"
                className="opacity-20 blur-[2px] transition-all"
              />
              
              {/* Main Core Vector Line */}
              <path
                d={seg.pathData}
                fill="none"
                stroke={seg.color}
                strokeWidth="2.2"
                strokeDasharray={seg.isTransfer ? "4, 4" : "none"}
                className="transition-all"
              />

              {/* Dynamic Animated Pulse Particle running down the active segment arc */}
              <path
                d={seg.pathData}
                fill="none"
                stroke={seg.isTransfer ? "#00FFCC" : "#FFF"}
                strokeWidth="2.5"
                strokeDasharray="15, 120"
                className="transition-all"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  values="135;0"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
          ))}

          {/* ── ACTIVE STATION NODES & TOOLTIPS ── */}
          <g>
            {projectedStops.map((stop, idx) => {
              const isOrigin = stop.code === originCode;
              const isDest = stop.code === destCode;
              const isHovered = hoveredNode?.code === stop.code;
              
              // Colors matching node type
              const nodeColor = isOrigin 
                ? "#0066FF" // starting
                : isDest 
                  ? "#00FFCC" // terminus
                  : "#BD00FF"; // intermediate

              return (
                <g 
                  key={idx}
                  onMouseEnter={() => setHoveredNode(stop)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setClickedNode({
                      node: stop,
                      type: 'station',
                      x: stop.x,
                      y: stop.y
                    });
                  }}
                  className="cursor-pointer"
                >
                  {/* Pulsing ring outer */}
                  <circle
                    cx={stop.x}
                    cy={stop.y}
                    r={isHovered ? 13 : 9}
                    fill={`${nodeColor}1a`}
                    stroke={nodeColor}
                    strokeWidth={isHovered ? 1.5 : 1}
                    className="transition-all duration-300"
                  />

                  {/* Core solid inner */}
                  <circle
                    cx={stop.x}
                    cy={stop.y}
                    r={isHovered ? 5.5 : 4}
                    fill={nodeColor}
                    stroke="#FFF"
                    strokeWidth="1.2"
                    className="transition-all duration-300 filter drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]"
                  />

                  {/* Small text node indicator on map */}
                  <text
                    x={stop.x}
                    y={stop.y - 14}
                    textAnchor="middle"
                    className="text-[8px] font-black font-mono tracking-tight fill-slate-200 bg-black/80 p-0.5 rounded"
                    style={{ paintOrder: "stroke", stroke: "#070B19", strokeWidth: 3 }}
                  >
                    {stop.code}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* ── HOVER TELEMETRY POPUP TOOLTIPS (HTML overlay based) ── */}
      <AnimatePresence>
        {hoveredNode && (() => {
          const details = getStationDetails(hoveredNode);
          const isOrigin = hoveredNode.code === originCode;
          const isDest = hoveredNode.code === destCode;
          
          // Calculate floating coordinates based on projection & zoom/pan
          const rawCoords = projectGeo(hoveredNode.lat, hoveredNode.lng);
          const left = rawCoords.x * zoom + pan.x;
          const top = rawCoords.y * zoom + pan.y - 120;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                transform: "translateX(-50%)",
              }}
              className="z-50 p-4 rounded-2xl bg-slate-950/90 border border-[#0066FF]/30 backdrop-blur-xl shadow-2xl min-w-[210px] pointer-events-none"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <div>
                  <span className={`text-[7px] font-mono font-black px-1.5 py-0.5 rounded tracking-widest ${
                    isOrigin ? "bg-blue-500/15 text-blue-400" : isDest ? "bg-emerald-500/15 text-emerald-400" : "bg-purple-500/15 text-purple-400"
                  }`}>
                    {isOrigin ? "🟢 DEPARTURE STATION" : isDest ? "🏁 TERMINUS TERMINAL" : "🔵 TRANSIT HUB"}
                  </span>
                  <h5 className="text-xs font-black tracking-tight text-white mt-1">
                    {hoveredNode.name}
                  </h5>
                </div>
                <span className="text-[9px] font-mono font-black text-slate-400 ml-3">
                  {hoveredNode.code}
                </span>
              </div>

              <div className="space-y-1.5 text-[10px]">
                {details.trainDetails && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Active Train:</span>
                    <span className="font-mono font-bold text-slate-200 truncate max-w-[110px]">{details.trainDetails}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Scheduled Time:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {isOrigin ? `Departs: ${details.departure}` : isDest ? `Arrives: ${details.arrival}` : `${details.arrival} ➜ ${details.departure}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Platform Code:</span>
                  <span className="font-mono font-black text-[#00FFCC] bg-[#00FFCC]/5 border border-[#00FFCC]/10 px-1.5 py-0.2 rounded">
                    {details.platform}
                  </span>
                </div>
                {details.transferInfo && (
                  <div className="border-t border-white/5 pt-1.5 mt-1.5 text-[9px] text-amber-400 font-bold flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{details.transferInfo}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}

        {hoveredCapital && (() => {
          const rawCoords = projectGeo(hoveredCapital.lat, hoveredCapital.lng);
          const left = rawCoords.x * zoom + pan.x;
          const top = rawCoords.y * zoom + pan.y - 70;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                transform: "translateX(-50%)",
              }}
              className="z-40 px-2.5 py-1.5 rounded-lg bg-black/80 border border-amber-400/25 backdrop-blur-md shadow-lg pointer-events-none text-center"
            >
              <p className="text-[9px] font-black text-slate-200">👑 {hoveredCapital.name}</p>
              <p className="text-[7.5px] font-mono text-amber-400 uppercase tracking-wider mt-0.5">{hoveredCapital.state}</p>
            </motion.div>
          );
        })()}

        {clickedNode && (() => {
          let title = '';
          let subtitle = '';
          let stnCode = '';
          let stnName = '';

          if (clickedNode.type === 'capital') {
            const cap = clickedNode.node as Capital;
            const mapped = CAPITAL_STATION_MAP[cap.name] || { code: cap.name.substring(0, 4).toUpperCase(), name: cap.name };
            title = `👑 ${cap.name}`;
            subtitle = `${cap.state} State Capital`;
            stnCode = mapped.code;
            stnName = mapped.name;
          } else {
            const stop = clickedNode.node as RouteCoord;
            title = `🚉 ${stop.name}`;
            subtitle = `Station Hub`;
            stnCode = stop.code;
            stnName = stop.name;
          }

          const left = clickedNode.x * zoom + pan.x;
          const top = clickedNode.y * zoom + pan.y - 100;

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                transform: "translateX(-50%)",
              }}
              className="z-50 p-4 rounded-2xl bg-slate-950/95 border border-[#00FFCC]/40 backdrop-blur-2xl shadow-[0_0_30px_rgba(0,255,204,0.15)] min-w-[220px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
                <div>
                  <h5 className="text-xs font-black tracking-tight text-[#00FFCC]">
                    {title}
                  </h5>
                  <p className="text-[8px] font-bold text-slate-400 mt-0.5 tracking-wider uppercase">
                    {subtitle}
                  </p>
                </div>
                <button 
                  onClick={() => setClickedNode(null)} 
                  className="text-slate-400 hover:text-white transition-colors text-[10px] font-black p-1 hover:bg-white/5 rounded"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-slate-900/60 border border-white/5 p-2 rounded-xl flex items-center justify-between">
                  <div className="text-[8px] font-bold text-slate-500">MAPPED RAIL HUB:</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black font-mono bg-[#0066FF]/10 border border-[#0066FF]/20 px-1.5 py-0.2 rounded text-blue-400">
                      {stnCode}
                    </span>
                    <span className="text-[9px] font-bold text-slate-200 truncate max-w-[80px]">
                      {stnName}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (onSelectOrigin) onSelectOrigin(stnCode, stnName);
                      setClickedNode(null);
                    }}
                    className="w-full py-2 px-2 text-[8px] font-black font-mono uppercase tracking-widest text-center rounded-lg bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/40 text-blue-300 hover:text-white transition-all shadow-md active:translate-y-px"
                  >
                    FROM HERE
                  </button>
                  <button
                    onClick={() => {
                      if (onSelectDest) onSelectDest(stnCode, stnName);
                      setClickedNode(null);
                    }}
                    className="w-full py-2 px-2 text-[8px] font-black font-mono uppercase tracking-widest text-center rounded-lg bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/40 text-emerald-300 hover:text-white transition-all shadow-md active:translate-y-px"
                  >
                    TO HERE
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

export default IndiaRouteMap;
