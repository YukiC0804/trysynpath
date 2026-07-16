import { describe, expect, it } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { setCookie } from '../api/_lib/sage/http';

function mockResponse() {
  const headers = new Map<string, string | string[]>();
  return {
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name: string, value: string | string[]) {
      headers.set(name.toLowerCase(), value);
    },
    headers,
  } as unknown as VercelResponse & { headers: Map<string, string | string[]> };
}

describe('setCookie', () => {
  it('replaces prior Set-Cookie values for the same name instead of appending', () => {
    const res = mockResponse();
    setCookie(res, 'synpath_workflow_run_0', 'chunk-a');
    setCookie(res, 'synpath_workflow_run_0', 'chunk-b');
    setCookie(res, 'synpath_workflow_run_chunks', '1');
    setCookie(res, 'synpath_workflow_run_chunks', '2');

    const cookies = res.getHeader('Set-Cookie');
    expect(Array.isArray(cookies)).toBe(true);
    const list = (cookies as string[]).map(String);
    expect(list).toHaveLength(2);
    expect(list.filter((c) => c.startsWith('synpath_workflow_run_0='))).toHaveLength(1);
    expect(list.filter((c) => c.startsWith('synpath_workflow_run_chunks='))).toHaveLength(1);
    expect(list.some((c) => c.includes('chunk-b'))).toBe(true);
    expect(list.some((c) => c.includes('chunk-a'))).toBe(false);
  });
});
