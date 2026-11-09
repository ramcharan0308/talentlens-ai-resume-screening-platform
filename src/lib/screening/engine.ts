import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  CriterionInput,
  CriterionEvaluation,
  EvaluationResult,
  ScreeningProvider,
} from "./types";
import { redactResumePii } from "./redaction";
import { verifyQuotes } from "./verifier";
import {
  computeDeterministicScores,
  reconcileCriterionStatus,
  validateCriteriaWeights,
} from "./scorer";
import { getScreeningProvider } from "./provider";

export interface ScreenCandidateOptions {
  agencyId: string;
  requisitionId: string;
  candidateId: string;
  provider?: ScreeningProvider | string;
  actorId?: string;
  requireExplicitConsent?: boolean;
  forceRescreen?: boolean;
}

export class ScreeningError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = "ScreeningError";
  }
}

/**
 * Executes the complete AI Resume Screening & Evidence Engine pipeline:
 *
 * 1. Validates tenant access & cross-agency invariants (candidate agency must equal requisition agency).
 * 2. Validates document status: rejects SCANNED_UNREADABLE (requires OCR), FAILED, PENDING, or PARSING.
 * 3. Sanitizes PII & neutralizes prompt injection attempts, generating a bidirectional SourceMap.
 * 4. Invokes swappable LLM screening provider with sanitized text.
 * 5. Programmatically verifies all quoted evidence against original resume text using SourceMap.
 * 6. Disambiguates repeated identical phrases and rejects fabricated/altered quotes.
 * 7. Computes deterministic weighted score (0-100) and evidence coverage.
 * 8. Flags must-have gaps without auto-rejecting.
 * 9. Creates immutable scorecard snapshot & saves evaluation records.
 * 10. Enforces human recruiter safeguards (never auto-rejects, never auto-submits).
 */
export async function screenCandidate(
  options: ScreenCandidateOptions
): Promise<EvaluationResult & { evaluationId: string }> {
  const { agencyId, requisitionId, candidateId } = options;

  if (!agencyId || !requisitionId || !candidateId) {
    throw new ScreeningError("Missing required screening parameters.", 400);
  }

  // 1. Fetch Requisition within Agency Tenant Boundary
  const requisition = await prisma.requisition.findFirst({
    where: {
      id: requisitionId,
      organizationId: agencyId,
    },
    include: {
      scorecardCriteria: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!requisition) {
    throw new ScreeningError(
      "Requisition not found or access denied for this agency tenant.",
      404
    );
  }

  // 2. Validate Criteria & Weights
  if (!requisition.scorecardCriteria || requisition.scorecardCriteria.length === 0) {
    throw new ScreeningError(
      "Requisition has no scorecard criteria configured. Screening requires weighted criteria.",
      400
    );
  }

  const criteriaInputs: CriterionInput[] = requisition.scorecardCriteria.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    weight: c.weight,
    isMustHave: c.isMustHave,
    minScore: c.minScore,
    maxScore: c.maxScore,
    guidelines: c.guidelines,
  }));

  const weightValidation = validateCriteriaWeights(criteriaInputs);
  if (!weightValidation.isValid) {
    throw new ScreeningError(weightValidation.error!, 400);
  }

  // 3. Fetch Candidate within Agency Tenant Boundary
  const candidate = await prisma.candidate.findFirst({
    where: {
      id: candidateId,
      agencyId,
      purgeStatus: "ACTIVE",
    },
    include: {
      uploadedDocuments: {
        orderBy: { createdAt: "desc" },
      },
      applications: {
        where: { requisitionId },
      },
    },
  });

  if (!candidate) {
    throw new ScreeningError(
      "Candidate not found, inactive/purged, or access denied for this agency.",
      404
    );
  }

  // 4. Strict Cross-Tenant Invariant: Candidate agency must match Requisition agency
  if (candidate.agencyId !== requisition.organizationId || candidate.agencyId !== agencyId) {
    throw new ScreeningError(
      "Cross-tenant violation: Candidate and Requisition do not belong to the same agency tenant.",
      403
    );
  }

  // 4.1 Pending Deletion Check
  const openDeletionRequest = await prisma.candidateDeletionRequest.findFirst({
    where: {
      candidateId,
      status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] },
    },
  });
  if (openDeletionRequest) {
    throw new ScreeningError(
      "CANDIDATE_DELETION_PENDING: Candidate has a pending or in-progress deletion request. Screening is blocked.",
      403
    );
  }

  // 4.2 Consent Status Invariant (Withdrawal Blocks Screening)
  const consent = await prisma.consentRecord.findFirst({
    where: {
      candidateId,
      purpose: "RECRUITMENT_PROCESSING",
    },
    orderBy: { createdAt: "desc" },
  });
  if (options.requireExplicitConsent && (!consent || consent.status !== "ACTIVE")) {
    throw new ScreeningError(
      "CONSENT_REQUIRED: Candidate does not have recorded recruitment processing consent.",
      403
    );
  }
  if (consent && consent.status === "WITHDRAWN") {
    throw new ScreeningError(
      "CONSENT_WITHDRAWN: Candidate has withdrawn consent for recruitment processing. Further screening is prohibited.",
      403
    );
  }
  if (consent && consent.status === "PENDING_VERIFICATION") {
    throw new ScreeningError(
      "CONSENT_PENDING: Candidate consent is pending verification.",
      403
    );
  }

  // 5. Inspect Ingestion Status & Usable Resume Text
  const latestDoc = candidate.uploadedDocuments[0];
  if (!latestDoc) {
    throw new ScreeningError(
      "NO_RESUME_DOCUMENT: Candidate has no uploaded resume document.",
      400
    );
  }

  if (latestDoc.processingStatus === "SCANNED_UNREADABLE") {
    throw new ScreeningError(
      "UNREADABLE_RESUME_OCR_REQUIRED: The candidate's resume is scanned or image-based and requires OCR processing before AI screening can be performed.",
      422
    );
  }

  if (latestDoc.processingStatus === "FAILED") {
    throw new ScreeningError(
      "RESUME_EXTRACTION_FAILED: Document text extraction failed for this candidate's resume. Re-upload or re-extract the document before screening.",
      422
    );
  }

  if (
    (latestDoc.processingStatus === "PENDING" || latestDoc.processingStatus === "PARSING") &&
    (!latestDoc.extractedText || latestDoc.extractedText.trim().length === 0)
  ) {
    throw new ScreeningError(
      "RESUME_PROCESSING_IN_PROGRESS: Resume text extraction is currently in progress. Please wait until document parsing completes.",
      422
    );
  }

  if (!latestDoc.extractedText || latestDoc.extractedText.trim().length < 50) {
    throw new ScreeningError(
      "INSUFFICIENT_EXTRACTED_TEXT: Extracted resume text is insufficient or empty for screening.",
      422
    );
  }

  const originalResumeText = latestDoc.extractedText;
  const linkedApplication = candidate.applications[0];

  // 5.1 Evaluation Idempotency & Network Retry Guard:
  // If this candidate was already evaluated for this requisition and document,
  // and the scorecard criteria haven't changed, return the existing evaluation
  // to prevent duplicate database records on retried requests.
  if (!options.forceRescreen) {
    const existingEval = await prisma.evaluation.findFirst({
      where: {
        candidateId,
        requisitionId,
        documentId: latestDoc.id,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      include: {
        criterionScores: true,
        scorecardSnapshot: true,
      },
    });

    if (existingEval && existingEval.scorecardSnapshot) {
      const existingCriteria = existingEval.scorecardSnapshot.criteria as any[];
      const isSameCriteria =
        Array.isArray(existingCriteria) &&
        existingCriteria.length === criteriaInputs.length &&
        existingCriteria.every((ec) => {
          const matching = criteriaInputs.find(
            (ci) => ci.id === ec.id || ci.name === ec.name
          );
          return (
            matching &&
            matching.weight === ec.weight &&
            matching.isMustHave === ec.isMustHave
          );
        });

      if (isSameCriteria) {
        return {
          evaluationId: existingEval.id,
          overallScore: existingEval.overallScore || 0,
          evidenceCoverage: existingEval.evidenceCoverage || 0,
          supportedCount: existingEval.supportedCount,
          partialCount: existingEval.partialCount,
          insufficientCount: existingEval.insufficientCount,
          hasMustHaveWarnings: existingEval.hasMustHaveWarnings,
          mustHaveWarnings: (existingEval.mustHaveWarnings as string[]) || [],
          criterionScores: existingEval.criterionScores.map((cs) => ({
            criterionId: cs.criterionId || "",
            criterionName: cs.criterionName,
            weight: cs.weight,
            isMustHave: cs.isMustHave,
            score: cs.score,
            status: cs.status as any,
            explanation: cs.explanation,
            quotes: (cs.quotes as any) || [],
            missingGaps: (cs.missingGaps as string[]) || [],
          })),
          redactedContent: existingEval.redactedContent || "",
          provider: existingEval.provider,
          modelId: existingEval.modelId,
          promptVersion: existingEval.promptVersion,
        };
      }
    }
  }

  // 6. Redact PII & Neutralize Prompt Injections, building bidirectional SourceMap
  const redaction = redactResumePii(originalResumeText, {
    candidateFullName: candidate.fullName,
    candidateReference: candidate.candidateReference,
    candidateId: candidate.id,
  });
  const sanitizedResumeText = redaction.redactedText;
  const sourceMap = redaction.sourceMap;

  // 7. Resolve Screening Provider
  const provider: ScreeningProvider =
    typeof options.provider === "object" && options.provider !== null
      ? options.provider
      : getScreeningProvider(typeof options.provider === "string" ? options.provider : undefined);

  // 8. Invoke Provider with Sanitized Resume Text
  const providerResponse = await provider.evaluate({
    sanitizedResumeText,
    jobDescription: requisition.jobDescription,
    roleTitle: requisition.title,
    criteria: criteriaInputs,
  });

  // Map response to criteria inputs
  const rawOutputMap = new Map(
    providerResponse.criteria.map((c) => [c.criterionName.trim().toLowerCase(), c])
  );

  // 9. Evidence Verification & Status Reconciliation per Criterion
  const criterionEvaluations: CriterionEvaluation[] = [];

  for (const criterion of criteriaInputs) {
    const rawMatch = rawOutputMap.get(criterion.name.trim().toLowerCase());

    const rawScore = rawMatch ? rawMatch.score : criterion.isMustHave ? 3.0 : 4.0;
    const rawStatus = rawMatch ? rawMatch.status : "INSUFFICIENT";
    const rawExplanation = rawMatch
      ? rawMatch.explanation
      : `No evaluation output received for ${criterion.name}.`;
    const rawQuotes = rawMatch?.quotes || [];
    const missingGaps = rawMatch?.missingGaps || [];

    // Programmatic verification of quoted evidence against raw resume text using SourceMap
    const verifiedQuotes = verifyQuotes(rawQuotes, originalResumeText, sourceMap);

    // Reconcile status based on verified evidence presence
    const { reconciledStatus, reconciledScore } = reconcileCriterionStatus(
      rawStatus,
      rawScore,
      verifiedQuotes
    );

    criterionEvaluations.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      weight: criterion.weight,
      isMustHave: criterion.isMustHave,
      score: reconciledScore,
      status: reconciledStatus,
      explanation: rawExplanation,
      quotes: verifiedQuotes,
      missingGaps,
    });
  }

  // 10. Deterministic Scoring Calculation
  const scores = computeDeterministicScores(criterionEvaluations);

  // 11. Persist Immutable Snapshot & Evaluation in Database Transaction
  const promptVersion = "v1.0";

  const savedEvaluation = await prisma.$transaction(async (tx) => {
    // A. Snapshot scorecard criteria
    const snapshot = await tx.scorecardSnapshot.create({
      data: {
        requisitionId,
        criteria: criteriaInputs as any,
      },
    });

    // B. Create Evaluation record
    // Human Recruiter Safeguard: isReviewedByRecruiter defaults to false,
    // and application status is NEVER automatically set to REJECTED or submitted.
    const evaluation = await tx.evaluation.create({
      data: {
        agencyId,
        requisitionId,
        candidateId,
        applicationId: linkedApplication?.id || null,
        documentId: latestDoc.id,
        scorecardSnapshotId: snapshot.id,
        status: "COMPLETED",
        overallScore: scores.overallScore,
        evidenceCoverage: scores.evidenceCoverage,
        supportedCount: scores.supportedCount,
        partialCount: scores.partialCount,
        insufficientCount: scores.insufficientCount,
        hasMustHaveWarnings: scores.hasMustHaveWarnings,
        mustHaveWarnings: scores.mustHaveWarnings,
        redactedContent: sanitizedResumeText,
        provider: provider.id,
        modelId: provider.modelId,
        promptVersion,
        isReviewedByRecruiter: false,
      },
    });

    // C. Create Criterion Score records
    for (const item of criterionEvaluations) {
      await tx.evaluationCriterionScore.create({
        data: {
          evaluationId: evaluation.id,
          criterionId: item.criterionId,
          criterionName: item.criterionName,
          weight: item.weight,
          isMustHave: item.isMustHave,
          score: item.score,
          status: item.status,
          explanation: item.explanation,
          quotes: item.quotes as any,
          missingGaps: item.missingGaps,
        },
      });
    }

    // D. Audit log entry
    await tx.auditLog.create({
      data: {
        actorId: options.actorId || null,
        organizationId: agencyId,
        action: "AI_SCREENING_COMPLETED",
        entityType: "Evaluation",
        entityId: evaluation.id,
        metadata: {
          requisitionId,
          candidateId,
          overallScore: scores.overallScore,
          hasMustHaveWarnings: scores.hasMustHaveWarnings,
          evidenceCoverage: scores.evidenceCoverage,
        },
      },
    });

    return evaluation;
  }, { maxWait: 15000, timeout: 30000 });

  return {
    evaluationId: savedEvaluation.id,
    overallScore: scores.overallScore,
    evidenceCoverage: scores.evidenceCoverage,
    supportedCount: scores.supportedCount,
    partialCount: scores.partialCount,
    insufficientCount: scores.insufficientCount,
    hasMustHaveWarnings: scores.hasMustHaveWarnings,
    mustHaveWarnings: scores.mustHaveWarnings,
    criterionScores: criterionEvaluations,
    redactedContent: sanitizedResumeText,
    provider: provider.id,
    modelId: provider.modelId,
    promptVersion,
  };
}
