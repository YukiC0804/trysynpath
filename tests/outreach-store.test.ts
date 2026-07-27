import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetMemoryOutreachStore,
  getOutreachSequence,
  listOutreachSequences,
  upsertOutreachSequence,
} from '../api/_lib/outreach/store';
import { computeStepSchedule } from '../api/_lib/outreach/scheduler';
import type { EmailStep, OutreachSequence } from '../shared/outreach';

process.env.OUTREACH_MEMORY_STORE = '1';
process.env.VITEST = 'true';

const steps: EmailStep[] = [{ subject: 'Hi', body: 'Hello', delayDays: 0 }];

function sequence(partial: Partial<OutreachSequence> = {}): OutreachSequence {
  return {
    id: 'seq-1',
    lead: { id: '1', name: 'A', email: 'a@b.com', company: 'B' },
    steps,
    startDate: '2026-01-01',
    stepState: computeStepSchedule('2026-01-01', steps),
    status: 'scheduled',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('Outreach sequence store', () => {
  beforeEach(() => {
    __resetMemoryOutreachStore();
  });

  it('upserts and reads back by id', async () => {
    await upsertOutreachSequence(sequence());
    const found = await getOutreachSequence('seq-1');
    expect(found?.lead.name).toBe('A');
  });

  it('overwrites on re-upsert of the same id', async () => {
    await upsertOutreachSequence(sequence({ status: 'scheduled' }));
    await upsertOutreachSequence(sequence({ status: 'completed' }));
    expect((await getOutreachSequence('seq-1'))?.status).toBe('completed');
  });

  it('lists all sequences', async () => {
    await upsertOutreachSequence(sequence({ id: 'a' }));
    await upsertOutreachSequence(sequence({ id: 'b' }));
    const all = await listOutreachSequences();
    expect(all.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });
});
