import {
  CriterionInput,
  CriterionEvaluation,
  EvidenceStatus,
  VerifiedQuote,
} from "./types";

export interface ScoreCalculationResult {
  overallScore: number; // 0 - 100 scale, rounded to 1 decimal place
  evidenceCoverage: number; // 0 - 100 scale, rounded to 1 decimal place
  supportedCount: number;
  partialCount: number;
  insufficientCount: number;
  hasMustHaveWarnings: boolean;
  mustHaveWarnings: string[];
}

/**
 * Validates that criteria weights sum to 100%.
 */
export function validateCriteriaWeights(criteria: CriterionInput[]): {
  isValid: boolean;
  totalWeight: number;
  error?: string;
} {
  if (!criteria || criteria.length === 0) {
    return { isValid: false, totalWeight: 0, error: "Scorecard contains no criteria." };
  }

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return {
      isValid: false,
      totalWeight,
      error: `Criteria weights sum to ${totalWeight}%, but must equal exactly 100%.`,
    };
  }

  return { isValid: true, totalWeight };
}

/**
 * Computes deterministic weighted score, coverage, and must-have warnings.
 *
 * Scoring Formula:
 * - Each criterion score is on a 1-10 scale.
 * - Normalized overall score on 0-100 scale = SUM((criterion_score / 10) * weight)
 *   Equivalent to: SUM(criterion_score * weight) / 10
 * - Coverage percentage: weighted evidence coverage where SUPPORTED = 1.0, PARTIAL = 0.5, INSUFFICIENT = 0.0
 * - Must-have warnings: any must-have criterion with score < 5 or status INSUFFICIENT is flagged
 *   prominently WITHOUT rejecting or hiding the candidate.
 */
export function computeDeterministicScores(
  evaluations: CriterionEvaluation[]
): ScoreCalculationResult {
  if (!evaluations || evaluations.length === 0) {
    return {
      overallScore: 0,
      evidenceCoverage: 0,
      supportedCount: 0,
      partialCount: 0,
      insufficientCount: 0,
      hasMustHaveWarnings: false,
      mustHaveWarnings: [],
    };
  }

  let totalWeight = 0;
  let weightedScoreSum = 0;
  let weightedCoverageSum = 0;
  let supportedCount = 0;
  let partialCount = 0;
  let insufficientCount = 0;
  const mustHaveWarnings: string[] = [];

  for (const item of evaluations) {
    const weight = item.weight || 0;
    totalWeight += weight;

    // Bound rubric score between 1 and 10 (or 0 and 10)
    const score = Math.max(0, Math.min(10, item.score || 0));

    // Weighted score component (0 to 100 scale)
    weightedScoreSum += (score / 10) * weight;

    // Evidence status tracking
    if (item.status === "SUPPORTED") {
      supportedCount++;
      weightedCoverageSum += 1.0 * weight;
    } else if (item.status === "PARTIAL") {
      partialCount++;
      weightedCoverageSum += 0.5 * weight;
    } else {
      insufficientCount++;
      weightedCoverageSum += 0.0 * weight;
    }

    // Must-have criterion check: flag if score < 5 or status is INSUFFICIENT
    if (item.isMustHave) {
      if (item.status === "INSUFFICIENT" || score < 5) {
        mustHaveWarnings.push(item.criterionName);
      }
    }
  }

  // If weights don't sum to 100, normalize against totalWeight to avoid division by zero
  const weightDenominator = totalWeight > 0 ? totalWeight : 1;
  const normalizedOverall = (weightedScoreSum / weightDenominator) * 100;
  const normalizedCoverage = (weightedCoverageSum / weightDenominator) * 100;

  const roundedOverall = Math.round(normalizedOverall * 10) / 10;
  const roundedCoverage = Math.round(normalizedCoverage * 10) / 10;

  return {
    overallScore: Math.min(100, Math.max(0, roundedOverall)),
    evidenceCoverage: Math.min(100, Math.max(0, roundedCoverage)),
    supportedCount,
    partialCount,
    insufficientCount,
    hasMustHaveWarnings: mustHaveWarnings.length > 0,
    mustHaveWarnings,
  };
}

/**
 * Reconciles evidence status based on verified quotations.
 * If model claimed SUPPORTED but has 0 verified quotes, downgrades to PARTIAL or INSUFFICIENT.
 */
export function reconcileCriterionStatus(
  status: EvidenceStatus,
  score: number,
  verifiedQuotes: VerifiedQuote[]
): {
  reconciledStatus: EvidenceStatus;
  reconciledScore: number;
} {
  const verifiedCount = verifiedQuotes.filter((q) => q.verified).length;

  if (verifiedCount === 0) {
    // Zero verified evidence from resume: cannot be SUPPORTED
    if (status === "SUPPORTED") {
      return {
        reconciledStatus: "PARTIAL",
        reconciledScore: Math.min(score, 6),
      };
    }
  }

  return {
    reconciledStatus: status,
    reconciledScore: score,
  };
}

