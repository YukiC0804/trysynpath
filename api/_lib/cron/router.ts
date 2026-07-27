import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../sage/http';
import { getValidGmailAccessTokenForCron } from '../gmail/auth';
import { sendGmailEmail } from '../gmail/client';
import { findDueSteps, renderTemplate, todayIso } from '../outreach/scheduler';
import { listOutreachSequences, upsertOutreachSequence } from '../outreach/store';

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
    try {
      const auth = await getValidGmailAccessTokenForCron();
      if (!auth) throw new Error('Gmail is not connected (no session in KV)');

      const step = sequence.steps[stepIndex]!;
      const sent = await sendGmailEmail(auth.accessToken, {
        to: sequence.lead.email,
        subject: renderTemplate(step.subject, sequence.lead),
        body: renderTemplate(step.body, sequence.lead),
        from: auth.session.emailAddress,
      });

      const stepState = sequence.stepState.map((s, i) =>
        i === stepIndex ? { ...s, sentAt: new Date().toISOString(), gmailMessageId: sent.id } : s,
      );
      const isLastStep = stepIndex === sequence.steps.length - 1;
      await upsertOutreachSequence({
        ...sequence,
        stepState,
        status: isLastStep ? 'completed' : 'in_progress',
      });
      results.push({ sequenceId: sequence.id, stepIndex, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stepState = sequence.stepState.map((s, i) => (i === stepIndex ? { ...s, error: message } : s));
      await upsertOutreachSequence({ ...sequence, stepState }).catch(() => undefined);
      results.push({ sequenceId: sequence.id, stepIndex, ok: false, error: message });
    }
  }

  return json(res, 200, { ok: true, date: today, dueCount: due.length, results });
}
