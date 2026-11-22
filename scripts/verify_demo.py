"""Drive Brief (browser simulator) through the full demo flow and screenshot
every screen. Asserts the expected headline text at each step.

Prereqs: `npm run build` + `npm run preview` running on :4173, and Playwright
(Python) with Chromium installed. Screenshots land in ../screenshots/."""
import asyncio, pathlib, sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:4173/"
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

errors: list[str] = []

async def screen_text(page) -> str:
    return await page.locator("#glasses-screen").inner_text()

async def expect(page, needle: str, step: str) -> None:
    text = await screen_text(page)
    if needle not in text:
        raise AssertionError(f"[{step}] expected {needle!r} in screen:\n{text}")
    print(f"ok [{step}] saw {needle!r}")

async def gesture(page, name: str, wait_ms: int = 450) -> None:
    await page.click(f'[data-gesture="{name}"]')
    await page.wait_for_timeout(wait_ms)

async def shot(page, name: str) -> None:
    await page.locator(".glasses").screenshot(path=str(OUT / f"{name}.png"))
    print("shot", name)

async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1140, "height": 860})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE)
        await page.wait_for_timeout(900)

        # 1 — Glance
        await expect(page, "NEXT · in 12 min", "glance")
        await expect(page, "Q3 Roadmap Review", "glance")
        await shot(page, "01-glance")

        # 2 — Brief page 1
        await gesture(page, "tap")
        await expect(page, "Why: Ana moved the launch", "brief p1")
        await shot(page, "02-brief-1")

        # 3 — Brief page 2
        await gesture(page, "down")
        await expect(page, "Needs from you:", "brief p2")
        await shot(page, "03-brief-2")

        # 4 — Actions
        await gesture(page, "tap")
        await expect(page, "Running late — send note", "actions")
        await expect(page, "Approve follow-up email", "actions")
        await shot(page, "04-actions")

        # 5 — Confirm late note
        await gesture(page, "tap")
        await expect(page, "SEND NOTE?", "confirm late")
        await expect(page, "running 5 min behind", "confirm late")
        await shot(page, "05-confirm-late-note")

        # 6 — Done; write log on the phone panel must show the message
        await gesture(page, "tap")
        await expect(page, "✓ Sent", "done late")
        panel = await page.locator("#write-log").inner_text()
        assert "Late note → Q3 Roadmap Review" in panel, panel
        print("ok [panel] late note logged")
        await shot(page, "06-done-note-sent")

        # auto-return to glance after ~4s
        await page.wait_for_timeout(4200)
        await expect(page, "NEXT · in 12 min", "auto-home")

        # 7 — Today list
        await gesture(page, "down")
        await expect(page, "Investor Update — Meridian", "today")
        await shot(page, "07-today")

        # back to glance, then hold → Ask Brief
        await gesture(page, "double")
        await expect(page, "NEXT · in 12 min", "glance again")
        await gesture(page, "hold")
        await expect(page, "What do they need from me?", "ask")
        await shot(page, "08-ask")

        # 8 — Answer (2nd question)
        await gesture(page, "down")
        await gesture(page, "tap")
        await expect(page, "cutting onboarding v2", "answer")
        await shot(page, "09-answer")

        # 9 — Approve follow-up: back to brief → actions → item 4
        await gesture(page, "double")          # answer → brief
        await gesture(page, "tap")             # brief → actions
        await gesture(page, "down"); await gesture(page, "down"); await gesture(page, "down")
        await gesture(page, "tap")             # → confirm follow-up
        await expect(page, "SEND EMAIL?", "confirm followup")
        await gesture(page, "tap")             # send
        await expect(page, "✓ Sent", "done followup")
        panel = await page.locator("#write-log").inner_text()
        assert "Follow-up email → finance@acme.co" in panel, panel
        print("ok [panel] follow-up email logged")
        await shot(page, "10-followup-sent")

        await page.wait_for_timeout(4200)      # auto-home
        await page.screenshot(path=str(OUT / "11-full-page.png"))
        await browser.close()

    real_errors = [e for e in errors if "favicon" not in e]
    if real_errors:
        print("CONSOLE/PAGE ERRORS:", *real_errors, sep="\n  ")
        sys.exit(1)
    print("ALL STEPS PASSED, no console errors")

asyncio.run(main())
