declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFParseOptions {
    pagerender?: (pageData: unknown) => string | Promise<string>;
    max?: number;
    version?: string;
  }

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  }

  function PDF(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFParseResult>;
  export = PDF;
}

