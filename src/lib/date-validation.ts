export interface DateValidationResult {
  valid: boolean;
  daysFromToday: number;
  error?: string;
  code?: 'PAST_DATE' | 'EXCEEDS_60_DAY_ARP';
}

/**
 * Validates travel date against Indian Railways' 60-day Advance Reservation Period (ARP).
 */
export function validateBookingDate(dateStr: string): DateValidationResult {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: false, daysFromToday: 0, error: 'Invalid or missing travel date.' };
  }

  const selectedDate = new Date(dateStr);
  if (isNaN(selectedDate.getTime())) {
    return { valid: false, daysFromToday: 0, error: 'Invalid date format. Use YYYY-MM-DD.' };
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

  if (daysFromToday > 60) {
    return {
      valid: false,
      daysFromToday,
      error: `The selected travel date (${dateStr}) is ${daysFromToday} days away, which exceeds Indian Railways' 60-day Advance Reservation Period (ARP). Booking opens up to 60 days in advance.`,
      code: 'EXCEEDS_60_DAY_ARP',
    };
  }

  return { valid: true, daysFromToday };
}
