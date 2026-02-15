import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseExpirationDate } from '../utils/dates.js';
import type { ScanResultRow } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTOMATION_DIR = path.join(__dirname, '../../automation');

// ---------------------------------------------------------------------------
// Subprocess runner (SwingTrade pattern)
// ---------------------------------------------------------------------------

function runPython(scriptName: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(AUTOMATION_DIR, scriptName);
    const proc = spawn('python3', [scriptPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000, // 2 minutes
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log Python stderr in real-time
      for (const line of data.toString().trim().split('\n')) {
        if (line) console.log(line);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Scraper] Python exited with code ${code}`);
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(
          new Error(
            `Failed to parse scraper output: ${stdout.slice(0, 500)}\nStderr: ${stderr.slice(0, 500)}`,
          ),
        );
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
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

  try {
    const result = await runPython('test_login.py', [
      '--email', email,
      '--password', password,
    ]);
    return { success: result.success, message: result.message };
  } catch (err: any) {
    return { success: false, message: `Login error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// scrapeOptionSamurai
// ---------------------------------------------------------------------------

/**
 * Scrape Option Samurai using Python + Selenium subprocess.
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

  const dataDir = process.env.DATA_DIR || '/data';

  console.log('[Scraper] Starting Python + Selenium scraper...');
  const result = await runPython('scrape_option_samurai.py', [
    '--email', email,
    '--password', password,
    '--scan-name', scanName,
    '--data-dir', dataDir,
  ]);

  if (!result.success) {
    throw new Error(result.error || 'Scraper failed');
  }

  const rawResults: any[] = result.results || [];
  console.log(`[Scraper] Got ${rawResults.length} raw results from Python`);

  // Parse expiration dates into YYYY-MM-DD; return raw float values
  const parsed: ScanResultRow[] = rawResults
    .filter((r: any) => r.ticker)
    .map((r: any) => {
      let expDate = '';
      if (r.expDate) {
        try {
          expDate = parseExpirationDate(r.expDate);
        } catch (e: any) {
          console.warn(`[Scraper] Could not parse expDate "${r.expDate}": ${e.message}`);
        }
      }
      return { ...r, expDate } as ScanResultRow;
    });

  return parsed;
}
