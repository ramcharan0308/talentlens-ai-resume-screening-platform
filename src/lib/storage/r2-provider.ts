import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { StorageProvider } from "./index";

export interface R2Config {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string;
  region?: string;
}

/**
 * Cloudflare R2 / S3-compatible Object Storage Provider.
 * Stores candidate resumes securely in private buckets and generates
 * short-lived presigned upload and download URLs.
 */
export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config?: Partial<R2Config>) {
    const accountId = config?.accountId || process.env.R2_ACCOUNT_ID;
    const accessKeyId = config?.accessKeyId || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
    const bucket = config?.bucketName || process.env.R2_BUCKET_NAME || "talentlens-resumes";
    const endpoint =
      config?.endpoint ||
      process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const region = config?.region || process.env.R2_REGION || "auto";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 Storage configuration error: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be provided."
      );
    }
    if (!endpoint) {
      throw new Error(
        "R2 Storage configuration error: Either R2_ENDPOINT or R2_ACCOUNT_ID must be provided."
      );
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async put(
    storageKey: string,
    buffer: Buffer,
    mimeType = "application/octet-stream"
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    return {
      storageKey,
      sizeBytes: buffer.length,
    };
  }

  async get(storageKey: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        })
      );

      if (!response.Body) {
        return null;
      }

      // Handle stream in Node.js runtime
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    } catch (err: any) {
      if (
        err.name === "NoSuchKey" ||
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        })
      );
    } catch (err: any) {
      if (
        err.name === "NoSuchKey" ||
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return; // Idempotent deletion
      }
      throw err;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        })
      );
      return true;
    } catch (err: any) {
      if (
        err.name === "NotFound" ||
        err.name === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw err;
    }
  }

  async getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

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
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ResponseContentDisposition: downloadFileName
        ? `attachment; filename="${downloadFileName.replace(/"/g, "")}"`
        : undefined,
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}

