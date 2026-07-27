import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSequenceStep } from '../api/_lib/outreach/sender';
import { writeGmailSessionKv, __resetMemoryGmailStore } from '../api/_lib/gmail/store';
import { __resetMemoryOutreachStore, getOutreachSequence } from '../api/_lib/outreach/store';
import { computeStepSchedule } from '../api/_lib/outreach/scheduler';
import type { EmailStep, OutreachSequence } from '../shared/outreach';

process.env.GMAIL_SESSION_MEMORY_STORE = '1';
process.env.OUTREACH_MEMORY_STORE = '1';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'outreach-sender-test-key';
process.env.VITEST = 'true';

const steps: EmailStep[] = [
  { subject: 'Hi {{name}}', body: 'Hello {{name}} from {{company}}', delayDays: 0 },
  { subject: 'Following up', body: 'Just checking in', delayDays: 3 },
];

function sequence(partial: Partial<OutreachSequence> = {}): OutreachSequence {
  return {
    id: 'seq-1',
    lead: { id: '1', name: 'Cesar Orozco', email: 'cesar@cnledge.com', company: 'CN Ledge' },
    steps,
    startDate: '2026-01-01',
    stepState: computeStepSchedule('2026-01-01', steps),
    status: 'scheduled',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

async function seedGmailSession() {
  await writeGmailSessionKv({
    tokens: { accessToken: 'access-tok', refreshToken: 'refresh-tok', expiresAt: Date.now() + 3600_000 },
    emailAddress: 'sales@ghostacrylics.com',
    connectedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('sendSequenceStep', () => {
  beforeEach(() => {
    __resetMemoryGmailStore();
    __resetMemoryOutreachStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends via Gmail with rendered variables, marks step sent, advances status', async () => {
    await seedGmailSession();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/messages/send');
      const body = JSON.parse(String(init?.body)) as { raw: string };
      const decoded = Buffer.from(body.raw, 'base64url').toString('utf8');
      expect(decoded).toContain('Subject: Hi Cesar Orozco');
      expect(decoded).toContain('Hello Cesar Orozco from CN Ledge');
      return { ok: true, json: async () => ({ id: 'msg-1', threadId: 'thread-1' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendSequenceStep(sequence(), 0);

    expect(result.ok).toBe(true);
    expect(result.sequence.stepState[0]!.sentAt).not.toBeNull();
    expect(result.sequence.stepState[0]!.gmailMessageId).toBe('msg-1');
    expect(result.sequence.status).toBe('in_progress'); // step 2 still pending

    const persisted = await getOutreachSequence('seq-1');
    expect(persisted?.stepState[0]!.sentAt).not.toBeNull();
  });

  it('marks the sequence completed after the last step sends', async () => {
    await seedGmailSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ id: 'msg-2', threadId: 't' }) }) as Promise<Response>),
    );

    const result = await sendSequenceStep(sequence(), 1);
    expect(result.sequence.status).toBe('completed');
  });

  it('records the error on the step and does not throw when Gmail is not connected', async () => {
    // No Gmail session seeded.
    const result = await sendSequenceStep(sequence(), 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Gmail is not connected/);
    expect(result.sequence.stepState[0]!.error).toMatch(/Gmail is not connected/);
    expect(result.sequence.stepState[0]!.sentAt).toBeNull();
  });
});
