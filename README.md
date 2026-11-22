# Brief — Meeting Co-pilot for Even Realities G2

**Heads Up: Even Realities Hackathon** (TVM Ventures × Daos Hub × Even Realities)
**Track 04 · AI Assistants & Work** — Google Calendar · Gmail · AI assistant

Brief is a glanceable meeting co-pilot that lives on your G2 glasses. It tells
you what your next meeting is, why it matters, and what the room needs from
you — then lets you **act on it in seconds, hands-free**: send a "running
late" note, approve an AI-drafted follow-up email, move the meeting, or ask
the AI a question about it. No phone, no typing, no long dictation.

> The best G2 apps **read and write**. Brief is built around exactly that:
> every read (a brief, an answer) is one tap away from a write (a send, a
> calendar change), and every write shows a preview you confirm with one tap.

---

## What it does

| Screen | What you see / do |
| --- | --- |
| **Glance** | Next meeting, countdown, who's in it, and whether an AI follow-up draft is waiting for approval. |
| **Brief** (2 pages) | Why this meeting matters, your 3 talking points, who's attending, the latest email-thread summary, open items carried over, and the one thing the room needs from you. |
| **Act** | **Running late** → AI writes the note, you tap once to send it to all attendees. **Approve follow-up email** → review the AI draft of your last meeting's follow-up, one tap sends it. **Move +30 min** → preview, one tap, everyone's invite updates. **Ask Brief (AI)** → pick a smart question ("What changed since last time?"), get a one-line answer. |
| **Today** | The rest of your day as a scrollable list; open any meeting's brief. |
| **Ask** | Hold (long-press) anywhere on the glance screen to jump straight to AI questions about the next meeting — by voice in production. |

After any send, Brief shows a short confirmation and returns home by itself —
the wearer never has to tidy up.

### The interaction model (the whole thing)

- **Tap** — select / advance / confirm-send
- **Swipe ↑ / ↓** — move in a list, or turn a brief page
- **Double-tap** — back (on the home screen: exit, via the system dialog)
- **Hold** — ask the AI

Four gestures, learnable in ten seconds, identical on the temple touchpad and
the R1 ring.

## How it maps to the judging criteria

1. **Usefulness on G2 · 30%** — Brief solves the most repeated moment of a
   knowledge worker's day: the 10 minutes before a meeting, walking, hands
   full. Everything is glanceable: ≤ 8 short lines per screen, one idea per
   screen, no line over ~46 characters on the 576×288 monochrome display.
2. **Read and write · 25%** — Reading (calendar, thread summaries, briefs) is
   always paired with writing: attendee messages, follow-up emails, and
   calendar moves. Writes are one tap from an AI draft with smart defaults —
   never dictation, never a keyboard. Every write is previewed on the glasses
   and explicitly confirmed before it leaves.
3. **Technical execution · 20%** — A real Even Hub app: TypeScript + Vite on
   the official `@evenrealities/even_hub_sdk` (0.0.16), container-based pages
   (header / body / footer, one event-capturing container), flicker-free text
   upgrades, system exit dialog on the root page, and an `app.json` that
   passes the official `evenhub pack` validation (a packed `brief.ehpk` is
   produced by the build). The app logic is driver-agnostic and covered by an
   automated end-to-end run of the full demo flow (see *Verifying* below).
4. **UX for display and voice · 15%** — Designed for the green 576×288 canvas
   first, not shrunk from a phone UI: big type, high contrast, selection
   borders on lists, and a consistent hint strip on every screen. Questions
   and drafts are written to be *spoken* — in production the hold gesture
   captures voice via the G2 mic (`g2-microphone` permission is declared).
5. **Business potential and safety · 10%** — Calendar + email assistance is a
   proven, paid category; Brief is the glasses-native wedge. Safety is
   structural: nothing is ever sent without an on-glasses preview and an
   explicit tap, drafts are signed by the user (not auto-sent), and the demo
   build runs entirely on simulated data with **zero network calls**.

## Architecture

```
src/
  types.ts       Canvas/gesture/page types + the GlassesUI driver interface
  data.ts        WorkspaceProvider — calendar + mail + write actions.
                 Ships with a deterministic simulated workday; the interface
                 mirrors Google Calendar / Gmail payloads so the real APIs
                 drop in field-for-field.
  ai.ts          AssistantAI — briefs, late notes, Q&A. Ships with a local,
                 deterministic composer; swap in Claude/ChatGPT/Gemini
                 behind the same interface for production.
  app.ts         The screen state machine (glance → brief → act → confirm).
                 Knows nothing about the SDK or the DOM.
  ui-even.ts     Driver for real G2 hardware + the Even Hub simulator,
                 via the official SDK bridge.
  ui-browser.ts  Fallback driver that renders the identical container pages
                 into a 576×288 browser "lens" — used for the demo video.
  main.ts        Boot: native bridge present → Even driver, else browser.
```

Two deliberate design choices:

- **One core, two drivers.** The same `app.ts` renders the same pages on
  hardware and in the browser fallback, so what judges see in the demo video
  is byte-for-byte what the glasses show.
- **Simulated data, real seams.** The demo day is pinned to 09:48 with five
  meetings and one pending follow-up, so the demo is perfectly repeatable.
  Replacing `DemoWorkspaceProvider` / `LocalAssistantAI` with Google + LLM
  implementations changes nothing else.

## Run it

Prerequisites: Node.js 20+.

```bash
npm install
npm run dev        # Vite dev server on 0.0.0.0:5173
```

**In a plain browser** (no hardware): open http://localhost:5173 — Brief
boots into the browser simulator automatically. Click the lens (click = tap,
double-click = back, hold = ask AI, scroll = swipe) or use the on-screen
buttons / keyboard (Enter, Esc, ↑, ↓, L). The right-hand panel logs every
write action as it "leaves" the phone.

**In the Even Hub simulator**:

```bash
npm run dev                          # terminal 1
evenhub-simulator http://localhost:5173   # terminal 2
```

**On real G2 glasses**: enable Developer Mode in the Even App, then
`evenhub qr --url "http://<your-LAN-IP>:5173"` and scan with the phone.

**Package it** (validates `app.json` and produces an `.ehpk`):

```bash
npm run build
evenhub pack app.json dist -o brief.ehpk
```

## Verifying

`scripts/verify_demo.py` drives the production build through the complete
demo flow in headless Chromium (glance → brief → send late note → today →
ask → answer → approve follow-up), asserts the expected content on every
screen and in the write-action log, and saves screenshots to `screenshots/`.
It currently passes all steps with no console errors.

## Submission notes

- Solo entry; teams of 1–4 are eligible.
- This repository is the public source for the DoraHacks submission.
- A 2–3 minute demo walkthrough is scripted in [DEMO.md](DEMO.md).
- The demo build makes no network calls and uses no real accounts or data.
