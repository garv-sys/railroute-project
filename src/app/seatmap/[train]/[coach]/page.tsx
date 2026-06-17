"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Train, ArrowLeft, Lock, Compass, Info, Grid, ShieldCheck, Moon, Sun,
  CheckCircle2, AlertCircle, Copy, Check, Share2
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";

// ═══════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════

const STATION_DETAILS: Record<string, { name: string }> = {
  'PNBE': { name: 'Patna Junction' },
  'PPTA': { name: 'Patliputra Junction' },
  'DNR':  { name: 'Danapur' },
  'RJPB': { name: 'Rajendra Nagar Terminal' },
  'NDLS': { name: 'New Delhi' },
  'NZM':  { name: 'Hazrat Nizamuddin' },
  'ANVT': { name: 'Anand Vihar Terminal' },
  'DLI':  { name: 'Old Delhi Junction' },
  'MAS':  { name: 'Chennai Central' },
  'PER':  { name: 'Perambur' },
  'MS':   { name: 'Chennai Egmore' },
  'JP':   { name: 'Jaipur Junction' },
  'DDU':  { name: 'Pt. Deen Dayal Upadhyaya Junction' },
  'PRYJ': { name: 'Prayagraj Junction' },
  'CNB':  { name: 'Kanpur Central' },
  'BSB':  { name: 'Varanasi Junction' },
  'LKO':  { name: 'Lucknow Charbagh' },
  'BPL':  { name: 'Bhopal Junction' },
  'NGP':  { name: 'Nagpur Junction' },
  'ET':   { name: 'Itarsi Junction' },
  'JBP':  { name: 'Jabalpur Junction' },
  'SML':  { name: 'Shimla' },
  'KLK':  { name: 'Kalka Junction' },
  'CDG':  { name: 'Chandigarh' },
  'UMB':  { name: 'Ambala Cantonment' },
  'LDH':  { name: 'Ludhiana Junction' },
  'DJJ':  { name: 'Darjeeling' },
  'NJP':  { name: 'New Jalpaiguri' },
  'SVDK': { name: 'Shri Mata Vaishno Devi Katra' },
  'JAT':  { name: 'Jammu Tawi' },
  'MTP':  { name: 'Mettupalayam' },
  'UAM':  { name: 'Udagamandalam (Ooty)' },
  'MAO':  { name: 'Madgaon (Goa)' },
  'VSG':  { name: 'Vasco da Gama (Goa)' },
  'HWH':  { name: 'Howrah Junction' },
  'SDAH': { name: 'Sealdah Junction' },
  'SC':   { name: 'Secunderabad Junction' },
  'HYB':  { name: 'Hyderabad Deccan' },
  'HJP':  { name: 'Hajipur Junction' }
};

const TRAIN_LOOKUP: Record<string, { name: string, fromCode: string, fromName: string, toName: string, platform: string }> = {
  "12273": { name: "Patna Duronto Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "New Delhi", platform: "Pf #1" },
  "12005": { name: "Kalka Shatabdi Express", fromCode: "NDLS", fromName: "New Delhi", toName: "Kalka Jn", platform: "Pf #5" },
  "52451": { name: "Shivalik Deluxe (Toy Train)", fromCode: "KLK", fromName: "Kalka Jn", toName: "Shimla", platform: "Pf #6" },
  "12309": { name: "Patna Rajdhani Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "New Delhi", platform: "Pf #1" },
  "12381": { name: "Poorva Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "New Delhi", platform: "Pf #3" },
  "52455": { name: "Himalayan Queen (Toy Train)", fromCode: "KLK", fromName: "Kalka Jn", toName: "Shimla", platform: "Pf #6" },
  "12957": { name: "Jaipur Rajdhani Express", fromCode: "JP", fromName: "Jaipur Jn", toName: "New Delhi", platform: "Pf #1" },
  "12015": { name: "Ajmer Shatabdi Express", fromCode: "NDLS", fromName: "New Delhi", toName: "Jaipur Jn", platform: "Pf #5" },
  "12985": { name: "Double Decker Express", fromCode: "JP", fromName: "Jaipur Jn", toName: "New Delhi", platform: "Pf #5" },
  "12553": { name: "Vaishali Express", fromCode: "HJP", fromName: "Hajipur Jn", toName: "New Delhi", platform: "Pf #1" },
  "12948": { name: "Patna Jaipur Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "Jaipur Jn", platform: "Pf #1" },
  "12901": { name: "SuperFast Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "Jaipur Jn", platform: "Pf #2" },
  "12208": { name: "Garib Rath Express", fromCode: "PNBE", fromName: "Patna Jn", toName: "Jaipur Jn", platform: "Pf #4" },
  "12301": { name: "Kolkata Rajdhani Express", fromCode: "HWH", fromName: "Howrah Jn", toName: "New Delhi", platform: "Pf #1" },
  "12088": { name: "Shatabdi Express", fromCode: "NDLS", fromName: "New Delhi", toName: "Kolkata", platform: "Pf #5" }
};

function generateSeatsForCoach(trainNo: string, coachClass: string, coachName: string) {
  const seats = [];
  const cleanClass = coachClass.split(" ")[0].toUpperCase().trim();
  
  let totalSeats = 72;
  if (cleanClass === "1A") totalSeats = 24;
  else if (cleanClass === "2A") totalSeats = 46;
  else if (cleanClass === "3A" || cleanClass === "SL") totalSeats = 72;
  else if (cleanClass === "CC" || cleanClass === "EC") totalSeats = 75;
  
  for (let i = 1; i <= totalSeats; i++) {
    let hash = 5381;
    const seed = trainNo + cleanClass + coachName + i;
    for (let j = 0; j < seed.length; j++) {
      hash = ((hash << 5) + hash) + seed.charCodeAt(j);
    }
    const mod = Math.abs(hash) % 100;
    
    let status: "available" | "occupied" | "rac" = "available";
    if (mod < 40) {
      status = "occupied";
    } else if (mod < 55 && ["3A", "SL", "2A"].includes(cleanClass)) {
      status = "rac";
    }
    
    let berthType = "LB";
    if (cleanClass === "3A" || cleanClass === "SL") {
      const seatInBay = (i - 1) % 8;
      if (seatInBay === 0 || seatInBay === 3) berthType = "LB";
      else if (seatInBay === 1 || seatInBay === 4) berthType = "MB";
      else if (seatInBay === 2 || seatInBay === 5) berthType = "UB";
      else if (seatInBay === 6) berthType = "SL";
      else berthType = "SU";
    } else if (cleanClass === "2A") {
      const seatInBay = (i - 1) % 6;
      if (seatInBay === 0 || seatInBay === 2) berthType = "LB";
      else if (seatInBay === 1 || seatInBay === 3) berthType = "UB";
      else if (seatInBay === 4) berthType = "SL";
      else berthType = "SU";
    } else if (cleanClass === "1A") {
      const seatInBay = (i - 1) % 4;
      if (seatInBay === 0 || seatInBay === 2) berthType = "LB";
      else berthType = "UB";
    } else {
      const seatInRow = (i - 1) % 5;
      if (seatInRow === 0 || seatInRow === 4) berthType = "Window";
      else if (seatInRow === 1 || seatInRow === 3) berthType = "Aisle";
      else berthType = "Middle";
    }
    
    seats.push({
      number: i,
      type: berthType,
      status
    });
  }
  return seats;
}

export default function StandaloneSeatMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const trainNo = (params.train as string) || "12309";
  const coachName = (params.coach as string) || "B1";
  
  // Infer class if search param is not provided:
  // B = 3A, A = 2A, H = 1A, S = SL, C = CC, E = EC
  const classParam = searchParams.get("class");
  const activeClass = useMemo(() => {
    if (classParam) return classParam.toUpperCase();
    const first = coachName.charAt(0).toUpperCase();
    if (first === "B") return "3A";
    if (first === "A") return "2A";
    if (first === "H") return "1A";
    if (first === "S") return "SL";
    if (first === "C") return "CC";
    if (first === "E") return "EC";
    return "3A";
  }, [coachName, classParam]);

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const d = isDarkMode;

  const trainInfo = useMemo(() => {
    return TRAIN_LOOKUP[trainNo] || {
      name: `Special Superfast Express`,
      fromCode: "NDLS",
      fromName: "New Delhi",
      toName: "Destination",
      platform: "Pf #1"
    };
  }, [trainNo]);

  const fromCode = trainInfo.fromCode;
  const junctionName = useMemo(() => {
    const base = STATION_DETAILS[fromCode]?.name || trainInfo.fromName;
    const cleanBase = base.trim();
    const needsJunction = !["junction", "terminal", "cantonment", "deccan", "central", "jn"].some(s => cleanBase.toLowerCase().includes(s));
    return needsJunction ? `${cleanBase} Junction` : cleanBase;
  }, [fromCode, trainInfo.fromName]);

  const platformConfidence = useMemo(() => {
    let hash = 5381;
    const seed = trainNo + fromCode;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    }
    return 85 + (Math.abs(hash) % 14);
  }, [trainNo, fromCode]);

  const seatsList = useMemo(() => {
    return generateSeatsForCoach(trainNo, activeClass, coachName);
  }, [trainNo, activeClass, coachName]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      triggerToast("Standalone Seat Map link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleLockSeats = () => {
    if (selectedSeats.length === 0) return;
    triggerToast(`Berths Reserved! Coach: ${coachName} | Seats: ${selectedSeats.join(", ")} | Ticket allocation synced with IRCTC!`);
  };

  // Render Seat Helper
  const renderSeatButton = (seat: any) => {
    if (!seat) return null;
    const isSelected = selectedSeats.includes(seat.number);
    const isOccupied = seat.status === "occupied";
    const isRAC = seat.status === "rac";
    
    let btnClass = "";
    if (isOccupied) {
      btnClass = d 
        ? "bg-slate-900/50 border-white/5 text-slate-700 cursor-not-allowed" 
        : "bg-slate-100 border-slate-200/60 text-slate-400 cursor-not-allowed";
    } else if (isSelected) {
      btnClass = "bg-[#EAB308] border-[#EAB308] text-slate-950 shadow-[0_0_12px_rgba(234,179,8,0.55)] scale-105";
    } else if (isRAC) {
      btnClass = d
        ? "bg-amber-500/5 border-amber-500/30 text-amber-400 hover:border-amber-400 hover:bg-amber-500/10 hover:text-amber-300 font-bold"
        : "bg-amber-50/50 border-amber-300 text-amber-700 hover:bg-amber-100/50 font-bold";
    } else {
      btnClass = d
        ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-450 hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-[#00FFCC] font-bold"
        : "bg-emerald-50/50 border-emerald-300 text-emerald-700 hover:bg-emerald-100/50 font-bold";
    }
    
    const toggleSeatSelection = () => {
      if (isOccupied) return;
      if (isSelected) {
        setSelectedSeats(prev => prev.filter(n => n !== seat.number));
      } else {
        if (selectedSeats.length >= 6) {
          triggerToast("Maximum of 6 seats can be locked at once!");
          return;
        }
        setSelectedSeats(prev => [...prev, seat.number].sort((a,b)=>a-b));
      }
    };
    
    let comfortRating = "9.2";
    let typeFullName = "Lower Berth";
    if (seat.type === "MB") { comfortRating = "8.4"; typeFullName = "Middle Berth"; }
    else if (seat.type === "UB") { comfortRating = "8.8"; typeFullName = "Upper Berth"; }
    else if (seat.type === "SL") { comfortRating = "8.6"; typeFullName = "Side Lower Berth"; }
    else if (seat.type === "SU") { comfortRating = "8.2"; typeFullName = "Side Upper Berth"; }
    else if (seat.type === "Window") { comfortRating = "9.4"; typeFullName = "Window Seat"; }
    else if (seat.type === "Aisle") { comfortRating = "8.8"; typeFullName = "Aisle Seat"; }
    else if (seat.type === "Middle") { comfortRating = "8.0"; typeFullName = "Middle Seat"; }
    
    return (
      <div key={seat.number} className="relative group/seat flex-1">
        <button
          disabled={isOccupied}
          onClick={toggleSeatSelection}
          className={`w-full py-2.5 rounded-xl border text-[10px] font-black transition-all flex flex-col items-center justify-center cursor-pointer select-none ${btnClass}`}
        >
          <span className="text-[11px] font-mono leading-none">{seat.number}</span>
          <span className={`text-[6px] tracking-wider uppercase mt-0.5 leading-none opacity-80 ${isSelected ? "text-slate-900" : ""}`}>{seat.type}</span>
        </button>
        
        {/* Detail Tooltip */}
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl border p-2.5 shadow-2xl opacity-0 scale-90 translate-y-2 pointer-events-none group-hover/seat:opacity-100 group-hover/seat:scale-100 group-hover/seat:translate-y-0 transition-all duration-200 z-30 select-none ${
          d ? "bg-slate-950 border-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.6)]" : "bg-white border-slate-200 text-slate-800 shadow-[0_10px_30px_rgba(0,0,0,0.1)]"
        }`}>
          <div className="flex items-center justify-between border-b pb-1 mb-1.5 border-dashed border-slate-500/20">
            <span className="font-mono text-[9px] font-black uppercase text-[#00FFCC]">Seat {seat.number}</span>
            <span className="text-[7.5px] font-black bg-blue-500/10 text-[#0066FF] border border-blue-500/25 px-1.5 py-0.2 rounded-full">★ {comfortRating} Comfort</span>
          </div>
          
          <p className="text-[9.5px] font-bold uppercase tracking-tight">{typeFullName}</p>
          
          <p className="text-[7px] mt-1 font-mono uppercase">
            Status: <span className={`font-black ${isOccupied ? "text-red-400" : isRAC ? "text-amber-400" : "text-[#00FFCC]"}`}>
              {isOccupied ? "Occupied" : isRAC ? "RAC Status" : "Available"}
            </span>
          </p>
          
          <div className="grid grid-cols-2 gap-1 mt-1.5 pt-1.5 border-t border-dashed border-slate-500/20 text-[6px] font-mono uppercase tracking-wider text-slate-500">
            <span>⚡ Charging</span>
            <span>🛌 Bedroll</span>
            <span>🔌 USB Port</span>
            <span>🍽️ Pantry</span>
          </div>
        </div>
      </div>
    );
  };

  const renderBay = (bayIdx: number) => {
    const baySeats = seatsList.slice(bayIdx * baySize, (bayIdx + 1) * baySize);
    if (baySeats.length === 0) return null;
    
    const clean = activeClass;
    if (clean === "3A" || clean === "SL") {
      const leftCol = [baySeats[0], baySeats[1], baySeats[2]].filter(Boolean);
      const rightCol = [baySeats[3], baySeats[4], baySeats[5]].filter(Boolean);
      const sideCol = [baySeats[6], baySeats[7]].filter(Boolean);
      
      return (
        <div key={bayIdx} className={`p-4 rounded-2xl border flex items-center justify-between gap-4 relative ${
          d ? "bg-slate-900/20 border-white/5" : "bg-slate-50/80 border-slate-200/60 shadow-sm"
        }`}>
          <div className="absolute -top-2 left-4 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[7px] border border-white/10 uppercase font-black z-10">
            Bay {bayIdx + 1}
          </div>
          
          <div className="flex gap-2.5 flex-1 mt-1">
            <div className="flex flex-col gap-2 flex-1">
              {leftCol.map(renderSeatButton)}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {rightCol.map(renderSeatButton)}
            </div>
          </div>
          
          <div className="w-[1.5px] self-stretch border-r border-dashed border-slate-500/20 mx-1 flex flex-col justify-around items-center">
            <span className="text-[6px] font-bold text-slate-500/40 tracking-widest uppercase rotate-90 leading-none">AISLE</span>
          </div>
          
          <div className="flex flex-col gap-2 w-1/3 justify-center mt-1">
            {sideCol.map(renderSeatButton)}
          </div>
        </div>
      );
    } else if (clean === "2A") {
      const leftCol = [baySeats[0], baySeats[1]].filter(Boolean);
      const rightCol = [baySeats[2], baySeats[3]].filter(Boolean);
      const sideCol = [baySeats[4], baySeats[5]].filter(Boolean);
      
      return (
        <div key={bayIdx} className={`p-4 rounded-2xl border flex items-center justify-between gap-4 relative ${
          d ? "bg-slate-900/20 border-white/5" : "bg-slate-50/80 border-slate-200/60 shadow-sm"
        }`}>
          <div className="absolute -top-2 left-4 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[7px] border border-white/10 uppercase font-black z-10">
            Bay {bayIdx + 1}
          </div>
          
          <div className="flex gap-2.5 flex-1 mt-1">
            <div className="flex flex-col gap-2 flex-1">
              {leftCol.map(renderSeatButton)}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {rightCol.map(renderSeatButton)}
            </div>
          </div>
          
          <div className="w-[1.5px] self-stretch border-r border-dashed border-slate-500/20 mx-1 flex flex-col justify-around items-center">
            <span className="text-[6px] font-bold text-slate-500/40 tracking-widest uppercase rotate-90 leading-none">AISLE</span>
          </div>
          
          <div className="flex flex-col gap-2 w-1/3 justify-center mt-1">
            {sideCol.map(renderSeatButton)}
          </div>
        </div>
      );
    } else if (clean === "1A") {
      const leftCol = [baySeats[0], baySeats[1]].filter(Boolean);
      const rightCol = [baySeats[2], baySeats[3]].filter(Boolean);
      
      return (
        <div key={bayIdx} className={`p-4 rounded-2xl border flex items-center justify-between gap-4 relative ${
          d ? "bg-slate-900/20 border-white/5" : "bg-slate-50/80 border-slate-200/60 shadow-sm"
        }`}>
          <div className="absolute -top-2 left-4 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[7px] border border-white/10 uppercase font-black z-10">
            Coupe {bayIdx + 1}
          </div>
          
          <div className="flex gap-2.5 flex-1 mt-1">
            <div className="flex flex-col gap-2 flex-1">
              {leftCol.map(renderSeatButton)}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {rightCol.map(renderSeatButton)}
            </div>
          </div>
        </div>
      );
    } else {
      const leftSide = [baySeats[0], baySeats[1]].filter(Boolean);
      const rightSide = [baySeats[2], baySeats[3], baySeats[4]].filter(Boolean);
      
      return (
        <div key={bayIdx} className={`p-4 rounded-2xl border flex items-center justify-between gap-4 relative ${
          d ? "bg-slate-900/20 border-white/5" : "bg-slate-50/80 border-slate-200/60 shadow-sm"
        }`}>
          <div className="absolute -top-2 left-4 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[7px] border border-white/10 uppercase font-black z-10">
            Row {bayIdx + 1}
          </div>
          
          <div className="flex gap-2 w-[38%] mt-1">
            {leftSide.map(renderSeatButton)}
          </div>
          
          <div className="w-[1.5px] self-stretch border-r border-dashed border-slate-500/20 mx-0.5 flex flex-col justify-around items-center">
            <span className="text-[6px] font-bold text-slate-500/40 tracking-widest uppercase rotate-90 leading-none">AISLE</span>
          </div>
          
          <div className="flex gap-2 w-[58%] mt-1">
            {rightSide.map(renderSeatButton)}
          </div>
        </div>
      );
    }
  };

  const baySize = activeClass === "1A" ? 4 : activeClass === "2A" ? 6 : ["3A", "SL"].includes(activeClass) ? 8 : 5;
  const baysCount = Math.ceil(seatsList.length / baySize);

  return (
    <div className={`min-h-screen transition-all duration-300 flex flex-col select-none ${
      d ? "bg-slate-950 text-slate-100" : "bg-[#F7F5F0] text-slate-850"
    }`}>
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className={`px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${
              d ? "bg-slate-900/90 border-white/10 text-white" : "bg-white/95 border-slate-200 text-slate-800 shadow-[0_15px_40px_rgba(0,0,0,0.15)]"
            }`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
              <span className="text-xs font-bold font-mono tracking-tight">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating stars backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        <div className="absolute top-[40%] right-[15%] w-2 h-2 rounded-full bg-indigo-400 animate-ping" style={{ animationDuration: "3s" }} />
        <div className="absolute bottom-[25%] left-[25%] w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      {/* Header Bar */}
      <header className={`px-6 py-4 border-b flex items-center justify-between backdrop-blur-md sticky top-0 z-20 ${
        d ? "bg-slate-950/80 border-white/5" : "bg-white/80 border-slate-200/60 shadow-sm"
      }`}>
        <div className="flex items-center gap-3">
          <Link
            href="/trainwise"
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
              d ? "bg-slate-900 border-white/5 text-slate-350 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-sm font-black font-mono tracking-tight uppercase">
                Natural Seat Explorer
              </h2>
            </div>
            <p className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">
              Stand-alone Interactive Berth Allocation Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share/Copy Link */}
          <button
            onClick={handleCopyLink}
            className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase font-mono tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              d
                ? "bg-slate-900 border-white/5 text-slate-300 hover:bg-slate-800"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            }`}
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {copiedLink ? "Link Copied" : "Share Seat Map"}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              d ? "bg-slate-900 border-white/5 text-slate-300 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {d ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl w-full mx-auto p-6 flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 z-10">
        
        {/* Left Side: Train Details & Telemetry (Platform/Junction) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Card: Train Credentials */}
          <div className={`p-5 rounded-3xl border ${
            d ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200/60 shadow-md"
          }`}>
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-dashed border-slate-500/20">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-100"}`}>
                <Train className="w-5 h-5 text-[#0066FF]" />
              </div>
              <div>
                <h3 className={`text-sm font-black tracking-tight ${d ? "text-slate-100" : "text-slate-900"}`}>
                  {trainInfo.name}
                </h3>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">Train #{trainNo} • {activeClass} Coach</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono py-2">
              <div>
                <span className="block text-[8px] text-slate-500 uppercase">From Station</span>
                <span className={`block font-black mt-0.5 ${d ? "text-slate-200" : "text-slate-800"}`}>{trainInfo.fromName} ({trainInfo.fromCode})</span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 uppercase">Destination</span>
                <span className={`block font-black mt-0.5 ${d ? "text-slate-200" : "text-slate-800"}`}>{trainInfo.toName}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono py-2 border-t border-dashed border-slate-500/20 mt-2">
              <div>
                <span className="block text-[8px] text-slate-500 uppercase">Selected Coach</span>
                <span className="block font-black text-[#00FFCC] mt-0.5 uppercase">{coachName} ({activeClass})</span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 uppercase">Historic Platform</span>
                <span className="block font-black text-[#0066FF] mt-0.5 uppercase">{trainInfo.platform}</span>
              </div>
            </div>
          </div>

          {/* Card: TELEMETRY JUNCTION & EXPECTED PLATFORM HUD */}
          <div className={`p-5 rounded-3xl border relative overflow-hidden flex flex-col gap-4 ${
            d ? "bg-indigo-950/15 border-indigo-500/10 text-indigo-200" : "bg-indigo-50/30 border-indigo-100 text-indigo-900 shadow-md"
          }`}>
            <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none scale-150 animate-spin" style={{ animationDuration: "25s" }}>
              <Compass className="w-24 h-24" />
            </div>

            <div className="space-y-1.5 z-10">
              <span className="flex items-center gap-1.5 text-[7.5px] uppercase font-black font-mono tracking-widest text-[#0066FF]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Verified Telemetry Junction Node
              </span>
              
              <h4 className={`text-md font-mono font-black uppercase tracking-tight ${d ? "text-slate-100" : "text-slate-900"}`}>
                {junctionName}
              </h4>
              
              <p className={`text-[9px] font-medium leading-relaxed ${d ? "text-slate-400" : "text-slate-700"}`}>
                Expected platform for Train <span className="font-mono">#{trainNo}</span> at {junctionName} is <span className="font-bold text-[#0066FF] font-mono">{trainInfo.platform}</span> based on historic IRCTC database logs.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-dashed border-slate-500/20 pt-3 mt-1 z-10">
              <div>
                <span className="block text-[7.5px] uppercase font-mono tracking-wider opacity-60">Confidence Index</span>
                <span className="block text-sm font-mono font-black text-emerald-400">{platformConfidence}% Accurate Match</span>
              </div>

              <span className={`text-[7px] px-2 py-0.5 rounded font-mono border uppercase tracking-wider font-bold ${
                d ? "bg-slate-950 border-white/5 text-slate-500" : "bg-white border-slate-200 text-slate-500 shadow-sm"
              }`}>
                Data Stream Synced
              </span>
            </div>

            {/* Disclaimer Callout */}
            <div className={`p-3 rounded-xl border flex items-start gap-2 ${
              d ? "bg-amber-500/5 border-amber-500/10 text-amber-250/90" : "bg-amber-50/50 border-amber-200 text-amber-850"
            }`}>
              <Info className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
              <p className="text-[7.5px] leading-relaxed font-bold uppercase tracking-tight">
                <span className="font-black text-amber-500 font-mono">Telemetry Disclaimer:</span> Platform switches and berth occupancy maps represent statistical models synthesized from historic IRCTC chart operations. Live operational variances might occur. Crosscheck all physical display boards upon arrival at the station.
              </p>
            </div>
          </div>
        </section>

        {/* Right Side: Seat Map & Allocation HUD */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Card: Coach Grid */}
          <div className={`p-6 rounded-3xl border flex flex-col ${
            d ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200/60 shadow-md"
          }`}>
            
            {/* Coach Header / Legend */}
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap pb-4 border-b border-dashed border-slate-500/20">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-blue-500/10 text-[#0066FF] border border-blue-500/25">
                  Coach: {coachName}
                </span>
                <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeClass} Class
                </span>
              </div>

              {/* State Legend */}
              <div className="flex gap-2.5 text-[8px] font-bold font-mono uppercase tracking-wider flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/20 border border-emerald-500/40"></span> Avail</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-500/20 border border-slate-500/25"></span> Occupied</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/20 border border-amber-500/40"></span> RAC</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#EAB308] shadow-[0_0_8px_#EAB308]"></span> Selected</span>
              </div>
            </div>

            {/* Layout container */}
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
              {Array.from({ length: baysCount }).map((_, idx) => renderBay(idx))}
            </div>

            {/* Selected Seats HUD */}
            <div className={`mt-6 p-4 rounded-2xl border flex items-center justify-between gap-4 ${
              d ? "bg-slate-950/40 border-white/5" : "bg-slate-50 border-slate-200/50 shadow-sm"
            }`}>
              <div>
                <span className="block text-[8px] uppercase font-mono tracking-wider text-slate-500">Selected Allocation</span>
                <span className={`block text-xs font-mono font-black mt-0.5 ${d ? "text-slate-100" : "text-slate-850"}`}>
                  {selectedSeats.length > 0 
                    ? `Coach: ${coachName} | Seat${selectedSeats.length > 1 ? "s" : ""}: ${selectedSeats.join(", ")}` 
                    : "No Berths Selected"
                  }
                </span>
              </div>
              
              <button
                disabled={selectedSeats.length === 0}
                onClick={handleLockSeats}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase font-mono tracking-wider transition-all flex items-center gap-2 ${
                  selectedSeats.length > 0
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)] cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-slate-500/10 border border-slate-500/20 text-slate-500 cursor-not-allowed"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Reserve Berths
              </button>
            </div>

          </div>

        </section>

      </main>
      
      {/* Footer */}
      <footer className={`py-6 px-6 text-center text-[10px] font-mono border-t mt-auto ${
        d ? "bg-slate-950/40 border-white/5 text-slate-500" : "bg-white border-slate-200/60 text-slate-500 shadow-sm"
      }`}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 RailRoute Inc. Smart Berth Mapping System. Standard IRCTC Telemetry Sync.</p>
          <div className="flex gap-4">
            <Link href="/trainwise" className="hover:text-indigo-400 transition-all font-bold">Return to Route Cockpit</Link>
            <span>•</span>
            <span className="text-[#00FFCC]">Telemetry Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
