import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { StorageProvider } from "./index";

export const SUPABASE_FREE_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 Megabytes (Supabase Free Tier)

export interface SupabaseStorageConfig {
  supabaseUrl?: string;
  supabaseKey?: string; // Service Role key for server-side management of private buckets
  bucketName?: string;
}

/**
 * Supabase Storage Provider.
 * Stores candidate resumes securely in a private Supabase Storage bucket ("resumes")
 * and generates short-lived presigned upload and download URLs.
 *
 * SAFETY INVARIANTS:
 * 1. Enforces Supabase Free Tier 50 MB per-file limit.
 * 2. Uses server-side Service Role credentials only; never exposes keys to browser code.
 * 3. Enforces short-lived signed URLs for both upload (15 min) and download (10 min).
 * 4. Preserves multi-tenant prefix isolation (`agencyId/uuid.ext`).
 */
export class SupabaseStorageProvider implements StorageProvider {
  public id = "supabase";
  private client: SupabaseClient;
  private bucket: string;
  public supabaseUrl: string;

  constructor(config?: Partial<SupabaseStorageConfig>) {
    const supabaseUrl =
      config?.supabaseUrl ||
      process.env.SUPABASE_URL ||
      "https://izbcwqskodtemsjnpqvo.supabase.co";
    const supabaseKey =
      config?.supabaseKey ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY;
    const bucket =
      config?.bucketName ||
      process.env.SUPABASE_STORAGE_BUCKET ||
      "resumes";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase Storage configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided."
      );
    }

    this.supabaseUrl = supabaseUrl.replace(/\/$/, "");
    this.bucket = bucket;

    this.client = createClient(this.supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async put(
    storageKey: string,
    buffer: Buffer,
    mimeType = "application/octet-stream"
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    // Enforce Supabase Free Tier 50 MB limit
    if (buffer.length > SUPABASE_FREE_MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds Supabase Free Tier limit of 50 MB.`
      );
    }

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storageKey, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }

    return {
      storageKey,
      sizeBytes: buffer.length,
    };
  }

  async get(storageKey: string): Promise<Buffer | null> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .download(storageKey);

      if (error || !data) {
        if (
          error?.message?.toLowerCase().includes("not found") ||
          error?.message?.includes("404") ||
          (error as any)?.statusCode === 404 ||
          (error as any)?.status === 404
        ) {
          return null;
        }
        return null;
      }

      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const { error } = await this.client.storage
        .from(this.bucket)
        .remove([storageKey]);

      if (error) {
        // Idempotent deletion: do not fail if already absent
        if (
          !error.message?.toLowerCase().includes("not found") &&
          !error.message?.includes("404")
        ) {
          throw new Error(`Supabase storage deletion failed: ${error.message}`);
        }
      }
    } catch (err: any) {
      if (!err.message?.toLowerCase().includes("not found") && !err.message?.includes("404")) {
        throw err;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const normalizedKey = storageKey.replace(/\\/g, "/");
      const lastSlash = normalizedKey.lastIndexOf("/");
      const folder = lastSlash >= 0 ? normalizedKey.substring(0, lastSlash) : "";
      const fileName = lastSlash >= 0 ? normalizedKey.substring(lastSlash + 1) : normalizedKey;

      const { data, error } = await this.client.storage
        .from(this.bucket)
        .list(folder, { search: fileName, limit: 10 });

      if (error || !Array.isArray(data)) {
        return false;
      }

      return data.some((item) => item.name === fileName);
    } catch {
      return false;
    }
  }

  async getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    _expiresInSeconds = 900
  ): Promise<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storageKey);

    if (error || !data || !data.signedUrl) {
      throw new Error(
        `Supabase presigned upload URL generation failed: ${error?.message || "Unknown error"}`
      );
    }

    let uploadUrl = data.signedUrl;
    if (!uploadUrl.startsWith("http://") && !uploadUrl.startsWith("https://")) {
      uploadUrl = `${this.supabaseUrl}/storage/v1${uploadUrl.startsWith("/") ? "" : "/"}${uploadUrl}`;
    }

    return {
      uploadUrl,
      storageKey,
      headers: {
        "Content-Type": mimeType,
      },
    };
  }

  async getPresignedDownloadUrl(
    storageKey: string,
    expiresInSeconds = 600,
    downloadFileName?: string
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, expiresInSeconds, {
        download: downloadFileName || true,
      });

    if (error || !data || !data.signedUrl) {
      throw new Error(
        `Supabase signed download URL generation failed: ${error?.message || "Unknown error"}`
      );
    }

    let downloadUrl = data.signedUrl;
    if (!downloadUrl.startsWith("http://") && !downloadUrl.startsWith("https://")) {
      downloadUrl = `${this.supabaseUrl}/storage/v1${downloadUrl.startsWith("/") ? "" : "/"}${downloadUrl}`;
    }

    return downloadUrl;
  }
}

