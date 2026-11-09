import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { R2StorageProvider } from "./r2-provider";

export interface StorageProvider {
  put(
    storageKey: string,
    buffer: Buffer,
    mimeType?: string
  ): Promise<{ storageKey: string; sizeBytes: number }>;
  get(storageKey: string): Promise<Buffer | null>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  getPresignedUploadUrl?(
    storageKey: string,
    mimeType: string,
    expiresInSeconds?: number
  ): Promise<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }>;
  getPresignedDownloadUrl?(
    storageKey: string,
    expiresInSeconds?: number,
    downloadFileName?: string
  ): Promise<string>;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes

export type SupportedMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface FileValidationResult {
  isValid: boolean;
  detectedType?: SupportedMimeType;
  extension?: "pdf" | "docx";
  error?: string;
}

/**
 * Validates file signature (magic bytes) to ensure file content matches claimed type.
 * Protects against MIME spoofing and invalid/empty files.
 */
export function validateFileSignature(
  buffer: Buffer,
  maxSizeBytes = MAX_FILE_SIZE_BYTES
): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: "File is empty (0 bytes)." };
  }

  if (buffer.length > maxSizeBytes) {
    const mbLimit = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds allowed limit of ${mbLimit} MB.`,
    };
  }

  // Check PDF signature: %PDF (hex 25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return {
      isValid: true,
      detectedType: "application/pdf",
      extension: "pdf",
    };
  }

  // Check DOCX / ZIP signature: PK\x03\x04 (hex 50 4B 03 04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return {
      isValid: true,
      detectedType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    };
  }

  return {
    isValid: false,
    error: "Invalid file signature. Only standard PDF and DOCX files are permitted.",
  };
}

/**
 * Sanitizes and generates a cryptographically secure random storage key.
 * Never uses client-supplied filenames for physical paths.
 */
export function generateStorageKey(extension: "pdf" | "docx", prefix?: string): string {
  const uniqueId = crypto.randomUUID();
  const sanitizedPrefix = prefix ? prefix.replace(/[^a-zA-Z0-9_-]/g, "") : undefined;
  return sanitizedPrefix ? `${sanitizedPrefix}/${uniqueId}.${extension}` : `${uniqueId}.${extension}`;
}

/**
 * Local filesystem storage provider for private development/testing storage.
 * Files are isolated outside the public web root.
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(process.cwd(), "storage", "resumes");
  }

  private resolvePath(storageKey: string): string {
    // Multi-tenant path traversal defense
    const normalizedKey = storageKey.replace(/\\/g, "/");
    if (
      normalizedKey.includes("..") ||
      normalizedKey.startsWith("/") ||
      path.isAbsolute(storageKey)
    ) {
      throw new Error("Invalid storage key: path traversal detected.");
    }
    const resolved = path.resolve(this.baseDir, normalizedKey);
    const resolvedBase = path.resolve(this.baseDir);
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      throw new Error("Invalid storage key: path traversal detected.");
    }
    return resolved;
  }

  async put(storageKey: string, buffer: Buffer): Promise<{ storageKey: string; sizeBytes: number }> {
    // In production, reject unencrypted local storage unless explicitly approved via env
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true"
    ) {
      throw new Error(
        "Secure cloud object storage provider (e.g. S3/GCS) must be configured for production deployments."
      );
    }

    const filePath = this.resolvePath(storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return {
      storageKey,
      sizeBytes: buffer.length,
    };
  }

  async get(storageKey: string): Promise<Buffer | null> {
    try {
      const filePath = this.resolvePath(storageKey);
      return await fs.readFile(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const filePath = this.resolvePath(storageKey);
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolvePath(storageKey);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    _expiresInSeconds = 900
  ): Promise<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }> {
    return {
      uploadUrl: `/api/storage/local-upload?key=${encodeURIComponent(storageKey)}`,
      storageKey,
      headers: {
        "Content-Type": mimeType,
      },
    };
  }

  async getPresignedDownloadUrl(
    storageKey: string,
    _expiresInSeconds = 600,
    downloadFileName?: string
  ): Promise<string> {
    return `/api/documents/${encodeURIComponent(storageKey)}/download`;
  }
}

// Global storage singleton
let globalStorageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!globalStorageInstance) {
    const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
    if (driver === "r2" || driver === "s3") {
      globalStorageInstance = new R2StorageProvider();
    } else {
      globalStorageInstance = new LocalStorageProvider();
    }
  }
  return globalStorageInstance;
}

export function setStorageProvider(provider: StorageProvider | null): void {
  globalStorageInstance = provider;
}

export { R2StorageProvider };

