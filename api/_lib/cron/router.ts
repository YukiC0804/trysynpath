import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../sage/http';
import { findDueSteps, todayIso } from '../outreach/scheduler';
import { sendSequenceStep } from '../outreach/sender';
import { listOutreachSequences } from '../outreach/store';

/**
 * Vercel sets this header automatically on genuine scheduled invocations when
 * CRON_SECRET is configured. Without it this endpoint would be a public URL
 * anyone could hit to trigger real outbound sends, so reject unauthenticated
 * calls once a secret is set — but allow through (with a warning) if the
 * project hasn't set CRON_SECRET yet, so the endpoint isn't dead on arrival
 * before that's configured.
 */
function isAuthorizedCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

export async function handleCronRequest(req: VercelRequest, res: VercelResponse) {
  if (!process.env.CRON_SECRET) {
    console.warn('[cron] CRON_SECRET is not set — this endpoint is unauthenticated. Set it in Vercel env vars.');
  }
  if (!isAuthorizedCronRequest(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const today = todayIso();
  const sequences = await listOutreachSequences();
  const due = findDueSteps(sequences, today);

  const results: Array<{ sequenceId: string; stepIndex: number; ok: boolean; error?: string }> = [];

  for (const { sequence, stepIndex } of due) {
    const result = await sendSequenceStep(sequence, stepIndex);
    results.push({ sequenceId: sequence.id, stepIndex, ok: result.ok, error: result.error });
  }

  return json(res, 200, { ok: true, date: today, dueCount: due.length, results });
}
