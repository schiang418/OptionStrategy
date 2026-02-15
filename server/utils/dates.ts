/**
 * Date utilities, currency/basis-point helpers, and option-ticker builder.
 *
 * CONVENTIONS (matching OptionScope):
 *   - All monetary values are stored as integers representing **cents**.
 *   - All percentage values are stored as integers representing **basis points**
 *     (value x 10 000).  e.g. 13.57 % -> 1357 bp.
 */

// ---------------------------------------------------------------------------
// Month lookup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// parseExpirationDate — handle many date formats from Option Samurai
// ---------------------------------------------------------------------------

/**
 * Parse an expiration-date string into a canonical `YYYY-MM-DD` string.
 *
 * Supported formats:
 *   "2025-02-21"          — ISO
 *   "2/21/2025"           — US  MM/DD/YYYY
 *   "Feb 21 '25"          — abbreviated-month with 2-digit year
 *   "Feb 27, 26"          — abbreviated-month, day, comma, 2-digit year
 *   "Feb 27, 2026"        — abbreviated-month, day, comma, 4-digit year
 */
export function parseExpirationDate(dateStr: string): string {
  if (!dateStr) throw new Error('Empty date string');

  const cleaned = dateStr.trim();

  // ISO: "2025-02-21"
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // US: "2/21/2025"
  const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Short tick: "Feb 21 '25"
  const shortTickMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+'(\d{2})$/);
  if (shortTickMatch) {
    const [, monthStr, day, yearShort] = shortTickMatch;
    const month = monthToNumber(monthStr);
    const year = 2000 + parseInt(yearShort);
    return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Comma + 2-digit year: "Feb 27, 26"
  const commaShortMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{2})$/);
  if (commaShortMatch) {
    const [, monthStr, day, yearShort] = commaShortMatch;
    const month = monthToNumber(monthStr);
    const year = 2000 + parseInt(yearShort);
    return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Comma + 4-digit year: "Feb 27, 2026"
  const commaLongMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (commaLongMatch) {
    const [, monthStr, day, year] = commaLongMatch;
    const month = monthToNumber(monthStr);
    return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error(`Unrecognized date format: "${dateStr}"`);
}

// ---------------------------------------------------------------------------
// parseStrike — ALWAYS higher value = sellStrike, lower = buyStrike
// ---------------------------------------------------------------------------

/**
 * Parse a strike string like "285.00/335.00" or "385/380".
 * The **higher** value is always `sellStrike`, the **lower** is `buyStrike`
 * (matching OptionScope convention for credit put spreads).
 *
 * Returns dollar values (not cents).
 */
export function parseStrike(strikeStr: string): { sellStrike: number; buyStrike: number } {
  const parts = strikeStr.split('/');
  if (parts.length !== 2) throw new Error(`Invalid strike format: "${strikeStr}"`);

  const a = parseFloat(parts[0]);
  const b = parseFloat(parts[1]);

  if (isNaN(a) || isNaN(b)) throw new Error(`Non-numeric strike values in "${strikeStr}"`);

  return {
    sellStrike: Math.max(a, b),
    buyStrike: Math.min(a, b),
  };
}

// ---------------------------------------------------------------------------
// buildOptionTicker — Polygon format: O:{TICKER}{YYMMDD}{P|C}{Strike*1000, 8-char}
// ---------------------------------------------------------------------------

/**
 * Build a Polygon-style option ticker.
 *
 * @param underlying  e.g. "AAPL"
 * @param expirationDate  YYYY-MM-DD string
 * @param putCall  "P" or "C"
 * @param strike  dollar value (e.g. 385)
 * @returns e.g. "O:AAPL260227P00385000"
 */
export function buildOptionTicker(
  underlying: string,
  expirationDate: string,
  putCall: 'P' | 'C',
  strike: number,
): string {
  // YYYY-MM-DD -> YYMMDD
  const datePart = expirationDate.replace(/-/g, '').slice(2); // "260227"
  const strikePart = Math.round(strike * 1000).toString().padStart(8, '0');
  return `O:${underlying}${datePart}${putCall}${strikePart}`;
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

/**
 * Get today's date as `YYYY-MM-DD` in US-Eastern time.
 */
export function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

/**
 * Check whether an option with the given expiration date has expired.
 * Options expire at 4:00 PM ET on the expiration day.
 */
export function isExpired(expirationDate: string): boolean {
  const now = new Date();

  const todayET = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(now);

  // Past the date entirely
  if (todayET > expirationDate) return true;
  // Before the date
  if (todayET < expirationDate) return false;

  // Same day — check if past 4 PM ET
  const etHour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(now);

  return parseInt(etHour) >= 16;
}

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Cents helpers
// ---------------------------------------------------------------------------

/** Convert a dollar amount to an integer number of cents. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert cents back to a dollar float (for API responses). */
export function fromCents(cents: number): number {
  return cents / 100;
}

// ---------------------------------------------------------------------------
// Basis-points helpers
// ---------------------------------------------------------------------------

/**
 * Convert a decimal percentage to basis points.
 * e.g. 0.1357 (13.57%) -> 1357
 *      81.31 (when already in "percent" form) -> call with 0.8131
 */
export function toBasisPoints(pct: number): number {
  return Math.round(pct * 10000);
}

/**
 * Convert basis points back to a decimal percentage.
 * e.g. 1357 -> 0.1357
 */
export function fromBasisPoints(bp: number): number {
  return bp / 10000;
}
