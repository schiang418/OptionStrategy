#!/usr/bin/env python3
"""
Scrape Option Samurai scan results using Selenium + Chromium.

Usage:
    python3 scrape_option_samurai.py \
        --email user@example.com \
        --password secret \
        --scan-name "bi-weekly income all" \
        [--data-dir /data]

Outputs JSON to stdout. Logs go to stderr.
"""

import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime

def log(msg):
    print(f"[Scraper] {msg}", file=sys.stderr, flush=True)

def main():
    parser = argparse.ArgumentParser(description="Scrape Option Samurai")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--scan-name", default="bi-weekly income all")
    parser.add_argument("--data-dir", default="/data")
    args = parser.parse_args()

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    BASE_URL = "https://app.optionsamurai.com"
    LOGIN_URL = f"{BASE_URL}/login"

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-setuid-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-software-rasterizer")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--single-process")
    chrome_options.add_argument("--dns-prefetch-disable")

    # Use system chromium
    chromium_path = os.environ.get("PUPPETEER_EXECUTABLE_PATH") or os.environ.get("CHROMIUM_PATH")
    if not chromium_path:
        for p in ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]:
            if os.path.exists(p):
                chromium_path = p
                break

    if chromium_path:
        chrome_options.binary_location = chromium_path

    # ChromeDriver path
    driver_path = None
    for p in ["/usr/bin/chromedriver", "/usr/lib/chromium/chromedriver"]:
        if os.path.exists(p):
            driver_path = p
            break

    driver = None
    try:
        log("Launching browser...")
        service_kwargs = {"service": Service(executable_path=driver_path)} if driver_path else {}
        driver = webdriver.Chrome(options=chrome_options, **service_kwargs)
        driver.set_page_load_timeout(30)
        wait = WebDriverWait(driver, 15)

        # ---- Login ----
        log("Navigating to login page...")
        driver.get(LOGIN_URL)
        time.sleep(2)

        # Find email field
        email_field = None
        for selector in ['input[type="email"]', 'input[name="email"]', '#email']:
            try:
                email_field = driver.find_element(By.CSS_SELECTOR, selector)
                if email_field:
                    break
            except:
                continue

        if not email_field:
            take_screenshot(driver, args.data_dir, "login-no-email-field")
            raise Exception("Could not find email input field")

        email_field.send_keys(args.email)

        # Find password field
        pwd_field = None
        for selector in ['input[type="password"]', 'input[name="password"]', '#password']:
            try:
                pwd_field = driver.find_element(By.CSS_SELECTOR, selector)
                if pwd_field:
                    break
            except:
                continue

        if not pwd_field:
            take_screenshot(driver, args.data_dir, "login-no-password-field")
            raise Exception("Could not find password input field")

        pwd_field.send_keys(args.password)

        # Click submit
        submit_btn = None
        for selector in ['button[type="submit"]', 'button.login-button', 'input[type="submit"]']:
            try:
                submit_btn = driver.find_element(By.CSS_SELECTOR, selector)
                if submit_btn:
                    break
            except:
                continue

        if submit_btn:
            submit_btn.click()
        else:
            # Try pressing Enter
            pwd_field.send_keys("\n")

        time.sleep(5)

        if "/login" in driver.current_url:
            take_screenshot(driver, args.data_dir, "login-failed")
            raise Exception("Login failed - still on login page")

        log("Login successful")

        # ---- Navigate to Scans ----
        log("Navigating to scans...")
        driver.get(f"{BASE_URL}/scans")
        time.sleep(3)

        # ---- Find and click the saved scan ----
        scan_name_lower = args.scan_name.lower()
        log(f'Looking for scan: "{args.scan_name}"...')

        # Wait for page content
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "table")))
        time.sleep(2)

        # Click on the scan by text content
        scan_clicked = driver.execute_script("""
            var name = arguments[0].toLowerCase();
            var elements = document.querySelectorAll('a, button, td, span, div');
            for (var i = 0; i < elements.length; i++) {
                var text = (elements[i].textContent || '').trim().toLowerCase();
                if (text.includes(name)) {
                    elements[i].click();
                    return true;
                }
            }
            return false;
        """, args.scan_name)

        if not scan_clicked:
            take_screenshot(driver, args.data_dir, "scan-not-found")
            raise Exception(f'Could not find scan named "{args.scan_name}"')

        # Wait for results
        time.sleep(5)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "table")))

        # ---- Parse the results table ----
        log("Parsing results table...")
        results = driver.execute_script("""
            var rows = [];
            var tables = document.querySelectorAll('table');

            // Find the results table (largest one)
            var resultsTable = null;
            var maxRows = 0;
            tables.forEach(function(table) {
                var rowCount = table.querySelectorAll('tbody tr').length;
                if (rowCount > maxRows) {
                    maxRows = rowCount;
                    resultsTable = table;
                }
            });

            if (!resultsTable) return rows;

            // Get headers
            var headers = [];
            resultsTable.querySelectorAll('thead th').forEach(function(th) {
                headers.push((th.textContent || '').trim().toLowerCase());
            });

            // Parse rows
            resultsTable.querySelectorAll('tbody tr').forEach(function(tr) {
                var cells = [];
                tr.querySelectorAll('td').forEach(function(td) {
                    cells.push((td.textContent || '').trim());
                });

                if (cells.length < 5) return;

                function getCol(keywords) {
                    for (var k = 0; k < keywords.length; k++) {
                        for (var h = 0; h < headers.length; h++) {
                            if (headers[h].includes(keywords[k]) && h < cells.length) {
                                return cells[h];
                            }
                        }
                    }
                    return '';
                }

                function parseNum(s) {
                    var cleaned = s.replace(/[%$,]/g, '').trim();
                    return parseFloat(cleaned) || 0;
                }

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
                    returnPercent: parseNum(getCol(['return', 'ret']))
                });
            });

            return rows;
        """)

        log(f"Found {len(results)} results")

        # Filter out empty tickers
        results = [r for r in results if r.get("ticker")]

        # Output JSON to stdout
        print(json.dumps({"success": True, "results": results}))

    except Exception as e:
        log(f"Error: {e}")
        traceback.print_exc(file=sys.stderr)
        if driver:
            take_screenshot(driver, args.data_dir, "error")
        print(json.dumps({"success": False, "error": str(e), "results": []}))
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def take_screenshot(driver, data_dir, label):
    try:
        dir_path = data_dir if os.path.isdir(data_dir) else "/tmp"
        filepath = os.path.join(dir_path, f"scraper-error-{label}-{int(time.time())}.png")
        driver.save_screenshot(filepath)
        log(f"Screenshot saved: {filepath}")
    except Exception as e:
        log(f"Failed to take screenshot: {e}")


if __name__ == "__main__":
    main()
