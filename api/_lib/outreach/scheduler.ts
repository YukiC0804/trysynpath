import type { EmailStep, OutreachLead, OutreachSequence, SequenceStepState } from '../../../shared/outreach';

/** {{name}} / {{company}} — case-insensitive, tolerant of stray whitespace inside the braces. */
export function renderTemplate(text: string, lead: OutreachLead): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name)
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Step 0 fires on startDate; each later step fires delayDays after the previous one's date. */
export function computeStepSchedule(startDate: string, steps: EmailStep[]): SequenceStepState[] {
  const state: SequenceStepState[] = [];
  let current = startDate;
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) current = addDays(current, steps[i]!.delayDays);
    state.push({ scheduledFor: current, sentAt: null });
  }
  return state;
}

export interface DueStep {
  sequence: OutreachSequence;
  stepIndex: number;
}

/**
 * The earliest un-sent step per sequence, only if its scheduled date has
 * arrived — enforces sequential sends (a follow-up never jumps ahead of an
 * earlier step that hasn't gone out yet, e.g. after a prior send error).
 */
export function findDueSteps(sequences: OutreachSequence[], today: string): DueStep[] {
  const due: DueStep[] = [];
  for (const sequence of sequences) {
    if (sequence.status === 'completed' || sequence.status === 'cancelled') continue;
    const stepIndex = sequence.stepState.findIndex((s) => !s.sentAt);
    if (stepIndex === -1) continue;
    if (sequence.stepState[stepIndex]!.scheduledFor <= today) {
      due.push({ sequence, stepIndex });
    }
  }
  return due;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
