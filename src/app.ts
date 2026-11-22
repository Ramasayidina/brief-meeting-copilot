// ---------------------------------------------------------------------------
// Brief — Meeting Co-pilot: application core.
//
// A small state machine over glasses pages. It renders through GlassesUI and
// reads/writes through WorkspaceProvider + AssistantAI, so the exact same
// logic runs on real G2 hardware, in the Even Hub simulator, and in the
// plain-browser fallback.
//
// Interaction model (the whole app, learnable in 10 seconds):
//   tap        select / advance / confirm-send
//   swipe ↓/↑  move in a list, or turn a brief page
//   double-tap back (on the root page: exit, with the system dialog)
//   hold       ask the AI about the next meeting
//
// Every screen is glanceable: ≤ 8 short lines, no line over ~46 characters,
// one idea per screen — designed for a 576×288 monochrome display.
// ---------------------------------------------------------------------------

import type { AssistantAI } from './ai'
import type { WorkspaceProvider } from './data'
import type {
  ContainerBox,
  GestureEvent,
  GlassesUI,
  Meeting,
  Page,
  WriteRecord,
} from './types'
import { fmtTime } from './types'

// Page layout: header strip, body, footer hint strip. 3 containers — well
// inside the G2 limit, and only the body ever captures input events.
const HEADER = { id: 90, name: 'header', x: 0, y: 0, w: 576, h: 32 }
const BODY = { id: 1, name: 'body', x: 0, y: 38, w: 576, h: 208 }
const FOOTER = { id: 91, name: 'footer', x: 0, y: 252, w: 576, h: 36 }

type PendingAction =
  | { kind: 'late'; meetingId: string; preview: string }
  | { kind: 'followup'; preview: string }
  | { kind: 'move'; meetingId: string; preview: string }

type Screen =
  | { name: 'glance' }
  | { name: 'today'; selected: number }
  | { name: 'brief'; meetingId: string; page: number; returnTo: 'glance' | 'today' }
  | { name: 'actions'; meetingId: string; selected: number }
  | { name: 'ask'; meetingId: string; selected: number }
  | { name: 'answer'; meetingId: string; q: number }
  | { name: 'confirm'; action: PendingAction; meetingId: string }
  | { name: 'done'; lines: string[] }

export interface BriefAppHooks {
  /** Called after every successful write action (for the phone-side log). */
  onWrite?: (rec: WriteRecord) => void
  /** Called whenever the visible screen changes (for the demo panel). */
  onScreen?: (screenName: string) => void
}

export class BriefApp {
  private screen: Screen = { name: 'glance' }
  private firstRender = true
  private renderChain: Promise<void> = Promise.resolve()
  private doneTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private ui: GlassesUI,
    private data: WorkspaceProvider,
    private ai: AssistantAI,
    private hooks: BriefAppHooks = {},
  ) {}

  async start(): Promise<void> {
    this.ui.onGesture((ev) => {
      void this.handleGesture(ev)
    })
    await this.render()
  }

  // ------------------------------------------------------------- rendering

  private render(): Promise<void> {
    // Serialise renders so rapid gestures can't interleave page rebuilds.
    this.renderChain = this.renderChain.then(() => this.renderNow())
    return this.renderChain
  }

  private async renderNow(): Promise<void> {
    const page = await this.buildPage(this.screen)
    const first = this.firstRender
    this.firstRender = false
    await this.ui.showPage(page, first)
    this.hooks.onScreen?.(this.screen.name)
  }

  private page(header: string, body: ContainerBox, footer: string): Page {
    return {
      containers: [
        { kind: 'text', ...HEADER, content: header },
        body,
        { kind: 'text', ...FOOTER, content: footer },
      ],
    }
  }

  private textBody(content: string): ContainerBox {
    return { kind: 'text', ...BODY, content, capture: true }
  }

  private listBody(items: string[], selected: number): ContainerBox {
    return { kind: 'list', ...BODY, items, selected, capture: true }
  }

  private clockHeader(right: string): string {
    return `BRIEF · ${fmtTime(this.data.now())} — ${right}`
  }

  private async nextMeeting(): Promise<Meeting | undefined> {
    const meetings = await this.data.listMeetings()
    return meetings.find((m) => m.startMin >= this.data.now()) ?? meetings[0]
  }

  private async buildPage(screen: Screen): Promise<Page> {
    switch (screen.name) {
      case 'glance': {
        const next = await this.nextMeeting()
        const followUp = await this.data.pendingFollowUp()
        if (!next) {
          return this.page(
            this.clockHeader('all clear'),
            this.textBody('No more meetings today.\n\nBrief will stay quiet.\nEnjoy the focus time.'),
            '2× tap: exit',
          )
        }
        const inMin = next.startMin - this.data.now()
        const others = next.attendees.filter((a) => !a.self)
        const names = others.slice(0, 2).map((a) => a.name).join(' · ')
        const extra = others.length > 2 ? ` · +${others.length - 2}` : ''
        const lines = [
          inMin > 0 ? `NEXT · in ${inMin} min` : 'NEXT · starting now',
          next.title,
          `${fmtTime(next.startMin)}–${fmtTime(next.endMin)}${next.location ? ` · ${next.location}` : ''}`,
          others.length ? `${names}${extra}` : 'Just you',
          '',
          followUp
            ? `Follow-up ready: ${followUp.meetingTitle}`
            : `Last thread: ${next.threadSummary.split(': ')[1] ?? next.threadSummary}`,
        ]
        return this.page(
          this.clockHeader('meeting co-pilot'),
          this.textBody(lines.join('\n')),
          'Tap: brief · ↓: today · hold: ask AI · 2×: exit',
        )
      }

      case 'today': {
        const meetings = await this.data.listMeetings()
        const items = meetings.map(
          (m) => `${fmtTime(m.startMin)}  ${m.title}`,
        )
        return this.page(
          this.clockHeader('today'),
          this.listBody(items, screen.selected),
          '↓↑: pick · tap: open brief · 2×: back',
        )
      }

      case 'brief': {
        const meeting = await this.data.getMeeting(screen.meetingId)
        if (!meeting) return this.buildPage({ name: 'glance' })
        const pages = await this.ai.briefPages(meeting)
        const pageIdx = Math.min(screen.page, pages.length - 1)
        const footer =
          pageIdx < pages.length - 1
            ? 'Tap: act · ↓: more · 2×: back'
            : 'Tap: act · ↑: top · 2×: back'
        return this.page(
          this.clockHeader(`brief ${pageIdx + 1}/${pages.length}`),
          this.textBody(pages[pageIdx]),
          footer,
        )
      }

      case 'actions': {
        const meeting = await this.data.getMeeting(screen.meetingId)
        const items = await this.actionItems(screen.meetingId)
        return this.page(
          this.clockHeader('act'),
          this.listBody(items, screen.selected),
          `${meeting?.title ?? ''} · tap: choose · 2×: back`,
        )
      }

      case 'ask': {
        const meeting = await this.data.getMeeting(screen.meetingId)
        if (!meeting) return this.buildPage({ name: 'glance' })
        const questions = await this.ai.questions(meeting)
        return this.page(
          this.clockHeader('ask brief'),
          this.listBody(questions, screen.selected),
          'Tap: hear answer · 2×: back',
        )
      }

      case 'answer': {
        const meeting = await this.data.getMeeting(screen.meetingId)
        if (!meeting) return this.buildPage({ name: 'glance' })
        const questions = await this.ai.questions(meeting)
        const answer = await this.ai.answer(meeting, screen.q)
        return this.page(
          this.clockHeader('brief says'),
          this.textBody(`Q: ${questions[screen.q]}\n\n${answer}`),
          'Tap: ask more · 2×: brief',
        )
      }

      case 'confirm': {
        const a = screen.action
        const title =
          a.kind === 'late'
            ? 'SEND NOTE?'
            : a.kind === 'followup'
              ? 'SEND EMAIL?'
              : 'MOVE MEETING?'
        return this.page(
          this.clockHeader('confirm'),
          this.textBody(`${title}\n\n${a.preview}`),
          'Tap: SEND · 2×: cancel',
        )
      }

      case 'done': {
        return this.page(
          this.clockHeader('done'),
          this.textBody(screen.lines.join('\n')),
          'Tap: home',
        )
      }
    }
  }

  /** Action menu entries for a meeting; index-stable within one render. */
  private async actionItems(meetingId: string): Promise<string[]> {
    const items = ['Running late — send note', 'Ask Brief (AI)', 'Move meeting +30 min']
    const followUp = await this.data.pendingFollowUp()
    if (followUp) items.push('Approve follow-up email')
    void meetingId
    return items
  }

  // ------------------------------------------------------------- gestures

  private async handleGesture(ev: GestureEvent): Promise<void> {
    if (this.doneTimer) {
      clearTimeout(this.doneTimer)
      this.doneTimer = null
    }
    const s = this.screen
    const g = ev.gesture

    switch (s.name) {
      case 'glance': {
        const next = await this.nextMeeting()
        if (g === 'double') return void (await this.ui.exit())
        if (!next) return
        if (g === 'tap')
          this.screen = { name: 'brief', meetingId: next.id, page: 0, returnTo: 'glance' }
        else if (g === 'down') this.screen = { name: 'today', selected: 0 }
        else if (g === 'hold') this.screen = { name: 'ask', meetingId: next.id, selected: 0 }
        break
      }

      case 'today': {
        const meetings = await this.data.listMeetings()
        if (ev.selectIndex !== undefined) s.selected = ev.selectIndex
        if (g === 'double') this.screen = { name: 'glance' }
        else if (g === 'tap') {
          const m = meetings[s.selected]
          if (m)
            this.screen = { name: 'brief', meetingId: m.id, page: 0, returnTo: 'today' }
        }
        break
      }

      case 'brief': {
        const meeting = await this.data.getMeeting(s.meetingId)
        if (!meeting) {
          this.screen = { name: 'glance' }
          break
        }
        const pageCount = (await this.ai.briefPages(meeting)).length
        if (g === 'tap') this.screen = { name: 'actions', meetingId: s.meetingId, selected: 0 }
        else if (g === 'down' && s.page < pageCount - 1) s.page += 1
        else if (g === 'up' && s.page > 0) s.page -= 1
        else if (g === 'double')
          this.screen =
            s.returnTo === 'today' ? { name: 'today', selected: 0 } : { name: 'glance' }
        else return // swipe at a boundary: nothing to do, don't re-render
        break
      }

      case 'actions': {
        if (ev.selectIndex !== undefined) s.selected = ev.selectIndex
        if (g === 'double') {
          this.screen = { name: 'brief', meetingId: s.meetingId, page: 0, returnTo: 'glance' }
        } else if (g === 'tap') {
          await this.chooseAction(s.meetingId, s.selected)
          return // chooseAction renders
        } else return
        break
      }

      case 'ask': {
        if (ev.selectIndex !== undefined) s.selected = ev.selectIndex
        if (g === 'double')
          this.screen = { name: 'brief', meetingId: s.meetingId, page: 0, returnTo: 'glance' }
        else if (g === 'tap')
          this.screen = { name: 'answer', meetingId: s.meetingId, q: s.selected }
        else return
        break
      }

      case 'answer': {
        if (g === 'tap') this.screen = { name: 'ask', meetingId: s.meetingId, selected: s.q }
        else if (g === 'double')
          this.screen = { name: 'brief', meetingId: s.meetingId, page: 0, returnTo: 'glance' }
        else return
        break
      }

      case 'confirm': {
        if (g === 'double') {
          this.screen = { name: 'actions', meetingId: s.meetingId, selected: 0 }
        } else if (g === 'tap') {
          await this.executeAction(s.action)
          return // executeAction renders
        } else return
        break
      }

      case 'done': {
        this.screen = { name: 'glance' }
        break
      }
    }
    await this.render()
  }

  private async chooseAction(meetingId: string, index: number): Promise<void> {
    const meeting = await this.data.getMeeting(meetingId)
    if (!meeting) return
    switch (index) {
      case 0: {
        const note = await this.ai.lateNote(meeting, this.data.userFirstName)
        const others = meeting.attendees.filter((a) => !a.self).length
        this.screen = {
          name: 'confirm',
          meetingId,
          action: {
            kind: 'late',
            meetingId,
            preview: `To ${others} people in ${meeting.title}:\n\n"${note}"`,
          },
        }
        break
      }
      case 1:
        this.screen = { name: 'ask', meetingId, selected: 0 }
        break
      case 2:
        this.screen = {
          name: 'confirm',
          meetingId,
          action: {
            kind: 'move',
            meetingId,
            preview:
              `${meeting.title}\n${fmtTime(meeting.startMin)} → ${fmtTime(meeting.startMin + 30)}\n\n` +
              'Everyone gets an updated invite.',
          },
        }
        break
      case 3: {
        const draft = await this.data.pendingFollowUp()
        if (!draft) return
        this.screen = {
          name: 'confirm',
          meetingId,
          action: {
            kind: 'followup',
            preview: `To: ${draft.to}\n${draft.subject}\n\n${draft.body}`,
          },
        }
        break
      }
      default:
        return
    }
    await this.render()
  }

  private async executeAction(action: PendingAction): Promise<void> {
    let rec: WriteRecord
    if (action.kind === 'late') {
      const meeting = await this.data.getMeeting(action.meetingId)
      if (!meeting) return
      const note = await this.ai.lateNote(meeting, this.data.userFirstName)
      rec = await this.data.sendLateNote(meeting, note)
    } else if (action.kind === 'followup') {
      const draft = await this.data.pendingFollowUp()
      if (!draft) return
      rec = await this.data.sendFollowUp(draft)
    } else {
      const meeting = await this.data.getMeeting(action.meetingId)
      if (!meeting) return
      rec = await this.data.moveMeeting(meeting, 30)
    }
    this.hooks.onWrite?.(rec)
    this.screen = {
      name: 'done',
      lines: ['✓ Sent', '', rec.summary, '', 'It’s handled — back to your day.'],
    }
    await this.render()
    // Auto-return home so the wearer never has to tidy up after an action.
    this.doneTimer = setTimeout(() => {
      this.doneTimer = null
      if (this.screen.name === 'done') {
        this.screen = { name: 'glance' }
        void this.render()
      }
    }, 4000)
  }
}
