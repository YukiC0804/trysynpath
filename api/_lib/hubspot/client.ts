/**
 * HubSpot lead lookup via a Private App access token (static Bearer token,
 * no OAuth flow — see HUBSPOT_ACCESS_TOKEN). Scopes required:
 * crm.objects.contacts.read, crm.objects.companies.read.
 */
import type { OutreachLead } from '../../../shared/outreach';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export function hubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN?.trim());
}

async function hubspotFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');
  const resp = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`HubSpot API failed HTTP ${resp.status}: ${detail.slice(0, 400)}`);
  }
  return (await resp.json()) as T;
}

interface HubspotContactResult {
  id: string;
  properties: {
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    company?: string | null;
  };
  associations?: { companies?: { results?: Array<{ id: string }> } };
}

interface HubspotContactsPage {
  results: HubspotContactResult[];
}

interface HubspotCompanyBatch {
  results: Array<{ id: string; properties: { name?: string | null } }>;
}

/** Fetch contacts + their associated company name (falls back to the contact's own "company" text field). */
export async function fetchHubspotLeads(limit = 50): Promise<OutreachLead[]> {
  const page = await hubspotFetch<HubspotContactsPage>(
    `/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,company&associations=companies`,
  );
  const results = page.results ?? [];

  const companyIds = [
    ...new Set(
      results.flatMap((c) => c.associations?.companies?.results?.map((r) => r.id) ?? []),
    ),
  ];

  const companyNames = new Map<string, string>();
  if (companyIds.length) {
    const batch = await hubspotFetch<HubspotCompanyBatch>('/crm/v3/objects/companies/batch/read', {
      method: 'POST',
      body: JSON.stringify({ properties: ['name'], inputs: companyIds.map((id) => ({ id })) }),
    });
    for (const c of batch.results ?? []) {
      if (c.properties?.name) companyNames.set(c.id, c.properties.name);
    }
  }

  return results
    .filter((c) => c.properties.email)
    .map((c) => {
      const companyId = c.associations?.companies?.results?.[0]?.id;
      const company = (companyId && companyNames.get(companyId)) || c.properties.company || '';
      const name =
        [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ').trim() ||
        c.properties.email!;
      return { id: c.id, name, email: c.properties.email!, company };
    });
}

export async function pingHubspot(): Promise<{ ok: boolean; detail: string }> {
  if (!hubspotConfigured()) return { ok: false, detail: 'HUBSPOT_ACCESS_TOKEN not set' };
  try {
    await hubspotFetch('/crm/v3/objects/contacts?limit=1');
    return { ok: true, detail: 'HubSpot connected (Private App token)' };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
