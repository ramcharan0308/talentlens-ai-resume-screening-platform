import {
  ScreeningProvider,
  ProviderEvaluationRequest,
  ProviderEvaluationResponse,
  RawCriterionOutput,
  EvidenceStatus,
} from "./types";

/**
 * Deterministic Mock Screening Provider for automated tests and offline environments.
 * Extracts verbatim sentences from the sanitized resume text to produce real, verifiable quotes.
 */
export class MockScreeningProvider implements ScreeningProvider {
  public id = "mock";
  public modelId = "mock-screening-v1";

  // Optional custom criteria responses for test overrides
  private customResponses?: Map<string, Partial<RawCriterionOutput>>;

  constructor(customResponses?: Record<string, Partial<RawCriterionOutput>>) {
    if (customResponses) {
      this.customResponses = new Map(Object.entries(customResponses));
    }
  }

  async evaluate(request: ProviderEvaluationRequest): Promise<ProviderEvaluationResponse> {
    const text = request.sanitizedResumeText;
    const lowerText = text.toLowerCase();
    const sentences = text
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    const results: RawCriterionOutput[] = [];

    for (const criterion of request.criteria) {
      // Check for test override
      if (this.customResponses?.has(criterion.name)) {
        const override = this.customResponses.get(criterion.name)!;
        results.push({
          criterionName: criterion.name,
          score: override.score ?? 7,
          status: override.status ?? "SUPPORTED",
          explanation: override.explanation ?? `Evaluated against ${criterion.name}.`,
          quotes: override.quotes ?? [],
          missingGaps: override.missingGaps ?? [],
        });
        continue;
      }

      // Keyword matching: search criterion name tokens in resume
      const nameTokens = criterion.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const matchedSentences: string[] = [];
      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        const hasMatch = nameTokens.some((tok) => lowerSentence.includes(tok));
        if (hasMatch) {
          matchedSentences.push(sentence);
          if (matchedSentences.length >= 2) break;
        }
      }

      let score: number;
      let status: EvidenceStatus;
      let quotes: string[] = [];
      let missingGaps: string[] = [];

      if (matchedSentences.length > 0) {
        score = 8.5;
        status = "SUPPORTED";
        quotes = matchedSentences;
      } else {
        // Fallback: check if any general skill appears
        score = criterion.isMustHave ? 3.0 : 4.0;
        status = "INSUFFICIENT";
        missingGaps = [`No explicit demonstration of ${criterion.name} found in resume text.`];
      }

      results.push({
        criterionName: criterion.name,
        score,
        status,
        explanation:
          status === "SUPPORTED"
            ? `Demonstrated evidence found in resume regarding ${criterion.name}.`
            : `Insufficient evidence for ${criterion.name}.`,
        quotes,
        missingGaps,
      });
    }

    return {
      criteria: results,
      rawResponse: JSON.stringify({ criteria: results }),
      modelId: this.modelId,
    };
  }
}

