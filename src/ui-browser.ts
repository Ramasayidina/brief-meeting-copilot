// ---------------------------------------------------------------------------
// BrowserUI — plain-browser fallback driver.
//
// Draws exactly the same container pages the Even Hub driver sends to the
// glasses into a 576×288 DOM "screen" (green monochrome, like the real
// micro-LED), and translates mouse / keyboard input into the same gestures.
// This is what makes the demo recordable with zero hardware: open the page,
// click the on-screen controls (or use the keyboard), and the app behaves
// as it does on the G2.
//
//   click            → tap        wheel / ↑ ↓ keys → swipe
//   double-click     → double     hold mouse / L   → long press (hold)
//   Esc / Backspace  → double (back)
// ---------------------------------------------------------------------------

import type { Gesture, GestureEvent, GlassesUI, ListBox, Page } from './types'

export class BrowserUI implements GlassesUI {
  readonly driverName = 'Browser simulator (576×288)'
  private cb: ((ev: GestureEvent) => void) | null = null
  private list: ListBox | null = null
  private listEl: HTMLElement | null = null
  private textEls = new Map<string, HTMLElement>()

  constructor(private screen: HTMLElement) {}

  async showPage(page: Page): Promise<void> {
    this.screen.innerHTML = ''
    this.textEls.clear()
    this.list = null
    this.listEl = null

    for (const c of page.containers) {
      const el = document.createElement('div')
      el.className = `g-container g-${c.kind}`
      el.style.left = `${c.x}px`
      el.style.top = `${c.y}px`
      el.style.width = `${c.w}px`
      el.style.height = `${c.h}px`
      if (c.kind === 'text') {
        el.textContent = c.content
        if (c.name === 'header') el.classList.add('g-header')
        if (c.name === 'footer') el.classList.add('g-footer')
        this.textEls.set(c.name, el)
      } else {
        this.list = { ...c }
        this.listEl = el
        this.renderList()
      }
      this.screen.appendChild(el)
    }
  }

  private renderList(): void {
    if (!this.list || !this.listEl) return
    this.listEl.innerHTML = ''
    this.list.items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'g-item' + (i === this.list!.selected ? ' g-selected' : '')
      row.textContent = item
      this.listEl!.appendChild(row)
    })
  }

  async setText(name: string, content: string): Promise<void> {
    const el = this.textEls.get(name)
    if (el) el.textContent = content
  }

  onGesture(cb: (ev: GestureEvent) => void): void {
    this.cb = cb
  }

  /** Feed one gesture into the app, as if it came from the glasses. */
  inject(gesture: Gesture): void {
    if (!this.cb) return
    if (this.list && (gesture === 'up' || gesture === 'down')) {
      const delta = gesture === 'down' ? 1 : -1
      const next = Math.min(
        Math.max(this.list.selected + delta, 0),
        this.list.items.length - 1,
      )
      this.list.selected = next
      this.renderList()
      this.cb({ gesture, selectIndex: next })
      return
    }
    this.cb({
      gesture,
      selectIndex: this.list ? this.list.selected : undefined,
    })
  }

  async exit(): Promise<void> {
    // On hardware this is the OS exit-confirmation dialog (mode 1).
    const el = document.createElement('div')
    el.className = 'g-exit-dialog'
    el.textContent = 'Exit Brief?\n(system dialog on real G2)'
    this.screen.appendChild(el)
  }
}
