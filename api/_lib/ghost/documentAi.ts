import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

export interface DocAiLineItem {
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  amount: number | null;
  product_code: string;
  purchase_order: string;
}

export interface InvoiceData {
  invoice_id: string;
  invoice_type: string;
  purchase_order: string;
  invoice_date: string;
  due_date: string;
  delivery_date: string;
  currency: string;
  currency_exchange_rate: number | null;
  net_amount: number | null;
  total_amount: number | null;
  total_tax_amount: number | null;
  freight_amount: number | null;
  amount_paid_since_last_invoice: number | null;
  supplier_name: string;
  supplier_address: string;
  supplier_email: string;
  supplier_phone: string;
  supplier_website: string;
  supplier_tax_id: string;
  supplier_iban: string;
  supplier_registration: string;
  supplier_payment_ref: string;
  receiver_name: string;
  receiver_address: string;
  receiver_email: string;
  receiver_phone: string;
  receiver_website: string;
  receiver_tax_id: string;
  ship_to_name: string;
  ship_to_address: string;
  ship_from_name: string;
  ship_from_address: string;
  remit_to_name: string;
  remit_to_address: string;
  carrier: string;
  payment_terms: string;
  line_items: DocAiLineItem[];
  raw_text: string;
}

type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
};

function getCredentials(): ServiceAccountJson | undefined {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64) {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as ServiceAccountJson;
  }
  return undefined;
}

export function documentAiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

export function documentAiSettings() {
  return {
    projectId:
      process.env.GCLOUD_DOCUMENT_AI_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      '642075982640',
    location: process.env.GCLOUD_DOCUMENT_AI_LOCATION || 'eu',
    processorId: process.env.GCLOUD_DOCUMENT_AI_PROCESSOR_ID || undefined,
    processorDisplayName:
      process.env.GCLOUD_DOCUMENT_AI_PROCESSOR_NAME || 'invoice_parser_1',
  };
}

function buildClient(location: string) {
  const credentials = getCredentials();
  return new DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
    ...(credentials
      ? {
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
          },
          projectId: credentials.project_id || documentAiSettings().projectId,
        }
      : {}),
  });
}

function safeFloat(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '').replace(/ /g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractEntityValue(
  entity: {
    normalizedValue?: { text?: string | null } | null;
    mentionText?: string | null;
    textAnchor?: {
      content?: string | null;
      textSegments?: Array<{ startIndex?: number | string | null; endIndex?: number | string | null }>;
    } | null;
  },
  fullText: string,
): string {
  if (entity.normalizedValue?.text) return entity.normalizedValue.text;
  if (entity.mentionText) return entity.mentionText;
  const anchor = entity.textAnchor;
  if (anchor?.content) return anchor.content;
  if (anchor?.textSegments?.length) {
    return anchor.textSegments
      .map((seg) => fullText.slice(Number(seg.startIndex ?? 0), Number(seg.endIndex ?? 0)))
      .join('');
  }
  return '';
}

const LINE_ITEM_CHILD_MAP: Record<string, keyof DocAiLineItem> = {
  'line_item/description': 'description',
  'line_item/quantity': 'quantity',
  'line_item/unit': 'unit',
  'line_item/unit_price': 'unit_price',
  'line_item/amount': 'amount',
  'line_item/product_code': 'product_code',
  'line_item/purchase_order': 'purchase_order',
};

const MONEY_FIELDS = new Set([
  'net_amount',
  'total_amount',
  'total_tax_amount',
  'freight_amount',
  'amount_paid_since_last_invoice',
  'currency_exchange_rate',
]);

const HEADER_FIELDS = new Set([
  'invoice_id',
  'invoice_type',
  'purchase_order',
  'invoice_date',
  'due_date',
  'delivery_date',
  'currency',
  'currency_exchange_rate',
  'net_amount',
  'total_amount',
  'total_tax_amount',
  'freight_amount',
  'amount_paid_since_last_invoice',
  'supplier_name',
  'supplier_address',
  'supplier_email',
  'supplier_phone',
  'supplier_website',
  'supplier_tax_id',
  'supplier_iban',
  'supplier_registration',
  'supplier_payment_ref',
  'receiver_name',
  'receiver_address',
  'receiver_email',
  'receiver_phone',
  'receiver_website',
  'receiver_tax_id',
  'ship_to_name',
  'ship_to_address',
  'ship_from_name',
  'ship_from_address',
  'remit_to_name',
  'remit_to_address',
  'carrier',
  'payment_terms',
]);

function emptyInvoice(): InvoiceData {
  return {
    invoice_id: '',
    invoice_type: '',
    purchase_order: '',
    invoice_date: '',
    due_date: '',
    delivery_date: '',
    currency: '',
    currency_exchange_rate: null,
    net_amount: null,
    total_amount: null,
    total_tax_amount: null,
    freight_amount: null,
    amount_paid_since_last_invoice: null,
    supplier_name: '',
    supplier_address: '',
    supplier_email: '',
    supplier_phone: '',
    supplier_website: '',
    supplier_tax_id: '',
    supplier_iban: '',
    supplier_registration: '',
    supplier_payment_ref: '',
    receiver_name: '',
    receiver_address: '',
    receiver_email: '',
    receiver_phone: '',
    receiver_website: '',
    receiver_tax_id: '',
    ship_to_name: '',
    ship_to_address: '',
    ship_from_name: '',
    ship_from_address: '',
    remit_to_name: '',
    remit_to_address: '',
    carrier: '',
    payment_terms: '',
    line_items: [],
    raw_text: '',
  };
}

function documentToInvoice(document: {
  text?: string | null;
  entities?: Array<{
    type?: string | null;
    properties?: Array<{
      type?: string | null;
      normalizedValue?: { text?: string | null } | null;
      mentionText?: string | null;
      textAnchor?: {
        content?: string | null;
        textSegments?: Array<{ startIndex?: number | string | null; endIndex?: number | string | null }>;
      } | null;
    }>;
    normalizedValue?: { text?: string | null } | null;
    mentionText?: string | null;
    textAnchor?: {
      content?: string | null;
      textSegments?: Array<{ startIndex?: number | string | null; endIndex?: number | string | null }>;
    } | null;
  }>;
}): InvoiceData {
  const invoice = emptyInvoice();
  const fullText = document.text ?? '';
  invoice.raw_text = fullText;

  for (const entity of document.entities ?? []) {
    const type = entity.type ?? '';
    if (type === 'line_item') {
      const item: DocAiLineItem = {
        description: '',
        quantity: null,
        unit: '',
        unit_price: null,
        amount: null,
        product_code: '',
        purchase_order: '',
      };
      for (const prop of entity.properties ?? []) {
        const field = LINE_ITEM_CHILD_MAP[prop.type ?? ''];
        if (!field) continue;
        const value = extractEntityValue(prop, fullText);
        if (field === 'quantity' || field === 'unit_price' || field === 'amount') {
          item[field] = safeFloat(value);
        } else {
          item[field] = value;
        }
      }
      invoice.line_items.push(item);
      continue;
    }
    if (type === 'vat') continue;
    if (!HEADER_FIELDS.has(type)) continue;
    const value = extractEntityValue(entity, fullText);
    if (!value) continue;
    const invoiceRecord = invoice as unknown as Record<string, unknown>;
    const current = invoiceRecord[type];
    if (current) continue;
    if (MONEY_FIELDS.has(type)) {
      invoiceRecord[type] = safeFloat(value);
    } else {
      invoiceRecord[type] = value;
    }
  }
  return invoice;
}

export async function parseInvoiceBytes(
  content: Buffer,
  mimeType = 'application/pdf',
): Promise<InvoiceData> {
  const settings = documentAiSettings();
  const client = buildClient(settings.location);
  const processorId = settings.processorId;
  if (!processorId && !settings.processorDisplayName) {
    throw new Error('Provide GCLOUD_DOCUMENT_AI_PROCESSOR_ID or PROCESSOR_NAME');
  }
  let resolvedId = processorId;
  if (!resolvedId) {
    const parent = `projects/${settings.projectId}/locations/${settings.location}`;
    const [processors] = await client.listProcessors({ parent });
    const match = processors.find((p) => p.displayName === settings.processorDisplayName);
    if (!match?.name) {
      throw new Error(
        `No processor with display_name=${settings.processorDisplayName} in ${settings.projectId}/${settings.location}`,
      );
    }
    resolvedId = match.name.split('/').pop();
  }
  const name = `projects/${settings.projectId}/locations/${settings.location}/processors/${resolvedId}`;
  const [result] = await client.processDocument({
    name,
    rawDocument: { content, mimeType },
  });
  if (!result.document) throw new Error('Document AI returned empty document');
  return documentToInvoice(result.document as Parameters<typeof documentToInvoice>[0]);
}

export async function pingDocumentAi(): Promise<{ ok: boolean; detail: string }> {
  if (!documentAiConfigured()) {
    return { ok: false, detail: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64' };
  }
  try {
    const settings = documentAiSettings();
    const client = buildClient(settings.location);
    const processorId = settings.processorId;
    // Prefer getProcessor when ID is known — does not require processors.list.
    if (processorId) {
      const name = `projects/${settings.projectId}/locations/${settings.location}/processors/${processorId}`;
      await client.getProcessor({ name });
      return {
        ok: true,
        detail: `${settings.projectId}/${settings.location}/${processorId}`,
      };
    }
    const parent = `projects/${settings.projectId}/locations/${settings.location}`;
    await client.listProcessors({ parent, pageSize: 1 });
    return {
      ok: true,
      detail: `${settings.projectId}/${settings.location}/${settings.processorDisplayName}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = message.includes('PERMISSION_DENIED')
      ? ' — grant the Vercel SA roles/documentai.apiUser (and preferably roles/documentai.viewer) on GCP project synpath / 642075982640'
      : '';
    return {
      ok: false,
      detail: `${message}${hint}`,
    };
  }
}
