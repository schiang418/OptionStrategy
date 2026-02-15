#!/usr/bin/env python3
"""
Test Option Samurai login using Selenium.

Usage:
    python3 test_login.py --email user@example.com --password secret

Outputs JSON to stdout.
"""

import argparse
import json
import os
import sys
import time

def log(msg):
    print(f"[TestLogin] {msg}", file=sys.stderr, flush=True)

def main():
    parser = argparse.ArgumentParser(description="Test Option Samurai Login")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By

    LOGIN_URL = "https://app.optionsamurai.com/login"

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-setuid-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")

    chromium_path = os.environ.get("PUPPETEER_EXECUTABLE_PATH") or os.environ.get("CHROMIUM_PATH")
    if not chromium_path:
        for p in ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]:
            if os.path.exists(p):
                chromium_path = p
                break
    if chromium_path:
        chrome_options.binary_location = chromium_path

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

        log("Navigating to login page...")
        driver.get(LOGIN_URL)
        time.sleep(2)

        for selector in ['input[type="email"]', 'input[name="email"]', '#email']:
            try:
                el = driver.find_element(By.CSS_SELECTOR, selector)
                if el:
                    el.send_keys(args.email)
                    break
            except:
                continue

        for selector in ['input[type="password"]', 'input[name="password"]', '#password']:
            try:
                el = driver.find_element(By.CSS_SELECTOR, selector)
                if el:
                    el.send_keys(args.password)
                    break
            except:
                continue

        for selector in ['button[type="submit"]', 'button.login-button', 'input[type="submit"]']:
            try:
                el = driver.find_element(By.CSS_SELECTOR, selector)
                if el:
                    el.click()
                    break
            except:
                continue

        time.sleep(5)

        is_logged_in = "/login" not in driver.current_url
        print(json.dumps({
            "success": is_logged_in,
            "message": "Login successful" if is_logged_in else "Login failed - still on login page",
        }))

    except Exception as e:
        log(f"Error: {e}")
        print(json.dumps({"success": False, "message": f"Login error: {str(e)}"}))
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

if __name__ == "__main__":
    main()
