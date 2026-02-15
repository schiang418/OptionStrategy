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

/**
 * Scrape Option Samurai using Playwright (matching OptionScope pattern).
 *
 * Logs in, navigates to the scan, clicks EXPORT -> CSV, parses the CSV,
 * and returns raw float values. The portfolio service converts to
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
    log('STEP7', 'Clicking EXPORT...');
    await page.click('button:has-text("EXPORT")');
    await page.waitForSelector('text=All pages results to CSV', { timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.click('button:has-text("All pages results to CSV")');
    const download = await downloadPromise;

    const downloadPath = `/tmp/scan_${Date.now()}.csv`;
    await download.saveAs(downloadPath);
    log('STEP7', `CSV saved to ${downloadPath}`);

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

        return {
          ticker,
          companyName: r['Company Name'] || r['Name'] || '',
          price: parseFloat(r['Stock Last'] || r['Price'] || '0'),
          priceChange: parseFloat(r['Price Change'] || r['% Change'] || '0'),
          ivRank: parseFloat(r['Stock Iv'] || r['IV Rank'] || '0'),
          ivPercentile: parseFloat(r['IV Percentile'] || '0'),
          strike: r['Strike'] || '',
          moneyness: parseFloat(r['Moneyness'] || '0'),
          expDate,
          daysToExp: parseInt(r['Days To Exp'] || r['Days To Expiration'] || r['DTE'] || '0'),
          totalOptVol: parseInt(r['Total Vol'] || r['Total Opt. Vol.'] || r['Volume'] || '0'),
          probMaxProfit: parseFloat(r['Prob Max Pro'] || r['Prob Max Profit'] || r['Prob. of Max. Profit'] || '0'),
          // CSV values are per-share, multiply by 100 for per-contract
          maxProfit: parseFloat(r['Max Profit'] || r['Max. Profit'] || '0') * 100,
          maxLoss: parseFloat(r['Max Loss'] || r['Max. Loss'] || '0') * 100,
          returnPercent: parseFloat(r['Return Acqui'] || r['Return Acquisition'] || r['Return %'] || '0'),
        } as ScanResultRow;
      })
      .filter((r): r is ScanResultRow => r !== null);

    // Clean up
    fs.unlinkSync(downloadPath);

    log('SUCCESS', `Downloaded ${results.length} scan results`);
    return results;

  } catch (error: any) {
    console.error('[Scraper] Automation failed:', error.message);
    throw new Error(`Failed to download scan results: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      log('CLEANUP', 'Browser closed');
    }
  }
}
