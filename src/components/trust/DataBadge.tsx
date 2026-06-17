import type { TrustSource } from "@/lib/confidence";

export type DataBadgeType =
  | "LIVE"
  | "CACHED"
  | "FALLBACK"
  | "UNAVAILABLE"
  | "SPLIT ROUTE"
  | "NEARBY BOARDING"
  | "ESTIMATED"
  | "VERIFIED RECENTLY";

type DataBadgeProps = {
  type: DataBadgeType;
  label?: string;
  className?: string;
};

const badgeTone: Record<DataBadgeType, string> = {
  LIVE: "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-300/25 dark:bg-emerald-300/10 dark:text-emerald-100",
  CACHED: "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-300/25 dark:bg-sky-300/10 dark:text-sky-100",
  FALLBACK: "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100",
  UNAVAILABLE: "border-slate-300 bg-slate-50 text-slate-700 dark:border-white/15 dark:bg-white/8 dark:text-slate-200",
  "SPLIT ROUTE": "border-violet-300/70 bg-violet-50 text-violet-800 dark:border-violet-300/25 dark:bg-violet-300/10 dark:text-violet-100",
  "NEARBY BOARDING": "border-teal-300/70 bg-teal-50 text-teal-800 dark:border-teal-300/25 dark:bg-teal-300/10 dark:text-teal-100",
  ESTIMATED: "border-slate-300 bg-slate-50 text-slate-700 dark:border-white/15 dark:bg-white/8 dark:text-slate-200",
  "VERIFIED RECENTLY": "border-indigo-300/70 bg-indigo-50 text-indigo-800 dark:border-indigo-300/25 dark:bg-indigo-300/10 dark:text-indigo-100",
};

export function badgeTypeFromSource(source?: TrustSource): DataBadgeType {
  if (source === "live") return "LIVE";
  if (source === "cached") return "CACHED";
  if (source === "mock") return "ESTIMATED";
  if (source === "unavailable") return "UNAVAILABLE";
  return "FALLBACK";
}

export function DataBadge({ type, label, className = "" }: DataBadgeProps) {
  const displayLabel = label || (type === "LIVE" ? "PROVIDER" : type === "VERIFIED RECENTLY" ? "RECENT PROVIDER RESULT" : type);
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold uppercase leading-none tracking-normal ${badgeTone[type]} ${className}`}>
      {displayLabel}
    </span>
  );
}
