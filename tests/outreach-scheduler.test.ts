import { describe, expect, it } from 'vitest';
import { computeStepSchedule, findDueSteps, renderTemplate } from '../api/_lib/outreach/scheduler';
import type { EmailStep, OutreachLead, OutreachSequence } from '../shared/outreach';

const lead: OutreachLead = { id: '1', name: 'Cesar Orozco', email: 'cesar@cnledge.com', company: 'CN Ledge' };

const steps: EmailStep[] = [
  { subject: 'Hi {{name}}', body: 'Hello {{name}} from {{company}}', delayDays: 0 },
  { subject: 'Following up', body: 'Just checking in, {{name}}', delayDays: 3 },
  { subject: 'Last note', body: 'Final follow-up for {{company}}', delayDays: 5 },
];

function sequence(partial: Partial<OutreachSequence> = {}): OutreachSequence {
  return {
    id: 'seq-1',
    lead,
    steps,
    startDate: '2026-01-01',
    stepState: computeStepSchedule('2026-01-01', steps),
    status: 'scheduled',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('renderTemplate', () => {
  it('substitutes {{name}} and {{company}} case-insensitively', () => {
    expect(renderTemplate('Hi {{Name}} at {{ COMPANY }}', lead)).toBe('Hi Cesar Orozco at CN Ledge');
  });

  it('substitutes {{first_name}}/{{last_name}} as the first/last word of the name', () => {
    expect(renderTemplate('Hi {{first_name}}, this is for {{last_name}}', lead)).toBe(
      'Hi Cesar, this is for Orozco',
    );
  });

  it('first_name and last_name are the same single word for a one-word name', () => {
    const soloLead: OutreachLead = { ...lead, name: 'Madonna' };
    expect(renderTemplate('{{first_name}}/{{last_name}}', soloLead)).toBe('Madonna/Madonna');
  });

  it('first_name/last_name use the outer words of a multi-word name', () => {
    const longNameLead: OutreachLead = { ...lead, name: 'Mary Jane Watson' };
    expect(renderTemplate('{{first_name}}/{{last_name}}', longNameLead)).toBe('Mary/Watson');
  });
});

describe('computeStepSchedule', () => {
  it('step 0 fires on startDate; later steps stack delayDays sequentially', () => {
    const state = computeStepSchedule('2026-01-01', steps);
    expect(state.map((s) => s.scheduledFor)).toEqual(['2026-01-01', '2026-01-04', '2026-01-09']);
    expect(state.every((s) => s.sentAt === null)).toBe(true);
  });
});

describe('findDueSteps', () => {
  it('returns the earliest unsent step once its date has arrived', () => {
    const seq = sequence();
    expect(findDueSteps([seq], '2026-01-01')).toEqual([{ sequence: seq, stepIndex: 0 }]);
    expect(findDueSteps([seq], '2025-12-31')).toEqual([]);
  });

  it('does not jump ahead to a later step while an earlier one is still unsent', () => {
    const seq = sequence();
    // Even far in the future, step 0 (never sent) is still what's "due" — not step 2.
    expect(findDueSteps([seq], '2027-01-01')).toEqual([{ sequence: seq, stepIndex: 0 }]);
  });

  it('advances to the next step once the previous one is marked sent', () => {
    const seq = sequence();
    seq.stepState[0]!.sentAt = '2026-01-01T09:00:00.000Z';
    expect(findDueSteps([seq], '2026-01-04')).toEqual([{ sequence: seq, stepIndex: 1 }]);
    expect(findDueSteps([seq], '2026-01-02')).toEqual([]);
  });

  it('skips completed and cancelled sequences', () => {
    const completed = sequence({ id: 'seq-done', status: 'completed' });
    const cancelled = sequence({ id: 'seq-cancelled', status: 'cancelled' });
    expect(findDueSteps([completed, cancelled], '2027-01-01')).toEqual([]);
  });
});
