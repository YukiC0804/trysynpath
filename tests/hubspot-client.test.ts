import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHubspotLeads, hubspotConfigured, pingHubspot } from '../api/_lib/hubspot/client';

describe('HubSpot client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HUBSPOT_ACCESS_TOKEN;
  });

  it('hubspotConfigured reflects HUBSPOT_ACCESS_TOKEN presence', () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    expect(hubspotConfigured()).toBe(false);
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
    expect(hubspotConfigured()).toBe(true);
  });

  it('fetchHubspotLeads resolves company name via the associated Company batch lookup', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/crm/v3/objects/contacts')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: '1',
                properties: { firstname: 'Cesar', lastname: 'Orozco', email: 'cesar@cnledge.com' },
                associations: { companies: { results: [{ id: 'co-1' }] } },
              },
              {
                id: '2',
                properties: { firstname: 'No', lastname: 'Assoc', email: 'no@assoc.com', company: 'Free Text Co' },
              },
              {
                id: '3',
                properties: { firstname: '', lastname: '', email: null },
              },
            ],
          }),
        } as Response;
      }
      if (url.includes('/crm/v3/objects/companies/batch/read')) {
        const body = JSON.parse(String(init?.body)) as { inputs: Array<{ id: string }> };
        expect(body.inputs).toEqual([{ id: 'co-1' }]);
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'co-1', properties: { name: 'CN Ledge' } }] }),
        } as Response;
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const leads = await fetchHubspotLeads();

    // Contact #3 has no email — filtered out.
    expect(leads).toHaveLength(2);
    expect(leads[0]).toEqual({ id: '1', name: 'Cesar Orozco', email: 'cesar@cnledge.com', company: 'CN Ledge' });
    expect(leads[1]).toEqual({
      id: '2',
      name: 'No Assoc',
      email: 'no@assoc.com',
      company: 'Free Text Co',
    });
  });

  it('pingHubspot reports not-configured without throwing', async () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    const result = await pingHubspot();
    expect(result).toEqual({ ok: false, detail: 'HUBSPOT_ACCESS_TOKEN not set' });
  });
});
