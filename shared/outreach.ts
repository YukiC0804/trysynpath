/** Outreach: HubSpot leads → up to 3 scheduled emails (initial + follow-ups). */

export interface OutreachLead {
  /** HubSpot contact id. */
  id: string;
  name: string;
  email: string;
  company: string;
}

export interface EmailStep {
  /** May contain {{name}} / {{company}} placeholders. */
  subject: string;
  body: string;
  /** Days after the previous step fires (0 for the first/initial step). */
  delayDays: number;
}

export type SequenceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface SequenceStepState {
  /** ISO date this step is due to send. */
  scheduledFor: string;
  /** ISO timestamp once actually sent, null while pending. */
  sentAt: string | null;
  gmailMessageId?: string | null;
  error?: string | null;
}

export interface OutreachSequence {
  id: string;
  lead: OutreachLead;
  /** 1–3 steps: the initial email plus up to two follow-ups. */
  steps: EmailStep[];
  /** ISO date the first step should send. */
  startDate: string;
  stepState: SequenceStepState[];
  status: SequenceStatus;
  createdAt: string;
}
