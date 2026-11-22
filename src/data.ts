// ---------------------------------------------------------------------------
// Data providers.
//
// Brief reads a calendar + recent mail threads, and writes back: chat/email
// messages to attendees and calendar changes. The hackathon build ships with
// DemoWorkspaceProvider — a deterministic simulated workday, so the whole
// demo runs in the simulator with no accounts, no keys, no network.
//
// PRODUCTION DROP-IN: implement WorkspaceProvider with
//   - Google Calendar API  (events.list / events.patch for reschedules)
//   - Gmail API            (threads.list/get for context, messages.send)
// and nothing in app.ts or ai.ts changes — the shapes below already mirror
// the Google payloads (attendees, start/end, thread summaries).
// ---------------------------------------------------------------------------

import type { FollowUpDraft, Meeting, WriteRecord } from './types'

export interface WorkspaceProvider {
  /** The wearer's first name, used to sign AI drafts. */
  userFirstName: string
  /** "Now" in minutes from midnight. The demo pins this so runs are repeatable. */
  now(): number
  listMeetings(): Promise<Meeting[]>
  getMeeting(id: string): Promise<Meeting | undefined>
  /** Follow-up draft the AI prepared after the most recent finished meeting. */
  pendingFollowUp(): Promise<FollowUpDraft | null>
  // --- write actions (the "write" half of read-and-write) -------------------
  sendLateNote(meeting: Meeting, text: string): Promise<WriteRecord>
  sendFollowUp(draft: FollowUpDraft): Promise<WriteRecord>
  moveMeeting(meeting: Meeting, deltaMin: number): Promise<WriteRecord>
  /** Every write performed this session, newest last. */
  outbox(): WriteRecord[]
}

// The demo day is pinned to 09:48 so the demo script is repeatable:
// the wearer has just finished "Budget sync" and the next meeting starts
// in 12 minutes.
const DEMO_NOW = 9 * 60 + 48

const MEETINGS: Meeting[] = [
  {
    id: 'roadmap',
    title: 'Q3 Roadmap Review',
    startMin: 10 * 60,
    endMin: 11 * 60,
    location: 'Meet · link ready',
    attendees: [
      { name: 'Ana Kovač', email: 'ana@acme.co', organiser: true },
      { name: 'Marco Diaz', email: 'marco@acme.co' },
      { name: 'June Park', email: 'june@acme.co' },
      { name: 'Felix Ade', email: 'felix@acme.co' },
      { name: 'You', email: 'you@acme.co', self: true },
    ],
    why: 'Ana moved the launch to Dec 12 and needs your scope sign-off today.',
    points: [
      'Defend the Nov 28 API freeze',
      'Hiring freeze: no new eng reqs',
      'Pricing page owner still open',
    ],
    openItems: ['Pricing page owner?', 'Beta cohort size: 200 or 500?'],
    threadSummary: 'Thread (6 msgs): Ana shared the new plan; Marco OK’d the freeze.',
    changed: 'Launch moved Nov 20 → Dec 12; beta cohort doubled to 500.',
    needsFromYou: 'A yes/no on cutting onboarding v2 from the launch scope.',
    risk: 'If scope isn’t cut, the Dec 12 date slips into the holidays.',
  },
  {
    id: 'design-crit',
    title: 'Design Crit — Onboarding',
    startMin: 11 * 60 + 30,
    endMin: 12 * 60 + 15,
    location: 'Studio B',
    attendees: [
      { name: 'Lena Park', email: 'lena@acme.co', organiser: true },
      { name: 'Tom Reyes', email: 'tom@acme.co' },
      { name: 'You', email: 'you@acme.co', self: true },
    ],
    why: 'Lena is presenting the 3-step onboarding flow for final approval.',
    points: [
      'Step 2 drop-off is the worry',
      'You asked for a skip option',
      'Ship target: next sprint',
    ],
    openItems: ['Skip option: in or out?'],
    threadSummary: 'Thread (3 msgs): Lena attached v4 mockups last night.',
    changed: 'Flow cut from 5 steps to 3 since the last crit.',
    needsFromYou: 'Approve the flow, or send it back for one more round.',
    risk: 'Another round pushes onboarding past the Dec 12 launch.',
  },
  {
    id: 'one-on-one',
    title: '1:1 with Priya Nair',
    startMin: 13 * 60,
    endMin: 13 * 60 + 30,
    location: 'Meet · link ready',
    attendees: [
      { name: 'Priya Nair', email: 'priya@acme.co' },
      { name: 'You', email: 'you@acme.co', self: true },
    ],
    why: 'Priya’s promotion packet is due Friday; she wants your feedback.',
    points: [
      'Praise the API migration lead',
      'Packet: 2 more impact bullets',
      'She asked about the staff role',
    ],
    openItems: ['Your written feedback (due Fri)'],
    threadSummary: 'Thread (2 msgs): Priya shared the packet draft on Monday.',
    changed: 'She picked up the API migration after the reorg.',
    needsFromYou: 'Honest read on staff readiness + feedback by Friday.',
    risk: 'Low — a supportive, prepared 1:1 lands better than a rushed one.',
  },
  {
    id: 'investor',
    title: 'Investor Update — Meridian',
    startMin: 15 * 60,
    endMin: 15 * 60 + 45,
    location: 'Meet · link ready',
    attendees: [
      { name: 'Sara Lindqvist', email: 'sara@meridian.vc', organiser: true },
      { name: 'David Chen', email: 'david@meridian.vc' },
      { name: 'Amara Osei', email: 'amara@meridian.vc' },
      { name: 'You', email: 'you@acme.co', self: true },
    ],
    why: 'Monthly update. Meridian will ask about burn and the Dec launch.',
    points: [
      'MRR +18% MoM — lead with it',
      'Runway: 14 months at plan',
      'Launch date moved to Dec 12',
    ],
    openItems: ['Send October metrics pack'],
    threadSummary: 'Thread (4 msgs): Sara asked for churn detail ahead of the call.',
    changed: 'Churn improved 2.1% → 1.7% since the last update.',
    needsFromYou: 'Confirm the Dec 12 date publicly for the first time.',
    risk: 'If Dec 12 slips again, expect a hard runway conversation.',
  },
  {
    id: 'focus',
    title: 'Focus block — launch plan doc',
    startMin: 16 * 60 + 30,
    endMin: 17 * 60 + 30,
    location: '',
    attendees: [{ name: 'You', email: 'you@acme.co', self: true }],
    why: 'Protected hour to write the launch plan while it’s fresh.',
    points: ['Draft scope section first', 'Reuse today’s decisions'],
    openItems: [],
    threadSummary: 'No thread — this is your own protected time.',
    changed: 'Nothing — you booked this after the roadmap review.',
    needsFromYou: 'Nothing. Brief will stay quiet during focus time.',
    risk: 'Meetings earlier today may try to expand into this hour.',
  },
]

const FOLLOW_UP: FollowUpDraft = {
  meetingId: 'budget-sync',
  meetingTitle: 'Budget sync (09:00)',
  to: 'finance@acme.co',
  subject: 'Budget sync — decisions & actions',
  body: 'Decisions: Q4 tooling budget approved at $18k; contractor spend paused. Actions: Marco to send revised forecast by Thu; I’ll confirm headcount numbers Friday.',
}

export class DemoWorkspaceProvider implements WorkspaceProvider {
  userFirstName = 'Rafi'
  private writes: WriteRecord[] = []
  private meetings = MEETINGS.map((m) => ({ ...m }))
  private followUp: FollowUpDraft | null = { ...FOLLOW_UP }

  now(): number {
    return DEMO_NOW
  }

  async listMeetings(): Promise<Meeting[]> {
    return this.meetings.filter((m) => m.endMin > this.now())
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    return this.meetings.find((m) => m.id === id)
  }

  async pendingFollowUp(): Promise<FollowUpDraft | null> {
    return this.followUp
  }

  async sendLateNote(meeting: Meeting, text: string): Promise<WriteRecord> {
    const rec: WriteRecord = {
      kind: 'message',
      summary: `Late note → ${meeting.title}`,
      detail: text,
      atMin: this.now(),
    }
    this.writes.push(rec)
    return rec
  }

  async sendFollowUp(draft: FollowUpDraft): Promise<WriteRecord> {
    const rec: WriteRecord = {
      kind: 'email',
      summary: `Follow-up email → ${draft.to}`,
      detail: `${draft.subject} — ${draft.body}`,
      atMin: this.now(),
    }
    this.writes.push(rec)
    this.followUp = null // sent — no longer pending
    return rec
  }

  async moveMeeting(meeting: Meeting, deltaMin: number): Promise<WriteRecord> {
    const target = this.meetings.find((m) => m.id === meeting.id)
    if (target) {
      target.startMin += deltaMin
      target.endMin += deltaMin
    }
    const rec: WriteRecord = {
      kind: 'calendar',
      summary: `${meeting.title} moved +${deltaMin} min`,
      detail: 'All attendees notified; invites updated.',
      atMin: this.now(),
    }
    this.writes.push(rec)
    return rec
  }

  outbox(): WriteRecord[] {
    return [...this.writes]
  }
}
