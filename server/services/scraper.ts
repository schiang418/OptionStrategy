import { chromium, type Browser, type Page } from 'playwright';
import { parse } from 'csv-parse/sync';
import { parseExpirationDate } from '../utils/dates.js';
import type { ScanResultRow } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(step: string, msg: string) {
  console.log(`[Scraper][${step}] ${msg}`);
}

async function takeScreenshot(page: Page, step: string) {
  try {
    const path = `/tmp/optionsamurai_${step}_${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    log(step, `Screenshot saved: ${path}`);
  } catch (e: any) {
    log(step, `Failed to take screenshot: ${e.message}`);
  }
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
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://optionsamurai.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Click login link
    await page.click('a[href*="login"], button:has-text("Login"), a:has-text("Login")');
    await page.waitForURL('**/login**', { timeout: 30000 });

    // Fill credentials
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
    await page.fill('input[type="password"], input[name="password"]', password);

    // Submit
    await page.click('button:has-text("LOG IN"), button:has-text("Log In"), button[type="submit"]');
    await page.waitForURL('**/screener**', { timeout: 60000 });

    const isLoggedIn = await page.locator('text=Saved Scans').isVisible({ timeout: 10000 });
    return {
      success: isLoggedIn,
      message: isLoggedIn ? 'Login successful' : 'Login failed - could not verify session',
    };
  } catch (err: any) {
    return { success: false, message: `Login error: ${err.message}` };
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// scrapeOptionSamurai
// ---------------------------------------------------------------------------

const MAX_SCRAPE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000; // 10 s between retries

/**
 * Scrape Option Samurai using Playwright (matching OptionScope pattern).
 *
 * Logs in, navigates to the scan, clicks EXPORT -> CSV, parses the CSV,
 * and returns raw float values. The portfolio service converts to
 * cents / basis points before database insertion.
 *
 * Retries up to MAX_SCRAPE_ATTEMPTS times with a fresh browser on each
 * attempt to handle transient auth 502s and flaky page loads.
 */
export async function scrapeOptionSamurai(
  scanName: string = 'bi-weekly income all',
): Promise<ScanResultRow[]> {
  const email = process.env.OPTION_SAMURAI_EMAIL;
  const password = process.env.OPTION_SAMURAI_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing OPTION_SAMURAI_EMAIL or OPTION_SAMURAI_PASSWORD');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_SCRAPE_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        log('RETRY', `Attempt ${attempt}/${MAX_SCRAPE_ATTEMPTS} — waiting ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
      return await runScrape(email, password, scanName);
    } catch (err: any) {
      lastError = err;
      console.error(`[Scraper] Attempt ${attempt}/${MAX_SCRAPE_ATTEMPTS} failed: ${err.message}`);
    }
  }

  throw new Error(`Failed after ${MAX_SCRAPE_ATTEMPTS} attempts: ${lastError?.message}`);
}

/**
 * Single scrape attempt — launches a fresh browser, logs in, exports CSV,
 * and returns parsed results. Caller is responsible for retries.
 */
async function runScrape(
  email: string,
  password: string,
  scanName: string,
): Promise<ScanResultRow[]> {
  let browser: Browser | null = null;

  try {
    log('INIT', 'Starting Option Samurai automation with Playwright...');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

    // Step 1: Navigate to homepage
    log('STEP1', 'Navigating to homepage...');
    await page.goto('https://optionsamurai.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Step 2: Click Login
    log('STEP2', 'Looking for Login button...');
    const loginSelectors = [
      'a[href*="login"]',
      'button:has-text("Login")',
      'a:has-text("Login")',
      'a:has-text("LOG IN")',
      'button:has-text("LOG IN")',
    ];

    let loginClicked = false;
    for (const sel of loginSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        await page.click(sel);
        loginClicked = true;
        break;
      }
    }

    if (!loginClicked) {
      await takeScreenshot(page, 'login_button_not_found');
      throw new Error('Login button not found');
    }

    await page.waitForURL('**/login**', { timeout: 30000 });
    log('STEP2', 'On login page');

    // Step 3: Fill credentials
    log('STEP3', 'Filling credentials...');
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });
    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(password);

    // Step 4: Submit login
    log('STEP4', 'Clicking LOG IN...');
    const submitSelectors = [
      'button:has-text("LOG IN")',
      'button:has-text("Log In")',
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    let submitClicked = false;
    for (const sel of submitSelectors) {
      if ((await page.locator(sel).count()) > 0) {
        await page.click(sel);
        submitClicked = true;
        break;
      }
    }

    if (!submitClicked) {
      await takeScreenshot(page, 'submit_not_found');
      throw new Error('Submit button not found');
    }

    await page.waitForURL('**/screener**', { timeout: 60000 });
    log('STEP4', 'Logged in successfully');

    // Step 5: Find and click the saved scan
    log('STEP5', 'Waiting for Saved Scans...');
    await page.waitForLoadState('load', { timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.waitForSelector('text=Saved Scans', { timeout: 30000 });
    log('STEP5', `Looking for scan: "${scanName}"`);

    const scanLocator = page.locator(`a:has-text("${scanName}"), button:has-text("${scanName}")`).first();
    const scanCount = await page.locator(`a:has-text("${scanName}"), button:has-text("${scanName}")`).count();

    if (scanCount === 0) {
      await takeScreenshot(page, 'scan_not_found');
      throw new Error(`Scan "${scanName}" not found`);
    }

    await scanLocator.click({ timeout: 30000 });
    await page.waitForURL('**/scan/**', { timeout: 30000 });
    log('STEP5', 'Scan opened');

    // Step 6: Wait for results table
    log('STEP6', 'Waiting for results table...');
    await page.waitForSelector('table tr', { timeout: 30000 });
    const rowCount = await page.locator('table tr').count();
    log('STEP6', `Results table loaded with ${rowCount} rows`);

    // Step 7: Export CSV
    // Retry up to 3 times — the dropdown / download can be flaky on slower loads.
    let downloadPath = '';
    for (let exportAttempt = 1; exportAttempt <= 3; exportAttempt++) {
      try {
        log('STEP7', `Clicking EXPORT (attempt ${exportAttempt})...`);
        await page.click('button:has-text("EXPORT")');
        await page.waitForSelector('text=All pages results to CSV', { timeout: 10000 });

        // Set up download listener BEFORE clicking the CSV button.
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        // Use noWaitAfter so Playwright does NOT wait for a navigation that
        // will never happen — the click triggers a file download, not a page nav.
        await page.click('button:has-text("All pages results to CSV")', { noWaitAfter: true });
        const download = await downloadPromise;

        downloadPath = `/tmp/scan_${Date.now()}.csv`;
        await download.saveAs(downloadPath);
        log('STEP7', `CSV saved to ${downloadPath}`);
        break; // success
      } catch (err: any) {
        log('STEP7', `Export attempt ${exportAttempt} failed: ${err.message}`);
        if (exportAttempt === 3) throw err;
        // Dismiss any open dropdown before retrying
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);
      }
    }

    // Parse CSV
    const fs = await import('fs');
    const csvContent = fs.readFileSync(downloadPath, 'utf-8');
    log('STEP7', `CSV size: ${csvContent.length} bytes`);

    const records: any[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    log('STEP7', `Parsed ${records.length} records from CSV`);

    if (records.length > 0) {
      log('STEP7', `CSV columns: ${Object.keys(records[0]).join(', ')}`);
    }

    // Transform to ScanResultRow (raw float values — portfolio service converts)
    const results: ScanResultRow[] = records
      .map((r: any) => {
        const ticker = r['Underlying'] || r['Ticker'] || r['Symbol'] || '';
        if (!ticker) return null;

        let expDate = '';
        const rawExp = (r['expDate'] || r['Expiration Di'] || r['Expiration Date'] || r['Exp. Date'] || r['Expiration'] || '').split('/')[0];
        if (rawExp) {
          try {
            expDate = parseExpirationDate(rawExp);
          } catch (e: any) {
            console.warn(`[Scraper] Could not parse expDate "${rawExp}": ${e.message}`);
          }
        }

        // CSV percentage fields are decimals (0.8131 = 81.31%).
        // portfolio.ts expects plain numbers (81.31) and divides by 100
        // before converting to basis points, so multiply by 100 here.
        const probRaw = parseFloat(r['Prob Max Pro'] || r['Prob Max Profit'] || r['Prob. of Max. Profit'] || '0');
        const returnRaw = parseFloat(r['Return Acqui'] || r['Return Acquisition'] || r['Return %'] || '0');
        const ivRankRaw = parseFloat(r['Stock Iv'] || r['IV Rank'] || '0');
        const ivPctRaw = parseFloat(r['IV Percentile'] || '0');
        const moneynessRaw = parseFloat(r['Moneyness'] || '0');

        return {
          ticker,
          companyName: r['Company Name'] || r['Name'] || '',
          price: parseFloat(r['Stock Last'] || r['Price'] || '0'),
          priceChange: parseFloat(r['Price Change'] || r['% Change'] || '0'),
          ivRank: ivRankRaw <= 1 ? ivRankRaw * 100 : ivRankRaw,
          ivPercentile: ivPctRaw <= 1 ? ivPctRaw * 100 : ivPctRaw,
          strike: r['Strike'] || '',
          moneyness: moneynessRaw <= 1 ? moneynessRaw * 100 : moneynessRaw,
          expDate,
          daysToExp: parseInt(r['Days To Exp'] || r['Days To Expiration'] || r['DTE'] || '0'),
          totalOptVol: parseInt(r['Total Vol'] || r['Total Opt. Vol.'] || r['Volume'] || '0'),
          probMaxProfit: probRaw <= 1 ? probRaw * 100 : probRaw,
          // CSV values are per-share dollars — do NOT multiply by 100 here;
          // portfolio.ts already handles per-share → per-contract conversion.
          maxProfit: parseFloat(r['Max Profit'] || r['Max. Profit'] || '0'),
          maxLoss: parseFloat(r['Max Loss'] || r['Max. Loss'] || '0'),
          returnPercent: returnRaw <= 1 ? returnRaw * 100 : returnRaw,
        } as ScanResultRow;
      })
      .filter((r): r is ScanResultRow => r !== null);

    // Clean up
    fs.unlinkSync(downloadPath);

    log('SUCCESS', `Downloaded ${results.length} scan results`);
    return results;

  } catch (error: any) {
    console.error('[Scraper] Automation failed:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      log('CLEANUP', 'Browser closed');
    }
  }
}
