/**
 * Extract plain text from a PDF buffer for demo document parsing.
 * Uses pdf-parse v2 (PDFParse / PDF.js) which works in Node/Vercel serverless.
 */
export async function extractPdfText(content: Buffer): Promise<string> {
  if (!content?.length) return '';
  try {
    const mod = (await import('pdf-parse')) as unknown as {
      PDFParse: new (options: {
        data: Uint8Array;
        verbosity?: number;
      }) => {
        getText: () => Promise<{ text?: string }>;
        destroy?: () => Promise<void>;
      };
      VerbosityLevel?: { ERRORS?: number };
    };
    // Copy into a plain Uint8Array — some runtimes reject Buffer subclasses.
    const data = Uint8Array.from(content);
    const parser = new mod.PDFParse({
      data,
      verbosity: mod.VerbosityLevel?.ERRORS ?? 0,
    });
    try {
      const result = await parser.getText();
      return String(result?.text ?? '')
        .replace(/\u0000/g, ' ')
        .trim();
    } finally {
      await parser.destroy?.().catch(() => undefined);
    }
  } catch (error) {
    console.warn(
      '[pdfText] extract failed',
      error instanceof Error ? error.message : error,
    );
    return '';
  }
}
