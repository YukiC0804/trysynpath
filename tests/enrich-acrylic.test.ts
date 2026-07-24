import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  needsAcrylicEnrichment,
  stripJsonFence,
  enrichAcrylicAttrsWithLlm,
} from '../api/_lib/ghost/enrichAcrylic';
import type { DocumentExtract } from '../shared/ghost';

function doc(partial: Partial<DocumentExtract> = {}): DocumentExtract {
  return {
    document_role: 'purchase_invoice',
    includes_ddp: false,
    lines: [],
    notes: null,
    ...partial,
  };
}

describe('acrylic LLM enrich (ai_erp parity)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('needs enrichment when acrylic rows lack thickness/size', () => {
    expect(
      needsAcrylicEnrichment(
        doc({
          lines: [
            {
              raw_description: 'Acrylic Sheet',
              is_acrylic: true,
              is_packing_or_misc: false,
              quantity: 10,
              unit_price: 12,
              amount: 120,
              line_kind: 'acrylic',
              thickness_mm: null,
              size: null,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('does not need enrichment when dims present', () => {
    expect(
      needsAcrylicEnrichment(
        doc({
          lines: [
            {
              raw_description: 'Acrylic 3mm 18x24',
              is_acrylic: true,
              is_packing_or_misc: false,
              quantity: 10,
              unit_price: 12,
              amount: 120,
              line_kind: 'acrylic',
              thickness_mm: 3,
              size: '18x24',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('strips markdown fences like ai_erp _strip_json_fence', () => {
    expect(stripJsonFence('```json\n{"lines":[]}\n```')).toBe('{"lines":[]}');
  });

  it('merges LLM attrs but keeps Document AI money fields', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  lines: [
                    {
                      is_acrylic: true,
                      is_packing_or_misc: false,
                      line_kind: 'acrylic',
                      product_code: 'ACR',
                      color_code: 'CLR',
                      color_name: 'Clear',
                      thickness_mm: 3,
                      size: '18x24',
                      quantity: 999,
                      unit_price: 1,
                      amount: 1,
                      raw_description: 'rewritten',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const input = doc({
      lines: [
        {
          raw_description: 'Acrylic Sheet\nclear,GK-000\n(cut to 18" x 24")',
          is_acrylic: true,
          is_packing_or_misc: false,
          quantity: 10,
          unit_price: 12.5,
          amount: 125,
          line_kind: 'acrylic',
          thickness_mm: null,
          size: null,
        },
      ],
    });

    const out = await enrichAcrylicAttrsWithLlm(input, {
      rawText: 'Acrylic Sheet clear GK-000 cut to 18" x 24" 3mm',
    });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]!.thickness_mm).toBe(3);
    expect(out.lines[0]!.size).toBe('18x24');
    expect(out.lines[0]!.quantity).toBe(10);
    expect(out.lines[0]!.amount).toBe(125);
    expect(out.lines[0]!.unit_price).toBe(12.5);
    expect(out.lines[0]!.raw_description).toContain('Acrylic Sheet');
    expect(out.notes).toMatch(/acrylic attrs via LLM/);
  });
});
