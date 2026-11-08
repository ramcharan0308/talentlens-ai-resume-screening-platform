import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Generates race-safe pseudonymous Candidate Reference (e.g. CND-XXXXX)
 */
export async function generateUniqueCandidateReference(): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    // Generate 5-digit number (e.g. 10000 - 99999)
    const randomNum = crypto.randomInt(10000, 99999);
    const candidateRef = `CND-${randomNum}`;

    const existing = await prisma.candidate.findUnique({
      where: { candidateReference: candidateRef },
      select: { id: true },
    });

    if (!existing) {
      return candidateRef;
    }
  }

  // Fallback to timestamp + random hex
  const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CND-${hex}`;
}

