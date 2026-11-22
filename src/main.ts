// ---------------------------------------------------------------------------
// Boot: pick the driver, start the app.
//
// On real hardware / in the Even Hub simulator the page runs inside the Even
// App's WebView, which injects the native bridge (flutter_inappwebview).
// Only then do we wait for the SDK bridge. In a plain browser we go straight
// to the BrowserUI fallback, so the demo never hangs waiting for a bridge
// that will never arrive.
//
// Force a driver with ?driver=even or ?driver=browser if ever needed.
// ---------------------------------------------------------------------------

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { LocalAssistantAI } from './ai'
import { BriefApp } from './app'
import { DemoWorkspaceProvider } from './data'
import { fmtTime, type Gesture } from './types'
import { BrowserUI } from './ui-browser'
import { EvenHubUI } from './ui-even'

declare global {
  interface Window {
    flutter_inappwebview?: unknown
  }
}

const params = new URLSearchParams(location.search)
const forced = params.get('driver')
const hasNativeBridge =
  forced === 'even' || (forced !== 'browser' && !!window.flutter_inappwebview)

const data = new DemoWorkspaceProvider()

async function boot(): Promise<void> {
  const hooks = {
    onWrite: (rec: { kind: string; summary: string; detail: string; atMin: number }) => {
      logWrite(`${rec.kind.toUpperCase()} · ${fmtTime(rec.atMin)} — ${rec.summary}\n${rec.detail}`)
    },
    onScreen: (name: string) => {
      const el = document.getElementById('panel-screen')
      if (el) el.textContent = name
    },
  }

  if (hasNativeBridge) {
    const bridge = await waitForEvenAppBridge()
    const ui = new EvenHubUI(bridge)
    await new BriefApp(ui, data, new LocalAssistantAI(), hooks).start()
    console.log(`[Brief] driver: ${ui.driverName}`)
    return
  }

  const screen = document.getElementById('glasses-screen')
  if (!screen) throw new Error('#glasses-screen missing')
  const ui = new BrowserUI(screen)
  wireBrowserInput(ui, screen)
  await new BriefApp(ui, data, new LocalAssistantAI(), hooks).start()
  console.log(`[Brief] driver: ${ui.driverName}`)
}

// ------------------------------------------------------------ browser input

function wireBrowserInput(ui: BrowserUI, screen: HTMLElement): void {
  // Click vs double-click: the glasses report these as distinct events, so
  // delay a single tap briefly to see whether a second one arrives.
  let tapTimer: ReturnType<typeof setTimeout> | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let holdFired = false

  const fireTap = () => {
    tapTimer = null
    ui.inject('tap')
  }

  screen.addEventListener('mousedown', () => {
    holdFired = false
    holdTimer = setTimeout(() => {
      holdFired = true
      if (tapTimer) {
        clearTimeout(tapTimer)
        tapTimer = null
      }
      ui.inject('hold')
    }, 600)
  })
  screen.addEventListener('mouseup', () => {
    if (holdTimer) clearTimeout(holdTimer)
    if (holdFired) return
    if (tapTimer) {
      clearTimeout(tapTimer)
      tapTimer = null
      ui.inject('double')
    } else {
      tapTimer = setTimeout(fireTap, 260)
    }
  })
  screen.addEventListener('wheel', (e) => {
    e.preventDefault()
    ui.inject(e.deltaY > 0 ? 'down' : 'up')
  }, { passive: false })

  // On-screen control buttons (also what the demo video clicks).
  document.querySelectorAll<HTMLElement>('[data-gesture]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.inject(btn.dataset.gesture as Gesture)
    })
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') ui.inject('down')
    else if (e.key === 'ArrowUp') ui.inject('up')
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      ui.inject('tap')
    } else if (e.key === 'Escape' || e.key === 'Backspace') ui.inject('double')
    else if (e.key.toLowerCase() === 'l' && !e.repeat) ui.inject('hold')
  })
}

// ------------------------------------------------------------ phone panel

function logWrite(text: string): void {
  const log = document.getElementById('write-log')
  if (!log) return
  const entry = document.createElement('div')
  entry.className = 'log-entry'
  entry.textContent = text
  log.prepend(entry)
}

void boot()
