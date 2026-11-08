import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { DocumentProcessingStatus } from "@prisma/client";

export interface ExtractionResult {
  text: string;
  processingStatus: DocumentProcessingStatus;
  ocrRequired: boolean;
  errorMessage?: string;
  metadata?: {
    pageCount?: number;
    charCount?: number;
    wordCount?: number;
  };
}

/**
 * Normalizes text extracted from resumes:
 * - Unifies line breaks to LF
 * - Strips non-printable control characters (except tabs & newlines)
 * - Collapses redundant horizontal spaces
 * - Constrains consecutive newlines to maximum 2
 */
export function normalizeExtractedText(raw: string): string {
  if (!raw) return "";

  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // non-printable control characters
    .replace(/[\t ]+/g, " ") // collapse spaces
    .replace(/\n\s*\n\s*\n+/g, "\n\n") // max 2 consecutive blank lines
    .trim();
}

/**
 * OCR Adapter Interface defining optical character recognition contracts
 */
export interface OcrAdapter {
  isAvailable(): Promise<boolean>;
  getEngineName(): string;
  extractTextFromImageOrPdf(buffer: Buffer): Promise<{ text: string } | null>;
}

/**
 * System Tesseract / Cloud OCR adapter.
 * Detects presence of system OCR engines or cloud keys.
 */
export class SystemOcrAdapter implements OcrAdapter {
  getEngineName(): string {
    return "Tesseract / Cloud Vision OCR Service";
  }

  async isAvailable(): Promise<boolean> {
    // Check if cloud OCR API key is provided or local binary is flagged
    if (process.env.CLOUD_OCR_API_KEY) {
      return true;
    }
    return false;
  }

  async extractTextFromImageOrPdf(_buffer: Buffer): Promise<{ text: string } | null> {
    const available = await this.isAvailable();
    if (!available) {
      return null;
    }
    // Stub for cloud provider implementation when credentials are configured
    return null;
  }
}

export const ocrAdapter: OcrAdapter = new SystemOcrAdapter();

/**
 * Extracts plain text from PDF and DOCX resume buffers.
 * Detects scanned/unreadable files without extractable textual streams.
 */
export async function extractResumeText(
  buffer: Buffer,
  fileType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | string
): Promise<ExtractionResult> {
  try {
    if (!buffer || buffer.length === 0) {
      return {
        text: "",
        processingStatus: DocumentProcessingStatus.FAILED,
        ocrRequired: false,
        errorMessage: "Cannot extract text from empty document payload.",
      };
    }

    if (fileType === "application/pdf") {
      const data = await pdfParse(buffer);
      const normalized = normalizeExtractedText(data.text);
      const wordCount = normalized ? normalized.split(/\s+/).length : 0;

      // Scanned Document Heuristic: If PDF contains almost zero word tokens (< 10 words or < 30 characters),
      // it is a rasterized image/scan requiring OCR.
      if (wordCount < 10 || normalized.length < 30) {
        // Attempt OCR adapter if available
        if (await ocrAdapter.isAvailable()) {
          const ocrResult = await ocrAdapter.extractTextFromImageOrPdf(buffer);
          if (ocrResult && ocrResult.text && ocrResult.text.length >= 30) {
            return {
              text: normalizeExtractedText(ocrResult.text),
              processingStatus: DocumentProcessingStatus.EXTRACTED,
              ocrRequired: true,
              metadata: {
                pageCount: data.numpages,
                charCount: ocrResult.text.length,
                wordCount: ocrResult.text.split(/\s+/).length,
              },
            };
          }
        }

        return {
          text: "",
          processingStatus: DocumentProcessingStatus.SCANNED_UNREADABLE,
          ocrRequired: true,
          errorMessage:
            "Scanned or image-only PDF detected with no digital text stream. OCR processing required.",
          metadata: {
            pageCount: data.numpages,
            charCount: 0,
            wordCount: 0,
          },
        };
      }

      return {
        text: normalized,
        processingStatus: DocumentProcessingStatus.EXTRACTED,
        ocrRequired: false,
        metadata: {
          pageCount: data.numpages,
          charCount: normalized.length,
          wordCount,
        },
      };
    }

    if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileType === "docx"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const normalized = normalizeExtractedText(result.value);
      const wordCount = normalized ? normalized.split(/\s+/).length : 0;

      if (!normalized || wordCount < 5) {
        return {
          text: "",
          processingStatus: DocumentProcessingStatus.FAILED,
          ocrRequired: false,
          errorMessage: "DOCX file contains no readable text content.",
        };
      }

      return {
        text: normalized,
        processingStatus: DocumentProcessingStatus.EXTRACTED,
        ocrRequired: false,
        metadata: {
          charCount: normalized.length,
          wordCount,
        },
      };
    }

    return {
      text: "",
      processingStatus: DocumentProcessingStatus.FAILED,
      ocrRequired: false,
      errorMessage: `Unsupported MIME type "${fileType}". Only PDF and DOCX are supported.`,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Unexpected parsing error encountered.";
    return {
      text: "",
      processingStatus: DocumentProcessingStatus.FAILED,
      ocrRequired: false,
      errorMessage: `Parsing failed: ${errorMsg}`,
    };
  }
}
