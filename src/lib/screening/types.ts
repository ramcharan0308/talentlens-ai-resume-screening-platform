export type EvidenceStatus = "SUPPORTED" | "PARTIAL" | "INSUFFICIENT";
export type EvaluationStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface CriterionInput {
  id: string;
  name: string;
  description?: string | null;
  weight: number; // 0 - 100 percentage
  isMustHave: boolean;
  minScore?: number; // default 1
  maxScore?: number; // default 10
  guidelines?: string | null;
}

export interface VerifiedQuote {
  quote: string;
  startOffset: number;
  endOffset: number;
  verified: boolean;
  isAmbiguous?: boolean;
  originalSourceSnippet?: string;
}

export interface CriterionEvaluation {
  criterionId: string;
  criterionName: string;
  weight: number;
  isMustHave: boolean;
  score: number; // 1-10 scale
  status: EvidenceStatus;
  explanation: string;
  quotes: VerifiedQuote[];
  missingGaps: string[];
}

export interface EvaluationResult {
  overallScore: number; // 0 - 100 deterministic weighted score
  evidenceCoverage: number; // 0 - 100 percentage of criteria with SUPPORTED/PARTIAL status
  supportedCount: number;
  partialCount: number;
  insufficientCount: number;
  hasMustHaveWarnings: boolean;
  mustHaveWarnings: string[];
  criterionScores: CriterionEvaluation[];
  redactedContent: string;
  provider: string;
  modelId: string;
  promptVersion: string;
}

export interface RawCriterionOutput {
  criterionName: string;
  score: number; // 1-10
  status: EvidenceStatus;
  explanation: string;
  quotes: string[];
  missingGaps?: string[];
}

export interface ProviderEvaluationRequest {
  sanitizedResumeText: string;
  jobDescription: string;
  roleTitle?: string;
  criteria: CriterionInput[];
}

export interface ProviderEvaluationResponse {
  criteria: RawCriterionOutput[];
  rawResponse?: string;
  modelId?: string;
}

export interface ScreeningProvider {
  id: string;
  modelId: string;
  evaluate(request: ProviderEvaluationRequest): Promise<ProviderEvaluationResponse>;
}
