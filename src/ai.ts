// ---------------------------------------------------------------------------
// The AI layer.
//
// Every generative feature of Brief sits behind the AssistantAI interface:
// meeting briefs, "running late" notes, follow-up drafts, and answers to the
// wearer's questions. The hackathon build ships LocalAssistantAI, which
// composes those texts deterministically from the structured meeting data —
// so the demo is repeatable, works offline, and makes zero network calls.
//
// PRODUCTION DROP-IN: implement AssistantAI with an LLM call (the track is
// "AI Assistants & Work" — Claude / ChatGPT / Gemini are the listed apps).
// The prompts are already shaped by these method signatures: pass the
// Meeting object as context, get back one short, glasses-ready string.
// Keep outputs glanceable: the G2 shows ~46 characters per line, and every
// method here is written to that budget.
// ---------------------------------------------------------------------------

import type { Meeting } from './types'
import { fmtTime } from './types'

export interface AssistantAI {
  /** Two pages of brief text for a meeting (each ≤ 8 short lines). */
  briefPages(meeting: Meeting): Promise<string[]>
  /** A polite "running late" note, ready to send in one tap. */
  lateNote(meeting: Meeting, userFirstName: string): Promise<string>
  /** Suggested questions the wearer can ask about this meeting. */
  questions(meeting: Meeting): Promise<string[]>
  /** A one-to-three-line answer to a suggested question. */
  answer(meeting: Meeting, questionIndex: number): Promise<string>
}

const ATTENDEE_LINE = (m: Meeting): string => {
  const others = m.attendees.filter((a) => !a.self)
  if (others.length === 0) return 'Just you'
  const names = others.slice(0, 2).map((a) => a.name)
  const extra = others.length - 2
  return extra > 0 ? `${names.join(' · ')} · +${extra}` : names.join(' · ')
}

export class LocalAssistantAI implements AssistantAI {
  async briefPages(meeting: Meeting): Promise<string[]> {
    // No blank lines: at the G2's text size the body fits ~8 lines, and
    // every line has to earn its place.
    const page1 = [
      `${meeting.title}`,
      `${fmtTime(meeting.startMin)}–${fmtTime(meeting.endMin)}${meeting.location ? ` · ${meeting.location}` : ''}`,
      `Why: ${meeting.why}`,
      `Points:`,
      ...meeting.points.slice(0, 3).map((p) => `• ${p}`),
    ].join('\n')

    const page2 = [
      `With: ${ATTENDEE_LINE(meeting)}`,
      meeting.threadSummary,
      meeting.openItems.length
        ? `Open: ${meeting.openItems.join(' · ')}`
        : `Open: nothing carried over`,
      `Needs from you: ${meeting.needsFromYou}`,
    ].join('\n')

    return [page1, page2]
  }

  async lateNote(meeting: Meeting, userFirstName: string): Promise<string> {
    const firstTopic = meeting.points[0]?.toLowerCase() ?? 'the first item'
    return (
      `Hi all — running 5 min behind. Please start with ${firstTopic}; ` +
      `I’ll join right after. — ${userFirstName}`
    )
  }

  async questions(meeting: Meeting): Promise<string[]> {
    return [
      'What changed since last time?',
      'What do they need from me?',
      'Any risk I should raise?',
    ]
  }

  async answer(meeting: Meeting, questionIndex: number): Promise<string> {
    switch (questionIndex) {
      case 0:
        return meeting.changed
      case 1:
        return meeting.needsFromYou
      default:
        return meeting.risk
    }
  }
}
