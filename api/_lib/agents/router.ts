import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../sage/http';
import { errorMessage } from '../sage/config';
import { documentAiConfigured, pingDocumentAi } from '../ghost/documentAi';
import { llmEnrichConfigured, resolveParseModel } from '../ghost/enrichAcrylic';
import { parsePdf, resolveParseBackend } from '../ghost/parsePdf';
import { buildSkuCatalogEntries, buildWritePlan, MissingAcrylicDimsError } from '../ghost/orchestrator';
import { reapplyLandedCost } from '../ghost/landedCost';
import { clearSkuCatalog, upsertSkuCatalogEntries } from '../ghost/skuCatalog';
import { buildSalesOrderPlan, buildSalesOrderRecord } from '../ghost/salesOrder';
import { clearSalesOrderRecords, upsertSalesOrderRecord } from '../ghost/salesOrderStore';
import { customerIdFromName, propagateAcrylicDims } from '../ghost/mapToExtract';
import { computePnlSummary } from '../ghost/pnl';
import { fetchHubspotLeads, hubspotConfigured, pingHubspot } from '../hubspot/client';
import {
  createPurchaseOrder,
  createPurchaseReceive,
  createSalesInvoice,
  createSalesOrder,
  findMissingSkuIds,
  listInventoryItems,
  pingSageConnector,
  resetSageSession,
  sageConnectorConfigured,
  upsertCustomer,
  upsertVendor,
  verifySageReachable,
} from '../sageConnector/client';
import { getValidGmailAccessToken } from '../gmail/auth';
import { fetchLatestSynpathPricingPoPdfs, fetchLatestSynpathPricingSoPdf } from '../gmail/pricingEmailSource';
import { computeStepSchedule, todayIso } from '../outreach/scheduler';
import { sendSequenceStep } from '../outreach/sender';
import { listOutreachSequences, upsertOutreachSequence } from '../outreach/store';
import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  DocumentExtract,
  ImportCostMethod,
  InvoiceLineExtract,
  PurchaseWritePlan,
  SalesOrderPlan,
} from '../../../shared/ghost';
import type { EmailStep, OutreachLead, OutreachSequence } from '../../../shared/outreach';

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

async function saveToSkuCatalog(plan: PurchaseWritePlan): Promise<void> {
  try {
    await upsertSkuCatalogEntries(buildSkuCatalogEntries(plan));
  } catch (error) {
    console.warn('[sku-catalog] upsert failed', error instanceof Error ? error.message : error);
  }
}

async function saveToSalesOrderStore(plan: SalesOrderPlan): Promise<void> {
  try {
    const record = buildSalesOrderRecord(plan);
    if (record) await upsertSalesOrderRecord(record);
  } catch (error) {
    console.warn('[sales-order-store] upsert failed', error instanceof Error ? error.message : error);
  }
}

/** Shared by the upload-based and email-based Sales Order entry points. */
async function processSalesPdf(pdf: Buffer): Promise<{ ok: true; document: DocumentExtract; plan: SalesOrderPlan }> {
  // Sales PDFs often look like invoices; keep extracted customer/lines.
  const doc = await parsePdf(pdf, { hintRole: 'purchase_invoice' });
  const plan = await buildSalesOrderPlan(doc);
  await saveToSalesOrderStore(plan);
  return { ok: true, document: doc, plan };
}

function decodePdf(base64: unknown): Buffer {
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw new Error('PDF base64 is required');
  }
  const cleaned = base64.replace(/^data:application\/pdf;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

/** Shared by the upload-based and email-based Supply & Costing entry points. */
async function processSupplyPdfs(
  purchaseBuf: Buffer,
  freightBuf?: Buffer | null,
  dutyBuf?: Buffer | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const [purchase, freight, duty] = await Promise.all([
    parsePdf(purchaseBuf, { hintRole: 'purchase_invoice' }),
    freightBuf ? parsePdf(freightBuf, { hintRole: 'freight' }) : Promise.resolve(null),
    dutyBuf ? parsePdf(dutyBuf, { hintRole: 'duty' }) : Promise.resolve(null),
  ]);
  if (purchase.document_role === 'unknown') purchase.document_role = 'purchase_invoice';

  try {
    const plan = buildWritePlan(purchase, { freight, duty });
    await saveToSkuCatalog(plan);
    return { status: 200, body: { ok: true, purchase, freight, duty, plan } };
  } catch (error) {
    if (error instanceof MissingAcrylicDimsError) {
      return {
        status: 422,
        body: {
          ok: false,
          code: error.code,
          error: error.message,
          purchase,
          freight,
          duty,
          incompleteAcrylicLines: error.incomplete,
        },
      };
    }
    throw error;
  }
}

export async function handleAgentsRequest(req: VercelRequest, res: VercelResponse) {
  const path = pathSegments(req);
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'GET' && (path[0] === 'status' || path.length === 0)) {
    const [docAi, hubspot, sage] = await Promise.all([
      pingDocumentAi(),
      pingHubspot(),
      pingSageConnector(),
    ]);
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
          ? `OpenAI ready (${resolveParseModel()} / vision=${process.env.GHOST_PO_VISION_MODEL || 'gpt-4o'}) — ai_erp text|vision LLM`
          : 'Set OPENAI_API_KEY (required for default auto = text/vision LLM, same as ai_erp)',
      },
      parseBackend: {
        configured: resolveParseBackend(),
        detail:
          'auto = rich PDF text→text+LLM else PNG pages→vision LLM (ai_erp parse_pdf). documentai optional only.',
      },
      sage: { connected: sage.ok, detail: sage.detail },
      hubspot: {
        configured: hubspotConfigured(),
        connected: hubspot.ok,
        detail: hubspot.detail,
      },
    });
  }

  if (method === 'POST' && path[0] === 'supply' && path[1] === 'process') {
    try {
      const body = bodyOf(req);
      const result = await processSupplyPdfs(
        decodePdf(body.purchasePdfBase64),
        body.freightPdfBase64 ? decodePdf(body.freightPdfBase64) : null,
        body.dutyPdfBase64 ? decodePdf(body.dutyPdfBase64) : null,
      );
      return json(res, result.status, result.body);
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if ((method === 'GET' || method === 'POST') && path[0] === 'supply' && path[1] === 'from-email') {
    try {
      const auth = await getValidGmailAccessToken(req, res);
      if (!auth) return json(res, 401, { ok: false, error: 'Gmail is not connected' });

      const bundle = await fetchLatestSynpathPricingPoPdfs(auth.accessToken);
      const result = await processSupplyPdfs(
        bundle.purchase.content,
        bundle.freight?.content ?? null,
        bundle.duty?.content ?? null,
      );
      return json(res, result.status, {
        ...result.body,
        emailSource: {
          messageId: bundle.messageId,
          subject: bundle.subject,
          fileNames: {
            purchase: bundle.purchase.fileName,
            freight: bundle.freight?.fileName ?? null,
            duty: bundle.duty?.fileName ?? null,
          },
        },
      });
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
      await saveToSkuCatalog(plan);
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

    if (!sageConnectorConfigured()) {
      return json(res, 200, {
        ok: true,
        audit,
        message: 'CFO approved (preview only — SAGE_CONNECTOR_URL not set, nothing written to Sage)',
      });
    }
    if (body.confirmSageWrite !== true) {
      return json(res, 200, {
        ok: true,
        audit,
        message: 'CFO approved (preview only — pass confirmSageWrite:true to actually post to Sage)',
      });
    }

    try {
      const missingSkuIds = await findMissingSkuIds(plan.lines.map((l) => l.sku_id));
      if (missingSkuIds.length) {
        return json(res, 422, {
          ok: false,
          audit,
          error: `${missingSkuIds.length} SKU(s) don't exist in Sage yet — create them by hand or CSV import first: ${missingSkuIds.join(', ')}`,
          missingSkuIds,
        });
      }

      await upsertVendor(plan.vendor);
      const po = await createPurchaseOrder(plan);
      const poReference = po?.reference_number || plan.po_reference_number;

      const warnings: string[] = [];
      let receiveReference: string | null = null;
      try {
        const receive = await createPurchaseReceive(plan);
        receiveReference = receive?.reference_number || plan.receive_reference_number;
      } catch (error) {
        warnings.push(
          `Purchase Order ${poReference} was created, but Purchase Invoice / Receive failed: ${errorMessage(error)}. Retry the receive once fixed — the PO already exists in Sage.`,
        );
      }

      return json(res, 200, {
        ok: true,
        audit,
        message: 'Written to Sage 50',
        sageResult: { poReference, receiveReference, warnings },
      });
    } catch (error) {
      return json(res, 502, { ok: false, audit, error: `Sage connector write failed: ${errorMessage(error)}` });
    }
  }

  if (method === 'POST' && path[0] === 'sales' && path[1] === 'process') {
    try {
      const body = bodyOf(req);
      const result = await processSalesPdf(decodePdf(body.pdfBase64));
      return json(res, 200, result);
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if ((method === 'GET' || method === 'POST') && path[0] === 'sales' && path[1] === 'from-email') {
    try {
      const auth = await getValidGmailAccessToken(req, res);
      if (!auth) return json(res, 401, { ok: false, error: 'Gmail is not connected' });

      const found = await fetchLatestSynpathPricingSoPdf(auth.accessToken);
      const result = await processSalesPdf(found.content);
      return json(res, 200, {
        ...result,
        emailSource: { messageId: found.messageId, subject: found.subject, fileName: found.fileName },
      });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'sales' && path[1] === 'confirm') {
    const body = bodyOf(req);
    const plan = body.plan as SalesOrderPlan | undefined;
    if (!plan?.customer) {
      return json(res, 400, { ok: false, error: 'plan required' });
    }

    if (!sageConnectorConfigured()) {
      return json(res, 200, {
        ok: true,
        message: 'Confirmed (preview only — SAGE_CONNECTOR_URL not set, nothing written to Sage)',
      });
    }
    if (body.confirmSageWrite !== true) {
      return json(res, 200, {
        ok: true,
        message: 'Confirmed (preview only — pass confirmSageWrite:true to actually post to Sage)',
      });
    }
    if (!plan.invoice_number) {
      return json(res, 400, {
        ok: false,
        error: 'Sales Order plan is missing invoice_number — needed as a stable Sage reference number',
      });
    }

    try {
      const customerId = customerIdFromName(plan.customer);
      const soReferenceNumber = `SO-${plan.invoice_number}`;
      const invoiceReferenceNumber = plan.invoice_number;
      const acrylicSkuIds = plan.lines.filter((l) => l.line_kind === 'acrylic').map((l) => l.sku);
      const missingSkuIds = await findMissingSkuIds(acrylicSkuIds);
      if (missingSkuIds.length) {
        return json(res, 422, {
          ok: false,
          error: `${missingSkuIds.length} SKU(s) don't exist in Sage yet — create them by hand or CSV import first: ${missingSkuIds.join(', ')}`,
          missingSkuIds,
        });
      }

      await upsertCustomer(customerId, plan.customer);
      const order = await createSalesOrder(plan, customerId, soReferenceNumber);
      const soReference = order?.reference_number || soReferenceNumber;

      const warnings: string[] = [];
      let invoiceReference: string | null = null;
      try {
        const invoice = await createSalesInvoice(plan, customerId, invoiceReferenceNumber, soReference);
        invoiceReference = invoice?.reference_number || invoiceReferenceNumber;
      } catch (error) {
        warnings.push(
          `Sales Order ${soReference} was created, but the Sales Invoice failed: ${errorMessage(error)}. Retry once fixed — the order already exists in Sage.`,
        );
      }

      return json(res, 200, {
        ok: true,
        message: invoiceReference
          ? 'Sales Order + Invoice written to Sage 50 — revenue posted and inventory reduced.'
          : 'Sales Order written to Sage 50, but the Sales Invoice did not post — see warnings.',
        sageResult: { soReference, invoiceReference, warnings },
      });
    } catch (error) {
      return json(res, 502, { ok: false, error: `Sage connector write failed: ${errorMessage(error)}` });
    }
  }

  if (method === 'POST' && path[0] === 'sage' && path[1] === 'reconnect') {
    if (!sageConnectorConfigured()) {
      return json(res, 200, { ok: false, detail: 'SAGE_CONNECTOR_URL not set' });
    }
    try {
      await resetSageSession();
    } catch (error) {
      // /session/reset failing is still informative (e.g. the service itself is down) —
      // fall through to the reachability re-check rather than erroring out immediately.
      console.warn('[sage] session reset failed', errorMessage(error));
    }
    // /health only proves the web process is alive, not that Sage itself unstuck — verify
    // with a real Sage-backed call so this can't report "ok" while still hung.
    const verified = await verifySageReachable();
    return json(res, 200, { ok: verified.ok, detail: verified.detail });
  }

  if (method === 'GET' && path[0] === 'sage' && path[1] === 'inventory-items') {
    if (!sageConnectorConfigured()) {
      return json(res, 200, { ok: false, error: 'SAGE_CONNECTOR_URL not set' });
    }
    try {
      const items = await listInventoryItems();
      return json(res, 200, { ok: true, count: items.length, items });
    } catch (error) {
      return json(res, 502, { ok: false, error: `Sage connector read failed: ${errorMessage(error)}` });
    }
  }

  if (method === 'GET' && path[0] === 'outreach' && path[1] === 'leads') {
    try {
      const leads = await fetchHubspotLeads();
      return json(res, 200, { ok: true, leads });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'outreach' && path[1] === 'sequences') {
    try {
      const body = bodyOf(req);
      const lead = body.lead as OutreachLead | undefined;
      const steps = body.steps as EmailStep[] | undefined;
      const startDate = typeof body.startDate === 'string' ? body.startDate : '';
      if (!lead?.email) throw new Error('lead with email is required');
      if (!Array.isArray(steps) || steps.length < 1 || steps.length > 3) {
        throw new Error('1 to 3 email steps are required');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error('startDate (YYYY-MM-DD) is required');
      }
      const sequence: OutreachSequence = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lead,
        steps,
        startDate,
        stepState: computeStepSchedule(startDate, steps),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };
      await upsertOutreachSequence(sequence);

      // Step 0 due today (the normal case — startDate defaults to today)? Send it
      // right now instead of making the user wait for tomorrow's cron run.
      let finalSequence = sequence;
      if (sequence.stepState[0]!.scheduledFor <= todayIso()) {
        const result = await sendSequenceStep(sequence, 0);
        finalSequence = result.sequence;
      }

      return json(res, 200, { ok: true, sequence: finalSequence });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'GET' && path[0] === 'outreach' && path[1] === 'sequences') {
    try {
      const sequences = await listOutreachSequences();
      return json(res, 200, { ok: true, sequences });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'GET' && path[0] === 'intelligence' && path[1] === 'pnl') {
    try {
      const pnl = await computePnlSummary();
      return json(res, 200, { ok: true, pnl });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  if (method === 'POST' && path[0] === 'admin' && path[1] === 'reset-data') {
    try {
      const body = bodyOf(req);
      if (body.confirm !== true) {
        return json(res, 400, {
          ok: false,
          error: 'Pass { "confirm": true } to actually wipe the SKU catalog and Sales Order store.',
        });
      }
      await Promise.all([clearSkuCatalog(), clearSalesOrderRecords()]);
      return json(res, 200, { ok: true, cleared: ['sku-catalog', 'sales-orders'] });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  }

  return json(res, 404, { error: 'Unknown agents route', path });
}
