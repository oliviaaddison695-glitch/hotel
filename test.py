import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/")
        page.screenshot(path="start.png")

        page.fill("#hotelName", "hilton")
        page.click("button[type=submit]")
        page.wait_for_timeout(2000)
        page.screenshot(path="after_search.png")
        browser.close()

if __name__ == "__main__":
    run()
