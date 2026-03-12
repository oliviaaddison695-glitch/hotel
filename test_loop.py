import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))
        page.goto("http://localhost:4173/")

        page.fill("#hotelName", "hilton")
        page.click("button[type=submit]")
        page.wait_for_timeout(5000)
        page.screenshot(path="after_search_4173.png")
        browser.close()

if __name__ == "__main__":
    run()
