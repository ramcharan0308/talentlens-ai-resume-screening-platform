import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { requireAuth } from "@/lib/auth-guard";
import {
  getStorageProvider,
  validateFileSignature,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/storage";
import { UserRole } from "@prisma/client";

/**
 * Local Direct-to-Storage upload endpoint.
 * Mirrors the direct-to-R2 upload flow in local and test environments,
 * ensuring binary data never passes through serverless multipart body parsers.
 */
export async function PUT(req: NextRequest) {
  try {
    const authResult = await requireAuth(req, [UserRole.RECRUITER]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const key = req.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json(
        { success: false, error: "Missing required 'key' parameter." },
        { status: 400 }
      );
    }

    // Multi-tenant path traversal defense
    const normalizedKey = key.replace(/\\/g, "/");
    if (
      normalizedKey.includes("..") ||
      normalizedKey.startsWith("/") ||
      path.isAbsolute(key)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid storage key: path traversal detected." },
        { status: 400 }
      );
    }

    const segments = normalizedKey.split("/");
    if (segments.length > 2) {
      return NextResponse.json(
        { success: false, error: "Invalid storage key format." },
        { status: 400 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "Upload payload is empty (0 bytes)." },
        { status: 400 }
      );
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Payload size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 10 MB limit.`,
        },
        { status: 413 }
      );
    }

    const validation = validateFileSignature(buffer, MAX_FILE_SIZE_BYTES);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid file signature." },
        { status: 400 }
      );
    }

    const storage = getStorageProvider();
    await storage.put(normalizedKey, buffer, validation.detectedType);

    return NextResponse.json({
      success: true,
      storageKey: normalizedKey,
      sizeBytes: buffer.length,
      detectedType: validation.detectedType,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error during direct upload." },
      { status: 500 }
    );
  }
}

