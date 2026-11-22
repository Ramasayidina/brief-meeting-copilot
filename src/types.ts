// ---------------------------------------------------------------------------
// Shared types for Brief — Meeting Co-pilot.
//
// The app core (app.ts) never talks to the Even Hub SDK or the DOM directly.
// It renders *pages* made of containers and receives *actions*. Two drivers
// implement the GlassesUI interface:
//   - ui-even.ts    → real glasses / Even Hub simulator (via the SDK bridge)
//   - ui-browser.ts → plain-browser fallback that draws the same containers
//                     into a 576×288 green screen, for demos without hardware
// ---------------------------------------------------------------------------

/** The G2 canvas is 576×288 per eye, 4-bit green monochrome. */
export const CANVAS_W = 576
export const CANVAS_H = 288

/** Input gestures the app understands, normalised across both drivers. */
export type Gesture =
  | 'tap' // single temple tap / ring click — select, advance, confirm
  | 'double' // double tap — back; on the root page, exit
  | 'up' // swipe up — previous item / previous page of text
  | 'down' // swipe down — next item / next page of text
  | 'hold' // long press — "ask the AI" shortcut

export interface GestureEvent {
  gesture: Gesture
  /** For list containers: index of the item highlighted when the gesture fired. */
  selectIndex?: number
}

export interface TextBox {
  kind: 'text'
  id: number
  name: string
  x: number
  y: number
  w: number
  h: number
  content: string
  capture?: boolean
  bordered?: boolean
}

export interface ListBox {
  kind: 'list'
  id: number
  name: string
  x: number
  y: number
  w: number
  h: number
  items: string[]
  selected: number
  capture?: boolean
}

export type ContainerBox = TextBox | ListBox

export interface Page {
  containers: ContainerBox[]
}

/**
 * Minimal display surface the app core needs. Mirrors the Even Hub page
 * lifecycle: showPage() ≈ createStartUpPageContainer / rebuildPageContainer,
 * setText() ≈ textContainerUpgrade, exit() ≈ shutDownPageContainer(1).
 */
export interface GlassesUI {
  /** Render a full page. `first` is true only for the very first page. */
  showPage(page: Page, first: boolean): Promise<void>
  /** Flicker-free update of one text container's content. */
  setText(name: string, content: string): Promise<void>
  /** Subscribe to input gestures. */
  onGesture(cb: (ev: GestureEvent) => void): void
  /** Show the system exit confirmation (required on the root page). */
  exit(): Promise<void>
  /** Human-readable driver name, for logs. */
  readonly driverName: string
}

// ---------------------------------------------------------------------------
// Domain model — deliberately shaped like Google Calendar / Gmail payloads
// so the demo provider can be swapped for the real APIs field-for-field.
// ---------------------------------------------------------------------------

export interface Attendee {
  name: string
  email: string
  /** True for the meeting organiser. */
  organiser?: boolean
  /** The wearer of the glasses. */
  self?: boolean
}

export interface Meeting {
  id: string
  title: string
  /** Minutes from midnight, wearer's local time. */
  startMin: number
  endMin: number
  attendees: Attendee[]
  /** "Meet · link ready", a room name, or "" for none. */
  location: string
  /** One line: why this meeting matters right now. */
  why: string
  /** Talking points, most important first. Max 3 shown on glasses. */
  points: string[]
  /** Open loops carried over from previous meetings / email threads. */
  openItems: string[]
  /** One line summarising the latest email thread about this meeting. */
  threadSummary: string
  /** What changed since the last meeting with these people. */
  changed: string
  /** The decision / input the room needs from the wearer. */
  needsFromYou: string
  /** A risk worth raising, in one line. */
  risk: string
}

export interface FollowUpDraft {
  meetingId: string
  meetingTitle: string
  to: string
  subject: string
  body: string
}

/** A write action that actually left the app (sent / moved / approved). */
export interface WriteRecord {
  kind: 'message' | 'email' | 'calendar'
  summary: string
  detail: string
  atMin: number
}

/** Format minutes-from-midnight as "10:30". */
export function fmtTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}
