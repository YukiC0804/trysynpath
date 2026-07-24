import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../sage/http';
import { errorMessage } from '../sage/config';
import { documentAiConfigured, pingDocumentAi } from '../ghost/documentAi';
import { llmEnrichConfigured, resolveParseModel } from '../ghost/enrichAcrylic';
import { parseWithDocumentAi } from '../ghost/mapToExtract';
import { buildWritePlan, MissingAcrylicDimsError } from '../ghost/orchestrator';
import { reapplyLandedCost } from '../ghost/landedCost';
import { buildSalesOrderPlan } from '../ghost/salesOrder';
import { propagateAcrylicDims } from '../ghost/mapToExtract';
import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  DocumentExtract,
  ImportCostMethod,
  InvoiceLineExtract,
} from '../../../shared/ghost';

function pathSegments(req: VercelRequest): string[] {
  const raw = req.query.__agentsPath ?? req.query.__integrationPath;
  if (Array.isArray(raw)) return raw.flatMap((v) => String(v).split('/')).filter(Boolean);
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  const marker = '/api/agents/';
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length).split('/').filter(Boolean) : [];
}

function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body ?? {}) as Record<string, unknown>;
}

function decodePdf(base64: unknown): Buffer {
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw new Error('PDF base64 is required');
  }
  const cleaned = base64.replace(/^data:application\/pdf;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

export async function handleAgentsRequest(req: VercelRequest, res: VercelResponse) {
  const path = pathSegments(req);
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'GET' && (path[0] === 'status' || path.length === 0)) {
    const docAi = await pingDocumentAi();
    return json(res, 200, {
      documentAi: {
        configured: documentAiConfigured(),
        connected: docAi.ok,
        detail: docAi.detail,
      },
      acrylicLlmEnrich: {
        configured: llmEnrichConfigured(),
        model: resolveParseModel(),
        detail: llmEnrichConfigured()
          ? `OpenAI enrich ready (${resolveParseModel()}) — same step as ai_erp enrich_acrylic_attrs_with_llm`
          : 'Set OPENAI_API_KEY on Vercel (ai_erp used this to fill thickness_mm/size after Document AI)',
      },
      sage: { connected: false, detail: 'Sage write disabled — preview only' },
    });
  }

  if (method === 'POST' && path[0] === 'supply' && path[1] === 'process') {
    try {
      const body = bodyOf(req);
      const purchase = await parseWithDocumentAi(
        decodePdf(body.purchasePdfBase64),
        'purchase_invoice',
      );
      if (purchase.document_role === 'unknown') purchase.document_role = 'purchase_invoice';

      const freight = body.freightPdfBase64
        ? await parseWithDocumentAi(decodePdf(body.freightPdfBase64), 'freight')
        : null;
      const duty = body.dutyPdfBase64
        ? await parseWithDocumentAi(decodePdf(body.dutyPdfBase64), 'duty')
        : null;

      try {
        const plan = buildWritePlan(purchase, { freight, duty });
        return json(res, 200, {
          ok: true,
          purchase,
          freight,
          duty,
          plan,
        });
      } catch (error) {
        if (error instanceof MissingAcrylicDimsError) {
          return json(res, 422, {
            ok: false,
            code: error.code,
            error: error.message,
            purchase,
            freight,
            duty,
            incompleteAcrylicLines: error.incomplete,
          });
        }
        throw error;
      }
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'supply' && path[1] === 'allocate') {
    try {
      const body = bodyOf(req);
      let purchase = body.purchase as DocumentExtract;
      if (!purchase?.lines) throw new Error('purchase extract required');
      const linePatches = body.linePatches as
        | Array<{ index: number; thickness_mm?: number; size?: string; quantity?: number }>
        | undefined;
      if (Array.isArray(linePatches)) {
        const lines = purchase.lines.map((ln, i) => {
          const patch = linePatches.find((p) => p.index === i);
          if (!patch) return ln;
          return {
            ...ln,
            thickness_mm: patch.thickness_mm ?? ln.thickness_mm,
            size: patch.size ?? ln.size,
            quantity: patch.quantity ?? ln.quantity,
            is_acrylic: true,
            line_kind: 'acrylic' as const,
          } satisfies InvoiceLineExtract;
        });
        purchase = propagateAcrylicDims({ ...purchase, lines });
      }
      const freight = (body.freight as DocumentExtract | null) ?? null;
      const duty = (body.duty as DocumentExtract | null) ?? null;
      const plan = buildWritePlan(purchase, { freight, duty });
      return json(res, 200, { ok: true, purchase, freight, duty, plan });
    } catch (error) {
      if (error instanceof MissingAcrylicDimsError) {
        return json(res, 422, {
          ok: false,
          code: error.code,
          error: error.message,
          incompleteAcrylicLines: error.incomplete,
        });
      }
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'supply' && path[1] === 'recalculate') {
    try {
      const body = bodyOf(req);
      const lines = body.lines as AcrylicSkuLine[];
      if (!Array.isArray(lines)) throw new Error('lines array required');
      const result = reapplyLandedCost(lines, {
        importPool: Number(body.importPool ?? 0),
        method: (body.method as ImportCostMethod) || 'freight_and_duty',
        freightAmount: body.freightAmount != null ? Number(body.freightAmount) : null,
        dutyAmount: body.dutyAmount != null ? Number(body.dutyAmount) : null,
        invoiceTotal: body.invoiceTotal != null ? Number(body.invoiceTotal) : null,
        ddpAmount: body.ddpAmount != null ? Number(body.ddpAmount) : null,
      });
      return json(res, 200, { ok: true, ...result });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'supply' && path[1] === 'approve') {
    const body = bodyOf(req);
    const plan = body.plan as CfoAuditRecord['proposedSagePayload'] | undefined;
    if (!plan?.invoice_number) {
      return json(res, 400, { ok: false, error: 'plan required' });
    }
    const audit: CfoAuditRecord = {
      user: typeof body.user === 'string' ? body.user : 'demo-cfo',
      at: new Date().toISOString(),
      invoiceNumber: plan.invoice_number,
      method: plan.landed.method,
      pool: plan.landed.import_pool,
      lineSkus: plan.lines.map((l) => l.sku_id),
      proposedSagePayload: plan,
      status: 'approved',
    };
    return json(res, 200, {
      ok: true,
      audit,
      message: 'CFO approved (preview only — nothing written to Sage)',
    });
  }

  if (method === 'POST' && path[0] === 'sales' && path[1] === 'process') {
    try {
      const body = bodyOf(req);
      const doc = await parseWithDocumentAi(decodePdf(body.pdfBase64), 'purchase_invoice');
      // Sales PDFs often look like invoices; keep extracted customer/lines.
      const recentKeys = Array.isArray(body.recentKeys)
        ? body.recentKeys.map(String)
        : [];
      const plan = buildSalesOrderPlan(doc, { recentKeys });
      return json(res, 200, { ok: true, document: doc, plan });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  return json(res, 404, { error: 'Unknown agents route', path });
}
