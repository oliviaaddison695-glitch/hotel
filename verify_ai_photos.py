from playwright.sync_api import sync_playwright, expect
import time
import os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.on("console", lambda msg: print(f"Browser console: {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser error: {err}"))
    page.on("requestfailed", lambda req: print(f"Request failed: {req.url} - {req.failure}"))

    server_url = "http://localhost:4174"
    print(f"Navigating to {server_url}...")

    maps_key = os.environ.get("GOOGLE_MAPS_BROWSER_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")

    page.goto(f"{server_url}?mapsKey={maps_key}&Gemini_API_key={gemini_key}")

    # Wait for the search box to be ready
    page.wait_for_selector("input#hotelName")

    # Fill in a hotel that is likely to have photos
    page.fill("input#hotelName", "Sallés Hotel Pere IV Barcelona")
    page.click("button[type='submit']")

    print("Waiting for search to complete...")
    # Wait for the result card to become visible
    try:
        page.wait_for_selector("#resultCard", state="visible", timeout=30000)
        print("Result card is visible!")
    except Exception as e:
        print(f"Timeout waiting for #resultCard: {e}")
        status_text = page.locator("#status").inner_text()
        print(f"Status is: {status_text}")

    # Let it settle and render
    page.wait_for_timeout(2000)

    # Check if we have the AI tab
    try:
        print("Clicking AI review tab...")
        page.click(".tab-button[data-target='tab-ai']", timeout=5000)
        # Wait for AI content to populate
        page.wait_for_selector("#aiInfoContent h2", timeout=5000)
        time.sleep(2) # let images load
    except Exception as e:
        print(f"Could not click AI tab or load content: {e}")

    os.makedirs("/home/jules/verification", exist_ok=True)
    screenshot_path = "/home/jules/verification/verification_ai_photos.png"
    page.screenshot(path=screenshot_path, full_page=True)
    print(f"Screenshot saved to {screenshot_path}")

    browser.close()
