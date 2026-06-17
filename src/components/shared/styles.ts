"use client";

export function productBg() {
  return "min-h-screen bg-[#f8fafc] text-slate-950 transition-colors duration-500 dark:bg-[#050816] dark:text-white";
}

export function softPanel(extra = "") {
  return `border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-[#101827] dark:shadow-none ${extra}`;
}
