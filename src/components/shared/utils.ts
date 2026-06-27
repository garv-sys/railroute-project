"use client";

import { useState, useEffect } from "react";
import { acClassSet, runningDayNames, runningDayLabels, stationOverrides } from "./constants";
import { stationByCode, titleCase } from "@/lib/railway-intelligence";
import stationNamesDb from "@/data/station_names.json";

// Indian Railways' booking day boundary runs on IST (UTC+5:30, no DST), but this app
// runs on servers/browsers in arbitrary timezones (Vercel runs UTC). Shifting the clock
// by the fixed IST offset before reading UTC date fields gives the correct IST calendar
// date everywhere, without needing a timezone library.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function nowInIst(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

export function todayIso(offset = 0) {
  const date = nowInIst();
  date.setUTCDate(date.getUTCDate() + offset);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Indian Railways' Advance Reservation Period: tickets can be booked up to 60 days
// before the journey date, excluding the journey date itself, so the furthest bookable
// journey date is "today + 60". (Reduced from 120 days to 60 days, effective 1 Nov 2024.)
export const ADVANCE_RESERVATION_PERIOD_DAYS = 60;

export function minBookableDateIso() {
  return todayIso();
}

export function maxBookableDateIso() {
  return addIsoDays(todayIso(), ADVANCE_RESERVATION_PERIOD_DAYS);
}

export function clampToBookableWindow(value: string) {
  const min = minBookableDateIso();
  const max = maxBookableDateIso();
  if (!value) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function prettyDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

export function addIsoDays(value: string, offset: number) {
  const [year, month, day] = String(value || todayIso()).split("-").map(Number);
  const date = new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + offset);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function shortDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function formatIstDateTime(value: Date) {
  return value.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function formatCountdown(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function tatkalQuotaInfo(date: string, classType: string, quota: string, now = new Date()) {
  const cleanQuota = String(quota || "").toUpperCase();
  if (cleanQuota !== "TQ" && cleanQuota !== "PT") return null;
  const cleanClass = String(classType || "").toUpperCase();
  const acSelected = cleanClass === "ANY" ? true : acClassSet.has(cleanClass);
  const openHour = acSelected ? 10 : 11;
  const openDate = addIsoDays(date, -1);
  const opensAt = new Date(`${openDate}T${String(openHour).padStart(2, "0")}:00:00+05:30`);
  const opened = now.getTime() >= opensAt.getTime();
  return {
    title: cleanQuota === "PT" ? "Premium Tatkal quota" : "Tatkal quota",
    opensAt,
    opened,
    countdown: formatCountdown(opensAt.getTime() - now.getTime()),
    copy: cleanClass === "ANY"
      ? "AC classes open at 10:00 AM IST and non-AC classes open at 11:00 AM IST one day before journey."
      : `${cleanClass} ${acSelected ? "AC" : "non-AC"} quota opens at ${openHour}:00 AM IST one day before journey.`,
    premiumCopy: cleanQuota === "PT" ? "Premium Tatkal usually has no waitlist; provider may return confirmed availability or no quota row." : "",
  };
}

export function journeyWeekdayIndex(value: string) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return -1;
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function journeyWeekdayName(value: string) {
  const index = journeyWeekdayIndex(value);
  return index >= 0 ? runningDayNames[index] : "Unknown";
}

export function normalizeRunsOnDays(train: any): boolean[] | null {
  const value = train?.runsOnDays || train?.runningDays || train?.running_days;
  if (Array.isArray(value) && value.length === 7) {
    const activeValues = new Set(["1", "true", "y", "yes", "run", "runs", "available", "m", "mon", "monday", "tue", "tuesday", "wed", "wednesday", "thu", "thursday", "fri", "friday", "sat", "saturday", "sun", "sunday"]);
    const inactiveValues = new Set(["0", "false", "n", "no", "-", "_", "x", "off", "na"]);
    return value.map((item) => {
      if (item === true) return true;
      if (item === false || item == null) return false;
      const normalized = String(item).trim().toLowerCase();
      if (inactiveValues.has(normalized)) return false;
      return activeValues.has(normalized);
    });
  }
  if (Array.isArray(value) && value.length > 0) {
    const tokens = value.map((item) => String(item).trim().toLowerCase());
    return runningDayNames.map((name, index) => tokens.some((token) => token === runningDayLabels[index].toLowerCase() || token === name.toLowerCase() || token === name.slice(0, 3).toLowerCase()));
  }
  if (typeof value === "string" && /^[01]{7}$/.test(value)) {
    return [...value].map((item) => item === "1");
  }
  return null;
}

export function timeAmPm(value: unknown) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return String(value || "--");
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

export function useDebouncedValue<T>(value: T, delayMs = 500) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function stationNameFromCode(code: string): string | null {
  const upper = code.toUpperCase();
  if (stationOverrides[upper]) return stationOverrides[upper];
  const station = stationByCode(upper);
  if (station) return titleCase(station.name.replace(/\bRAILWAY STATION\b/gi, "").trim());
  const dbName = (stationNamesDb as Record<string, string>)[upper];
  if (dbName) return titleCase(dbName.replace(/\bRAILWAY STATION\b/gi, "").trim());
  return null;
}

export function stationCompactLabel(code: unknown) {
  const cleanCode = String(code || "").toUpperCase();
  const name = stationNameFromCode(cleanCode);
  if (!name) return cleanCode || "--";
  return `${name} (${cleanCode})`;
}

export function liveDisplayValue(value: unknown): string {
  if (value == null || value === "") return "--";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(liveDisplayValue).filter((item) => item && item !== "--").join(" · ") || "--";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const scheduled = record.scheduled ?? record.Scheduled ?? record.schedule ?? record.Schedule;
    const actual = record.actual ?? record.Actual;
    const delay = record.delay ?? record.Delay;
    if (scheduled || actual || delay) {
      return [
        actual ? `Actual ${liveDisplayValue(actual)}` : "",
        scheduled ? `Scheduled ${liveDisplayValue(scheduled)}` : "",
        delay ? `Delay ${liveDisplayValue(delay)}` : "",
      ].filter(Boolean).join(" · ");
    }
    const common = record.value ?? record.name ?? record.Name ?? record.stationName ?? record.StationName ?? record.code ?? record.StationCode ?? record.time ?? record.Time;
    if (common) return liveDisplayValue(common);
    try {
      return JSON.stringify(record);
    } catch {
      return "--";
    }
  }
  return "--";
}


