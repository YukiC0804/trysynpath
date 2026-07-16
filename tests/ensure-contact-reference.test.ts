import { afterEach, describe, expect, it, vi } from 'vitest';
import { SageGateway } from '../api/_lib/workflow/sageGateway';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SageGateway contact uniqueness', () => {
  it('builds unique name-based references instead of fixed SYN-DEMO-*', () => {
    const gateway = new SageGateway('token', 'biz');
    expect(gateway.demoContactReference('VENDOR', 'Shanghai UGolden Industry Co., Ltd.')).toBe(
      'SYN-V-SHANGHAI-UGOLDEN-I',
    );
    expect(gateway.demoContactReference('CUSTOMER', 'Spandex')).toBe('SYN-C-SPANDEX');
    expect(gateway.demoContactReference('CUSTOMER', 'Spandex')).not.toBe('SYN-DEMO-CUSTOMER');
  });

  it('reuses a contact that already owns the demo reference', async () => {
    const gateway = new SageGateway('token', 'biz');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/contacts') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            $items: [
              {
                id: 'existing-1',
                name: 'Legacy Spandex Alias',
                reference: 'SYN-C-SPANDEX',
                contact_types: [{ id: 'CUSTOMER' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const contact = await gateway.ensureContact('CUSTOMER', 'Spandex Corp');
    expect(contact.id).toBe('existing-1');
    expect(contact.reference).toBe('SYN-C-SPANDEX');
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(
      false,
    );
  });

  it('matches UGolden / Spandex by significant name tokens', () => {
    const gateway = new SageGateway('token', 'biz');
    const found = gateway.findContact(
      [
        {
          id: 'v1',
          name: 'Shanghai UGolden Industry Co., Ltd.',
          reference: 'UG',
          typeIds: ['VENDOR'],
        },
      ],
      'VENDOR',
      'Shanghai UGolden Industry Co., Ltd.',
    );
    expect(found?.id).toBe('v1');
  });
});
