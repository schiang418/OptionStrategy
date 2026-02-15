/**
 * Parse expiration date from multiple formats used by Option Samurai.
 * Returns YYYY-MM-DD string.
 */
export function parseExpirationDate(dateStr: string): string {
  if (!dateStr) throw new Error('Empty date string');

  const cleaned = dateStr.trim();

  // ISO format: "2025-02-21"
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // US date format: "2/21/2025"
  const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Short format: "Feb 21 '25"
  const shortMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+'(\d{2})$/);
  if (shortMatch) {
    const [, monthStr, day, yearShort] = shortMatch;
    const month = monthToNumber(monthStr);
    const year = 2000 + parseInt(yearShort);
    return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Long format: "Feb 21, 2025"
  const longMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longMatch) {
    const [, monthStr, day, year] = longMatch;
    const month = monthToNumber(monthStr);
    return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error(`Unrecognized date format: "${dateStr}"`);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthToNumber(monthStr: string): number {
  const key = monthStr.toLowerCase().slice(0, 3);
  const num = MONTHS[key];
  if (!num) throw new Error(`Unknown month: "${monthStr}"`);
  return num;
}

/**
 * Get today's date in YYYY-MM-DD format in Eastern Time.
 */
export function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

/**
 * Check if a given expiration date has passed (compared to now in ET).
 * Expiration is at 4:00 PM ET on the date.
 */
export function isExpired(expirationDate: string): boolean {
  const now = new Date();
  // Create expiration datetime at 4:00 PM ET
  const expStr = `${expirationDate}T16:00:00`;
  // Parse in ET by creating a date and comparing
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const todayET = formatter.format(now);

  // Simple string comparison works for YYYY-MM-DD
  if (todayET > expirationDate) return true;
  if (todayET < expirationDate) return false;

  // Same day — check if past 4 PM ET
  const etTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return parseInt(etTime) >= 16;
}

/**
 * Parse the strike string "385/380" into { sell, buy }.
 */
export function parseStrike(strikeStr: string): { sell: number; buy: number } {
  const parts = strikeStr.split('/');
  if (parts.length !== 2) throw new Error(`Invalid strike format: "${strikeStr}"`);
  return {
    sell: parseFloat(parts[0]),
    buy: parseFloat(parts[1]),
  };
}

/**
 * Build Polygon option ticker format.
 * Example: O:AAPL260227P00385000
 */
export function buildOptionTicker(
  underlying: string,
  expirationDate: string,
  putCall: 'P' | 'C',
  strike: number
): string {
  // expirationDate is YYYY-MM-DD, need YYMMDD
  const datePart = expirationDate.replace(/-/g, '').slice(2); // "260227"
  const strikePart = Math.round(strike * 1000).toString().padStart(8, '0');
  return `O:${underlying}${datePart}${putCall}${strikePart}`;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
