import puppeteer, { type Browser, type Page } from 'puppeteer';
import { parseExpirationDate } from '../utils/dates.js';
import type { ScanResultRow } from '../../shared/types.js';

const OPTION_SAMURAI_URL = 'https://app.optionsamurai.com';
const LOGIN_URL = `${OPTION_SAMURAI_URL}/login`;

function getLaunchOptions() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--window-size=1920,1080',
  ];

  // Check for system-installed Chromium
  const chromiumPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  let executablePath: string | undefined;
  for (const p of chromiumPaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    } catch {}
  }

  return {
    headless: true as const,
    args,
    ...(executablePath ? { executablePath } : {}),
  };
}

/**
 * Test login to Option Samurai. Returns true if login succeeds.
 */
export async function testLogin(): Promise<{ success: boolean; message: string }> {
  const email = process.env.OPTION_SAMURAI_EMAIL;
  const password = process.env.OPTION_SAMURAI_PASSWORD;

  if (!email || !password) {
    return { success: false, message: 'Missing OPTION_SAMURAI_EMAIL or OPTION_SAMURAI_PASSWORD environment variables' };
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(getLaunchOptions());
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill login form
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"]', email);
    await page.type('input[type="password"], input[name="password"]', password);

    // Submit
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

    const url = page.url();
    const isLoggedIn = !url.includes('/login');

    return {
      success: isLoggedIn,
      message: isLoggedIn ? 'Login successful' : 'Login failed - still on login page',
    };
  } catch (error: any) {
    return { success: false, message: `Login error: ${error.message}` };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Scrape Option Samurai for the named scan results.
 */
export async function scrapeOptionSamurai(
  scanName: string = 'bi-weekly income all'
): Promise<ScanResultRow[]> {
  const email = process.env.OPTION_SAMURAI_EMAIL;
  const password = process.env.OPTION_SAMURAI_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing OPTION_SAMURAI_EMAIL or OPTION_SAMURAI_PASSWORD');
  }

  let browser: Browser | null = null;
  try {
    console.log('[Scraper] Launching browser...');
    browser = await puppeteer.launch(getLaunchOptions());
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Login
    console.log('[Scraper] Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"]', email);
    await page.type('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

    if (page.url().includes('/login')) {
      throw new Error('Login failed - still on login page');
    }
    console.log('[Scraper] Login successful');

    // Navigate to Scans page
    console.log('[Scraper] Navigating to scans...');
    await page.goto(`${OPTION_SAMURAI_URL}/scans`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Find and click the saved scan
    console.log(`[Scraper] Looking for scan: "${scanName}"...`);
    await page.waitForSelector('table, .scan-list, [class*="scan"]', { timeout: 15000 });

    // Click on the scan by name
    const scanClicked = await page.evaluate((name: string) => {
      const elements = document.querySelectorAll('a, button, td, span, div');
      for (const el of elements) {
        if (el.textContent?.trim().toLowerCase().includes(name.toLowerCase())) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, scanName);

    if (!scanClicked) {
      throw new Error(`Could not find scan named "${scanName}"`);
    }

    // Wait for results to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    await page.waitForSelector('table', { timeout: 15000 });

    console.log('[Scraper] Parsing results table...');
    const results = await page.evaluate(() => {
      const rows: any[] = [];
      const tables = document.querySelectorAll('table');

      // Find the results table (usually the largest one)
      let resultsTable: HTMLTableElement | null = null;
      let maxRows = 0;
      tables.forEach(table => {
        const rowCount = table.querySelectorAll('tbody tr').length;
        if (rowCount > maxRows) {
          maxRows = rowCount;
          resultsTable = table;
        }
      });

      if (!resultsTable) return rows;

      // Get header texts to map columns
      const headers: string[] = [];
      (resultsTable as HTMLTableElement).querySelectorAll('thead th').forEach(th => {
        headers.push((th.textContent || '').trim().toLowerCase());
      });

      // Parse each row
      (resultsTable as HTMLTableElement).querySelectorAll('tbody tr').forEach(tr => {
        const cells: string[] = [];
        tr.querySelectorAll('td').forEach(td => {
          cells.push((td.textContent || '').trim());
        });

        if (cells.length < 5) return;

        // Map columns by header names
        const getCol = (keywords: string[]): string => {
          for (const kw of keywords) {
            const idx = headers.findIndex(h => h.includes(kw));
            if (idx >= 0 && idx < cells.length) return cells[idx];
          }
          return '';
        };

        const parseNum = (s: string): number => {
          const cleaned = s.replace(/[%$,]/g, '').trim();
          return parseFloat(cleaned) || 0;
        };

        rows.push({
          ticker: getCol(['ticker', 'symbol']),
          companyName: getCol(['company', 'name']),
          price: parseNum(getCol(['price'])),
          priceChange: parseNum(getCol(['change'])),
          ivRank: parseNum(getCol(['iv rank'])),
          ivPercentile: parseNum(getCol(['iv percentile', 'iv %'])),
          strike: getCol(['strike']),
          moneyness: parseNum(getCol(['moneyness', 'money'])),
          expDate: getCol(['exp', 'expiration', 'expiry']),
          daysToExp: parseInt(getCol(['days', 'dte'])) || 0,
          totalOptVol: parseInt(getCol(['vol', 'volume']).replace(/,/g, '')) || 0,
          probMaxProfit: parseNum(getCol(['prob', 'probability'])),
          maxProfit: parseNum(getCol(['max profit', 'profit'])),
          maxLoss: parseNum(getCol(['max loss', 'loss'])),
          returnPercent: parseNum(getCol(['return', 'ret'])),
        });
      });

      return rows;
    });

    console.log(`[Scraper] Found ${results.length} results`);

    // Parse expiration dates
    const parsed: ScanResultRow[] = results
      .filter((r: any) => r.ticker)
      .map((r: any) => ({
        ...r,
        expDate: r.expDate ? parseExpirationDate(r.expDate) : '',
      }));

    return parsed;
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
