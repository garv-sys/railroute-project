"use client";

import React, { useState } from "react";
import { Filter, Check, RotateCcw, Layers, Sparkles } from "lucide-react";

export interface SplitClassFilterState {
  leg1Classes: string[];
  leg2Classes: string[];
}

interface SplitClassFilterPanelProps {
  leg1Name?: string;
  leg2Name?: string;
  leg1Classes: string[];
  leg2Classes: string[];
  onChange: (newFilters: SplitClassFilterState) => void;
  onReset: () => void;
}

const CLASS_OPTIONS = [
  { code: "1A", label: "1st AC (1A)" },
  { code: "2A", label: "2nd AC (2A)" },
  { code: "3A", label: "3rd AC (3A)" },
  { code: "3E", label: "3rd AC Economy (3E)" },
  { code: "SL", label: "Sleeper (SL)" },
  { code: "CC", label: "AC Chair Car (CC)" },
  { code: "EC", label: "Exec Chair Car (EC)" },
  { code: "2S", label: "Second Sitting (2S)" },
  { code: "FC", label: "First Class (FC)" },
];

const PRESETS = [
  { label: "Any Class", leg1: [], leg2: [] },
  { label: "AC Sleeper (Leg 1) + CC (Leg 2)", leg1: ["3A", "2A", "1A"], leg2: ["CC", "EC"] },
  { label: "All AC (Both Legs)", leg1: ["3A", "2A", "1A", "CC", "EC"], leg2: ["3A", "2A", "1A", "CC", "EC"] },
  { label: "Economy (Both Legs)", leg1: ["SL", "2S"], leg2: ["SL", "2S"] },
  { label: "Premium (2A/1A/EC)", leg1: ["2A", "1A"], leg2: ["2A", "1A", "EC"] },
];

export function SplitClassFilterPanel({
  leg1Name = "Leg 1 (Origin → Hub)",
  leg2Name = "Leg 2 (Hub → Destination)",
  leg1Classes,
  leg2Classes,
  onChange,
  onReset,
}: SplitClassFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleLeg1Class = (code: string) => {
    const next = leg1Classes.includes(code)
      ? leg1Classes.filter((c) => c !== code)
      : [...leg1Classes, code];
    onChange({ leg1Classes: next, leg2Classes });
  };

  const toggleLeg2Class = (code: string) => {
    const next = leg2Classes.includes(code)
      ? leg2Classes.filter((c) => c !== code)
      : [...leg2Classes, code];
    onChange({ leg1Classes, leg2Classes: next });
  };

  const applyPreset = (preset: { leg1: string[]; leg2: string[] }) => {
    onChange({ leg1Classes: preset.leg1, leg2Classes: preset.leg2 });
  };

  const hasActiveFilters = leg1Classes.length > 0 || leg2Classes.length > 0;

  return (
    <div className="mb-4 rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 via-slate-900/60 to-slate-950/80 p-4 shadow-xl backdrop-blur-md dark:border-cyan-400/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400">
            <Filter className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-wide text-slate-100">
                Per-Leg Class Filter (Multi-Select)
              </h3>
              {hasActiveFilters && (
                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                  Custom Active
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Customize train class requirements independently for Leg 1 vs Leg 2
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 rounded-xl bg-cyan-500/20 px-4 py-2 text-xs font-black text-cyan-300 transition hover:bg-cyan-500/30"
          >
            <Layers className="h-4 w-4" />
            {isOpen ? "Hide Filter Controls" : "Configure Per-Leg Classes"}
          </button>
        </div>
      </div>

      {/* Preset Quick Toggles */}
      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
        <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
          <Sparkles className="h-3 w-3 text-cyan-400" /> Presets:
        </span>
        {PRESETS.map((preset) => {
          const isActive =
            JSON.stringify(preset.leg1) === JSON.stringify(leg1Classes) &&
            JSON.stringify(preset.leg2) === JSON.stringify(leg2Classes);
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                isActive
                  ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Expanded Controls */}
      {isOpen && (
        <div className="mt-4 grid gap-6 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 lg:grid-cols-2">
          {/* Leg 1 Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                {leg1Name}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {leg1Classes.length === 0 ? "Any Class Allowed" : `${leg1Classes.length} selected`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CLASS_OPTIONS.map((item) => {
                const checked = leg1Classes.includes(item.code);
                return (
                  <button
                    key={`l1-${item.code}`}
                    type="button"
                    onClick={() => toggleLeg1Class(item.code)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition ${
                      checked
                        ? "border-cyan-500 bg-cyan-500/20 font-black text-cyan-200"
                        : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-cyan-400 bg-cyan-500 text-slate-950"
                          : "border-slate-700 bg-slate-800"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{item.code}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Leg 2 Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                {leg2Name}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {leg2Classes.length === 0 ? "Any Class Allowed" : `${leg2Classes.length} selected`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CLASS_OPTIONS.map((item) => {
                const checked = leg2Classes.includes(item.code);
                return (
                  <button
                    key={`l2-${item.code}`}
                    type="button"
                    onClick={() => toggleLeg2Class(item.code)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition ${
                      checked
                        ? "border-emerald-500 bg-emerald-500/20 font-black text-emerald-200"
                        : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-emerald-400 bg-emerald-500 text-slate-950"
                          : "border-slate-700 bg-slate-800"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{item.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
