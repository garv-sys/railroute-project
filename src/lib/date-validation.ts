export interface DateValidationResult {
  valid: boolean;
  daysFromToday: number;
  error?: string;
  code?: 'PAST_DATE' | 'EXCEEDS_60_DAY_ARP';
}

/**
 * Validates travel date against Indian Railways' 60-day Advance Reservation Period (ARP).
 */
export function parseAnyDateStr(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(clean)) {
    const parts = clean.split("T")[0].split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(clean)) {
    const parts = clean.split(/[-/]/).map(Number);
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Validates travel date against Indian Railways' 60-day Advance Reservation Period (ARP).
 */
export function validateBookingDate(dateStr: string): DateValidationResult {
  if (!dateStr || typeof dateStr !== "string") {
    return { valid: false, daysFromToday: 0, error: "Invalid or missing travel date." };
  }

  const selectedDate = parseAnyDateStr(dateStr);
  if (!selectedDate || isNaN(selectedDate.getTime())) {
    return { valid: false, daysFromToday: 0, error: "Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(selectedDate);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const daysFromToday = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysFromToday < 0) {
    return {
      valid: false,
      daysFromToday,
      error: `Travel date (${dateStr}) is in the past. Please select today or a future date.`,
      code: 'PAST_DATE',
    };
  }

  if (daysFromToday > 65) {
    return {
      valid: false,
      daysFromToday,
      error: `The selected travel date (${dateStr}) is ${daysFromToday} days away, which exceeds Indian Railways' 60-day Advance Reservation Period (ARP). Booking opens up to 60 days in advance.`,
      code: 'EXCEEDS_60_DAY_ARP',
    };
  }

  return { valid: true, daysFromToday };
}
