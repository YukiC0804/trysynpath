import { getValidGmailAccessTokenForCron } from '../gmail/auth';
import { sendGmailEmail } from '../gmail/client';
import { renderTemplate } from './scheduler';
import { upsertOutreachSequence } from './store';
import type { OutreachSequence } from '../../../shared/outreach';

export interface SendStepResult {
  ok: boolean;
  sequence: OutreachSequence;
  error?: string;
}

/**
 * Sends one step of a sequence right now via Gmail, persists the updated
 * sentAt/status (or the error) either way, and returns the updated sequence.
 * Shared by the cron poller (due steps) and the create-sequence endpoint
 * (send the initial email immediately instead of waiting for the next run).
 */
export async function sendSequenceStep(
  sequence: OutreachSequence,
  stepIndex: number,
): Promise<SendStepResult> {
  try {
    const auth = await getValidGmailAccessTokenForCron();
    if (!auth) throw new Error('Gmail is not connected (no session in KV)');

    const step = sequence.steps[stepIndex];
    if (!step) throw new Error(`sequence has no step at index ${stepIndex}`);

    const sent = await sendGmailEmail(auth.accessToken, {
      to: sequence.lead.email,
      subject: renderTemplate(step.subject, sequence.lead),
      body: renderTemplate(step.body, sequence.lead),
      from: auth.session.emailAddress,
    });

    const stepState = sequence.stepState.map((s, i) =>
      i === stepIndex
        ? { ...s, sentAt: new Date().toISOString(), gmailMessageId: sent.id, error: null }
        : s,
    );
    const isLastStep = stepIndex === sequence.steps.length - 1;
    const updated: OutreachSequence = {
      ...sequence,
      stepState,
      status: isLastStep ? 'completed' : 'in_progress',
    };
    await upsertOutreachSequence(updated);
    return { ok: true, sequence: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stepState = sequence.stepState.map((s, i) => (i === stepIndex ? { ...s, error: message } : s));
    const updated: OutreachSequence = { ...sequence, stepState };
    await upsertOutreachSequence(updated).catch(() => undefined);
    return { ok: false, sequence: updated, error: message };
  }
}
