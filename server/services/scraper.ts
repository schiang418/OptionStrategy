import puppeteer, { type Browser, type Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { parseExpirationDate, sleep } from '../utils/dates.js';
import type { ScanResultRow } from '../../shared/types.js';

const OPTION_SAMURAI_URL = 'https://app.optionsamurai.com';
const LOGIN_URL = `${OPTION_SAMURAI_URL}/login`;
const DATA_DIR = process.env.DATA_DIR || '/data';

// ---------------------------------------------------------------------------
// Browser launch config
// ---------------------------------------------------------------------------

function getLaunchOptions() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--window-size=1920,1080',
  ];

  // Priority: env var > system chromium > bundled puppeteer
  let executablePath: string | undefined =
    process.env.PUPPETEER_EXECUTABLE_PATH;

  if (!executablePath) {
    const chromiumPaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ];
    for (const p of chromiumPaths) {
      try {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      } catch {}
    }
  }

  return {
    headless: true as const,
    args,
    ...(executablePath ? { executablePath } : {}),
  };
}

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------

async function takeScreenshot(page: Page, label: string): Promise<string | null> {
  try {
    const dir = fs.existsSync(DATA_DIR) ? DATA_DIR : '/tmp';
    const filePath = path.join(dir, `scraper-error-${label}-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[Scraper] Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err: any) {
    console.error(`[Scraper] Failed to take screenshot: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Flexible selector helpers
// ---------------------------------------------------------------------------

async function findAndType(page: Page, selectors: string[], text: string): Promise<void> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.type(text);
        return;
      }
    } catch {}
  }
  // Last resort: wait for the first selector
  await page.waitForSelector(selectors[0], { timeout: 10000 });
  await page.type(selectors[0], text);
}

async function findAndClick(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return;
      }
    } catch {}
  }
  await page.waitForSelector(selectors[0], { timeout: 10000 });
  await page.click(selectors[0]);
}

// ---------------------------------------------------------------------------
// testLogin
// ---------------------------------------------------------------------------

export async function testLogin(): Promise<{ success: boolean; message: string }> {
  const email = process.env.OPTION_SAMURAI_EMAIL;
  const password = process.env.OPTION_SAMURAI_PASSWORD;

  if (!email || !password) {
    return {
      success: false,
      message: 'Missing OPTION_SAMURAI_EMAIL or OPTION_SAMURAI_PASSWORD environment variables',
    };
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(getLaunchOptions());
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    await findAndType(
      page,
      ['input[type="email"]', 'input[name="email"]', '#email'],
      email,
    );
    await findAndType(
      page,
      ['input[type="password"]', 'input[name="password"]', '#password'],
      password,
    );

    await findAndClick(page, [
      'button[type="submit"]',
      'button.login-button',
      'input[type="submit"]',
    ]);
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

// ---------------------------------------------------------------------------
// scrapeOptionSamurai
// ---------------------------------------------------------------------------

/**
 * Scrape Option Samurai for the named scan results.
 *
 * Returns raw float values (dollars, percentages as plain numbers like 13.57
 * for 13.57%). The portfolio service is responsible for converting to
 * cents / basis points before database insertion.
 */
export async function scrapeOptionSamurai(
  scanName: string = 'bi-weekly income all',
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

    // ---- Login ----
    console.log('[Scraper] Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    await findAndType(
      page,
      ['input[type="email"]', 'input[name="email"]', '#email'],
      email,
    );
    await findAndType(
      page,
      ['input[type="password"]', 'input[name="password"]', '#password'],
      password,
    );

    await findAndClick(page, [
      'button[type="submit"]',
      'button.login-button',
      'input[type="submit"]',
    ]);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

    if (page.url().includes('/login')) {
      await takeScreenshot(page, 'login-failed');
      throw new Error('Login failed - still on login page');
    }
    console.log('[Scraper] Login successful');

    // ---- Navigate to Scans page ----
    console.log('[Scraper] Navigating to scans...');
    await page.goto(`${OPTION_SAMURAI_URL}/scans`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // ---- Find and click the saved scan ----
    console.log(`[Scraper] Looking for scan: "${scanName}"...`);
    await page.waitForSelector('table, .scan-list, [class*="scan"]', {
      timeout: 15000,
    });

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
      await takeScreenshot(page, 'scan-not-found');
      throw new Error(`Could not find scan named "${scanName}"`);
    }

    // Wait for results table to load
    await sleep(5000);
    await page.waitForSelector('table', { timeout: 15000 });

    // ---- Parse the results table ----
    console.log('[Scraper] Parsing results table...');
    const results = await page.evaluate(() => {
      const rows: any[] = [];
      const tables = document.querySelectorAll('table');

      // Find the results table (usually the largest one)
      let resultsTable: HTMLTableElement | null = null;
      let maxRows = 0;
      tables.forEach((table) => {
        const rowCount = table.querySelectorAll('tbody tr').length;
        if (rowCount > maxRows) {
          maxRows = rowCount;
          resultsTable = table;
        }
      });

      if (!resultsTable) return rows;

      // Get header texts to map columns
      const headers: string[] = [];
      (resultsTable as HTMLTableElement)
        .querySelectorAll('thead th')
        .forEach((th) => {
          headers.push((th.textContent || '').trim().toLowerCase());
        });

      // Parse each row
      (resultsTable as HTMLTableElement)
        .querySelectorAll('tbody tr')
        .forEach((tr) => {
          const cells: string[] = [];
          tr.querySelectorAll('td').forEach((td) => {
            cells.push((td.textContent || '').trim());
          });

          if (cells.length < 5) return;

          const getCol = (keywords: string[]): string => {
            for (const kw of keywords) {
              const idx = headers.findIndex((h) => h.includes(kw));
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
            totalOptVol:
              parseInt(getCol(['vol', 'volume']).replace(/,/g, '')) || 0,
            probMaxProfit: parseNum(getCol(['prob', 'probability'])),
            maxProfit: parseNum(getCol(['max profit', 'profit'])),
            maxLoss: parseNum(getCol(['max loss', 'loss'])),
            returnPercent: parseNum(getCol(['return', 'ret'])),
          });
        });

      return rows;
    });

    console.log(`[Scraper] Found ${results.length} results`);

    // Parse expiration dates into YYYY-MM-DD; return raw float values
    const parsed: ScanResultRow[] = results
      .filter((r: any) => r.ticker)
      .map((r: any) => {
        let expDate = '';
        if (r.expDate) {
          try {
            expDate = parseExpirationDate(r.expDate);
          } catch (e: any) {
            console.warn(
              `[Scraper] Could not parse expDate "${r.expDate}": ${e.message}`,
            );
          }
        }
        return { ...r, expDate } as ScanResultRow;
      });

    return parsed;
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    // Take screenshot on any error
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await takeScreenshot(pages[pages.length - 1], 'error');
        }
      } catch {}
    }
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
